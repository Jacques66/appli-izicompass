import { assemble } from '../src/asm/compass.js';
const mod = await import('../src/os/' + process.argv[2] + '.js');
const src = mod[process.argv[3]];
const r = assemble(src, { fileName: process.argv[3] });
if (process.argv[4]) console.log(r.listing);
for (const e of r.errors) console.log('ERR', e.line, e.flag, e.message, '|', src.split('\n')[e.line - 1]);
for (const p of r.programs) console.log(p.type, p.name, 'origin', p.origin.toString(8), 'len', p.length.toString(8));
