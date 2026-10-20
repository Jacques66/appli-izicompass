// Lance un programme sous le mini-système et affiche journal et imprimante.
import { readFileSync } from 'node:fs';
import { assemble } from '../src/asm/compass.js';
import { Machine } from '../src/machine.js';
import { startJob, jobStatus, dayfile } from '../src/os/system.js';
const src = readFileSync(process.argv[2], 'utf8');
const r = assemble(src);
for (const e of r.errors) console.log('ERR', e.line, e.flag, e.message);
const m = new Machine({ ecsWords: 0 });
if (process.argv[3]) m.cardReader.loadDeck(readFileSync(process.argv[3], 'utf8'));
const st = startJob(m, r.programs, { name: 'TEST' });
console.log('start', st.ok, st.errors, 'entry', st.entry?.toString(8), 'fl', st.fl?.toString(8));
let t = 0;
while (jobStatus(m) === 'run' && t < 2_000_000) { m.run(10000); t += 10000; }
console.log('status', jobStatus(m), 'time µs', m.time, 'cpu instr', m.cpu.instructions, 'P', m.cpu.P.toString(8), m.cpu.lastError || '');
console.log('--- journal'); for (const l of dayfile(m)) console.log(l);
console.log('--- imprimante'); console.log(m.printer.text());
console.log('--- console', m.console.trace.length);
const vis = m.console.visible(m.time, 30000);
for (const scr of [0, 1]) {
  const rows = new Map();
  for (const e of vis.filter((v) => v.s === scr)) {
    if (!rows.has(e.y)) rows.set(e.y, new Map());
    rows.get(e.y).set(e.x, e.c);
  }
  console.log(`--- écran ${scr ? 'droit' : 'gauche'}`);
  for (const y of [...rows.keys()].sort((a, b) => b - a)) {
    const r = rows.get(y);
    let s = '';
    for (const x of [...r.keys()].sort((a, b) => a - b)) s = s.padEnd(Math.floor(x / 8)) + ':ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-*/()$= ,.#[]%"_!&\'?<>@\^;'[r.get(x)];
    console.log(String(y).padStart(4), s.replace(/:/g, ' '));
  }
}
