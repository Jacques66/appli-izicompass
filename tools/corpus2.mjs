import { readFileSync } from 'node:fs';
import { assemble } from '../src/asm/compass.js';
const [file, name, flagsWanted] = process.argv.slice(2);
const sections = readFileSync(file, 'latin1').split(/\n~eor\n?/);
for (const sec of sections) {
  const m = /^\s+IDENT\s+(\w+)/m.exec(sec);
  if (!m || m[1] !== name) continue;
  const lines = sec.split('\n');
  const r = assemble(sec);
  const seen = new Set();
  for (const e of r.errors) {
    if (flagsWanted && !flagsWanted.includes(e.flag)) continue;
    const k = e.flag + e.detail;
    if (seen.has(k) && seen.size > 40) continue;
    seen.add(k);
    console.log(e.line, e.flag, e.detail, '|', (lines[e.line - 1] || '').slice(0, 72));
  }
}
