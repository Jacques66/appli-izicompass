import test from 'node:test';
import assert from 'node:assert/strict';
import { Machine } from '../src/machine.js';
import { Runner, RunController, DEMO_DEADSTART, describeStop } from '../src/runtime/runner.js';
import { toNumber, fromNumber } from '../src/cpu/float.js';

const w60 = (s) => BigInt('0o' + s.replace(/ /g, ''));

/** Fake assembly result (shape of the docs/API.md contract). */
function fakeResult(program, lines = []) {
  const p = { entries: [], externals: [], ...program };
  if (!p.overlays && p.image) p.overlays = [{ name: p.name, origin: p.image.start, entry: p.entry, words: p.image.words }];
  return { ok: true, errors: [], listing: '', lines, symbols: [], programs: [p] };
}

/** Synchronous scheduler to drive RunController without a browser. */
function manualScheduler() {
  const queue = [];
  let t = 0;
  return {
    hooks: {
      schedule: (fn) => { queue.push(fn); return queue.length; },
      cancel: () => { queue.length = 0; },
      now: () => (t += 1),
    },
    pump(max = 1000) {
      let n = 0;
      while (queue.length && n++ < max) queue.shift()();
      return n;
    },
  };
}

// CPU program: SX6 5 / SA6 100B / PS, then a loop on B.
const CPU_PROG = {
  name: 'TEST', type: 'abs', machine: '6', origin: 0, entry: 0, length: 2,
  image: { start: 0, words: [w60('71600 00005 51600 00100'), w60('00000 00000 00000 00000')] },
};

test('bare CPU mode: absolute load at RA, execution up to PS', async () => {
  const m = new Machine({ ecsWords: 0 });
  const r = new Runner(m, { ra: 0o1000, em: 0 });
  const res = await r.load(fakeResult(CPU_PROG));
  assert.equal(res.ok, true);
  assert.equal(res.mode, 'cpu');
  assert.equal(m.cpu.RA, 0o1000);
  assert.equal(m.cm[0o1000], CPU_PROG.image.words[0]);
  const s = manualScheduler();
  let stopped = null;
  const c = new RunController(r, { ...s.hooks, onStop: (stop, text) => { stopped = { stop, text }; } });
  c.ready();
  c.run();
  s.pump();
  assert.ok(stopped, 'stop expected');
  assert.equal(stopped.stop.reason, 'cpustop');
  assert.equal(stopped.text, 'Program stop (PS)');
  assert.equal(m.cm[0o1100], 5n);
  assert.equal(c.state, 'stopped');
});

test('bare CPU mode: relocatable program placed at RA+100B without a loader', async () => {
  const m = new Machine({ ecsWords: 0 });
  const r = new Runner(m, { ra: 0, em: 0, mode: 'cpu' });
  const prog = { ...CPU_PROG, type: 'reloc', origin: 0, entry: 'GO', entries: [{ name: 'GO', value: 0 }] };
  const res = await r.load(fakeResult(prog), { useLoader: false });
  assert.equal(res.ok, true);
  assert.equal(m.cpu.P, 0o100);
  assert.equal(m.cm[0o100], CPU_PROG.image.words[0]);
  assert.equal(r.base, 0o100);
  const stop = m.run(100, { stopOnCpuStop: true });
  assert.equal(stop.reason, 'cpustop');
  assert.equal(m.cm[0o100], 5n); // SA6 100B (relative to RA = 0) overwrites the first word of the program
});

test('bare CPU mode: error exit reported with the CPU message', async () => {
  const m = new Machine({ ecsWords: 0 });
  const r = new Runner(m, { ra: 0o200, fl: 0o100, em: 0o010000 });
  const prog = { ...CPU_PROG, image: { start: 0, words: [w60('51100 07777 46000 46000')] } };
  await r.load(fakeResult(prog));
  const s = manualScheduler();
  let text = '';
  const c = new RunController(r, { ...s.hooks, onStop: (_s, t) => { text = t; } });
  c.ready();
  c.run();
  s.pump();
  assert.match(text, /^Error exit: read out of range/);
});

