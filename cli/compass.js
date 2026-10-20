#!/usr/bin/env node
// compass : assembleur COMPASS en ligne de commande.
//
//   node cli/compass.js SOURCE [options]
//     -l FICHIER   écrire le listing dans FICHIER (sinon sortie standard)
//     -b FICHIER   écrire le binaire (tables du chargeur, mots de 60 bits en octal)
//     -x DIR       répertoire des textes externes (XTEXT) : DIR/NOM ou DIR/NOM.cmp
//     -S NOM       texte système (défaut SYSTEXT ; « 0 » pour aucun)
//     -q           ne pas afficher le listing
// Code de sortie : 0 sans erreur fatale, 1 sinon.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { basename, join, extname } from 'node:path';
import { assemble } from '../src/asm/compass.js';

const args = process.argv.slice(2);
if (!args.length || args.includes('-h') || args.includes('--help')) {
  console.log('usage : compass SOURCE [-l listing] [-b binaire] [-x dir] [-S texte] [-q]');
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
  process.stderr.write(`${e.file}:${e.line}: ${e.fatal ? 'erreur' : 'avertissement'} ${e.flag} ${e.message}\n`);
}
process.stderr.write(` ${fatal ? 'ASSEMBLY ERRORS' : 'ASSEMBLY COMPLETE'}. ${r.programs.map((p) => `${p.name} (${p.type}, ${p.length.toString(8)}B mots)`).join(', ')}\n`);
process.exit(fatal ? 1 : 0);
