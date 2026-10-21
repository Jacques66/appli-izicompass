// Mini-system: MTR (PP0), DSD (PP1), RA+1 requests, INPUT/OUTPUT files.
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

test('system programs assemble without errors', () => {
  const { mtr, dsd } = systemPrograms();
  assert.deepEqual(mtr.errors, []);
  assert.deepEqual(dsd.errors, []);
});

test('MESSAGE, WRITEC, CDD, ENDRUN', () => {
  const m = runJob(readFileSync('test/fixtures/hello.cmp', 'utf8'));
  assert.equal(jobStatus(m), 'end');
  assert.deepEqual(dayfile(m), ['HELLO FROM THE 6600', ' NORMAL END OF JOB.']);
  assert.equal(m.printer.text(), 'FIRST LINE\n NUMBER =     12345');
});

test('READC: card copy', () => {
  const m = runJob(readFileSync('test/fixtures/copy.cmp', 'utf8'), 'ONE\nTWO (+-*/)\n7/8/9\nTHREE\n');
  assert.equal(jobStatus(m), 'end');
  const lines = m.printer.output.map((l) => l.trim());
  assert.deepEqual(lines, ['ONE', 'TWO (+-*/)', 'CARDS:            2']);
});

test('ABORT and illegal request', () => {
  const src = (op) => `          IDENT  T
          ENTRY  T
 T        ${op}
          END    T`;
  let m = runJob(src('ABORT'));
  assert.equal(jobStatus(m), 'abort');
  m = runJob(src('SYSTEM XYZ'));
  assert.equal(jobStatus(m), 'abort');
  assert.match(dayfile(m)[0], /ILLEGAL/);
});

test('console: the DROP command aborts the job', () => {
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
  assert.match(dayfile(m).join(' '), /OPERATOR/);
});

test('deadstart from the system tape', async () => {
  const { deadstartJob } = await import('../src/os/system.js');
  const r = assemble(readFileSync('test/fixtures/hello.cmp', 'utf8'));
  const m = new Machine({ ecsWords: 0 });
  const st = deadstartJob(m, r.programs, { name: 'HELLO' });
  assert.ok(st.ok);
  let t = 0;
  while (jobStatus(m) !== 'end' && t < 2_000_000) { m.run(10000); t += 10000; }
  assert.equal(jobStatus(m), 'end');
  assert.equal(m.printer.text(), 'FIRST LINE\n NUMBER =     12345');
  // the tape exports to and reads back from the .tap format
  const { Tape } = await import('../src/io/devices.js');
  const back = Tape.fromTap(st.tape.toTap());
  assert.equal(back.records.length, st.tape.records.length);
  assert.deepEqual([...back.records[1]], [...st.tape.records[1]]);
});

test('CPU error exit detected by the monitor', () => {
  const m = runJob(`          IDENT  BAD
          ENTRY  BAD
 BAD      SA1    377777B
          END    BAD`);
  assert.equal(jobStatus(m), 'abort');
  assert.match(dayfile(m)[0], /ADDRESS OUT OF RANGE/);
});
