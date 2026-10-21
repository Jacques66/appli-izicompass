// COMPASS reference: central processor and peripheral processor
// instructions. The complete form tables are generated from the assembler's
// own tables (src/asm/cpuops.js, src/asm/ppops.js), so they cannot diverge
// from what the assembler accepts.

import { CPU_SYNTAX } from '../../src/asm/cpuops.js';
import { PP_OPS } from '../../src/asm/ppops.js';
import { PP_TIMES } from '../../src/pp/pp.js';
import { c, src, ex, T, see, ul, h4, esc } from './fmt.js';

// ------------------------------------------------- CPU forms (generated)

const LETTERS = ['i', 'j', 'k'];

// Forms where j = k: the manual names the single register k.
const SAME_JK = { 'BX-X': ['BXi -Xk', '14ikk'], CXX: ['CXi Xk', '47ikk'] };

/** Written form of a CPU_SYNTAX entry, e.g. "SAi Xj+Bk". */
export function cpuForm(e) {
  if (SAME_JK[e.key]) return SAME_JK[e.key][0];
  const mn = e.key.slice(0, 2);
  const rest = e.key.slice(2);
  const letterOf = (s) => LETTERS[e.reg.indexOf(s)];
  const op = e.reg.includes('1') ? mn + letterOf('1') : mn;
  if (!rest) return op;
  const nregs = (rest.match(/[ABX]/g) || []).length;
  let n = 0;
  const q = e.jk ? 'jk' : e.n9 ? 'n' : 'K';
  const out = rest.replace(/[ABX]|Q/g, (t) => {
    if (t === 'Q') return q;
    n++;
    const s = nregs === 2 ? (n === 1 ? '3' : '2') : '2';
    return t + letterOf(s);
  });
  // a Q attached to a register ("BQ") is an added expression: "Bj+K"
  return `${op} ${out.replace(/([ABX][ijk])K/g, '$1+K')}`;
}

/** Octal encoding of an entry, e.g. "53ijk", "51i0K", "01300 00000". */
export function cpuCode(e) {
  if (SAME_JK[e.key]) return SAME_JK[e.key][1];
  const fm = (e.val >> 3).toString(8).padStart(2, '0');
  const d = (pos, val) => (e.reg[pos] === '0' ? String(val) : LETTERS[e.reg.indexOf(e.reg[pos])]);
  const i = d(0, e.val & 7);
  const j = d(1, 0);
  const hasQ = /Q/.test(e.key);
  if (e.len === 30) return hasQ ? `${fm}${i}${j}K` : `${fm}${i}${j}0 00000`;
  if (e.jk) return `${fm}${i}jk`;
  if (e.n9) return `${fm}n`;
  return `${fm}${i}${j}${d(2, 0)}`;
}

const MACHINE_NOTE = { 7: '7600', 8: '8xx' };

function cpuFormsTable(filter) {
  const rows = [];
  for (const e of CPU_SYNTAX.values()) {
    if (!e.builtin || !filter(e)) continue;
    const force = [e.before ? 'before' : '', e.after ? 'after' : ''].filter(Boolean).join(' and ');
    rows.push([c(cpuForm(e)), `<span class="mono">${cpuCode(e)}</span>`, `${e.len}`, force || '—', MACHINE_NOTE[e.machine] || 'all']);
  }
  return T(rows, ['Form', 'Code', 'Bits', 'Force upper', 'Machines']);
}

const byFm = (...fms) => (e) => fms.includes(e.val >> 3);
const byVal = (...vals) => (e) => vals.includes(e.val);

// --------------------------------------------------- PP forms (generated)

function ppCode(op) {
  const f = op.code.toString(8).padStart(2, '0');
  switch (op.fmt) {
    case 'none': return (op.fixed ?? op.code << 6).toString(8).padStart(4, '0');
    case 'optd': return `${f}${(op.base >> 3).toString(8)}d`;
    case 'c18': return `${f}cc cccc`;
    case 'md': return `${f}dd mmmm`;
    case 'mdr': return op.flag ? `${f}(40+c) mmmm` : `${f}${/^[AIFE]JM|IAM|OAM|FNC$/.test(op.name) ? 'cc' : 'dd'} mmmm`;
    case 'rel': return `${f}rr`;
    case 'shift': return `${f}rr`;
    default: return /^(IAN|OAN|ACN|DCN|FAN)$/.test(op.name) ? `${f}cc` : `${f}dd`;
  }
}

function ppForm(op) {
  const n = op.name;
  switch (op.fmt) {
    case 'none': return n;
    case 'optd': return `${n} [d]`;
    case 'c18': return `${n} c`;
    case 'md': return `${n} m[,d]`;
    case 'mdr': return /JM$|^(IAM|OAM|FNC|SCF|CCF|SFM|CFM)$/.test(n) ? `${n} m,c` : `${n} m,d`;
    case 'rel': return `${n} r`;
    case 'shift': return `${n} ±r`;
    default: return /^(IAN|OAN|ACN|DCN|FAN)$/.test(n) ? `${n} c` : `${n} d`;
  }
}

const PP_MACHINE = { 7: '7600 (PPU)', 8: '8xx' };

function ppFormsTable(filter = () => true) {
  const rows = [];
  for (const op of PP_OPS.values()) {
    if (!op.builtin || !filter(op)) continue;
    const words = ['c18', 'md', 'mdr'].includes(op.fmt) ? 2 : 1;
    const cyber = op.flag || op.name === 'MXN' || op.name === 'MAN';
    const t = op.machine || cyber ? '—' : PP_TIMES[op.code];
    rows.push([c(ppForm(op)), `<span class="mono">${ppCode(op)}</span>`, `${words}`, `${t}`, PP_MACHINE[op.machine] || (cyber ? 'Cyber 170' : 'all')]);
  }
  return T(rows, ['Form', 'Code', 'Words', 'µs', 'Machines']);
}

const ppNames = (...names) => (op) => names.includes(op.name);

// ------------------------------------------------------ CPU architecture

