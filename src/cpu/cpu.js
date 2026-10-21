// CDC 6600 central processor (and the 6400, Cyber 70/170 variants).
//
// Registers: X0-X7 (60 bits, BigInt), A0-A7 (18 bits), B0-B7 (18 bits, B0 = 0),
// P (18 bits). RA/FL bound the program's memory, RAE/FLE bound its ECS.
// Setting A1-A5 reads memory into X1-X5; setting A6-A7 stores X6-X7.
// Instructions are 15 or 30 bits, 4 parcels of 15 bits per word;
// a 30-bit instruction cannot start in parcel 3.

import {
  M60, M48, SIGN60, M18, SIGN18, add18, sub18, add60, sub60, neg60, sext18to60,
  rotl60, sra60, mask60, popcount60, isZero60,
} from '../common/word.js';
import { floatAdd, floatMultiply, floatDivide, normalize, unpack, pack, classify } from './float.js';
import { Scoreboard } from './scoreboard.js';

// Exit conditions (bits 50-48 of the word stored at RA on an error exit).
export const EC_ADDRESS = 0o1;
export const EC_OPERAND = 0o2;
export const EC_INDEFINITE = 0o4;
// Exit mode selection (EM field of the exchange package, 24 bits).
export const EM_ADDRESS = 0o010000;
export const EM_OPERAND = 0o020000;
export const EM_INDEFINITE = 0o040000;
export const EM_STACK_PURGE = 0o200000;

/** Machine model characteristics. */
export const MODELS = {
  '6400': { name: 'CDC 6400', stackWords: 0, cejMej: false, cmu: false, float175: false, scoreboard: false },
  '6500': { name: 'CDC 6500', stackWords: 0, cejMej: false, cmu: false, float175: false, scoreboard: false },
  '6600': { name: 'CDC 6600', wrapParcel3: true, stackWords: 8, cejMej: false, cmu: false, float175: false, scoreboard: true },
  '6600CEJ': { name: 'CDC 6600 (CEJ/MEJ)', wrapParcel3: true, stackWords: 8, cejMej: true, cmu: false, float175: false, scoreboard: true },
  'cyber73': { name: 'CYBER 73', stackWords: 0, cejMej: true, cmu: true, float175: false, scoreboard: false },
  'cyber173': { name: 'CYBER 173', stackWords: 0, cejMej: true, cmu: true, float175: false, scoreboard: false },
  'cyber175': { name: 'CYBER 175', stackWords: 12, cejMej: true, cmu: false, float175: true, scoreboard: true },
};

// Instruction length (15 or 30), indexed by fm; 01 depends on i.
const LONG = new Uint8Array(64);
for (const fm of [0o02, 0o03, 0o04, 0o05, 0o06, 0o07, 0o50, 0o51, 0o52, 0o60, 0o61, 0o62, 0o70, 0o71, 0o72]) LONG[fm] = 1;
const LONG01 = [1, 1, 1, 1, 0, 0, 0, 1];

/** Length in bits of an instruction, from its first parcel. */
export function instructionLength(parcel, cmu = false) {
  const fm = parcel >> 9;
  if (fm === 0o01) return LONG01[(parcel >> 6) & 7] ? 30 : 15;
  if (cmu && fm === 0o46 && ((parcel >> 6) & 7) >= 4) return 30; // CMU (full word)
  return LONG[fm] ? 30 : 15;
}

export class Cpu {
  /**
   * @param machine object providing cm (BigUint64Array), cmSize, ecs, ecsSize
   * @param model key into MODELS
   */
  constructor(machine, model = '6600') {
    this.m = machine;
    this.setModel(model);
    this.X = new Array(8).fill(0n);
    this.A = [0, 0, 0, 0, 0, 0, 0, 0];
    this.B = [0, 0, 0, 0, 0, 0, 0, 0];
    this.reset();
  }

  setModel(model) {
    const f = MODELS[model];
    if (!f) throw new Error(`unknown model: ${model}`);
    this.model = model;
    this.features = { ...f };
  }

