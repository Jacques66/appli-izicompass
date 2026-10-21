import test from 'node:test';
import assert from 'node:assert/strict';
import { Machine } from '../src/machine.js';
import { fromNumber, toNumber } from '../src/cpu/float.js';

function load(m, words, at = 0) {
  words.forEach((w, i) => { m.cm[at + i] = BigInt('0o' + w.replace(/ /g, '')); });
}

test('SX6 / SA6 / PS', () => {
  const m = new Machine({ ecsWords: 0 });
  load(m, ['71600 00005 51600 00100', '00000 00000 00000 00000']);
  m.startCPU({ P: 0, FL: 0o1000 });
  m.run(100);
  assert.equal(m.cpu.stopped, true);
  assert.equal(m.cm[0o100], 5n);
});

test('B loop, RJ and floating point', () => {
  const m = new Machine({ ecsWords: 0 });
  // 0: SB1 B0+10 ; SB2 B0+0        (61 1 0 000010, 61 2 0 000000)
  // 1: SB2 B2+1  ; NE B1 B2 1      (61 2 2 000001, 05 1 2 000001)
  // 2: SA1 B0+20 ; SA2 B0+21       (51 1 0 000020, 51 2 0 000021)
  // 3: FX6 X1*X2  NO NO NO         (40 6 1 2 , 46000 x3)
  // 4: SA6 B0+22 ; PS              (51 6 0 000022, 00000 00000)
  load(m, [
    '61100 00010 61200 00000',
    '61220 00001 05120 00001',
    '51100 00020 51200 00021',
    '40612 46000 46000 46000',
    '51600 00022 00000 00000',
  ]);
  m.cm[0o20] = fromNumber(2.5);
  m.cm[0o21] = fromNumber(-4);
  m.startCPU({ P: 0, FL: 0o1000 });
  m.run(1000);
  assert.equal(m.cpu.B[2], 0o10);
  assert.equal(toNumber(m.cm[0o22]), -10);
  assert.ok(m.cpu.cycles > 0);
});

test('error exit: address out of range with EM', () => {
  const m = new Machine({ ecsWords: 0 });
  load(m, ['51100 07777 46000 46000']);
  m.startCPU({ P: 0, FL: 0o100, RA: 0o200, EM: 0o010000 });
  // program at RA=200
  m.cm[0o200] = m.cm[0]; m.cm[0] = 0n;
  m.run(100);
  assert.equal(m.cpu.stopped, true);
  assert.equal((m.cm[0o200] >> 48n) & 7n, 1n);
});

test('disk 6603: a PP writes then reads a sector', async () => {
  const { assemble } = await import('../src/asm/compass.js');
  const { loadPP } = await import('../src/loader/loader.js');
  const r = assemble(`
          IDENT  DSK,100B
          PERIPH
 CH       EQU    13B
          ORG    100B
 START    FNC    1405B,CH    TRACK 5
          FNC    1602B,CH    HEAD 2
          FNC    1207B,CH    WRITE SECTOR 7
          ACN    CH
          LDN    3
          OAM    DATA,CH
          DCN    CH
          FNC    1007B,CH    READ SECTOR 7
          ACN    CH
          LDN    3
          IAM    BUF,CH
          DCN    CH
          UJN    *
 DATA     CON    1111B,2222B,3333B
 BUF      BSS    3
          END`);
  assert.ok(r.ok, JSON.stringify(r.errors));
  const m = new Machine({ ecsWords: 0 });
  for (let n = 1; n < 10; n++) m.stopPP(n);
  loadPP(m, r.programs[0], 0);
  m.startPP(0, 0o100);
  m.run(200);
  const buf = r.symbols.find((s) => s.name === 'BUF').value;
  assert.deepEqual([...m.pps[0].mem.slice(buf, buf + 3)], [0o1111, 0o2222, 0o3333]);
  assert.equal(m.disk.sectors.get(m.disk.key(5, 2, 7))[2], 0o3333);
});
