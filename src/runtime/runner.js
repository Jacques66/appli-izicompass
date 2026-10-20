// Logique d'exécution de l'IDE, indépendante du DOM (utilisable dans Node).
//
// Trois modes de lancement :
//   - « cpu »       : CPU nu. Le programme absolu (ou relogeable) est chargé en RA
//                     et le CPU démarre à son point d'entrée ; les PP restent au repos.
//   - « pp »        : un programme PP (mots de 12 bits) est chargé dans le PP n et
//                     démarré à son point d'entrée ; les autres PP restent au repos.
//   - « deadstart » : séquence de deadstart avec les mots du panneau (16 au plus).
//   - « system »    : travail sous le mini-système (src/os/system.js) : programme CPU
//                     en RA=2000B, moniteur MTR dans PP0, console DSD dans PP1.
//   - « systape »   : même travail, mais amorcé par un vrai deadstart : bande système
//                     sur l'unité 0 (chargeur DSL, mémoire centrale, DSD, MTR).
// Le mode « auto » choisit « pp » pour un programme PP, « system » pour un
// programme CPU relogeable (travail à la NOS) et « cpu » pour un programme absolu.
//
// RunController enchaîne les tranches d'exécution (marche, pause, pas à pas,
// vitesse) et traduit les raisons d'arrêt de la machine en messages.

const M18 = 0o777777;
const M12 = 0o7777;

export const RUN_MODES = {
  auto: 'Automatique',
  system: 'Système',
  systape: 'Système (deadstart sur bande)',
  cpu: 'CPU nu',
  pp: 'PP',
  deadstart: 'Deadstart',
};

/**
 * Panneau de deadstart de démonstration (chargé dans PP0 à partir de 1) :
 * affiche « CDC 6600 » en caractères moyens au centre de l'écran gauche.
 *   1  DCN 10B            libère le canal de la console (actif au deadstart)
 *   2  FNC 7001B,10B      écran gauche, caractères moyens
 *   4  ACN 10B
 *   5  LDN 6              6 mots à émettre
 *   6  OAM 12B,10B
 *  10  DCN 10B
 *  11  UJN 2             boucle de rafraîchissement
 *  12  6300 7400         X = 300B, Y = 400B
 *  14  0304 0355 4141 3333  « CDC 6600 »
 */
export const DEMO_DEADSTART = [
  0o7510, 0o7710, 0o7001, 0o7410, 0o1406, 0o7310, 0o0012, 0o7510,
  0o0370, 0o6300, 0o7400, 0o0304, 0o0355, 0o4141, 0o3333,
];

/** Chargement facultatif du chargeur de binaires relogeables. */
let loaderPromise = null;
export function loadOptionalLoader() {
  if (!loaderPromise) {
    loaderPromise = import('../loader/loader.js')
      .then((mod) => (mod && typeof mod.linkAndLoad === 'function' ? mod : null))
      .catch(() => null);
  }
  return loaderPromise;
}

/** Chargement facultatif du mini-système. */
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

/** Formate une raison d'arrêt de la machine en texte français. */
export function describeStop(stop, runner = null) {
  if (!stop) return '';
  switch (stop.reason) {
    case 'breakpoint': return `Point d'arrêt CPU en P=${oct(stop.address, 6)}B`;
    case 'ppbreak': return `Point d'arrêt PP${oct(stop.pp, 2)} en P=${oct(stop.address, 4)}B`;
    case 'watch': return `Point de surveillance : écriture en ${oct(stop.address, 6)}B`;
    case 'cpustop':
      if (stop.error) {
        const at = runner && runner.machine.cpu.lastInstr ? ` (instruction en ${oct(runner.machine.cpu.lastInstr.P, 6)}B)` : '';
        return `Sortie d'erreur : ${stop.error}${at}`;
      }
      return 'Arrêt du programme (PS)';
    case 'halt': return 'Machine arrêtée';
    case 'user': return 'Arrêt demandé';
    case 'idle': return 'CPU arrêté : rien à exécuter';
    case 'jobend': return stop.status === 'abort' ? 'Travail abandonné (voir le journal)' : 'Fin normale du travail';
    case 'error': return `Erreur interne : ${stop.message}`;
    default: return stop.message || String(stop.reason);
  }
}