  reset() {
    this.X.fill(0n);
    this.A.fill(0);
    this.B.fill(0);
    this.P = 0;
    this.RA = 0;
    this.FL = 0;
    this.EM = 0;
    this.RAE = 0;
    this.FLE = 0;
    this.MA = 0;
    this.spare = 0;
    this.exitCondition = 0;
    this.stopped = true;
    this.monitorMode = false;
    this.word = 0n;          // current instruction word
    this.parcels = [0, 0, 0, 0];
    this.parcel = 0;         // next parcel to execute
    this.wordValid = false;  // the current word has been read
    this.pendingExchange = null; // { address, changeMode, pp }
    this.errorExitPending = false;
    this.lastError = null;   // description of the last error exit
    this.instructions = 0;   // count of instructions executed
    this.cycles = 0;         // minor cycles (100 ns) elapsed
    this.stack = [];         // instruction stack: [{ addr, word }]
    this.stackHits = 0;
    this.stackMisses = 0;
    this.scoreboard = new Scoreboard();
    this.lastInstr = null;
  }

  // ------------------------------------------------------------------- memory

  /** Absolute address = RA + relative address (18-bit adder). */
  absolute(addr) {
    return add18(this.RA, addr) % this.m.cmSize;
  }

  /** Relative memory read. Returns null if an error exit was taken. */
  readRel(addr) {
    addr &= M18;
    if (addr >= this.FL) {
      this.exitCondition |= EC_ADDRESS;
      if (this.EM & EM_ADDRESS) {
        this.errorExit(`read out of range ${addr.toString(8)}B (FL=${this.FL.toString(8)}B)`);
        return null;
      }
      return 0n;
    }
    return this.m.readCM(this.absolute(addr));
  }

  /** Relative memory write. Returns false if an error exit was taken. */
  writeRel(addr, value) {
    addr &= M18;
    if (addr >= this.FL) {
      this.exitCondition |= EC_ADDRESS;
      if (this.EM & EM_ADDRESS) {
        this.errorExit(`write out of range ${addr.toString(8)}B (FL=${this.FL.toString(8)}B)`);
        return false;
      }
      return true;
    }
    this.m.writeCM(this.absolute(addr), value & M60);
    return true;
  }

  // -------------------------------------------------------- instruction fetch

  /** Reads the instruction word at P (through the instruction stack). */
  fetch() {
    const p = this.P;
    if (p >= this.FL) {
      // For instruction fetch the exit mode is always selected.
      this.exitCondition |= EC_ADDRESS;
      this.stopped = true;
      if (this.EM & EM_ADDRESS) {
        this.m.writeCM(this.RA % this.m.cmSize,
          (BigInt(this.exitCondition) << 48n) | (BigInt(p) << 30n));
      }
      this.lastError = `instruction fetch out of range P=${p.toString(8)}B`;
      this.P = 0;
      this.setErrorExitPending();
      this.wordValid = false;
      return false;
    }
    const abs = this.absolute(p);
    let w;
    const n = this.features.stackWords;
    if (n) {
      const hit = this.stack.find((e) => e.addr === abs);
      if (hit) {
        w = hit.word;
        this.stackHits++;
      } else {
        w = this.m.readCM(abs);
        this.stack.push({ addr: abs, word: w });
        if (this.stack.length > n) this.stack.shift();
        this.stackMisses++;
      }
    } else {
      w = this.m.readCM(abs);
    }
    this.word = w;
    const hi = Number(w >> 30n);
    const lo = Number(w & 0x3fffffffn);
    this.parcels[0] = hi >>> 15;
    this.parcels[1] = hi & 0x7fff;
    this.parcels[2] = lo >>> 15;
    this.parcels[3] = lo & 0x7fff;
    this.parcel = 0;
    this.wordValid = true;
    return true;
  }

  /** Voids the instruction stack. */
  voidStack() {
    this.stack.length = 0;
  }

  /** Branch: voids the stack unless the target is in it ("in-stack" branch). */
  branchTo(addr) {
    addr &= M18;
    if (this.features.stackWords) {
      const abs = this.absolute(addr);
      const inStack = this.stack.some((e) => e.addr === abs);
      if (!inStack || (this.EM & EM_STACK_PURGE)) this.voidStack();
      this.branchInStack = inStack;
    }
    this.P = addr;
    this.wordValid = false;
    this.parcel = 0;
  }

  // -------------------------------------------------------------- error exits

  setErrorExitPending() {
    if (this.features.cejMej && !this.monitorMode) this.errorExitPending = true;
  }

