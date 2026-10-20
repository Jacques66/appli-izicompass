// Conformité de l'assembleur avec les exemples « code generated » du manuel COMPASS 3.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../src/asm/compass.js';
import { Machine } from '../src/machine.js';
import { linkAndLoad, loadPP } from '../src/loader/loader.js';
import { toNumber } from '../src/cpu/float.js';

/** Assemble des lignes dans un programme et retourne le code octal de chaque ligne. */
function codes(lines, { pp = false, pre = [] } = {}) {
  const head = pp ? ['          IDENT  T,100B', '          PERIPH'] : ['          IDENT  T', '          ABS', '          ORG    100B'];
  const src = [...head, ...pre, ...lines.map((l) => '          ' + l), '          END'].join('\n');
  const r = assemble(src);
  const first = head.length + pre.length + 1;
  const out = lines.map((_, k) => {
    const m = r.lines.find((x) => x.line === first + k);
    return m ? m.octal.join(' ') : '';
  });
  return { out, r };
}

const CPU = [
  ['SA1    A0+1', '5010000001'], ['SA0    -3', '5100777774'], ['SA2    3+B1', '5121000003'],
  ['SA3    X1-6', '5231777771'], ['SA4    X1+B1', '53411'], ['SA5    A4+B1', '54541'],
  ['SA6    A4+B1', '54641'], ['SA5    A4', '54540'], ['SA6    -B1+A4', '55641'],
  ['SA7    B1+B1', '56711'], ['SA7    B2-B1', '57721'], ['SB1    A1-5', '6011777772'],
  ['SB1    -5', '6110777772'], ['SB2    3+B1+6', '6121000011'], ['SB3    X1+100B', '6231000100'],
  ['SB4    X2+B7', '63427'], ['SB5    A4+B1', '64541'], ['SB5    A4', '64540'], ['SB6    -B1+A4', '65641'],
  ['SB6    A4-B3', '65643'], ['SB7    B1+B1', '66711'], ['SB7    B5-B1', '67751'],
  ['SX1    -2022B', '7110775755'], ['SX2    B1+5', '7121000005'], ['SX3    X3-33B', '7233777744'],
  ['SX4    X4+B2', '73442'], ['SX5    A5+B3', '74553'], ['SX5    A4', '74540'], ['SX6    A0-B4', '75604'],
  ['SX6    -B1+A4', '75641'], ['SX7    B7+B6', '76776'], ['SX7    B5-B1', '77751'], ['SB2    B0', '66200'],
  ['BX6    X2', '10622'], ['BX5    X5*X3', '11553'], ['BX7    X6+X7', '12767'], ['BX6    X0-X1', '13601'],
  ['BX3    -X1', '14311'], ['BX4    -X2*X3', '15432'], ['BX6    -X4+X5', '16654'], ['BX7    -X1-X3', '17731'],
  ['LX3    25B', '20325'], ['LX3    -12B', '20362'], ['AX5    37B', '21537'],
  ['LX6    X5,B7', '22675'], ['LX5    B3,X4', '22534'], ['LX3    X2', '22302'], ['AX7    X4,B6', '23764'],
  ['AX2    B1,X1', '23211'], ['AX5    X2', '23502'], ['AX4    B2', '23424'],
  ['NX5    X5,B7', '24575'], ['NX5    X5', '24505'], ['NX5,B5 X2', '24552'], ['ZX4    X4,B7', '25474'],
  ['ZX4', '25404'], ['ZX3,B6 X1', '25361'], ['UX7    X7,B7', '26777'], ['UX3,X2 B4', '26342'],
  ['UX7', '26707'], ['UX7    B7', '26777'], ['PX5    X5,B6', '27565'], ['PX6,B7 X1', '27671'],
  ['PX5', '27505'], ['PX5    B6', '27565'],
  ['FX3    X4+X5', '30345'], ['FX2    X1-X3', '31213'], ['DX3    X2+X3', '32323'], ['DX4    X1-X4', '33414'],
  ['RX5    X3+X4', '34534'], ['RX6    X5-X3', '35653'], ['IX5    X4+X5', '36545'], ['IX6    X3-X1', '37631'],
  ['FX0    X1*X1', '40011'], ['IX2    X3*X4', '42234'], ['MX3    -14B', '43360'], ['FX6    X3/X1', '44631'],
  ['RX7    X2/X4', '45724'], ['CX7    X0', '47700'], ['NO', '46000'],
  ['RE     2000B', '0110002000'], ['RE     B7+1000B', '0117001000'], ['WE     1000B+B5', '0125001000'],
  ['XJ     1000B', '0130001000'], ['XJ     B5+600B', '0135000600'], ['JP     B7', '0277000000'],
  ['RX6    X5', '01465'], ['WX7    X0', '01570'],
];

test('instructions CPU : exemples du manuel', () => {
  const { out } = codes(CPU.map((c) => c[0]));
  CPU.forEach(([src, exp], k) => assert.equal(out[k], exp, src));
});

