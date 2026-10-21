// IDE execution logic, independent of the DOM (usable in Node).
//
// Launch modes:
//   - "cpu"       : bare CPU. The absolute (or relocatable) program is loaded at RA
//                   and the CPU starts at its entry point; the PPs stay idle.
//   - "pp"        : a PP program (12-bit words) is loaded into PP n and
//                   started at its entry point; the other PPs stay idle.
//   - "deadstart" : deadstart sequence with the panel words (16 at most).
//   - "system"    : job under the mini-system (src/os/system.js): CPU program
//                   at RA=2000B, MTR monitor in PP0, DSD console in PP1.
//   - "systape"   : same job, but bootstrapped by a real deadstart: system tape
//                   on unit 0 (DSL loader, central memory, DSD, MTR).
// The "auto" mode picks "pp" for a PP program, "system" for a relocatable
// CPU program (NOS-style job) and "cpu" for an absolute program.
//
// RunController sequences the execution slices (run, pause, step,
// speed) and translates the machine's stop reasons into messages.

const M18 = 0o777777;
const M12 = 0o7777;

export const RUN_MODES = {
  auto: 'Automatic',
  system: 'System',
  systape: 'System (tape deadstart)',
  cpu: 'Bare CPU',
  pp: 'PP',
  deadstart: 'Deadstart',
};

/**
 * Demonstration deadstart panel (loaded into PP0 from location 1):
 * displays "CDC 6600" in medium characters at the center of the left screen.
 *   1  DCN 10B            releases the console channel (active at deadstart)
 *   2  FNC 7001B,10B      left screen, medium characters
 *   4  ACN 10B
 *   5  LDN 6              6 words to output
 *   6  OAM 12B,10B
 *  10  DCN 10B
 *  11  UJN 2             refresh loop
 *  12  6300 7400         X = 300B, Y = 400B
 *  14  0304 0355 4141 3333  "CDC 6600"
 */
export const DEMO_DEADSTART = [
  0o7510, 0o7710, 0o7001, 0o7410, 0o1406, 0o7310, 0o0012, 0o7510,
  0o0370, 0o6300, 0o7400, 0o0304, 0o0355, 0o4141, 0o3333,
];

/** Optional loading of the relocatable binary loader. */
let loaderPromise = null;
export function loadOptionalLoader() {
  if (!loaderPromise) {
    loaderPromise = import('../loader/loader.js')
      .then((mod) => (mod && typeof mod.linkAndLoad === 'function' ? mod : null))
      .catch(() => null);
  }
  return loaderPromise;
}

/** Optional loading of the mini-system. */
let systemPromise = null;
export function loadOptionalSystem() {
  if (!systemPromise) {
    systemPromise = import('../os/system.js')
      .then((mod) => (mod && typeof mod.startJob === 'function' ? mod : null))
      .catch(() => null);
  }
  return systemPromise;
}

const oct = (n, w = 0) => (n >>> 0).toString(8).padStart(w, '0');

/** Formats a machine stop reason as English text. */
export function describeStop(stop, runner = null) {
  if (!stop) return '';
  switch (stop.reason) {
    case 'breakpoint': return `CPU breakpoint at P=${oct(stop.address, 6)}B`;
    case 'ppbreak': return `PP${oct(stop.pp, 2)} breakpoint at P=${oct(stop.address, 4)}B`;
    case 'watch': return `Watchpoint: write to ${oct(stop.address, 6)}B`;
    case 'cpustop':
      if (stop.error) {
        const at = runner && runner.machine.cpu.lastInstr ? ` (instruction at ${oct(runner.machine.cpu.lastInstr.P, 6)}B)` : '';
        return `Error exit: ${stop.error}${at}`;
      }
      return 'Program stop (PS)';
    case 'halt': return 'Machine halted';
    case 'user': return 'Stop requested';
    case 'idle': return 'CPU stopped: nothing to execute';
    case 'jobend': return stop.status === 'abort' ? 'Job aborted (see the dayfile)' : 'Normal end of job';
    case 'error': return `Internal error: ${stop.message}`;
    default: return stop.message || String(stop.reason);
  }
}