test('breakpoints by source line and address -> line mapping', async () => {
  const m = new Machine({ ecsWords: 0 });
  const r = new Runner(m, { ra: 0o400, em: 0 });
  // 0: SB1 10B ; SB2 0     1: SB2 B2+1 ; NE B1,B2,1     2: SX6 B2 ; SA6 20B (+NO)  3: PS
  const prog = {
    name: 'LOOP', type: 'abs', origin: 0, entry: 0, length: 4,
    image: {
      start: 0,
      words: [w60('61100 00010 61200 00000'), w60('61220 00001 05120 00001'), w60('76620 51600 00020 46000'), 0n],
    },
  };
  const lines = [
    { line: 3, file: 'LOOP', address: 0, parcel: 0, octal: ['6110000010'] },
    { line: 4, file: 'LOOP', address: 0, parcel: 2, octal: ['6120000000'] },
    { line: 5, file: 'LOOP', address: 1, parcel: 0, octal: ['6122000001'] },
    { line: 6, file: 'LOOP', address: 1, parcel: 2, octal: ['0512000001'] },
    { line: 7, file: 'LOOP', address: 2, parcel: 0, octal: ['76620'] },
    { line: 9, file: 'LOOP', address: 3, parcel: 0, octal: ['00000'] },
  ];
  await r.load(fakeResult(prog, lines), { fileName: 'LOOP' });
  const bp = r.setSourceBreakpoints([5, 42]);
  assert.deepEqual(bp.unresolved, [42]);
  assert.ok(m.cpuBreakpoints.has(0o401));
  assert.equal(r.lineOfAddress(1, 2), 6);
  assert.equal(r.lineOfAddress(1, 0), 5);

  const s = manualScheduler();
  const stops = [];
  const c = new RunController(r, { ...s.hooks, onStop: (stop) => stops.push(stop) });
  c.ready();
  c.run();
  s.pump();
  assert.equal(stops[0].reason, 'breakpoint');
  assert.equal(r.currentLocation().line, 5);
  assert.equal(c.state, 'paused');
  // CPU step: one instruction.
  const n = m.cpu.instructions;
  c.stepCPU();
  assert.equal(m.cpu.instructions, n + 1);
  assert.equal(r.currentLocation().line, 6);
  // Without breakpoints, the loop runs to completion.
  r.setSourceBreakpoints([]);
  c.run();
  s.pump();
  assert.equal(stops.at(-1).reason, 'cpustop');
  assert.equal(m.cm[0o420], 0o10n);
});

test('PP mode: hand-assembled 6612 console program', async () => {
  const m = new Machine({ ecsWords: 0 });
  const r = new Runner(m, { ppNumber: 1 });
  // 100 FNC 7000B,10B / 102 ACN 10B / 103 LDN 5 / 104 OAM 110B,10B / 106 DCN 10B / 107 UJN 100B
  // 110 6200 7400 "HELLO" (1005 1414 1755)
  const words = [0o7710, 0o7000, 0o7410, 0o1405, 0o7310, 0o0110, 0o7510, 0o0370, 0o6200, 0o7400, 0o1005, 0o1414, 0o1755];
  const prog = { name: 'CON', type: 'pp', origin: 0o100, entry: 0o100, length: words.length, image: { start: 0o100, words } };
  const res = await r.load(fakeResult(prog));
  assert.equal(res.ok, true);
  assert.equal(res.mode, 'pp');
  assert.equal(m.pps[1].P, 0o100);
  const s = manualScheduler();
  const c = new RunController(r, s.hooks);
  c.setSpeed(5000);
  c.ready();
  c.run();
  s.pump(3);
  c.pause();
  const vis = m.console.visible(m.time);
  const text = vis.filter((e) => e.y === 0o400).slice(0, 6).map((e) => ':ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-*/()$= ,.'[e.c]).join('');
  assert.equal(text, 'HELLO ');
  assert.equal(vis[0].x, 0o200);
  assert.equal(vis[0].s, 0);
  // PP step
  const p0 = m.pps[1].instructions;
  c.stepPP(1);
  assert.equal(m.pps[1].instructions, p0 + 1);
  // The other PPs are idle.
  assert.equal(m.pps[0].busy, true);
  assert.equal(m.pps[8].stopped, true); // channel 10B used by the console
});

