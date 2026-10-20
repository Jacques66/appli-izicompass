// Machine CDC 6600 complète : mémoire centrale, ECS, CPU, PP, canaux, périphériques.
//
// Temps : l'horloge `time` compte les cycles majeurs (1 µs). À chaque cycle
// majeur, chaque PP du barillet dispose d'un créneau, et le CPU exécute jusqu'à
// dix cycles mineurs (100 ns).

import { Cpu, MODELS } from './cpu/cpu.js';
import { Pp } from './pp/pp.js';
import { Channel } from './io/channel.js';
import {
  DeadstartPanel, Console6612, CardReader405, LinePrinter1612, TapeDrive607, Tape, RealTimeClock,
} from './io/devices.js';

export const DEFAULT_CONFIG = {
  model: '6600',
  cmWords: 0o400000,     // 131072 mots
  ecsWords: 0o400000,    // ECS de 131072 mots
  ppCount: 10,
  channels: 0o20,
  consoleChannel: 0o10,
  unitRecordChannel: 0o12, // lecteur 405 + imprimante 1612
  tapeChannel: 0o13,
  clockChannel: 0o14,
  tapeUnits: 4,
};

export class Machine {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    const c = this.config;
    this.cmSize = c.cmWords;
    this.cm = new BigUint64Array(c.cmWords);
    this.ecsSize = c.ecsWords;
    this.ecs = c.ecsWords ? new BigUint64Array(c.ecsWords) : null;
    this.cpu = new Cpu(this, c.model);
    this.pps = [];
    for (let i = 0; i < c.ppCount; i++) this.pps.push(new Pp(this, i));
    this.channels = [];
    for (let i = 0; i < c.channels; i++) this.channels.push(new Channel(i));
    this.ppRelocation = false;
    this.channelFlags = false;
    this.time = 0;
    this.cpuBreakpoints = new Set();   // adresses absolues de mots
    this.ppBreakpoints = new Map();    // pp -> Set(adresse)
    this.watchpoints = new Set();      // adresses CM absolues surveillées en écriture
    this.stopRequest = null;
    this.writeHook = null;