export class Runner {
  /**
   * @param machine Machine instance
   * @param options { mode, ra, fl, em, ppNumber, deadstart }
   */
  constructor(machine, options = {}) {
    this.machine = machine;
    this.options = { mode: 'auto', ra: 0, fl: 0, em: 0o070000, ppNumber: 0, deadstart: DEMO_DEADSTART, ...options };
    this.result = null;       // loaded assembly result
    this.program = null;      // loaded program
    this.kind = null;         // 'cpu' | 'pp' | 'deadstart'
    this.fileName = null;
    this.base = 0;            // offset (relative to RA) of the assembly addresses
    this.ra = 0;
    this.fl = 0;
    this.ppNumber = 0;
    this.loaderMap = null;
    this.lineToAddr = new Map();   // source line -> assembly address
    this.addrToLines = new Map();  // assembly address -> [{ line, parcel }]
    this.sourceBreakpoints = new Set();
    this.addressBreakpoints = new Set();   // CPU breakpoints set by absolute address
    this.ppAddressBreakpoints = new Map(); // pp -> Set(address), set from the disassembly
  }

  setMachine(machine) {
    this.machine = machine;
    this.unload();
  }

  unload() {
    this.result = null;
    this.program = null;
    this.kind = null;
    this.loaderMap = null;
    this.lineToAddr.clear();
    this.addrToLines.clear();
  }

  /** Effective mode for an assembly result. */
  resolveMode(result, mode = this.options.mode) {
    if (mode === 'deadstart' || mode === 'cpu' || mode === 'pp' || mode === 'system' || mode === 'systape') return mode;
    const progs = (result && result.programs) || [];
    if (progs.some((p) => p.type === 'pp') && !progs.some((p) => p.type !== 'pp')) return 'pp';
    if (progs.some((p) => p.type === 'reloc')) return 'system';
    return 'cpu';
  }

  /** "Soft" reset of the machine (memory, CPU, PPs, channels, console). */
  reset() {
    const m = this.machine;
    m.clearMemory();
    m.cpu.reset();
    m.time = 0;
    m.stopRequest = null;
    for (const ch of m.channels) {
      if (ch.hardwired) continue;
      ch.active = false;
      ch.full = false;
      ch.flag = false;
      ch.data = 0;
      ch.discAfterInput = false;
      ch.delayDisconnect = 0;
      ch.ioDevice = null;
      ch.devices = ch.devices.filter((d) => d.name !== 'deadstart');
    }
    m.console.reset();
    for (const pp of m.pps) pp.reset();
  }

  /**
   * Idles the unused PPs: waiting for a load on their channel
   * (deadstart state) if that channel is free, otherwise stopped.
   */
  idleOtherPPs(except = -1) {
    const m = this.machine;
    for (let n = 0; n < m.pps.length; n++) {
      if (n === except) continue;
      m.idlePP(n);
      const ch = m.channels[n];
      if (ch && !ch.devices.length && !ch.hardwired) {
        ch.active = true;   // IAM waiting: the PP is "hung", as after a deadstart
      } else {
        m.pps[n].stopped = true;
      }
    }
  }

  /**
   * Loads an assembly result into the machine according to the chosen mode.
   * @returns {Promise<{ ok, mode, message, entry? }>}
   */
  async load(result, opts = {}) {
    const o = { ...this.options, ...opts };
    let mode = this.resolveMode(result, o.mode);
    // Forced mode incompatible with the program (PP in CPU mode, or the reverse): automatic mode.
    const progs0 = (result && result.programs) || [];
    if (mode !== 'deadstart' && progs0.length) {
      const hasPP = progs0.some((p) => p.type === 'pp');
      const hasCPU = progs0.some((p) => p.type !== 'pp');
      if ((mode === 'pp' && !hasPP) || (mode !== 'pp' && !hasCPU)) mode = this.resolveMode(result, 'auto');
    }
    this.unload();
    this.fileName = opts.fileName || (result && result.fileName) || null;
    if (mode === 'deadstart') return this.loadDeadstart(o.deadstart);
    if (!result || !result.programs || !result.programs.length) {
      return { ok: false, mode, message: 'No assembled program to load.' };
    }
    this.reset();
    this.result = result;
    if (mode === 'pp') {
      const prog = result.programs.find((p) => p.type === 'pp');
      if (!prog) return { ok: false, mode, message: 'No PP program (PERIPH) in the assembly result.' };
      return this.loadPPProgram(prog, o.ppNumber);
    }
    const progs = result.programs.filter((p) => p.type === 'abs' || p.type === 'reloc');
    if (!progs.length) return { ok: false, mode, message: 'No CPU program (ABS or relocatable) in the assembly result.' };
    if (mode === 'system' || mode === 'systape') return this.loadSystemJob(progs, o, mode === 'systape');
    return this.loadCPUPrograms(progs, o);
  }

