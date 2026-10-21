// Assembles the COMPASS programs extracted from NOS jobs (test corpus).
import { readFileSync } from 'node:fs';
import { assemble } from '../src/asm/compass.js';
const file = process.argv[2];
const text = readFileSync(file, 'latin1');
const sections = text.split(/\n~eor\n?/);
const counts = {};
const internal = [];
let progs = 0;
for (const sec of sections) {
  if (!/^\s+IDENT\s/m.test(sec)) continue;
  progs++;
  const t0 = Date.now();
  let r;
  try { r = assemble(sec, { fileName: 'SEC' }); } catch (e) { internal.push('CRASH ' + e.stack.split('\n').slice(0,4).join(' | ')); continue; }
  for (const e of r.errors) {
    counts[e.flag] = (counts[e.flag] || 0) + 1;
    if (/intern(e|al)/.test(e.message)) internal.push(e.line + ' ' + e.message);
  }
  const ms = Date.now() - t0;
  console.log(r.programs.map((p) => `${p.name}:${p.type}:${p.length}`).join(' '), 'errors', r.errors.length, ms + 'ms');
}
console.log('programs', progs, 'errors by flag', counts);
console.log(internal.slice(0, 30).join('\n'));