test('branchements CPU', () => {
  const pre = [' K        EQU    1234B'];
  const cases = [
    ['ZR     B5,K', '0450001234'], ['EQ     B0,B5,K', '0405001234'], ['EQ     B5,B3,K', '0453001234'],
    ['NE     B1,B5,K', '0515001234'], ['NZ     B6,K', '0560001234'], ['PL     B2,K', '0620001234'],
    ['GE     B4,B5,K', '0645001234'], ['GE     B5,K', '0650001234'], ['LE     B6,B7,K', '0676001234'],
    ['NG     B7,K', '0770001234'], ['MI     B3,K', '0730001234'], ['GT     B7,B6,K', '0767001234'],
    ['GT     B5,K', '0705001234'], ['LT     B1,B2,K', '0712001234'], ['ZR     X5,K', '0305001234'],
    ['NZ     X3,K', '0313001234'], ['PL     X4,K', '0324001234'], ['NG     X1,K', '0331001234'],
    ['IR     X0,K', '0340001234'], ['OR     X1,K', '0351001234'], ['DF     X5,K', '0365001234'],
    ['ID     X7,K', '0377001234'], ['RJ     K', '0100001234'], ['JP     B5+K', '0255001234'],
  ];
  // chaque branchement force la suivante en début de mot : on les assemble un par ligne
  const { out } = codes(cases.map((c) => c[0]), { pre });
  cases.forEach(([src, exp], k) => assert.equal(out[k], exp, src));
});

test('données : nombres, caractères, codes', () => {
  const cases = [
    ['DATA   1.0', '17204000000000000000'], ['DATA   0.1', '17146314631463146315'],
    ['DATA   1.1', '17204314631463146315'], ['DATA   -1', '77777777777777777776'],
    ['DATA   1.3EE', '17205146314631463146 16403146314631463146'],
    ['DATA   0LOUTPUT', '17252420252400000000'], ['DATA   0LLGO', '14071700000000000000'],
    ['DATA   0LCOMPILE', '03171520111405000000'], ['VFD    42/0LOUTPUT,18/1', '17252420252400000001'],
    ['DATA   #123ABC', '00000000000004435274'], ['CON    0#A01576', '00000000000050012566'],
    ['DATA   0.1P47', '17200314631463146314'], ['CON    1S17', '00000000000000400000'],
    ['SX4    1R.+1', '7140000060'], ['SX3    1R*', '7130000047'], ['SA1    3RCIO', '5110031117'],
    ['DIS    2,GENERATE 2 CPU WORDS', '07051605220124055535 55032025552717220423'],
    ['DIS    ,*GENERATE 2 CPU WORDS*', '07051605220124055535 55032025552717220423 00000000000000000000'],
    ['DATA   H* THE ANSWER IS *', '55241005550116232705 22551123555555555555'],
  ];
  const { out } = codes(cases.map((c) => c[0]));
  cases.forEach(([src, exp], k) => assert.equal(out[k], exp, src));
});

test('pseudo CODE : ASCII, BCD externe et interne', () => {
  const lines = ['DATA   0LOUTPUT', 'CODE   ASCII', 'DATA   0LOUTPUT', 'CODE   EXTERNAL BCD', 'DATA   0LOUTPUT',
    'CODE   INTERNAL BCD', 'DATA   0LOUTPUT', 'CODE   DISPLAY', 'DATA   0LOUTPUT', 'CODE   *', 'DATA   0LOUTPUT'];
  const { out } = codes(lines);
  assert.equal(out[0], '17252420252400000000');
  assert.equal(out[2], '57656460656400000000');
  assert.equal(out[4], '46242347242300000000');
  assert.equal(out[6], '46646347646300000000');
  assert.equal(out[8], '17252420252400000000');
  assert.equal(out[10], '46646347646300000000');
});

test('instructions PP', () => {
  const pre = [' TAG1     EQU    12B', ' TAG6     EQU    203B', ' TAG      EQU    1364B'];
  const cases = [
    ['LDC    707070B', '2070 7070'], ['LPC    070707B', '2207 0707'], ['FNC    20B,5', '7705 0020'],
    ['AJM    TAG1,2', '6402 0012'], ['LMN    12B', '1112'], ['LPN    7', '1207'], ['SCN    21B', '1321'],
    ['LDN    15B', '1415'], ['ADN    1', '1601'], ['SBN    2', '1702'], ['EXN    1', '2601'],
    ['MXN    0', '2610'], ['MAN    3', '2623'], ['IAN    3', '7003'], ['IAM    TAG,3', '7103 1364'],
    ['OAM    TAG,4', '7304 1364'], ['SHN    6', '1006'], ['SHN    -6', '1071'], ['LDM    TAG6,77B', '5077 0203'],
    ['SBM    TAG6-1', '5200 0202'], ['AOM    -10B+TAG6', '5600 0173'], ['SOM    TAG6,TAG1', '5712 0203'],
    ['STM    TAG6-1+70B,TAG1-2', '5410 0272'], ['SCF    100B,5', '6445 0100'], ['CCF    100B,5', '6545 0100'],
    ['SFM    100B,5', '6645 0100'], ['CFM    100B,5', '6745 0100'], ['SCF    100B,13B', '6453 0100'],
    ['ACN    5', '7405'], ['PSN', '2400'], ['DATA   5,-9', '0005 7766'],
  ];
  const { out } = codes(cases.map((c) => c[0]), { pp: true, pre });
  cases.forEach(([src, exp], k) => assert.equal(out[k], exp, src));
});