test('deadstart mode: demonstration panel shown on the console', async () => {
  const m = new Machine({ ecsWords: 0 });
  const r = new Runner(m, { mode: 'deadstart' });
  const res = await r.load(null);
  assert.equal(res.ok, true);
  assert.equal(res.mode, 'deadstart');
  m.run(20000);
  const vis = m.console.visible(m.time);
  const chars = vis.filter((e) => e.y === 0o400).slice(0, 8).map((e) => ':ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-*/()$= ,.'[e.c]).join('');
  assert.equal(chars, 'CDC 6600');
  assert.equal(vis[0].sz, 1);
  assert.equal(DEMO_DEADSTART.length <= 16, true);
});

test('PP breakpoint by source line', async () => {
  const m = new Machine({ ecsWords: 0 });
  const r = new Runner(m);
  // 100 LDN 3 / 101 ADN 1 / 102 UJN 101B
  const words = [0o1403, 0o1601, 0o0376];
  const prog = { name: 'BP', type: 'pp', origin: 0o100, entry: 0o100, length: 3, image: { start: 0o100, words } };
  const lines = [
    { line: 4, file: 'BP', address: 0o100, octal: ['1403'] },
    { line: 5, file: 'BP', address: 0o101, octal: ['1601'] },
    { line: 6, file: 'BP', address: 0o102, octal: ['0376'] },
  ];
  await r.load(fakeResult(prog, lines), { fileName: 'BP' });
  r.setSourceBreakpoints([6]);
  const stop = m.run(1000);
  assert.equal(stop.reason, 'ppbreak');
  assert.equal(stop.address, 0o102);
  assert.equal(r.currentLocation().line, 6);
  assert.match(describeStop(stop), /PP00/);
});

test('max speed: slice bounded in real time, correct floating point', async () => {
  const m = new Machine({ ecsWords: 0 });
  const r = new Runner(m, { em: 0 });
  // 0: SA1 20B ; SA2 21B   1: FX6 X1*X2 NO NO NO   2: SA6 22B ; PS
  const prog = {
    name: 'FLT', type: 'abs', origin: 0, entry: 0, length: 0o23,
    image: { start: 0, words: [w60('51100 00020 51200 00021'), w60('40612 46000 46000 46000'), w60('51600 00022 00000 00000')] },
  };
  await r.load(fakeResult(prog));
  m.cm[0o20] = fromNumber(1.5);
  m.cm[0o21] = fromNumber(-3);
  const s = manualScheduler();
  let stop = null;
  const c = new RunController(r, { ...s.hooks, onStop: (x) => { stop = x; } });
  c.setSpeed(1, true);
  c.ready();
  c.run();
  s.pump();
  assert.equal(stop.reason, 'cpustop');
  assert.equal(toNumber(m.cm[0o22]), -4.5);
});

// --------------------------------------------- IDE examples (real assembler)

import fs from 'node:fs';
import { assemble } from '../src/asm/compass.js';

const EX = new URL('../ide/examples/', import.meta.url);
const exText = (f) => fs.readFileSync(new URL(f, EX), 'utf8');
const DISPLAY64 = ':ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-*/()$= ,.#[]%"_!&\'?<>@\^;';

