#!/usr/bin/env node
// compass: command-line COMPASS assembler.
//
//   node cli/compass.js SOURCE [options]
//     -l FILE      write the listing to FILE (otherwise standard output)
//     -b FILE      write the binary (loader tables, 60-bit words in octal)
//     -x DIR       directory of external texts (XTEXT): DIR/NAME or DIR/NAME.cmp
//     -S NAME      system text (default SYSTEXT; "0" for none)
//     -q           do not print the listing
// Exit code: 0 with no fatal error, 1 otherwise.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { basename, join, extname } from 'node:path';
import { assemble } from '../src/asm/compass.js';

const args = process.argv.slice(2);
if (!args.length || args.includes('-h') || args.includes('--help')) {
  console.log('usage: compass SOURCE [-l listing] [-b binary] [-x dir] [-S text] [-q]');
  process.exit(0);
}
let source = null, listFile = null, binFile = null, xdir = null, sys, quiet = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-l') listFile = args[++i];
  else if (a === '-b') binFile = args[++i];
  else if (a === '-x') xdir = args[++i];
  else if (a === '-S') sys = args[++i];
  else if (a === '-q') quiet = true;
  else source = a;
}
const texts = {};
if (xdir && existsSync(xdir)) {
  for (const f of readdirSync(xdir)) texts[basename(f, extname(f)).toUpperCase()] = readFileSync(join(xdir, f), 'latin1');
}
const text = readFileSync(source, 'latin1');
const r = assemble(text, {
  fileName: basename(source, extname(source)).toUpperCase(),
  texts,
  systemText: sys === '0' ? null : sys,
});
if (listFile) writeFileSync(listFile, r.listing);
else if (!quiet) process.stdout.write(r.listing);
if (binFile) {
  const out = [];
  for (const p of r.programs) {
    for (const rec of p.binary.records) {
      out.push(`* ${rec.kind} ${p.name}${rec.name ? ' ' + rec.name : ''}`);
      for (const w of rec.words) out.push(BigInt(w).toString(8).padStart(20, '0'));
    }
  }
  writeFileSync(binFile, out.join('\n') + '\n');
}
let fatal = 0;
for (const e of r.errors) {
  if (e.fatal) fatal++;
  process.stderr.write(`${e.file}:${e.line}: ${e.fatal ? 'error' : 'warning'} ${e.flag} ${e.message}\n`);
}
process.stderr.write(` ${fatal ? 'ASSEMBLY ERRORS' : 'ASSEMBLY COMPLETE'}. ${r.programs.map((p) => `${p.name} (${p.type}, ${p.length.toString(8)}B words)`).join(', ')}\n`);
process.exit(fatal ? 1 : 0);