  /** System mode: the program becomes a mini-system job. */
  async loadSystemJob(progs, o, fromTape = false) {
    const mode = fromTape ? 'systape' : 'system';
    const sys = await loadOptionalSystem();
    if (!sys || (fromTape && typeof sys.deadstartJob !== 'function')) return { ok: false, mode, message: 'The mini-system (src/os/system.js) is unavailable.' };
    const m = this.machine;
    const main = progs[0];
    const opts = { name: main.name || 'JOB', em: o.em ?? 0o070000 };
    const st = fromTape ? sys.deadstartJob(m, progs, opts) : sys.startJob(m, progs, opts);
    if (!st.ok) return { ok: false, mode, message: `Job rejected: ${(st.errors || []).join('; ')}` };
    this.tape = st.tape || null;
    this.system = sys;
    this.kind = 'system';
    this.program = main;
    this.ra = st.ra;
    this.fl = st.fl;
    this.ppNumber = 0;
    this.loaderMap = normalizeMap(st.map, progs, st.ra);
    const first = this.loaderMap.find((e) => e.name === main.name && e.type === 'reloc');
    this.base = main.type === 'reloc' ? (first ? first.address - st.ra : 0o100) : 0;
    this.buildLineMaps();
    this.applyBreakpoints();
    const where = fromTape
      ? `system tape mounted on unit 0 (${st.tape ? st.tape.records.length : '?'} records), deadstart in progress`
      : 'MTR in PP00, DSD in PP01';
    return {
      ok: true, mode, entry: st.entry,
      message: `Job ${main.name || ''} submitted to the mini-system: RA=${oct(st.ra, 6)}B, FL=${oct(st.fl, 6)}B, entry P=${oct(st.entry, 6)}B; ${where}.`,
    };
  }

  /** Job status in System mode: 'run' | 'end' | 'abort' | 'none' (null outside this mode). */
  jobStatus() {
    return this.kind === 'system' && this.system ? this.system.jobStatus(this.machine) : null;
  }

  /** Mini-system dayfile. */
  dayfile() {
    return this.kind === 'system' && this.system ? this.system.dayfile(this.machine) : [];
  }

  /** Bare CPU mode: linking and loading by src/loader/loader.js if it exists. */
  async loadCPUPrograms(progs, o) {
    const m = this.machine;
    const ra = (o.ra >>> 0) % m.cmSize;
    const fl = o.fl ? Math.min(o.fl >>> 0, m.cmSize - ra) : m.cmSize - ra;
    const main = progs[0];
    let entry = 0;
    let warnings = [];
    this.kind = 'cpu';
    this.program = main;
    this.ra = ra;
    this.base = 0;
    const loader = o.useLoader === false ? null : await loadOptionalLoader();
    if (loader) {
      const r = loader.linkAndLoad(m, progs, { ra, base: 0o100, fl });
      entry = r.entry ?? 0o100;
      warnings = r.errors || [];
      this.loaderMap = normalizeMap(r.map, progs, ra);
      if (main.type === 'reloc') {
        const first = this.loaderMap.find((e) => e.name === main.name && e.type === 'reloc');
        this.base = first ? first.address - ra : 0o100;
      }
    } else if (main.type === 'abs') {
      for (const p of progs.filter((q) => q.type === 'abs')) writeImage(m, ra, p.image);
      entry = typeof main.entry === 'number' ? main.entry : main.origin || 0;
      this.loaderMap = progs.filter((q) => q.type === 'abs').map((p) => ({
        name: p.name, type: 'abs', address: ra + (p.image ? p.image.start : p.origin || 0),
        length: p.length ?? (p.image ? p.image.words.length : 0), origin: p.origin || 0,
      }));
    } else {
      // Without a loader: relocatable subprograms are placed one after another from RA+100B.
      let at = 0o100;
      this.loaderMap = [];
      for (const p of progs.filter((q) => q.type === 'reloc')) {
        const words = p.image ? p.image.words : [];
        const start = p.image ? p.image.start || 0 : 0;
        for (let i = 0; i < words.length; i++) m.cm[(ra + at + start + i) % m.cmSize] = BigInt.asUintN(60, BigInt(words[i]));
        this.loaderMap.push({ name: p.name, type: 'reloc', address: ra + at, length: p.length ?? words.length, origin: at });
        if (p === main) this.base = at;
        at += Math.max(p.length ?? 0, start + words.length);
      }
      entry = this.base + resolveEntry(main);
    }
    this.fl = fl;
    const monitor = !!m.cpu.features.cejMej;
    m.startCPU({ P: entry & M18, RA: ra, FL: fl, EM: o.em ?? 0, monitor });
    this.idleOtherPPs(-1);
    this.buildLineMaps();
    this.applyBreakpoints();
    return {
      ok: true, mode: 'cpu', entry, warnings,
      message: `Program ${main.name || ''} loaded at RA=${oct(ra, 6)}B, FL=${oct(fl, 6)}B, entry P=${oct(entry, 6)}B.`,
    };
  }