async function runExample(file, { us = 200000, setup = null, opts = {} } = {}) {
  const name = file.replace(/\..*/, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const r = assemble(exText(file), { fileName: name, texts: { DEFS6612: exText('defs6612.txt') } });
  assert.equal(r.errors.length, 0, `${file} : ${r.errors.map((e) => `${e.line} ${e.message}`).join(' ; ')}`);
  const m = new Machine({ ecsWords: 0 });
  const runner = new Runner(m, { em: 0o070000, ...opts });
  if (setup) setup(m);
  const res = await runner.load(r, { fileName: name });
  assert.equal(res.ok, true, res.message);
  const stop = m.run(us, runner.kind === 'cpu' ? { stopOnCpuStop: true, cpuOnly: true } : {});
  const sym = (n) => r.symbols.find((s) => s.name === n).value;
  return { r, m, runner, stop, sym };
}

/** Text lines visible on a console screen (grouped by Y). */
function screenText(m, screen) {
  const byY = new Map();
  for (const e of m.console.visible(m.time)) {
    if (e.s !== screen || e.c < 0) continue;
    const k = `${e.y}`;
    if (!byY.has(k)) byY.set(k, new Map());
    byY.get(k).set(e.x, DISPLAY64[e.c]);
  }
  return [...byY.entries()].sort((a, b) => b[0] - a[0]).map(([, xs]) => [...xs.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]).join('').trimEnd());
}

test('cpu-count example: octal counting readable in memory (bare CPU)', async () => {
  const { m, stop, runner } = await runExample('cpu-count.cmp');
  assert.equal(runner.kind, 'cpu');
  assert.equal(stop.reason, 'cpustop');
  assert.equal(stop.error, null);
  for (let n = 0; n < 0o100; n++) assert.equal(m.cm[0o1000 + n], BigInt(n));
  for (let k = 0; k < 20; k++) assert.equal(m.cm[0o1100 + k], 1n << BigInt(3 * k));
  for (let w = 0; w < 4; w++) assert.equal(m.cm[0o1124 + w].toString(8).padStart(20, '0'), '01234567012345670123');
  const text = [...Array(10)].map((_, i) => DISPLAY64[Number((m.cm[0o1130] >> BigInt(54 - 6 * i)) & 63n)]).join('');
  assert.equal(text, 'COUNT DONE');
});