  /**
   * Error exit: stop, store the exit condition and P at RA,
   * then (CEJ/MEJ) exchange to MA.
   */
  errorExit(reason) {
    this.stopped = true;
    this.lastError = reason || 'error exit';
    const word = (BigInt(this.exitCondition & 0o7777) << 48n) | (BigInt((this.P + 1) & M18) << 30n);
    if (this.RA < this.m.cmSize) this.m.writeCM(this.RA, word);
    this.P = 0;
    this.wordValid = false;
    this.setErrorExitPending();
  }

  /** Tests a floating-point operand and sets the exit condition. */
  floatCheck(v) {
    const c = classify(v);
    if (c === 'infinite') { this.exitCondition |= EC_OPERAND; this.floatException = true; }
    else if (c === 'indefinite') { this.exitCondition |= EC_INDEFINITE; this.floatException = true; }
  }

  floatExceptionHandler() {
    if (this.floatException) {
      this.floatException = false;
      if (this.EM & (this.exitCondition << 12)) {
        this.errorExit(this.exitCondition & EC_INDEFINITE ? 'indefinite operand' : 'out-of-range operand (infinite)');
      }
    }
  }

  // ------------------------------------------------------------ exchange jump

  /**
   * Exchanges the registers with the 16-word exchange package at `address`
   * (absolute address).
   */
  exchange(address, changeMode) {
    const m = this.m;
    address &= M18;
    if (address + 0o20 > m.cmSize) return; // package outside memory: ignored
    const old = this.packageWords();
    const w = [];
    for (let i = 0; i < 16; i++) w.push(m.readCM(address + i));
    const f18 = (v, s) => Number((v >> BigInt(s)) & 0o777777n);
    this.P = f18(w[0], 36);
    this.A[0] = f18(w[0], 18);
    this.B[0] = 0;
    this.RA = Number((w[1] >> 36n) & 0o7777777n);
    this.FL = Number((w[2] >> 36n) & 0o7777777n);
    this.EM = Number((w[3] >> 36n) & 0o77777777n);
    this.RAE = Number((w[4] >> 36n) & 0o7777777n);
    this.FLE = Number((w[5] >> 36n) & 0o77777777n);
    this.MA = f18(w[6], 36);
    this.spare = Number((w[7] >> 36n) & 0o77777777n);
    for (let i = 1; i < 8; i++) {
      this.A[i] = f18(w[i], 18);
      this.B[i] = f18(w[i], 0);
    }
    for (let i = 0; i < 8; i++) this.X[i] = w[8 + i] & M60;
    for (let i = 0; i < 16; i++) m.writeCM(address + i, old[i]);
    this.exitCondition = 0;
    this.voidStack();
    this.stopped = false;
    if (changeMode) this.monitorMode = !this.monitorMode;
    this.wordValid = false;
    this.parcel = 0;
    this.cycles += 26;
    this.scoreboard.t += 26;
    if (m.onExchange) m.onExchange(address, old);
  }

  /** Exchange package for the current state (16 words). */
  packageWords() {
    const b = (v, s) => BigInt(v) << BigInt(s);
    const w = new Array(16);
    w[0] = b(this.P & M18, 36) | b(this.A[0] & M18, 18);
    w[1] = b(this.RA & 0o7777777, 36) | b(this.A[1], 18) | b(this.B[1], 0);
    w[2] = b(this.FL & 0o7777777, 36) | b(this.A[2], 18) | b(this.B[2], 0);
    w[3] = b(this.EM & 0o77777777, 36) | b(this.A[3], 18) | b(this.B[3], 0);
    w[4] = b(this.RAE & 0o7777777, 36) | b(this.A[4], 18) | b(this.B[4], 0);
    w[5] = b(this.FLE & 0o77777777, 36) | b(this.A[5], 18) | b(this.B[5], 0);
    w[6] = b(this.MA & M18, 36) | b(this.A[6], 18) | b(this.B[6], 0);
    w[7] = b(this.spare & 0o77777777, 36) | b(this.A[7], 18) | b(this.B[7], 0);
    for (let i = 0; i < 8; i++) w[8 + i] = this.X[i] & M60;
    for (let i = 0; i < 16; i++) w[i] &= M60;
    return w;
  }

  /** Exchange request from a PP (EXN/MXN/MAN), honored at a word boundary. */
  requestExchange(address, changeMode, pp) {
    if (this.pendingExchange) return false;
    this.pendingExchange = { address, changeMode, pp };
    return true;
  }

  // ---------------------------------------------------------------- execution

