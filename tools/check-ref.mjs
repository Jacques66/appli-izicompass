// Checks one or more modules of the COMPASS reference (ide/ref/*.js): page
// structure, unique identifiers, cross-references, and assembly of every
// example marked ex(). Usage: node tools/check-ref.mjs [file…]
// Without arguments: the whole reference (ide/ref/index.js).

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { assemble } from '../src/asm/compass.js';
import { EXAMPLES } from '../ide/ref/fmt.js';

export function wrapExample(text, pp = false) {
  if (/^\S*\s+IDENT\b/m.test(text)) return text;
  if (pp) return `          IDENT  EX,100B\n          PERIPH\n          ORG    100B\n${text}\n          END`;
  return `          IDENT  EX\n${text}\n          END`;
}

export function checkExample({ text, errors, pp }) {
  const r = assemble(wrapExample(text, pp), { fileName: 'EX' });
  const got = [...new Set(r.errors.map((e) => e.flag))].sort();
  const want = [...new Set(errors)].sort();
  if (got.join() !== want.join()) {
    return `flags ${got.join('') || 'none'} instead of ${want.join('') || 'none'}\n` +
      r.errors.map((e) => `   line ${e.line} ${e.flag} ${e.message || ''}`).join('\n') + '\n' + text;
  }
  return null;
}

export function checkChapters(chapters) {
  const problems = [];
  const ids = new Set();
  const refs = [];
  for (const ch of chapters) {
    if (!ch.id || !ch.title || !Array.isArray(ch.entries)) { problems.push(`malformed chapter: ${ch.id}`); continue; }
    for (const e of ch.entries) {
      if (!e.id || !e.title || typeof e.html !== 'string') problems.push(`malformed page in ${ch.id}: ${e.id}`);
      if (ids.has(e.id)) problems.push(`duplicate identifier: ${e.id}`);
      ids.add(e.id);
      for (const m of e.html.matchAll(/data-ref="([^"]+)"/g)) refs.push([e.id, m[1]]);
      for (const m of (ch.intro || '').matchAll(/data-ref="([^"]+)"/g)) refs.push([ch.id, m[1]]);
    }
  }
  return { problems, ids, refs };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  const chapters = [];
  if (files.length === 0) {
    const m = await import('../ide/ref/index.js');
    chapters.push(...m.CHAPTERS);
  } else {
    for (const f of files) {
      const m = await import(pathToFileURL(path.resolve(f)).href);
      chapters.push(...(m.CHAPTERS || [m.CHAPTER]));
    }
  }
  const { problems, ids, refs } = checkChapters(chapters);
  const missing = refs.filter(([, to]) => !ids.has(to));
  let bad = 0;
  for (const ex of EXAMPLES) {
    const p = checkExample(ex);
    if (p) { bad++; console.log('--- failing example: ' + p + '\n'); }
  }
  for (const p of problems) console.log('!! ' + p);
  if (missing.length) console.log(`cross-references to missing pages (expected if they live in another module):\n` + missing.map(([a, b]) => `   ${a} -> ${b}`).join('\n'));
  const n = chapters.reduce((s, ch) => s + ch.entries.length, 0);
  console.log(`${chapters.length} chapters, ${n} pages, ${EXAMPLES.length} examples, ${bad} failing, ${problems.length} problems`);
  process.exitCode = bad || problems.length ? 1 : 0;
}