    // Périphériques
    this.console = new Console6612();
    this.console.machine = this;
    this.channels[c.consoleChannel].attach(this.console);
    this.cardReader = new CardReader405();
    this.printer = new LinePrinter1612();
    this.channels[c.unitRecordChannel].attach(this.cardReader);
    this.channels[c.unitRecordChannel].attach(this.printer);
    this.tapes = new TapeDrive607();
    this.channels[c.tapeChannel].attach(this.tapes);
    for (let u = 0; u < c.tapeUnits; u++) this.tapes.mount(u, new Tape());
    this.clock = new RealTimeClock(this);
    if (c.clockChannel < c.channels) this.clock.attachTo(this.channels[c.clockChannel]);
  }

  // ---------------------------------------------------------------- mémoire

  readCM(addr) {
    return this.cm[addr];
  }

  writeCM(addr, value) {
    this.cm[addr] = value;
    if (this.watchpoints.size && this.watchpoints.has(addr)) {
      this.stopRequest = { reason: 'watch', address: addr, value };
    }
    if (this.writeHook) this.writeHook(addr, value);
  }

  clearMemory() {
    this.cm.fill(0n);
    if (this.ecs) this.ecs.fill(0n);
    for (const pp of this.pps) pp.mem.fill(0);
  }

  // -------------------------------------------------------------- deadstart

  /**
   * Deadstart : tous les PP exécutent un IAM 10000B sur leur canal en P = 0 ;
   * le panneau envoie ses mots sur le canal 0, chargés dans PP0 à partir de 1 ;
   * PP0 démarre alors en 1. Les autres PP attendent d'être chargés par PP0.
   */
  deadstart(panelWords) {
    this.cpu.reset();
    this.time = 0;
    for (const ch of this.channels) {
      ch.active = ch.id <= 0o13;
      ch.full = false;
      ch.flag = false;
      ch.discAfterInput = false;
      if (!ch.hardwired) ch.ioDevice = null;
      ch.devices = ch.devices.filter((d) => !(d instanceof DeadstartPanel));
    }
    if (this.config.clockChannel < this.channels.length) {
      const clk = this.channels[this.config.clockChannel];
      clk.active = true;
    }
    for (const pp of this.pps) {
      pp.reset();
      pp.F = 0o71;
      pp.d = pp.id;
      pp.K = (0o71 << 6) | pp.id;
      pp.busy = true;
      pp.P = 0;
      pp.mem[0] = 0;
      pp.A = 0o10000;
      this.channels[pp.id].active = true;
    }
    const panel = new DeadstartPanel(panelWords);
    const ch0 = this.channels[0];
    ch0.attach(panel);
    ch0.ioDevice = panel;
    ch0.active = true;
    ch0.full = true;
    ch0.data = 0;
    this.console.reset();
  }

  /** Charge directement un programme dans la mémoire d'un PP. */
  loadPP(n, words, origin = 0) {
    const pp = this.pps[n];
    for (let i = 0; i < words.length; i++) pp.mem[(origin + i) & 0o7777] = words[i] & 0o7777;
  }

  /** Démarre un PP à l'adresse donnée (hors séquence de deadstart). */
  startPP(n, address) {
    const pp = this.pps[n];
    pp.reset();
    pp.P = address & 0o7777;
  }

  /** Arrête un PP (il n'exécute plus rien). */
  stopPP(n) {
    const pp = this.pps[n];
    pp.reset();
    pp.stopped = true;
  }

  /** Met un PP en attente d'un chargement sur son canal (état de deadstart). */
  idlePP(n) {
    const pp = this.pps[n];
    pp.reset();
    pp.F = 0o71;
    pp.d = n;
    pp.busy = true;
    pp.P = 0;
    pp.mem[0] = 0;
    pp.A = 0o10000;
  }

  /**
   * Prépare le CPU pour exécuter un programme : construit un paquet d'échange
   * en `xpAddress` et le charge.
   */
  startCPU({ P = 0, RA = 0, FL = this.cmSize, EM = 0, RAE = 0, FLE = this.ecsSize, MA = 0, X = [], A = [], B = [], monitor = false } = {}) {
    const cpu = this.cpu;
    cpu.reset();
    cpu.P = P; cpu.RA = RA; cpu.FL = FL; cpu.EM = EM; cpu.RAE = RAE; cpu.FLE = FLE; cpu.MA = MA;
    for (let i = 0; i < 8; i++) {
      cpu.X[i] = X[i] ?? 0n;
      cpu.A[i] = A[i] ?? 0;
      cpu.B[i] = i ? (B[i] ?? 0) : 0;
    }
    cpu.monitorMode = monitor;
    cpu.stopped = false;
  }

  // -------------------------------------------------------------- exécution

  /**
   * Exécute `us` microsecondes simulées. Retourne null ou la raison d'arrêt :
   * { reason: 'breakpoint'|'ppbreak'|'watch'|'cpustop'|'halt'|'user', ... }
   */
  run(us, { stopOnCpuStop = false, cpuOnly = false } = {}) {
    const cpu = this.cpu;
    const pps = this.pps;
    const channels = this.channels;
    const cpuBp = this.cpuBreakpoints;
    const ppBp = this.ppBreakpoints;
    const end = this.time + us;
    this.stopRequest = null;
    while (this.time < end) {
      this.time++;
      if (!cpuOnly) {
        for (let n = 0; n < pps.length; n++) {
          const pp = pps[n];
          if (pp.stopped || this.time < pp.waitUntil) continue;
          if (!pp.busy && ppBp.size) {
            const set = ppBp.get(n);
            if (set && set.has(pp.P) && !pp.skipBreak) {
              pp.skipBreak = true;
              this.time--;
              return { reason: 'ppbreak', pp: n, address: pp.P };
            }
          }
          pp.skipBreak = false;
          pp.waitUntil = this.time + pp.step();
        }
        for (let n = 0; n < channels.length; n++) if (channels[n].delayDisconnect) channels[n].step();
      }
      if (!cpu.stopped || cpu.pendingExchange) {
        const target = this.time * 10;
        if (cpu.cycles < target - 10) cpu.cycles = target - 10;
        while (cpu.cycles < target) {
          if (!cpu.wordValid && cpuBp.size && !cpu.stopped && cpuBp.has(cpu.absolute(cpu.P)) && !cpu.skipBreak) {
            cpu.skipBreak = true;
            return { reason: 'breakpoint', address: cpu.P };
          }
          cpu.skipBreak = false;
          const wasRunning = !cpu.stopped;
          cpu.step();
          if (this.stopRequest) return this.stopRequest;
          if (cpu.stopped) {
            if (wasRunning && stopOnCpuStop) return { reason: 'cpustop', error: cpu.lastError, P: cpu.P };
            if (!cpu.pendingExchange) break;
          }
        }
        if (cpu.stopped) cpu.cycles = target;
      } else {
        cpu.cycles = this.time * 10;
      }
      if (this.stopRequest) return this.stopRequest;
    }
    return null;
  }

  /** Exécute une seule instruction CPU (pas à pas). */
  stepCPU() {
    const r = this.cpu.step();
    this.time = Math.max(this.time, Math.ceil(this.cpu.cycles / 10));
    return r;
  }

  /** Exécute une instruction d'un PP (pas à pas). */
  stepPP(n) {
    const pp = this.pps[n];
    let guard = 0;
    do {
      pp.step();
      guard++;
    } while (pp.busy && !pp.hungOn && guard < 100000);
    this.time++;
  }

  /** Vue d'ensemble pour l'IDE. */
  status() {
    const cpu = this.cpu;
    return {
      time: this.time,
      model: MODELS[cpu.model].name,
      cpu: {
        P: cpu.P, RA: cpu.RA, FL: cpu.FL, EM: cpu.EM, RAE: cpu.RAE, FLE: cpu.FLE, MA: cpu.MA,
        X: cpu.X.slice(), A: cpu.A.slice(), B: cpu.B.slice(), stopped: cpu.stopped,
        monitor: cpu.monitorMode, instructions: cpu.instructions, cycles: cpu.cycles,
        exitCondition: cpu.exitCondition, lastError: cpu.lastError, parcel: cpu.parcel,
      },
      pps: this.pps.map((p) => p.snapshot()),
      channels: this.channels.map((ch) => ({
        id: ch.id, active: ch.active, full: ch.full, data: ch.data,
        device: ch.ioDevice ? ch.ioDevice.name : null, devices: ch.devices.map((d) => d.name),
      })),
    };
  }
}