  /** Executes one instruction. Returns false if the CPU is stopped. */
  step() {
    if (this.pendingExchange && (this.stopped || this.parcel === 0)) {
      const { address, changeMode } = this.pendingExchange;
      if (!changeMode || !this.monitorMode || !this.features.cejMej) {
        this.exchange(address, changeMode && this.features.cejMej);
      }
      this.pendingExchange = null;
    }
    if (this.stopped) return false;

    if (!this.wordValid) {
      if (!this.fetch()) return this.afterInstruction();
    }

    const p0 = this.parcels[this.parcel];
    const fm = p0 >> 9;
    const i = (p0 >> 6) & 7;
    const j = (p0 >> 3) & 7;
    const k = p0 & 7;
    let K = 0;
    const here = this.P;
    const hereParcel = this.parcel;
    const long = instructionLength(p0, this.features.cmu) === 30;
    if (long) {
      if (this.parcel === 3) {
        if (!this.features.wrapParcel3) {
          this.errorExit('30-bit instruction in parcel 3');
          return this.afterInstruction();
        }
        // 6600: the second parcel is taken from parcel 0 of the same word.
        K = ((p0 & 7) << 15) | this.parcels[0];
        this.parcel = 4;
      } else {
        K = ((p0 & 7) << 15) | this.parcels[this.parcel + 1];
        this.parcel += 2;
      }
    } else {
      this.parcel += 1;
    }
    this.lastInstr = { P: here, parcel: hereParcel, fm, i, j, k, K, long };
    this.instructions++;
    this.branchInStack = undefined;

    this.execute(fm, i, j, k, K, hereParcel);
    this.B[0] = 0;

    if (this.features.scoreboard) {
      this.cycles = this.scoreboard.issue(this, fm, i, j, k, long);
    } else {
      this.cycles += long ? 2 : 1;
    }

    return this.afterInstruction();
  }

  afterInstruction() {
    if (this.stopped) {
      if (this.wordValid && this.parcel >= 4) {
        this.P = (this.P + 1) & M18;
        this.wordValid = false;
      }
      if (this.errorExitPending) {
        this.errorExitPending = false;
        this.exchange(this.MA, true);
      }
      return !this.stopped;
    }
    if (this.wordValid && this.parcel >= 4) {
      this.P = (this.P + 1) & M18;
      this.wordValid = false;
      this.parcel = 0;
    }
    if (this.errorExitPending) {
      this.errorExitPending = false;
      this.exchange(this.MA, true);
    }
    return true;
  }

  /** Advances to the next word (normal exit of the ECS/CMU instructions). */
  nextWord() {
    this.P = (this.P + 1) & M18;
    this.wordValid = false;
    this.parcel = 0;
  }

  /** Sets A[i] and applies the read (1-5) / write (6-7) semantics. */
  setA(i, value) {
    this.A[i] = value & M18;
    if (i === 0) return;
    if (i <= 5) {
      const v = this.readRel(this.A[i]);
      if (v !== null) this.X[i] = v;
    } else {
      if (this.EM & EM_STACK_PURGE) this.voidStack();
      this.writeRel(this.A[i], this.X[i]);
    }
  }

