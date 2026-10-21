// IDE COMPASS reference: structure, cross-references, language coverage and
// assembly of every example marked as verified.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, CHAPTERS, buildIndex } from '../ide/ref/index.js';
import { EXAMPLES } from '../ide/ref/fmt.js';
import { checkChapters, checkExample } from '../tools/check-ref.mjs';
import { PSEUDO_HANDLERS } from '../src/asm/pseudos.js';
import { CPU_MNEMONICS } from '../src/asm/cpuops.js';
import { PP_OPS } from '../src/asm/ppops.js';
import { SYSTEM_TEXTS } from '../src/os/systext.js';
import { collectMacros } from '../ide/highlight.js';

const index = buildIndex(PARTS);

test('reference: well-formed pages, unique identifiers', () => {
  const { problems } = checkChapters(CHAPTERS);
  assert.deepEqual(problems, []);
  assert.ok(index.count > 200, `${index.count} pages`);
});

test('reference: every cross-reference leads to a page', () => {
  const { refs } = checkChapters(CHAPTERS);
  const missing = refs.filter(([, to]) => !index.byId.has(to)).map(([a, b]) => `${a} -> ${b}`);
  assert.deepEqual(missing, []);
});

test('reference: every pseudo instruction has a page (F1)', () => {
  const missing = Object.keys(PSEUDO_HANDLERS).filter((op) => !index.lookup(op));
  assert.deepEqual(missing, []);
});

test('reference: every CPU and PP mnemonic has a page (F1)', () => {
  const missing = [...CPU_MNEMONICS, ...PP_OPS.keys()].filter((op) => !index.lookup(op));
  assert.deepEqual(missing, []);
  assert.equal(index.lookup('SA1').entry.id, 'cpu-sa');
  assert.equal(index.lookup('BX.6').entry.id, 'cpu-bx');
});

test('reference: every SYSTEXT macro has a page (F1)', () => {
  const macros = [...collectMacros(SYSTEM_TEXTS.SYSTEXT)].filter((m) => /^[A-Z][A-Z0-9.]*$/.test(m));
  assert.ok(macros.length > 10);
  const missing = macros.filter((m) => !index.lookup(m));
  assert.deepEqual(missing, []);
});

test('reference: full-text search', () => {
  const hits = index.search('literal');
  assert.ok(hits.length > 0);
  assert.ok(index.search('IDENT')[0].entry.id === 'ps-ident');
  assert.deepEqual(index.search('zzzqqq'), []);
});

test('reference: every verified example assembles as stated', () => {
  assert.ok(EXAMPLES.length > 200, `${EXAMPLES.length} examples`);
  const failures = EXAMPLES.map(checkExample).filter(Boolean);
  assert.equal(failures.length, 0, failures.slice(0, 5).join('\n\n'));
});