export class Runner {
  /**
   * @param machine instance de Machine
   * @param options { mode, ra, fl, em, ppNumber, deadstart }
   */
  constructor(machine, options = {}) {
    this.machine = machine;
    this.options = { mode: 'auto', ra: 0, fl: 0, em: 0o070000, ppNumber: 0, deadstart: DEMO_DEADSTART, ...options };
    this.result = null;       // résultat d'assemblage chargé
    this.program = null;      // programme chargé
    this.kind = null;         // 'cpu' | 'pp' | 'deadstart'
    this.fileName = null;
    this.base = 0;            // décalage (relatif à RA) des adresses d'assemblage
    this.ra = 0;
    this.fl = 0;
    this.ppNumber = 0;
    this.loaderMap = null;
    this.lineToAddr = new Map();   // ligne source -> adresse d'assemblage
    this.addrToLines = new Map();  // adresse d'assemblage -> [{ line, parcel }]
    this.sourceBreakpoints = new Set();
    this.addressBreakpoints = new Set();   // points d'arrêt CPU posés par adresse absolue
    this.ppAddressBreakpoints = new Map(); // pp -> Set(adresse), posés depuis le désassemblage
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

  /** Mode effectif pour un résultat d'assemblage. */
  resolveMode(result, mode = this.options.mode) {
    if (mode === 'deadstart' || mode === 'cpu' || mode === 'pp' || mode === 'system' || mode === 'systape') return mode;
    const progs = (result && result.programs) || [];
    if (progs.some((p) => p.type === 'pp') && !progs.some((p) => p.type !== 'pp')) return 'pp';
    if (progs.some((p) => p.type === 'reloc')) return 'system';
    return 'cpu';
  }

  /** Remise à zéro « douce » de la machine (mémoire, CPU, PP, canaux, console). */
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
   * Met les PP inutilisés au repos : en attente d'un chargement sur leur canal
   * (état de deadstart) si ce canal est libre, sinon arrêtés.
   */
  idleOtherPPs(except = -1) {
    const m = this.machine;
    for (let n = 0; n < m.pps.length; n++) {
      if (n === except) continue;
      m.idlePP(n);
      const ch = m.channels[n];
      if (ch && !ch.devices.length && !ch.hardwired) {
        ch.active = true;   // IAM en attente : le PP est « suspendu », comme après un deadstart
      } else {
        m.pps[n].stopped = true;
      }
    }
  }

  /**
   * Charge un résultat d'assemblage dans la machine selon le mode choisi.
   * @returns {Promise<{ ok, mode, message, entry? }>}
   */
  async load(result, opts = {}) {
    const o = { ...this.options, ...opts };
    let mode = this.resolveMode(result, o.mode);
    // Mode imposé incompatible avec le programme (PP en mode CPU, ou l'inverse) : mode automatique.
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
      return { ok: false, mode, message: 'Aucun programme assemblé à charger.' };
    }
    this.reset();
    this.result = result;
    if (mode === 'pp') {
      const prog = result.programs.find((p) => p.type === 'pp');
      if (!prog) return { ok: false, mode, message: 'Aucun programme PP (PERIPH) dans le résultat d\'assemblage.' };
      return this.loadPPProgram(prog, o.ppNumber);
    }
    const progs = result.programs.filter((p) => p.type === 'abs' || p.type === 'reloc');
    if (!progs.length) return { ok: false, mode, message: 'Aucun programme CPU (ABS ou relogeable) dans le résultat d\'assemblage.' };
    if (mode === 'system' || mode === 'systape') return this.loadSystemJob(progs, o, mode === 'systape');
    return this.loadCPUPrograms(progs, o);
  }

