// Timing model of the CDC 6600 "scoreboard".
//
// The 6600 issues at most one instruction per minor cycle (100 ns) to ten
// independent functional units. An instruction can issue only if its unit
// is free and its result register is not reserved by a previous
// instruction (first-order conflict). It then waits in the unit until its
// operands are available (second-order conflict).
// Branches block issue until they are resolved.
//
// This model applies these rules with the unit times; it gives a realistic
// execution time without claiming cycle accuracy (third-order conflicts
// and memory banks are not modeled).

// Registers: X0-7 -> 0-7, A0-7 -> 8-15, B0-7 -> 16-23.
const XR = (n) => n;
const AR = (n) => 8 + n;
const BR = (n) => 16 + n;

// Units: name, number of copies.
export const UNITS = {
  branch: 1, boolean: 1, shift: 1, add: 1, longadd: 1, multiply: 2, divide: 1, increment: 2,
};

/** Times in minor cycles (100 ns), from table 8-1 of the COMPASS manual. */
export const TIMES = {
  boolean: 3, shift: 3, normalize: 4, add: 4, longadd: 3, multiply: 10, divide: 29,
  popcount: 8, increment: 3, memory: 5, branchInStackB: 8, branchInStackX: 9,
  branchOutOfStack: 14, returnJump: 14, exchange: 26, stop: 1,
};

/** Instruction description for the model: unit, time, sources, destinations. */
function describe(fm, i, j, k) {
  switch (fm >> 3) {
    case 0: {
      if (fm === 0) return { unit: 'branch', time: TIMES.stop, src: [], dst: [], branch: true };
      if (fm === 1) return { unit: 'branch', time: TIMES.returnJump, src: [], dst: [], branch: true };
      if (fm === 2) return { unit: 'branch', time: TIMES.branchOutOfStack, src: [BR(i)], dst: [], branch: true };
      if (fm === 3) return { unit: 'branch', time: 0, src: [XR(j)], dst: [], branch: true, cond: 'X' };
      return { unit: 'branch', time: 0, src: [BR(i), BR(j)], dst: [], branch: true, cond: 'B' };
    }
    case 1: return { unit: 'boolean', time: TIMES.boolean, src: [XR(j), XR(k)], dst: [XR(i)] };
    case 2: {
      if (fm === 0o20 || fm === 0o21) return { unit: 'shift', time: TIMES.shift, src: [XR(i)], dst: [XR(i)] };
      if (fm === 0o24 || fm === 0o25) return { unit: 'shift', time: TIMES.normalize, src: [XR(k)], dst: [XR(i), BR(j)] };
      if (fm === 0o26) return { unit: 'boolean', time: TIMES.boolean, src: [XR(k)], dst: [XR(i), BR(j)] };
      if (fm === 0o27) return { unit: 'boolean', time: TIMES.boolean, src: [XR(k), BR(j)], dst: [XR(i)] };
      return { unit: 'shift', time: TIMES.shift, src: [XR(k), BR(j)], dst: [XR(i)] };
    }
    case 3:
      if (fm >= 0o36) return { unit: 'longadd', time: TIMES.longadd, src: [XR(j), XR(k)], dst: [XR(i)] };
      return { unit: 'add', time: TIMES.add, src: [XR(j), XR(k)], dst: [XR(i)] };
    case 4:
      if (fm <= 0o42) return { unit: 'multiply', time: TIMES.multiply, src: [XR(j), XR(k)], dst: [XR(i)] };
      if (fm === 0o43) return { unit: 'shift', time: TIMES.shift, src: [], dst: [XR(i)] };
      if (fm === 0o44 || fm === 0o45) return { unit: 'divide', time: TIMES.divide, src: [XR(j), XR(k)], dst: [XR(i)] };
      if (fm === 0o46) return null;
      return { unit: 'divide', time: TIMES.popcount, src: [XR(k)], dst: [XR(i)] };
    default: {
      // 50-77: increment units. j and k designate A/B/X depending on the code.
      const sub = fm & 7;
      const src = [];
      if (sub === 0 || sub === 4 || sub === 5) src.push(AR(j));
      if (sub === 1 || sub === 6 || sub === 7) src.push(BR(j));
      if (sub === 2 || sub === 3) src.push(XR(j));
      if (sub >= 3) src.push(BR(k));
      const grp = fm >> 3;
      const dst = grp === 5 ? [AR(i)] : grp === 6 ? [BR(i)] : [XR(i)];
      const d = { unit: 'increment', time: TIMES.increment, src, dst };
      if (grp === 5 && i >= 1 && i <= 5) d.load = i;
      if (grp === 5 && i >= 6) { d.store = i; d.src.push(XR(i)); }
      return d;
    }
  }
}

export class Scoreboard {
  constructor() {
    this.reset();
  }

  reset() {
    this.t = 0;
    this.ready = new Float64Array(24);
    this.unitFree = {};
    for (const [u, n] of Object.entries(UNITS)) this.unitFree[u] = new Array(n).fill(0);
    this.lastP = -1;
  }

  /** Issues the instruction just executed; returns the issue clock. */
  issue(cpu, fm, i, j, k) {
    const d = describe(fm, i, j, k);
    if (!d) { this.t += 1; return this.t; }
    const frees = this.unitFree[d.unit];
    let u = 0;
    for (let n = 1; n < frees.length; n++) if (frees[n] < frees[u]) u = n;

    let issueAt = Math.max(this.t, frees[u]);
    for (const r of d.dst) if (r !== 16) issueAt = Math.max(issueAt, this.ready[r]);
    let start = issueAt;
    for (const r of d.src) if (r !== 16) start = Math.max(start, this.ready[r]);

    let time = d.time;
    if (d.cond) {
      // 9 cycles (X test) or 8 (B test) if not taken or target in stack, 14 out of stack.
      if (cpu.lastBranchTaken && !cpu.branchInStack) time = TIMES.branchOutOfStack;
      else time = d.cond === 'X' ? TIMES.branchInStackX : TIMES.branchInStackB;
    }
    const done = start + time;
    frees[u] = done;
    for (const r of d.dst) this.ready[r] = done;
    if (d.load) this.ready[XR(d.load)] = done + TIMES.memory;

    if (d.branch) this.t = done; // issue resumes once the branch is resolved
    else this.t = issueAt + 1;
    return this.t;
  }
}
