// COMPASS assembler: advanced pseudo instructions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../src/asm/compass.js';

const ABS = ['          IDENT  T', '          ABS', '          ORG    100B'];

function asm(lines, opts = {}) {
  const head = opts.head || ABS;
  const src = [...head, ...lines, '          END'].join('\n');
  const r = assemble(src, opts);
  const at = (n) => {
    const m = r.lines.find((x) => x.line === head.length + n);
    return m ? m.octal.join(' ') : '';
  };
  const sym = (name) => {
    const s = r.symbols.find((x) => x.name === name);
    return s ? s.value : undefined;
  };
  const flags = r.errors.map((e) => `${e.line - head.length}${e.flag}`);
  return { r, at, sym, flags };
}

test('OPDEF: redefined instruction', () => {
  const { at, flags } = asm([
    ' MXQ      OPDEF  REG,VAL',
    '          VFD    6/43B,3/REG,6/VAL',
    '          ENDM',
    '          MX6    10',
  ]);
  assert.deepEqual(flags, []);
  assert.equal(at(4).slice(0, 5), '43612');   // VFD 6/43,3/6,6/12
});

test('OPDEF: register and expression parameters', () => {
  const { at, flags } = asm([
    ' SXX+BQ   OPDEF  I,J,K,Q',
    '          SX_I   X_J+Q',
    '          SX_I   X_I+B_K',
    '          ENDM',
    '          SX7    X1+B2+5',
  ]);
  assert.deepEqual(flags, []);
  assert.equal(at(5), '7271000005 73772');
});

test('CPOP and CPSYN', () => {
  const { at, flags } = asm([
    ' SAX+B    CPOP   0,530B,132B',
    '          SA7    X3+B1',
    ' SXXQ     CPOP   1,720B,120B',
    '          SX3    X1+3',
  ]);
  assert.deepEqual(flags, []);
  assert.equal(at(2), '53731');
  assert.equal(at(4), '7231000003');
});

test('OPSYN, NIL, PURGMAC', () => {
  const { at, sym, flags } = asm([
    ' MAC      MACRO  A',
    '          SX6    A',
    '          ENDM',
    ' TAG      MAC    5',
    ' MAC      OPSYN  NIL',
    ' TAG2     MAC    6',
    '          PURGMAC MAC',
    ' CALL     OPSYN  BSS',
    ' T3       CALL   2',
  ]);
  assert.deepEqual(flags, []);
  assert.equal(sym('TAG'), 0o100);
  assert.equal(sym('TAG2'), undefined);
  assert.equal(sym('T3'), 0o101);
});

test('QUAL: qualified symbols', () => {
  const { at, sym, flags } = asm([
    '          QUAL   P1',
    ' X1V      EQU    11B',
    '          QUAL   P2',
    ' X1V      EQU    22B',
    '          QUAL   *',
    '          SX6    X1V',
    '          QUAL',
    '          SX7    /P1/X1V',
    '          SX5    /P2/X1V',
  ]);
  assert.deepEqual(flags, []);
  assert.equal(at(6), '7160000011');
  assert.equal(at(8), '7170000011');
  assert.equal(at(9), '7150000022');
});

test('LOC and POS', () => {
  const { r, sym, flags } = asm([
    '          LOC    0',
    ' A0V      CON    1',
    ' A1V      CON    2',
    '          LOC    *O',
    ' B0V      CON    3',
    '          VFD    30/1',
    '          POS    15',
    '          VFD    15/7',
  ]);
  assert.deepEqual(flags, []);
  assert.equal(sym('A0V'), 0);
  assert.equal(sym('A1V'), 1);
  assert.equal(sym('B0V'), 0o102);
  assert.equal(r.programs[0].image.words[3].toString(8).padStart(20, '0'), '00000000010000000007');
});