const ARCHI = [
  {
    id: 'cpu-registers', title: 'Central processor registers', keys: [],
    html: `
<p>The 6600 central processor has 24 operating registers and the program address register:</p>
${T([
  ['X0–X7', '60', 'Operand registers. Every arithmetic or logical operation reads and writes X registers.'],
  ['A0–A7', '18', 'Address registers. Setting A1 to A5 reads the word at address (Ai) into Xi; setting A6 or A7 writes Xi to address (Ai). A0 has no X register attached: it is a scratch register and the central memory address for ECS block transfers.'],
  ['B0–B7', '18', 'Index registers. B0 always holds +0 (a write to B0 has no effect). By convention, B1 = 1 in NOS programs (see ' + see('ps-b1', 'B1=1') + ').'],
  ['P', '18', 'Address of the current instruction word, relative to RA.'],
  ['RA, FL', '18', 'Reference address and field length in central memory: every relative address a must satisfy 0 ≤ a &lt; FL; the absolute address is RA + a.'],
  ['RAE, FLE', '—', 'Reference address and field length in extended core storage (ECS), in units of 1000B words.'],
  ['EM', '—', 'Exit mode: error conditions that cause an error exit (see ' + see('cpu-exchange', 'exchange package') + ').'],
  ['MA', '18', 'Address of the monitor exchange package (CEJ/MEJ option).'],
], ['Register', 'Bits', 'Use'])}
<p>In a CPU program, registers are written ${c('An')}, ${c('Bn')}, ${c('Xn')} with a digit from 0 to 7, or
${c('A.n')}, ${c('B.n')}, ${c('X.n')} where n is an absolute expression (useful in macros); a value above 7 is truncated
to 3 bits. Names that look like registers (${c('A1')}, ${c('X7')}…) cannot be used as symbols in a CPU instruction.
In a PP program they are ordinary symbols. See also ${see('lang-registers', 'Registers in the language')}.</p>
${ex(`
          SA1    TAB          A1 = TAB, X1 = (TAB)
          SX6    X1+1         X6 = (X1) + 1
          SA6    A1           STORE X6 AT TAB
          SB2    B1+B1        B2 = 2 (B1 = 1 BY CONVENTION)
          SX.6   0            X.6 IS X6
TAB       BSSZ   1`)}`,
  },
  {
    id: 'cpu-formats', title: 'Instruction formats and parcels', keys: [],
    html: `
<p>A 60-bit word holds four 15-bit <b>parcels</b>: parcel 0 (bits 59–45), 1 (44–30), 2 (29–15) and 3 (14–0).
An instruction takes one parcel (15 bits) or two (30 bits):</p>
${src(`
 15 BITS                          30 BITS
 14     9 8   6 5   3 2   0       29    24 23  21 20  18 17              0
+--------+-----+-----+-----+     +--------+-----+-----+-------------------+
|   fm   |  i  |  j  |  k  |     |   fm   |  i  |  j  |         K         |
+--------+-----+-----+-----+     +--------+-----+-----+-------------------+`)}
${T([
  ['fm', '6', 'operation code (two octal digits)'],
  ['fmi', '9', 'extended code when i is part of the code (010 RJ, 011 RE, 012 WE, 013 XJ, 030–037 X-register branches, 464–467 CMU)'],
  ['i, j, k', '3', 'register designators'],
  ['jk', '6', 'shift count or mask length (LX, AX, MX)'],
  ['K', '18', 'constant, address or branch target; a negative value is stored as its 18-bit ones\' complement'],
], ['Field', 'Bits', 'Contents'])}
<p>Codes are written ${c('fmijk')} (five digits) for a 15-bit instruction and ${c('fmijK')} for a 30-bit instruction:
${c('0400K')} means fm = 04, i = 0, j = 0, followed by the 18 bits of K. The legal arrangements in a word are
15/15/15/15, 30/15/15, 15/30/15, 15/15/30 and 30/30: the assembler never places a 30-bit instruction in parcel 3.</p>
${h4('30-bit instruction in parcel 3')}
<p>COMPASS never generates one, but a program can build one. On the 6600 (emulator models ${c('6600')} and
${c('6600CEJ')}), the second half of the instruction is taken from parcel 0 of the same word; on the 6400, the 6500
and the emulated Cyber 70/170 models, it is an error exit.</p>
${h4('Force upper')}
<p>Some instructions must start in parcel 0, or require the next one to start there. The assembler then fills the rest
of the current word: 15 bits left → ${c('46000')} (NO); 30 bits → ${c('61000 46000')} (${c('SB0 B0+46000B')}, no effect);
45 bits → ${c('46000')} then ${c('61000 46000')}.</p>
${T([
  ['before', 'a 30-bit instruction that does not fit in the rest of the word; an instruction with a location symbol or a + in the location field; PS, XJ, RE, WE, RL, WL, IM, DM, CC, CU; the pseudo instructions BSS, BSSZ, DATA, DIS, CON, END, IDENT, ORG, ORGC, LOC, SEG, SEGMENT, MD, R='],
  ['after', 'JP, RJ, EQ K and ZR K (unconditional jumps), PS, XJ, IM; MJ and ES (7600)'],
], ['Force upper', 'Cases'])}
<p>A force upper after an instruction is deferred: it happens at the next machine instruction or generating pseudo
instruction in the same block. A ${c('-')} in the location field cancels the force upper. Details:
${see('lang-force', 'Force upper')}.</p>
${ex(`
          SX6    1            30 BITS, PARCELS 0-1
          SX7    2            30 BITS, PARCELS 2-3
          BX1    X6           PARCEL 0 OF THE NEXT WORD
          EQ     NEXT         30 BITS, THEN FORCE UPPER
NEXT      SA6    TAB          LOCATION SYMBOL: NEW WORD
          BX7    X1
-         SA7    TAB+1        THE - CANCELS FORCE UPPER
TAB       BSS    2`)}`,
  },
  {
    id: 'cpu-syntax', title: 'COMPASS syntax of CPU instructions', keys: [],
    html: `
<p>The operation field holds a two-letter mnemonic, followed where applicable by the number of the result register
(${c('SA1')}, ${c('BX6')}, ${c('LX3')}). The variable field holds subfields separated by commas; each is a register,
a register preceded by ${c('-')}, two registers joined by an operator (${c('+ - * /')}), or an expression. The assembler
identifies the instruction from the <b>shape</b> of the variable field — register types, their order and their
operators — and not from the mnemonic alone: ${c('RX1 X2+X3')} (rounded add, 34) and ${c('RX1 X2')} (LCM read, 014)
are two different instructions. An unknown shape gives error ${c('O')}.</p>
${h4('Expression containing a register')}
<p>In 30-bit instructions, the register may appear anywhere in the expression, preceded by ${c('+')}: the other terms
form K. ${c('SA2 3+B1')}, ${c('SA2 B1+3')} and ${c('SB2 3+B1+6')} are accepted. A negative K is stored as its 18-bit
ones' complement: ${c('SX1 X2-XRAY-1')} with XRAY = 407B gives ${c('7212 777367')}.</p>
${ex(`
XRAY      EQU    407B
          SA2    3+B1         51210 00003
          SB2    3+B1+6       61210 00011
          SX1    X2-XRAY-1    7212 777367`)}
${h4('Separators')}
<p>A blank may replace the comma between subfields, and subfields may be written in the operation field, each preceded
by a comma. These forms are equivalent:</p>
${ex(`
          UX1    B2,X3
          UX1,B2 X3
          EQ     B2,B3,NEXT
          EQ,B2  B3,NEXT
NEXT      BSS    0`)}
<p>Unless otherwise noted, subfields can be in any order (${c('LX1 B2,X3')} = ${c('LX1 X3,B2')}). The B-register
branches are the exception: there, the register order is significant.</p>
${h4('Shift count jk')}
<p>jk is an absolute expression. A value from −60 to −0 is increased by 60 (${c('LX1 -12B')} gives jk = 62B, a right
rotation by 10); a value below −60 or above 63 gives error ${c('7')} and only the low 6 bits are kept.</p>
${ex(`
          LX1    -12B         20162
          MX2    -70          ERROR 7: OUT OF RANGE`, { errors: ['7'] })}
${h4('Choice of encoding')}
<p>The assembler never optimizes for size: ${c('SX6 0')} and ${c('SA1 B2+0')} remain 30-bit instructions. To get the
short form when the value allows it, use ${see('ps-r', 'R=')}. Opdefs (${see('ps-opdef', 'OPDEF')}) can redefine any
form, and ${see('ps-cpop', 'CPOP')} can add new forms.</p>
${h4('Target machine')}
<p>Without ${see('ps-machine', 'MACHINE')}, every instruction is defined. Instructions specific to the 7600 or to the
8xx models assemble, but execute properly only on the corresponding machine.</p>`,
  },
  {
    id: 'cpu-integers', title: 'Ones\' complement integer arithmetic', keys: [],
    html: `
<p>The 6600 computes in <b>ones' complement</b>: the negative of a number is its bitwise complement; there are two
zeros, +0 (all bits 0) and −0 (all bits 1).</p>
${ul([
  'The adders are <b>subtractive</b>: on 18 bits (SA, SB, SX, JP, B-register branches), the result is −0 only for −0 + −0, or for −0 − (+0). On 60 bits (IX), the same rule applies. Overflow is ignored.',
  'An operand taken from Xj by SA, SB or SX supplies its low 18 bits.',
  'SX extends bit 17 of the result through bits 59–18 of Xi.',
  'ZR and NZ on an X register treat +0 and −0 as zero; PL and NG test bit 59 only.',
  'B-register comparisons (04–07) use 19 bits: +0 and −0 differ, and +0 is greater than −0.',
])}
${ex(`
          SX1    -1           X1 = 7777...7776
          SX2    1
          IX6    X1+X2        +0 (SUBTRACTIVE ADDER)
          SB3    B0-B0        +0`)}
<p>Assembler expressions use the same 60-bit ones' complement arithmetic: see ${see('lang-expressions', 'Expressions')}.</p>`,
  },
  {
    id: 'cpu-floating', title: 'Floating-point format', keys: [],
    html: `
${src(`
 59  58          48 47                                      0
+---+--------------+-----------------------------------------+
| S | EXPONENT     |  COEFFICIENT (48-BIT INTEGER)           |
+---+--------------+-----------------------------------------+`)}
${ul([
  'The value is C × 2<sup>e</sup>: the coefficient C is a 48-bit integer (binary point to the right of bit 0).',
  'The exponent is stored in 11 bits with a bias of 2000B: a positive number with exponent e holds e + 2000B in bits 58–48.',
  'A negative number is the ones\' complement of the whole word of its absolute value.',
  'A number is <b>normalized</b> when bit 47 differs from bit 59.',
  'Double precision: the lower part (DX) has an exponent 48 lower than the upper part.',
])}
${T([
  ['3777', 'positive infinite (overflow)'], ['4000', 'negative infinite'],
  ['1777', 'positive indefinite'], ['6000', 'negative indefinite'],
  ['0000 / 7777', 'exponent −1777B: underflow, treated as zero'],
], ['Top 12 bits', 'Meaning'])}
<p>Special results: overflow gives infinite, underflow gives zero; ∞ − ∞, ∞ × 0, 0 / 0 and ∞ / ∞ give indefinite;
x / 0 gives infinite; any operation on an indefinite operand gives indefinite. On the 6600, an error exit occurs when
an infinite or indefinite operand is <b>used</b>, if the exit mode selects it.</p>
<p>Floating-point constants are written in ${see('ps-data', 'DATA')} and in literals: ${c('1.5')}, ${c('3.0E10')},
${c('1.0EE-3')} (double precision); see ${see('lang-numeric-data', 'Numeric data')}.</p>
${ex(`
          SA1    =1.5
          SA2    =2.0
          FX6    X1*X2        3.0 (UNROUNDED)
          NX6    X6           NORMALIZE
          SA6    R
R         BSS    1`)}`,
  },
  {
    id: 'cpu-exchange', title: 'Exchange package, exit mode and error exit', keys: [],
    html: `
<p>The exchange package takes 16 words at an absolute address. ${c('XJ')} (CPU) or ${c('EXN')} (PP) swaps the
whole CPU state with it.</p>
${T([
  ['0', 'P (bits 53–36), A0 (35–18), B0 (17–0, stored as 0)'],
  ['1', 'RA (53–36), A1, B1'], ['2', 'FL (53–36), A2, B2'], ['3', 'EM (53–36), A3, B3'],
  ['4', 'RAE (59–36), A4, B4'], ['5', 'FLE (59–36), A5, B5'], ['6', 'MA (53–36), A6, B6'], ['7', 'A7, B7'],
  ['10–17', 'X0 to X7'],
], ['Word', 'Contents'])}
${T([
  ['010000B (bit 48)', 'address out of range'],
  ['020000B (bit 49)', 'operand out of range (infinite)'],
  ['040000B (bit 50)', 'indefinite operand'],
], ['Exit mode', 'Condition'])}
<p><b>6600 error exit</b>: when a selected condition occurs, the CPU writes at RA+0 a word holding the condition
(bits 59–48) and P+1 (bits 47–30), sets P to 0 and stops. The word at RA starts with 00 (PS): restarting the CPU stops
it again. With the CEJ/MEJ option (model ${c('6600CEJ')} and Cyber models), the CPU exchanges to MA instead.
An out-of-range address whose condition is not selected is ignored: the store does not happen, the read returns zero.</p>
<p>The IDE mini system reports error exits in the job dayfile; see ${see('sys-intro', 'System text')}.</p>`,
  },
  {
    id: 'cpu-units', title: '6600 functional units and execution times', keys: [],
    html: `
<p>The 6600 issues at most one instruction per minor cycle (100 ns) to ten functional units. An instruction issues if
its unit is free and its result register is not reserved (first-order conflict); it then waits for its operands
(second-order conflict). After a branch, nothing issues until the branch is resolved. The emulator reproduces this
model (scoreboard) for timing.</p>
${T([
  ['Branch', '00, 01, 02, 03x, 04–07', 'RJ 14; JP 14; X branches 9 (target in the stack) or 14; B branches 8 or 14'],
  ['Boolean', '10–17', '3'],
  ['Shift', '20–23, 26, 27, 43', '3'],
  ['Shift (normalize)', '24, 25', '4'],
  ['Floating add', '30–35', '4'],
  ['Long add', '36, 37', '3'],
  ['Multiply (×2)', '40–42', '10'],
  ['Divide', '44, 45; 47', '29; 8'],
  ['Increment (×2)', '50–77', '3; a memory read delivers Xi at least 5 cycles later'],
  ['—', '46', 'issue only'],
], ['Unit', 'Codes', 'Time (100 ns cycles)'])}
${h4('Instruction stack')}
<p>The 6600 keeps the last 8 instruction words in a stack. A loop that fits in it (up to 26 15-bit instructions and
one 30-bit instruction) runs without reading memory again. JP and RJ void the stack; the conditional branches 03–07 do
not. A consequence reproduced by the emulator: an instruction modified by the program inside a loop already in the
stack is not seen.</p>`,
  },
  {
    id: 'cpu-models', title: 'Emulator CPU models', keys: [],
    html: `
${T([
  ['6600', '8-word stack, scoreboard, no CEJ/MEJ (XJ unavailable), 30-bit instruction in parcel 3 wraps'],
  ['6600CEJ', 'same, with the CEJ/MEJ option (XJ, error exit by exchange)'],
  ['6400, 6500', 'unified arithmetic unit, sequential execution'],
  ['cyber73, cyber173', 'CEJ/MEJ and CMU (IM, DM, CC, CU)'],
  ['cyber175', '12-word stack, 175 floating-point arithmetic'],
], ['Model', 'Features'])}
<p>The model is selected in the IDE settings or with ${c('--model')} on the command line. On the assembler side, the
${see('ps-machine', 'MACHINE')} pseudo instruction restricts the recognized instruction set.</p>`,
  },
];

