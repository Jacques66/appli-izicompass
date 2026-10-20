// Mini-système : MTR (PP0), DSD (PP1), requêtes RA+1, fichiers INPUT/OUTPUT.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assemble } from '../src/asm/compass.js';
import { Machine } from '../src/machine.js';
import { startJob, jobStatus, dayfile, systemPrograms } from '../src/os/system.js';

function runJob(src, cards) {
  const r = assemble(src);
  assert.ok(r.ok, JSON.stringify(r.errors));
  const m = new Machine({ ecsWords: 0 });
  if (cards) m.cardReader.loadDeck(cards);
  const st = startJob(m, r.programs, { name: 'TEST' });
  assert.ok(st.ok, JSON.stringify(st.errors));
  let t = 0;
  while (jobStatus(m) === 'run' && t < 3_000_000) { m.run(10000); t += 10000; }
  return m;
}

test('programmes système assemblés sans erreur', () => {
  const { mtr, dsd } = systemPrograms();
  assert.deepEqual(mtr.errors, []);
  assert.deepEqual(dsd.errors, []);
});

test('MESSAGE, WRITEC, CDD, ENDRUN', () => {
  const m = runJob(readFileSync('test/fixtures/hello.cmp', 'utf8'));
  assert.equal(jobStatus(m), 'end');
  assert.deepEqual(dayfile(m), ['BONJOUR DU 6600', ' FIN NORMALE DU TRAVAIL.']);
  assert.equal(m.printer.text(), 'PREMIERE LIGNE\n NOMBRE =     12345');
});

test('READC : copie de cartes', () => {
  const m = runJob(readFileSync('test/fixtures/copy.cmp', 'utf8'), 'UN\nDEUX (+-*/)\n7/8/9\nTROIS\n');
  assert.equal(jobStatus(m), 'end');
  const lines = m.printer.output.map((l) => l.trim());
  assert.deepEqual(lines, ['UN', 'DEUX (+-*/)', 'CARTES :          2']);
});

test('ABORT et demande illégale', () => {
  const src = (op) => `          IDENT  T
          ENTRY  T
 T        ${op}
          END    T`;
  let m = runJob(src('ABORT'));
  assert.equal(jobStatus(m), 'abort');
  m = runJob(src('SYSTEM XYZ'));
  assert.equal(jobStatus(m), 'abort');
  assert.match(dayfile(m)[0], /ILLEGALE/);
});

test('console : la commande DROP abandonne le travail', () => {
  const r = assemble(`          IDENT  LOOP
          ENTRY  LOOP
 LOOP     EQ     LOOP
          END    LOOP`);
  const m = new Machine({ ecsWords: 0 });
  startJob(m, r.programs);
  m.run(20000);
  for (const c of 'DROP') m.console.keyPress(c);
  m.console.keyPress('Enter');
  m.run(200000);
  assert.equal(jobStatus(m), 'abort');
  assert.match(dayfile(m).join(' '), /OPERATEUR/);
});

test('deadstart depuis la bande système', async () => {
  const { deadstartJob } = await import('../src/os/system.js');
  const r = assemble(readFileSync('test/fixtures/hello.cmp', 'utf8'));
  const m = new Machine({ ecsWords: 0 });
  const st = deadstartJob(m, r.programs, { name: 'HELLO' });
  assert.ok(st.ok);
  let t = 0;
  while (jobStatus(m) !== 'end' && t < 2_000_000) { m.run(10000); t += 10000; }
  assert.equal(jobStatus(m), 'end');
  assert.equal(m.printer.text(), 'PREMIERE LIGNE\n NOMBRE =     12345');
  // la bande s'exporte et se relit au format .tap
  const { Tape } = await import('../src/io/devices.js');
  const back = Tape.fromTap(st.tape.toTap());
  assert.equal(back.records.length, st.tape.records.length);
  assert.deepEqual([...back.records[1]], [...st.tape.records[1]]);
});

test('sortie d\'erreur CPU détectée par le moniteur', () => {
  const m = runJob(`          IDENT  BAD
          ENTRY  BAD
 BAD      SA1    377777B
          END    BAD`);
  assert.equal(jobStatus(m), 'abort');
  assert.match(dayfile(m)[0], /ADRESSE HORS LIMITES/);
});
