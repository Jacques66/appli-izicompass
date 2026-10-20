import { readFileSync } from 'node:fs';
import { assemble } from '../src/asm/compass.js';
const r = assemble(readFileSync(process.argv[2], 'utf8'), { debug: true, fileName: 'T' });
console.log(r.listing);
for (const e of r.errors) console.log('ERR', e.line, e.flag, e.message);
for (const p of r.programs) console.log(p.type, p.name, 'origin', p.origin.toString(8), 'entry', String(p.entry), 'len', p.length);