// -------------------------------------------------------- CPU instructions

const CPU_INSTR = [
  {
    id: 'cpu-ps', title: 'PS — program stop (00)', keys: ['PS', 'ES'], syntax: ['[name] PS', '[name] PS K'],
    html: `
${cpuFormsTable(byVal(0o000))}
<p>On the 6000 series, the CPU <b>stops</b>; only an exchange jump (EXN from a PP) restarts it. With the CEJ/MEJ option,
PS exchanges to MA. Force upper before and after. The location field text becomes the listing sub-subtitle.</p>
<p>${c('ES')} (7600 error exit, 15 bits, ${c('00000')}) does not exist on the 6600: its code is that of PS.</p>
${ex(`
END1      PS                  STOP
          PS     77B          K IN THE LOW 18 BITS`)}`,
  },
  {
    id: 'cpu-rj', title: 'RJ — return jump (0100K)', keys: ['RJ'], syntax: ['RJ K'],
    html: `
${cpuFormsTable(byVal(0o010))}
<p>Writes at K the word ${c('0400 P+1')} followed by 30 zero bits, that is ${c('EQ P+1')} where P+1 is the address of the
word after the RJ, then continues at K+1. Instructions after RJ in the same word are not executed; the stack is voided;
force upper after. The subroutine returns with ${c('EQ K')} to its entry word.</p>
${ex(`
          RJ     SUB          CALL
          SA6    R
          PS
SUB       EQ     *+1S17       ENTRY WORD (OVERWRITTEN BY RJ)
          SX6    5
          EQ     SUB          RETURN
R         BSS    1`)}
<p>The system text provides the ${see('sys-subr', 'SUBR')} macro, which generates this entry word.</p>`,
  },
  {
    id: 'cpu-ecs', title: 'RE, WE — block transfers with ECS (011, 012)', keys: ['RE', 'WE', 'RL', 'WL'],
    syntax: ['RE Bj', 'RE K', 'RE Bj+K', 'WE Bj', 'WE K', 'WE Bj+K'],
    html: `
${cpuFormsTable(byVal(0o011, 0o012))}
${ul([
  'Word count = (Bj) + K; ECS address = (X0) + RAE; central memory address = (A0) + RA.',
  'On success, execution continues at the start of the next word.',
  'On error (address outside the ECS field, bank unavailable), execution continues in the <b>lower half</b> of the word holding RE or WE: it must hold a jump to the error routine.',
  'Out-of-range read: valid addresses are transferred and zeros are stored in central memory.',
  'Force upper before: RE and WE always start in parcel 0.',
  'RL and WL (7600 LCM) have the same codes.',
])}
${ex(`
          SX0    0            ECS ADDRESS
          SA0    BUFFER       CM ADDRESS
          SB7    10B
          RE     B7           READ 10B WORDS
          EQ     ERROR        LOWER HALF: ERROR
          PS
ERROR     PS
BUFFER    BSS    10B`)}`,
  },
  {
    id: 'cpu-xj', title: 'XJ — exchange jump (013)', keys: ['XJ', 'MJ'], syntax: ['XJ', 'XJ Bj', 'XJ K', 'XJ Bj+K'],
    html: `
${cpuFormsTable(byVal(0o013))}
<p>XJ always exchanges the CPU with an exchange package (${see('cpu-exchange', 'exchange package')}). If the monitor flag
is clear, the package is at address MA and the flag is set; if it is set, the package is at (Bj)+K (absolute address)
and the flag is cleared. XJ exists only with the CEJ/MEJ option (model ${c('6600CEJ')}, Cyber models); on a 6600
without it, it is an illegal instruction. Force upper before and after. ${c('MJ')} is the 7600 equivalent.</p>
${ex(`
          XJ                  CALL THE MONITOR
          XJ     B5+600B`)}`,
  },
  {
    id: 'cpu-7600', title: '7600 and LCM instructions (014–017)', keys: ['WX', 'TB', 'IB', 'OB', 'RI', 'RO'],
    syntax: ['RXj Xk', 'WXj Xk', 'RI Bk', 'TBj', 'IBj Bk', 'RO Bk', 'OBj Bk'],
    html: `
${cpuFormsTable(byVal(0o014, 0o015, 0o016, 0o017))}
<p>Direct read and write of one word in LCM (7600) or UEM (8xx) at address (Xk), and 7600 channel buffer control. These
instructions assemble for every machine but do not exist on the 6600: the emulator treats them as illegal. The
assembler tells ${c('RXj Xk')} (014) from ${c('RXi Xj+Xk')} (34) by the shape of the variable field.</p>`,
  },
  {
    id: 'cpu-jp', title: 'JP — computed jump (02)', keys: ['JP'], syntax: ['JP K', 'JP Bi', 'JP Bi+K'],
    html: `
${cpuFormsTable(byVal(0o020))}
<p>Jumps to (Bi) + K, computed in 18-bit ones' complement; the assembler sets j = i. It is the only computed jump.
The following instructions of the word are not executed; the stack is voided; force upper after.</p>
${ex(`
          SB5    TABLE
          SB6    1
          JP     B5+B6        ILLEGAL: TWO REGISTERS
TABLE     BSS    2`, { errors: ['O'] })}
${ex(`
          SA1    INDEX
          SB6    X1
          JP     B6+TABLE     JUMP INTO THE TABLE
TABLE     EQ     CASE0
          EQ     CASE1
CASE0     PS
CASE1     PS
INDEX     CON    1`)}`,
  },
  {
    id: 'cpu-brx', title: 'ZR, NZ, PL, NG, IR, OR, DF, ID — X-register branches (030–037)',
    keys: ['ZR', 'NZ', 'PL', 'NG', 'MI', 'IR', 'OR', 'DF', 'ID'], syntax: ['ZR Xj,K', 'NZ Xj,K', 'PL Xj,K', 'NG Xj,K', 'MI Xj,K', 'IR Xj,K', 'OR Xj,K', 'DF Xj,K', 'ID Xj,K'],
    html: `
${cpuFormsTable((e) => (e.val >> 3) === 0o03)}
${T([
  ['ZR', '030', '(Xj) = 0: +0 or −0'], ['NZ', '031', '(Xj) ≠ 0 (neither +0 nor −0)'],
  ['PL', '032', 'bit 59 = 0'], ['NG, MI', '033', 'bit 59 = 1'],
  ['IR', '034', 'in range: top 12 bits other than 3777 and 4000'], ['OR', '035', 'out of range (infinite)'],
  ['DF', '036', 'definite: top 12 bits other than 1777 and 6000'], ['ID', '037', 'indefinite'],
], ['Mnemonic', 'Code', 'Jump if'])}
<p>These branches do not void the stack. ZR, NZ, PL, NG and MI also exist in B form: the assembler chooses 03x if the
first subfield is an X register, 04–07 if it is a B register (${see('cpu-brb', 'B-register branches')}), and
${c('0400K')} if the field holds only K (${c('ZR K')} is an unconditional jump, with force upper after).</p>
${ex(`
          SA1    VAL
          ZR     X1,ZERO      ZERO VALUE
          NG     X1,NEG       NEGATIVE VALUE
          ID     X1,INDEF     INDEFINITE
          PS
ZERO      PS
NEG       PS
INDEF     PS
VAL       CON    -5`)}`,
  },
  {
    id: 'cpu-brb', title: 'EQ, NE, GE, LT, LE, GT — B-register branches (04–07)',
    keys: ['EQ', 'NE', 'GE', 'LT', 'LE', 'GT'], syntax: ['EQ K', 'EQ Bi,K', 'EQ Bi,Bj,K', 'NE Bi,Bj,K', 'GE Bi,Bj,K', 'LT Bi,Bj,K', 'LE Bj,Bi,K', 'GT Bj,Bi,K'],
    html: `
${cpuFormsTable(byFm(0o04, 0o05, 0o06, 0o07))}
<p><b>Operand order is significant.</b> LE and GT have no code of their own: ${c('LE Bj,Bi,K')} is a GE with the
registers reversed (06ijK), ${c('GT Bj,Bi,K')} a reversed LT (07ijK).</p>
${T([
  [c('EQ K') + ', ' + c('ZR K'), 'always (force upper after)'],
  [c('EQ Bi,K') + ', ' + c('ZR Bi,K'), '(Bi) = +0: −0 is not zero here'],
  [c('EQ Bi,Bj,K'), '(Bi) = (Bj) bit for bit'],
  [c('NE Bi,K') + ', ' + c('NZ Bi,K'), '(Bi) ≠ +0'],
  [c('GE Bi,K') + ', ' + c('PL Bi,K'), '(Bi) ≥ +0 (−0 does not jump)'],
  [c('LT Bi,K') + ', ' + c('NG Bi,K') + ', ' + c('MI Bi,K'), '(Bi) &lt; +0 (−0 jumps)'],
  [c('LE Bj,K'), '(Bj) ≤ +0'], [c('GT Bj,K'), '(Bj) &gt; +0'],
], ['Form', 'Jump if'])}
<p>The comparison uses 19 bits (sign extended by one bit): any positive value is greater than any negative value, and
+0 &gt; −0. These branches do not void the stack. Only the forms written without registers (${c('EQ K')},
${c('ZR K')}) are unconditional for force upper: ${c('EQ B0,B0,K')} is treated as a conditional branch.</p>
${ex(`
          SB2    10
          SB3    0
LOOP      SB3    B3+B1        B1 = 1
          LT     B3,B2,LOOP   WHILE B3 < B2
          GT     B3,B2,DONE   0767..
          EQ     DONE         UNCONDITIONAL
DONE      PS`)}`,
  },
  {
    id: 'cpu-bx', title: 'BX — Boolean operations (10–17)', keys: ['BX'], syntax: ['BXi Xj', 'BXi Xj*Xk', 'BXi Xj+Xk', 'BXi Xj-Xk', 'BXi -Xk', 'BXi -Xk*Xj', 'BXi -Xk+Xj', 'BXi -Xk-Xj'],
    html: `
${cpuFormsTable(byFm(0o10, 0o11, 0o12, 0o13, 0o14, 0o15, 0o16, 0o17))}
${T([
  ['10', 'Xi = Xj (the assembler sets k = j)'], ['11', 'Xi = Xj AND Xk'], ['12', 'Xi = Xj OR Xk'], ['13', 'Xi = Xj exclusive OR Xk'],
  ['14', 'Xi = NOT Xk (j = k)'], ['15', 'Xi = Xj AND NOT Xk'], ['16', 'Xi = Xj OR NOT Xk'], ['17', 'Xi = Xj exclusive OR NOT Xk (equivalence)'],
], ['Code', 'Effect'])}
<p>For 11–13, the first written register is j; for 15–17, the complemented register is k whatever its position.
A form such as ${c('BX1 X2*-X3')} does not exist (error ${c('O')}): write ${c('BX1 -X3*X2')}. Boolean unit, 3 cycles.</p>
${ex(`
          BX6    X2           10622
          BX5    X5*X3        11553
          BX6    X0-X1        13601
          BX3    -X1          14311
          BX4    -X2*X3       15432
          BX7    -X1-X3       17731`)}`,
  },
  {
    id: 'cpu-lx', title: 'LX, AX — shifts (20–23)', keys: ['LX', 'AX'], syntax: ['LXi jk', 'AXi jk', 'LXi Bj,Xk', 'AXi Bj,Xk', 'LXi Xk', 'LXi Bj', 'LXi -Bj,Xk', 'AXi -Bj'],
    html: `
${cpuFormsTable(byFm(0o20, 0o21, 0o22, 0o23))}
<p><b>LXi jk</b> (20): left circular shift of Xi by jk places. <b>AXi jk</b> (21): right arithmetic shift of Xi, the
sign is extended; a count of 60 to 63 leaves 60 copies of the sign. A negative written jk means 60 + jk:
${c('LX1 -6')} is a right rotation by 6, ${c('AX1 -n')} keeps the n high-order bits.</p>
<p><b>22 and 23</b>: Xi = Xk shifted by (Bj). For 22, if bit 17 of Bj is clear: left circular shift by the low 6 bits
of Bj; otherwise right arithmetic shift by |Bj| places (low 11 bits complemented). For 23, the reverse: right shift by
(Bj) if positive, left circular shift by |Bj| otherwise. A right shift of 60 to 63 gives 60 copies of the sign; from 64
on, Xi = 0. A ${c('-')} before Bj only selects the other code; Bj itself is used as is. Common use: ${c('AX6 B2,X6')}
after ${c('UX6 B2,X6')} to convert a coefficient according to its exponent.</p>
${ex(`
          LX3    25B          20325
          LX3    -12B         20362
          AX5    37B          21537
          LX6    X5,B7        22675
          LX5    B3,X4        22534
          AX4    B2           23424
          LX1    -B2,X3       23123`)}`,
  },
  {
    id: 'cpu-nx', title: 'NX, ZX — normalize (24, 25)', keys: ['NX', 'ZX'], syntax: ['NXi Xk', 'NXi Bj,Xk', 'NXi', 'NXi Bj', 'ZXi Bj,Xk'],
    html: `
${cpuFormsTable(byFm(0o24, 0o25))}
<p>Shifts the coefficient of Xk left by the minimum number of places that makes bit 47 differ from bit 59, filling
with the sign; the exponent is reduced accordingly and the shift count goes to Bj (discarded if j = 0). ZX rounds first:
a round bit is placed just right of the coefficient. A zero coefficient gives 48 shifts; an infinite or indefinite
operand is not shifted (Xi = Xk, Bj = 0). Shift unit, 4 cycles.</p>
${ex(`
          NX5    X5,B7        24575
          NX5    X5           24505
          NX5,B5 X2           24552
          ZX4                 25404`)}`,
  },
  {
    id: 'cpu-ux', title: 'UX, PX — unpack and pack (26, 27)', keys: ['UX', 'PX'], syntax: ['UXi Bj,Xk', 'UXi Xk', 'UXi', 'PXi Bj,Xk', 'PXi Xk', 'PXi'],
    html: `
${cpuFormsTable(byFm(0o26, 0o27))}
<p><b>UX</b>: Xi receives the coefficient of Xk (bits 47–0, sign extended through bits 59–48) and Bj the unbiased
exponent, as an 11-bit ones' complement value extended to 18 bits. <b>PX</b>: forms a floating-point number from the
coefficient of Xk (bits 47–0 and the sign in bit 59) and the exponent in Bj (bits 10–0); no normalization, no test.
${c('PXi Xk')} (j = 0) converts an integer to floating point with exponent 0: followed by ${c('NX')}, this is the
usual integer to floating-point conversion.</p>
${ex(`
          SA1    N
          PX6    X1           INTEGER -> FLOATING, EXP 0
          NX6    X6           NORMALIZE
          UX7    B2,X6        UNPACK
          LX7    B2,X7        BACK TO THE INTEGER
N         CON    1000`)}`,
  },
  {
    id: 'cpu-fadd', title: 'FX, DX, RX — floating add and subtract (30–35)', keys: ['FX', 'DX', 'RX'],
    syntax: ['FXi Xj+Xk', 'FXi Xj-Xk', 'DXi Xj+Xk', 'DXi Xj-Xk', 'RXi Xj+Xk', 'RXi Xj-Xk'],
    html: `
${cpuFormsTable(byFm(0o30, 0o31, 0o32, 0o33, 0o34, 0o35))}
<p>The coefficient with the smaller exponent is shifted right by the exponent difference, then added to the other;
a coefficient overflow shifts the result one place. <b>FX</b> returns the upper 48 bits with the larger exponent,
unnormalized; <b>DX</b> returns the lower 48 bits with an exponent 48 lower (double precision); <b>RX</b> rounds by
adding a half bit to both operands. Floating add unit, 4 cycles.</p>
${ex(`
          FX3    X4+X5        30345
          FX2    X1-X3        31213
          DX3    X2+X3        32323
          RX5    X3+X4        34534
          RX6    X5-X3        35653`)}
<p>The same mnemonics are used for multiply and divide (${see('cpu-fmul', 'FX *')}, ${see('cpu-fdiv', 'FX /')}):
the operator selects the instruction.</p>`,
  },
  {
    id: 'cpu-ix', title: 'IX — integer add and subtract (36, 37)', keys: ['IX'], syntax: ['IXi Xj+Xk', 'IXi Xj-Xk', 'IXi Xj*Xk'],
    html: `
${cpuFormsTable(byFm(0o36, 0o37))}
<p>60-bit ones' complement add and subtract; overflow is ignored. Long add unit, 3 cycles. ${c('IXi Xj*Xk')} is the
integer multiply, the same code as DX * (${see('cpu-fmul', 'multiply')}). There is no integer divide instruction:
division goes through floating point.</p>
${ex(`
          IX5    X4+X5        36545
          IX6    X3-X1        37631
          IX2    X3*X4        42234`)}`,
  },
  {
    id: 'cpu-fmul', title: 'FX, RX, DX, IX — multiply (40–42)', keys: [], syntax: ['FXi Xj*Xk', 'RXi Xj*Xk', 'DXi Xj*Xk', 'IXi Xj*Xk'],
    html: `
${cpuFormsTable(byFm(0o40, 0o41, 0o42))}
<p>The exponents are added (with a +48 correction) and the coefficients multiplied into a 96-bit product. <b>FX</b>
keeps the upper 48 bits (unrounded); <b>RX</b> adds a round bit at position 46; <b>DX</b> keeps the lower 48 bits with
an exponent 48 lower. <b>IX</b> is the same code 42: if the top 12 bits of both operands are all zeros or all ones
(integers), the result is the 48-bit integer product, sign extended. Multiply unit (two of them on the 6600),
10 cycles.</p>
${ex(`
          FX0    X1*X1        40011
          RX2    X3*X4        41234
          DX5    X6*X7        42567`)}`,
  },
  {
    id: 'cpu-mx', title: 'MX — form mask (43)', keys: ['MX'], syntax: ['MXi jk'],
    html: `
${cpuFormsTable(byFm(0o43))}
<p>Xi receives jk one bits at the top, followed by zeros. jk = 0 gives 0, jk = 60 gives a word of all ones; a negative
written jk means 60 + jk (${c('MX3 -14B')} leaves 12 zero bits on the right). A value below −60 gives error ${c('7')}.
Shift unit, 3 cycles.</p>
${ex(`
          MX3    -14B         43360
          MX0    6            43006: 6 TOP BITS
          MX1    60           ALL BITS SET`)}`,
  },
  {
    id: 'cpu-fdiv', title: 'FX, RX — floating divide (44, 45)', keys: [], syntax: ['FXi Xj/Xk', 'RXi Xj/Xk'],
    html: `
${cpuFormsTable(byFm(0o44, 0o45))}
<p>Xi = Xj / Xk; the operands must be normalized. RX rounds the quotient. Division by zero gives infinite; 0 / 0 gives
indefinite. Divide unit, 29 cycles. The assembler provides no integer divide: ${c('IXi Xj/Xk')} is not a machine
instruction (the manual describes it as a system text macro).</p>
${ex(`
          FX6    X3/X1        44631
          RX7    X2/X4        45724`)}`,
  },
  {
    id: 'cpu-no', title: 'NO — pass (46)', keys: ['NO'], syntax: ['NO', 'NO n'],
    html: `
${cpuFormsTable(byFm(0o46))}
<p>${c('NO')} gives ${c('46000')}; ${c('NO n')} puts n in the 9 bits ijk. On a CMU machine, n ≥ 400B designates a CMU
instruction. The assembler itself generates NO to fill words (${see('cpu-formats', 'force upper')}).</p>
${ex(`
          NO
          NO     7`)}`,
  },
  {
    id: 'cpu-cx', title: 'CX — population count (47)', keys: ['CX'], syntax: ['CXi Xk'],
    html: `
${cpuFormsTable(byFm(0o47))}
<p>Xi receives the number of one bits in Xk (0 to 60); the assembler sets j = k. Divide unit, 8 cycles.</p>
${ex(`
          CX7    X0           47700`)}`,
  },
  {
    id: 'cpu-sa', title: 'SA — set A register (50–57)', keys: ['SA'],
    syntax: ['SAi K', 'SAi Aj+K', 'SAi Bj+K', 'SAi Xj+K', 'SAi Xj', 'SAi Xj+Bk', 'SAi Aj', 'SAi Aj+Bk', 'SAi Aj-Bk', 'SAi Bj', 'SAi Bj+Bk', 'SAi -Bk', 'SAi Bj-Bk'],
    html: `
${cpuFormsTable(byFm(0o50, 0o51, 0o52, 0o53, 0o54, 0o55, 0o56, 0o57))}
<p>Ai receives the 18-bit result (ones' complement; an X register supplies its low 18 bits). Effect on memory:</p>
${ul([
  'i = 0: no memory reference;',
  'i = 1 to 5: <b>read</b> — Xi receives the word at address RA + (Ai);',
  'i = 6 or 7: <b>write</b> — Xi is stored at address RA + (Ai).',
])}
<p>The encoding depends on the registers in the expression: no register → 51i0K; Aj, Bj or Xj with other terms
→ 50, 51 or 52 (30 bits); registers only → 53–57 (15 bits). Any other combination (two X registers, X with A, X − B,
A or X preceded by −, two registers with a constant) is rejected (error ${c('O')}). Increment unit (two of them on the
6600), 3 cycles; the data read reaches Xi at least 5 cycles later.</p>
${ex(`
          SA1    A0+1         5010000001
          SA0    -3           5100777774
          SA3    X1-6         5231777771
          SA4    X1+B1        53411
          SA5    A4+B1        54541
          SA6    -B1+A4       55641
          SA7    B2-B1        57721`)}`,
  },
  {
    id: 'cpu-sb', title: 'SB — set B register (60–67)', keys: ['SB', 'CR', 'CW'], syntax: ['SBi K', 'SBi Aj+K', 'SBi Bj+K', 'SBi Xj+K', 'SBi Xj+Bk', 'SBi Bj+Bk', 'SBi Bj-Bk'],
    html: `
${cpuFormsTable(byFm(0o60, 0o61, 0o62, 0o63, 0o64, 0o65, 0o66, 0o67))}
<p>Same forms and encoding as ${see('cpu-sa', 'SA')}, result in Bi, no memory reference. ${c('SB0 …')} does nothing
(it is the 30-bit fill instruction). On the 8xx models, ${c('CR Xj,Xk')} (660jk) and ${c('CW Xj,Xk')} (670jk) take the
codes of ${c('SB0 Bj+Bk')} and ${c('SB0 Bj-Bk')}; on the 6600 they are SB0 instructions with no effect.</p>
${ex(`
          SB1    1            CONVENTION B1 = 1
          SB1    A1-5         6011777772
          SB2    3+B1+6       6121000011
          SB4    X2+B7        63427
          SB7    B5-B1        67751`)}`,
  },
  {
    id: 'cpu-sx', title: 'SX — set X register (70–77)', keys: ['SX'], syntax: ['SXi K', 'SXi Aj+K', 'SXi Bj+K', 'SXi Xj+K', 'SXi Xj+Bk', 'SXi Aj-Bk', 'SXi Bj+Bk', 'SXi -Bk'],
    html: `
${cpuFormsTable(byFm(0o70, 0o71, 0o72, 0o73, 0o74, 0o75, 0o76, 0o77))}
<p>Same forms as ${see('cpu-sa', 'SA')}: the 18-bit result goes to bits 17–0 of Xi and bit 17 is extended through
bits 59–18. This is the usual way to load a small constant or an address.</p>
${ex(`
          SX1    -2022B       7110775755
          SX2    B1+5         7121000005
          SX3    X3-33B       7233777744
          SX6    A0-B4        75604
          SX7    B7+B6        76776`)}`,
  },
  {
    id: 'cpu-cmu', title: 'IM, DM, CC, CU, MD — compare/move unit (CMU)', keys: ['IM', 'DM', 'CC', 'CU', 'MD'],
    syntax: ['IM K', 'IM Bj+K', '[sym] MD l,ks,cs,kd,cd', '[sym] DM l,ks,cs,kd,cd', '[sym] CC l,ka,ca,kb,cb', '[sym] CU l,ka,ca,kb,cb'],
    html: `
${cpuFormsTable(byVal(0o464))}
<p>The CMU (Cyber 70 models 72 and 73, Cyber 170 models 172 to 174; emulator models ${c('cyber73')} and
${c('cyber173')}) moves and compares strings of 6-bit characters; the characters of a word are numbered 0 to 9 from
left to right. All these instructions force upper before, IM also after; DM, CC and CU take a whole word. X0 is used as
scratch and is 0 at the end.</p>
${src(`
 MD :  59-57 000 | 56-48 l(12:4) | 47-30 ks | 29-26 l(3:0) | 25-22 cs | 21-18 cd | 17-0 kd
 DM :  59-51 465 | 50-48 l(6:4)  | 47-30 ks | 29-26 l(3:0) | 25-22 cs | 21-18 cd | 17-0 kd
 CC :  466, CU : 467 (SAME LAYOUT)`)}
${T([
  [c('IM'), 'indirect move: the descriptor (generated by MD) is at address (Bj)+K; length up to 8191 characters'],
  [c('MD'), 'pseudo instruction: generates a descriptor word for IM'],
  [c('DM'), 'direct move of l characters (l ≤ 127) from ks, character cs, to kd, character cd'],
  [c('CC'), 'compare collated, using the 8-word collating table at address (A0); X0 = l − n if A &gt; B, 0 if equal, n − l if A &lt; B (n = number of equal characters before the difference)'],
  [c('CU'), 'compare uncollated, on the raw character values'],
], ['Instruction', 'Effect'])}
${ex(`
          DM     127,BUFA,0,BUFB,5
          CC     10,BUFA,0,BUFB,0
          IM     DESC
DESC      MD     1003,BUFA,6,BUFB,5
BUFA      BSS    20
BUFB      BSS    20`)}`,
  },
  {
    id: 'cpu-table', title: 'Complete table of CPU forms', keys: [],
    html: `
<p>Every form the assembler recognizes, taken from its syntax table (same model as ${see('ps-cpop', 'CPOP')}).
Code: i, j, k are the register fields, K the 18 bits of the expression, jk a 6-bit count, n a 9-bit field.</p>
${cpuFormsTable(() => true)}`,
  },
];