  /** PP mode. */
  loadPPProgram(prog, ppNumber = 0) {
    const m = this.machine;
    const n = Math.max(0, Math.min(m.pps.length - 1, ppNumber | 0));
    const image = prog.image || { start: prog.origin || 0, words: [] };
    m.loadPP(n, image.words.map((w) => Number(w) & M12), image.start || 0);
    const entry = (typeof prog.entry === 'number' ? prog.entry : prog.origin || image.start || 0) & M12;
    this.idleOtherPPs(n);
    m.startPP(n, entry);
    this.kind = 'pp';
    this.program = prog;
    this.ppNumber = n;
    this.base = 0;
    this.loaderMap = [{ name: prog.name, type: 'pp', address: image.start || 0, length: prog.length ?? image.words.length, origin: prog.origin || 0, pp: n }];
    this.buildLineMaps();
    this.applyBreakpoints();
    return {
      ok: true, mode: 'pp', entry,
      message: `PP program ${prog.name || ''} loaded into PP${oct(n, 2)} at ${oct(image.start || 0, 4)}B, entry ${oct(entry, 4)}B.`,
    };
  }

  /** Deadstart mode: the panel words are loaded into PP0 from location 1. */
  loadDeadstart(words = this.options.deadstart) {
    const panel = (words && words.length ? words : DEMO_DEADSTART).slice(0, 16).map((w) => w & M12);
    this.reset();
    this.machine.deadstart(panel);
    this.kind = 'deadstart';
    this.program = null;
    this.ppNumber = 0;
    this.loaderMap = [{ name: 'PANEL', type: 'deadstart', address: 1, length: panel.length, origin: 1, pp: 0 }];
    this.applyBreakpoints();
    return { ok: true, mode: 'deadstart', entry: 1, message: `Deadstart: ${panel.length} panel word(s) loaded into PP00.` };
  }

  // -------------------------------------------------------------- mappings

  /** Builds the source line <-> address tables from result.lines. */
  buildLineMaps() {
    this.lineToAddr.clear();
    this.addrToLines.clear();
    const lines = (this.result && this.result.lines) || [];
    for (const l of lines) {
      if (l.address === null || l.address === undefined || !l.line) continue;
      if (this.fileName && l.file && l.file !== this.fileName) continue;
      if (!this.lineToAddr.has(l.line)) this.lineToAddr.set(l.line, { address: l.address, parcel: l.parcel || 0 });
      if (!l.octal || !l.octal.length) continue; // no generated code (BSS 0, label only...)
      let arr = this.addrToLines.get(l.address);
      if (!arr) this.addrToLines.set(l.address, (arr = []));
      arr.push({ line: l.line, parcel: l.parcel || 0 });
    }
  }

  /** Assembly address of the first parcel of a source line (or null). */
  addressOfLine(line) {
    const e = this.lineToAddr.get(line);
    return e ? e.address : null;
  }

  /** Source line for an assembly address (and CPU parcel). */
  lineOfAddress(address, parcel = null) {
    const arr = this.addrToLines.get(address);
    if (!arr || !arr.length) return null;
    if (parcel !== null) {
      let best = null;
      for (const e of arr) if (e.parcel <= parcel && (!best || e.parcel >= best.parcel)) best = e;
      if (best) return best.line;
    }
    return arr[0].line;
  }

