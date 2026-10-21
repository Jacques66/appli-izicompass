// Complete CDC 6600 machine: central memory, ECS, CPU, PPs, channels, peripherals.
//
// Time: the `time` clock counts major cycles (1 µs). In each major cycle,
// each PP in the barrel gets one slot, and the CPU executes up to
// ten minor cycles (100 ns).

import { Cpu, MODELS } from './cpu/cpu.js';
import { Pp } from './pp/pp.js';
import { Channel } from './io/channel.js';
import {
  DeadstartPanel, Console6612, CardReader405, LinePrinter1612, TapeDrive607, Tape, RealTimeClock, Disk6603,
} from './io/devices.js';

export const DEFAULT_CONFIG = {
  model: '6600',
  cmWords: 0o400000,     // 131072 words
  ecsWords: 0o400000,    // ECS of 131072 words
  ppCount: 10,
  channels: 0o20,
  consoleChannel: 0o10,
  unitRecordChannel: 0o12, // card reader 405 + line printer 1612
  tapeChannel: 0o13,      // tape units 607 and disk 6603
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
    this.cpuBreakpoints = new Set();   // absolute word addresses
    this.ppBreakpoints = new Map();    // pp -> Set(address)
    this.watchpoints = new Set();      // absolute CM addresses watched for writes
    this.stopRequest = null;
    this.writeHook = null;

    // Peripherals
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
    this.disk = new Disk6603();
    this.channels[c.tapeChannel].attach(this.disk);
    this.clock = new RealTimeClock(this);
    if (c.clockChannel < c.channels) this.clock.attachTo(this.channels[c.clockChannel]);
  }

  // ----------------------------------------------------------------- memory

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
   * Deadstart: every PP executes an IAM 10000B on its channel at P = 0;
   * the panel sends its words on channel 0, loaded into PP0 from location 1;
   * PP0 then starts at 1. The other PPs wait to be loaded by PP0.
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

  /** Loads a program directly into a PP's memory. */
  loadPP(n, words, origin = 0) {
    const pp = this.pps[n];
    for (let i = 0; i < words.length; i++) pp.mem[(origin + i) & 0o7777] = words[i] & 0o7777;
  }

  /** Starts a PP at the given address (outside the deadstart sequence). */
  startPP(n, address) {
    const pp = this.pps[n];
    pp.reset();
    pp.P = address & 0o7777;
  }

  /** Stops a PP (it no longer executes anything). */
  stopPP(n) {
    const pp = this.pps[n];
    pp.reset();
    pp.stopped = true;
  }

  /** Puts a PP in wait for a load on its channel (deadstart state). */
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
   * Prepares the CPU to execute a program: builds an exchange package
   * at `xpAddress` and loads it.
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

  // -------------------------------------------------------------- execution

  /**
   * Executes `us` simulated microseconds. Returns null or the stop reason:
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

  /** Executes a single CPU instruction (step). */
  stepCPU() {
    const r = this.cpu.step();
    this.time = Math.max(this.time, Math.ceil(this.cpu.cycles / 10));
    return r;
  }

  /** Executes one instruction of a PP (step). */
  stepPP(n) {
    const pp = this.pps[n];
    let guard = 0;
    do {
      pp.step();
      guard++;
    } while (pp.busy && !pp.hungOn && guard < 100000);
    this.time++;
  }

  /** Overview for the IDE. */
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