// ------------------------------------------------------------------ PP

const PP = [
  {
    id: 'pp-formats', title: 'Peripheral processors: formats', keys: [],
    html: `
<p>Each of the ten 6600 PPs has 4096 12-bit words, an 18-bit accumulator A (ones' complement), a 12-bit program
address P and a Q register. They share central memory (<b>absolute</b> addresses, no RA) and the 12 input/output
channels. A PP program is assembled after ${see('ps-periph', 'PERIPH')}; it is always absolute.</p>
${src(`
 12 BITS :  11     6 5     0        24 BITS :  11     6 5     0    11              0
           +--------+-------+                  +--------+-------+  +----------------+
           |   f    |   d   |                  |   f    |   d   |  |       m        |
           +--------+-------+                  +--------+-------+  +----------------+`)}
<p>f is the operation code (6 bits), d a 6-bit operand or address, m a 12-bit word. 24-bit instructions take two
consecutive words. Times in major cycles (1 µs); each PP gets one slot per major cycle in the barrel.</p>
${h4('Designators')}
${T([
  ['d', '6-bit operand or direct address (0–77B)'],
  ['m', '12-bit expression, combined with (d): address m + (d)'],
  ['c', '18-bit constant (LDC…); in channel instructions, the channel number'],
  ['r', 'relative jump or shift count, from −37B to +37B'],
  ['( )', 'contents of; (( )): indirect'],
], ['Designator', 'Meaning'])}
<p>The third letter of the mnemonic gives the addressing mode:</p>
${T([
  ['N', 'no address: d is the operand (LDN, ADN…)'], ['D', 'direct: d is the operand address (LDD…)'],
  ['I', 'indirect: (d) is the operand address (LDI…)'], ['M', 'memory: address m + (d), or m if d = 0 (LDM…)'],
  ['C', '18-bit constant split between d and m (LDC…)'],
], ['Letter', 'Mode'])}
${h4('Operand conversion by the assembler')}
${ul([
  'd is reduced to 6 bits; m to 12 bits (a negative value is stored as its ones\' complement: −1 gives 7776B); c to 18 bits, the upper 6 bits in d and the lower 12 in m (' + c('LDC 707070B') + ' gives ' + c('2070 7070') + ').',
  'Two operands are written ' + c('m,d') + ': address or base first, index or channel second (' + c('FNC 20B,5') + ' gives ' + c('7705 0020') + ').',
  'd is optional (0 by default) for LJM, RJM and LDM to SOM; it is required for CRM, CWM, AJM, IJM, FJM, EJM, IAM, OAM and FNC.',
  'Floating-point numbers are illegal; CPU register names (A1, X2…) are ordinary symbols.',
  'No force upper ever occurs in a PP program; a + or − in the location field affects only VFD (start of a new word).',
])}
${ex(`
          LDC    707070B      2070 7070
          FNC    20B,5        7705 0020
          LDM    TAB,77B      5077 ....
          LJM    NEXT
NEXT      PSN
TAB       BSS    4`, { pp: true })}`,
  },
  {
    id: 'pp-jumps', title: 'LJM, RJM, UJN, ZJN, NJN, PJN, MJN — jumps', keys: ['LJM', 'RJM', 'UJN', 'ZJN', 'NJN', 'PJN', 'MJN'],
    syntax: ['LJM m[,d]', 'RJM m[,d]', 'UJN r', 'ZJN r', 'NJN r', 'PJN r', 'MJN r'],
    html: `
${ppFormsTable(ppNames('LJM', 'RJM', 'UJN', 'ZJN', 'NJN', 'PJN', 'MJN'))}
${T([
  ['LJM', 'P = m + (d)'], ['RJM', 'stores P+2 (return address) at m + (d), then P = m + (d) + 1'],
  ['UJN', 'P = P + r'], ['ZJN', 'jump if A = 0 (777777, i.e. −0, is not zero)'], ['NJN', 'jump if A ≠ 0'],
  ['PJN', 'jump if A ≥ 0 (bit 17 clear)'], ['MJN', 'jump if A &lt; 0 (bit 17 set)'],
], ['Instruction', 'Effect'])}
<p><b>Relative jumps.</b> d is a 6-bit ones' complement count: 01–37B jumps forward, 40–76B jumps back 77B − d words;
00 and 77 loop on themselves. Without the ${c('J')} option of PERIPH, the assembler takes the value v of the
expression: if −31 ≤ v ≤ 31, it is the displacement; otherwise it tries v − * (a tag); otherwise it is an error. With
${c('PERIPH J')}, the displacement is always v − *: the operand must be a tag. Pitfall without J: a tag whose address
is ≤ 37B is taken as a displacement.</p>
<p><b>Subroutines.</b> NOS convention: the entry word is the m part of an ${c('LJM')} placed just before the body;
RJM stores the return address there and the subroutine exits by jumping to that LJM.</p>
${ex(`
          RJM    SUB          CALL
          LDN    0
          ZJN    DONE         RELATIVE JUMP
DONE      UJN    *            LOOP IN PLACE
SUBX      LJM    *            RETURN WORD
SUB       EQU    SUBX+1
          LDN    5
          UJN    SUBX         RETURN`, { pp: true })}`,
  },
  {
    id: 'pp-shn', title: 'SHN — shift A (10)', keys: ['SHN'], syntax: ['SHN ±r'],
    html: `
${ppFormsTable(ppNames('SHN'))}
<p>r = +1 to +31: left circular shift of the 18 bits of A; r = −1 to −31: right shift without sign extension (bits
shifted out are lost); ±0: no shift. r is stored as a 6-bit ones' complement value (${c('SHN 6')} gives ${c('1006')},
${c('SHN -6')} gives ${c('1071')}). |r| &gt; 31 is an error.</p>
${ex(`
          SHN    6            1006
          SHN    -6           1071`, { pp: true })}`,
  },
  {
    id: 'pp-n', title: 'LMN, LPN, SCN, LDN, LCN, ADN, SBN — immediate operand (11–17)', keys: ['LMN', 'LPN', 'SCN', 'LDN', 'LCN', 'ADN', 'SBN'],
    syntax: ['LDN d', 'LCN d', 'ADN d', 'SBN d', 'LMN d', 'LPN d', 'SCN d'],
    html: `
${ppFormsTable(ppNames('LMN', 'LPN', 'SCN', 'LDN', 'LCN', 'ADN', 'SBN'))}
${T([
  ['LMN', 'A = A ⊕ d (upper bits unchanged)'], ['LPN', 'A = A ∧ d (the upper 12 bits are cleared)'],
  ['SCN', 'clears in A the bits set in d (upper bits unchanged)'], ['LDN', 'A = d'],
  ['LCN', 'A = ¬d on 18 bits (upper 12 bits set)'], ['ADN', 'A = A + d'], ['SBN', 'A = A − d'],
], ['Instruction', 'Effect'])}
${ex(`
          LMN    12B          1112
          LPN    7            1207
          SCN    21B          1321
          LDN    15B          1415
          ADN    1            1601
          SBN    2            1702`, { pp: true })}`,
  },
  {
    id: 'pp-c', title: 'LDC, ADC, LPC, LMC — 18-bit constant (20–23)', keys: ['LDC', 'ADC', 'LPC', 'LMC'], syntax: ['LDC c', 'ADC c', 'LPC c', 'LMC c'],
    html: `
${ppFormsTable(ppNames('LDC', 'ADC', 'LPC', 'LMC'))}
<p>The 18-bit operand is formed from d (upper 6 bits) and m (lower 12 bits). LDC loads A; ADC adds; LPC performs an
AND; LMC an exclusive OR. A negative constant is stored as its 18-bit ones' complement.</p>
${ex(`
          LDC    707070B      2070 7070
          LPC    070707B      2207 0707
          ADC    -1`, { pp: true })}`,
  },
  {
    id: 'pp-d', title: 'LDD … SOD — direct addressing (30–37)', keys: ['LDD', 'ADD', 'SBD', 'LMD', 'STD', 'RAD', 'AOD', 'SOD'], syntax: ['LDD d', 'STD d', 'RAD d', 'AOD d', 'SOD d'],
    html: `
${ppFormsTable(ppNames('LDD', 'ADD', 'SBD', 'LMD', 'STD', 'RAD', 'AOD', 'SOD'))}
${T([
  ['LDD', 'A = (d)'], ['ADD', 'A = A + (d)'], ['SBD', 'A = A − (d)'], ['LMD', 'A = A ⊕ (d), upper bits unchanged'],
  ['STD', '(d) = A (low 12 bits)'], ['RAD', 'A = A + (d), then (d) = A'], ['AOD', 'A = (d) + 1, then (d) = A'], ['SOD', 'A = (d) − 1, then (d) = A'],
], ['Instruction', 'Effect'])}
<p>The operand read from memory is a positive 12-bit integer. The "replace" instructions (RA, AO, SO) leave the 18-bit
result in A and store its low 12 bits. Locations 0–77B act as registers: they are the direct cells.</p>
${ex(`
CNT       EQU    20B
          LDN    10
          STD    CNT
LOOP      SOD    CNT          COUNT DOWN
          NJN    LOOP`, { pp: true })}`,
  },
  {
    id: 'pp-i', title: 'LDI … SOI — indirect addressing (40–47)', keys: ['LDI', 'ADI', 'SBI', 'LMI', 'STI', 'RAI', 'AOI', 'SOI'], syntax: ['LDI d', 'STI d'],
    html: `
${ppFormsTable(ppNames('LDI', 'ADI', 'SBI', 'LMI', 'STI', 'RAI', 'AOI', 'SOI'))}
<p>As the direct group, but the operand is at the address held in cell d: ((d)). Indirect addressing reaches the whole
PP memory.</p>
${ex(`
PTR       EQU    21B
          LDC    TAB
          STD    PTR
          LDI    PTR          A = (TAB)
          AOD    PTR
          LDI    PTR          A = (TAB+1)
TAB       CON    1,2`, { pp: true })}`,
  },
  {
    id: 'pp-m', title: 'LDM … SOM — indexed addressing (50–57)', keys: ['LDM', 'ADM', 'SBM', 'LMM', 'STM', 'RAM', 'AOM', 'SOM'], syntax: ['LDM m[,d]', 'STM m[,d]'],
    html: `
${ppFormsTable(ppNames('LDM', 'ADM', 'SBM', 'LMM', 'STM', 'RAM', 'AOM', 'SOM'))}
<p>The operand is at address m + (d), or m if d = 0. The addition is done on 12 bits in ones' complement: m + (d) never
reaches 7777B.</p>
${ex(`
I         EQU    22B
          LDM    TAB          5000 ....
          LDM    TAB,I        TAB+(I)
          AOM    -10B+TAB
          STM    TAB+3,I
TAB       BSS    10`, { pp: true })}`,
  },
  {
    id: 'pp-cm', title: 'CRD, CRM, CWD, CWM — central memory access (60–63)', keys: ['CRD', 'CRM', 'CWD', 'CWM'], syntax: ['CRD d', 'CRM m,d', 'CWD d', 'CWM m,d'],
    html: `
${ppFormsTable(ppNames('CRD', 'CRM', 'CWD', 'CWM'))}
${ul([
  '<b>CRD d</b>: the 60-bit word at absolute address (A) is split into 5 12-bit words stored at d … d+4 (most significant first). A is unchanged.',
  '<b>CWD d</b>: the 5 words d … d+4 form the word stored at address (A).',
  '<b>CRM m,d</b>: reads (d) words starting at address (A) into m, m+1… (5 PP words per CM word). P is saved in location 0 during the transfer and reloaded from that location at the end: changing location 0 changes the return point.',
  '<b>CWM m,d</b>: the symmetrical write.',
  'Central memory addresses are absolute (no RA on the PP side). A must hold the 18-bit address: it is usually loaded with ' + c('LDD') + ' and ' + c('SHN') + ' or with ' + c('LDC') + '.',
])}
${ex(`
WORD      EQU    30B          30B-34B: ONE CM WORD
NW        EQU    35B
          LDC    2000B        CM ADDRESS
          CRD    WORD         READ ONE WORD
          LDN    4
          STD    NW
          LDC    2000B
          CRM    BUFFER,NW    READ 4 WORDS
BUFFER    BSS    20`, { pp: true })}`,
  },
  {
    id: 'pp-channel-jumps', title: 'AJM, IJM, FJM, EJM — jumps on channel status (64–67)', keys: ['AJM', 'IJM', 'FJM', 'EJM', 'SCF', 'CCF', 'SFM', 'CFM'],
    syntax: ['AJM m,c', 'IJM m,c', 'FJM m,c', 'EJM m,c'],
    html: `
${ppFormsTable(ppNames('AJM', 'IJM', 'FJM', 'EJM', 'SCF', 'CCF', 'SFM', 'CFM'))}
<p>Jump to m if channel c is active (AJM), inactive (IJM), full (FJM) or empty (EJM). "Full": on input, the device has
delivered a word the PP has not taken yet; on output, the PP has written a word the device has not accepted yet.
Common use: ${c('IJM *,c')} or ${c('FJM *,c')} to wait. SCF, CCF, SFM and CFM (Cyber 170 channel flags) use a 5-bit d
with bit 40B set; they do not exist on the 6600.</p>
${ex(`
CH        EQU    13B
          AJM    *,CH         WAIT UNTIL THE CHANNEL IS FREE
          FJM    FULL,CH
FULL      PSN`, { pp: true })}`,
  },
  {
    id: 'pp-io', title: 'IAN, IAM, OAN, OAM — input and output (70–73)', keys: ['IAN', 'IAM', 'OAN', 'OAM'], syntax: ['IAN c', 'IAM m,c', 'OAN c', 'OAM m,c'],
    html: `
${ppFormsTable(ppNames('IAN', 'IAM', 'OAN', 'OAM'))}
${ul([
  '<b>IAN c</b>: A receives one word from the channel (upper bits cleared). <b>OAN c</b>: sends the low 12 bits of A. If the channel is inactive, the PP hangs until another PP activates it (or until deadstart).',
  '<b>IAM m,c</b>: reads at most (A) words into m, m+1…; A decreases by one per word. <b>OAM m,c</b>: writes (A) words.',
  'The transfer stops when A = 0 or when the channel becomes inactive (the device disconnects): A then holds the number of words not transferred, and for IAM the next word of the area is set to 0.',
  'If the channel is already inactive at the start, nothing is transferred and execution continues (for IAM, location m is set to 0).',
  'As for CRM, P is saved in location 0 during the transfer.',
  'At deadstart, the PPs other than PP0 wait in IAM on their channel: a word sent on that channel loads them from address 1.',
])}
${ex(`
CH        EQU    12B
          FNC    702B,CH      READ ONE CARD
          ACN    CH
          LDC    80D
          IAM    CARD,CH      80 COLUMNS
          NJN    EMPTY        A NONZERO: HOPPER EMPTY
          DCN    CH
EMPTY     PSN
CARD      BSS    80D`, { pp: true })}
<p>The functions of the emulated devices are described in the <i>Peripherals and channels</i> page of the Workbench
part.</p>`,
  },
  {
    id: 'pp-ctl', title: 'ACN, DCN, FAN, FNC — channel control (74–77)', keys: ['ACN', 'DCN', 'FAN', 'FNC'], syntax: ['ACN c', 'DCN c', 'FAN c', 'FNC m,c'],
    html: `
${ppFormsTable(ppNames('ACN', 'DCN', 'FAN', 'FNC'))}
${ul([
  '<b>ACN</b> activates the channel; activating a channel that is already active hangs the PP.',
  '<b>DCN</b> deactivates the channel; deactivating an inactive channel hangs the PP.',
  '<b>FAN</b> sends the low 12 bits of A as a function code; <b>FNC m,c</b> sends m. A function on an active channel hangs the PP.',
])}
${ex(`
CHC       EQU    10B          CONSOLE
          FNC    7001B,CHC    LEFT SCREEN, MEDIUM CHARACTERS
          ACN    CHC
          LDN    4
          OAM    TEXT,CHC
          DCN    CHC
TEXT      CON    6100B,7400B
          DIS    2,HELLO`, { pp: true })}`,
  },
  {
    id: 'pp-cpu', title: 'EXN, MXN, MAN, RPN — CPU communication (26, 27)', keys: ['EXN', 'MXN', 'MAN', 'RPN'], syntax: ['EXN [d]', 'MXN [d]', 'MAN [d]', 'RPN [d]'],
    html: `
${ppFormsTable(ppNames('EXN', 'MXN', 'MAN', 'RPN'))}
${ul([
  '<b>EXN</b>: asks the CPU to exchange with the package at absolute address (A); the PP is not interrupted. This is how the monitor starts a program.',
  '<b>MXN</b>, <b>MAN</b>: Cyber 170 conditional exchanges (monitor flag); MAN takes the address from MA. Not on the 6600.',
  '<b>RPN</b>: A receives the P register of the CPU.',
  'd selects the CPU in a dual-CPU system; it is ignored otherwise.',
])}
${ex(`
          LDC    1000B        EXCHANGE PACKAGE
          EXN                 START THE CPU
          RPN                 A = P OF THE CPU`, { pp: true })}`,
  },
  {
    id: 'pp-psn', title: 'PSN and instructions of other machines', keys: ['PSN', 'LRD', 'SRD', 'ESN', 'RFN'], syntax: ['PSN'],
    html: `
${ppFormsTable(ppNames('PSN', 'LRD', 'SRD', 'ESN', 'RFN'))}
<p>${c('PSN')} (2400) does nothing. The unused codes 00, 25 and 27xx are passes on the 6000 series too. LRD and SRD
(R register of the 8xx models), ESN and RFN (7600 PPU) assemble but have no meaning on the 6600.</p>
${ex(`
          PSN`, { pp: true })}`,
  },
  {
    id: 'pp-table', title: 'Complete table of PP instructions', keys: [],
    html: `
<p>Every PP instruction recognized by the assembler, taken from its table (same model as ${see('ps-ppop', 'PPOP')}).
6600 times in microseconds; block instructions (CRM, CWM, IAM, OAM) take one more cycle per word.</p>
${ppFormsTable()}`,
  },
];

export const CHAPTERS = [
  { id: 'cpu-ch-machine', title: 'Central processor architecture', entries: ARCHI },
  { id: 'cpu-ch-instr', title: 'CPU instructions', entries: CPU_INSTR },
  { id: 'pp-ch-instr', title: 'PP instructions', entries: PP },
];

export { esc };