  /** Current execution location: { kind, address, parcel, line }. */
  currentLocation() {
    const m = this.machine;
    if (this.kind === 'cpu' || this.kind === 'system') {
      const cpu = m.cpu;
      const parcel = cpu.wordValid ? cpu.parcel : 0;
      const rel = (cpu.P - this.base) & M18;
      return { kind: 'cpu', address: cpu.P, parcel, line: this.lineOfAddress(rel, parcel) };
    }
    if (this.kind === 'pp' || this.kind === 'deadstart') {
      const pp = m.pps[this.ppNumber];
      const at = pp.busy ? pp.lastP : pp.P;
      return { kind: 'pp', pp: this.ppNumber, address: at, parcel: 0, line: this.kind === 'pp' ? this.lineOfAddress(at) : null };
    }
    return { kind: null, address: 0, parcel: 0, line: null };
  }

  /** Location of the last CPU instruction executed (useful after an error exit). */
  lastCpuLocation() {
    const li = this.machine.cpu.lastInstr;
    if (!li || (this.kind !== 'cpu' && this.kind !== 'system')) return null;
    return { address: li.P, parcel: li.parcel, line: this.lineOfAddress((li.P - this.base) & M18, li.parcel) };
  }

  /** Symbol value -> name table, for the disassemblers (addresses relative to RA). */
  symbolTable() {
    const map = new Map();
    const syms = (this.result && this.result.symbols) || [];
    for (const s of syms) {
      if (s.kind === 'ext' || typeof s.value !== 'number') continue;
      if (s.program && this.program && s.program !== this.program.name) continue;
      const v = s.kind === 'rel' ? s.value + this.base : s.value;
      if (!map.has(v)) map.set(v, s.name);
    }
    return map;
  }

  // ----------------------------------------------------------- breakpoints

  /** Sets the breakpoints from source line numbers. */
  setSourceBreakpoints(lines) {
    this.sourceBreakpoints = new Set(lines);
    return this.applyBreakpoints();
  }

  /** Transfers the source breakpoints to the machine. Returns { set, unresolved }. */
  applyBreakpoints() {
    const m = this.machine;
    const set = [];
    const unresolved = [];
    m.cpuBreakpoints.clear();
    m.ppBreakpoints.clear();
    for (const a of this.addressBreakpoints) m.cpuBreakpoints.add(a);
    for (const [n, addrs] of this.ppAddressBreakpoints) if (addrs.size) m.ppBreakpoints.set(n, new Set(addrs));
    if (this.kind !== 'cpu' && this.kind !== 'pp' && this.kind !== 'system') return { set, unresolved: [...this.sourceBreakpoints] };
    const ppSet = m.ppBreakpoints.get(this.ppNumber) || new Set();
    for (const line of this.sourceBreakpoints) {
      const a = this.addressOfLine(line);
      if (a === null) { unresolved.push(line); continue; }
      if (this.kind === 'cpu' || this.kind === 'system') {
        const abs = (this.ra + this.base + a) % m.cmSize;
        m.cpuBreakpoints.add(abs);
        set.push({ line, address: a, absolute: abs });
      } else {
        ppSet.add(a & M12);
        set.push({ line, address: a, pp: this.ppNumber });
      }
    }
    if (ppSet.size) m.ppBreakpoints.set(this.ppNumber, ppSet);
    return { set, unresolved };
  }

  /** Toggles a CPU breakpoint at an absolute address. Returns the final state. */
  toggleCpuAddressBreakpoint(abs) {
    const on = !this.addressBreakpoints.has(abs);
    if (on) this.addressBreakpoints.add(abs); else this.addressBreakpoints.delete(abs);
    this.applyBreakpoints();
    return on;
  }

  /** Toggles a breakpoint at an address of PP n. */
  togglePpAddressBreakpoint(n, addr) {
    let set = this.ppAddressBreakpoints.get(n);
    if (!set) this.ppAddressBreakpoints.set(n, (set = new Set()));
    const on = !set.has(addr);
    if (on) set.add(addr); else set.delete(addr);
    this.applyBreakpoints();
    return on;
  }

  /** Is the breakpoint set (whatever its origin)? */
  hasCpuBreakpoint(abs) {
    return this.machine.cpuBreakpoints.has(abs);
  }

  hasPpBreakpoint(n, addr) {
    const s = this.machine.ppBreakpoints.get(n);
    return !!(s && s.has(addr));
  }
}