  execute(fm, i, j, k, K, parcelAtStart) {
    const X = this.X, A = this.A, B = this.B;
    switch (fm) {
      case 0o00: // PS - program stop (or error exit with CEJ/MEJ)
        if (!this.features.cejMej || this.monitorMode) {
          this.stopped = true;
          this.lastError = null;
          this.stopReason = 'PS';
        } else {
          this.errorExit('PS in program mode');
        }
        return;

      case 0o01:
        switch (i) {
          case 0: { // RJ K
            const w = (0o0400n << 48n) | (BigInt((this.P + 1) & M18) << 30n);
            if (!this.writeRel(K, w)) return;
            this.voidStack();
            this.P = K;
            this.parcel = 4; // resume at K+1
            return;
          }
          case 1: // RE Bj+K
            this.ecsTransfer(false, j, K, parcelAtStart);
            this.voidStack();
            return;
          case 2: // WE Bj+K
            this.ecsTransfer(true, j, K, parcelAtStart);
            return;
          case 3: { // XJ Bj+K
            if (!this.features.cejMej || parcelAtStart !== 0) {
              this.errorExit('illegal XJ (no CEJ/MEJ, or instruction not in parcel 0)');
              return;
            }
            this.P = (this.P + 1) & M18;
            const addr = this.monitorMode ? add18(B[j], K) : this.MA;
            this.exchange(addr, true);
            return;
          }
          default:
            this.errorExit(`instruction 01${i} illegal on this model`);
            return;
        }

      case 0o02: // JP Bi+K
        this.voidStack();
        this.branchTo(add18(B[i], K));
        return;

      case 0o03: {
        const x = X[j];
        let jump = false;
        const e = Number(x >> 48n);
        switch (i) {
          case 0: jump = isZero60(x); break;                       // ZR
          case 1: jump = !isZero60(x); break;                      // NZ
          case 2: jump = (x & SIGN60) === 0n; break;               // PL
          case 3: jump = (x & SIGN60) !== 0n; break;               // NG
          case 4: jump = e !== 0o3777 && e !== 0o4000; break;      // IR
          case 5: jump = e === 0o3777 || e === 0o4000; break;      // OR
          case 6: jump = e !== 0o1777 && e !== 0o6000; break;      // DF
          case 7: jump = e === 0o1777 || e === 0o6000; break;      // ID
        }
        this.lastBranchTaken = jump;
        if (jump) this.branchTo(K);
        return;
      }

      case 0o04: // EQ Bi,Bj,K
        this.lastBranchTaken = B[i] === B[j];
        if (this.lastBranchTaken) this.branchTo(K);
        return;
      case 0o05: // NE
        this.lastBranchTaken = B[i] !== B[j];
        if (this.lastBranchTaken) this.branchTo(K);
        return;
      case 0o06: // GE
        this.lastBranchTaken = compareB(B[i], B[j]) >= 0;
        if (this.lastBranchTaken) this.branchTo(K);
        return;
      case 0o07: // LT
        this.lastBranchTaken = compareB(B[i], B[j]) < 0;
        if (this.lastBranchTaken) this.branchTo(K);
        return;

      case 0o10: X[i] = X[j]; return;                                 // BXi Xj
      case 0o11: X[i] = X[j] & X[k]; return;                          // BXi Xj*Xk
      case 0o12: X[i] = X[j] | X[k]; return;                          // BXi Xj+Xk
      case 0o13: X[i] = X[j] ^ X[k]; return;                          // BXi Xj-Xk
      case 0o14: X[i] = ~X[k] & M60; return;                          // BXi -Xk
      case 0o15: X[i] = ~X[k] & X[j] & M60; return;                   // BXi -Xk*Xj
      case 0o16: X[i] = (~X[k] | X[j]) & M60; return;                 // BXi -Xk+Xj
      case 0o17: X[i] = (~X[k] ^ X[j]) & M60; return;                 // BXi -Xk-Xj

      case 0o20: X[i] = rotl60(X[i], (j << 3) | k); return;           // LXi jk
      case 0o21: X[i] = sra60(X[i], (j << 3) | k); return;            // AXi jk
      case 0o22: X[i] = shiftByB(X[k], B[j], true); return;           // LXi Bj,Xk
      case 0o23: X[i] = shiftByB(X[k], B[j], false); return;          // AXi Bj,Xk
      case 0o24:                                                      // NXi Bj,Xk
      case 0o25: {                                                    // ZXi Bj,Xk
        this.floatCheck(X[k]);
        const r = normalize(X[k], fm === 0o25);
        X[i] = r.value;
        B[j] = r.shift;
        this.floatExceptionHandler();
        return;
      }
      case 0o26: { // UXi Bj,Xk
        const r = unpack(X[k]);
        X[i] = r.coeff;
        if (j) B[j] = r.exp;
        return;
      }
      case 0o27: // PXi Bj,Xk
        X[i] = pack(X[k], j ? B[j] : 0);
        return;

      case 0o30: case 0o31: case 0o32: case 0o33: case 0o34: case 0o35: {
        const xj = X[j], xk = X[k];
        this.floatCheck(xj);
        this.floatCheck(xk);
        const sub = fm & 1;
        const round = fm >= 0o34;
        const dbl = fm === 0o32 || fm === 0o33;
        X[i] = floatAdd(xj, sub ? neg60(xk) : xk, round, dbl);
        this.floatCheck(X[i]);
        this.floatExceptionHandler();
        return;
      }
      case 0o36: X[i] = add60(X[j], X[k]); return;                    // IXi Xj+Xk
      case 0o37: X[i] = sub60(X[j], X[k]); return;                    // IXi Xj-Xk

      case 0o40: case 0o41: case 0o42: {
        const xj = X[j], xk = X[k];
        this.floatCheck(xj);
        this.floatCheck(xk);
        X[i] = floatMultiply(xj, xk, fm === 0o41, fm === 0o42);
        this.floatCheck(X[i]);
        this.floatExceptionHandler();
        return;
      }
      case 0o43: X[i] = mask60((j << 3) | k); return;                 // MXi jk
      case 0o44: case 0o45: {
        const xj = X[j], xk = X[k];
        this.floatCheck(xj);
        this.floatCheck(xk);
        X[i] = floatDivide(xj, xk, fm === 0o45);
        this.floatCheck(X[i]);
        this.floatExceptionHandler();
        return;
      }
      case 0o46: // NO (pass) / CMU
        if (i >= 4) this.cmu(i, j, K, parcelAtStart);
        return;
      case 0o47: X[i] = BigInt(popcount60(X[k])); return;             // CXi Xk

      case 0o50: this.setA(i, add18(A[j], K)); return;                 // SAi Aj+K
      case 0o51: this.setA(i, add18(B[j], K)); return;                 // SAi Bj+K
      case 0o52: this.setA(i, add18(Number(X[j] & 0o777777n), K)); return;   // SAi Xj+K
      case 0o53: this.setA(i, add18(Number(X[j] & 0o777777n), B[k])); return; // SAi Xj+Bk
      case 0o54: this.setA(i, add18(A[j], B[k])); return;              // SAi Aj+Bk
      case 0o55: this.setA(i, sub18(A[j], B[k])); return;              // SAi Aj-Bk
      case 0o56: this.setA(i, add18(B[j], B[k])); return;              // SAi Bj+Bk
      case 0o57: this.setA(i, sub18(B[j], B[k])); return;              // SAi Bj-Bk

      case 0o60: B[i] = add18(A[j], K); return;
      case 0o61: B[i] = add18(B[j], K); return;
      case 0o62: B[i] = add18(Number(X[j] & 0o777777n), K); return;
      case 0o63: B[i] = add18(Number(X[j] & 0o777777n), B[k]); return;
      case 0o64: B[i] = add18(A[j], B[k]); return;
      case 0o65: B[i] = sub18(A[j], B[k]); return;
      case 0o66: B[i] = add18(B[j], B[k]); return;
      case 0o67: B[i] = sub18(B[j], B[k]); return;

      case 0o70: X[i] = sext18to60(add18(A[j], K)); return;
      case 0o71: X[i] = sext18to60(add18(B[j], K)); return;
      case 0o72: X[i] = sext18to60(add18(Number(X[j] & 0o777777n), K)); return;
      case 0o73: X[i] = sext18to60(add18(Number(X[j] & 0o777777n), B[k])); return;
      case 0o74: X[i] = sext18to60(add18(A[j], B[k])); return;
      case 0o75: X[i] = sext18to60(sub18(A[j], B[k])); return;
      case 0o76: X[i] = sext18to60(add18(B[j], B[k])); return;
      case 0o77: X[i] = sext18to60(sub18(B[j], B[k])); return;
    }
  }