  /** Mode Système : le programme devient un travail du mini-système. */
  async loadSystemJob(progs, o, fromTape = false) {
    const mode = fromTape ? 'systape' : 'system';
    const sys = await loadOptionalSystem();
    if (!sys || (fromTape && typeof sys.deadstartJob !== 'function')) return { ok: false, mode, message: 'Le mini-système (src/os/system.js) est indisponible.' };
    const m = this.machine;
    const main = progs[0];
    const opts = { name: main.name || 'JOB', em: o.em ?? 0o070000 };
    const st = fromTape ? sys.deadstartJob(m, progs, opts) : sys.startJob(m, progs, opts);
    if (!st.ok) return { ok: false, mode, message: `Travail refusé : ${(st.errors || []).join(' ; ')}` };
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
      ? `bande système montée sur l'unité 0 (${st.tape ? st.tape.records.length : '?'} enregistrements), deadstart en cours`
      : 'MTR dans PP00, DSD dans PP01';
    return {
      ok: true, mode, entry: st.entry,
      message: `Travail ${main.name || ''} soumis au mini-système : RA=${oct(st.ra, 6)}B, FL=${oct(st.fl, 6)}B, entrée P=${oct(st.entry, 6)}B ; ${where}.`,
    };
  }

  /** État du travail en mode Système : 'run' | 'end' | 'abort' | 'none' (null hors de ce mode). */
  jobStatus() {
    return this.kind === 'system' && this.system ? this.system.jobStatus(this.machine) : null;
  }

  /** Journal (dayfile) du mini-système. */
  dayfile() {
    return this.kind === 'system' && this.system ? this.system.dayfile(this.machine) : [];
  }

  /** Mode CPU nu : édition de liens et chargement par src/loader/loader.js s'il existe. */
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
      // Sans chargeur : les sous-programmes relogeables sont placés à la suite à partir de RA+100B.
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
      message: `Programme ${main.name || ''} chargé en RA=${oct(ra, 6)}B, FL=${oct(fl, 6)}B, entrée P=${oct(entry, 6)}B.`,
    };
  }

  /** Mode PP. */
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
      message: `Programme PP ${prog.name || ''} chargé dans PP${oct(n, 2)} en ${oct(image.start || 0, 4)}B, entrée ${oct(entry, 4)}B.`,
    };
  }

  /** Mode deadstart : les mots du panneau sont chargés dans PP0 à partir de 1. */
  loadDeadstart(words = this.options.deadstart) {
    const panel = (words && words.length ? words : DEMO_DEADSTART).slice(0, 16).map((w) => w & M12);
    this.reset();
    this.machine.deadstart(panel);
    this.kind = 'deadstart';
    this.program = null;
    this.ppNumber = 0;
    this.loaderMap = [{ name: 'PANNEAU', type: 'deadstart', address: 1, length: panel.length, origin: 1, pp: 0 }];
    this.applyBreakpoints();
    return { ok: true, mode: 'deadstart', entry: 1, message: `Deadstart : ${panel.length} mot(s) du panneau chargés dans PP00.` };
  }

  // ------------------------------------------------------ correspondances

  /** Construit les tables ligne source <-> adresse à partir de result.lines. */
  buildLineMaps() {
    this.lineToAddr.clear();
    this.addrToLines.clear();
    const lines = (this.result && this.result.lines) || [];
    for (const l of lines) {
      if (l.address === null || l.address === undefined || !l.line) continue;
      if (this.fileName && l.file && l.file !== this.fileName) continue;
      if (!this.lineToAddr.has(l.line)) this.lineToAddr.set(l.line, { address: l.address, parcel: l.parcel || 0 });
      if (!l.octal || !l.octal.length) continue; // pas de code généré (BSS 0, étiquette seule…)
      let arr = this.addrToLines.get(l.address);
      if (!arr) this.addrToLines.set(l.address, (arr = []));
      arr.push({ line: l.line, parcel: l.parcel || 0 });
    }
  }

  /** Adresse d'assemblage de la première parcelle d'une ligne source (ou null). */
  addressOfLine(line) {
    const e = this.lineToAddr.get(line);
    return e ? e.address : null;
  }

  /** Ligne source correspondant à une adresse d'assemblage (et parcelle CPU). */
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

  /** Emplacement courant d'exécution : { kind, address, parcel, line }. */
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

  /** Emplacement de la dernière instruction CPU exécutée (utile après une sortie d'erreur). */
  lastCpuLocation() {
    const li = this.machine.cpu.lastInstr;
    if (!li || (this.kind !== 'cpu' && this.kind !== 'system')) return null;
    return { address: li.P, parcel: li.parcel, line: this.lineOfAddress((li.P - this.base) & M18, li.parcel) };
  }

  /** Table valeur -> nom des symboles, pour les désassembleurs (adresses relatives à RA). */
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

  // ------------------------------------------------------- points d'arrêt

  /** Définit les points d'arrêt à partir de numéros de lignes source. */
  setSourceBreakpoints(lines) {
    this.sourceBreakpoints = new Set(lines);
    return this.applyBreakpoints();
  }

  /** Reporte les points d'arrêt source dans la machine. Retourne { set, unresolved }. */
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

  /** Bascule un point d'arrêt CPU à une adresse absolue. Retourne l'état final. */
  toggleCpuAddressBreakpoint(abs) {
    const on = !this.addressBreakpoints.has(abs);
    if (on) this.addressBreakpoints.add(abs); else this.addressBreakpoints.delete(abs);
    this.applyBreakpoints();
    return on;
  }

  /** Bascule un point d'arrêt sur une adresse du PP n. */
  togglePpAddressBreakpoint(n, addr) {
    let set = this.ppAddressBreakpoints.get(n);
    if (!set) this.ppAddressBreakpoints.set(n, (set = new Set()));
    const on = !set.has(addr);
    if (on) set.add(addr); else set.delete(addr);
    this.applyBreakpoints();
    return on;
  }

  /** Le point d'arrêt (quelle que soit son origine) est-il posé ? */
  hasCpuBreakpoint(abs) {
    return this.machine.cpuBreakpoints.has(abs);
  }

  hasPpBreakpoint(n, addr) {
    const s = this.machine.ppBreakpoints.get(n);
    return !!(s && s.has(addr));
  }
}