/** Runs an example as a job of the mini-system; returns the dayfile and the printer text. */
async function runJob(file) {
  const name = file.replace(/\..*/, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const r = assemble(exText(file), { fileName: name });
  assert.equal(r.errors.length, 0, `${file} : ${r.errors.map((e) => `${e.line} ${e.message}`).join(' ; ')}`);
  const m = new Machine({ ecsWords: 0 });
  const runner = new Runner(m, { mode: 'auto' });
  assert.equal(runner.resolveMode(r), 'system');
  const res = await runner.load(r, { fileName: name });
  assert.equal(res.ok, true, res.message);
  const s = manualScheduler();
  let stop = null;
  const c = new RunController(runner, { ...s.hooks, onStop: (x) => { stop = x; } });
  c.setSpeed(1, true);
  c.ready();
  c.run();
  s.pump(20000);
  assert.equal(stop && stop.reason, 'jobend');
  return { dayfile: runner.dayfile(), printer: m.printer.text().split('\n') };
}

test('cpu-sum example: sum, squares and factorial printed and shown', async () => {
  const { dayfile, printer } = await runJob('cpu-sum.cmp');
  const lines = ['SUM OF 1 TO 10    =        55', 'SUM OF SQUARES    =       385', 'FACTORIAL OF 10   =   3628800'];
  assert.deepEqual(printer, ['SUM, SQUARES AND FACTORIAL OF 1 TO 10', ...lines]);
  assert.deepEqual(dayfile, [...lines.map((l) => ' ' + l), ' NORMAL END OF JOB.']);
});

test('cpu-float example: square root of 2 and partial zeta(2) in decimal', async () => {
  const { dayfile, printer } = await runJob('cpu-float.cmp');
  let z = 0;
  for (let k = 100; k >= 1; k--) z += 1 / (k * k);
  const lines = [`SQUARE ROOT OF 2 = ${Math.SQRT2.toFixed(8)}`, `SUM OF 1/K**2    = ${z.toFixed(8)}`];
  assert.deepEqual(printer, ['SQUARE ROOT OF 2 AND SUM OF 1/K**2', ...lines]);
  assert.deepEqual(dayfile, [...lines.map((l) => ' ' + l), ' NORMAL END OF JOB.']);
});

test('cpu-text example: copy of the message and letter count', async () => {
  const { dayfile, printer } = await runJob('cpu-text.cmp');
  const msg = 'HELLO FROM THE CDC 6600, THE FIRST SUPERCOMPUTER.';
  const letters = String(msg.replace(/[^A-Z]/g, '').length).padStart(10);
  assert.deepEqual(printer, [msg, `LETTERS IN TEXT   =${letters}`, 'WORDS OF 10 CHARS =         5']);
  assert.equal(dayfile.length, 3);
});

test('cpu-sort example: table printed before and after the sort', async () => {
  const { dayfile, printer } = await runJob('cpu-sort.cmp');
  const row = (head, v) => head + v.map((x) => String(x).padStart(10)).join('');
  assert.deepEqual(printer, [
    row('BEFORE:  ', [27, 3, -14, 1966, 0, 42, 7, -1, 600, 64]),
    row('AFTER:   ', [-14, -1, 0, 3, 7, 27, 42, 64, 600, 1966]),
    'SMALLEST        -14 LARGEST        1966',
  ]);
  assert.deepEqual(dayfile, [' SMALLEST        -14 LARGEST        1966', ' NORMAL END OF JOB.']);
});

test('macros example: macros, DUP, ECHO, IF and the printing macro', async () => {
  const { dayfile, printer } = await runJob('macros.cmp');
  assert.deepEqual(printer, [
    'COMPASS DEMONSTRATION V1.2',
    'FIVE =            5', 'DOUBLE =         16', 'BIG =             1',
    'SQUARES: ' + [1, 4, 9, 16, 25, 36, 49, 64].map((x) => String(x).padStart(10)).join(''),
    'NAMES:   ALPHA     BETA      GAMMA',
  ]);
  assert.deepEqual(dayfile, [' FIVE =            5', ' DOUBLE =         16', ' BIG =             1', ' NORMAL END OF JOB.']);
});

test('pp-console example: screens and keyboard', async () => {
  const { m } = await runExample('pp-console.cmp', { us: 30000 });
  assert.equal(screenText(m, 0)[0], 'CDC 6600 - 6612 CONSOLE');
  for (const k of 'HELLO') m.console.keyPress(k);
  m.run(60000);
  m.console.keyPress('Backspace');
  m.run(60000);
  const right = screenText(m, 1);
  assert.equal(right[0], 'INPUT:');
  assert.equal(right[1], 'HELL');
});

test('pp-printer example: table of squares', async () => {
  const { m } = await runExample('pp-printer.cmp', { us: 200000 });
  const out = m.printer.output.filter((l) => l !== '\f');
  assert.equal(out[0], 'CDC 6600 - 1612 LINE PRINTER - SQUARES IN OCTAL');
  assert.equal(out[2], 'N = 0001  N*N = 0001');
  assert.equal(out[11], 'N = 0012  N*N = 0144');
  assert.equal(out.at(-1), 'END OF LIST.');
});

test('pp-cards example: deck read and displayed', async () => {
  const { m } = await runExample('pp-cards.cmp', {
    us: 300000,
    setup: (mm) => mm.cardReader.loadDeck('HELLO WORLD 123\nA+B=(C*D)/E. $5,\n7/8/9\nIGNORED'),
  });
  const left = screenText(m, 0);
  assert.equal(left[0], '405 CARD READER - DECK CONTENTS');
  assert.equal(left[1], 'HELLO WORLD 123');
  assert.equal(left[2], 'A+B=(C*D)/E. $5,');
  assert.equal(left.length, 3);
});

test('pp-clock example: XTEXT and clock', async () => {
  const { m } = await runExample('pp-clock.cmp', { us: 50000 });
  const left = screenText(m, 0);
  assert.equal(left[0], 'REAL-TIME CLOCK (CHANNEL 14B)');
  assert.match(left[1], /^[0-7]{8}$/);
  assert.ok(parseInt(left[1], 8) > 30000);
});

test('System mode: relocatable job, dayfile and line printer (sys-hello example)', async () => {
  const r = assemble(exText('sys-hello.cmp'), { fileName: 'SYSHELLO' });
  assert.equal(r.errors.length, 0);
  const m = new Machine({ ecsWords: 0 });
  const runner = new Runner(m, { mode: 'auto' });
  assert.equal(runner.resolveMode(r), 'system');
  const res = await runner.load(r, { fileName: 'SYSHELLO' });
  assert.equal(res.ok, true, res.message);
  assert.equal(runner.kind, 'system');
  assert.equal(runner.ra, 0o2000);
  const s = manualScheduler();
  let stop = null, text = '';
  const c = new RunController(runner, { ...s.hooks, onStop: (x, t) => { stop = x; text = t; } });
  c.setSpeed(1, true);
  c.ready();
  c.run();
  s.pump(5000);
  assert.equal(stop.reason, 'jobend');
  assert.equal(text, 'Normal end of job');
  assert.deepEqual(runner.dayfile(), ['HELLO FROM THE 6600', ' NORMAL END OF JOB.']);
  assert.equal(m.printer.text(), 'FIRST LINE\n NUMBER =     12345');
});

test('System mode: line breakpoint in a relocatable program', async () => {
  const r = assemble(exText('sys-copy.cmp'), { fileName: 'SYSCOPY' });
  assert.equal(r.errors.length, 0);
  const m = new Machine({ ecsWords: 0 });
  const ex = JSON.parse(exText('index.json')).find((e) => e.file === 'sys-copy.cmp');
  m.cardReader.loadDeck(ex.cards);
  const runner = new Runner(m, { mode: 'system' });
  await runner.load(r, { fileName: 'SYSCOPY' });
  const line = exText('sys-copy.cmp').split('\n').findIndex((l) => l.startsWith(' COPY2')) + 1;
  const bp = runner.setSourceBreakpoints([line]);
  assert.equal(bp.unresolved.length, 0);
  let stop = null;
  for (let t = 0; t < 3_000_000 && !stop; t += 10000) stop = m.run(10000);
  assert.equal(stop && stop.reason, 'breakpoint');
  assert.equal(runner.currentLocation().line, line);
  runner.setSourceBreakpoints([]);
  for (let t = 0; t < 3_000_000 && runner.jobStatus() === 'run'; t += 10000) m.run(10000);
  assert.equal(runner.jobStatus(), 'end');
  assert.match(m.printer.output.at(-1), /CARDS:\s+3/);
});

test('System mode (tape deadstart): bootstrap from the tape, then end of job', async () => {
  const r = assemble(exText('sys-hello.cmp'), { fileName: 'SYSHELLO' });
  const m = new Machine({ ecsWords: 0 });
  const runner = new Runner(m, { mode: 'systape' });
  const res = await runner.load(r, { fileName: 'SYSHELLO' });
  assert.equal(res.ok, true, res.message);
  assert.equal(res.mode, 'systape');
  assert.ok(m.tapes.units[0].records.length >= 3);
  assert.ok(m.tapes.units[0].toTap().length > 100);
  const s = manualScheduler();
  let stop = null;
  const c = new RunController(runner, { ...s.hooks, onStop: (x) => { stop = x; } });
  c.setSpeed(1, true);
  c.ready();
  c.run();
  s.pump(20000);
  assert.equal(stop && stop.reason, 'jobend');
  assert.equal(stop.status, 'end');
  assert.equal(m.printer.text(), 'FIRST LINE\n NUMBER =     12345');
});