test('IRP inside a macro', () => {
  const { r, flags } = asm([
    ' ZAB      MACRO  ARG,B',
    '          IRP    ARG',
    '          SX6    ARG+B',
    '          IRP',
    '          ENDM',
    '          ZAB    (1,2,3),10B',
  ]);
  assert.deepEqual(flags, []);
  const img = r.programs[0].image.words;
  assert.equal(img[0].toString(8), '71600000117160000012');
  assert.equal(img[1].toString(8).slice(0, 10), '7160000013');
});

test('RMT and HERE', () => {
  const { sym, flags } = asm([
    '          RMT',
    ' LATE     CON    1',
    '          RMT',
    ' EARLY    CON    2',
    '          HERE',
    ' AFTER    CON    3',
  ]);
  assert.deepEqual(flags, []);
  assert.equal(sym('EARLY'), 0o100);
  assert.equal(sym('LATE'), 0o101);
  assert.equal(sym('AFTER'), 0o102);
});

test('XTEXT: external text', () => {
  const { sym, flags } = asm(['          XTEXT  MYDECK', ' AFTER    CON    0'], { texts: { MYDECK: ' DECKSYM  CON    5\n          CON    6\n' } });
  assert.deepEqual(flags, []);
  assert.equal(sym('DECKSYM'), 0o100);
  assert.equal(sym('AFTER'), 0o102);
});

test('micros: MICRO, DECMIC, OCTMIC, MICCNT', () => {
  const { at, sym, flags } = asm([
    ' B        EQU    1024',
    ' SYMBL    DECMIC B,6',
    ' V1       OCTMIC B,6',
    ' M        MICRO  1,,*"SYMBL" STORAGE*',
    ' N        MICCNT M',
    '          DATA   10H"V1"',
    '          DATA   0L"M"',
  ]);
  assert.deepEqual(flags, []);
  assert.equal(sym('N'), 14);
  assert.equal(at(6), '33333533333355555555');
  assert.equal(at(7).split(' ')[0], '33333433353700000000');
});

test('ERR, ERRNZ, ERRPL (pass 2)', () => {
  const { flags } = asm([
    ' X        EQU    5',
    '          ERRNZ  X-5',
    '          ERRNZ  X',
    ' U        ERRPL  X',
    '          ERRNG  X',
    ' 7        ERR',
  ]);
  assert.deepEqual(flags.sort(), ['3P', '4U', '67'].sort());
});

test('BASE O, M and D', () => {
  const { at, flags } = asm([
    '          BASE   O',
    '          SX1    17',
    '          SX2    17D',
    '          BASE   M',
    '          VFD    48/10,12/7',
    '          BASE   *',
    '          BASE   *',
    '          SX3    10',
  ]);
  assert.deepEqual(flags, []);
  assert.equal(at(2), '7110000017');
  assert.equal(at(3), '7120000021');
  assert.equal(at(5), '00000000000000100007');
  assert.equal(at(8), '7130000012');
});

test('SET, MAX, MIN, IF attributes', () => {
  const { sym, flags, at } = asm([
    ' A        SET    1',
    ' A        SET    A+1',
    ' MX       MAX    3,A,1',
    ' MN       MIN    3,A,1',
    '          IF     SET,A,1',
    '          SX1    A',
    '          IF     -DEF,NOTDEF,1',
    '          SX2    MX',
    '          IF     REG,X1+5,1',
    '          SX3    MN',
  ]);
  assert.deepEqual(flags, []);
  assert.equal(sym('A'), 2);
  assert.equal(sym('MX'), 3);
  assert.equal(sym('MN'), 1);
  assert.equal(at(6), '7110000002');
  assert.equal(at(8), '7120000003');
  assert.equal(at(10), '7130000001');
});

