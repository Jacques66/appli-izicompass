#!/usr/bin/env node
// cdc6600: assembles and runs a program on the emulator.
//
//   node cli/cdc6600.js SOURCE... [options]
//     --mode system|deadstart|cpu|pp   execution mode (default: system for CPU,
//                             pp for PP; deadstart = real deadstart from the tape)
//     --cards FILE            card deck for the 405 card reader (INPUT file)
//     --model 6600|6400|6600CEJ|cyber73|cyber173|cyber175
//     --time US               maximum simulated time (µs, default 10000000)
//     --trace                 trace CPU instructions
//     --console               show the contents of the console screens
//     --help                  show this help

import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { assemble } from '../src/asm/compass.js';
import { Machine } from '../src/machine.js';
import { linkAndLoad, loadPP } from '../src/loader/loader.js';
import { startJob, deadstartJob, jobStatus, dayfile } from '../src/os/system.js';
import { disasmWord } from '../src/cpu/disasm.js';
import { DISPLAY } from '../src/common/charset.js';

const args = process.argv.slice(2);
const opt = { mode: null, cards: null, model: '6600', time: 10_000_000, trace: false, console: false };
// Former French spelling, still accepted.
const MODE_ALIASES = { systeme: 'system' };
const files = [];
let help = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--help' || a === '-h') help = true;
  else if (a === '--mode') { const v = args[++i]; opt.mode = MODE_ALIASES[v] || v; }
  else if (a === '--cards') opt.cards = args[++i];
  else if (a === '--model') opt.model = args[++i];
  else if (a === '--time') opt.time = Number(args[++i]);
  else if (a === '--trace') opt.trace = true;
  else if (a === '--console') opt.console = true;
  else files.push(a);
}
if (help || !files.length) {
  console.log([
    'usage: cdc6600 SOURCE... [options]',
    'Assembles the COMPASS SOURCE files and runs them on the emulator.',
    '',
    '  --mode system|deadstart|cpu|pp  execution mode (default: system for a CPU',
    '                                  program, pp for a PP program; deadstart =',
    '                                  real deadstart from the system tape)',
    '  --cards FILE                    card deck for the 405 card reader (INPUT file)',
    '  --model M                       6600|6400|6600CEJ|cyber73|cyber173|cyber175',
    '  --time US                       maximum simulated time (µs, default 10000000)',
    '  --trace                         trace CPU instructions (cpu mode)',
    '  --console                       show the contents of the console screens',
    '  --help                          show this help',
  ].join('\n'));
  process.exit(0);
}
const programs = [];
let fatal = false;
for (const f of files) {
  const r = assemble(readFileSync(f, 'latin1'), { fileName: basename(f, extname(f)).toUpperCase() });
  for (const e of r.errors) {
    if (e.fatal) fatal = true;
    console.error(`${f}:${e.line}: ${e.flag} ${e.message}`);
  }
  programs.push(...r.programs);
}
if (fatal) process.exit(1);
const m = new Machine({ model: opt.model });
if (opt.cards) m.cardReader.loadDeck(readFileSync(opt.cards, 'latin1'));
m.printer.onLine = (l) => process.stdout.write((l === '\f' ? '\n--- page eject ---' : l) + '\n');
const isPP = programs.every((p) => p.type === 'pp');
const mode = opt.mode || (isPP ? 'pp' : 'system');
const t0 = Date.now();
if (mode === 'pp') {
  for (let n = 0; n < m.pps.length; n++) m.stopPP(n);
  programs.forEach((p, n) => { loadPP(m, p, n); m.startPP(n, p.entry); });
  m.run(opt.time);
} else if (mode === 'cpu') {
  const ld = linkAndLoad(m, programs, { ra: 0 });
  if (ld.errors.length) { console.error(ld.errors.join('\n')); process.exit(1); }
  m.startCPU({ P: ld.entry, FL: ld.fl, EM: 0o070000 });
  let left = opt.time;
  while (left > 0 && !m.cpu.stopped) {
    if (opt.trace) {
      const c = m.cpu;
      const w = m.cm[c.absolute(c.P)];
      const ins = disasmWord(w).find((x) => x.parcel === c.parcel);
      console.log(`${c.P.toString(8).padStart(6, '0')}.${c.parcel}  ${ins ? ins.text : ''}`);
      m.stepCPU();
      left--;
    } else {
      m.run(Math.min(left, 100000), { stopOnCpuStop: true });
      left -= 100000;
    }
  }
  const c = m.cpu;
  console.log(`CPU stopped: P=${c.P.toString(8)}B ${c.lastError || ''}`);
  for (let i = 0; i < 8; i++) console.log(`X${i} ${c.X[i].toString(8).padStart(20, '0')}   A${i} ${c.A[i].toString(8).padStart(6, '0')}   B${i} ${c.B[i].toString(8).padStart(6, '0')}`);
} else {
  const start = mode === 'deadstart' ? deadstartJob : startJob;
  const st = start(m, programs, { name: basename(files[0], extname(files[0])) });
  if (!st.ok) { console.error(st.errors.join('\n')); process.exit(1); }
  let t = 0;
  // in deadstart mode the status stays "none" until the tape has loaded memory
  while ((jobStatus(m) === 'run' || (mode === 'deadstart' && jobStatus(m) === 'none')) && t < opt.time) { m.run(20000); t += 20000; }
  console.log('\n--- dayfile');
  for (const l of dayfile(m)) console.log(l);
  console.log(`--- status: ${jobStatus(m)}`);
}
const dt = (Date.now() - t0) / 1000;
console.log(`--- ${m.time} simulated µs, ${m.cpu.instructions} CPU instructions, ${dt.toFixed(2)} s (${(m.cpu.instructions / dt / 1e6).toFixed(2)} MIPS)`);
if (opt.console) {
  const vis = m.console.visible(m.time, 40000);
  for (const scr of [0, 1]) {
    const rows = new Map();
    for (const e of vis.filter((v) => v.s === scr)) {
      if (!rows.has(e.y)) rows.set(e.y, new Map());
      rows.get(e.y).set(e.x, e.c);
    }
    console.log(`--- ${scr ? 'right' : 'left'} screen`);
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      let s = '';
      const r = rows.get(y);
      for (const x of [...r.keys()].sort((a, b) => a - b)) s = s.padEnd(Math.floor(x / 8)) + (r.get(x) ? DISPLAY[r.get(x)] : ' ');
      console.log(s);
    }
  }
}