  // ------------------------------------------------------------- ECS (RE/WE)

  /**
   * Block transfer with extended core storage (ECS).
   * Word count = Bj+K, relative ECS address = X0 (bits 23-0), CM address = A0.
   * Normal exit: next word; error exit: lower parcels of the word.
   */
  ecsTransfer(write, j, K, parcelAtStart) {
    const m = this.m;
    if (!m.ecsSize || parcelAtStart !== 0) {
      this.errorExit('RE/WE: no ECS, or instruction not in parcel 0');
      return;
    }
    let count = add18(this.B[j], K);
    if (count === M18) count = 0;
    const ecsRel = Number(this.X[0] & 0o77777777n);
    const cmRel = this.A[0];
    if ((count & SIGN18) || this.FL < cmRel + count || this.FLE < ecsRel + count) {
      this.exitCondition |= EC_ADDRESS;
      if (this.EM & EM_ADDRESS) this.errorExit('RE/WE out of range');
      else this.nextWord();
      return;
    }
    let ecsAbs = this.RAE + ecsRel;
    let cmAbs = this.absolute(cmRel);
    let failed = false;
    for (let n = 0; n < count; n++) {
      if (ecsAbs >= m.ecsSize) {
        failed = true;
        if (write) break;
        m.writeCM(cmAbs, 0n);
      } else if (write) {
        m.ecs[ecsAbs++] = m.readCM(cmAbs);
      } else {
        m.writeCM(cmAbs, m.ecs[ecsAbs++]);
      }
      cmAbs = (cmAbs + 1) % m.cmSize;
    }
    this.cycles += 10 + count; // ~10 words/µs
    this.scoreboard.t += 10 + count;
    if (!failed) this.nextWord();
    // otherwise: continue with the lower 30 bits (error handling)
  }

