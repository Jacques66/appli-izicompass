// COMPASS 3 reference: pseudo instructions, part B (manual 60492600,
// sections 4.9 to 4.11, chapters 5, 6 and 7). Conditional assembly, error
// control, listing control, external text, remote code, duplication, macros
// and opdefs, operation code table management, micros. The behavior described
// is that of the project's assembler (src/asm); differences from the manual
// are flagged. Every ex() example is assembled by the tests.

import { c, src, ex, T, see, note, ul, h4 } from './fmt.js';

const p = (s) => `<p>${s}</p>`;
const diff = (s) => note(`<strong>Difference from the manual.</strong> ${s}`);

export const CHAPTERS = [];

// =====================================================================
// Conditional assembly
// =====================================================================

const SAUT = {
  id: 'ps-skipping',
  title: 'The conditional assembly skip machine',
  keys: [],
  syntax: [
    '[name]    IFxx   ...,[n]    false condition: start skipping',
    '[name]    SKIP   [n]        unconditional skip',
    '[name]    ELSE   [n]        assembling: start skipping; skipping: may end the skip',
    '[name]    ENDIF             skip without count: may end the skip',
  ],
  html: `
${p(`All conditional pseudo instructions (${see('ps-ifop', 'IFEQ...IFLE')}, ${see('ps-ifpl', 'IFPL, IFMI')},
${see('ps-iftype', 'IFCP...IFPP7')}, ${see('ps-if', 'IF')}, ${see('ps-ifc', 'IFC')}, ${see('ps-skip', 'SKIP')},
${see('ps-else', 'ELSE')}, ${see('ps-endif', 'ENDIF')}) drive one state machine, described here once.`)}
${h4('Evaluation in pass one')}
${p(`All tests are evaluated during pass one, as the statements are read. Pass two replays only the statements that
were assembled: no condition is evaluated again (only ${see('ps-errxx', 'ERRxx')} is tested in pass two). Consequently:`)}
${ul([
  'a relocatable symbol has its value relative to the USE block in which it is defined;',
  'a symbol declared external has the value 0; a symbol defined relative to an external has its relative value;',
  `a symbol defined later in the program is still undefined (forward reference): the test flags it with ${c('U')}, except for the attributes that accept undefined symbols (${c('DEF')}, ${c('REG')}, ${c('EXT')});`,
  `a symbol that exists only through an ${c('=S')} or ${c('=X')} prefix is not defined until the end of the assembly: IF tests treat it as undefined.`,
])}
${h4('State')}
${p(`COMPASS keeps no stack of IF nesting. The state is either <i>assembling</i> (normal state) or <i>skipping</i>,
with three items: a name (blank or 1 to 8 characters, taken from the location field of the statement that started the
skip), a skip count (positive integer, or none) and the origin (IF, SKIP or ELSE). A <b>true</b> test records nothing:
its name and its count have no effect.`)}
${T([
  ['True test', 'No state change; any count is ignored.'],
  ['False test', 'Start skipping: name = location field of the test, count = its count.'],
  ['Test in error', 'The line is flagged (U, A, O...) and <b>no skip</b> starts: assembly continues with the next statement.'],
  ['SKIP', 'Start skipping, as for a false test.'],
  ['ELSE', 'Start skipping with the name and count of the ELSE.'],
  ['ENDIF', 'No effect (an ordinary statement, counted by a running count).'],
], ['While assembling', 'Effect'])}
${h4('While skipping')}
${p(`Each statement read is first <b>edited</b> (concatenation marks ${c('_')} removed, micro references
${c('"NAME"')} substituted); this is how the name of an ENDIF or ELSE can come from a micro. It is then examined
in this order:`)}
${ul([
  `a comment line (${c('*')} in column 1) is skipped and <b>not counted</b>;`,
  `${c('END')} stops the skip and is processed normally;`,
  `an ${c('ELSE')} that terminates the skip (table below): assembly resumes with the statement after it; its own count is ignored and it is not counted;`,
  `an ${c('ENDIF')} that terminates the skip (only for a skip without count): assembly resumes after it;`,
  `any other statement is skipped without being interpreted; if a count is running, it is decremented and, when it reaches zero, assembly resumes with the next statement. Counted statements include an ENDIF or ELSE that does not terminate the skip, a blank line (columns 1 to 29 blank), a macro call (not expanded) and a MACRO header.`,
])}
${T([
  ['count given', 'never: the ENDIF is only counted', 'unnamed ELSE, or ELSE with the same name'],
  ['no count, no name', 'any ENDIF, named or not', 'unnamed ELSE only'],
  ['no count, name N', 'ENDIF named N, or unnamed ENDIF', 'ELSE named N, or unnamed ELSE'],
], ['Skip in effect', 'ENDIF that terminates it', 'ELSE that terminates it'])}
${note(`A continued statement (continuation lines with ${c(',')} in column 1) counts as one statement. A count that is
zero, negative or omitted means "no count". A count that contains an undefined symbol is flagged with ${c('U')} and
the test then has no effect (no skip).`)}
${h4('Consequences')}
${ul([
  `A skipped statement is not expanded: an ELSE or ENDIF that would have come from a macro is not seen.`,
  `A macro definition inside a skipped range is not recognized (its header is just another skipped line): an ENDIF or ELSE in its body therefore <b>does</b> terminate the skip.`,
  `The skip state is global: started inside a macro expansion, it continues in the calling source after the expansion ends.`,
  `${see('ps-irp', 'IRP')} sequences of a macro body are expanded when the lines are produced, even while skipping: each produced line is counted. Around an IRP, use a named skip rather than a count.`,
  `Since there is no stack, nested IFs need names: an unnamed ENDIF also terminates a named skip in effect.`,
  `A skipped line defines nothing and generates nothing; its references are not recorded.`,
])}
${h4('Listing')}
${p(`Skipped lines are listed only with option ${c('F')} of ${see('ps-list', 'LIST')}. The IF line and the ELSE or ENDIF
that terminates the skip are ordinary lines. A LIST inside a skipped range has no effect.`)}
${h4('Examples')}
${p('Nested tests with distinct names (X = 0, Y = 1): words 1 and 3 are assembled.')}
${ex(`
X         EQU    0
Y         EQU    1
IF1       IFEQ   X,0         TRUE
          CON    1
IF2       IFEQ   Y,0         FALSE: SKIP NAMED IF2
          CON    2
IF2       ELSE               SAME NAME: END OF SKIP
          CON    3
IF2       ENDIF              ASSEMBLING: NO EFFECT
IF1       ELSE               ASSEMBLING: SKIP NAMED IF1
          CON    4
IF1       ENDIF              END OF SKIP
`)}
${p(`With a count: if the test is true, the next line is assembled and the ELSE skips one statement; if it is false,
as here, the 2-statement skip stops at the ELSE (unnamed ELSE) and ${c('CON 2')} is assembled. ${c('CON 3')} is
assembled in both cases.`)}
${ex(`
          IFEQ   1,2,2       FALSE: SKIP 2 STATEMENTS
          CON    1           SKIPPED (COUNT 1)
          ELSE   1           TERMINATES THE SKIP
          CON    2           ASSEMBLED
          CON    3
`)}
${p(`The unnamed nesting pitfall: the inner unnamed ENDIF terminates the skip named ${c('N')}. Words 3 and 4 are assembled.`)}
${ex(`
N         IFEQ   1,2         FALSE: SKIP NAMED N
          CON    1
          IFEQ   1,2         SKIPPED (NOT INTERPRETED)
          CON    2
          ENDIF              UNNAMED ENDIF: ENDS SKIP N
          CON    3
N         ENDIF              NO EFFECT
          CON    4
`)}
${p(`Asterisk comments are not counted; a blank line (columns 1 to 29 blank) is counted. Only ${c('CON 3')} is assembled.`)}
${ex(`
          IFEQ   1,2,3
          CON    1
*         COMMENT, NOT COUNTED
                             BLANK LINE, COUNTED
          CON    2
          CON    3
`)}
${p(`The skip survives the end of an expansion: the macro starts a skip that the ENDIF of the main source terminates.`)}
${ex(`
OPEN      MACRO
          IFEQ   1,2
          ENDM
          OPEN
          CON    1           SKIPPED
          ENDIF
          CON    2
`)}
${p(`A macro defined in a skipped range is not recognized: here the count covers the header and the first body line;
the two ENDM lines that follow are nil instructions and ${c('CON 2')} is assembled.`)}
${ex(`
          IFEQ   1,2,2
M         MACRO
          CON    1
          ENDM
          CON    2
          ENDM
`)}
${p(`Skip counts chained in the manual's MX opdef (SET, IFPL, IFEQ, IFLE and SKIP):`)}
${ex(`
MXQ       OPDEF  REG,VAL
          LOCAL  A
A         SET    VAL
A         SET    A-A/60D*60D
          IFPL   A,3         A NEGATIVE: SKIP IFEQ, IFLE, SKIP
          IFEQ   A,0,3       A POSITIVE: SKIP IFLE, SKIP, SET
          IFLE   VAL,0,1
          SKIP   1
A         SET    A+60D
          VFD    6/43B,3/REG,6/A
          ENDM
          MX6    -52         43610
          MX6    12          43614
          MX6    0           43600
`)}
${p(`See also ${see('lang-passes', 'assembly passes')}, ${see('lang-edition', 'statement editing')}.`)}
`,
};

const IFOP = {
  id: 'ps-ifop',
  title: 'IFEQ, IFNE, IFGT, IFGE, IFLT, IFLE - compare two expressions',
  keys: ['IFEQ', 'IFNE', 'IFGT', 'IFGE', 'IFLT', 'IFLE'],
  syntax: [
    '[name]    IFEQ   exp1,exp2[,n]',
    '[name]    IFNE   exp1,exp2[,n]',
    '[name]    IFGT   exp1,exp2[,n]',
    '[name]    IFGE   exp1,exp2[,n]',
    '[name]    IFLT   exp1,exp2[,n]',
    '[name]    IFLE   exp1,exp2[,n]',
  ],
  html: `
${p(`Compares two expressions. If the relation is true, assembly continues; otherwise a skip starts
(${see('ps-skipping', 'skip machine')}).`)}
${T([
  ['name', 'Location field, optional: name of the IF sequence (1 to 8 characters), used by ELSE and ENDIF. The name is not a symbol.'],
  ['exp1, exp2', 'Expressions (absolute, relocatable or external) whose symbols are all previously defined. In a CPU assembly, register names are accepted.'],
  ['n', 'Optional skip count: absolute evaluatable expression (decimal when the base is M). Omitted, zero or negative: skip without count, terminated by ELSE or ENDIF. When n is omitted, the preceding comma may be omitted too.'],
], ['Field', 'Content'])}
${T([
  ['EQ', 'equal <b>in all respects</b>: same value and same attributes (both absolute, or relocatable in the same block with the same coefficient, or relative to the same external)'],
  ['NE', 'negation of EQ: value or any attribute differs'],
  ['GT', 'exp1 &gt; exp2 (values only, signed comparison)'],
  ['GE', 'exp1 ≥ exp2'],
  ['LT', 'exp1 &lt; exp2'],
  ['LE', 'exp1 ≤ exp2'],
], ['Relation', 'True when'])}
${h4('Rules')}
${ul([
  `Evaluated in pass one: a relocatable address has its position within its block; an external has the value 0.`,
  `GT, GE, LT and LE compare values only (60-bit ones' complement, taken with their sign).`,
  `Legal anywhere; inside a definition (macro, DUP...), interpreted only when the definition is assembled.`,
  `References to symbols in a test are not entered in the symbolic reference table.`,
])}
${h4('Errors')}
${T([
  ['U', 'Undefined symbol (or symbol defined later) in exp1, exp2 or n: the line is flagged and <b>no skip</b> starts.'],
  ['O', 'Unknown relation (IFXX...): the operation does not exist; in a CPU assembly a 30-bit zero instruction is generated.'],
  ['A', 'Malformed expression.'],
], ['Flag', 'Cause'])}
${h4('Examples')}
${ex(`
TAB       BSS    10
END1      BSS    0
          IFEQ   END1-TAB,10 ABSOLUTE DIFFERENCE: TRUE
          CON    1
          ENDIF
          IFEQ   TAB,0       RELOCATABLE VERSUS ABSOLUTE: FALSE
          CON    2
          ENDIF
          IFGT   END1,TAB,1  VALUES ONLY: TRUE
          CON    3
          IFNE   1,1,1       FALSE: SKIP ONE STATEMENT
          CON    4
          CON    5
`)}
${p(`The manual's PPU example: a short jump when the target is close, otherwise a long jump.`)}
${ex(`
          IDENT  JUMPS
          PERIPH
          ORG    100B
LOOP      LDD    20B
          SBN    1
          STD    20B
          IFLT   *-LOOP,40B
          NJN    LOOP
          ELSE
          ZJN    *+3
          LJM    LOOP
          ENDIF
          END
`)}
${p('Symbol defined later: the line is flagged and word 1 is assembled anyway (no skip).')}
${ex(`
          IFEQ   LATER,1
          CON    1
          ENDIF
LATER     EQU    1
`, { errors: ['U'] })}
${p(`See ${see('ps-ifpl', 'IFPL, IFMI')}, ${see('ps-if', 'IF')}, ${see('ps-ifc', 'IFC')}.`)}
`,
};

const IFPL = {
  id: 'ps-ifpl',
  title: 'IFPL, IFMI - sign test',
  keys: ['IFPL', 'IFMI'],
  syntax: ['[name]    IFPL   exp[,n]', '[name]    IFMI   exp[,n]'],
  html: `
${p(`Tests the sign bit (bit 59) of the expression value: ${c('IFPL')} is true when the bit is clear (value ≥ +0),
${c('IFMI')} when it is set (value ≤ −0). Otherwise a skip starts (${see('ps-skipping', 'skip machine')}).`)}
${T([
  ['name', 'Optional name of the IF sequence (for ELSE and ENDIF).'],
  ['exp', 'Expression whose symbols are previously defined; the result may be absolute, relocatable or external (only the value matters: address relative to its block, external = 0).'],
  ['n', 'Optional skip count (see the skip machine).'],
], ['Field', 'Content'])}
${note(`Expressions in this assembler never produce minus zero: ${c('-0')} and ${c('77777777777777777777B')} both
evaluate to +0. ${c('IFPL')} is therefore true, and ${c('IFMI')} false, for any zero value.`)}
${h4('Errors')}
${p(`${c('U')}: undefined symbol in the expression; the line is flagged and no skip starts.`)}
${h4('Examples')}
${ex(`
V         SET    -5
          IFMI   V,1
V         SET    -V          ABSOLUTE VALUE
          CON    V           5
          IFPL   0,1         ZERO IS PLUS
          CON    1
          IFMI   -400000B
          CON    2
          ENDIF
`)}
`,
};

const IFTYPE = {
  id: 'ps-iftype',
  title: 'IFCP, IFCP6, IFCP7, IFPP, IFPP6, IFPP7 - processor type test',
  keys: ['IFCP', 'IFCP6', 'IFCP7', 'IFPP', 'IFPP6', 'IFPP7'],
  syntax: ['[name]    IFCP   [n]', '[name]    IFCP6  [n]', '[name]    IFCP7  [n]',
    '[name]    IFPP   [n]', '[name]    IFPP6  [n]', '[name]    IFPP7  [n]'],
  html: `
${p(`Assembles the following statements according to the processor type declared by ${see('ps-periph', 'PERIPH')},
${see('ps-ppu', 'PPU')}, ${see('ps-cippu', 'CIPPU')} and ${see('ps-machine', 'MACHINE')}. The only parameter is the
optional skip count. These tests are mostly used in macros shared by both processors (see ${see('sys-subr', 'SUBR')}).`)}
${T([
  ['IFCP', 'a CPU assembly (neither PERIPH, PPU nor CIPPU)'],
  ['IFCP6', 'a CPU assembly without MACHINE 7'],
  ['IFCP7', 'a CPU assembly without MACHINE 6'],
  ['IFPP', 'a PPU assembly (PERIPH, PPU or CIPPU)'],
  ['IFPP6', 'PERIPH without MACHINE 7, or PPU with MACHINE 6'],
  ['IFPP7', 'PPU without MACHINE 6, or PERIPH with MACHINE 7'],
], ['Test', 'True for'])}
${ul([
  `The MACHINE type is the first character of its first subfield (${c('MACHINE 6')}, ${c('MACHINE 7')}, ${c('MACHINE 8')}...).`,
  `Without MACHINE, IFCP6 and IFCP7 are both true in a CPU assembly; the same holds with ${c('MACHINE 8')}.`,
  `A CIPPU assembly makes IFPP true, IFPP6 and IFPP7 false.`,
  `The test reflects the state when it is read: a PERIPH or MACHINE further on is not yet known.`,
])}
${h4('Examples')}
${ex(`
          IDENT  TYPES
          MACHINE 6
          IFCP6  1
          SX6    6           ASSEMBLED
          IFCP7  1
          SX6    7           SKIPPED
          IFPP   1
          SX6    2           SKIPPED
          END
`)}
${ex(`
          IDENT  PPTYPE
          PERIPH
          ORG    100B
          IFPP6  1
          LDN    6           ASSEMBLED (PERIPH, NO MACHINE 7)
          IFPP7  1
          LDN    7           SKIPPED
          IFCP   1
          SX6    1           SKIPPED
          END
`)}
`,
};

const IFATT = {
  id: 'ps-if',
  title: 'IF - attribute test',
  keys: ['IF'],
  syntax: ['[name]    IF     att,exp[,n]', '[name]    IF     -att,exp[,n]'],
  html: `
${p(`Tests an attribute of a symbol, an expression or a name. A ${c('-')} before the attribute assembles on the false
condition. If the test is false, a skip starts (${see('ps-skipping', 'skip machine')}). ${c('name')} and ${c('n')} have
the same meaning as for ${see('ps-ifop', 'IFEQ')}.`)}
${T([
  ['SET', 'symbol', 'the symbol was defined by SET, MAX, MIN or MICCNT (redefinable)'],
  ['ABS', 'expression', 'the value is neither relocatable nor external (a register name counts as absolute)'],
  ['REL', 'expression', 'the value is relocatable: local or common block of a relocatable program (never true in an absolute or PPU program)'],
  ['LOC', 'expression', 'the value is relocatable in a local (program) block, common blocks excluded'],
  ['COM', 'expression', 'the value is relocatable in a common block, labeled or blank'],
  ['LCM', 'expression', 'the value is an address in a USELCM block'],
  ['EXT', 'expression', 'the expression contains an external symbol (EXT, or =X not yet defined)'],
  ['DEF', 'expression', 'all symbols of the expression are defined at this point (pass one)'],
  ['REG', 'expression', 'the expression contains a register name (A0-A7, B0-B7, X0-X7)'],
  ['MIC', 'name', 'the name is a currently defined micro'],
  ['MAC', 'name', 'the name is a mnemonic entry of the operation code table: macro, MACROE, pseudo instruction, OPSYN copy, PPOP, PPU instruction (PPU assembly only)'],
  ['SST', 'name', 'the name is a system symbol (system text or SST)'],
], ['att', 'Operand', 'True when'])}
${h4('Rules')}
${ul([
  `${c('-SET')}, ${c('-ABS')}... are the exact negations.`,
  `${c('SET')} requires a <b>defined</b> symbol; ${c('SST')}, ${c('MIC')} and ${c('MAC')} take a name, which is not evaluated.`,
  `Undefined symbols are accepted only with ${c('DEF')}, ${c('REG')} and ${c('EXT')} (and their negations). With ${c('SET')}, ${c('ABS')}, ${c('REL')}, ${c('LOC')}, ${c('COM')} and ${c('LCM')}, an undefined symbol is flagged with ${c('U')} and no skip starts.`,
  `${c('MAC')} does not see syntactic entries: ${c('IF MAC,SA1')} is false (SA1 is a CPU instruction), and so is a name defined by OPDEF or CPOP. A name removed by PURGMAC is no longer an operation code. ${c('LOCAL')} is not in the table.`,
  `${c('DEF')} reflects the state of pass one: a symbol defined further on is undefined (${c('IF -DEF,SYM')} is then true).`,
  `The supplied SYSTEXT system text defines no symbols: ${c('IF SST,...')} is true only with a system text that exports some.`,
])}
${h4('Errors')}
${T([
  ['U', 'Undefined symbol where it is not allowed; unrecognizable attribute.'],
  ['A', 'Malformed expression.'],
], ['Flag', 'Cause'])}
${h4('Examples')}
${ex(`
S         SET    1
E         EQU    2
          EXT    EXTN
L         BSS    1
          USE    /COM/
C         BSS    1
          USE    *
          IF     SET,S,1
          CON    1
          IF     -SET,E,1
          CON    2
          IF     ABS,E,1
          CON    3
          IF     REL,C,1     COMMON: RELOCATABLE
          CON    4
          IF     COM,C,1
          CON    5
          IF     LOC,L,1
          CON    6
          IF     EXT,EXTN+1,1
          CON    7
          IF     -ABS,EXTN,1 EXTERNAL: NOT ABSOLUTE
          CON    8
          IF     REG,X1+B2,1
          CON    9
          IF     -DEF,L+LATER,1
          CON    10
LATER     BSS    0
`)}
${ex(`
M         MICRO  1,,/ABC/
N         MICCNT M
          IF     SET,N,1     MICCNT DEFINES A SET SYMBOL
          CON    1
          IF     MIC,M,1
          CON    2
          IF     -MIC,OTHER,1
          CON    3
          IF     MAC,DUP,1   PSEUDO INSTRUCTION
          CON    4
          IF     MAC,WRITEC,1
          CON    5           SYSTEM TEXT MACRO
          IF     -MAC,SA1,1  CPU INSTRUCTION: SYNTACTIC ENTRY
          CON    6
          IF     -SST,N,1
          CON    7
`)}
${p(`The manual's example: ${c('OTA')} is not yet defined, so the test is erroneous (and skips nothing).`)}
${ex(`
          IF     COM,OTA,2
          CON    1
          CON    2
          USE    /BLOC/
OTA       BSS    1
`, { errors: ['U'] })}
${ex(`
          IF     XYZ,1,1     UNRECOGNIZABLE ATTRIBUTE
          CON    1
`, { errors: ['U'] })}
`,
};

const IFC = {
  id: 'ps-ifc',
  title: 'IFC - character string compare',
  keys: ['IFC'],
  syntax: ['[name]    IFC    op,dstring1dstring2d[,n]'],
  html: `
${p(`Compares two character strings. ${c('op')} is the relation and ${c('d')} any delimiter character: the first
character after the comma. ${c('string1')} lies between the first and second occurrences of ${c('d')},
${c('string2')} between the second and third. The strings may contain blanks and commas.`)}
${T([
  ['EQ', 'equal (same as -NE)'], ['NE', 'not equal (-EQ)'], ['GT', 'string1 &gt; string2 (-LE)'],
  ['GE', 'string1 ≥ string2 (-LT)'], ['LT', 'string1 &lt; string2 (-GE)'], ['LE', 'string1 ≤ string2 (-GT)'],
], ['op', 'True if'])}
${h4('Comparison')}
${p(`Character by character, left to right, by <b>display code</b> value (A = 01 ... Z = 32, 0 = 33 ... 9 = 44,
+ = 45, − = 46, * = 47, / = 50, ( = 51, ) = 52, $ = 53, = = 54, blank = 55, comma = 56, period = 57...). The shorter
string is padded with a value lower than any character, so a prefix is less. The first differing pair decides; if no
pair differs, the strings are equal.`)}
${h4('Rules')}
${ul([
  `The text is taken <b>after editing</b>: micros and concatenation are already processed. In a macro, each string may be a formal parameter (characters such as ${c('* / $ + -')} also delimit parameter names in the body).`,
  `The count ${c('n')} follows the third delimiter, after a comma; without it, the skip ends at ELSE or ENDIF.`,
  `Text after string 2 (without a comma) is comments.`,
])}
${h4('Errors')}
${T([
  ['A', 'Fewer than three delimiters; no skip.'],
  ['O', 'Unknown relation; no skip.'],
  ['8', 'Empty variable field.'],
], ['Flag', 'Cause'])}
${h4('Examples')}
${p('The manual examples; all five words are assembled.')}
${ex(`
TEST1     IFC    EQ,$ABC$ABC$,1
          CON    1
TEST2     IFC    LT,*AB*ABC*,1    AB IS A PREFIX OF ABC
          CON    2
TEST3     IFC    GT,XAXX,1        A IS GREATER THAN NULL
          CON    3
          IFC    -GE,*Z*8*,1      Z (32B) BEFORE 8 (43B)
          CON    4
          IFC    EQ,$A B,C$A B,C$,1
          CON    5
`)}
${p('Testing for an empty parameter in a macro (the second call produces error P).')}
${ex(`
TWO       MACRO  P1,P2
          IFC    EQ,**P2*,2
          ERR                P2 IS REQUIRED
          SKIP   1
          CON    P1,P2
          ENDM
          TWO    1,2
          TWO    3
`, { errors: ['P'] })}
${p('With a micro:')}
${ex(`
MODE      MICRO  1,,/FAST/
          IFC    EQ,/"MODE"/FAST/,1
          SX6    1
`)}
${ex(`
          IFC    XX,/A/A/    UNKNOWN RELATION
          IFC    EQ,/A/A     MISSING DELIMITER
`, { errors: ['O', 'A'] })}
`,
};

const SKIP = {
  id: 'ps-skip',
  title: 'SKIP - unconditional skip',
  keys: ['SKIP'],
  syntax: ['[name]    SKIP   [n]'],
  html: `
${p(`Starts a skip unconditionally, like a false test. With ${c('n')}, the next ${c('n')} statements are skipped;
without a count, the skip ends at an ELSE or ENDIF, according to the name (${see('ps-skipping', 'skip machine')}).`)}
${T([
  ['name', 'Optional name of the sequence.'],
  ['n', 'Optional count; absolute expression (decimal when the base is M). Zero or negative: no count.'],
], ['Field', 'Content'])}
${p(`Errors: ${c('U')} when the count contains an undefined symbol (the skip then starts without count), ${c('A')} for a malformed expression.`)}
${ex(`
          SKIP   2
          CON    1
          CON    2
          CON    3           ONLY WORD ASSEMBLED
`)}
${ex(`
PART      SKIP
          CON    1
OTHER     ENDIF              OTHER NAME: NO EFFECT
          CON    2
PART      ENDIF
          CON    3           ONLY WORD ASSEMBLED
`)}
`,
};

const ELSE = {
  id: 'ps-else',
  title: 'ELSE - alternative',
  keys: ['ELSE'],
  syntax: ['[name]    ELSE   [n]'],
  html: `
${p(`ELSE has two roles, according to the state (${see('ps-skipping', 'skip machine')}):`)}
${ul([
  `<b>while skipping</b>, it terminates the skip if it is unnamed or carries the name of the skip in effect; for a skip without count and without name, only an unnamed ELSE terminates it. Assembly resumes with the following statement; the count of the ELSE is then ignored. An ELSE that does not terminate the skip is a skipped (counted) statement;`,
  `<b>while assembling</b>, it starts a skip with its own name and count. That skip ends when the count is exhausted, at a second ELSE for the sequence or, without count, at the ENDIF for the sequence.`,
])}
${p(`An ELSE that would come from an expansion in a skipped range is never seen. Errors: ${c('U')} or ${c('A')} on the count.`)}
${ex(`
          IFEQ   1,2
          CON    1           SKIPPED
          ELSE
          CON    2           ASSEMBLED
          ENDIF
          IFEQ   1,1
          CON    3           ASSEMBLED
          ELSE
          CON    4           SKIPPED
          ENDIF
`)}
${p(`In a counted skip, an ELSE with another name is counted; the one with the right name terminates the skip.`)}
${ex(`
X         IFEQ   1,2,3
          CON    1           COUNT 1
Y         ELSE               COUNT 2
X         ELSE               END OF SKIP
          CON    2           ASSEMBLED
`)}
`,
};

const ENDIF = {
  id: 'ps-endif',
  title: 'ENDIF - end of conditional sequence',
  keys: ['ENDIF'],
  syntax: ['[name]    ENDIF'],
  html: `
${p(`Terminates a skip <b>without count</b>: any ENDIF when the skip is unnamed; an ENDIF with the same name, or an
unnamed one, when the skip is named (${see('ps-skipping', 'skip machine')}). While assembling, or in a counted skip,
ENDIF has no effect: it is an ordinary statement, counted by a running count. The variable field is ignored.`)}
${p(`ENDIF and ELSE are, together with END, the only operations looked for while skipping. Outside any context, ENDIF
is a nil instruction, like ${see('ps-nil', 'NIL')}.`)}
${ex(`
LEVEL1    IFEQ   1,2
          CON    1
LEVEL2    IFEQ   1,1
          CON    2
LEVEL2    ENDIF              OTHER NAME: SKIPPED
LEVEL1    ENDIF              END OF SKIP
          CON    3           ONLY WORD ASSEMBLED
          ENDIF              NO EFFECT
`)}
`,
};

CHAPTERS.push({
  id: 'ps-ch-conditional',
  title: 'Conditional assembly',
  intro: p(`The IF... pseudo instructions assemble or skip a sequence of statements according to a condition evaluated in
pass one. The common mechanism (names, skip counts, ELSE and ENDIF) is described in ${see('ps-skipping', 'the skip machine')}.`),
  entries: [SAUT, IFOP, IFPL, IFTYPE, IFATT, IFC, SKIP, ELSE, ENDIF],
});

// =====================================================================
// Error control
// =====================================================================

const ERR = {
  id: 'ps-err',
  title: 'ERR - unconditional error',
  keys: ['ERR'],
  syntax: ['[flag]    ERR'],
  html: `
${p(`Unconditionally produces an assembly error on its own line, and has no other effect. Its main use is in macros,
under a test, to reject illegal parameters.`)}
${T([
  ['flag', `Location field: one character, placed in the error flag column of the listing. It must be one of the fatal error letters ${c('A D E F L N O P R U V')} or one of the informative error digits ${c('1')} to ${c('9')}. Blank or any other value: ${c('P')}.`],
  ['variable', 'Ignored.'],
], ['Field', 'Content'])}
${ul([
  `The error is set in pass two, on the ERR line (in an expansion: on the generated line, reported against the call in the problem list).`,
  `A letter is a fatal error: it suppresses binary output and counts in the ERRORS line of the listing; a digit is informative (WARNINGS).`,
  `A line with an error flag is always listed, whatever the ${see('ps-list', 'LIST')} options.`,
  `An ERR inside a range skipped by IF has no effect.`,
])}
${h4('Examples')}
${ex(`
          ERR                DEFAULT FLAG P
`, { errors: ['P'] })}
${ex(`
U         ERR                CHOSEN FLAG
4         ERR                INFORMATIVE
`, { errors: ['U', '4'] })}
${p(`Checking a macro parameter: the value must fit in 6 bits.`)}
${ex(`
FIELD     MACRO  V
          IFGT   V,77B,2
A         ERR                VALUE TOO LARGE
          SKIP   1
          VFD    6/V
          ENDM
          FIELD  12B
          FIELD  100B
`, { errors: ['A'] })}
${p(`See ${see('ps-errxx', 'ERRNZ, ERRZR...')}, ${see('lang-errors', 'error flags')}.`)}
`,
};

const ERRXX = {
  id: 'ps-errxx',
  title: 'ERRNG, ERRMI, ERRPL, ERRNZ, ERRZR - conditional error',
  keys: ['ERRNG', 'ERRMI', 'ERRPL', 'ERRNZ', 'ERRZR'],
  syntax: [
    '[flag]    ERRNG  exp        error if exp is negative (sign bit set)',
    '[flag]    ERRMI  exp        synonym of ERRNG',
    '[flag]    ERRPL  exp        error if exp is positive or zero (sign bit clear)',
    '[flag]    ERRNZ  exp        error if exp is nonzero',
    '[flag]    ERRZR  exp        error if exp is zero',
  ],
  html: `
${p(`Evaluates an expression and produces an error when the condition holds. These are the only tests made in
<b>pass two</b>: relocatable addresses then have their final values, relative to the program origin (no longer to their
block), once every block, literals included, has been placed. This is the way to check, for instance, that a PPU
program does not overflow PPU memory, or that a table has the expected length.`)}
${T([
  ['flag', `As for ${see('ps-err', 'ERR')}: error letter or digit; blank or any other value: ${c('P')}.`],
  ['exp', 'Expression. It may not contain external symbols. All its symbols must be defined by the end of the assembly (forward references are allowed). Empty: value 0.'],
], ['Field', 'Content'])}
${T([
  ['ERRNG, ERRMI', 'bit 59 set (negative value)'],
  ['ERRPL', 'bit 59 clear (positive value, zero included)'],
  ['ERRNZ', 'value other than +0 and −0'],
  ['ERRZR', 'value +0 or −0'],
], ['Pseudo', 'Error when'])}
${h4('Errors')}
${T([
  ['chosen flag (P by default)', 'The condition holds.'],
  ['A', 'External symbol in the expression; malformed expression.'],
  ['U', 'Symbol still undefined at the end of the assembly.'],
], ['Flag', 'Cause'])}
${h4('Examples')}
${p('No error: the test is made in pass two, when END1 is known.')}
${ex(`
          ERRNZ  END1-TAB-3  TABLE OF 3 WORDS
TAB       CON    1,2,3
END1      BSS    0
`)}
${p(`Final address values: X is in block B2, placed after the 5 words of the nominal block; X − 5 is 0.`)}
${ex(`
          USE    B2
X         BSS    1
          USE    *
          BSS    5
          ERRNZ  X-5
`)}
${p(`Checking a PPU program for memory overflow (4096 words):`)}
${ex(`
          IDENT  PPLIM
          PERIPH
          ORG    7700B
          LDN    1
          LJM    *
LAST      BSS    0
          ERRNG  7777B-LAST  PROGRAM TOO LONG
          END
`)}
${ex(`
          ERRPL  1
U         ERRZR  0
7         ERRNZ  5
`, { errors: ['P', 'U', '7'] })}
${ex(`
          EXT    EXTN
          ERRNZ  EXTN
`, { errors: ['A'] })}
`,
};

CHAPTERS.push({
  id: 'ps-ch-errors',
  title: 'Error control',
  intro: p(`ERR and ERRxx let the programmer produce assembly errors, either unconditionally or according to the value of an expression evaluated in pass two.`),
  entries: [ERR, ERRXX],
});

// =====================================================================
// Listing control
// =====================================================================

const LIST = {
  id: 'ps-list',
  title: 'LIST - listing options',
  keys: ['LIST'],
  syntax: ['          LIST   o1,o2,...,on', '          LIST   *', '          LIST   $'],
  html: `
${p(`Selects (letter) or cancels (${c('-')}letter) listing options. Options are separated by commas and the list ends
at the first blank. The location field is ignored.`)}
${T([
  ['A', 'off', 'Statements as actually assembled: a line containing concatenation marks or micro references is listed as read <b>and</b> as edited (two lines).'],
  ['B', '<b>on</b>', 'Binary control statements IDENT, SEG, SEGMENT (END is always listed), and the block summary at the end of the program.'],
  ['C', 'off', 'Listing control statements EJECT, SPACE, TTL, TITLE (they take effect even without C).'],
  ['D', 'off', 'Details: second and later words of DATA, DIS and BSSZ; remote code assembled by HERE or END; contents of the literals block at the end of the program.'],
  ['E', 'off', 'All iterations of DUP and ECHO.'],
  ['F', 'off', 'Lines skipped by conditional assembly (IF..., SKIP, ELSE).'],
  ['G', 'off', 'Every line that generates code, regardless of the other options except L.'],
  ['L', '<b>on</b>', 'Master control: when cancelled, only lines with errors, LIST and END statements remain, followed by the error directory.'],
  ['M', 'off', 'Lines generated by program macros and opdefs.'],
  ['N', '<b>on</b>', 'Nonreferenced symbols in the reference table; when cancelled, symbols with no reference are omitted.'],
  ['R', '<b>on</b>', 'Symbolic reference table; if R is cancelled at the end of the program, no table is produced.'],
  ['S', 'off', 'Lines generated by system text macros and opdefs (WRITEC, MESSAGE...).'],
  ['T', 'off', 'System symbols in the reference table (accepted, no effect here).'],
  ['X', 'off', 'Lines read by XTEXT, and lines between CTEXT and ENDX.'],
], ['Option', 'Default', 'Effect'])}
${h4('Parameter forms')}
${ul([
  `${c('$')} selects all options (A B C D E F G L M N R S T X).`,
  `${c('-x')} cancels option x.`,
  `Only the <b>first</b> character of each item counts: ${c('LIST MS')} is the same as ${c('LIST M')}. Write ${c('LIST M,S')}.`,
  `An unknown letter is accepted without a message and has no effect.`,
  `${c('LIST *')} restores the previous state. Every LIST other than ${c('LIST *')} first pushes the current state (stack of 50 states; beyond that, the oldest is discarded). With an empty stack, ${c('LIST *')} restores the defaults B, L, N, R. The ${c('*')} must stand alone: ${c('LIST *,G')} does not pop the stack.`,
])}
${h4('Rules')}
${ul([
  `Options take effect in the order of the listing lines, including a LIST generated by an expansion. A LIST inside a range skipped by IF has no effect.`,
  `A LIST line is always listed, as are END and any line with an error flag.`,
  `For options A, C, D, E, F, M, S and X, a line is listed only if <b>all</b> applicable options are selected: a line of a DUP inside a macro needs M and E; a line of external text inside a system macro needs X and S.`,
  `Without M (or S), the macro call line shows the code of the first word generated by the expansion.`,
  `VFD and CON list all their words; DATA, DIS and BSSZ only the first one, except with D or G.`,
  `The sequence field (source columns 73 to 90) of a generated line shows its origin (macro name, ${c('*DUP*')}, ${c('*ECHO*')}, ${c('*RMT*')}, external text name) and its nesting level.`,
])}
${p(`Decision for one line: listed if it has an error flag, or if it is LIST or END; otherwise nothing is listed
without L; listed if G is selected and it generates code; otherwise every option required by its origin must be
selected (M or S per macro level, E per DUP/ECHO level, D for remote code, X for external text or CTEXT, F for a
skipped line, C for EJECT/SPACE/TTL/TITLE, B for IDENT/SEG/SEGMENT).`)}
${diff(`The L=0 and LO control statement parameters, which disable LIST in COMPASS, do not exist here: LIST always takes
effect. Option T has no effect. References in IF statements are never recorded, even with F. Cancelling R in the middle
of a program does not stop reference accumulation: only the final state counts.`)}
${h4('Example')}
${ex(`
TWICE     MACRO  V
          SX6    V+V
          ENDM
          TWICE  1           CALL LINE ONLY
          LIST   M
          TWICE  2           CALL AND EXPANSION
          LIST   *
          LIST   E,F
          DUP    2
          SX6    1
          ENDD
          IFEQ   1,2
          SX6    2           LISTED BECAUSE OF F
          ENDIF
          LIST   *
          LIST   -L
          SX6    3           NOT LISTED
          LIST   *
          LIST   $
          LIST   -A,-G
`)}
`,
};

const EJECT = {
  id: 'ps-eject',
  title: 'EJECT - page eject',
  keys: ['EJECT'],
  syntax: ['[name]    EJECT'],
  html: `
${p(`Advances the listing to a new page and prints the two heading lines. ${c('name')} becomes the sub-subtitle (columns
65 to 74 of the second heading line); a blank name clears it. The variable field is ignored. The EJECT line is listed
only with option C (it is then the first line of the new page); the eject takes place in any case.`)}
${diff(`An EJECT generated by a macro, DUP, ECHO, remote code or external text whose listing options are not all selected
should only set the sub-subtitle; here the page also changes. The N control statement parameter (suppression of
ejects) does not exist.`)}
${ex(`
          SX6    1
TABLES    EJECT              NEW PAGE, SUB-SUBTITLE TABLES
TAB       BSS    10
`)}
`,
};

const SPACE = {
  id: 'ps-space',
  title: 'SPACE - blank lines',
  keys: ['SPACE'],
  syntax: ['[name]    SPACE  [n1][,n2]'],
  html: `
${p(`Inserts blank lines in the listing.`)}
${T([
  ['name', 'New sub-subtitle (blank: cleared), as for EJECT.'],
  ['n1', 'Number of blank lines: absolute expression (decimal when the base is M). Omitted or zero: none.'],
  ['n2', 'Number of lines that must remain on the page after spacing.'],
], ['Field', 'Content'])}
${ul([
  `If n1 + n2 exceeds the lines remaining on the page (60 lines per page), SPACE acts as EJECT: either the eject occurs or the spaces are made, never both.`,
  `A SPACE that immediately follows a page eject has no effect.`,
  `The SPACE line is listed only with option C.`,
])}
${p(`Errors: ${c('U')} or ${c('A')} in the expressions.`)}
${ex(`
          SX6    1
          SPACE  2           TWO BLANK LINES
          SX6    2
          SPACE  1,20        NEW PAGE IF FEWER THAN 21 LINES LEFT
          SX6    3
`)}
`,
};

const TITLE = {
  id: 'ps-title',
  title: 'TITLE - title and subtitle',
  keys: ['TITLE'],
  syntax: ['[name]    TITLE  [string]'],
  html: `
${p(`The <b>first</b> TITLE of the subprogram sets the main title, printed on the first line of every page. It is known
from pass one, so it appears from the first page on, even when it follows IDENT. Each later TITLE sets the
<b>subtitle</b> (second heading line) and causes a page eject. Without any TITLE, the title is the variable field of
the first IDENT. ${c('name')} sets or clears the sub-subtitle.`)}
${h4('String extraction (TITLE, TTL, CTEXT)')}
${ul([
  `The first nonblank character after the blank that ends the operation field is searched for.`,
  `If none is found before the comments column (30, or the value set by ${see('ps-col', 'COL')}), the string starts at the column preceding the comments column; otherwise it starts at that first character.`,
  `It runs to the end of the statement; trailing blanks are removed; at most 62 characters are kept.`,
  `A blank string produces an untitled listing (or clears the subtitle).`,
])}
${p(`The TITLE line is listed only with option C.`)}
${diff(`A TITLE read from external text or between CTEXT and ENDX takes effect even when option X is not selected.`)}
${ex(`
          TITLE  DEMONSTRATION PROGRAM
          SX6    1
          TITLE  FIRST PART
          SX6    2
SECTION   TITLE  SECOND PART
`)}
${p(`The title may contain micro references:`)}
${ex(`
          TITLE  ASSEMBLED ON "DATE" AT "TIME"
`)}
`,
};

const TTL = {
  id: 'ps-ttl',
  title: 'TTL - new main title',
  keys: ['TTL'],
  syntax: ['[name]    TTL    [string]'],
  html: `
${p(`Replaces the main title with the string (same extraction rules as ${see('ps-title', 'TITLE')}) and clears the
subtitle, <b>without</b> a page eject: the new title appears from the next page. ${c('name')} sets or clears the
sub-subtitle. The line is listed only with option C. TTL does not count as the "first TITLE".`)}
${ex(`
          TTL    CONVERSION UTILITIES
          SX6    1
`)}
`,
};

const NOREF = {
  id: 'ps-noref',
  title: 'NOREF - symbols omitted from the reference table',
  keys: ['NOREF'],
  syntax: ['          NOREF  sym1,sym2,...,symn'],
  html: `
${p(`The named symbols are omitted from the symbolic reference table. The location field is ignored. NOREF may appear
anywhere in the program: the omission applies to the whole table. Invented symbols (LOCAL) never appear in it.`)}
${diff(`The omission is by name only: every symbol of that name is omitted, whatever its qualifier. The
${c('/qualifier/')} form, which suppresses all symbols of a qualifier, is not recognized.`)}
${ex(`
          NOREF  T1,T2
T1        EQU    1
T2        EQU    2
          SX6    T1+T2
`)}
`,
};

const CTEXT = {
  id: 'ps-ctext',
  title: 'CTEXT, ENDX - text listed as external text',
  keys: ['CTEXT', 'ENDX'],
  syntax: ['[name]    CTEXT  [string]', '          ENDX'],
  html: `
${p(`Lines between CTEXT and ENDX are listed as external text (${see('ps-xtext', 'XTEXT')}): only when option X is
selected. They are otherwise assembled normally. ENDX restores ordinary listing from the following statement on; its
location and variable fields are ignored. This hides common definitions copied into the source.`)}
${ul([
  `The CTEXT string (same rules as ${see('ps-title', 'TITLE')}) becomes the subtitle; ${c('name')} sets or clears the sub-subtitle.`,
  `The CTEXT line itself is listed normally; the ENDX line only with X.`,
])}
${diff(`The subtitle is changed even without option X, and a nonblank string does not cause a page eject.`)}
${ex(`
          CTEXT  COMMON DEFINITIONS
SIZE      EQU    100B
LIMIT     EQU    SIZE-1
          ENDX
          SX6    LIMIT
`)}
`,
};

const XREF = {
  id: 'ps-xref',
  title: 'XREF - reference table form',
  keys: ['XREF'],
  syntax: ['          XREF   string'],
  html: `
${p(`The first character of the string selects the form of the reference table: ${c('A')} addresses only, no flags;
${c('B')} page/line and address, with flags; ${c('P')} page and line, with flags (the default). The last XREF of the
subprogram decides for the whole table. The location field is ignored.`)}
${diff(`XREF is accepted and recorded, but the table is always produced in the P form: "page/line" references followed by
the flag ${c('D')} (definition) or ${c('L')} (location symbol).`)}
${ex(`
          XREF   P
          SX6    1
`)}
`,
};

CHAPTERS.push({
  id: 'ps-ch-listing',
  title: 'Listing control',
  intro: p(`These pseudo instructions select the listing contents (${see('ps-list', 'LIST')}), its layout (EJECT, SPACE,
TITLE, TTL) and the reference table (NOREF, XREF). They do not change the binary. See also
${see('lang-listing', 'listing format')}.`),
  entries: [LIST, EJECT, SPACE, TITLE, TTL, NOREF, CTEXT, XREF],
});

// =====================================================================
// Definitions: external text, remote code, duplication
// =====================================================================

const XTEXT = {
  id: 'ps-xtext',
  title: 'XTEXT - external text',
  keys: ['XTEXT'],
  syntax: ['[file]    XTEXT  [rname]'],
  html: `
${p(`Inserts into the assembly the statements of a source text outside the program: a common deck, a file of
definitions... The text is read and assembled at once, as if it stood in place of the XTEXT.`)}
${T([
  ['file', 'Location field: file name. Blank: the file named by the X option of the assembler, otherwise OLDPL.'],
  ['rname', 'Variable field: name of the record (deck) searched for in the file. Blank: the whole file.'],
], ['Field', 'Content'])}
${h4('Available texts')}
${p(`In this assembler, a "file" is a named text supplied to the assembly: the common decks delivered with the mini
operating system (${see('sys-comcsys', 'COMCSYS')}, ${see('sys-comccio', 'COMCCIO')}, ${see('sys-comcwtc', 'COMCWTC')},
${see('sys-comcrdc', 'COMCRDC')}, ${see('sys-comccdd', 'COMCCDD')}, ${see('sys-comccod', 'COMCCOD')}), the system texts
SYSTEXT and CPCTEXT, and, in the workbench, every <i>.txt</i> file of the workspace, named without extension and in
upper case. The text is looked up as ${c('file/rname')}, then ${c('rname')}, then ${c('file')}: ${c('XTEXT COMCCOD')}
and ${c('COMCCOD XTEXT')} are therefore equivalent.`)}
${h4('Rules')}
${ul([
  `When rname is given and the first line of the text starts in column 1 with that name, the line is skipped; a first line ${c('*COMDECK')} is skipped too. UPDATE directives (${c('*IF')}...) are not interpreted.`,
  `Reading stops at the end of the text or at an END statement of the text: that END terminates the external text, not the program.`,
  `Code goes to the block in use at the time of the XTEXT and symbols get the qualifier in effect, unless the text itself contains USE, ORG or QUAL.`,
  `The text may contain definitions (macros, micros...), calls and other XTEXTs. Macros it defines are program macros (listed with M).`,
  `Lines of the text are listed with option X; their sequence field holds the text name.`,
  `A deck included twice defines its symbols twice (error D): the supplied decks define a micro ${c('COMCxxx$')} that allows a test for their presence (${c('IF -MIC,COMCCIO$,1')}).`,
])}
${h4('Errors')}
${p(`${c('F')}: text not found (data missing on the XTEXT file).`)}
${h4('Examples')}
${ex(`
          XTEXT  COMCCOD
          SX1    777B
          RJ     COD=
`)}
${ex(`
COMCCDD   XTEXT
          SX1    1234
          RJ     CDD=
`)}
${ex(`
          XTEXT  UNKNOWN
`, { errors: ['F'] })}
${p(`See ${see('sys-auto', 'AUTO')}, which automatically includes the decks needed by the system macros.`)}
`,
};

const RMT = {
  id: 'ps-rmt',
  title: 'RMT - remote code',
  keys: ['RMT'],
  syntax: ['[rmtname] RMT                begin sequence', '          RMT                end sequence'],
  html: `
${p(`Statements between two RMT statements are saved without being assembled. They are assembled later, by
${see('ps-here', 'HERE')} or at the end of the program (END). This gathers tables, constants or subroutines generated
by macros away from the code.`)}
${ul([
  `The first RMT opens the sequence and the next RMT closes it: pairs cannot be nested lexically. The variable field is ignored; the location field matters only on the opening RMT.`,
  `Lines are saved <b>unedited</b>; asterisk comments are not saved.`,
  `Unlabeled sequences accumulate in order. Labeled ones are kept under their name; two sequences with the same name are appended.`,
  `An RMT pair may appear in a macro body: the capture happens during expansion, with parameters and local symbols already substituted; invented symbols keep their meaning where the remote code is assembled.`,
  `The block and qualifier are those in effect when the remote code is assembled (HERE or END), unless the text contains USE, ORG or QUAL.`,
  `At END, all remaining unlabeled remote code is assembled before the program terminates. Labeled remote code never called by HERE is discarded without notice. RMT pairs revealed while END assembles remote code (for instance by a macro called in that code) are lost: an intermediate HERE is needed to assemble them.`,
  `Remote code lines are listed only with option D; sequence field ${c('*RMT*')}.`,
])}
${h4('Errors')}
${p(`${c('E')}: END found inside an unclosed RMT sequence (the sequence is closed and END is processed).`)}
${h4('Examples')}
${p('Resulting order: 2, 1 (HERE), 3, 5, then 4 (assembled by END).')}
${ex(`
          RMT
          CON    1
          RMT
          CON    2
          HERE
          CON    3
          RMT
          CON    4
          RMT
          CON    5
`)}
${p('A constant table built by a macro and gathered at the end of the program:')}
${ex(`
LOAD      MACRO  V
          LOCAL  K
          RMT
K         CON    V
          RMT
          SA1    K
          ENDM
          LOAD   5
          LOAD   6
          SX6    X1
`)}
${ex(`
          RMT
          CON    1
`, { errors: ['E'] })}
`,
};

const HERE = {
  id: 'ps-here',
  title: 'HERE - assemble remote code',
  keys: ['HERE'],
  syntax: ['[rmtname] HERE'],
  html: `
${p(`Assembles at this point the remote code saved by ${see('ps-rmt', 'RMT')}: with a name, the sequence of that name;
without a name, all unlabeled sequences, in the order they were saved. Each saved sequence is assembled once and then
discarded; a HERE with nothing to assemble has no effect. The variable field is ignored.`)}
${p(`The code goes to the block in use at the HERE, with the qualifier in effect there. Its lines are listed with option D.`)}
${ex(`
NAM       RMT
          CON    1
          RMT
          CON    2
NAM       RMT
          CON    3           SAME NAME: APPENDED
          RMT
          USE    TABLES
NAM       HERE               1 AND 3 IN BLOCK TABLES
          USE    *
NAM       HERE               NOTHING LEFT
OTHER     HERE               NO EFFECT
`)}
`,
};

const DUP = {
  id: 'ps-dup',
  title: 'DUP - duplicate statements',
  keys: ['DUP'],
  syntax: ['[dupname] DUP    rep[,n]'],
  html: `
${p(`Assembles ${c('rep')} times a sequence of statements (the range) that follows the DUP.`)}
${T([
  ['dupname', 'Optional name of the range (1 to 8 characters), used to recognize its ENDD.'],
  ['rep', 'Repeat count: absolute evaluatable expression (decimal when the base is M). Null, zero or negative: the range is read but not assembled. A very large value together with STOPDUP gives indefinite repetition.'],
  ['n', 'Number of statements in the range (decimal when the base is M). Omitted, zero or negative: the range ends at an ENDD.'],
], ['Field', 'Content'])}
${h4('End of the range')}
${T([
  ['count n', 'after n statements; inner ENDDs are only counted'],
  ['no count, no name', 'at the first unnamed ENDD (a named ENDD does not end it)'],
  ['no count, name N', 'at an ENDD named N or an unnamed ENDD'],
], ['Case', 'The range ends'])}
${ul([
  `Statements are counted, not lines: a continued statement counts as one; a macro call counts as one; asterisk comments are not counted (and not saved); a blank line is counted.`,
  `The terminating ENDD is part of the range: it is assembled (as a no-op) at the end of each iteration.`,
  `The range is saved <b>unedited</b>; each iteration edits and assembles its lines. The ENDD location field is compared as written (unedited) with the edited DUP name: ${c('T_1 DUP')} and ${c('T_1 ENDD')} do not match (the DUP is named T1).`,
  `Reading the range does not track inner DUP or ECHO headers: an inner range without name or count ends the outer range at its ENDD; give the inner, or the outer, range a name or a count.`,
  `Code goes to the block in use at the DUP; symbols get the qualifier in effect. A symbol defined in the range must be defined by SET (it is redefined on each iteration).`,
  `Listing: the DUP line shows the repeat count; the range lines are listed as read; iterations are listed only with option E (sequence field ${c('*DUP*')}).`,
])}
${h4('Errors')}
${T([
  ['U', 'Undefined symbol in rep (rep is then 0) or in n.'],
  ['E', 'END found while reading the range.'],
], ['Flag', 'Cause'])}
${diff(`An inner range whose count extends past the outer range or definition is not flagged with ${c('E')}: reading
continues in the enclosing source.`)}
${h4('Examples')}
${p('The manual example: five words of 1.')}
${ex(`
          DUP    5,1
          DATA   1
`)}
${p('A table of squares with a SET symbol:')}
${ex(`
K         SET    0
SQUARES   BSS    0
          DUP    8
K         SET    K+1
          CON    K*K
          ENDD
`)}
${p('Nested ranges: the inner range is counted, the outer one ends at the unnamed ENDD.')}
${ex(`
          DUP    2
          DATA   1
          DUP    2,1
          DATA   2
          ENDD
`)}
${p(`The editing pitfall: ${c('T_1 ENDD')} does not end the range of the DUP named T1; the unnamed ENDD does.`)}
${ex(`
T_1       DUP    2
          DATA   1
T_1       ENDD
          DATA   2
          ENDD
`)}
${p('Named range: an ENDD with another name has no effect.')}
${ex(`
N         DUP    2
          DATA   1
M         ENDD
          DATA   2
N         ENDD
`)}
`,
};

const ECHO = {
  id: 'ps-echo',
  title: 'ECHO - duplicate with parameters',
  keys: ['ECHO'],
  syntax: ['[dupname] ECHO   [n],p1=(list1),p2=(list2),...,pk=(listk)'],
  html: `
${p(`Like ${see('ps-dup', 'DUP')}, but on each iteration the parameters ${c('pi')} take the next value of their list.
The number of iterations is the length of the <b>shortest</b> list.`)}
${T([
  ['dupname', 'Optional range name (end by ENDD, same rules as DUP).'],
  ['n', `Number of statements in the range. Omitted or zero: the range ends at ENDD; <b>the comma must still be present</b> (${c('ECHO ,P=(A,B)')}).`],
  ['pi', 'Parameter name: 1 to 8 characters, first alphabetic; at most 63.'],
  ['listi', 'Values in parentheses, separated by commas.'],
], ['Field', 'Content'])}
${h4('Lists')}
${ul([
  `The separator between the name and the list is conventionally ${c('=')}; ${c('+ - * / $ .')} are accepted too, or none (${c('P(A,B)')}).`,
  `Two consecutive commas give a null item; an explicit zero must be written.`,
  `An item that begins with ${c('(')} extends to the matching ${c(')')}; its outer parentheses are removed when it is substituted, so it may contain commas and blanks.`,
  `${c('()')} is a null list: no iterations. Without any parameter, no iterations either.`,
  `A list not in parentheses is a single item, up to the next comma or blank.`,
  `The variable field ends at the first blank outside parentheses.`,
])}
${h4('Substitution')}
${p(`At definition time, each occurrence of a parameter name in the range lines is replaced by a parameter mark, by the
recognition rule of macro formal parameters (${see('ps-macro', 'MACRO')}: the name must be set off by the delimiters
${c('+ - * / ( ) $ = , .')}, blank, ${c('"')} or ${c('_')}). On iteration i, each mark receives the i-th item of its
list; the line is then edited (concatenation ${c('_')}, micros) and assembled. The marks ${c(';A')}, ${c(';B')}...
may also be written directly for the first, second... parameter.`)}
${ul([
  `ECHOs can be nested; they are expanded as ordinary statements, so not inside a skipped range (unlike IRP).`,
  `Listing: iterations with option E, sequence field ${c('*ECHO*')}.`,
])}
${h4('Errors')}
${T([
  ['4', 'Parameter name empty or beginning with a digit (parameter ignored).'],
  ['F', 'More than 63 parameters.'],
  ['8', 'Empty variable field.'],
  ['U', 'Undefined count, or missing leading comma (the text is read as a count).'],
], ['Flag', 'Cause'])}
${diff(`A repeated parameter name is not flagged: the last list of that name is used. Reserved names (END, LOCAL, ENDD,
IRP, ENDM) are not rejected.`)}
${h4('Examples')}
${ex(`
          ECHO   ,P=(A,B,C)
          DATA   1H_P
          ENDD
`)}
${p('Two lists: two iterations (the shortest list).')}
${ex(`
          ECHO   ,CH=(X,Y),VAL=(1,2,3)
          VFD    6/1R_CH,54/VAL
          ENDD
`)}
${p('Null item and parenthesized item: DATA 1, DATA (empty), DATA 2,3.')}
${ex(`
          ECHO   ,P=(1,,(2,3))
          DATA   P
          ENDD
`)}
${p('Counted range, "/" separator and direct parameter mark:')}
${ex(`
          ECHO   2,P/(1,2)
          DATA   ;A
          DATA   P+10
`)}
${p('The manual example, transposed to the CPU: nested ECHOs.')}
${ex(`
          ECHO   ,CM=(1,2,3)
          ECHO   2,P1=(10,20)
          DATA   CM
          DATA   P1
          ENDD
`)}
${ex(`
          ECHO   P=(1,2)     MISSING COMMA
          DATA   P
          ENDD
`, { errors: ['U', '4'] })}
`,
};

const STOPDUP = {
  id: 'ps-stopdup',
  title: 'STOPDUP - stop duplication',
  keys: ['STOPDUP'],
  syntax: ['          STOPDUP'],
  html: `
${p(`Stops the innermost active DUP or ECHO, even when STOPDUP comes from a macro called inside the range. The current
iteration is completed to the end of the range; assembly then continues after the range. Outside any duplication,
STOPDUP has no effect. The location and variable fields are ignored.`)}
${p('Indefinite repetition stopped by a test: three words, then 77B.')}
${ex(`
I         SET    0
          DUP    1000
I         SET    I+1
          CON    I
          IFEQ   I,3,1
          STOPDUP
          ENDD
          CON    77B
`)}
`,
};

const ENDD = {
  id: 'ps-endd',
  title: 'ENDD - end of DUP or ECHO range',
  keys: ['ENDD'],
  syntax: ['[dupname] ENDD'],
  html: `
${p(`Terminates the range of a ${see('ps-dup', 'DUP')} or ${see('ps-echo', 'ECHO')} without count: an unnamed ENDD, or
an ENDD with the range name. In a counted range it is only counted. The ENDD is part of the range and ends each
iteration (as a no-op). Outside any range, it is a nil instruction.`)}
${ex(`
          ENDD               OUTSIDE A RANGE: NO EFFECT
          DUP    2
          CON    1
          ENDD
`)}
`,
};

CHAPTERS.push({
  id: 'ps-ch-definitions',
  title: 'Definitions: external text, remote code, duplication',
  intro: p(`These pseudo instructions save a sequence of statements to assemble it elsewhere or several times: XTEXT (text
of a file, assembled at once), RMT and HERE (remote code, assembled later), DUP and ECHO (range assembled several times).
Saved lines are kept unedited; editing takes place each time they are assembled. Any statement except END may appear in a
definition, including other definitions. Expansion nesting is limited to 400 levels (beyond: error ${c('F')}).`),
  entries: [XTEXT, RMT, HERE, DUP, ECHO, STOPDUP, ENDD],
});

// =====================================================================
// Macros and opdefs
// =====================================================================

const MACRO = {
  id: 'ps-macro',
  title: 'MACRO - macro definition',
  keys: ['MACRO'],
  syntax: [
    'mname     MACRO  [p1,p2,...,pn]       format one',
    '          MACRO  mname,p1,p2,...,pn   format two (p1 = location argument)',
    '          LOCAL  sym1,sym2,...        optional, heading only',
    '          ...                         body',
    '[mname]   ENDM',
  ],
  html: `
${p(`Defines a macro: a named sequence of statements, saved with its formal parameters, and assembled each time its name
appears in the operation field of a statement (${see('ps-macro-call', 'macro call')}).`)}
${h4('Structure')}
${ul([
  `<b>Heading</b>: the MACRO statement, followed by any number of ${see('ps-local', 'LOCAL')} statements. Between the header and the LOCALs only comment lines (asterisk or columns 1 to 29 blank) may appear; they are ignored.`,
  `<b>Body</b>: from the first statement that is neither LOCAL nor a comment line. Asterisk comments are dropped; blank lines are kept (and counted by skip counts at expansion).`,
  `<b>Terminator</b>: ${see('ps-endm', 'ENDM')}. It is saved with the body and is the last line of every expansion.`,
])}
${h4('Name and formats')}
${T([
  ['format one', `The macro name is in the location field. Actual parameter i replaces formal parameter i. A location symbol on the call is defined (see the macro call).`],
  ['format two', `The location field is blank; the macro name is the first item of the variable field. The first formal parameter (the location argument) receives the text of the call's location field; at least one parameter is required.`],
], ['Format', 'Rules'])}
${ul([
  `The name has 1 to 8 characters; END, ENDD, ENDM, IRP and LOCAL are illegal (flag ${c('L')}).`,
  `If the name already exists in the mnemonic part of the operation code table (pseudo instruction, macro, system text macro), the new definition overrides it; informative flag ${c('3')}. A macro with the name of a CPU instruction (${c('SB4')}) takes precedence over that instruction (${see('ps-opcode-tables', 'operation code table')}).`,
  `A definition must precede its calls. A definition nested in another body is not defined until the outer macro is called.`,
])}
${h4('Formal parameter list')}
${ul([
  `Separators: ${c('+ - * / ( ) $ = , .')} (any of them, with no other meaning); a blank ends the list. In format two, any separator may also separate the macro name from p1.`,
  `A null parameter (two adjacent separators, trailing separator) is ignored.`,
  `A name beginning with a digit, a repeated name, a name longer than 8 characters, or END, ENDD, ENDM, IRP, LOCAL is ignored with informative flag ${c('4')}.`,
  `Examples from the manual: ${c('SUM MACRO X=Y+1+X')} has parameters X and Y; ${c('SUM MACRO X,Y,(Z+X)')} has X, Y, Z; in format two, ${c('MACRO X(Y+Z)')} is macro X with parameters Y and Z.`,
  `Formal parameters plus local symbols: at most 63 (flag ${c('F')}).`,
])}
${h4('Capture of the body')}
${p(`Body lines are saved <b>unedited</b>: concatenation marks ${c('_')} and micro references are kept and processed on
each expansion. In each body line (all fields, comments included), every maximal run of characters that contains none of
the delimiters ${c('+ - * / ( ) $ = , .')}, blank, ${c('"')} (micro mark) and ${c('_')} (concatenation mark), and that
equals a formal parameter or a local symbol, is replaced by a parameter mark. A run that merely <i>contains</i> a name is
not replaced: with formal ${c('A')}, ${c('ALPHA')} is unchanged. The concatenation mark separates a name from its
neighbors: ${c('SX_P1')} contains the formal ${c('P1')}, and the expansion of ${c('SX_P1')} with P1 = 6 becomes
${c('SX6')} after editing. A ${c(';')} in the body is a parameter mark too: ${c(';A')} is parameter 1, ${c(';B')}
parameter 2, and so on (display code of the letter), which restricts the use of the semicolon in bodies.`)}
${ul([
  `IF, ELSE, ENDIF, DUP, ECHO, RMT and IRP statements in the body are not acted upon during capture: they are saved.`,
  `Inner MACRO, MACROE and OPDEF headers are tracked so that a named ENDM can close them (see ${see('ps-endm', 'ENDM')}).`,
  `END inside a definition: flag ${c('E')}, the definition is closed and END is processed.`,
  `In the listing, definition lines are listed as read, at the level of the source.`,
])}
${diff(`An illegal macro name (END, ENDD...) is flagged with ${c('L')} but the definition is still entered. In format two,
${c('MACRO ABC,,FP')} (null parameter) is accepted and ${c('MACRO ABC,16,FP')} only gives flag ${c('4')}; the manual
treats both as illegal. Only ${c('MACRO ABC')} (no parameter at all) gives ${c('L')}.`)}
${h4('Examples')}
${p(`Concatenation (manual example): ${c('MACK 6,X')} expands to ${c('SX_6  6+1R_X')}, edited to ${c('SX6 6+1RX')}.`)}
${ex(`
MACK      MACRO  P1,P2
          SX_P1  P1+1R_P2
          ENDM
          MACK   6,X
`)}
${p(`Separators in the list: parameters X and Y; the repeated X and the numeric 1 are ignored (flag 4).`)}
${ex(`
SUM       MACRO  X=Y+1+X
          CON    X,Y
          ENDM
          SUM    1,2
`, { errors: ['4'] })}
${p(`Format two: the location field of the call is the text of the first parameter.`)}
${ex(`
          MACRO  TWO,LAB,V
LAB       CON    V
          ENDM
HERE1     TWO    5
          CON    HERE1
`)}
${p(`Redefinition (flag 3): the latest definition holds.`)}
${ex(`
M         MACRO
          CON    1
          ENDM
M         MACRO
          CON    2
          ENDM
          M
`, { errors: ['3'] })}
${p(`A definition nested in another one exists only after the outer macro has been called.`)}
${ex(`
OUTER     MACRO
INNER     MACRO
          CON    1
          ENDM
          CON    2
          ENDM
          OUTER
          INNER
`)}
${ex(`
          MACRO  ABC
          ENDM
`, { errors: ['L'] })}
`,
};

const APPEL = {
  id: 'ps-macro-call',
  title: 'Macro call',
  keys: [],
  syntax: ['[sym]     mname  a1,a2,...,an'],
  html: `
${p(`A statement whose operation field is the name of a macro is a macro call: the saved body is assembled in place of
the call, with the actual parameters substituted for the formal parameters.`)}
${h4('Actual parameters')}
${ul([
  `The variable field (already edited: micros written in the call are expanded before the scan) is split at commas; it ends at the first blank not enclosed in a parenthesized parameter.`,
  `Two consecutive commas give a null parameter; missing trailing parameters are null; an explicit zero must be written.`,
  `A parameter whose <b>first</b> character is ${c('(')} extends to the matching ${c(')')} (nesting counted); the outer pair is removed, and the enclosed text may contain blanks and commas. Any text after the closing parenthesis, up to the next comma or blank, is appended.`,
  `A ${c('(')} that is not the first character has no special meaning: ${c('A(B,C)')} gives two parameters, ${c('A(B')} and ${c('C)')}.`,
  `Actual parameters beyond the number of formal parameters are ignored without notice.`,
  `Example: ${c('MESSAGE (=C*PROGRAM ABORT.*)')} passes ${c('=C*PROGRAM ABORT.*')}.`,
])}
${h4('Location field')}
${ul([
  `<b>Format one</b>: a location symbol forces the first word of the generated code upper; the symbol gets the location counter value after the force upper, in the current block, with the current qualifier. Without a symbol, the call does not change the counters. A ${c('+')} forces upper without defining anything; a ${c('-')} has no effect.`,
  `<b>Format two</b>: the location field text is substituted for the first formal parameter and has no other significance: no symbol is defined and no force upper occurs because of it.`,
])}
${h4('Substitution and assembly')}
${ul([
  `Each parameter mark of each saved line is replaced by the actual text, as is; local symbol marks are replaced by invented symbols (${see('ps-local', 'LOCAL')}). Spacing between fields stays exactly as in the definition, so later columns shift by the difference in length: a null actual in the variable field moves the comments to the left, where they may be read as a variable field.`,
  `Each substituted line is then processed exactly as a source statement: editing (concatenation removed, micro references substituted with the micros current at that moment), then interpretation, including nested definitions, calls, IF, DUP, and so on.`,
  `Micro references in an actual parameter are therefore substituted when the expanded line is edited, not at the call.`,
  `Block and qualifier are those in effect at the call; a USE or QUAL in the body (possibly through a parameter) changes them.`,
  `A macro may call itself; recursion is bounded by the expansion depth (400 levels, flag ${c('F')}). An IF must end it.`,
])}
${h4('Listing')}
${p(`Expanded lines are listed with option M (program macros) or S (system macros), with the macro name and nesting level
in the sequence field. Without these options, the call line shows the code of the first generated word.`)}
${h4('Examples')}
${p('Parenthesized parameter: CON 1; CON 2,3; CON 4.')}
${ex(`
M         MACRO  A,B,C
          CON    A
          CON    B
          CON    C
          ENDM
          M      1,(2,3),4
          M      5,6,7,8     EXTRA PARAMETER IGNORED
`)}
${p(`Location symbol and force upper: LAB designates the word that holds the first instruction of the expansion.`)}
${ex(`
M         MACRO
          SX6    1
          ENDM
          SX7    0
LAB       M
          SX6    2
          CON    LAB
`)}
${p(`Null parameter: the comments move into the variable field, and the word COMMENTS is read as an undefined symbol (flag U).`)}
${ex(`
M         MACRO  A
          CON    A           COMMENTS
          ENDM
          M
`, { errors: ['U'] })}
${p(`Recursive macro stopped by a test: four words, 3, 2, 1, 0.`)}
${ex(`
COUNT     MACRO  N
          CON    N
          IFGT   N,0,1
          COUNT  N-1
          ENDM
          COUNT  3
`)}
`,
};

const MACROE = {
  id: 'ps-macroe',
  title: 'MACROE - macro with keyword parameters',
  keys: ['MACROE'],
  syntax: [
    'mname     MACROE [p1,p2,...,pn]       format one',
    '          MACROE mname,p1,...,pn      format two',
    '[sym]     mname  p1=a1,p2=a2,...      call',
  ],
  html: `
${p(`Same definition as ${see('ps-macro', 'MACRO')} (formats, heading, LOCAL, body, ENDM); only the call differs: each
actual parameter is given with its keyword, ${c('formal=value')}, in any order.`)}
${ul([
  `Omitted parameters are null. When a keyword is repeated, the last value wins.`,
  `An unknown keyword is ignored without notice. An item without ${c('=')} (or beginning with ${c('=')}) is flagged with ${c('A')} and ignored.`,
  `In format two, the call's location field is substituted for the first formal parameter, as for MACRO; keywords then cover the other parameters.`,
  `In format one, a location symbol is defined after a force upper, as for MACRO.`,
])}
${diff(`An item is split at commas before the keyword is examined: ${c('B=(4,5)')} does not pass ${c('4,5')} but the two
items ${c('B=(4')} and ${c('5)')}. To pass a value containing commas, parenthesize the whole item: ${c('(B=4,5)')}.`)}
${h4('Examples')}
${p('The manual example: CON 1, CON 2, CON 3.')}
${ex(`
SAM       MACROE A,B,C
          CON    A
          CON    B
          CON    C
          ENDM
          SAM    C=3,A=1,B=2
`)}
${p('Value with a comma, parenthesized whole item: CON 1, CON 4,5.')}
${ex(`
KEY       MACROE A,B
          CON    A
          CON    B
          ENDM
          KEY    (B=4,5),A=1
`)}
${ex(`
KEY       MACROE A
          CON    1
          ENDM
          KEY    7           NOT A KEYWORD
`, { errors: ['A'] })}
`,
};

const ENDM = {
  id: 'ps-endm',
  title: 'ENDM - end of macro or opdef definition',
  keys: ['ENDM'],
  syntax: ['[name]    ENDM'],
  html: `
${p(`Terminates the definition of a ${see('ps-macro', 'MACRO')}, ${see('ps-macroe', 'MACROE')} or ${see('ps-opdef', 'OPDEF')}.`)}
${ul([
  `An <b>unnamed</b> ENDM terminates all open definitions (the outer one and any inner one in its body).`,
  `A <b>named</b> ENDM terminates the definition of that name and every unterminated definition inside it. The name is compared with the names of the open headers (macro name, or OPDEF syntax). An ENDM with an unknown name is saved as an ordinary body line.`,
  `Inner definitions that are followed by more outer body lines therefore need a named ENDM.`,
  `The ENDM is compared as written (unedited) with the edited header name: ${c('T_1 MACRO')} defines T1, and ${c('T_1 ENDM')} does not terminate it.`,
  `An ENDM produced only by a micro substitution is not seen during capture.`,
  `ENDM is the last line of each expansion; it is listed and assembled as a no-op. Outside any definition, ENDM is a nil instruction.`,
])}
${h4('Examples')}
${p(`The manual structure: ${c('KAY ENDM')} terminates KAY and the OPDEF; ${c('JAY ENDM')} terminates JAY.`)}
${ex(`
JAY       MACRO  P1
KAY       MACROE PK1
JPX/XQ    OPDEF  OP1,OP2,OP3
KAY       ENDM
          CON    P1
JAY       ENDM
          JAY    5
`)}
${p(`The editing pitfall: the body of T1 is CON 1, T_1 ENDM, CON 2, ENDM.`)}
${ex(`
T_1       MACRO
          CON    1
T_1       ENDM
          CON    2
          ENDM
          T1
`)}
`,
};

const LOCAL = {
  id: 'ps-local',
  title: 'LOCAL - local symbols of a macro',
  keys: ['LOCAL'],
  syntax: ['          LOCAL  sym1,sym2,...'],
  html: `
${p(`Declares symbols local to a macro or opdef: on each expansion, each of them is replaced by a new <b>invented
symbol</b>, unique in the subprogram. This allows a macro containing labels to be called several times.`)}
${ul([
  `Legal only in the heading of a macro, MACROE or opdef, between the header and the first body statement; several LOCAL statements are allowed. The location field is ignored. LOCAL statements are not part of the body.`,
  `Separators: ${c('+ - * / ( ) $ = , .')}; a blank ends the list; null items are ignored.`,
  `Ignored with informative flag ${c('4')}: a formal parameter name, a repeated local symbol, a name beginning with a digit, END, ENDD, ENDM, IRP, LOCAL.`,
  `Local symbols are numbered after the formal parameters; formal parameters plus locals: at most 63 (flag ${c('F')}).`,
  `Invented symbols have the form ${c('!nnnnnn')}: an exclamation mark followed by a 6-digit octal sequence number, starting at ${c('!000001')} and incremented for each invented symbol of the subprogram. They appear in the listing, are qualified under QUAL, are not entered in the symbolic reference table, and are counted in the INVENTED SYMBOLS statistic.`,
  `The marks of the outer macro are substituted throughout its body, including the text of inner definitions: a local symbol of the outer macro is visible in an inner macro that does not declare it. If the inner macro declares it LOCAL too, the inner LOCAL line receives the outer invented name, which becomes local to each inner expansion: invented names are accepted in LOCAL lists.`,
  `LOCAL is not in the operation code table: elsewhere it is an unknown operation (flag ${c('O')}; in a CPU assembly, a 30-bit zero instruction is generated).`,
])}
${h4('Examples')}
${ex(`
WAIT      MACRO  N
          LOCAL  LOOP
          SB7    N
LOOP      SB7    B7-1
          NZ     B7,LOOP
          ENDM
          WAIT   10
          WAIT   20          SECOND LOOP: ANOTHER INVENTED SYMBOL
`)}
${ex(`
M         MACRO  N
          LOCAL  N,1X,LOC,LOC
          ENDM
`, { errors: ['4'] })}
${ex(`
          LOCAL  X
`, { errors: ['O'] })}
`,
};

const IRP = {
  id: 'ps-irp',
  title: 'IRP - indefinite repeat inside a macro',
  keys: ['IRP'],
  syntax: ['          IRP    param          begin', '          ...', '          IRP                   end'],
  html: `
${p(`Inside the body of a macro (MACRO or MACROE), repeats the lines between the two IRP statements once per
subparameter of the actual parameter ${c('param')}. ${c('param')} must be a formal parameter of the macro.`)}
${ul([
  `IRP is processed when the expansion lines are produced, before IF skipping examines them: the produced lines are counted one by one by a skip count. Use named IF sequences around IRP.`,
  `The actual parameter (outer parentheses already removed) is split at its top-level commas; a subparameter beginning with ${c('(')} has its outer parentheses removed too. An actual parameter without parentheses is one subparameter; a <b>null</b> actual parameter gives <b>no</b> copy.`,
  `The begin IRP line is produced once, then one copy of the inner lines per subparameter (with the parameter replaced by the subparameter), then the end IRP line. Outside the IRP range, the parameter gives the whole actual text.`,
  `If the parameter does not occur between the IRPs, the lines are repeated unchanged once per subparameter.`,
  `The end IRP is the first IRP with an empty variable field; without one, the repetition covers the rest of the body. IRP pairs cannot be nested.`,
  `The IRP lines reach the assembler as nil instructions (listed and counted). IRP outside a macro, or with an operand that is not a formal parameter, is a nil instruction. IRP is not processed in opdef expansions.`,
])}
${h4('Examples')}
${p('The manual example ZAB (here with CON): CON 1+10, 2+10, 3+10, then CON 1,2,3.')}
${ex(`
ZAB       MACRO  ARG,B
          IRP    ARG
          CON    ARG+B
          IRP
          CON    ARG
          ENDM
          ZAB    (1,2,3),10
          ZAB    7,10
`)}
${p(`Labels for successive zeroed areas (manual example 2):`)}
${ex(`
AREAS     MACRO  P1
          IRP    P1
P1        BSSZ   10B
          IRP
          ENDM
          AREAS  (T1,T2,T3)
          SA1    T3
`)}
${p(`Named skip around an IRP: the produced lines are skipped and the named ENDIF ends the skip.`)}
${ex(`
M         MACRO  L
          IRP    L
          CON    L
          IRP
          ENDM
N         IFEQ   1,2
          M      (1,2,3)
N         ENDIF
          CON    9
`)}
`,
};

const OPDEF = {
  id: 'ps-opdef',
  title: 'OPDEF - syntactic definition of a CPU instruction',
  keys: ['OPDEF'],
  syntax: ['syntax    OPDEF  p1,p2,...', '          ...', '[syntax]  ENDM'],
  html: `
${p(`Defines a macro called not by its name but by the <b>syntax</b> of a CPU instruction: mnemonic, registers,
operators and expressions. Any statement of that exact syntax becomes a call. Opdefs exist only in CPU assemblies.`)}
${h4('Syntax (location field)')}
${p(`A 2-character mnemonic operator followed directly by 0 to 3 subfield descriptors separated by commas.`)}
${ul([
  `The first character of the mnemonic may be any nonblank character. If the second is ${c('A')}, ${c('B')} or ${c('X')}, it is a register designator: the call's operation field must be ${c('cAn')}, ${c('cBn')} or ${c('cXn')} (c = first character, n = 0 to 7, or ${c('.expression')}) and n becomes a register parameter. Otherwise the operation field must be exactly the 2 characters.`,
  `The 22 descriptors (r = A, B or X; Q = expression): void, ${c('r')}, ${c('-r')}, ${c('r+r')}, ${c('-r+r')}, ${c('r*r')}, ${c('-r*r')}, ${c('r/r')}, ${c('-r/r')}, ${c('r-r')}, ${c('-r-r')}, ${c('Q')}, ${c('rQ')}, ${c('-rQ')}, ${c('r+rQ')}, ${c('-r+rQ')}, ${c('r*rQ')}, ${c('-r*rQ')}, ${c('r/rQ')}, ${c('-r/rQ')}, ${c('r-rQ')}, ${c('-r-rQ')}.`,
  `Written syntaxes: ${c('JPQ')} (JP K), ${c('JPBQ')} (JP Bn+K), ${c('JPB,Q')} (JP Bn,K), ${c('JPX/XQ')} (JP Xn/Xn+K), ${c('NEB,B,Q')}, ${c('SXX+B')}, ${c('IXX/X')}, ${c('MXQ')}, ${c('RXQ')}.`,
  `When Q is combined with registers, the expression in the call must be preceded by ${c('+')} or ${c('-')}.`,
])}
${h4('Parameters')}
${ul([
  `One formal parameter per register designator and per Q, in order of occurrence: the operation field register first, then the variable field registers and Qs from left to right.`,
  `Same separators and rules as MACRO (null ignored; numeric or repeated names ignored with flag ${c('4')}); LOCAL statements are allowed after the OPDEF.`,
  `A register parameter receives the register number text only, not the letter: 3 for ${c('X3')}, ${c('DIV')} for ${c('X.DIV')}.`,
  `A Q parameter receives the expression text: the whole subfield for a standalone Q (${c('-52')} in ${c('MX6 -52')}); for a combined Q, the expression with its leading sign (${c('-5')} in ${c('SX6 X1-5')}, ${c('+5')} in ${c('SX6 X1+5')}).`,
])}
${h4('Call')}
${ul([
  `A statement whose operation field is not a mnemonic entry (macro, pseudo instruction) is matched against the syntactic entries, newest first; the built-in CPU instructions are the oldest. The mnemonic, number and order of registers, operators and expressions must match: for ${c('SXX+B')}, ${c('SX7 X1+B2')} is a call, but not ${c('SX6 A3+X4')} (other registers), ${c('SX2 X1+')} (incomplete) nor ${c('SX6 X4+CH')} (no register).`,
  `An opdef with the syntax of a CPU instruction replaces that instruction for the rest of the subprogram (it can be disabled by ${see('ps-purgdef', 'PURGDEF')}).`,
  `Location field: as for a format one macro: a symbol forces upper and receives the location counter.`,
  `Expansion lines are listed with M (S for a system opdef); the sequence field shows the operation field of the call.`,
])}
${h4('Errors')}
${T([
  ['5', 'Illegal syntax (CPU operation syntax incorrectly specified); the definition is still read up to its ENDM, but it cannot be called.'],
  ['O', 'OPDEF in a PPU assembly.'],
  ['4', 'Illegal or repeated formal parameter.'],
  ['F', 'More than 63 parameters and local symbols.'],
], ['Flag', 'Cause'])}
${diff(`Redefining an existing opdef or CPU instruction syntax gives no informative flag ${c('3')}.`)}
${h4('Examples')}
${p(`Manual example 2: every ${c('JP K')} (syntax JPQ) becomes ${c('EQ K')}; ${c('JP B1+LAB')} (syntax JPBQ) is not affected.`)}
${ex(`
JPQ       OPDEF  P1
          EQ     P1
          ENDM
          JP     LAB
          JP     B1+LAB
LAB       BSS    0
`)}
${p(`Manual example 4: ${c('RXi K')} assembles as ${c('AXi K')}.`)}
${ex(`
RXQ       OPDEF  P1,P2
          AX_P1  P2
          ENDM
          RX3    5
`)}
${p(`Register parameters: P1 = 3, P2 = 4, P3 = DIV.`)}
${ex(`
IXX/X     OPDEF  P1,P2,P3
          CON    P1,P2,P3
          ENDM
          IX3    X4/X.DIV
DIV       EQU    5
`)}
${p(`Only the exact syntax calls the opdef.`)}
${ex(`
SXX+B     OPDEF  I,J,K
          CON    I,J,K
          ENDM
          SX7    X1+B2       CALL: CON 7,1,2
          SX6    A3+X4       SYNTAX SXA+X: UNKNOWN
`, { errors: ['O'] })}
${ex(`
SX..      OPDEF  A
          ENDM
`, { errors: ['5'] })}
`,
};

CHAPTERS.push({
  id: 'ps-ch-macros',
  title: 'Macros and opdefs',
  intro: p(`A macro is a saved sequence of statements, assembled at each call with the actual parameters substituted for the
formal parameters. MACRO and MACROE macros are called by name (mnemonic entries); OPDEF macros are called by the syntax
of a CPU instruction (syntactic entries). System text macros (${see('sys-intro', 'SYSTEXT')}) are used in the same way.`),
  entries: [MACRO, APPEL, MACROE, ENDM, LOCAL, IRP, OPDEF],
});

// =====================================================================
// Operation code table management
// =====================================================================

const TABLES = {
  id: 'ps-opcode-tables',
  title: 'The operation code table',
  keys: [],
  syntax: [
    'mnemonic entries : pseudo instructions, macros, MACROE, PPU instructions, PPOP, OPSYN copies',
    'syntactic entries: CPU instructions, OPDEF, CPOP, CPSYN copies',
  ],
  html: `
${p(`The operation field of each statement is looked up in the operation code table. At the start of each subprogram
the table holds the pseudo instructions (except LOCAL), the CPU instructions, the PPU instructions and the macros and
opdefs of the system text. Entries added by MACRO, MACROE, OPDEF, CPOP, PPOP, OPSYN and CPSYN are not kept between
subprograms: the table is rebuilt from the originals for each IDENT.`)}
${h4('Two parts')}
${T([
  ['Mnemonic', 'operation field text', 'pseudo instructions, macros (MACRO, MACROE, system macros), PPU instructions (PPU assemblies), PPOP entries, OPSYN copies'],
  ['Syntactic', 'syntax key of the statement (CPU only)', 'CPU instructions, OPDEF entries, CPOP entries, CPSYN copies'],
], ['Part', 'Found by', 'Entries'])}
${p(`Synonyms are made within one part only: OPSYN in the mnemonic part, CPSYN in the syntactic part.`)}
${h4('Lookup')}
${ul([
  `1. The newest active mnemonic entry whose name equals the operation field (the text before any comma); otherwise the built-in pseudo instruction of that name, unless purged; in a PPU assembly, the PPU instruction of that name. A macro is then called, a pseudo instruction or PPU instruction assembled, a NIL copy ignored.`,
  `2. In a PPU assembly, an operation not found is an error ${c('O')}; a 24-bit instruction with zero code is generated.`,
  `3. In a CPU assembly, the syntax key of the statement is built and the newest active syntactic entry with that key is used (opdef: macro call; CPOP, CPSYN or CPU instruction: assembled). The built-in CPU instructions are the oldest entries; a key removed by PURGDEF no longer finds them; with ${c('MACHINE 6')}, 7600-only instructions are not found. If no key matches, a second key is tried with subfields separated by blanks (${c('UX1 B2 X3')}).`,
  `4. Not found: error ${c('O')}; a 30-bit zero instruction is generated.`,
])}
${h4('Precedence (highest first)')}
${T([
  ['1', 'Mnemonic entries created by the program or the system text (macros, MACROE, PPOP, OPSYN), newest first'],
  ['2', 'Built-in pseudo instructions and PPU instructions'],
  ['3', 'Syntactic entries created by the program or the system text (OPDEF, CPOP, CPSYN), newest first'],
  ['4', 'Built-in CPU instructions'],
], ['Rank', 'Entries'])}
${p(`Consequences: a macro named ${c('SB4')} hides ${c('SB4 A1+ABLE')} as a machine instruction (other ${c('SBn')}
forms still assemble, the operation field being different); after ${c('SB4 OPSYN NIL')}, ${c('SB4')} is still a
mnemonic entry, and even an OPDEF for that syntax would not be reached. ${c('PURGMAC SB4')} restores the machine
instruction. A program macro with the name of a system macro overrides it (flag ${c('3')}).`)}
${h4('Syntax keys')}
${p(`The key is made of the 2-character mnemonic (the second one is ${c('A')}, ${c('B')} or ${c('X')} when the operation
field carries a register: ${c('SA')} for ${c('SA1')}), followed by one descriptor per subfield, separated by commas:
registers written as their letter, joined by their operators, and ${c('Q')} for an expression. Examples:
${c('SA7 X3+B1')} → ${c('SAX+B')}; ${c('EQ B1,B2,K')} → ${c('EQB,B,Q')}; ${c('LX1 B2,X3')} → ${c('LXB,X')};
${c('JP B1+LAB')} → ${c('JPBQ')}; ${c('PS')} → ${c('PS')}. The same notation is used for the location field of
${see('ps-opdef', 'OPDEF')} and ${see('ps-cpop', 'CPOP')} and the operands of ${see('ps-cpsyn', 'CPSYN')} and
${see('ps-purgdef', 'PURGDEF')} (see also ${see('cpu-formats', 'CPU instruction formats')}).`)}
${h4('Interactions')}
${ul([
  `MACRO or MACROE with an existing name: new mnemonic entry, flag ${c('3')}; the old one remains, hidden.`,
  `OPDEF or CPOP with an existing syntax: new syntactic entry, without a flag.`,
  `OPSYN, CPSYN: copy of an entry at that moment; later redefinition of the original does not affect the copy.`,
  `PURGMAC and PURGDEF disable all the entries of a name or key, built-in ones included; a later definition of the same name or key is active again.`,
  `${see('ps-if', 'IF MAC')} tests the mnemonic part only.`,
])}
${diff(`The table has no size limit (4123 entries in COMPASS). PURGMAC of a system text macro marks the shared system
definition: the macro also remains disabled in the following assemblies of the same session.`)}
${ex(`
SB4       MACRO  X
          CON    X
          ENDM
          SB4    10          MACRO
          SB5    A1+1        MACHINE INSTRUCTION
          PURGMAC SB4
          SB4    A1+1        MACHINE INSTRUCTION AGAIN
`)}
`,
};

const NIL = {
  id: 'ps-nil',
  title: 'NIL - no operation',
  keys: ['NIL'],
  syntax: ['          NIL'],
  html: `
${p(`NIL generates no code and has no effect. The location field is ignored: a symbol there is <b>not</b> defined. The
variable field is ignored.`)}
${p(`Its main use is to disable a macro: after ${c('MACK OPSYN NIL')}, a call ${c('TAG MACK A,A,6,73')} does nothing and
TAG is not defined. NIL cannot be used with CPSYN. ENDM, ENDD, ENDIF and IRP also act as nil instructions outside their
context.`)}
${ex(`
MACK      MACRO  A
          CON    A
          ENDM
MACK      OPSYN  NIL
TAG       MACK   1           NOTHING ASSEMBLED
          NIL
`)}
${ex(`
LAB       NIL
          CON    LAB         LAB IS NOT DEFINED
`, { errors: ['U'] })}
`,
};

const OPSYN = {
  id: 'ps-opsyn',
  title: 'OPSYN - synonymous mnemonic operation',
  keys: ['OPSYN'],
  syntax: ['name1     OPSYN  name2'],
  html: `
${p(`Creates a mnemonic entry ${c('name1')} that is a copy of the mnemonic entry ${c('name2')} (macro, pseudo
instruction, PPU instruction in a PPU assembly, PPOP, earlier OPSYN copy).`)}
${ul([
  `The copy is made at that moment: a later redefinition of name2 does not affect name1.`,
  `If name1 already exists, the new entry takes precedence without notice; the old one is not lost (see ${see('ps-purgmac', 'PURGMAC')}).`,
  `CPU instructions are syntactic entries: they cannot be the object of OPSYN (use ${see('ps-cpsyn', 'CPSYN')}).`,
  `The idiom for redefining an instruction while keeping access to it: ${c('LJMX OPSYN LJM')}, ${c('PURGMAC LJM')}, ${c('LJM MACRO ...')}, and later ${c('LJM OPSYN LJMX')}.`,
])}
${h4('Errors')}
${p(`${c('A')}: name2 is not a mnemonic entry, or name1 is blank.`)}
${h4('Examples')}
${p('The manual example, in a PPU program:')}
${ex(`
          IDENT  CALLS
          PERIPH
          ORG    100B
CALL      OPSYN  RJM
          CALL   SUB
          LJM    *
SUB       LJM    *
          END
`)}
${p('A pseudo instruction under another name, then purged and restored:')}
${ex(`
REPT      OPSYN  DUP
          PURGMAC DUP
          REPT   2
          CON    1
          ENDD
DUP       OPSYN  REPT
          DUP    1
          CON    2
          ENDD
`)}
${ex(`
CALL      OPSYN  RJ          RJ IS SYNTACTIC
`, { errors: ['A'] })}
`,
};

const PURGMAC = {
  id: 'ps-purgmac',
  title: 'PURGMAC - purge mnemonic entries',
  keys: ['PURGMAC'],
  syntax: ['          PURGMAC name1,name2,...'],
  html: `
${p(`Disables, for the rest of the subprogram, all mnemonic entries of each name: macros, MACROE, OPSYN copies, PPOP, and
the built-in pseudo instruction or PPU instruction of that name. The location field is ignored. A name with no entry is
accepted without a message.`)}
${ul([
  `A later definition (MACRO, OPSYN...) of the same name is active again.`,
  `Purging a mnemonic entry that hides a CPU instruction (${c('SB4')}) makes the instruction available again.`,
  `Purging a pseudo instruction (${c('PURGMAC CON')}) makes it unknown: flag ${c('O')} on later uses.`,
])}
${diff(`All entries of the name are disabled at once (the manual is ambiguous between all entries and the newest one).
Purging a system text macro also disables it in later assemblies of the same session; avoid it.`)}
${ex(`
M         MACRO
          CON    1
          ENDM
M         MACRO
          CON    2
          ENDM
          M                  CON 2
          PURGMAC M
          IF     -MAC,M,1
          CON    3           M NO LONGER EXISTS
`, { errors: ['3'] })}
${ex(`
          PURGMAC CON
          CON    1
`, { errors: ['O'] })}
`,
};

const CPOP = {
  id: 'ps-cpop',
  title: 'CPOP - define a CPU operation code',
  keys: ['CPOP'],
  syntax: ['sytx      CPOP   ctl,val,reg[,type]'],
  html: `
${p(`Adds a CPU instruction to the syntactic part of the table, without a macro: statements of syntax ${c('sytx')} are
assembled directly from the description.`)}
${T([
  ['sytx', `Syntax, written as for ${see('ps-opdef', 'OPDEF')}.`],
  ['ctl', 'Format: 0 = 15 bits, 1 = 30 bits, 2 = 15 bits with force upper before, 3 = 30 bits with force upper before, 4 = 15 bits with force upper after, 5 = 30 bits with force upper after, 6 = 15 bits with force upper before and after, 7 = 30 bits with force upper before and after.'],
  ['val', 'Operation code fmi on 9 bits (i = 0 unless taken from val): evaluatable expression in the current base (octal when the base is M); write the B suffix in base D.'],
  ['reg', 'Three octal digits giving, left to right, the source of the i, j and k fields (a 30-bit instruction uses i and j): 1 = register of the operation field, 2 = second register (or only register) of the variable field, 3 = first of two registers of the variable field, 0 = field taken from val (i) or zero. A trailing B is accepted.'],
  ['type', 'Machine restriction (6 or 7): accepted, ignored.'],
], ['Field', 'Content'])}
${ul([
  `The expression Q goes into K (18 bits) in a 30-bit instruction, into jk (6 bits) in a 15-bit instruction.`,
  `A new CPOP takes precedence over an existing entry of the same syntax (opdef, CPU instruction) without notice.`,
])}
${h4('Errors')}
${T([
  ['5', 'Illegal syntax; the CPOP is ignored.'],
  ['A', 'ctl outside 0-7, reg digit outside 0-3, missing ctl or val; the CPOP is ignored.'],
], ['Flag', 'Cause'])}
${h4('Examples')}
${p(`The manual examples: ${c('SA7 X3+B1')} gives 53731 and ${c('SX3 X1+3')} gives 7231000003.`)}
${ex(`
SAX+B     CPOP   0,530B,132B
SXXQ      CPOP   1,720B,120B
          SA7    X3+B1
          SX3    X1+3
`)}
${p(`A new mnemonic: ${c('ZZ B5')} gives 61050 (reg 020: j from the only register).`)}
${ex(`
ZZB       CPOP   0,610B,020
          ZZ     B5
`)}
${ex(`
ZZ        CPOP   8,460B,000
ZY        CPOP   0,460B,004
`, { errors: ['A'] })}
`,
};

const CPSYN = {
  id: 'ps-cpsyn',
  title: 'CPSYN - synonymous syntax',
  keys: ['CPSYN'],
  syntax: ['sytx1     CPSYN  sytx2'],
  html: `
${p(`Creates a syntactic entry ${c('sytx1')} that is a copy of the entry found for ${c('sytx2')} (CPU instruction, CPOP,
OPDEF or earlier CPSYN). Afterwards, a statement in either syntax produces what the entry of sytx2 describes. An existing
entry for sytx1 is overridden without notice. NIL cannot be used.`)}
${p(`The copy keeps the register sources of sytx2 by position (first register, second register): it is meaningful when
both syntaxes have their registers in the same order.`)}
${h4('Errors')}
${p(`${c('A')}: sytx1 or sytx2 is not a legal syntax, or sytx2 has no entry.`)}
${ex(`
IAX+X     CPSYN  IXX+X
          IA6    X1+X2       SAME AS IX6 X1+X2
`)}
${ex(`
NO        CPSYN  NIL
`, { errors: ['A'] })}
`,
};

const PURGDEF = {
  id: 'ps-purgdef',
  title: 'PURGDEF - purge syntactic entries',
  keys: ['PURGDEF'],
  syntax: ['          PURGDEF sytx'],
  html: `
${p(`Disables, for the rest of the subprogram, all syntactic entries of the syntax: opdefs, CPOP, CPSYN copies and the
built-in CPU instruction. The location field is ignored. A later OPDEF, CPOP or CPSYN for the same syntax is active
again. An opdef cannot be deleted otherwise; it can only be overridden by a later definition or disabled by PURGDEF.`)}
${h4('Errors')}
${p(`${c('5')}: illegal syntax.`)}
${ex(`
          PURGDEF SAX+B
          SA7    B1+X3       SYNTAX SAB+X: STILL DEFINED
SAX+B     CPOP   0,530B,132B
          SA7    X3+B1       NEW ENTRY
`)}
${ex(`
          PURGDEF SAX+B
          SA7    X3+B1
`, { errors: ['O'] })}
`,
};

const PPOP = {
  id: 'ps-ppop',
  title: 'PPOP - define a PPU operation code',
  keys: ['PPOP'],
  syntax: ['name      PPOP   ctl,val[,type]'],
  html: `
${p(`Adds a PPU instruction to the mnemonic part of the table (it is used in PPU assemblies).`)}
${T([
  ['name', 'Mnemonic, 1 to 8 characters (required).'],
  ['ctl', 'Format: 1 = 24 bits, 12-bit address; 2 = 12 bits, relative jump (like UJN); 3 = 24 bits, 18-bit constant (like LDC); 4 = 12 bits, 6-bit operand (like LDN); 5 = 24 bits, 12-bit address with optional index (like LDM); 6 = 12 bits, signed shift count (like SHN); 7 = 24 bits, address and required second field (like IAM).'],
  ['val', 'Operation code as a 4-digit octal value; only the two leftmost digits are used. Evaluatable expression in the current base (octal when the base is M): write the B suffix in base D (5400B).'],
  ['type', 'Machine restriction (6 or 7): accepted, ignored.'],
], ['Field', 'Content'])}
${ul([
  `An existing entry of the same name is overridden without error (PPU instructions included).`,
  `A format 7 instruction used without its second field is flagged ${c('8')}.`,
])}
${h4('Errors')}
${p(`${c('A')}: ctl outside 1-7, missing ctl or val, or blank name; the PPOP is ignored.`)}
${diff(`Formats 1 and 5 are identical here: format 1 also accepts an index.`)}
${ex(`
          IDENT  PPOPS
          PERIPH
          ORG    100B
STO       PPOP   5,5400B
LDZ       PPOP   4,1400B
JMP       PPOP   2,0300B
          STO    200B        5400 0200
          LDZ    7           1407
          JMP    *+2         0302
          LDN    1
          END
`)}
${ex(`
          IDENT  PPBAD
          PERIPH
          ORG    100B
BAD       PPOP   0,1400B
          PPOP   1,1400B
          END
`, { errors: ['A'] })}
`,
};

CHAPTERS.push({
  id: 'ps-ch-tables',
  title: 'Operation code table management',
  intro: p(`These pseudo instructions add, copy or disable entries of the operation code table. The table itself, its two
parts and the lookup order are described in ${see('ps-opcode-tables', 'the operation code table')}.`),
  entries: [TABLES, NIL, OPSYN, PURGMAC, CPOP, CPSYN, PURGDEF, PPOP],
});

// =====================================================================
// Micros
// =====================================================================

const MICRO = {
  id: 'ps-micro',
  title: 'MICRO - micro definition and micro substitution',
  keys: ['MICRO'],
  syntax: ['micname   MICRO  n1,n2,dstringd', '          ... "micname" ...      micro reference'],
  html: `
${p(`Defines a micro: a named character string that replaces every reference ${c('"micname"')} written in later
statements. In this character set the micro mark is ${c('"')} (the ≠ of the CDC graphic set).`)}
${T([
  ['micname', 'Micro name, 1 to 8 characters (required). Micro names do not conflict with symbols, macros or IF names.'],
  ['n1', 'Starting character in the string (1 = first character after d): absolute evaluatable expression (decimal when the base is M).'],
  ['n2', 'Number of characters: absolute evaluatable expression (decimal when the base is M).'],
  ['d', 'Delimiter: the first character after the second comma. The string runs to the next occurrence of d; it may contain blanks and commas.'],
], ['Field', 'Content'])}
${h4('Extraction rules')}
${ul([
  `n2 characters are taken from position n1; extraction stops early at the closing delimiter.`,
  `n1 &gt; 0 with n2 omitted, zero or negative: everything from n1 to the closing delimiter.`,
  `n1 omitted, zero or negative: the micro is <b>empty</b> (n2 and the string are ignored); a reference to it substitutes nothing.`,
  `n1 beyond the end of the string: empty micro.`,
  `The string is taken <b>after editing</b>: it may be built from other micros, including the old value of the micro being redefined (${c('MSG MICRO 1,,*"MSG" BETA*')}).`,
  `A micro may be redefined at any time; the old value is then inaccessible. An empty variable field defines an empty micro.`,
])}
${h4('Errors')}
${T([
  ['L', 'Blank or too long micro name.'],
  ['A', 'Fewer than three subfields (the micro is not defined); missing closing delimiter (the string runs to the end of the statement).'],
  ['7', 'n1 or n2 negative.'],
], ['Flag', 'Cause'])}
${h4('Micro substitution')}
${ul([
  `Every statement except asterisk comments is edited before being interpreted or examined for syntax: each pair ${c('"name"')} is replaced by the micro value, in any field, comments included. Skipped statements (IF) are edited too; statements captured into a definition (macro, DUP, ECHO, RMT) are not: they are edited each time they are assembled.`,
  `The scan runs left to right; the first mark opens a reference and the next one closes it. The substituted text is not rescanned.`,
  `Unknown name: no substitution, the marks and the name remain, and the line gets informative flag ${c('9')}. A name containing a blank or a comma, or longer than 8 characters, is not a reference: the mark is left as is.`,
  `A single unpaired mark is left as is, without error. ${c('""')} (null name): both marks are deleted.`,
  `Columns shift by the change in length: a micro may move the operation or variable field, or supply a whole statement. An edited statement is limited to 72 + 9 × 71 = 711 characters; the excess is discarded without notice.`,
  `Concatenation marks ${c('_')} are removed in the same editing pass.`,
  `Listing: without option A, the line is shown as read; with A, as read and as edited.`,
])}
${h4('Predefined micros')}
${T([
  ['DATE', '10 characters: blank, then yy/mm/dd and a period'],
  ['JDATE', '5 digits yyddd (Julian date)'],
  ['TIME', '10 characters: blank, then hh.mm.ss and a period'],
  ['BASE', 'current base, D, M or O (initially D); updated by BASE'],
  ['CODE', 'current character code letter (initially D); updated by CODE'],
  ['QUAL', 'current qualifier, 0 to 8 characters (null for the blank qualifier); updated by QUAL'],
  ['SEQUENCE', '18 characters: columns 73 to 90 of the statement most recently read from the main source (unchanged during expansions and XTEXT)'],
  ['MODLEVEL', 'ML option of the assembler, otherwise the JDATE value'],
  ['PCOMMENT', 'PC option of the assembler, padded or truncated to exactly 30 characters (30 blanks by default)'],
], ['Micro', 'Value'])}
${p(`These micros are reset at the start of each subprogram. A program definition overrides a predefined micro; for BASE,
CODE and QUAL, it also stops the automatic updates. ${c('name BASE')}, ${c('name CODE')} and ${c('name QUAL')} define micro
name as the previous base, code or qualifier (${see('ps-base', 'BASE')}, ${see('ps-code', 'CODE')}, ${see('ps-qual', 'QUAL')}).
The length of a micro is given by ${see('ps-miccnt', 'MICCNT')}; ${see('ps-decmic', 'DECMIC and OCTMIC')} build micros
from numbers. Micros defined by the system text are available at the start of each assembly (SYSTEXT defines none).`)}
${h4('Examples')}
${p('The manual examples: each micro holds ALPHANUMERIC STRING; MICCNT gives 19 (23B).')}
${ex(`
NAME      MICRO  1,19,*ALPHANUMERIC STRING*
MICKY     MICRO  1,,*ALPHANUMERIC STRING*
NAM1      MICRO  1,12,$ALPHANUMERIC$
NAM2      MICRO  1,7,X STRINGX
NAM3      MICRO  1,,+"NAM1""NAM2"+
N         MICCNT NAM3
          CON    N
          DIS    ,*"NAM3"*
`)}
${p('Limit cases: E and H are empty, G holds BCDE (flag 7 for the negative n2), I holds AB (missing delimiter, flag A).')}
${ex(`
E         MICRO  0,5,*ABC*
G         MICRO  2,-1,*ABCDE*
H         MICRO  9,2,*ABC*
I         MICRO  1,2,*ABC
L1        MICCNT E
L2        MICCNT G
L3        MICCNT H
L4        MICCNT I
          CON    L1,L2,L3,L4
`, { errors: ['7', 'A'] })}
${p('Redefinition from the old value: ALPHA BETA, 10 characters.')}
${ex(`
MSG       MICRO  1,,*ALPHA*
MSG       MICRO  1,,*"MSG" BETA*
LEN       MICCNT MSG
          CON    LEN
`)}
${p('A micro that supplies most of a statement (manual example 6):')}
${ex(`
NAM       MICRO  1,,* LOC  SA1 ADDRESS+*
"NAM"1
ADDRESS   BSS    1
`)}
${p('Predefined micros in a character string:')}
${ex(`
          DIS    ,*ASSEMBLED"DATE""TIME"*
          DIS    ,*BASE "BASE", CODE "CODE"*
`)}
${ex(`
          CON    "UNKNOWN"   FLAG 9, THEN A: THE MARKS REMAIN
`, { errors: ['9', 'A'] })}
`,
};

const DECMIC = {
  id: 'ps-decmic',
  title: 'DECMIC, OCTMIC - micro from a number',
  keys: ['DECMIC', 'OCTMIC'],
  syntax: ['micname   DECMIC exp[,n]', 'micname   OCTMIC exp[,n]'],
  html: `
${p(`Defines micro ${c('micname')} as the decimal (DECMIC) or octal (OCTMIC) digits of the value of an expression.`)}
${T([
  ['micname', 'Micro name (required).'],
  ['exp', 'Absolute evaluatable expression.'],
  ['n', 'Optional number of digits: absolute expression (decimal when the base is M).'],
], ['Field', 'Content'])}
${ul([
  `n omitted or zero: as many digits as the conversion needs (at most the last 10).`,
  `Otherwise exactly n digits: extra digits are truncated <b>on the left</b>; fewer digits are right-justified with leading zeros.`,
  `The string never exceeds 10 characters.`,
  `Numbers are treated as positive: a negative value gives the digits of its magnitude (${c('-5')} gives ${c('5')}).`,
  `The octal field of the listing shows the value of the expression.`,
])}
${h4('Errors')}
${T([
  ['L', 'Missing micro name.'],
  ['A', 'n less than 0 or greater than 10 (10 digits are produced); malformed or empty expression.'],
  ['U', 'Undefined symbol.'],
], ['Flag', 'Cause'])}
${h4('Examples')}
${p('The manual example: B = 1024 (2000B); SYMBL is 001024, V1 is 002000, MSG is 001024 STORAGE NEEDED.')}
${ex(`
B         EQU    1024
SYMBL     DECMIC B,6
V1        OCTMIC B,6
V2        OCTMIC B           2000
V3        DECMIC B,2         24
V4        DECMIC -5          5
MSG       MICRO  1,,*"SYMBL" STORAGE NEEDED*
          DIS    ,*"MSG"*
          DIS    ,*"V1" "V2" "V3" "V4"*
`)}
${ex(`
V5        DECMIC 1024,11
          DECMIC 5
`, { errors: ['A', 'L'] })}
`,
};

CHAPTERS.push({
  id: 'ps-ch-micros',
  title: 'Micros',
  intro: p(`A micro is a named character string substituted in the source text, before interpretation, wherever its name
appears between micro marks. MICRO defines a micro from a string, DECMIC and OCTMIC from a number; MICCNT gives the length
of a micro.`),
  entries: [MICRO, DECMIC],
});