test('IFC and named skips', () => {
  const { at, flags } = asm([
    ' T1       IFC    EQ,$ABC$ABC$',
    '          SX1    1',
    ' T1       ELSE',
    '          SX1    2',
    ' T1       ENDIF',
    '          IFC    LT,*AB*ABC*,1',
    '          SX2    3',
    ' T2       IFC    GT,*A*B*',
    '          SX3    4',
    ' T2       ENDIF',
  ]);
  assert.deepEqual(flags, []);
  assert.equal(at(2), '7110000001');
  assert.equal(at(4), '');
  assert.equal(at(7), '7120000003');
  assert.equal(at(9), '');
});

test('PP overlays: two IDENTs', () => {
  const r = assemble(['          IDENT  OV1,100B', '          PERIPH', '          ORG    100B', ' A        LDN    1',
    '          IDENT  OV2,200B', '          ORG    200B', '          LJM    A', '          END'].join('\n'));
  assert.ok(r.ok, JSON.stringify(r.errors));
  const p = r.programs[0];
  assert.equal(p.overlays.length, 2);
  assert.equal(p.overlays[1].origin, 0o200);
  assert.deepEqual(p.overlays[1].words, [0o0100, 0o0100]);
});

test('diagnosed errors', () => {
  const { flags } = asm([
    ' DUP1     EQU    1',
    ' DUP1     EQU    2',
    '          SX6    UNDEF',
    '          FOO    1',
    '          VFD    61/1',
    '          SA1    X1*X2',
  ]);
  assert.deepEqual(flags, ['2D', '3U', '4O', '5V', '6O']);
});

test('default symbol =S in absolute and relocatable CON', () => {
  const { at, sym, flags } = asm(['          SA1    =SDFLT', '          CON    *+1']);
  assert.deepEqual(flags, []);
  assert.equal(at(1), '5110000102');
  assert.equal(at(2), '00000000000000000102');
});

test('MACROE: keyword parameters', () => {
  const { r, flags } = asm([' SAM      MACROE A,B,C', '          CON    A', '          CON    B', '          CON    C', '          ENDM', '          SAM    C=3,A=1,B=2']);
  assert.deepEqual(flags, []);
  assert.deepEqual(r.programs[0].image.words.map(Number), [1, 2, 3]);
});

test('nested ECHO', () => {
  const { r, flags } = asm([
    '          ECHO   ,CM=(1,2)',
    '          ECHO   2,P1=(3,4)',
    '          CON    CM*10+P1',
    '          ENDD',
  ]);
  assert.deepEqual(flags, []);
  assert.deepEqual(r.programs[0].image.words.map(Number), [13, 14, 23, 24]);
});

test('PPOP and CHAR / CODE O characters', () => {
  const { at, flags } = asm(['          CHAR   1,63B', '          CODE   O', '          CON    1RA', '          CODE   D', '          CON    1RA']);
  assert.deepEqual(flags, []);
  assert.equal(at(3), '00000000000000000063');
  assert.equal(at(5), '00000000000000000001');
  const pp = asm([' XYZ      PPOP   4,1400B', '          XYZ    7'], { head: ['          IDENT  T,100B', '          PERIPH'] });
  assert.equal(pp.at(2), '1407');
});

test('SEGMENT: absolute overlays', () => {
  const r = assemble(['          IDENT  SAMPLE,110B,ENTA', '          ABS', '          ORG    110B', ' ENTA     SX6    1',
    ' OVLOC    BSS    0', ' SEG1     SEGMENT OVLOC+1,ENTB', '          ORG    OVLOC', '          BSS    1', ' ENTB     SX6    2', '          END'].join('\n'));
  assert.ok(r.ok, JSON.stringify(r.errors));
  const ov = r.programs[0].overlays;
  assert.equal(ov.length, 2);
  assert.equal(ov[0].origin, 0o110);
  assert.equal(ov[0].words.length, 1);
  assert.equal(ov[1].name, 'SEG1');
  assert.equal(ov[1].origin, 0o112);
  assert.equal(ov[1].entry, 0o112);
  assert.equal(ov[1].words[0].toString(8), '71600000024600046000'.slice(0, 20).replace('4600046000', '6100046000'));
});