  // ------------------------------------------------------------ CMU (Cyber 70)

  cmu(i, j, K, parcelAtStart) {
    if (!this.features.cmu) {
      this.errorExit('no CMU instructions on this model');
      return;
    }
    if (parcelAtStart !== 0) {
      this.errorExit('CMU instruction not in parcel 0');
      return;
    }
    const w = this.word;
    let desc;
    let maxLenBits = 7;
    if (i === 4) { // IM: indirect descriptor at Bj+K
      const d = this.readRel(add18(this.B[j], Number((w >> 30n) & 0o777777n)));
      if (d === null) return;
      desc = d;
      maxLenBits = 13;
    } else {
      desc = w;
    }
    let k1 = Number((desc >> 30n) & 0o777777n);
    let k2 = Number(desc & 0o777777n);
    let c1 = Number((desc >> 22n) & 0xfn);
    let c2 = Number((desc >> 18n) & 0xfn);
    const hiMask = maxLenBits === 13 ? 0o777 : 0o7;
    let ll = Number((desc >> 26n) & 0xfn) | (Number((desc >> 44n) & BigInt(hiMask << 4)));
    const collTable = this.A[0];
    let bad = c1 > 9 || c2 > 9;
    if (i === 6 && (collTable >= this.FL)) bad = true;
    if (bad) {
      this.exitCondition |= EC_ADDRESS;
      if (this.EM & EM_ADDRESS) { this.errorExit('CMU: invalid character position'); return; }
      ll = 0;
    }
    const getByte = (addr, pos) => {
      const v = this.readRel(addr);
      if (v === null) return null;
      return Number((v >> BigInt((9 - pos) * 6)) & 0o77n);
    };
    const putByte = (addr, pos, byte) => {
      const v = this.readRel(addr);
      if (v === null) return false;
      const sh = BigInt((9 - pos) * 6);
      return this.writeRel(addr, (v & ~(0o77n << sh)) | (BigInt(byte) << sh));
    };
    let result = 0n;
    while (ll-- > 0) {
      if (i === 4 || i === 5) {
        const b = getByte(k1, c1);
        if (b === null || !putByte(k2, c2, b)) { if (this.stopped) return; break; }
      } else {
        let b1 = getByte(k1, c1);
        let b2 = getByte(k2, c2);
        if (b1 === null || b2 === null) { if (this.stopped) return; break; }
        if (b1 !== b2) {
          if (i === 6) {
            b1 = getByte(collTable + (b1 >> 3), b1 & 7);
            b2 = getByte(collTable + (b2 >> 3), b2 & 7);
            if (b1 === null || b2 === null) { if (this.stopped) return; break; }
          }
          if (b1 !== b2) {
            result = BigInt(ll + 1);
            if (b1 < b2) result = ~result & M60;
            break;
          }
        }
      }
      if (++c1 > 9) { c1 = 0; k1++; }
      if (++c2 > 9) { c2 = 0; k2++; }
    }
    this.X[0] = result;
    this.nextWord();
  }
}

/** Compares two 18-bit ones' complement values (GE/LT). */
function compareB(a, b) {
  const sa = a & SIGN18, sb = b & SIGN18;
  if (sa !== sb) return sa ? -1 : 1;
  let r = a - b;
  if (r < 0 && (r & M18) !== 0) r -= 1;
  r &= M18;
  if (r === 0) return 0;
  return r & SIGN18 ? -1 : 1;
}

/** Shift by the value of Bj (instructions 22 and 23). */
function shiftByB(x, b, left) {
  b &= M18;
  if (left) {
    if (!(b & SIGN18)) return rotl60(x, b & 0o77);
    const n = ~b & 0o3777;
    return n & ~0o77 ? 0n : sra60(x, n);
  }
  if (!(b & SIGN18)) {
    const n = b & 0o3777;
    return n & ~0o77 ? 0n : sra60(x, n);
  }
  return rotl60(x, ~b & 0o77);
}
