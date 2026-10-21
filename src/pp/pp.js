// CDC 6000 peripheral processor (PP): memory of 4096 12-bit words,
// 18-bit accumulator A, 12-bit program counter P.
// Format: F (6 bits) d (6 bits) [m (12 bits)]; the block instructions
// (CRM, CWM, IAM, OAM) save P in location 0 during the transfer.

import { M18, SIGN18, M12, add18, sub18 } from '../common/word.js';

/** Approximate 6600 PP instruction times, in major cycles (µs). */
export const PP_TIMES = new Uint8Array(64).fill(1);
for (const [op, t] of [
  [0o01, 2], [0o02, 3], [0o20, 2], [0o21, 2], [0o22, 2], [0o23, 2], [0o26, 2],
  [0o30, 2], [0o31, 2], [0o32, 2], [0o33, 2], [0o34, 2], [0o35, 3], [0o36, 3], [0o37, 3],
  [0o40, 3], [0o41, 3], [0o42, 3], [0o43, 3], [0o44, 3], [0o45, 4], [0o46, 4], [0o47, 4],
  [0o50, 3], [0o51, 3], [0o52, 3], [0o53, 3], [0o54, 3], [0o55, 4], [0o56, 4], [0o57, 4],
  [0o60, 6], [0o61, 5], [0o62, 6], [0o63, 5], [0o64, 2], [0o65, 2], [0o66, 2], [0o67, 2],
  [0o70, 2], [0o71, 4], [0o72, 2], [0o73, 4], [0o74, 2], [0o75, 2], [0o76, 2], [0o77, 2],
]) PP_TIMES[op] = t;

export class Pp {
  constructor(machine, id) {
    this.m = machine;
    this.id = id;
    this.mem = new Uint16Array(4096);
    this.reset();
  }

  reset() {
    this.A = 0;
    this.P = 0;
    this.Q = 0;
    this.K = 0;
    this.R = 0;
    this.F = 0;
    this.d = 0;
    this.busy = false;     // instruction in progress (transfer, channel wait)
    this.stopped = false;
    this.exchanging = false;
    this.instructions = 0;
    this.waitUntil = 0;
    this.lastP = 0;
    this.hungOn = null;    // description of the current wait
  }

  /** PP name in octal (PP00-PP11). */
  get name() {
    return `PP${this.id.toString(8).padStart(2, '0')}`;
  }

  incP() { this.P = (this.P + 1) & M12; }

  /** Address m(d) with 12-bit ones' complement indexing. */
  indexed() {
    let loc = this.mem[this.P];
    if (this.d !== 0) loc += this.mem[this.d];
    if ((loc & 0o10000) || (loc & M12) === M12) loc += 1;
    loc &= M12;
    this.incP();
    return loc;
  }

  /** Relative jump: P <- P - 1 + d (d is 6-bit ones' complement). */
  relJump() {
    let to = (this.P - 1) & M12;
    to += this.d < 0o40 ? this.d : this.d - 0o77;
    if (to & 0o10000) to += 1;
    this.P = to & M12;
  }

  cmAddress() {
    if ((this.A & SIGN18) && this.m.ppRelocation) return (this.R + (this.A & 0o377777)) & 0o77777777;
    return this.A & M18;
  }

  channel(n) {
    return this.m.channels[n & 0o37] || null;
  }

  /** Executes one barrel "slot". Returns the time consumed (µs). */
  step() {
    if (this.stopped) return 1;
    if (this.exchanging) {
      // waiting for the exchange requested from the CPU to complete
      if (this.m.cpu.pendingExchange && this.m.cpu.pendingExchange.pp === this) return 1;
      this.exchanging = false;
    }
    if (this.busy && this.F === 0o71) {
      // waiting for input on an active, empty channel with no equipment: nothing to do
      const ch = this.m.channels[this.d & 0o37];
      if (ch && ch.active && !ch.full && !ch.ioDevice && !ch.alwaysActive && this.A !== 0) return 1;
    }
    if (!this.busy) {
      this.lastP = this.P;
      this.K = this.mem[this.P];
      this.F = (this.K >> 6) & 0o77;
      this.d = this.K & 0o77;
      this.incP();
      this.instructions++;
      this.exec();
      return this.busy ? 1 : PP_TIMES[this.F];
    }
    this.exec();
    return 1;
  }