test('sauts relatifs PP (sans option J)', () => {
  const src = [
    '          IDENT  T,20B', '          PERIPH', '          ORG    12B', ' TAG1     PSN',
    '          ORG    20B', '          UJN    TAG1-*', ' TAG3     EQU    25B', '          NJN    TAG3', '          END',
  ].join('\n');
  const r = assemble(src);
  assert.equal(r.lines.find((m) => m.line === 6).octal.join(' '), '0371');
  assert.equal(r.lines.find((m) => m.line === 8).octal.join(' '), '0525');
});

test('CMU : descripteur DM', () => {
  const { out } = codes(['DM     127,BUFFA,0,BUFFB,5'], { pre: [' BUFFA    EQU    5000B', ' BUFFB    EQU    7000B'] });
  assert.equal(out[0], '46570050007405007000');
});

test('littéraux partagés', () => {
  const src = ['          IDENT  T', '          ABS', '          ORG    100B', '          SB2    =1', '          SB3    =1RA',
    '          SB4    =1RB', ' L        LIT    1,2', '          END'].join('\n');
  const r = assemble(src);
  const lit = (n) => r.lines.find((m) => m.line === n).octal[0];
  assert.equal(lit(4).slice(-6), lit(5).slice(-6));
  assert.notEqual(lit(4).slice(-6), lit(6).slice(-6));
  assert.ok(r.ok, JSON.stringify(r.errors));
});

test('bout en bout : programme CPU exécuté par l\'émulateur', () => {
  const src = `
          IDENT  SOMME
          ABS
          ORG    100B
 START    SB1    1
          SB2    B0
          SX6    B0
 LOOP     SA1    TAB+B2
          IX6    X6+X1
          SB2    B2+B1
          SB3    B2-N
          NZ     B3,LOOP
          SA6    RES
          SA1    A
          SA2    B
          FX3    X1*X2
          NX6    X3
          SA6    PROD
          PS
 N        EQU    5
 TAB      DATA   1,2,3,4,5
 A        DATA   2.5
 B        DATA   -4.0
 RES      BSS    1
 PROD     BSS    1
          END    START`;
  const r = assemble(src);
  assert.ok(r.ok, JSON.stringify(r.errors));
  const m = new Machine({ ecsWords: 0 });
  const ld = linkAndLoad(m, r.programs, { ra: 0 });
  m.startCPU({ P: ld.entry, FL: ld.fl });
  m.run(5000, { stopOnCpuStop: true });
  const sym = (n) => r.symbols.find((s) => s.name === n).value;
  assert.equal(m.cm[sym('RES')], 15n);
  assert.equal(toNumber(m.cm[sym('PROD')]), -10);
});

test('bout en bout : programme relogeable lié', () => {
  const main = `
          IDENT  MAIN
          ENTRY  START
          EXT    DOUBLE
 START    SA1    VAL
          RJ     DOUBLE
          SA6    OUT
          PS
 VAL      DATA   21
 OUT      BSS    1
          END    START`;
  const sub = `
          IDENT  SUB
          ENTRY  DOUBLE
 DOUBLE   EQ     *+400000B
          IX6    X1+X1
          EQ     DOUBLE
          END`;
  const r1 = assemble(main), r2 = assemble(sub);
  assert.ok(r1.ok && r2.ok, JSON.stringify([r1.errors, r2.errors]));
  const m = new Machine({ ecsWords: 0 });
  const ld = linkAndLoad(m, [...r1.programs, ...r2.programs], { ra: 0o1000 });
  assert.deepEqual(ld.errors, []);
  m.startCPU({ P: ld.entry, RA: 0o1000, FL: ld.fl });
  m.run(5000, { stopOnCpuStop: true });
  const out = r1.symbols.find((s) => s.name === 'OUT').value;
  assert.equal(m.cm[0o1000 + 0o100 + out], 42n);
});

test('bout en bout : programme PP sur la console 6612', () => {
  const src = `
          IDENT  CON,100B
          PERIPH
 CH       EQU    10B
          ORG    100B
 START    FNC    7000B,CH
          ACN    CH
          LDN    MSGL
          OAM    MSG,CH
          DCN    CH
          UJN    START
 MSG      CON    6100B,7600B
          DIS    ,*OK*
 MSGL     EQU    *-MSG
          END`;
  const r = assemble(src);
  assert.ok(r.ok, JSON.stringify(r.errors));
  const m = new Machine({ ecsWords: 0 });
  for (let n = 1; n < 10; n++) m.stopPP(n);
  loadPP(m, r.programs[0], 0);
  m.startPP(0, r.programs[0].entry);
  m.run(2000);
  const chars = m.console.trace.map((t) => t.c);
  assert.ok(chars.includes(0o17) && chars.includes(0o13), 'caractères O et K tracés');
});