/** Writes an image { start, words } into CM from RA. */
function writeImage(m, ra, image) {
  if (!image || !image.words) return;
  const start = image.start || 0;
  for (let i = 0; i < image.words.length; i++) {
    m.cm[(ra + start + i) % m.cmSize] = BigInt.asUintN(60, BigInt(image.words[i]));
  }
}

/** Relative entry point of a relocatable program (name resolved through its ENTRY). */
function resolveEntry(p) {
  if (typeof p.entry === 'number') return p.entry;
  if (typeof p.entry === 'string' && p.entries) {
    const e = p.entries.find((x) => x.name === p.entry);
    if (e && typeof e.value === 'number') return e.value;
  }
  return 0;
}

/** Normalizes the map returned by the loader into [{ name, type, address, length }]. */
function normalizeMap(map, progs, ra) {
  const list = Array.isArray(map) ? map : map && typeof map === 'object' ? Object.entries(map).map(([name, v]) => ({ name, ...(typeof v === 'object' ? v : { address: v }) })) : [];
  return list.map((e) => {
    const address = e.addr ?? e.address ?? e.origin ?? e.base ?? 0;
    const p = progs.find((q) => q.name === e.name);
    const kind = String(e.kind || '').toUpperCase();
    const type = kind === 'ABS' ? 'abs' : kind === 'REL' ? 'reloc' : kind === 'COMMON' ? 'common' : (p ? p.type : 'reloc');
    return { name: e.name, type, address: ra + address, length: e.length ?? (p ? p.length : 0), origin: address };
  });
}

// ---------------------------------------------------------------- controller

/**
 * Execution controller: continuous run in slices (one slice per animation
 * frame), pause, step, adjustable speed.
 */