  exec() {
    const mem = this.mem;
    const d = this.d;
    let loc, ch;
    switch (this.F) {
      case 0o00: return;                                                  // PSN
      case 0o01: this.P = this.indexed(); return;                         // LJM m,d
      case 0o02: loc = this.indexed(); mem[loc] = this.P; this.P = (loc + 1) & M12; return; // RJM
      case 0o03: this.relJump(); return;                                  // UJN
      case 0o04: if (this.A === 0) this.relJump(); return;                // ZJN
      case 0o05: if (this.A !== 0) this.relJump(); return;                // NJN
      case 0o06: if (this.A < SIGN18) this.relJump(); return;             // PJN
      case 0o07: if (this.A >= SIGN18) this.relJump(); return;            // MJN
      case 0o10: {                                                        // SHN d
        if (d < 0o40) {
          const n = d % 18;
          const v = this.A * 2 ** n;
          this.A = (v % 0o1000000) + Math.floor(v / 0o1000000);
        } else {
          this.A = this.A >>> (0o77 - d);
        }
        this.A &= M18;
        return;
      }
      case 0o11: this.A = (this.A ^ d) & M18; return;                     // LMN
      case 0o12: this.A &= d; return;                                     // LPN
      case 0o13: this.A &= ~d & M18; return;                              // SCN
      case 0o14: this.A = d; return;                                      // LDN
      case 0o15: this.A = ~d & M18; return;                               // LCN
      case 0o16: this.A = add18(this.A, d); return;                       // ADN
      case 0o17: this.A = sub18(this.A, d); return;                       // SBN
      case 0o20: this.A = (d << 12) | mem[this.P]; this.incP(); return;   // LDC
      case 0o21: this.A = add18(this.A, (d << 12) | mem[this.P]); this.incP(); return; // ADC
      case 0o22: this.A &= (d << 12) | mem[this.P]; this.incP(); return;  // LPC
      case 0o23: this.A = (this.A ^ ((d << 12) | mem[this.P])) & M18; this.incP(); return; // LMC
      case 0o24:                                                          // PSN (LRD on 800)
        if (d && this.m.ppRelocation) this.R = ((mem[d] & 0o17) << 18) | ((mem[(d + 1) & M12] & M12) << 6);
        return;
      case 0o25:                                                          // PSN (SRD on 800)
        if (d && this.m.ppRelocation) {
          mem[d] = (this.R >> 18) & 0o17;
          mem[(d + 1) & M12] = (this.R >> 6) & M12;
        }
        return;
      case 0o26: this.exchangeJump(); return;                             // EXN/MXN/MAN
      case 0o27: this.A = this.m.cpu.P & M18; return;                     // RPN
      case 0o30: this.A = mem[d]; return;                                 // LDD
      case 0o31: this.A = add18(this.A, mem[d]); return;                  // ADD
      case 0o32: this.A = sub18(this.A, mem[d]); return;                  // SBD
      case 0o33: this.A = (this.A ^ mem[d]) & M18; return;                // LMD
      case 0o34: mem[d] = this.A & M12; return;                           // STD
      case 0o35: this.A = add18(this.A, mem[d]); mem[d] = this.A & M12; return; // RAD
      case 0o36: this.A = add18(mem[d], 1); mem[d] = this.A & M12; return; // AOD
      case 0o37: this.A = sub18(mem[d], 1); mem[d] = this.A & M12; return; // SOD
      case 0o40: this.A = mem[mem[d]]; return;                            // LDI
      case 0o41: this.A = add18(this.A, mem[mem[d]]); return;             // ADI
      case 0o42: this.A = sub18(this.A, mem[mem[d]]); return;             // SBI
      case 0o43: this.A = (this.A ^ mem[mem[d]]) & M18; return;           // LMI
      case 0o44: mem[mem[d]] = this.A & M12; return;                      // STI
      case 0o45: loc = mem[d]; this.A = add18(this.A, mem[loc]); mem[loc] = this.A & M12; return; // RAI
      case 0o46: loc = mem[d]; this.A = add18(mem[loc], 1); mem[loc] = this.A & M12; return; // AOI
      case 0o47: loc = mem[d]; this.A = sub18(mem[loc], 1); mem[loc] = this.A & M12; return; // SOI
      case 0o50: this.A = mem[this.indexed()]; return;                    // LDM
      case 0o51: this.A = add18(this.A, mem[this.indexed()]); return;     // ADM
      case 0o52: this.A = sub18(this.A, mem[this.indexed()]); return;     // SBM
      case 0o53: this.A = (this.A ^ mem[this.indexed()]) & M18; return;   // LMM
      case 0o54: mem[this.indexed()] = this.A & M12; return;              // STM
      case 0o55: loc = this.indexed(); this.A = add18(this.A, mem[loc]); mem[loc] = this.A & M12; return; // RAM
      case 0o56: loc = this.indexed(); this.A = add18(mem[loc], 1); mem[loc] = this.A & M12; return; // AOM
      case 0o57: loc = this.indexed(); this.A = sub18(mem[loc], 1); mem[loc] = this.A & M12; return; // SOM
      case 0o60: {                                                        // CRD d
        const w = this.m.readCM(this.cmAddress() % this.m.cmSize);
        for (let n = 0; n < 5; n++) mem[(d + n) & M12] = Number((w >> BigInt(48 - 12 * n)) & 0o7777n);
        return;
      }
      case 0o61: {                                                        // CRM m,d
        if (!this.busy) {
          this.Q = mem[d];
          this.busy = true;
          mem[0] = this.P;
          this.P = mem[this.P];
          if (this.Q === 0) { this.endBlock(); return; }
        }
        const w = this.m.readCM(this.cmAddress() % this.m.cmSize);
        for (let n = 0; n < 5; n++) { mem[this.P] = Number((w >> BigInt(48 - 12 * n)) & 0o7777n); this.incP(); }
        this.A = (this.A + 1) & M18;
        this.Q = (this.Q - 1) & M12;
        if (this.Q === 0) this.endBlock();
        return;
      }
      case 0o62: {                                                        // CWD d
        let w = 0n;
        for (let n = 0; n < 5; n++) w = (w << 12n) | BigInt(mem[(d + n) & M12]);
        this.m.writeCM(this.cmAddress() % this.m.cmSize, w);
        return;
      }
      case 0o63: {                                                        // CWM m,d
        if (!this.busy) {
          this.Q = mem[d];
          this.busy = true;
          mem[0] = this.P;
          this.P = mem[this.P];
          if (this.Q === 0) { this.endBlock(); return; }
        }
        let w = 0n;
        for (let n = 0; n < 5; n++) { w = (w << 12n) | BigInt(mem[this.P]); this.incP(); }
        this.m.writeCM(this.cmAddress() % this.m.cmSize, w);
        this.A = (this.A + 1) & M18;
        this.Q = (this.Q - 1) & M12;
        if (this.Q === 0) this.endBlock();
        return;
      }
      case 0o64:                                                          // AJM m,c
        loc = mem[this.P]; this.incP();
        ch = this.channel(d);
        if (d & 0o40 && this.m.channelFlags) { // SCF
          if (ch) { if (ch.flag) this.P = loc; else ch.flag = true; }
          return;
        }
        if (ch && ch.active) this.P = loc;
        return;
      case 0o65:                                                          // IJM m,c
        loc = mem[this.P]; this.incP();
        ch = this.channel(d);
        if (d & 0o40 && this.m.channelFlags) { if (ch) ch.flag = false; return; } // CCF
        if (!ch || !ch.active) this.P = loc;
        return;
      case 0o66:                                                          // FJM m,c
        loc = mem[this.P]; this.incP();
        ch = this.channel(d);
        if (ch) { ch.io(); if (ch.full) this.P = loc; }
        return;
      case 0o67:                                                          // EJM m,c
        loc = mem[this.P]; this.incP();
        ch = this.channel(d);
        if (!ch) { this.P = loc; return; }
        ch.io();
        if (!ch.full) this.P = loc;
        return;
      case 0o70: return this.ian(d);                                      // IAN c
      case 0o71: return this.iam(d);                                      // IAM m,c
      case 0o72: return this.oan(d);                                      // OAN c
      case 0o73: return this.oam(d);                                      // OAM m,c
      case 0o74:                                                          // ACN c
        ch = this.channel(d);
        if (!ch) return;
        if (ch.active) { if (!(d & 0o40)) this.hang(`ACN ${oct(d)} (channel already active)`); return; }
        ch.activate();
        this.unhang();
        return;
      case 0o75:                                                          // DCN c
        ch = this.channel(d);
        if (!ch || ch.alwaysActive) return;
        if (!ch.active) { if (!(d & 0o40)) this.hang(`DCN ${oct(d)} (channel inactive)`); return; }
        ch.disconnect();
        this.unhang();
        return;
      case 0o76:                                                          // FAN c
        ch = this.channel(d);
        if (!ch) return;
        if (ch.active) { if (!(d & 0o40)) this.hang(`FAN ${oct(d)} (channel active)`); return; }
        ch.function(this.A & M12);
        this.unhang();
        return;
      case 0o77:                                                          // FNC m,c
        ch = this.channel(d);
        if (!ch) { this.incP(); return; }
        if (ch.active) { if (!(d & 0o40)) this.hang(`FNC ${oct(mem[this.P])},${oct(d)} (channel active)`); return; }
        ch.function(mem[this.P]);
        this.incP();
        this.unhang();
        return;
    }
  }