/** Écrit une image { start, words } en CM à partir de RA. */
function writeImage(m, ra, image) {
  if (!image || !image.words) return;
  const start = image.start || 0;
  for (let i = 0; i < image.words.length; i++) {
    m.cm[(ra + start + i) % m.cmSize] = BigInt.asUintN(60, BigInt(image.words[i]));
  }
}

/** Point d'entrée relatif d'un programme relogeable (nom résolu par ses ENTRY). */
function resolveEntry(p) {
  if (typeof p.entry === 'number') return p.entry;
  if (typeof p.entry === 'string' && p.entries) {
    const e = p.entries.find((x) => x.name === p.entry);
    if (e && typeof e.value === 'number') return e.value;
  }
  return 0;
}

/** Normalise la carte renvoyée par le chargeur en [{ name, type, address, length }]. */
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

// ---------------------------------------------------------------- contrôleur

/**
 * Contrôleur d'exécution : marche continue par tranches (une tranche par image
 * d'animation), pause, pas à pas, vitesse réglable.
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
    this.usPerFrame = 2000;    // µs simulées par image
    this.maxSpeed = false;     // « vitesse max » : autant que possible en ~12 ms
    this.budgetMs = 12;
    this.keepRunningAfterJob = !!hooks.keepRunningAfterJob; // mode Système : la machine continue après la fin du travail
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

  /** À appeler après un chargement réussi. */
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

  /** Démarre (ou reprend) l'exécution continue. */
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

  /** Arrête la boucle sans changer l'état. */
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

  /** Exécute une tranche ; retourne la raison d'arrêt ou null. */
  frame() {
    const r = this.frameRun();
    if (r) return r;
    const js = this.runner.jobStatus();
    if ((js === 'end' || js === 'abort') && !this.jobNotified) {
      this.jobNotified = true;
      const stop = { reason: 'jobend', status: js };
      if (!this.keepRunningAfterJob) return stop;
      // La machine continue : la console DSD affiche l'état final du travail.
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
        // Au plus usPerFrame µs simulées, sans dépasser le budget de temps réel de l'image.
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

  /** Pas à pas : une instruction CPU. */
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

  /** Pas à pas : une instruction du PP n. */
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

  /** Exécute un nombre donné de µs (tests, « avance rapide »). */
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