export class RunController {
  /**
   * @param runner Runner
   * @param hooks { schedule(fn) -> id, cancel(id), now() -> ms, onFrame(info), onStop(stop, text), onState(state) }
   */
  constructor(runner, hooks = {}) {
    this.runner = runner;
    this.schedule = hooks.schedule || ((fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16)));
    this.cancel = hooks.cancel || ((id) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id)));
    this.now = hooks.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.onFrame = hooks.onFrame || (() => {});
    this.onStop = hooks.onStop || (() => {});
    this.onState = hooks.onState || (() => {});
    this.usPerFrame = 2000;    // simulated µs per frame
    this.maxSpeed = false;     // "max speed": as much as possible in ~12 ms
    this.budgetMs = 12;
    this.keepRunningAfterJob = !!hooks.keepRunningAfterJob; // System mode: the machine keeps running after the end of the job
    this.jobNotified = false;
    this.state = 'idle';       // idle | ready | running | paused | stopped
    this.timer = null;
    this.lastStop = null;
    this.stats = { mips: 0, ppMips: 0, ratio: 0 };
    this._meter = null;
  }

  get machine() {
    return this.runner.machine;
  }

  setState(s) {
    if (this.state !== s) {
      this.state = s;
      this.onState(s);
    }
  }

  /** To be called after a successful load. */
  ready() {
    this.halt();
    this.lastStop = null;
    this.jobNotified = false;
    this.setState('ready');
  }

  setSpeed(usPerFrame, max = false) {
    this.usPerFrame = Math.max(1, usPerFrame | 0);
    this.maxSpeed = !!max;
  }

  runOptions() {
    const cpu = this.runner.kind === 'cpu';
    return { stopOnCpuStop: cpu, cpuOnly: cpu };
  }

  /** Starts (or resumes) continuous execution. */
  run() {
    if (this.state === 'running') return;
    if (!this.runner.kind) return;
    const m = this.machine;
    if (this.runner.kind === 'cpu' && m.cpu.stopped && !m.cpu.pendingExchange) {
      this.finish({ reason: 'idle' });
      return;
    }
    this.setState('running');
    this.resetMeter();
    this.timer = this.schedule(() => this.tick());
  }

  pause() {
    if (this.state !== 'running') return;
    this.halt();
    this.setState('paused');
    this.onFrame(this.info());
  }

  /** Stops the loop without changing the state. */
  halt() {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
  }

  tick() {
    this.timer = null;
    if (this.state !== 'running') return;
    const stop = this.frame();
    this.updateMeter();
    if (stop) {
      this.finish(stop);
      return;
    }
    this.onFrame(this.info());
    if (this.state === 'running') this.timer = this.schedule(() => this.tick());
  }

  /** Executes one slice; returns the stop reason or null. */
  frame() {
    const r = this.frameRun();
    if (r) return r;
    const js = this.runner.jobStatus();
    if ((js === 'end' || js === 'abort') && !this.jobNotified) {
      this.jobNotified = true;
      const stop = { reason: 'jobend', status: js };
      if (!this.keepRunningAfterJob) return stop;
      // The machine keeps running: the DSD console shows the final job status.
      this.lastStop = stop;
      this.onStop(stop, describeStop(stop, this.runner));
    }
    return null;
  }

  frameRun() {
    const m = this.machine;
    const opts = this.runOptions();
    try {
      const t0 = this.now();
      if (!this.maxSpeed) {
        // At most usPerFrame simulated µs, without exceeding the frame's real-time budget.
        let left = this.usPerFrame;
        while (left > 0) {
          const n = Math.min(left, 2000);
          const r = m.run(n, opts);
          if (r) return r;
          left -= n;
          if (this.now() - t0 >= this.budgetMs) break;
        }
        return null;
      }
      let chunk = 2000;
      do {
        const r = m.run(chunk, opts);
        if (r) return r;
        if (opts.stopOnCpuStop && m.cpu.stopped && !m.cpu.pendingExchange) return { reason: 'cpustop', error: m.cpu.lastError, P: m.cpu.P };
        chunk = Math.min(chunk * 2, 50000);
      } while (this.now() - t0 < this.budgetMs);
      return null;
    } catch (e) {
      return { reason: 'error', message: e && e.message ? e.message : String(e) };
    }
  }

  finish(stop) {
    this.halt();
    this.lastStop = stop;
    const done = stop.reason === 'cpustop' || stop.reason === 'idle' || stop.reason === 'error' || stop.reason === 'halt' || stop.reason === 'jobend';
    this.setState(done ? 'stopped' : 'paused');
    this.onStop(stop, describeStop(stop, this.runner));
    this.onFrame(this.info());
  }

  /** Step: one CPU instruction. */
  stepCPU() {
    if (this.state === 'running') this.pause();
    const m = this.machine;
    if (m.cpu.stopped && !m.cpu.pendingExchange) {
      this.finish({ reason: 'idle' });
      return false;
    }
    try {
      m.stepCPU();
    } catch (e) {
      this.finish({ reason: 'error', message: e.message });
      return false;
    }
    if (m.cpu.stopped && this.runner.kind === 'cpu') {
      this.finish({ reason: 'cpustop', error: m.cpu.lastError, P: m.cpu.P });
      return false;
    }
    this.setState('paused');
    this.onFrame(this.info());
    return true;
  }

  /** Step: one instruction of PP n. */
  stepPP(n = this.runner.ppNumber) {
    if (this.state === 'running') this.pause();
    const m = this.machine;
    try {
      m.stepPP(n);
    } catch (e) {
      this.finish({ reason: 'error', message: e.message });
      return false;
    }
    this.setState('paused');
    this.onFrame(this.info());
    return true;
  }

  /** Executes a given number of µs (tests, "fast forward"). */
  advance(us) {
    const r = this.machine.run(us, this.runOptions());
    if (r) this.finish(r);
    return r;
  }

  resetMeter() {
    const m = this.machine;
    this._meter = { t: this.now(), cpu: m.cpu.instructions, pp: ppInstructions(m), time: m.time };
  }

  updateMeter() {
    const m = this.machine;
    const now = this.now();
    if (!this._meter) { this.resetMeter(); return; }
    const dt = now - this._meter.t;
    if (dt < 400) return;
    const dCpu = m.cpu.instructions - this._meter.cpu;
    const dPp = ppInstructions(m) - this._meter.pp;
    const dTime = m.time - this._meter.time;
    this.stats = { mips: dCpu / dt / 1000, ppMips: dPp / dt / 1000, ratio: dTime / (dt * 1000) };
    this._meter = { t: now, cpu: m.cpu.instructions, pp: ppInstructions(m), time: m.time };
  }

  info() {
    const m = this.machine;
    return { state: this.state, time: m.time, stats: this.stats, location: this.runner.currentLocation() };
  }
}

function ppInstructions(m) {
  let n = 0;
  for (const p of m.pps) n += p.instructions;
  return n;
}