  hang(why) {
    this.busy = true;
    this.hungOn = why;
  }

  unhang() {
    this.busy = false;
    this.hungOn = null;
  }

  endBlock() {
    this.P = (mem0(this) + 1) & M12;
    this.busy = false;
    this.hungOn = null;
  }

  ian(d) {
    const ch = this.channel(d);
    if (!ch) { this.A = 0; return; }
    this.busy = true;
    this.hungOn = `IAN ${oct(d)}`;
    if (!ch.active && !ch.alwaysActive) {
      if (d & 0o40) { this.A = 0; this.unhang(); }
      return;
    }
    if (!ch.full || ch.alwaysFull) ch.io();
    if (ch.full || ch.alwaysFull) {
      this.A = ch.data & M12;
      ch.full = false;
      if (ch.discAfterInput) { ch.discAfterInput = false; ch.active = false; ch.ioDevice = null; }
      this.unhang();
    }
  }

  iam(d) {
    const ch = this.channel(d);
    const mem = this.mem;
    if (!this.busy) {
      this.busy = true;
      mem[0] = this.P;
      this.P = mem[this.P];
    }
    this.hungOn = `IAM ${oct(d)}`;
    if (!ch || (!ch.active && !ch.alwaysActive)) {
      if (ch && !ch.hardwired) ch.ioDevice = null;
      if (ch) ch.full = false;
      mem[this.P] = 0;
      this.endBlock();
      return;
    }
    if (this.A === 0) { this.endBlock(); return; }
    if (!ch.full || ch.alwaysFull) ch.io();
    if (ch.full || ch.alwaysFull) {
      mem[this.P] = ch.data & M12;
      ch.full = false;
      this.incP();
      this.A = (this.A - 1) & M18;
      if (ch.discAfterInput) {
        ch.discAfterInput = false;
        ch.active = false;
        ch.ioDevice = null;
        if (this.A !== 0) mem[this.P] = 0;
        this.endBlock();
      } else if (this.A === 0) {
        this.endBlock();
      }
    }
  }

  oan(d) {
    const ch = this.channel(d);
    if (!ch) return;
    this.busy = true;
    this.hungOn = `OAN ${oct(d)}`;
    if (!ch.active) {
      if (d & 0o40) this.unhang();
      return;
    }
    if (!ch.full) {
      ch.data = this.A & M12;
      ch.full = true;
      this.unhang();
    }
    ch.io();
  }

  oam(d) {
    const ch = this.channel(d);
    const mem = this.mem;
    if (!this.busy) {
      this.busy = true;
      mem[0] = this.P;
      this.P = mem[this.P];
    }
    this.hungOn = `OAM ${oct(d)}`;
    if (!ch || !ch.active) {
      if (ch && !ch.hardwired) ch.ioDevice = null;
      if (ch) ch.full = false;
      this.endBlock();
      return;
    }
    if (this.A === 0) { this.endBlock(); return; }
    if (!ch.full) {
      ch.data = mem[this.P];
      ch.full = true;
      this.incP();
      this.A = (this.A - 1) & M18;
      if (this.A === 0) this.endBlock();
    }
    ch.io();
  }

  exchangeJump() {
    const cpu = this.m.cpu;
    const d = this.d;
    if (cpu.pendingExchange) { this.P = (this.P - 1) & M12; return; } // retry
    let address;
    let changeMode = false;
    const sel = d & 0o70;
    if (sel === 0 || !cpu.features.cejMej) {
      address = this.A & M18;                               // EXN
    } else if (sel === 0o10) {
      address = this.A & M18; changeMode = true;            // MXN
    } else if (sel === 0o20) {
      address = cpu.MA; changeMode = true;                  // MAN
    } else {
      return;                                               // pass
    }
    cpu.requestExchange(address, changeMode, this);
    this.exchanging = true;
  }

  /** Summary state for the IDE. */
  snapshot() {
    return { id: this.id, A: this.A, P: this.P, Q: this.Q, K: this.K, busy: this.busy, hungOn: this.hungOn, stopped: this.stopped };
  }
}

function mem0(pp) {
  return pp.mem[0];
}

function oct(n) {
  return n.toString(8);
}
