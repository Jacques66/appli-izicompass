// COMPASS reference: language structure (statement format, editing, names
// and symbols, data notation, expressions, program structure, character
// sets, errors, listing, binary output, execution parameters).
//
// Source: CDC manual 60492600 M (chapters 1 to 3, 10, 11, appendices A, B,
// D), summarised in docs/spec/01-language.md and 05-listing-binary.md. Every
// rule describes what our assembler (src/asm) actually does; differences
// from the manual are pointed out in the text. The character-set and
// error-flag tables are generated from the assembler's own tables, so they
// cannot drift from its behaviour.

import { c, src, ex, T, see, note, ul, h4, esc } from './fmt.js';
import { DISPLAY, DISPLAY_CDC, HOLLERITH_026, HOLLERITH_029 } from '../../src/common/charset.js';
import { charValue } from '../../src/asm/charcode.js';
import { ERROR_TEXT, FATAL } from '../../src/asm/assembler.js';
import { MAX_IMAGE } from '../../src/asm/source.js';

// ------------------------------------------------------------ helpers

const o2 = (n) => n.toString(8).padStart(2, '0');

/**
 * Continued statement: `text` (no embedded blank) is cut exactly at column
 * 72, each continuation line starting with "," in column 1.
 */
function continued(text) {
  const lines = [text.slice(0, 72)];
  for (let k = 72; k < text.length; k += 71) lines.push(',' + text.slice(k, k + 71));
  return lines.join('\n');
}

/** Hollerith punches of a column code (bit 11 = row 12 ... bit 0 = row 9). */
function punches(v) {
  if (v === undefined) return '—';
  if (v === 0) return '(none)';
  const p = [];
  if (v & 0o4000) p.push('12');
  if (v & 0o2000) p.push('11');
  if (v & 0o1000) p.push('0');
  if (v & (1 << 1)) p.push('8');
  for (let n = 1; n <= 9; n++) if (n !== 8 && v & (1 << (9 - n))) p.push(String(n));
  return p.join('-');
}

const glyph = (ch) => (ch === ' ' ? '<i>blank</i>' : `<span class="mono">${esc(ch)}</span>`);

// =================================================================
// Chapter 1: statement format
// =================================================================

const FORMAT = {
  id: 'lang-format',
  title: 'Source lines and statement fields',
  keys: [],
  syntax: ['[location] operation [variable] [comments]'],
  html: `
<p>A COMPASS program is a sequence of lines (originally 80-column cards). Each
statement has four fields: the <b>location field</b> (label), the <b>operation
field</b>, the <b>variable field</b> (subfields separated by commas) and the
<b>comments field</b>. The format is essentially free: fields are separated by
one or more blanks, and only a few columns have a fixed meaning.</p>

${h4('Physical line')}
${ul([
    `Only <b>columns 1 through 72</b> are interpreted. A shorter line is padded with blanks up to column 72.`,
    `Columns 73 through 90 are the <b>sequence field</b>: they are not interpreted, but they are reproduced on the listing and are the value of the ${c('SEQUENCE')} micro while the statement is processed. Anything beyond column 90 is ignored.`,
    `Column 1 determines the kind of line: ${c('*')} comment line (${see('lang-comments', 'comments')}), ${c(',')} continuation line (${see('lang-continuation', 'continuation')}), any other character (including blank) starts a new statement.`,
  ])}

${h4('Reading an ASCII source (specific to this implementation)')}
<p>The original source is 6-bit display code, hence upper case only. Our
assembler reads ASCII text and normalises it before any analysis:</p>
${ul([
    `<b>lower-case letters</b> are folded to upper case everywhere, character strings included: ${c('3Habc')} is read as ${c('3HABC')};`,
    `<b>tab characters</b> are expanded into blanks, with stops at columns 11, 18 and 30, then every 8 columns (an extension: CDC sources have no tabs);`,
    `the original CDC glyphs are accepted as synonyms of their ASCII equivalents: ${c('≡')} = ${c('#')}, ${c('≠')} = ${c('"')}, ${c('→')} = ${c('_')}, ${c('∨')} = ${c('!')}, ${c('∧')} = ${c('&')}, ${c('↑')} = ${c("'")}, ${c('↓')} = ${c('?')}, ${c('≤')} = ${c('@')}, ${c('≥')} = ${c('\\')}, ${c('¬')} = ${c('^')};`,
    `any character outside the 64-character set (${see('lang-charsets', 'character set')}) becomes a <b>blank</b> (display code 55B).`,
  ])}

${h4('Field recognition: exact rules')}
<p>After continuation lines are joined and the statement is edited
(${see('lang-edition', 'editing')}), the statement image is split as follows;
"comments column" means the column set by ${see('ps-col', 'COL')} (30 by
default):</p>
<ol>
<li><b>Location field.</b> If column 1 <i>or</i> column 2 is nonblank, the
location field is the word that starts in column 1 (or in column 2 when column 1
is blank) and extends to the first blank. If columns 1 and 2 are both blank,
there is no location field. Depending on the operation, it holds a symbol, a
name, or ${c('+')} / ${c('-')} (force upper control, ${see('lang-force', 'force upper')}).</li>
<li><b>Operation field.</b> It begins with the first nonblank character after
the location field (from column 3 when there is no location field) and ends at
the first blank. If that first nonblank character is <b>at or beyond the comments
column</b>, the operation field is empty and the rest of the line is comments.</li>
<li><b>Variable field.</b> It begins with the first nonblank character after the
operation field. It is empty if that character is at or beyond the comments
column, <b>unless</b> the operation field itself extends to or beyond the comments
column: for that statement only the limit is lifted, and any nonblank character
after the operation field starts the variable field.</li>
<li><b>End of the variable field.</b> The variable field ends at the first blank
that is not part of a construct that may contain blanks: a counted character
string (${c('10HERROR IN P')} takes exactly 10 characters), a delimited string
(${c('H*A B*')}), a parenthesised macro parameter, the text of
${see('ps-title', 'TITLE')} or ${see('ps-comment', 'COMMENT')}. What follows is
the comments field.</li>
</ol>
${note(`A field therefore cannot contain a stray blank: ${c('SX1    ALPHA + BETA')} assembles ${c('SX1 ALPHA')} and takes ${c('+ BETA')} as a comment.`)}

${h4('Special cases')}
${ul([
    `<b>Symbol in the location field and empty operation field</b>: the statement is equivalent to ${c('BSSZ 1')} (one labelled zero word).`,
    `<b>Empty location and operation fields</b>: the line is a comment (counted by the line counts of ${see('ps-ifop', 'IF')}).`,
    `The operation field may start anywhere before the comments column; a location field may start in column 2.`,
    `The operation field of a CPU instruction may carry a register designated by an expression: ${c('SB.SUM')} (${see('lang-registers', 'registers')}).`,
  ])}

${h4('Coding convention')}
<p>All the manual's examples, and those of this reference, follow the COMPASS
coding form; it is not mandatory.</p>
${T([
    ['1', 'blank, <code>*</code> or <code>,</code>'],
    ['2–9', 'location field (or <code>+</code>, <code>-</code>), left-justified; a symbol is often written from column 1'],
    ['10', 'blank'],
    ['11–16', 'operation field, left-justified'],
    ['17', 'blank'],
    ['18–29', 'variable field, left-justified'],
    ['30–72', 'comments'],
    ['73–90', 'sequence (not interpreted)'],
  ], ['Columns', 'Contents'])}

${h4('Examples')}
<p>Free format: location field in column 2, fields separated by single blanks.</p>
${ex(`
 TABLE    DATA   1
TAB2 DATA 2
          SX1    TAB2-TABLE    COMMENTS AFTER THE VARIABLE FIELD`)}
<p>An operation field starting in column 30 is no longer an instruction but a
comment. A lone symbol reserves one zero word.</p>
${ex(`
                             SX1    1    ALL OF THIS IS A COMMENT
ZEROWORD
          SX1    ZEROWORD`)}
<p>With ${c('COL 40')}, a variable field starting in column 40 is a comment: the
${c('SX1')} instruction has no operand left and becomes an unknown form (flag O).</p>
${ex(`
          COL    40
          SX1                          5
          COL    30`, { errors: ['O'] })}
<p>With the smallest comments column (${c('COL 5')} gives 12), the operation field
${c('SX4')} extends beyond column 12: the limit is lifted and ${c('7')} is the
variable field.</p>
${ex(`
          COL    5
          SX4         7
          COL    30`)}
`,
};

const CONTINUATION = {
  id: 'lang-continuation',
  title: 'Continuation lines',
  keys: [],
  syntax: [',rest of the statement (columns 2 to 72)'],
  html: `
<p>A statement too long for one line continues on the following lines: each
continuation line has a <b>comma in column 1</b> and its text starts in
column 2.</p>
${ul([
    `<b>At most 9 continuation lines</b>: a statement occupies at most 10 lines. The statement image is made of columns 1–72 of the first line followed by columns 2–72 of each continuation line, <b>concatenated without separator</b>: ${MAX_IMAGE} characters at most (72 + 9 × 71).`,
    `Each line is first padded with blanks to column 72, so the break falls <b>exactly at column 72</b>: for a field to continue, the first line must be filled up to column 72; otherwise the padding blanks end the field and the text of the continuation line is taken as comments.`,
    `The break may fall anywhere, even in the middle of a symbol or a number.`,
    `A tenth continuation line, or a continuation line that follows a comment line (${c('*')} in column 1) or has no statement to continue, is processed as a <b>comment line</b>.`,
    `Editing may lengthen the image (micro substitution): characters beyond ${MAX_IMAGE} are lost without notice (${see('lang-edition', 'editing')}).`,
    `On the listing only the first line of the statement is reproduced (a difference from the manual, which lists every card).`,
  ])}

${h4('Examples')}
<p>The first line ends exactly in column 72, on the comma between two data items;
the continuation line supplies the last two.</p>
${ex(`
          DATA   1111111111,2222222222,3333333333,4444444444,5555555555,
,6666666666,77777`)}
<p>Break inside a number: ${c('55555555555')} and ${c('5')} form
${c('555555555555')}.</p>
${ex(`
          DATA   1111111111,2222222222,3333333333,4444444444,55555555555
,5,1`)}
<p>A long list of literals spread over several lines, cut at column 72:</p>
${ex(continued('          LIT    ' + Array.from({ length: 60 }, (_, k) => k + 1).join(',')))}
`,
};

const COMMENTAIRES = {
  id: 'lang-comments',
  title: 'Comments',
  keys: [],
  syntax: ['* text', '                             text (columns 1 to 29 blank)', 'operation variable text'],
  html: `
<p>There are three kinds of comments:</p>
<ol>
<li><b>Comment line</b>: ${c('*')} in column 1. The line is listed and has no
other effect. It is not edited, <b>not counted</b> by the line counts of IF skips
(${see('ps-ifop', 'IFxx')}, ${see('ps-skip', 'SKIP')}), and <b>not saved</b> in a
definition (macro, DUP, ECHO, RMT): inside a macro this is the preferred form.</li>
<li><b>Blank line or shifted comment</b>: empty location field and no nonblank
character before the comments column (columns 1–29 blank by default). An
entirely blank line belongs to this kind. Such a line <b>is counted</b> by line
counts and saved in definitions.</li>
<li><b>Comments field</b> of a statement: everything after the first blank that
ends the variable field; when the variable field is empty, comments may start
only at the comments column.</li>
</ol>
${note(`The comments field is part of the statement and is <b>edited</b> like the rest: a micro mark ${c('"')} or concatenation mark ${c('_')} is processed there too, and a reference to an unknown micro in a comment raises warning 9.`)}
${ul([
    `An orphan continuation line (${c(',')} in column 1 with no statement to continue) is listed as a comment.`,
    `Before the first ${see('ps-ident', 'IDENT')}, every line is only listed; an ${c('END')} found there is flagged (O, "IDENT STATEMENT MISSING.").`,
  ])}
${h4('Examples')}
${ex(`
* COMMENT LINE, NEITHER EDITED NOR COUNTED
                             SHIFTED COMMENT, COUNTED BY IF
          SX1    1             COMMENTS OF THE INSTRUCTION`)}
<p>A reference to an unknown micro in the comments field is flagged:</p>
${ex(`
          SX1    1             VALUE "UNKNOWN"`, { errors: ['9'] })}
`,
};

// =================================================================
// Chapter 2: statement editing
// =================================================================

const EDITION = {
  id: 'lang-edition',
  title: 'Statement editing: concatenation and micro substitution',
  keys: ['_', '"'],
  syntax: ['text_text', '"NAME"'],
  html: `
<p>Every statement is <b>edited</b> before it is interpreted. Editing consists
of two operations: removal of concatenation marks and substitution of micro
references.</p>

${h4('When editing takes place')}
${ul([
    `Every statement read (source, external text, expansion) is edited just before it is interpreted, <b>comments field included</b>.`,
    `Exceptions: comment lines ${c('*')} are never edited; lines that belong to a <b>definition</b> (between ${see('ps-macro', 'MACRO')}, ${see('ps-macroe', 'MACROE')} or ${see('ps-opdef', 'OPDEF')} and ${see('ps-endm', 'ENDM')}, between ${see('ps-dup', 'DUP')} or ${see('ps-echo', 'ECHO')} and ${see('ps-endd', 'ENDD')}, between a pair of ${see('ps-rmt', 'RMT')}) are saved <b>unedited</b> and edited each time they are expanded.`,
    `Lines skipped by an IF are edited too (they must be, so that ${c('ELSE')} or ${c('ENDIF')} can be recognised). In our implementation, warning 9 produced while editing a skipped line is not reported.`,
    `With option ${c('A')} of ${see('ps-list', 'LIST')}, a line changed by editing is listed as read and again as edited.`,
  ])}

${h4('Concatenation')}
<p>The concatenation mark is ${c('_')} (CDC glyph ${c('→')}, display code 65B).
It is <b>removed from every field</b> of the statement and the two adjacent
characters are joined: each removal shifts the rest of the line one column to the
left. Its main use is to delimit a macro parameter name from the text that
follows it (${c('P_X')}). It cannot be used as a string delimiter nor appear in a
symbol.</p>

${h4('Micro substitution')}
<p>A micro reference is a name enclosed between two ${c('"')} marks (CDC glyph
${c('≠')}, display code 64B). It is replaced, marks included, by the micro string
(${see('ps-micro', 'MICRO')}, ${see('ps-decmic', 'DECMIC')}…). The image is
scanned once, left to right:</p>
${ul([
    `on a ${c('"')} mark the assembler looks for the next mark; if there is none, the lone mark stays in the line without error (it may be part of a character string);`,
    `two adjacent marks ${c('""')} (null name) are simply removed: the "null substitution";`,
    `if the text between the marks cannot be a name (more than 8 characters, a blank or a comma), the first mark is kept as an ordinary character and scanning resumes just after it;`,
    `if the name is that of a defined micro, the reference is replaced and scanning resumes <b>after the inserted text</b>: a micro string is never rescanned, so ${c('"')} or ${c('_')} characters it contains are kept;`,
    `if the name is unknown, the reference is left unchanged (marks included) and warning <b>9</b> ("MICRO SUBSTITUTION ERROR. NO SUBSTITUTION.") is issued;`,
    `the replacement may be longer or shorter than the reference: the rest of the line is shifted; the edited image is truncated to ${MAX_IMAGE} characters without notice.`,
  ])}
${note(`Shifts caused by editing can move a field across the comments column: a comment can become a variable field, or a variable field can be pushed into the comments. When the variable field is empty, prefer a comment line beginning with ${c('*')}.`)}
<p>Micro names form a name space separate from symbols and macros: a micro may
have the name of a macro (the system text defines macros ${c('DATE')} and
${c('TIME')} as well as the predefined micros of the same names). List of
predefined micros: ${see('lang-predefined-micros', 'predefined micros')}.</p>

${h4('Examples')}
<p>Concatenation and null substitution: both lines generate the word
${c('01020304000000000000')}.</p>
${ex(`
          DATA   0LAB_CD
          DATA   0LAB""CD`)}
<p>Micro substitution inside a string, then concatenation to join the inserted
text to the next character:</p>
${ex(`
SUFFIX    MICRO  1,3,*XYZ*
          DATA   0LNAM"SUFFIX"
          DATA   0L"SUFFIX"_9
          DATA   0L"SUFFIX""SUFFIX"`)}
<p>A lone mark stays in the line: ${c('1R"')} is 64B.</p>
${ex(`
          DATA   1R"`)}
<p>Unknown name: the reference stays as written and warning 9 is issued.</p>
${ex(`
          DATA   0L"UNKNOWN"`, { errors: ['9'] })}
<p>The ${c('BASE')} micro holds the letter of the current base; here it is used
as a character constant:</p>
${ex(`
          SX1    1R"BASE"
          BASE   O
          SX2    1R"BASE"
          BASE   *`)}
`,
};

const MICROS_PREDEF = {
  id: 'lang-predefined-micros',
  title: 'Predefined micros',
  keys: ['JDATE', 'MODLEVEL', 'PCOMMENT', 'SEQUENCE'],
  syntax: ['"DATE"  "JDATE"  "TIME"  "BASE"  "CODE"  "QUAL"  "SEQUENCE"  "MODLEVEL"  "PCOMMENT"'],
  html: `
<p>At the beginning of each subprogram the assembler defines the following
micros. A program may redefine them with ${see('ps-micro', 'MICRO')}; a
${c('BASE')}, ${c('CODE')} or ${c('QUAL')} micro redefined by the program is no
longer updated by the corresponding pseudo instruction.</p>
${T([
    ['DATE', '10', 'Assembly date, <code> yy/mm/dd.</code> (NOS format: blank, two-digit year, month, day, period).'],
    ['JDATE', '5', 'Julian date <code>yyddd</code> (two-digit year, three-digit day of the year).'],
    ['TIME', '10', 'Assembly time, <code> hh.mm.ss.</code>'],
    ['BASE', '1', `Letter of the current base: <code>D</code>, <code>O</code> or <code>M</code>; updated by ${see('ps-base', 'BASE')}.`],
    ['CODE', '1', `Letter of the current character code: <code>D</code>, <code>A</code>, <code>E</code>, <code>I</code>, <code>N</code> or <code>O</code>; updated by ${see('ps-code', 'CODE')}.`],
    ['QUAL', '0–8', `Qualifier in effect (empty outside any ${see('ps-qual', 'QUAL')} sequence).`],
    ['SEQUENCE', '18', 'Columns 73–90 of the statement being read (main source statements; blank-filled).'],
    ['MODLEVEL', '5', 'Modification level: value of <code>JDATE</code> at the start of the assembly, or the <code>ML</code> option of the programming interface (the manual\'s ML parameter).'],
    ['PCOMMENT', '30', 'Comment intended for the prefix table: 30 blanks, or the <code>PC</code> option (truncated or blank-filled to 30 characters).'],
  ], ['Micro', 'Length', 'Contents'])}
<p>The system text loaded at the start of the assembly may add micros of its own
(for example ${c('DECK')}); it does not replace ${c('DATE')}, ${c('JDATE')},
${c('TIME')} or ${c('SEQUENCE')}.</p>
${h4('Examples')}
${ex(`
          DATA   10H"DATE"
          DATA   10H"TIME"
          DATA   0L"JDATE"
          DATA   1R"CODE"`)}
<p>${c('QUAL')} is empty outside a QUAL sequence: ${c('0L"QUAL"')} then becomes
${c('0L')}, an empty string that generates no word; inside the sequence it gives
the qualifier name.</p>
${ex(`
          DATA   0L"QUAL"
          QUAL   STACK
          DATA   0L"QUAL"
          QUAL   *`)}
`,
};

// =================================================================
// Chapter 3: names and symbols
// =================================================================

const NOMS = {
  id: 'lang-names',
  title: 'Names',
  keys: [],
  syntax: ['name: 1 to 8 characters, terminated by a comma or a blank'],
  html: `
<p>A <b>name</b> identifies an assembly object that has neither value nor
attributes: a subprogram or overlay, a block, a macro, a remote definition (RMT),
a duplicated sequence (DUP, ECHO), an IF sequence, a micro. A name cannot appear
in an expression.</p>
${ul([
    `A name is terminated by a comma or a blank; concatenation marks and micro marks have already been processed by editing.`,
    `General length: <b>1 to 8 characters</b>. A micro name that is too long is rejected (flag L); a block name that is too long or begins with ${c(':')} is rejected (flag A); a common block name ${c('/name/')} is limited to 7 characters (flag A).`,
    `<b>CPU subprogram or overlay name</b> (used for linking): according to the manual, it begins with a letter, has at most 7 characters, and its last character is not ${c(':')}. Our assembler does not check this name: it is truncated to 7 characters in the binary tables.`,
    `<b>PP program name</b>: at most 3 characters on the 6000 series; only the first 3 are written in the PP header word.`,
    `The different kinds of names and the symbols live in <b>separate name spaces</b>: a micro may have the name of a macro or of a symbol, a block that of the subprogram, and so on.`,
    `Symbols invented for ${see('ps-local', 'LOCAL')} have the form ${c('!nnnnnn')} (exclamation mark, CDC glyph ${c('∨')}, followed by six octal digits numbered within the subprogram); this form avoids collisions with the programmer's symbols in practice, and these symbols do not appear in the reference table.`,
  ])}
${h4('Example')}
<p>The same name ${c('ZONE')} designates a micro, a block and a symbol without
conflict.</p>
${ex(`
ZONE      MICRO  1,4,*ABCD*
          USE    ZONE
ZONE      DATA   0L"ZONE"
          USE    *
          SA1    ZONE`)}
`,
};

const SYMBOLES = {
  id: 'lang-symbols',
  title: 'Symbols: form, definition, redefinition',
  keys: [],
  syntax: ['symbol: 1 to 8 characters; first not a digit, $ = :; never + - * / , _ & or blank'],
  html: `
<p>A <b>symbol</b> identifies a <b>value</b> and its <b>attributes</b>
(absolute, relocatable in a block, common, external, redefinable, systems
symbol). The number of references to a symbol is unlimited.</p>

${h4('Form')}
${ul([
    `<b>1 to 8 characters.</b> A longer symbol is rejected: flag A in an expression, flag L in the location field of a symbol-defining pseudo instruction, warning 1 in the location field of an instruction.`,
    `The <b>first character</b> is not a digit, ${c('$')}, ${c('=')} or ${c(':')}.`,
    `Characters <b>illegal anywhere</b>: ${c('+ - * / , _ &')} and blank. A ${c('/')} always ends a symbol (it introduces qualified symbols).`,
    `Other special characters are legal but should be used with care (macros, ECHO): ${c('.1')}, ${c('A(1)')}, ${c('B$=')}, ${c('X.Y')} are valid symbols. The manual recommends ${c('.1')}, ${c('.2')}… as scratch symbols inside macros.`,
    `<b>CPU programs</b>: a symbol should not have the form of a register designator ${c('An')}, ${c('Bn')}, ${c('Xn')} (n = 0 to 7). Such a symbol can be defined, with warning 6; in a machine instruction ${c('A1')} always designates the register. Pseudo instructions (EQU, CON, DATA…) do not recognise registers: the name is looked up as a symbol. In PP assemblies, ${c('A1')}, ${c('X3')}… are ordinary symbols.`,
  ])}
<p>Valid examples: ${c('P')}, ${c('R3')}, ${c('PROGRAM')}, ${c('A10')}, ${c('.1')}.
Invalid examples: ${c('5A')} (leading digit), ${c('ABCDEFGHI')} (9 characters),
${c('ABE+15')} (contains ${c('+')}), ${c('=.11')} (leading ${c('=')}).</p>

${h4('Five ways to define a symbol')}
<ol>
<li><b>Location field</b> of a machine instruction or of a pseudo instruction
that reserves or generates words (${see('ps-bss', 'BSS')}, ${see('ps-bssz', 'BSSZ')},
${see('ps-data', 'DATA')}, ${see('ps-con', 'CON')}, ${see('ps-dis', 'DIS')},
${see('ps-vfd', 'VFD')}, ${see('ps-lit', 'LIT')}…): the symbol receives the value
of the location counter (after any force upper) and the attribute of the current
block: absolute in the absolute block, relocatable in a local block, common in a
common block of a relocatable assembly.</li>
<li><b>Symbol-defining pseudo instructions</b>: ${see('ps-equ', 'EQU')} and
${c('=')} (permanent definition), ${see('ps-set', 'SET')}, ${see('ps-max', 'MAX')},
${see('ps-min', 'MIN')}, ${see('ps-miccnt', 'MICCNT')} (redefinable). Value and
attributes are those of the variable-field expression, reduced to <b>21 bits</b>
and sign-extended (${see('lang-fields', 'field size')}).</li>
<li><b>External symbol</b>: declared by ${see('ps-ext', 'EXT')} or by default
(${c('=X')}, ${c('=Y')}), or defined relative to an external
(${c('SYM EQU EXTSYM+3')}): ${see('lang-linkage', 'linkage symbols')}.</li>
<li><b>Systems symbols</b>: absolute definitions of the system text, made visible
by ${see('ps-sst', 'SST')}.</li>
<li><b>By default</b>: a reference prefixed by ${c('=S')} to a symbol that is not
otherwise defined (${see('lang-default-symbols', 'default symbols')}).</li>
</ol>
<p>A symbol defined in a block is not local to that block: it is global to the
subprogram; only ${see('ps-qual', 'QUAL')} restricts its scope
(${see('lang-qualified', 'qualified symbols')}).</p>

${h4('Redefinition')}
${ul([
    `A second definition of a non-redefinable symbol with the <b>same value and attribute</b> is accepted silently.`,
    `With a different value or attribute: flag <b>D</b> ("DOUBLY DEFINED SYMBOL. THE FIRST DEFINITION HOLDS."); the first definition is kept.`,
    `A symbol defined by SET, MAX, MIN or MICCNT can be redefined by those pseudo instructions any number of times; defining it by EQU or in a location field is then rejected (D), and conversely.`,
    `Defining a symbol declared external by EXT also gives flag D.`,
    `A symbol never defined, not even by default, is flagged U ("UNDEFINED SYMBOL. VALUE ASSUMED 0.") on every statement that uses it, and its value is 0.`,
  ])}

${h4('Examples')}
${ex(`
.1        EQU    5
A(1)      EQU    6
B$=       EQU    7
A10       EQU    8
          SX1    A10+.1`)}
<p>Same value: accepted. Different value: D. A SET symbol is freely redefined,
but not by EQU.</p>
${ex(`
VAL       EQU    1
VAL       EQU    1
VAL       EQU    2
COUNT     SET    1
COUNT     SET    COUNT+1
COUNT     EQU    3`, { errors: ['D'] })}
<p>Invalid symbols: in the location field of EQU (L), in the location field of an
instruction (warning 1, the instruction is assembled without a label), in an
expression (A).</p>
${ex(`
5A        EQU    1
ABCDEFGHI EQU    1
5B        SX1    1
          SX2    TOOLONGNAME`, { errors: ['L', '1', 'A'] })}
<p>Symbol in the form of a register: warning 6 at the definition.</p>
${ex(`
X3        EQU    3`, { errors: ['6'] })}
`,
};

const SYMBOLES_DEFAUT = {
  id: 'lang-default-symbols',
  title: 'Default symbols (=S, =X, =Y)',
  keys: ['=S', '=X', '=Y'],
  syntax: ['=Ssymbol', '=Xsymbol', '=Ysymbol'],
  html: `
<p>The prefixes ${c('=S')}, ${c('=X')} and ${c('=Y')} are placed in front of a
<b>reference</b> to a symbol (never in front of a definition). If the symbol is
defined conventionally anywhere in the subprogram, before or after the reference,
that definition is used and the prefix has no effect. Otherwise the assembler
defines or declares it <b>at the end of the assembly</b>:</p>
${T([
    ['=Ssym', 'One word is assigned at the end of <b>block zero</b> (relocatable program); all references, with or without the prefix, designate that word, which is zero. In an absolute program these words form a <code>PROGRAM*</code> block placed right after the absolute block.'],
    ['=Xsym', `<b>Strong</b> external, as if declared by ${see('ps-ext', 'EXT')}. Relocatable assemblies only.`],
    ['=Ysym', '<b>Weak</b> external (marked <code>*</code> in the external symbol list, weak bit in the LINK table). Relocatable assemblies only.'],
  ], ['Form', 'If the symbol is defined nowhere'])}
${ul([
    `In an <b>absolute</b> or PP assembly, ${c('=X')} and ${c('=Y')} without a definition give flag U.`,
    `The default symbol is defined with the qualifier in effect at its first reference.`,
    `A default symbol cannot be used where a previously defined symbol is required (EQU, BSS, ORG, IF…): it is defined only at the end of the assembly (flag U).`,
    `A prefix with no symbol is not recognised: ${c('=S')}, ${c('=X')} or ${c('=Y')} followed by a blank or a comma is read as a literal and rejected (flag A).`,
    `Difference from the manual: a symbol prefixed by both ${c('=S')} and ${c('=X')} is not flagged; it becomes a strong external. Likewise a symbol prefixed ${c('=Y')} and elsewhere ${c('=X')} becomes a strong external.`,
    `Difference from the manual: the list "DEFAULT SYMBOLS DEFINED BY COMPASS" is not printed; ${c('=S')} symbols appear in the reference table with their address.`,
  ])}
${h4('Examples')}
<p>${c('DEF2')} is defined further on: ${c('=SDEF2')} designates it. ${c('DEF1')} is
not: a zero word is assigned to it at the end of block zero. ${c('EXT1')} becomes a
strong external, ${c('EXT2')} a weak one.</p>
${ex(`
          SX1    =SDEF1
          SX2    =SDEF1+1
          SA1    =XEXT1
          SA2    =YEXT2
          SA3    =SDEF2
DEF2      DATA   5`)}
<p>In an absolute program ${c('=S')} works, ${c('=X')} does not:</p>
${ex(`
          IDENT  ABSDEF
          ABS
          ORG    100B
          SX1    =SDEF1
          SA1    =XEXT1
          END`, { errors: ['U'] })}
`,
};

const QUALIFIES = {
  id: 'lang-qualified',
  title: 'Qualified symbols',
  keys: ['//'],
  syntax: ['/qualifier/symbol', '//symbol'],
  html: `
<p>A symbol defined while a qualifier is in effect (${see('ps-qual', 'QUAL name')})
is <b>qualified</b> by that name. The full identifier of a symbol is the pair
qualifier + symbol (16 characters at most). Symbols defined outside any QUAL
sequence are <b>global</b>.</p>
${ul([
    `<b>Plain reference</b> ${c('SYM')}: if a qualifier Q is in effect and a symbol SYM qualified by Q exists, that symbol is used; otherwise the global SYM. A symbol qualified by another qualifier is not visible.`,
    `<b>${c('/Q/SYM')}</b>: symbol SYM qualified by Q, from anywhere. An unknown qualifier or a missing symbol gives flag U.`,
    `<b>${c('//SYM')}</b>: the global symbol SYM, useful when a symbol of the same name exists under the qualifier in effect.`,
    `${c('QUAL *')} restores the previous qualifier (stack of the last 50); ${c('QUAL')} with a blank variable field returns to global symbols.`,
    `The ${c('QUAL')} micro holds the qualifier in effect. The reference table lists global symbols first, then each qualifier under the heading "SYMBOL QUALIFIER = name".`,
    `External symbols declared by ${see('ps-ext', 'EXT')} are not qualified. Difference from the manual: a symbol defined under QUAL and declared as an entry point by ${see('ps-entry', 'ENTRY')} remains qualified, and ENTRY, which looks for a global symbol, reports it undefined (U). Define entry points outside QUAL sequences.`,
    `Symbols invented for ${see('ps-local', 'LOCAL')} and default symbols are qualified like any other.`,
  ])}
${h4('Example')}
${ex(`
VAL       EQU    1
          QUAL   ALPHA
VAL       EQU    2
OWN       EQU    3
          SX1    VAL
          SX2    //VAL
          QUAL   BETA
          SX3    VAL
          SX4    /ALPHA/VAL
          SX5    /ALPHA/OWN
          QUAL   *
          SX6    VAL
          QUAL
          SX7    VAL`)}
<p>Outside its qualifier, a qualified symbol is reachable only as
${c('/Q/SYM')}:</p>
${ex(`
          QUAL   ALPHA
OWN       EQU    3
          QUAL
          SX1    OWN
          SX2    /GAMMA/OWN`, { errors: ['U'] })}
`,
};

const LIAISON = {
  id: 'lang-linkage',
  title: 'Linkage symbols: entry points and externals',
  keys: [],
  syntax: ['ENTRY sym,…', 'ENTRYC sym,…', 'EXT sym,…', '=Xsym  =Ysym'],
  html: `
<p>Linkage symbols connect separately assembled subprograms. There are two
kinds: <b>entry points</b>, defined in the subprogram and offered to others
(${see('ps-entry', 'ENTRY, ENTRYC')}), and <b>external symbols</b>, used here and
defined elsewhere (${see('ps-ext', 'EXT')}, ${c('=X')}, ${c('=Y')}). The same name
can be an entry point in one module and an external in another.</p>
${ul([
    `Form: <b>at most 7 characters</b>, beginning with a letter. An entry point or external of incorrect form is rejected (flag A).`,
    `An external has the value <b>zero</b> for the assembler and the external attribute; the loader adds the real address to the field that references it.`,
    `<b>Strong external</b> (EXT, ${c('=X')}): the loader searches for a module that defines it. <b>Weak external</b> (${c('=Y')}): it is linked only if a module defining it is loaded for another reason; left unsatisfied, it is not an error.`,
    `A symbol can be defined <b>relative to an external</b>: ${c('SYM EQU EXTA+3')} gives SYM the value 3 and the external attribute EXTA; ${c('SA2 SYM')} then assembles 3 in the K field with a reference to EXTA.`,
    `An external expression must reduce to <b>a single external with coefficient +1</b>, plus an integer: ${c('-EXTA')}, ${c('EXTA+EXTB')}, ${c('2*EXTA')}, or an external combined with a relocatable term are rejected (flag A); ${see('lang-relocation', 'relocation')}.`,
    `An external cannot be defined in the subprogram (flag D).`,
    `EXT is legal only in relocatable assemblies (flag O otherwise); ENTRY is illegal in PP assemblies (O). More than 511 externals: flag F.`,
    `An undefined entry point is flagged U; an entry point with negative relocation, N. ${c('ENTRYC')} declares a conditional entry point (marked ${c('*')} on the listing).`,
    `Neither externals nor entry points should be qualified (${see('lang-qualified', 'qualified symbols')}).`,
  ])}
<p>The listing shows the entry points ("ENTRY POINTS.") and the externals
("EXTERNAL SYMBOLS.", a weak external followed by ${c('*')}); the binary carries
them in the ENTR (3600) and LINK (4400) tables
(${see('lang-binary-relocatable', 'relocatable binary')}).</p>
${h4('Examples')}
${ex(`
          ENTRY  START
          EXT    EXTA
START     SA1    EXTA+3
SYM       EQU    EXTA+3
          SA2    SYM
          SA3    EXTA-1
          RJ     =XLIB`)}
${ex(`
          EXT    EXTA,EXTB
          SA4    -EXTA
          SA5    EXTA+EXTB
          SX6    EXTA*2`, { errors: ['A'] })}
<p>Entry point with negative relocation:</p>
${ex(`
          ENTRY  NEG
NEG       EQU    -*`, { errors: ['N'] })}
`,
};

const REGISTRES = {
  id: 'lang-registers',
  title: 'CPU registers in the language',
  keys: [],
  syntax: ['An  Bn  Xn  (n = 0 to 7)', 'A.exp  B.exp  X.exp'],
  html: `
<p>The 24 central processor registers have built-in designators that cannot be
changed. They are recognised in <b>CPU machine instructions</b> and in
conditional-assembly tests. A PP assembly has no registers: ${c('A1')},
${c('X3')}… are symbols there.</p>
${T([
    ['Address', '<code>A0</code> … <code>A7</code>', '<code>A.n</code>'],
    ['Index (increment)', '<code>B0</code> … <code>B7</code>', '<code>B.n</code>'],
    ['Operand', '<code>X0</code> … <code>X7</code>', '<code>X.n</code>'],
  ], ['Registers', 'Simple form', 'Dotted form'])}
${ul([
    `<b>Simple form</b> ${c('An')}: n is a single digit 0–7 and the next character cannot continue a symbol. ${c('A8')}, ${c('A10')}, ${c('X1A')} are symbols.`,
    `<b>Dotted form</b> ${c('A.x')}: x is a symbol or a constant (current base). A value outside 0–7 is reduced to its 3 low-order bits with warning 7: ${c('A.10')} (decimal 10 = 12B) designates A2.`,
    `The register may also be part of the operation field: ${c('SB.SUM')} with ${c('SUM SET 3')} is equivalent to ${c('SB3')}.`,
    `Hardware reminder: setting an address into A1–A5 loads the corresponding word into X1–X5; into A6–A7, stores X6–X7 at that address.`,
  ])}
${h4('Registers in an expression')}
${ul([
    `The operator immediately preceding a register is the <b>register operator</b> (${c('+')}, ${c('-')}, ${c('*')} or ${c('/')}), wherever the register stands in the expression; when the register is the first element, ${c('+')} is assumed.`,
    `The rest of the expression forms the <b>operand</b> (absolute, relocatable or external): ${c('3+A6-NUM')} gives register A6 and operand ${c('3-NUM')}.`,
    `${c('X3+LIMA-10B')}, ${c('LIMA+X3-10B')} and ${c('-10B+LIMA+X3')} produce the same instruction.`,
    `The machine instruction interprets the resulting form (registers, operators, presence of an operand) to select its code: ${see('cpu-formats', 'CPU formats')}, ${see('cpu-registers', 'registers')}.`,
    `Pseudo instructions do not recognise registers: in ${c('EQU B1+1')}, ${c('B1')} is a symbol (usually undefined, flag U).`,
  ])}
${h4('Examples')}
<p>Both instructions assemble ${c('6032001000')}:</p>
${ex(`
SUM       SET    3
SUB       SET    2
ALPHA     EQU    1000B
          SB3    A2+ALPHA
          SB.SUM A.SUB+ALPHA`)}
${ex(`
LIMA      EQU    20B
NUM       EQU    6
          SA3    X3+LIMA-10B
          SA4    LIMA+X3-10B
          SA5    -10B+LIMA+X3
          SX6    3+A6-NUM
          SX7    *+A.NUM`)}
<p>${c('A.10')} designates A2 with warning 7; ${c('A10')} is a symbol, undefined
here.</p>
${ex(`
          SA1    A.10
          SA2    A10`, { errors: ['7', 'U'] })}
`,
};

// =================================================================
// Chapter 4: special elements and data notation
// =================================================================

const SPECIAUX = {
  id: 'lang-special',
  title: 'Special elements (*, *L, *O, *P, $, *F)',
  keys: ['*L', '*O', '*P', '*F', '$'],
  syntax: ['*  *L  *O  *P  $  *F'],
  html: `
<p>Special elements are reserved designators that can never be used as symbols.
In an expression they are replaced by a value taken from the counters of the
<b>current block</b> (${see('lang-counters', 'counters')}).</p>
${T([
    ['* or *L', '<b>Location counter</b> of the current block.', 'Relocatable in the current block (or in the block designated by LOC); absolute in the absolute block.'],
    ['*O', '<b>Origin counter</b> of the current block.', 'Relocatable in the current block; absolute in the absolute block.'],
    ['*P', '<b>Position counter</b>: number of bits still free in the current word (60 to 1 for the CPU, 12 to 1 for a PP, 16 for CIPPU).', 'Absolute.'],
    ['$', 'Position counter minus one: number of the next free bit (59 to 0 for the CPU).', 'Absolute.'],
    ['*F', 'Calling mode: 0 for a direct COMPASS call (1 RUN, 2 FTN4, 3 FTN5 on the original system). Equals the <code>F</code> option of the programming interface, 0 by default.', 'Absolute.'],
  ], ['Element', 'Value', 'Attribute'])}
${ul([
    `These elements are recognised only <b>in element position</b>. In operator position ${c('*')} is multiplication: ${c('*+3')} is location + 3, ${c('ABLE*4')} is ABLE × 4, and ${c('**')} is location × 0 (element ${c('*')}, operator ${c('*')}, null element).`,
    `${c('*L')}, ${c('*O')}, ${c('*P')}, ${c('*F')} are recognised only when the letter is not followed by a symbol character.`,
    `After an instruction that causes a deferred force upper (JP, RJ, PS…), pseudo instructions that read the counters see the value <b>before</b> the force upper (${see('lang-force', 'force upper')}).`,
    `In ${see('ps-vfd', 'VFD')}, ${c('*P')} and ${c('$')} are evaluated at the position of the field that contains them.`,
    `${c('-*O')} is a negative relocatable expression; ${c('FOX-*')} is absolute when FOX is in the current block.`,
  ])}
${h4('Examples')}
${ex(`
          BSS    5
HERE1     EQU    *
HERE2     EQU    *L
ORIG      EQU    *O
POS1      EQU    *P
BIT1      EQU    $
MODE      EQU    *F
          SX1    1
POS2      EQU    *P
          SX2    **
          SX3    *+3
          SX4    *-HERE1
          SX6    -*O`)}
<p>After ${c('LOC')}, ${c('*')} follows the location counter and ${c('*O')} the
origin counter (the listing marks the address with ${c('L')}):</p>
${ex(`
          LOC    100B
EXEC      EQU    *
LOADED    EQU    *O
          SX5    *
          LOC    *O`)}
<p>In an absolute program the counters are absolute:</p>
${ex(`
          IDENT  SPEC
          ABS
          ORG    200B
START     EQU    *
          JP     *+1
          VFD    12/*P,18/$
          END`)}
`,
};

const DONNEES = {
  id: 'lang-data',
  title: 'Data items, constants and literals',
  keys: [],
  syntax: ['data item: [sign] [preradix] value [modifiers]', 'constant: digit…', 'literal: =data item'],
  html: `
<p>COMPASS has two kinds of data: <b>character</b>
(${see('lang-character-data', 'strings')}) and <b>numeric</b> (integer, single- or
double-precision floating point, in octal, decimal or hexadecimal:
${see('lang-numeric-data', 'numbers')}, ${see('lang-floating', 'floating point')},
${see('lang-hex', 'hexadecimal')}). They are introduced in three ways:</p>
<ol>
<li><b>Data item</b>: subfield of ${see('ps-data', 'DATA')} and
${see('ps-lit', 'LIT')}; each data item generates one or more full words.</li>
<li><b>Constant</b>: element of an expression (machine instruction,
${see('ps-con', 'CON')}, ${see('ps-vfd', 'VFD')}, ${see('ps-equ', 'EQU')}…).</li>
<li><b>Literal</b>: data item preceded by ${c('=')} in an expression; its value is
the address of a word of the literals block (${see('lang-literals', 'literals')}).</li>
</ol>
${T([
    ['First character', 'digit, sign, preradix <code>B O D</code>, <code>#</code>, character type followed by a delimiter, <code>.</code> followed by a digit', '<b>always a digit</b>'],
    ['Delimited string (<code>H*…*</code>)', 'yes', 'no'],
    ['Preradix', 'yes (<code>B17</code>, <code>D19</code>)', 'no (postradix only: <code>17B</code>)'],
    ['Hexadecimal', '<code>#FF</code> or <code>0#FF</code>', '<code>0#FF</code> (the <code>0</code> is required)'],
    ['Sign', 'part of the data item: <code>-</code> complements each word', 'expression operator'],
    ['Size', 'one or more words; double precision allowed', 'size of the destination field, 60 bits at most; no double precision'],
  ], ['', 'Data item, literal', 'Constant'])}
${note(`Consequence of the sign rule: ${c('DATA -0')} generates the word ${c('77777777777777777777')} (negative zero), whereas ${c('CON -0')} computes 0 − 0 and generates ${c('00000000000000000000')}.`)}
${h4('Examples')}
${ex(`
          DATA   -0,1,-1
          CON    -0,1,-1
          SX1    -1
          SX2    =-1`)}
`,
};

const CARACTERES = {
  id: 'lang-character-data',
  title: 'Character data (C, H, A, R, L, Z)',
  keys: [],
  syntax: ['[sign] n type string', '[sign] type d string d', 'n type string   (constant)'],
  html: `
<p>Character data is converted into the <b>character code in effect</b> when it
is evaluated (${see('ps-code', 'CODE')}; display code by default, 8-bit ASCII
under CIPPU). The <b>type</b> letter sets justification and fill.</p>
${T([
    ['C', 'left', 'zeros', '<b>12 zero bits guaranteed</b> at the end (one more word if needed): the CDC text line format', 'as L'],
    ['H', 'left', 'blanks', '—', 'same'],
    ['A', 'right', 'blanks', '—', 'same'],
    ['R', 'right', 'zeros', '—', 'same'],
    ['L', 'left', 'zeros', '—', 'same'],
    ['Z', 'left', 'zeros', '<b>6 zero bits guaranteed</b> at the end (one more word if needed)', 'as L'],
  ], ['Type', 'Justification', 'Fill', 'Particularity (data item, literal)', 'Constant'])}

${h4('String length')}
${ul([
    `<b>n &gt; 0</b> (always <b>decimal</b>, whatever the base): the string is <b>exactly the n characters</b> that follow the type letter, blanks, commas and operators included. If the line ends first, the string is padded with blanks.`,
    `<b>n = 0</b>: the string extends to the first blank or comma (data item, literal), or to the first ${c('+ - * / , &')} or blank (constant).`,
    `<b>n omitted</b> (data items and literals only): the character after the type letter is the <b>delimiter</b>; the string extends to its next occurrence. Any character may be used except blank and comma (flag A); ${c('_')} and pairs of ${c('"')} have already been processed by editing. A missing closing delimiter gives flag A.`,
  ])}

${h4('Words generated (data items and literals)')}
<p>With <i>cpw</i> characters per word (10 for the CPU, 2 for a 12-bit PP) and
<i>bpw</i> bits per word:</p>
${ul([
    `H, L, A, R: ⌈n / cpw⌉ words (at least one word for A and R). H and L put the characters first and fill the end of the last word; A and R put the characters last and fill the beginning of the first word.`,
    `C: ⌈(6n + 12) / bpw⌉ words; Z: ⌈(6n + 6) / bpw⌉ words; zero fill. Thus ${c('10CABCDEFGHIJ')} takes two words, ${c('9ZABCDEFGHI')} one.`,
    `Sign ${c('-')}: each word is complemented (one's complement).`,
    `Empty string: ${c('0H')}, ${c('0L')}, ${c('H**')}, ${c('L//')} generate <b>no word</b> in DATA or LIT; ${c('0C')}, ${c('0Z')}, ${c('0R')} generate one zero word and ${c('0A')} one word of blanks. An empty literal is rejected (flag A).`,
  ])}

${h4('Character constants in an expression')}
${ul([
    `The string is justified in a field the <b>size of the destination field</b> (18 bits for the K field of a 30-bit instruction, n bits for a VFD field n/, 60 bits for CON), filled according to its type, then sign-extended to 60 bits before arithmetic: ${c('SX1 1R*')} is 47B, ${c('SX4 1L$')} gives K = ${c('530000')}, ${c('VFD 24/1AX+1')} gives ${c('55555531')}.`,
    `More characters than the field holds: warning 7; a left-justified type keeps the first characters, a right-justified type the last ones.`,
    `C and Z behave as L (no guaranteed zeros).`,
    `Difference from the manual: an empty constant ${c('0H')} is blanks (and so is ${c('0A')}), not zero.`,
    `Difference from the manual: in a symbol-defining pseudo instruction (EQU, SET…), the constant is justified in 60 bits and then reduced to 21 bits (the manual justifies it directly in 21 bits). ${c('X EQU 1RA')} is safe; ${c('X EQU 3HABC')} does not give ${c('ABC')}.`,
    `Characters written right after a counted constant (${c('3RABCD')}: the ${c('D')}) are ignored without notice in machine instructions, CON, VFD and DATA, and rejected (flag A) in EQU and the other pseudo instructions that evaluate the whole field (a difference: the manual makes two successive elements illegal).`,
  ])}
${h4('Examples')}
${ex(`
TYPEH     DATA   3HABC
TYPEL     DATA   3LABC
TYPEA     DATA   3AABC
TYPER     DATA   3RABC
TYPEC     DATA   3CABC
TYPEZ     DATA   3ZABC
LONGH     DATA   12HABCDEFGHIJKL
LONGR     DATA   12RABCDEFGHIJKL
TEN       DATA   10CABCDEFGHIJ
NINE      DATA   9ZABCDEFGHI`)}
<p>Delimited strings, counted string containing a comma, empty strings, negative
data item:</p>
${ex(`
DELIM     DATA   H/A B/,C*X*
COUNT     DATA   5H12,45
EMPTY     DATA   0H,H**,L//,0C,0R,0A
NEGATIVE  DATA   -1RA
          DATA   H* THE ANSWER IS *`)}
<p>Constants in fields of different sizes:</p>
${ex(`
          SX1    1R*
          SX2    1R.+1
          SA1    3RCIO
          SX4    1L$
          SX5    0L$$+1
          VFD    30/4H....,6/1RA,24/1AX+1
          VFD    42/0LOUTPUT,18/1
          CON    1HA,1AA,0LAB*2`)}
<p>Constant too long for the 18-bit K field:</p>
${ex(`
          SX6    4HABCD
          SX7    4RABCD`, { errors: ['7'] })}
`,
};

const NUMERIQUES = {
  id: 'lang-numeric-data',
  title: 'Numeric data: integers, radix and modifiers',
  keys: [],
  syntax: ['[sign] [B|O|D] digits [B|O|D] [E±n | EE±n] [S±n] [P±n]'],
  html: `
<p>A numeric data item consists of an optional sign (data items and literals
only), an optional preradix, digits, an optional point and modifiers. <b>Without a
point it is an integer</b>; with a point, a floating-point number
(${see('lang-floating', 'floating point')}).</p>

${h4('Radix')}
${ul([
    `<b>Preradix</b> (data items and literals): ${c('B')} or ${c('O')} octal, ${c('D')} decimal, in front of the digits: ${c('B100')} = 64.`,
    `<b>Postradix</b> (everywhere): ${c('100B')}, ${c('100O')} octal, ${c('100D')} decimal.`,
    `No radix: current base (${see('ps-base', 'BASE')}), decimal by default. With ${c('BASE O')} or ${c('BASE M')}, data items and constants without a radix are octal; ${c('BASE M')} keeps counts decimal (VFD field sizes, line counts, character counts, word counts…).`,
    `An 8 or 9 in an octal value, both a preradix <i>and</i> a postradix, or two radix modifiers: flag A.`,
    `Character counts (${c('10H')}) and the numbers of the E, S, P modifiers are <b>always decimal</b>.`,
  ])}

${h4('Modifiers')}
<p>Optional, in any order, each <b>at most once</b> (a duplicate gives flag A). The
number n is decimal; omitted, it is 0; a sign is taken only when followed by a
digit.</p>
${T([
    ['E±n', 'Decimal exponent: multiplies by 10<sup>n</sup>.'],
    ['EE±n', 'Decimal exponent and <b>double precision</b> (two-word floating point, CPU, data items and literals); on an integer value, gives a single-precision integer.'],
    ['S±n', 'Binary scale: multiplies by 2<sup>n</sup>.'],
    ['P±n', 'Binary point position (floating point): forces the exponent to −n, giving an unnormalised number.'],
  ], ['Modifier', 'Effect'])}
<p>Whatever the order in which they are written, they apply in the order decimal
exponent, binary scale, binary point. The computation is exact (rational), then
rounded.</p>

${h4('Integers')}
${ul([
    `The exact value is <b>rounded to the nearest integer</b> (half up): ${c('15E-1')} is 2.`,
    `Representation on 60 bits; a value exceeding 60 bits is truncated with warning 7. In a PP assembly a data item is a 12-bit word (16 under CIPPU): a value that is too large is truncated with warning 7.`,
    `Negative = one's complement: ${c('-1')} = ${c('77777777777777777776')}; in a PP, ${c('-9')} = ${c('7766')}.`,
    `In an expression a constant is a 60-bit integer; its value must fit the destination field (${see('lang-fields', 'field size')}).`,
  ])}
${h4('Examples')}
${ex(`
RADIX     DATA   100,100B,100D,B100,O100,D100
MODIF     DATA   1S17,1E3,15E-1,1.0E2S1,1S1E2
SIGNS     DATA   -1,-0,+5
          SX1    100B/3*3
          SX2    1S17-1`)}
<p>Octal and mixed bases: under ${c('BASE M')}, the data item is octal but the
scale factor stays decimal.</p>
${ex(`
          BASE   M
          DATA   17,1S10
          BASE   *
          DATA   17`)}
<p>Radix and modifier errors:</p>
${ex(`
          DATA   19B
          DATA   B10B
          DATA   1BB
          DATA   1.0E2E3`, { errors: ['A'] })}
${ex(`
          BASE   O
          DATA   17,19D,19
          BASE   *`, { errors: ['A'] })}
<p>Value exceeding 60 bits:</p>
${ex(`
          DATA   377777777777777777777B`, { errors: ['7'] })}
<p>12-bit PP data:</p>
${ex(`
          IDENT  PPDATA,100B
          PERIPH
          ORG    100B
          DATA   5,-9,7777B
          DATA   10000B
          END`, { errors: ['7'] })}
`,
};

const FLOTTANTS = {
  id: 'lang-floating',
  title: 'Single- and double-precision floating point',
  keys: [],
  syntax: ['digits.digits [E±n] [S±n] [P±n]', 'digits.digits EE±n   (double precision)'],
  html: `
<p>A numeric data item containing a <b>point</b> is a floating-point number
(${c('1.5')}, ${c('.5')}, ${c('5.')}, ${c('1.E1')}). Floating point exists only for
the CPU: in a PP assembly it is rejected (flag A).</p>
${h4('CDC 6000 format (60 bits)')}
${src(`
 59   58          48 47                                              0
+----+--------------+-------------------------------------------------+
| S  | exponent (11)|           integer coefficient C (48 bits)        |
+----+--------------+-------------------------------------------------+
 value = C × 2^e   ;  negative = one's complement of the 60 bits
 exponent field of a positive number: 2000B + e if e >= 0, 1777B + e if e < 0
`)}
${ul([
    `<b>Normalised</b>: bit 47 of the coefficient is 1; zero is the zero word. The coefficient is <b>rounded</b> to 48 bits (to nearest): ${c('1.0')} = ${c('17204000000000000000')}, ${c('0.1')} = ${c('17146314631463146315')}, ${c('1.1')} = ${c('17204314631463146315')}.`,
    `Exponent outside −1777B…+1777B (for example ${c('1.0E999')}): flag A. Modifiers may exceed these ranges as long as the final number is representable: ${c('1.0E400S-1200')} is valid.`,
    `<b>Binary point</b> ${c('P±n')}: the exponent is forced to −n and the coefficient shifted accordingly (unnormalised number). Rounding to 48 bits precedes the shift, which truncates: ${c('0.1P47')} = ${c('17200314631463146314')}; ${c('1.0P10')} = ${c('17650000000000002000')}. If a left shift pushes a significant bit out of the coefficient: flag A.`,
    `<b>Double precision</b> ${c('EE')}: two words. The first is the normalised number formed by the leading 48 bits of a coefficient rounded to 96 bits; the second holds the next 48 bits with an exponent 48 lower. A negative number complements both words. ${c('1.3EE')} = ${c('17205146314631463146')}, ${c('16403146314631463146')}.`,
    `In an <b>expression</b>, a floating-point constant is used as the bit pattern of its single-precision representation, treated as an integer: ${c('CON 2.3+1')} adds 1 to the coefficient of 2.3. A floating-point value does not fit the 18-bit K field (warning 7).`,
  ])}
${h4('Examples')}
${ex(`
FL        DATA   1.0,0.1,1.1,1.5,-1.5,.5,5.,1.E1
POINT     DATA   0.1P47,1.0P-6,1.0P10
DOUBLE    DATA   10.0EE,1.3EE,-1.3EE,2EE
          CON    2.3,2.3+1
          SA1    =1.0
          SA2    =3.14159EE+6`)}
${ex(`
          DATA   1.0E999`, { errors: ['A'] })}
${ex(`
          SX1    1.5`, { errors: ['7'] })}
`,
};

const HEX = {
  id: 'lang-hex',
  title: 'Hexadecimal notation (#)',
  keys: ['#'],
  syntax: ['[sign] [0] # hex-digits [S±n]   (data item, literal)', '0 # hex-digits [S±n]   (constant)'],
  html: `
<p>The hexadecimal preradix is ${c('#')} (CDC glyph ${c('≡')}, display code 60B).
A hexadecimal value is always a <b>single-precision integer</b>.</p>
${ul([
    `Digits ${c('0')}–${c('9')} and ${c('A')}–${c('F')}, no point; omitted value = 0 (${c('DATA #')} generates a zero word).`,
    `The leading ${c('0')} is optional for a data item or literal (${c('#FF')}, ${c('0#FF')}), <b>required for a constant</b>: without it ${c('#FF')} would be read as a symbol (flag U when undefined).`,
    `Modifiers: ${c('S±n')} (binary scale); ${c('P')} is accepted and ignored.`,
    `The sign of a data item or literal complements the word: ${c('=-#12345S2')} is the complement of 12345h × 4.`,
    `Difference from the manual: a value exceeding 60 bits (up to 26 digits according to the manual) is reduced to its 60 low-order bits <b>without warning</b>.`,
  ])}
${h4('Examples')}
${ex(`
          DATA   #123ABC,0#A01576,-#1,#1S4,#1P3,#
          CON    0#FF,0#10S2
          SX1    0#1F+1
          SX3    =-#12345S2`)}
${ex(`
          SX1    #FF`, { errors: ['U'] })}
`,
};

const LITTERAUX = {
  id: 'lang-literals',
  title: 'Literals',
  keys: ['='],
  syntax: ['=data item', 'LIT data item,…'],
  html: `
<p>A <b>literal</b> is a read-only constant placed by the assembler in the
<b>literals block</b> (${c('LITERALS*')}). It is written as an expression element
prefixed by ${c('=')}, or as a data item of ${see('ps-lit', 'LIT')}. Every data
form is allowed: sign, preradix, delimited strings, hexadecimal, double precision
(${c('=1')}, ${c('=10HOUTPUT')}, ${c('=-3RABC')}, ${c('=R*ABC*')}, ${c('=1.0')},
${c('=3.14159EE+6')}, ${c('=#FF')}).</p>
${ul([
    `In an expression the literal stands for the <b>address</b> of its first word: relocatable in a relocatable assembly, absolute in an absolute or PP assembly.`,
    `A literal is conventionally the only element of its expression, but it may be combined: ${c('1+=3.14159EE+6')} is the address of the second word of the double-precision literal.`,
    `An empty literal (${c('=0H')}) is rejected (flag A). ${c('DATA')} does not accept a literal (flag A).`,
    `${c('=S')}, ${c('=X')}, ${c('=Y')} followed by a symbol character are default-symbol prefixes, not literals (${see('lang-default-symbols', 'default symbols')}).`,
  ])}
${h4('Literal pooling')}
<p>Only the <b>bit pattern</b> matters: ${c('=1')} and ${c('=1RA')} (A = 01) designate
the same word. For a sequence of words S (one literal, or all the data items of
one LIT):</p>
<ol>
<li>if S already appears, as contiguous words, anywhere in the block, its address
is reused;</li>
<li>otherwise, if the end of the block matches a beginning of S, only the missing
part is appended;</li>
<li>otherwise S is appended to the block.</li>
</ol>
<p>Words designated by LIT must therefore stay read-only: they may be shared with
other literals. A LIT of more than 100 words is rejected (flag F).</p>
${h4('Placement and listing')}
${ul([
    `The literals block immediately follows block zero (relocatable) or the absolute and zero blocks (absolute); each IDENT-type overlay has its own literals block (${see('lang-blocks', 'blocks')}).`,
    `In a PP assembly each literal occupies 12-bit words: ${c('LDC =10')} refers to a word ${c('0012')}.`,
    `With option ${c('D')} of ${see('ps-list', 'LIST')}, the listing reproduces the block after the code: "CONTENT OF LITERALS BLOCK.", address, octal word, display-code conversion.`,
  ])}
${h4('Examples')}
<p>${c('=1RA')} reuses the word of ${c('=1')}; ${c('L')} overlays words 1 and 2,
already present; ${c('M')} appends only 3 and 4.</p>
${ex(`
          SB2    =1
          SB3    =1RA
          SB4    =1RB
L         LIT    1,2
M         LIT    1,2,3,4
          SA1    =10HOUTPUT
          SA2    =-3RABC
          SA3    =R*ABC*
          SA4    =1.0
          SX6    1+=3.14159EE+6`)}
${ex(`
          SA2    =0H
          DATA   =1
          LIT    0H,0L`, { errors: ['A'] })}
<p>LIT of more than 100 words (continued statement):</p>
${ex(continued('          LIT    ' + Array.from({ length: 101 }, (_, k) => k + 1).join(',')), { errors: ['F'] })}
<p>Literals of a PP program:</p>
${ex(`
          IDENT  PPLIT,100B
          PERIPH
          ORG    100B
          LDC    =10
          LDC    =-1
          END`)}
`,
};

// =================================================================
// Chapter 5: expressions
// =================================================================

const EXPRESSIONS = {
  id: 'lang-expressions',
  title: 'Expressions: syntax, operators, arithmetic',
  keys: ['&'],
  syntax: ['expression := [+|-|&] term { (+|-|&) term }', 'term := element { (*|/) element }'],
  html: `
<p>Most subfields are <b>expressions</b>. An expression is a sequence of
<b>terms</b>; a term is a sequence of <b>elements</b>. A comma or a blank ends the
expression.</p>
${T([
    ['Element', `symbol (${see('lang-symbols', 'symbols')}), numeric or character constant (${see('lang-data', 'data')}), special element (${see('lang-special', '*, $…')}), literal (${see('lang-literals', '=…')}), CPU register (${see('lang-registers', 'registers')}), null element`],
    ['Element operators', `${c('*')} multiplication, ${c('/')} division`],
    ['Term operators', `${c('+')} addition, ${c('-')} subtraction, ${c('&')} exclusive OR (CDC glyph ${c('∧')})`],
  ], ['', ''])}
${ul([
    `<b>No parentheses</b>, no relational operators, no logical AND or OR.`,
    `Precedence: ${c('*')} and ${c('/')} form terms, evaluated left to right; then ${c('+')}, ${c('-')} and ${c('&')} combine the terms left to right.`,
  ])}
${h4('Rules')}
<ol>
<li><b>Null element</b>: an omitted element is zero. ${c('ABLE*+3')} is ABLE × 0 + 3;
an expression beginning with ${c('+')}, ${c('-')} or ${c('&')} begins with a zero term;
two successive term operators enclose a zero term (${c('1--2')} is 1 − 0 − 2). A sign
written after ${c('*')} or ${c('/')} ends the term: ${c('3*-1')} is (3 × 0) − 1 = −1,
${c('10/-3')} is (10 / 0) − 3 = −3.</li>
<li><b>Two successive elements</b> are illegal. ${c('**')} is legal (element
${c('*')}, operator, null element). In our implementation EQU and the pseudo
instructions that evaluate the whole field reject the remaining characters
(flag A); machine instructions, CON, VFD and DATA stop at the first complete
element and ignore the rest without notice (a difference from the manual).</li>
<li>A term contains <b>at most one relocatable or external element</b>:
${c('FOX*FOX')}, ${c('**ABLE')} (ABLE relocatable) are rejected (flag A).</li>
<li><b>Division</b> requires absolute elements (flag A otherwise); the quotient is
truncated toward zero and the remainder lost: ${c('5/2*2')} is 4. <b>Division by zero
gives zero</b>, without error.</li>
<li><b>Exclusive OR</b> applies bit by bit to the 60-bit words; it is rejected when
an operand is relocatable or external (flag A). ${c('1R=&1R/')} is
54B ⊕ 50B = 04B.</li>
<li>All arithmetic is <b>integer</b> arithmetic, even when an element is a
floating-point constant (its bit pattern is used).</li>
</ol>
${h4('60-bit one\'s complement arithmetic')}
${ul([
    `Each element is replaced by a 60-bit value: 21-bit quantities (symbols, counters) are sign-extended; a character constant is justified in the destination field, then extended; a register counts as 0 in the operand.`,
    `Addition and subtraction follow the 6600 subtractive adder (a + b = a − ¬b): the result is −0 (${c('77777777777777777777')}) only where the hardware would produce it; ${c('0-0')} and ${c('-0')} are +0.`,
    `Multiplication and division operate on signed values; the product is reduced to 60 bits, excess high-order bits being lost without notice.`,
    `The final value goes into the destination field; if it does not fit, it is truncated with warning 7 (${see('lang-fields', 'field size')}).`,
  ])}
${h4('Examples')}
${T([
    ['ABLE', 'one term, one element'],
    ['$-29', 'two terms'],
    ['*+3', 'location + 3'],
    ['ABLE*4-72/NUM', '(ABLE × 4) − (72 ÷ NUM)'],
    ['1+=3.14159EE+6', 'constant + address of a literal'],
    ['3+A6-NUM', 'register A6, operand 3 − NUM'],
    ['1R=&1R/', 'exclusive OR of two display codes'],
  ], ['Expression', 'Meaning'])}
${ex(`
ABLE      EQU    5
NUM       EQU    3
          SX1    ABLE*+3
          SX2    2*3+4/2-1
          SX3    -2*3
          SX4    7&3
          SX5    ABLE*4-72/NUM
          SX6    5/2*2
          SX7    7/0
XOR       EQU    1R=&1R/
          CON    3*-1,10/-3,1--2,-7/2`)}
<p>Two relocatable elements in one term; exclusive OR with a relocatable
value:</p>
${ex(`
FOX       BSS    1
          SX1    FOX*FOX
          SX2    FOX&1`, { errors: ['A'] })}
<p>Two successive elements in EQU:</p>
${ex(`
TWO       EQU    3RABCD`, { errors: ['A'] })}
`,
};

const CHAMPS = {
  id: 'lang-fields',
  title: 'Destination field size and truncation',
  keys: [],
  syntax: [],
  html: `
<p>The value of an expression is computed on 60 bits and then stored into a
<b>destination field</b> whose size depends on the context. That size also
governs the justification of character constants.</p>
${T([
    ['EQU, =, SET, MAX, MIN, MICCNT', '21 bits: the value is reduced to 21 bits, then sign-extended to 60 bits'],
    ['VFD n/exp', 'n bits (1 to 60)'],
    ['CON', 'one word: 60 bits (CPU), 12 bits (PP), 16 bits (CIPPU)'],
    ['30-bit CPU instruction', '18-bit K field'],
    ['15-bit CPU instruction', '6-bit jk field (shift counts, masks)'],
    ['PP instruction', '6 bits (d), 12 bits (m) or 18 bits (dm of LDC, ADC…)'],
    ['Counts (BSS, DUP, IF…)', 'evaluable absolute integer'],
  ], ['Context', 'Field'])}
${h4('Truncation rule')}
${ul([
    `A value <b>fits in n bits</b> when its bits 59 through n are all 0 or all 1. Both ${c('777777B')} and ${c('-1')} are therefore accepted in an 18-bit field.`,
    `Otherwise the value is truncated to its n low-order bits and the statement receives <b>warning 7</b> ("ADDRESS VALUE EXCEEDS FIELD SIZE, RESULT TRUNCATED.").`,
    `For symbol-defining pseudo instructions the reduction to 21 bits is silent: ${c('X EQU 4000000B')} gives a negative value (bit 20 propagated). The listing shows the value of a symbol on 18 bits.`,
    `Negative values are one's complement: ${c('SX7 -400000B')} gives K = ${c('377777')}.`,
  ])}
${h4('Examples')}
${ex(`
NEG       EQU    -1
BIG       EQU    1000000B-1
          SX1    NEG
          SX3    BIG
          SX4    777777B
          SX6    400000B
          SX7    -400000B
          VFD    6/77B,6/-1,48/0`)}
${ex(`
          SX0    1000000B
          VFD    6/100B,54/0`, { errors: ['7'] })}
`,
};

const RELOCATION = {
  id: 'lang-relocation',
  title: 'Relocation: absolute, relocatable, common, external',
  keys: [],
  syntax: [],
  html: `
<p>Besides its value, an expression has a <b>relocation type</b>, which tells
the loader how to adjust the field that holds it. For every intermediate value
the assembler keeps one coefficient per relocatable block and one per external
symbol: a relocatable symbol counts +1 in its block; multiplying by an absolute
value multiplies the coefficients; addition and subtraction add them.</p>
${T([
    ['Absolute', 'all coefficients zero (relocatable symbols cancel in pairs within one block, even non-adjacent, even multiplied)', 'blank'],
    ['Positive relocatable', 'a single local block with coefficient +1, no external', '<code>+</code>'],
    ['Negative relocatable', 'a single local block with coefficient −1, no external', '<code>-</code>'],
    ['Common', 'a single common block with coefficient +1 (relocatable assemblies)', '<code>C</code>'],
    ['External', 'a single external with coefficient +1, no block', '<code>X</code>'],
  ], ['Type', 'Condition', 'Listing'])}
${ul([
    `All local blocks of a relocatable subprogram (block zero, literals, USE blocks) form one program block for the loader; their symbols nevertheless cancel only when they belong to the <b>same block of pass 1</b>: ${c('LIMA-FOX')} is rejected when LIMA and FOX are in different blocks, although their difference is constant.`,
    `Any other combination is rejected (flag A): coefficient ±2, two uncancelled blocks, negative common, external negated or combined with a relocatable term, two externals. Messages: "relocatable terms do not cancel properly", "expression does not reduce to one external term".`,
    `An external expression may contain relocatable terms that cancel: ${c('FOX-3*EASY+2*FOX+XYZ')}.`,
    `In an <b>absolute</b> or PP assembly, local blocks are relocatable in pass 1 and absolute in pass 2; a common block is a local block there; an external is rejected (flag U).`,
    `Context constraints: some pseudo instructions require an absolute expression (BSS, counts…, flag A); ORG, ORGC and LOC reject negative relocation (A); an entry point with negative relocation gives N.`,
    `Listing indicator: it follows the octal code of the word or instruction that holds the address.`,
  ])}
${h4('Examples')}
<p>EASY and FOX are in block zero, LIMA in block OTHER, MIKE is absolute, XYZ and
ABC are external:</p>
${ex(`
EASY      BSS    1
FOX       BSS    3
MIKE      EQU    10B
          USE    OTHER
LIMA      BSS    2
          USE    *
          EXT    XYZ,ABC
          SX1    EASY-FOX+MIKE
          SX1    FOX-*
          SX2    LIMA+MIKE-16
          SX2    FOX-EASY+FOX
          SX2    3*FOX-2*EASY
          SX2    EASY-*+FOX
          SX2    FOX-100B/MIKE
          SX2    -MIKE*2+LIMA
          SX2    =10HMESSAGE 33
          SX3    FOX-3*EASY+2*FOX+XYZ
          SX3    ABC+100B+MIKE
          SX4    -*O`)}
<p>Rejected combinations:</p>
${ex(`
EASY      BSS    1
FOX       BSS    3
          USE    OTHER
LIMA      BSS    2
          USE    *
          EXT    XYZ,ABC
          SX4    XYZ+ABC
          SX4    -ABC+*-LIMA
          SX4    XYZ+*O
          SX4    LIMA-FOX
          SX4    2*FOX`, { errors: ['A'] })}
<p>Common block: relocation C; a negative common is rejected.</p>
${ex(`
          USE    /COM/
CVAR      BSS    2
          USE    *
          SX1    CVAR+1
          SX3    CVAR-CVAR
          SX2    -CVAR`, { errors: ['A'] })}
`,
};

const PASSES = {
  id: 'lang-passes',
  title: 'Evaluation by pass',
  keys: [],
  syntax: [],
  html: `
<p>Each subprogram is assembled in <b>two passes</b>.</p>
${ul([
    `<b>Pass 1</b>: reading, editing, expansion of macros, DUP, ECHO, RMT and external texts, conditional assembly, interpretation of operation codes, assignment of locations, definition of symbols. The value of a relocatable symbol is relative to the <b>beginning of its block</b>.`,
    `<b>Pass 2</b> (at each ${c('END')}, and at each overlay ${c('IDENT')}): assignment of block origins, placement of literals and default symbols, re-evaluation with final values of every statement that generates code, listing and binary.`,
    `A machine instruction, CON, VFD or DATA may reference a symbol defined <b>later</b>: their fields are computed in pass 2.`,
    `Pseudo instructions that affect location assignment or the course of pass 1 require <b>previously defined</b> symbols (defined by an earlier statement in reading order) and an <b>evaluable</b> expression: EQU, SET, MAX, MIN, BSS, BSSZ, ORG, LOC, POS, IF line counts and tests, VFD field sizes, DIS word counts, COL, SPACE… A forward reference there gives flag U.`,
    `Redefinable symbols (SET, MAX, MIN, MICCNT) have in pass 2 the value they had at the same point of pass 1: a statement always sees the last definition preceding it.`,
  ])}
${h4('Examples')}
<p>${c('LATER')} can be used forward in an instruction, CON or VFD, but not in EQU,
BSS or IF:</p>
${ex(`
          SX1    LATER
          CON    LATER
          VFD    18/LATER
EARLY     EQU    LATER
          BSS    SIZE
LATER     EQU    5
SIZE      EQU    2`, { errors: ['U'] })}
<p>Difference of two labels (absolute) and a SET symbol read in order:</p>
${ex(`
          SX1    LAST-FIRST
FIRST     BSS    3
LAST      BSS    0
LENGTH    EQU    LAST-FIRST
N         SET    1
          SX2    N
N         SET    N+1
          SX3    N`)}
`,
};

// =================================================================
// Chapter 6: program structure
// =================================================================

const PROGRAMME = {
  id: 'lang-program',
  title: 'Subprogram, first statement group, block group',
  keys: [],
  syntax: ['IDENT name[,…]', '…', '[sym] END [transfer address]'],
  html: `
<p>A COMPASS program consists of one or more <b>subprograms</b>. Each begins with
${see('ps-ident', 'IDENT')} and ends with ${see('ps-end', 'END')}; a source file may
contain several in a row, assembled one after the other, each with its own symbol
table and listing. A subprogram whose END gives a transfer address is a main
program.</p>
${ul([
    `Before the first IDENT and between subprograms, lines are only listed; an ${c('END')} there is an error (O, "IDENT STATEMENT MISSING."). A file that ends without END gets flag O on its last statement and the subprogram is closed.`,
    `The <b>assembly type</b> is relocatable by default; ${see('ps-abs', 'ABS')} makes it absolute (CPU); ${see('ps-periph', 'PERIPH')}, ${see('ps-ppu', 'PPU')} or ${see('ps-cippu', 'CIPPU')} make it a PP program (always absolute).`,
    `A symbol in the location field of END receives the length of the subprogram (sum of the local blocks, literals included).`,
  ])}
${h4('First statement group')}
<p>Some pseudo instructions are legal only in the <b>first statement group</b>,
before any statement that generates code or deals with blocks:
${see('ps-abs', 'ABS')}, ${see('ps-machine', 'MACHINE')}, ${see('ps-periph', 'PERIPH')},
${see('ps-ppu', 'PPU')}, ${see('ps-cippu', 'CIPPU')}, ${see('ps-stext', 'STEXT')},
${see('ps-memsel', 'MEMSEL')}. Elsewhere they are rejected (flag O).</p>
<p>The first group ends at the first machine instruction, or at the first pseudo
instruction that is not one of those allowed anywhere: BASE, B1=1, B7=1, CHAR,
CODE, COMMENT, CPOP, CPSYN, CTEXT, DECMIC, EJECT, ELSE, END, ENDD, ENDIF, ENDM,
ENDX, HERE, IFC, IRP, LDSET, LIST, MACRO, MACROE, MICCNT, MICRO, NIL, NOLABEL,
NOREF, OCTMIC, OPDEF, OPSYN, PPOP, PURGDEF, PURGMAC, QUAL, RMT, SKIP, SPACE, SST,
TITLE, TTL, XREF, XTEXT (and IDENT itself).</p>
${h4('Block group')}
<p>The blocks established between two IDENTs, or between IDENT and END, form a
<b>block group</b> (at most 255 blocks, flag F beyond). At each END, and at each
overlay IDENT, the assembler performs pass 2 of the completed group: every symbol
receives its final value, then the block structure starts again from scratch
(${see('lang-overlays', 'overlays')}). At END the symbol table is cleared as
well.</p>
${h4('Examples')}
<p>Two subprograms in the same source; ${c('LEN')} receives the length of the
first one:</p>
${ex(`
* COMMENT BEFORE THE FIRST IDENT
          IDENT  FIRST
          SX1    1
          DATA   2
LEN       END
          IDENT  SECOND
          SX1    LEN
          END`, { errors: ['U'] })}
<p>(${c('LEN')} no longer exists in the second subprogram: U.)</p>
<p>${c('ABS')} outside the first statement group:</p>
${ex(`
          IDENT  LATE
          SX1    1
          ABS
          END`, { errors: ['O'] })}
`,
};

const BLOCS = {
  id: 'lang-blocks',
  title: 'Blocks: types, names and allocation order',
  keys: [],
  syntax: ['USE name   USE /name/   USE //   USE 0   USE *', 'USELCM name'],
  html: `
<p>A subprogram can divide its code and data among several <b>blocks</b>:
${see('ps-use', 'USE')}, ${see('ps-uselcm', 'USELCM')}, ${see('ps-org', 'ORG')} and
ORGC direct assembly into a block; locations within a block are assigned
consecutively, and each block keeps its counters when it is left
(${see('lang-counters', 'counters')}).</p>
${T([
    ['Absolute', '<code>PROGRAM*</code> (absolute), <code>ABSOLUTE*</code> (relocatable)', 'Nominal block of an absolute or PP assembly. In a relocatable assembly it exists only if ORG or ORGC receives an absolute value.'],
    ['Zero', '<code>PROGRAM*</code>', 'Nominal block of a relocatable assembly (<code>USE 0</code> or blank <code>USE</code>); receives at the end the words of <code>=S</code> symbols. In an absolute assembly it exists only when there are default symbols.'],
    ['Literals', '<code>LITERALS*</code>', 'Created by the assembler; always right after block zero.'],
    ['Local', 'name', '<code>USE name</code> (1 to 8 characters, not beginning with <code>:</code>). In LCM: <code>USELCM name</code>, type <code>+LOCAL</code>.'],
    ['Labelled common', '<code>/name/</code>', '<code>USE /name/</code> (at most 7 characters): area shared between relocatable modules, can be preset. In an absolute assembly it is a local block named <code>/name/</code>.'],
    ['Blank common', '<code>//</code>', '<code>USE //</code>: shared area that cannot be preset; only BSS and ORG are useful there. Any data there is rejected (flag R). In an absolute assembly, an ordinary local block.'],
  ], ['Block', 'Listing name', 'Role'])}
${ul([
    `${c('USE *')} returns to the block in use before the current USE, USELCM, ORG or ORGC (stack of 50).`,
    `${c('USE A')} and ${c('USE /A/')} are different blocks; a block is identified by its name, its type (local or common) and its memory (CM or LCM), hence up to 4 blocks with the same name.`,
    `${c('USELCM')} is reserved for CPU programs (O in a PP assembly). Data in an LCM block of an absolute assembly is rejected (R).`,
    `A symbol defined in a block remains global to the subprogram.`,
  ])}
${h4('Allocation order')}
${T([
    ['Relocatable', 'block zero (PROGRAM*), LITERALS*, then the local CM blocks in order of establishment: together they form the program block, relative to RA. Local LCM blocks: concatenated from 0, each rounded up to a multiple of 8 words. Each common block: from 0, relative to its own origin. ABSOLUTE*: absolute addresses (relative to RA).'],
    ['Absolute, PP', 'absolute block from 0, then block zero (default symbols), LITERALS*, then local (and common) blocks in order of establishment, after the highest address reached in the absolute block.'],
  ], ['Assembly', 'Order'])}
${note(`The length of a block is the highest value reached by its origin counter. The length of a relocatable module is the sum of the lengths of block zero, the literals block and the local CM blocks; the absolute block is not part of it.`)}
${ul([
    `Difference: in a relocatable assembly, code placed in the absolute block (${c('ORG')} to an absolute value) is not written to the binary tables produced.`,
  ])}
${h4('Examples')}
${ex(`
          IDENT  BLOCKS
          ENTRY  START
START     SA1    TAB
          SA2    CV
          SA3    =1
          USE    DATAB
TAB       BSS    10B
          USE    /COM/
CV        BSS    4
          USE    //
BL        BSS    100B
          USELCM BIGLCM
G         BSS    3
          USE    *
          USE    0
          SX2    BL
          END    START`)}
<p>Data in blank common is rejected:</p>
${ex(`
          USE    //
AREA      BSS    3
          DATA   1
          BSSZ   1
          USE    *`, { errors: ['R'] })}
`,
};

const COMPTEURS = {
  id: 'lang-counters',
  title: 'Origin, location and position counters',
  keys: [],
  syntax: ['*O  *  *P  $'],
  html: `
<p>The assembler keeps <b>three counters per block</b>, saved when the block is
left and restored when it is resumed. When a block is established, origin =
location = 0 and position = 60 (CPU), 12 (PP) or 16 (CIPPU). In pass 2 each local
block starts from its allocated origin.</p>
${T([
    ['Origin', '<code>*O</code>', 'Relative position of the next word assembled or reserved in the block; +1 per word assembled or skipped. ORG, ORGC and BSS advance it; ORG and ORGC can also move it backward or change blocks; a negative BSS decrements it (warning 7).'],
    ['Location', '<code>*</code>, <code>*L</code>', `Normally equal to the origin counter; used to define labels. ${see('ps-loc', 'LOC')} gives it another value (code loaded in one place and executed elsewhere, table numbered from 0) without changing where the code is placed; the effect lasts until <code>LOC *O</code>, USE, USELCM, ORG or ORGC.`],
    ['Position', '<code>*P</code>, <code>$</code> = <code>*P</code> − 1', `Number of bits still free in the current word (bits numbered 59…0 for the CPU, 11…0 for a PP). Decremented for each bit assembled; at 0 the word is complete: origin and location advance, position returns to 60 (12, 16). For the CPU, 15- and 30-bit instructions normally give the values 60, 45, 30, 15. ${see('ps-vfd', 'VFD')} and ${see('ps-pos', 'POS')} alter this progression.`],
  ], ['Counter', 'Element', 'Role'])}
${ul([
    `On the listing the printed address is that of the location counter, preceded by ${c('L')} when it differs from the origin counter.`,
    `A symbol in the location field receives the value of the location counter after any force upper (${see('lang-force', 'force upper')}).`,
  ])}
${h4('Examples')}
<p>Successive positions: ${c('P1')} is 60, ${c('P2')} 30 after a 30-bit
instruction, ${c('P3')} 15 after a 15-bit instruction.</p>
${ex(`
P1        EQU    *P
          SX1    1
P2        EQU    *P
          BX2    X1
P3        EQU    *P
BIT3      EQU    $
          BX3    X2`)}
<p>Code executed at address 100B but placed in the current block:</p>
${ex(`
          BSS    2
          LOC    100B
EXEC      SX5    *
          SA1    EXEC
          LOC    *O
AFTER     EQU    *`)}
`,
};

const FORCE = {
  id: 'lang-force',
  title: 'Force upper',
  keys: ['+', '-'],
  syntax: ['+         operation …   (force upper)', '-         operation …   (no force upper)'],
  html: `
<p>A 60-bit CPU word holds four 15-bit parcels. Before assembling certain
statements the assembler <b>forces upper</b>: it fills the remaining parcels of
the current word with no-operation instructions, sets the position counter to 60
and advances the counters.</p>
${h4('Force upper before the statement (CPU)')}
<ol>
<li>Not enough room left in the word: a 30-bit instruction in parcel 3.</li>
<li>Machine instruction, ${c('VFD')} or ${c('R=')} with a <b>symbol</b> or
${c('+')} in the location field.</li>
<li>Instructions ${c('PS')}, ${c('XJ')}, ${c('RE')}, ${c('WE')}, ${c('RL')}, ${c('WL')}
— <b>cancelled by ${c('-')} in the location field</b>.</li>
<li>Pseudo instructions ${c('BSS')}, ${c('BSSZ')}, ${c('DATA')}, ${c('DIS')},
${c('CON')}, ${c('LOC')}, ${c('ORG')}, ${c('ORGC')}, ${c('IDENT')}, ${c('END')},
${c('SEGMENT')}, ${c('SEG')}, and ${c('MD')}, ${c('DM')}, ${c('CC')}, ${c('CU')}
(except with ${c('-')} in the location field).</li>
</ol>
${h4('Deferred force upper (after the statement)')}
<p>After ${c('JP')}, ${c('RJ')}, unconditional ${c('EQ K')} and ${c('ZR K')},
${c('PS')}, ${c('XJ')} and ${c('MJ')} (7600), the force upper is <b>deferred</b>: it
occurs at the next machine instruction or data-generating, storage-allocation or
binary-control pseudo instruction <b>in the same block</b>. It is cancelled by a
${c('-')} in the location field of that statement. Intervening pseudo instructions
that read the counters (EQU ${c('*')}, ${c('*P')}, ${c('$')}…) see the value
<b>before</b> the force upper.</p>
${h4('Padding')}
${ul([
    `A single free 15-bit parcel is filled with ${c('46000')} (${c('NO')}). In our implementation two free parcels (30 bits, parcels 2 and 3) are filled with the 30-bit instruction ${c('6100046000')} (${c('SB0 B0+46000B')}, no effect): a difference from the manual, which fills each parcel with ${c('46000')}.`,
    `After a VFD that ends in the middle of a parcel, zeros complete the parcel before the padding (not visible on the listing). Padding instructions are not listed.`,
  ])}
${h4('VFD')}
${ul([
    `Symbol or ${c('+')} in the location field: force upper, then the first field starts at the beginning of a word.`,
    `${c('-')}: zeros are assembled up to the next parcel (15-bit) boundary and the first field starts there.`,
    `Blank location field: the first field starts at the current position; consecutive VFDs without location fields are contiguous. If the next statement is not a VFD with a blank location field and the last field ends before a parcel boundary, zeros are inserted up to that boundary.`,
  ])}
${h4('PP programs')}
<p>There is no force upper: a ${c('+')} in the location field is ignored except on
VFD, where ${c('+')}, ${c('-')} or a symbol makes the data start in the next
word.</p>
${h4('Examples')}
<p>With option ${c('G')}, each instruction is listed at its parcel:</p>
${ex(`
          LIST   G
          SX1    1
          SX2    2
          SX3    3
          SB1    1
          SX4    4
+         SX5    5
          SX6    6
          JP     NEXT
BEFORE    EQU    *
BEFOREP   EQU    *P
          SX7    7
NEXT      PS
          SX1    1
          PS
-         SX2    1
          BX1    X2
          VFD    6/1
          VFD    6/2
          BX2    X1
-         VFD    6/3
          VFD    12/1
          DATA   5`)}
<p>PP program: ${c('+')} has an effect only on VFD.</p>
${ex(`
          IDENT  PPFORCE,100B
          PERIPH
          ORG    100B
          LDN    1
+         LDN    2
          VFD    6/1
          VFD    6/2
+         VFD    6/3
          END`)}
`,
};

const RELOGEABLE = {
  id: 'lang-relocatable',
  title: 'Relocatable program',
  keys: [],
  syntax: ['IDENT name', '…', 'END [transfer]'],
  html: `
<p>A relocatable program (CPU only) consists of one or more separately assembled
or compiled modules. In memory the modules occupy contiguous areas; the first
word of the first one is the reference address RA. Each module is assembled <b>as
if it started at address 0</b>, and every relocatable address is adjusted by the
loader.</p>
${ul([
    `A nonblank IDENT without ABS, PERIPH, PPU or CIPPU gives a relocatable module. A second IDENT in a relocatable subprogram is rejected (flag O).`,
    `At the end of the assembly each local block receives an origin relative to block zero, in order of establishment; common blocks stay relative to their own origin (${see('lang-blocks', 'blocks')}).`,
    `Linkage with other modules: ${see('ps-entry', 'ENTRY, ENTRYC')}, ${see('ps-ext', 'EXT')}, ${c('=X')}, ${c('=Y')} symbols (${see('lang-linkage', 'linkage')}).`,
    `Pseudo instructions specific to relocatable assemblies: EXT, ${see('ps-rep', 'REP, REPC, REPI')}, ${see('ps-ldset', 'LDSET')}, ${see('ps-lcc', 'LCC')}; rejected elsewhere (O).`,
    `The binary is one record of loader tables: PRFX, LDSET, PIDL, ENTR, TEXT, REPL, FILL, LINK, XFER (${see('lang-binary-relocatable', 'relocatable binary')}).`,
    `In our environment the loader places relocatable programs at RA+100B, one after the other.`,
  ])}
${h4('Example')}
${ex(`
          IDENT  MODULE
          ENTRY  START
          EXT    OUTRTN
START     SA1    VALUE
          SX6    X1+1
          SA6    RESULT
          RJ     OUTRTN
          RJ     =XOTHER
          PS
VALUE     DATA   5
RESULT    BSS    1
          END    START`)}
`,
};

const ABSOLU = {
  id: 'lang-absolute',
  title: 'Absolute program',
  keys: [],
  syntax: ['IDENT name[,origin,transfer,level1,level2]', 'ABS', 'ORG origin'],
  html: `
<p>An absolute program is not relocatable: it is loaded at fixed addresses. A
CPU program is absolute when it contains ${see('ps-abs', 'ABS')} in its first
statement group; a PP program always is.</p>
${ul([
    `The assembler builds a <b>memory image</b>. In pass 2 each block receives an absolute origin after the absolute block, and every relocatable symbol becomes absolute.`,
    `Addresses are set by ${see('ps-org', 'ORG')}: the absolute block starts at 0. The origin field of IDENT does not place the code: it gives the load address written in the header table, and must therefore match the first ORG (otherwise the part of the image located before the declared origin is lost).`,
    `IDENT fields (CPU): name, origin, transfer address (default: origin), overlay levels (default 0,0 for the first overlay, 1,0 for the following ones). PP program: name and origin; execution starts at the origin, or at the address given by END.`,
    `The binary module consists of the prefix table (7700), a header table (5000, or 5100 when entry points are declared by ENTRY; a PP header word for a PP program) and the image (${see('lang-binary-absolute', 'absolute binary')}). ${see('ps-nolabel', 'NOLABEL')} suppresses the tables.`,
    `An external is rejected there (U); ${c('=X')} and ${c('=Y')} do not apply.`,
  ])}
${h4('Examples')}
${ex(`
          IDENT  ABSP,110B,START
          ABS
          ORG    110B
START     SA1    =5
          SX6    =SVAR
          USE    TABLE
T         BSS    2
          USE    *
          SA6    T
          PS
          END    START`)}
${ex(`
          IDENT  PPX,100B
          PERIPH
          ORG    100B
START     LDN    5
          LJM    START
          END    START`)}
`,
};

const OVERLAYS = {
  id: 'lang-overlays',
  title: 'Absolute overlays',
  keys: [],
  syntax: ['IDENT name,origin,transfer,level1,level2', 'name SEGMENT origin,transfer,level1,level2'],
  html: `
<p>An absolute program containing more than one IDENT, or SEGMENT statements
(${see('ps-segment', 'SEGMENT')}), produces one binary record per
<b>overlay</b>.</p>
${ul([
    `CPU levels: a pair of octal numbers 0–77B (p, s); ${c('0,0')} main overlay, ${c('p,0')} primary, ${c('p,s')} secondary. Without levels: 0,0 for the first overlay, 1,0 for the following ones. COMPASS checks neither the hierarchy nor coexistence in memory. PP overlays have no levels.`,
    `<b>IDENT-type overlay</b>: from one IDENT to the next, or from the last IDENT to END. Each IDENT other than the first completes the current block group (pass 2: all symbols become absolute), then the block structure starts again: block names can be reused, there is a new literals block, counters are reset. Symbols of earlier overlays remain usable.`,
    `<b>SEGMENT-type overlay</b>: the name is in the location field; the segment begins at the specified origin and the previous overlay ends at the current value of the origin counter. SEGMENT clears neither the symbol table nor the block table.`,
    `SEGMENT without a name in the location field: flag L. SEGMENT has no effect in a relocatable program.`,
    `Difference: the prefix table of every overlay carries the program name (first IDENT), not the overlay name.`,
  ])}
${h4('Example')}
${ex(`
          IDENT  MAIN,100B,START
          ABS
          ORG    100B
START     SX1    =1
          PS
SEG1      SEGMENT 200B,ENT2,1,0
          ORG    200B
ENT2      SX2    2
          PS
          IDENT  OV2,300B,ENT3,2,0
          ORG    300B
ENT3      SA1    ENT2
          PS
          END`)}
`,
};

const PARTIEL = {
  id: 'lang-partial-binary',
  title: 'Partial binary (SEG, blank IDENT)',
  keys: [],
  syntax: ['SEG', 'IDENT'],
  html: `
<p>According to the manual, an absolute CPU program containing
${see('ps-seg', 'SEG')} or an IDENT with a <b>blank</b> variable field writes
<b>partial sections</b>: the binary produced since the previous IDENT, SEGMENT or
SEG, with no end of section and no new prefix table. SEGMENT, a nonblank IDENT or
END completes the section.</p>
${ul([
    `<b>SEG</b> (manual): reduces the memory used by the assembler; writes the binary of the current portion without resetting the symbol and block tables. Storing later into a block of a portion already written is a range error (R).`,
    `<b>Blank IDENT</b> (manual): writes all the accumulated binary, resets the block table and the counters; the new absolute block starts after the last address of the previous portion.`,
  ])}
<p><b>Behaviour of our assembler</b> (difference):</p>
${ul([
    `${c('SEG')} only forces upper; it does not write a partial section. It is rejected outside an absolute CPU program (O).`,
    `A blank IDENT completes the block group like an overlay IDENT and produces a complete record (prefix table and 5000 table); the next absolute block restarts at address 0, only the other blocks are placed after the previous portion. Write an explicit ORG after a blank IDENT.`,
  ])}
${h4('Example')}
${ex(`
          IDENT  PART,100B
          ABS
          ORG    100B
          SX1    1
          PS
          IDENT
          ORG    200B
          SX3    3
          PS
          SEG
          SX4    4
          PS
          END`)}
`,
};

// =================================================================
// Chapter 7: character sets
// =================================================================

/** Table of the 64 codes, computed from the assembler's own tables. */
function charsetTable() {
  const rows = [];
  for (let d = 0; d < 64; d++) {
    const ch = DISPLAY[d];
    rows.push([
      o2(d),
      glyph(DISPLAY_CDC[d]),
      glyph(ch),
      o2(charValue(ch, 'E')),
      o2(charValue(ch, 'I')),
      o2(charValue(ch, 'A')),
      ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'),
      punches(HOLLERITH_026.get(ch)),
      punches(HOLLERITH_029.get(ch)),
    ]);
  }
  return T(rows, ['Display', 'CDC', 'ASCII', 'External BCD (E)', 'Internal BCD (I)', '6-bit ASCII (A)', 'ASCII (hex, N)', '026', '029']);
}

const JEUX = {
  id: 'lang-charsets',
  title: 'Character set and code table',
  keys: [],
  syntax: [],
  html: `
<p>All of the assembler's logic (editing, field analysis, constant values) works
on the 6-bit <b>display code</b> of the CDC 64-character set. Conversion into the
generation code requested by ${see('ps-code', 'CODE')} takes place when a character
data item or constant is evaluated.</p>
${ul([
    `Each display code has two graphics: one in the <b>CDC 64-character set</b> and one in the <b>ASCII 64-character subset</b>. An ASCII source uses the latter; the CDC graphics (${c('≡ ≠ → ∨ ∧ ↑ ↓ ≤ ≥ ¬')}) are accepted as synonyms.`,
    `Lower-case letters are read as the corresponding upper-case letters; any character missing from the table becomes a blank (55B).`,
    `Our implementation follows the <b>64-character set</b>: ${c(':')} has code 00 and ${c('%')} code 63B. (In the 63-character set ${c(':')} is 63B and code 00 is undefined.)`,
    `Twelve or more zero bits at the end of a word mark an <b>end of line</b> in CDC text files: that is why type ${c('C')} guarantees 12 zero bits.`,
    `Characters with a syntactic role: ${c('_')} (65B, ${c('→')}) concatenation, ${c('"')} (64B, ${c('≠')}) micro mark, ${c('&')} (67B, ${c('∧')}) exclusive OR, ${c('#')} (60B, ${c('≡')}) hexadecimal, ${c('*')} comment in column 1, ${c(',')} continuation in column 1, ${c(';')} (77B) parameter flag in definitions.`,
  ])}
${h4('Table of the 64 codes')}
<p>Columns: display code (octal); CDC and ASCII graphics; value of the character
under ${c('CODE E')} (external BCD), ${c('CODE I')} (internal BCD), ${c('CODE A')}
(6-bit ASCII = ASCII code − 40B), ${c('CODE N')} (8-bit ASCII); Hollerith punches
of the 026 and 029 codes (card reader of the emulator).</p>
${charsetTable()}
`,
};

const CODES = {
  id: 'lang-codes',
  title: 'Character generation codes (CODE, CHAR)',
  keys: [],
  syntax: ['CODE D|A|E|I|N|O|*', 'CHAR display,value'],
  html: `
<p>Character data items and constants are generated in the code selected by
${see('ps-code', 'CODE')}:</p>
${T([
    ['D', 'display code (default)', '6'],
    ['A', '6-bit ASCII: ASCII code − 40B (64-character subset)', '6'],
    ['E', 'external BCD', '6'],
    ['I', 'internal BCD', '6'],
    ['N', '8-bit ASCII (default under CIPPU): 12 bits per character for the CPU and 12-bit PPs, 8 bits under CIPPU', '12 / 8'],
    ['O', `"other" code: display code modified by ${see('ps-char', 'CHAR')}`, '6'],
    ['*', 'previous code (stack of the last 50; empty stack: display)', ''],
  ], ['Letter', 'Code', 'Bits'])}
${ul([
    `Blank fill (types H and A) uses the blank of the current code: 55B in display code, 00 in 6-bit ASCII, 20B in external BCD, 60B in internal BCD.`,
    `${c('CHAR exp1,exp2')}: under ${c('CODE O')}, the character of display code exp1 (0–77B) is generated with value exp2 (0–77B); outside that range, flag A. Initially the "other" code is display code.`,
    `A symbol in the location field of CODE defines a micro that receives the letter of the <b>previous</b> code; the predefined ${c('CODE')} micro receives the letter of the new code. The listing shows the change as ${c('D>E')}.`,
    `A letter other than A, D, E, I, N, O, ${c('*')}: flag A.`,
    `Since the source is read in upper case, ${c('CODE N')} cannot generate lower-case letters from the text of a string.`,
  ])}
${h4('Examples')}
<p>The word ${c('OUTPUT')} in the various codes:</p>
${ex(`
          DATA   0LOUTPUT
          CODE   E
          DATA   0LOUTPUT
          CODE   I
          DATA   0LOUTPUT
          CODE   A
          DATA   0LOUTPUT,10H
          CODE   N
          DATA   0LOUTPUT
          CODE   D`)}
<p>Exchange of ${c(':')} and ${c('%')} through the "other" code, then return to
the previous codes; ${c('OLDCODE')} receives the letter of the code left:</p>
${ex(`
          CODE   O
          CHAR   1R:,63B
          CHAR   63B,0
          DATA   2L:%
OLDCODE   CODE   *
          DATA   1R"OLDCODE"`)}
${ex(`
          CODE   X`, { errors: ['A'] })}
`,
};

// =================================================================
// Chapter 8: errors
// =================================================================

const ERROR_CAUSES = {
  A: 'Variable field in error: malformed element or data item; symbol longer than 8 characters; characters left over in EQU; expression not absolute where required; relocatable terms that do not cancel; several externals, negated external or external combined with a relocatable term; register not allowed (EQU, CON…); exclusive OR or division on a relocatable value; empty literal, literal in DATA, LIT with no data; duplicate radix or modifier, both preradix and postradix; 8 or 9 in octal; floating-point exponent out of range, binary point causing overflow, floating point in a PP assembly; bad CODE or BASE letter; bad block name; ORG, ORGC or LOC with negative or external relocation; POS outside 0 through the word size; PP relative jump outside −31…+31; missing comma after the DIS word count; entry point or external of incorrect form; IDENT without a name; CHAR value outside 0–77B; bad qualifier; relocatable VFD field straddling two words; delimited string without delimiter.',
  D: 'Symbol already defined with another value or attribute (the first definition holds); definition of a symbol declared external; EXT of a symbol defined in the subprogram.',
  E: 'Definition (MACRO, MACROE, OPDEF, DUP, ECHO, RMT) not terminated when END is encountered: a definition must lie entirely within the enclosing definition.',
  F: 'Table overflow: LIT of more than 100 words; more than 63 formal parameters and local symbols in a macro; more than 255 blocks in a group; more than 511 externals; external text (XTEXT) not found; more than 400 nesting levels ("RECURSION DEPTH EXCEEDED 400."); assembly stopped by an endless loop.',
  L: 'Location field in error: required symbol missing or invalid (EQU, =, SET, MAX, MIN, MICCNT); bad macro or micro name; format-two macro definition without substitutable parameter; SEGMENT without a name.',
  N: 'Entry point with negative relocation.',
  O: 'Operation field in error: unknown operation or unknown CPU instruction form; first-group pseudo instruction placed later (ABS, MACHINE, PERIPH, PPU, CIPPU, STEXT, MEMSEL); pseudo instruction illegal for this assembly type (EXT, REP, LDSET, LCC outside relocatable; NOLABEL, SEG outside absolute; ENTRY, USELCM, B1=1, R= in a PP assembly); second IDENT in a relocatable program; missing END; END before IDENT; LOCAL outside a macro heading; unknown IFC relation; instruction reserved to 8xx models.',
  P: 'Flag requested by ERR or ERRxx with no letter in the location field (or a character that is not a flag).',
  R: 'Data outside an allowed block: in blank common, in an LCM block of an absolute assembly; BSSZ in blank common; origin counter moved below 0.',
  U: 'Undefined symbol (value assumed 0); symbol not yet defined where a previously defined symbol is required; unknown qualifier; external in an absolute assembly; undefined entry point; undefined symbol or unknown attribute in an IF.',
  V: 'VFD field size missing or outside 1…60; VFD field without "/".',
  1: 'Invalid symbol in the location field of an instruction: the instruction is assembled without a label.',
  2: 'Variable field of SET, MAX, MIN or MICCNT in error (undefined symbol, unknown micro…): the symbol is not defined.',
  3: 'A macro redefines an existing macro, pseudo instruction or operation code: the new definition overrides.',
  4: 'Repeated or invalid formal parameter (macro, OPDEF, ECHO): it is ignored.',
  5: 'Invalid CPU instruction syntax in OPDEF, CPOP, CPSYN or PURGDEF.',
  6: 'Location field meaningless. In our implementation: symbol in the form of a register (An, Bn, Xn) defined in a CPU program.',
  7: 'Value truncated to the size of the destination field; character constant too long; A.x, B.x, X.x designator outside 0–7; integer longer than 60 bits; PP data item longer than 12 bits; shift count out of range; negative BSS; negative MICRO position or count.',
  8: 'Missing or extra subfield (CON, VFD, DIS without a variable field; subfield of a PP instruction).',
  9: 'Micro reference to an unknown name: no substitution.',
};

function errorTable() {
  const order = 'ADEFLNOPRUV123456789';
  const rows = [...order].map((f) => [f, FATAL.has(f) ? 'fatal' : 'informative', `<span class="mono">${esc(ERROR_TEXT[f])}</span>`, ERROR_CAUSES[f]]);
  return T(rows, ['Flag', 'Severity', 'Message', 'Causes in this assembler']);
}

const ERREURS = {
  id: 'lang-errors',
  title: 'Error flags',
  keys: [],
  syntax: [],
  html: `
<p>Each error detected on a statement is reported by a one-character
<b>flag</b> printed in columns 1–3 of the listing, to the left of the line in
error (always listed, whatever the list options).</p>
${ul([
    `<b>Letter = fatal error.</b> The binary of the subprogram cannot be used: the IDE refuses to load the program, the ${c('compass')} command exits with code 1, and the programming-interface result has ${c('ok: false')}.`,
    `<b>Digit = informative warning</b>: code is generated, possibly truncated.`,
    `Each distinct flag appears once per line; flags are printed in the order A D E F L N O P R U V, then 1 to 9 (at most three in the column).`,
    `At the end of the listing the <b>error directory</b> ("ERROR DIRECTORY") gives, for each flag that occurred, its message and the pages concerned (${see('lang-listing-summaries', 'end-of-listing summaries')}). The detailed message of each occurrence appears in the IDE Problems panel and on the error output of the command.`,
    `${see('ps-err', 'ERR')} and ${see('ps-errxx', 'ERRxx')} let the program raise a flag itself.`,
  ])}
${errorTable()}
`,
};

const ERREURS_FATALES = {
  id: 'lang-fatal-errors',
  title: 'Fatal errors: examples',
  keys: [],
  syntax: [],
  html: `
<p>Statements that produce each fatal flag (${see('lang-errors', 'flag table')}).</p>
${h4('A — address field bad')}
${ex(`
          SX1    TOOLONGNAME
          DATA   =1
          SX2    =0H`, { errors: ['A'] })}
${h4('D — doubly defined symbol')}
${ex(`
VAL       EQU    1
VAL       EQU    2`, { errors: ['D'] })}
${h4('E — illegally nested definition')}
${ex(`
          IDENT  NESTING
MAC       MACRO
          SX1    1
          END`, { errors: ['E'] })}
<p>The END encountered during the definition closes it (flag E on the heading),
then ends the subprogram normally.</p>
${h4('F — table overflow')}
${ex(`
          XTEXT  NOSUCH`, { errors: ['F'] })}
${h4('L — location field bad')}
${ex(`
          EQU    1`, { errors: ['L'] })}
${h4('N — negative relocation on entry point')}
${ex(`
          ENTRY  NEG
NEG       EQU    -*`, { errors: ['N'] })}
${h4('O — operation field bad')}
${ex(`
          UNKNOWN 1
          SX1    1,2`, { errors: ['O'] })}
${h4('P — error requested by the program')}
${ex(`
          ERR
          ERRNZ  1`, { errors: ['P'] })}
${h4('R — data origin outside block')}
${ex(`
          USE    //
          DATA   1
          USE    *`, { errors: ['R'] })}
${h4('U — undefined symbol')}
${ex(`
          SX1    UNDEF
          IFEQ   FURTHER,1
          ENDIF
FURTHER   EQU    1`, { errors: ['U'] })}
${h4('V — VFD bit count')}
${ex(`
          VFD    61/0,0/1`, { errors: ['V'] })}
${h4('Flag chosen by the program')}
<p>A flag letter in the location field of ERR or ERRxx replaces P:</p>
${ex(`
U         ERR
7         ERRZR  0`, { errors: ['U', '7'] })}
`,
};

const ERREURS_INFO = {
  id: 'lang-error-examples',
  title: 'Informative warnings: examples',
  keys: [],
  syntax: [],
  html: `
<p>Statements that produce each informative flag (${see('lang-errors', 'flag table')}).</p>
${h4('1 — location symbol bad')}
${ex(`
5A        SX1    1`, { errors: ['1'] })}
${h4('2 — error in a SET, MAX, MIN, MICCNT definition')}
${ex(`
S         SET    UNDEF`, { errors: ['2'] })}
${h4('3 — duplicate macro definition')}
${ex(`
TWICE     MACRO
          SX1    1
          ENDM
TWICE     MACRO
          SX1    2
          ENDM
          TWICE`, { errors: ['3'] })}
${h4('4 — bad formal parameter name')}
${ex(`
MAC       MACRO  P,P
          ENDM`, { errors: ['4'] })}
${h4('5 — CPU operation syntax incorrectly specified')}
${ex(`
BADSYN    OPDEF  Q
          ENDM`, { errors: ['5'] })}
${h4('6 — symbol in the form of a register')}
${ex(`
B7        EQU    7`, { errors: ['6'] })}
${h4('7 — value truncated')}
${ex(`
          SX1    1000000B
          SA1    A.10
          BSS    -1`, { errors: ['7'] })}
${h4('8 — missing subfield')}
${ex(`
          CON`, { errors: ['8'] })}
${h4('9 — unknown micro')}
${ex(`
          DATA   0L"UNKNOWN"`, { errors: ['9'] })}
`,
};

// =================================================================
// Chapter 9: listing, binary output, execution
// =================================================================

const LISTING = {
  id: 'lang-listing',
  title: 'Assembly listing: structure and listed line',
  keys: [],
  syntax: [],
  html: `
<p>The listing of each subprogram contains, in order: the octal and source
statement listing; the block, entry point and external symbol summaries (option
B); the contents of the literals block (option D); the assembler statistics; the
error directory (only when errors occurred); the symbolic reference table
(options R and L). What is listed is controlled by ${see('ps-list', 'LIST')} (default
options B, L, N, R), ${see('ps-title', 'TITLE')}, ${see('ps-ttl', 'TTL')},
${see('ps-eject', 'EJECT')}, ${see('ps-space', 'SPACE')}.</p>

${h4('Page heading')}
${ul([
    `Each page begins with two heading lines and a blank line; a page holds 60 lines; pages are separated by a form feed.`,
    `Line 1: title (62 characters: first TITLE, or TTL, otherwise the IDENT variable field), assembler version ${c('COMPASS 3.6-JS')}, date (${c(' yy/mm/dd.')}), time (${c(' hh.mm.ss.')}), ${c('PAGE')} and page number (restarting at 1 for each subprogram).`,
    `Line 2: subtitle (later TITLEs; ${c('ERROR DIRECTORY')} or ${c('SYMBOLIC REFERENCE TABLE.')} on those pages), sub-subtitle (location field of the latest EJECT, SPACE, TITLE, TTL or PS, 10 characters), block in use, qualifier in effect.`,
  ])}

${h4('Listed line')}
${T([
    ['1–3', 'Error flags (one character per distinct flag, letters then digits).'],
    ['4', '<code>L</code> when the location counter differs from the origin counter (after LOC).'],
    ['5–10', 'Address: location counter, octal, leading zeros suppressed. Printed only on a line that starts a new word or defines a location symbol.'],
    ['12–31', 'Octal code: a CPU instruction is placed at the column of its parcel (parcel p at column 12 + 5p): 5 digits for 15 bits, 10 digits for 30 bits; a data word takes 20 digits. PP: 4 digits per 12-bit word (6 under CIPPU), a two-word instruction shown on one line.'],
    ['33', 'Relocation indicator: <code>+</code> positive relocatable, <code>-</code> negative relocatable, <code>C</code> common, <code>X</code> external, blank absolute.'],
    ['41–112', 'Source image, columns 1–72 (first line of the statement).'],
    ['113–130', 'Sequence field (columns 73–90), or for a generated line the name of the macro (or <code>*DUP*</code>, <code>*ECHO*</code>, <code>*RMT*</code>, text name) on 9 characters followed by the nesting level.'],
  ], ['Columns', 'Contents'])}
${ul([
    `Padding no-ops of a force upper and zeros completing a VFD parcel are not shown.`,
    `By default, for DATA, DIS and BSSZ only the first word is listed (option D for the others); lines generated by macros (M, S), DUP and ECHO (E), XTEXT (X), skipped lines (F) are listed only with the corresponding options; the macro call line shows the code of the first word generated.`,
    `Statements generating no code show a value in the octal code field, right-justified: EQU, =, SET, MAX, MIN, MICCNT (value of the symbol on 18 bits), BSS and BSSZ (word count, blank if 0), LIT (address of the first literal word), COL (new column), BASE and CODE (${c('D>O')}: old and new letter), CHAR (${c('00>63')}).`,
    `Lines with an error are always listed, as are LIST and END.`,
  ])}
${h4('Example')}
${src(`
DEMONSTRATION PROGRAM                                           COMPASS 3.6-JS   26/10/21.  14.05.09. PAGE     1
                                                                                PROGRAM*

                                                  IDENT  DEMO
                                                  ENTRY  START
         0 5110000004           +       START     SA1    VALUE
                     7261000001                   SX6    X1+1
         1 5160000005           +                 SA6    RESULT
                     0100000000 X                 RJ     =XOUTRTN
U                                                 SX7    UNDEF
         3 0000000000                             PS
         4 00000000000000000005         VALUE     DATA   5
         5                    1         RESULT    BSS    1
                                                  END    START
`)}
`,
};

const LISTING_RESUMES = {
  id: 'lang-listing-summaries',
  title: 'End-of-listing summaries: blocks, literals, statistics, error directory',
  keys: [],
  syntax: [],
  html: `
<p>After the source statements, our assembler prints the following summaries
(the manual places the block and entry summaries on the first page; here they
come after the code, once lengths are known).</p>
${ul([
    `<b>Block usage</b> (option B): ${c('BLOCKS TYPE ADDRESS LENGTH')}, one line per block. Types: ${c('ABSOLUTE')} (every block of an absolute assembly, and ABSOLUTE*), ${c('LOCAL')} (relative to block zero), ${c('COMMON')} (relative to the common origin); prefix ${c('+')} for an LCM block. Address and length in octal.`,
    `<b>Entry points</b>: "ENTRY POINTS.", three columns, filled column by column; ${c('*')} after the name for ENTRYC, ${c('+')} after the address when relocatable, ${c('*******')} for an undefined entry point.`,
    `<b>External symbols</b>: "EXTERNAL SYMBOLS.", in columns; ${c('*')} after a weak external.`,
    `<b>Literals</b> (option D): "CONTENT OF LITERALS BLOCK.", then address, word in octal and conversion into display code.`,
    `<b>Statistics</b>: storage used, number of statements, symbols, invented symbols, references; then the number of fatal errors (${c('n ERRORS')}) and warnings (${c('n WARNINGS')}) if any.`,
    `<b>Error directory</b>, on a new page with subtitle ERROR DIRECTORY, for each flag that occurred: ${c('x TYPE ERROR      message')} followed by ${c('OCCURRED ON PAGES   p1, p2, …')}.`,
  ])}
${note(`Differences from the manual: no binary control card summary, no "DEFAULT SYMBOLS DEFINED BY COMPASS" list, statistics without CPU time; the storage figure is an estimate.`)}
${src(`
BLOCKS        TYPE          ADDRESS      LENGTH
PROGRAM*      LOCAL               0           6

ENTRY POINTS.
     START           0+

EXTERNAL SYMBOLS.
     OUTRTN

           40000B CM STORAGE USED          12 STATEMENTS           3 SYMBOLS
                                                                     0 INVENTED SYMBOLS
          6600-TYPE CPU ASSEMBLY                                     2 REFERENCES
               1 ERRORS

U TYPE ERROR      UNDEFINED SYMBOL. VALUE ASSUMED 0.
                  OCCURRED ON PAGES   1
`)}
`,
};

const REFERENCES = {
  id: 'lang-references',
  title: 'Symbolic reference table',
  keys: [],
  syntax: [],
  html: `
<p>With options R and L, the listing ends with the <b>symbolic reference
table</b> (subtitle SYMBOLIC REFERENCE TABLE.).</p>
${ul([
    `Global symbols first, then each qualifier under a line ${c('SYMBOL QUALIFIER = name')}; symbols in alphabetical order within each group.`,
    `Columns: symbol, value (octal, final address for a relocatable symbol), block (relocatable assembly: block containing the symbol), then references in the form ${c('page/line')}, up to 8 per row.`,
    `The first reference is the definition: flag ${c('L')} (location field) or ${c('D')} (EQU, SET… and the other definitions). The following ones are the statements that use the symbol in pass 2.`,
    `Option N (default) also lists symbols that are never referenced; ${see('ps-noref', 'NOREF')} excludes symbols from the table; invented LOCAL symbols are never listed.`,
    `Differences from the manual: ${see('ps-xref', 'XREF')} is accepted but the format is always the page/line format; reference flags E, F, I, S and X are not produced, and references made by IF tests (evaluated in pass 1) are not recorded.`,
  ])}
${src(`
RESULT           5 PROGRAM*     1/10 L        1/5
START            0 PROGRAM*      1/3 L
VALUE            4 PROGRAM*      1/9 L        1/3
`)}
`,
};

const BINAIRE = {
  id: 'lang-binary',
  title: 'Binary output: records and prefix table (PRFX 7700)',
  keys: [],
  syntax: [],
  html: `
<p>The binary of a subprogram is made of loader tables. Every table begins with a
header word holding the table code and the count of words that follow:</p>
${src(`
 59      48 47      36 35                              0
+----------+----------+---------------------------------+
| CN (12)  | WC (12)  |  table dependent (36)           |
+----------+----------+---------------------------------+
`)}
${T([
    ['Relocatable CPU', 'one record: PRFX, [LDSET 7000], PIDL 3400, [ENTR 3600], TEXT 4000…, [REPL 4300], [FILL 4200], [LINK 4400], [XFER 4600]; each LCC directive is a separate coded record'],
    ['Absolute CPU', 'one record per overlay: PRFX, 5000 or 5100 header, memory image'],
    ['PP', 'one record per overlay: PRFX, PP header word, image packed 5 PP words per CM word'],
  ], ['Assembly', 'Records'])}
<p>The loader table formats are not in the COMPASS manual (they belong to the
Loader manual); the layouts below are those written by our assembler and read by
our loader. Without D, a subprogram with fatal errors is not loaded.</p>
${h4('PRFX — prefix table (7700)')}
${src(`
word 0    12/7700B, 12/16B, 36/0
word 1    42/program name (display, left-justified, zero-filled, 7 chars), 18/0
word 2    date  " yy/mm/dd."           (10 display characters)
word 3    time  " hh.mm.ss."
word 4    operating system  "NOS 2.8.7 "
word 5    processor          "COMPASS   "
word 6    version            "3.6-" + MODLEVEL
word 7    hardware: 2/target, 2/valid (blank, 6X 7X 8X for CPU; 6P 7P 8P for PP),
          first character of each MACHINE hfi subfield (6 at most)
words 8-14  COMMENT text, 70 characters, blank-filled
`)}
<p>${see('ps-nolabel', 'NOLABEL')} suppresses PRFX and the absolute header tables
(${c('NOLABEL I')}: PRFX only); see ${see('ps-machine', 'MACHINE')} and
${see('ps-comment', 'COMMENT')}.</p>
`,
};

const BINAIRE_RELOC = {
  id: 'lang-binary-relocatable',
  title: 'Relocatable binary tables (PIDL, ENTR, TEXT, FILL, REPL, LINK, XFER)',
  keys: [],
  syntax: [],
  html: `
<p>Relocation bases used by the tables: <b>0</b> absolute, <b>1</b> program (all
local blocks merged), <b>2 + k</b> the k-th common block in PIDL order.</p>
${h4('PIDL — program identification and length (3400)')}
${src(`
word 0    12/3400B, 12/WC, 36/0
word 1    42/program name, 18/program length (block zero + literals + local CM blocks)
word 2..  42/common block name (0 for blank common), 18/block length   one per common
`)}
${h4('ENTR — entry points (3600)')}
${src(`
word 0    12/3600B, 12/WC (= 2 × number of entries), 36/0
pair      42/entry name, 18/0
          1/conditional (ENTRYC), 23/0, 18/relocation base, 18/address
`)}
${h4('TEXT — program text (4000)')}
${src(`
word 0    12/4000B, 12/WC (data words + 1), 18/relocation base of load address (1), 18/load address
word 1    15 four-bit relocation codes: data word 1 in bits 59-56 … word 15 in bits 3-0
word 2..  1 to 15 data words
 code bits 3-2 (upper field, bits 47-30)    bits 1-0 (lower field, bits 17-0)
   00 none   10 +   11 -                    00 none   10 +   11 -
   01 middle field (bits 32-15), sign in bits 1-0 (10 +, 11 -)
`)}
<p>The whole program block is written in consecutive TEXT tables of 15 words,
zero words included. Only program relocation goes through TEXT; common-block
addresses go through FILL and externals through LINK.</p>
${h4('FILL — common relocation (4200)')}
${src(`
word 0    12/4200B, 12/WC, 36/0
items     30-bit items, two per word, first in bits 59-30
 base item   1/1, 2/0, 9/relocation base of the common block, 18/0
 fill item   1/0, 2/position (00 lower, 01 middle, 10 upper), 9/base of the word (1), 18/address
`)}
${h4('REPL — replication (4300)')}
${src(`
word 0    12/4300B, 12/WC, 36/0
entry     12/type (0 REP, 1 REPC, 2 REPI), 12/1, 18/0, 18/source address
          12/base of destination (0 or 1), 30/0, 18/destination address
          20/repetition count, 20/block size, 20/increment
`)}
${h4('LINK — external references (4400)')}
${src(`
word 0    12/4400B, 12/WC, 36/0
name      42/external name, 17/0, 1/weak
count     42/0, 18/n
items     n 30-bit items, two per word: 1/0, 2/position (00 lower, 01 middle,
          10 upper), 9/base of the referencing word (1), 18/its address
`)}
<p>The field of the referencing instruction holds the addend (${c('=XNAME+3')}
puts 3 in K).</p>
${h4('XFER — transfer (4600)')}
${src(`
word 0    12/4600B, 12/1, 36/0
word 1    42/name of the transfer symbol (END variable field), 18/0
`)}
${h4('LDSET (7000) and LCC')}
${src(`
LDSET     12/7000B, 12/n, 36/0, then n words: each option as 10 display characters
LCC       separate coded record: directive text in display code, then a zero word
`)}
`,
};

const BINAIRE_ABSOLU = {
  id: 'lang-binary-absolute',
  title: 'Absolute binary: 5000 and 5100 tables, PP header',
  keys: [],
  syntax: [],
  html: `
<p>Each overlay of an absolute CPU program is a record: prefix table, header
table, then the memory image from the overlay origin to the last word written.</p>
${h4('5000 — single entry overlay (ASCM)')}
${src(`
 59      48 47  42 41  36 35        18 17          0
+----------+------+------+------------+-------------+
|   5000   |  l1  |  l2  |   origin   |  transfer   |
+----------+------+------+------------+-------------+
`)}
${h4('5100 — overlay with entry points (EASCM)')}
${src(`
word 0    12/5100B, 12/0, 6/l1, 6/l2, 24/number of entry points
word 1..  42/entry point name, 18/address      one word per ENTRY symbol
`)}
${h4('PP program')}
${src(`
header    18/name (3 display characters), 6/0, 12/load address (origin - 5),
          24/length in PP words (image + 5 header words)
image     PP words packed 5 per CM word, 12 bits each, first in bits 59-48
`)}
<p>The 5300/5400 tables of the loader are not produced. The PP header layout is
an implementation choice (not documented in the manual).</p>
`,
};

const EXECUTION = {
  id: 'lang-execution',
  title: 'Execution: COMPASS parameters, command line, IDE',
  keys: [],
  syntax: ['COMPASS(p1,p2,…)', 'node cli/compass.js SOURCE [-l listing] [-b binary] [-x dir] [-S text] [-q]'],
  html: `
${h4('COMPASS control statement (manual)')}
<p>On the original system COMPASS is called by ${c('COMPASS.')} or
${c('COMPASS(p1,…,pn)')}, each parameter being ${c('mode')}, ${c('mode=0')} or
${c('mode=lfn')}, in any order. The table gives the meaning in the manual and the
equivalent in this environment.</p>
${T([
    ['A', 'abort the job step if assembly errors occurred', 'command exit code 1'],
    ['B', 'binary file (default LGO; B=0 none)', '<code>-b file</code>; IDE: loaded directly'],
    ['BL', 'burstable listing', '—'],
    ['D', 'write the binary in spite of errors', '— (a program with fatal errors is not loaded)'],
    ['E', 'error list file', 'errors on the error output; IDE Problems panel'],
    ['F', 'value of <code>*F</code>', 'option <code>F</code> of the programming interface'],
    ['G, S', 'system texts (G=file, S=library overlay), up to 7', '<code>-S name</code> (default SYSTEXT, <code>0</code> for none); interface option <code>systemText</code> (name or list)'],
    ['I', 'source file (default INPUT)', 'SOURCE argument; IDE: active file'],
    ['L', 'full listing file', '<code>-l file</code> (standard output otherwise, <code>-q</code> to suppress)'],
    ['LO', 'list options (disables LIST)', '—'],
    ['ML', 'MODLEVEL micro', 'interface option <code>ML</code>'],
    ['N', 'ignore EJECT and TITLE page ejects', '—'],
    ['O', 'short list file', '—'],
    ['P', 'continuous page numbering', '—'],
    ['PC', 'PCOMMENT micro', 'interface option <code>PC</code>'],
    ['PD, PS', 'print density, page size', '— (60 lines per page)'],
    ['X', 'default XTEXT file (OLDPL)', '<code>-x dir</code>: each file DIR/NAME or DIR/NAME.cmp becomes text NAME'],
  ], ['Parameter', 'Manual', 'Here'])}
${h4('Command line')}
${ul([
    `${c('node cli/compass.js SOURCE')} assembles SOURCE (read as Latin-1); the file name without extension, in upper case, names the source.`,
    `${c('-l FILE')} writes the listing to FILE (otherwise to standard output); ${c('-q')} suppresses the listing.`,
    `${c('-b FILE')} writes the binary: for each record a line ${c('* kind program [overlay]')} (kind REL, ABS, PP or LCC) followed by one 20-digit octal word per line.`,
    `${c('-x DIR')} makes every file of DIR available to XTEXT under its name without extension (upper case).`,
    `${c('-S NAME')} selects the system text (SYSTEXT by default; ${c('0')}: none).`,
    `Each error is reported on the error output as ${c('file:line: erreur|avertissement FLAG message')} (fatal or informative), followed by ${c('ASSEMBLY COMPLETE.')} or ${c('ASSEMBLY ERRORS.')} and, for each subprogram, its name, type and length. Exit code: 0 without fatal error, 1 otherwise.`,
  ])}
${h4('Programming interface')}
<p>${c('assemble(source, options)')} (src/asm/compass.js) accepts: ${c('fileName')},
${c('texts')} (name → source for XTEXT and system texts), ${c('systemText')},
${c('date')} (DATE, JDATE, TIME micros), ${c('F')}, ${c('ML')}, ${c('PC')},
${c('debug')} (internal errors on the console), ${c('checkPhases')} (pass 1/pass 2
consistency check). The result holds ${c('ok')}, ${c('errors')}, ${c('listing')},
${c('lines')}, ${c('symbols')} and ${c('programs')} (images, overlays, binary
records).</p>
${h4('IDE')}
${ul([
    `The assembly command assembles the active file; its name (without extension, upper case) is the source name.`,
    `XTEXT texts available: the example texts, the files of the workspace, and every other open editor under its name.`,
    `The SYSTEXT system text is loaded at the start of every subprogram; its macros (MESSAGE, WRITEC, READC…) and micros are available, and its symbols after ${see('ps-sst', 'SST')}.`,
    `Errors appear in the Problems panel and as markers in the editor; the listing, symbols and memory map panels show the result. A program with fatal errors is not loaded.`,
  ])}
`,
};

// =================================================================
// Chapters
// =================================================================

export const CHAPTERS = [
  {
    id: 'lang-ch-format',
    title: 'Statement format',
    intro: '<p>Source lines, fields, continuation lines and comments.</p>',
    entries: [FORMAT, CONTINUATION, COMMENTAIRES],
  },
  {
    id: 'lang-ch-edition',
    title: 'Statement editing',
    intro: '<p>Concatenation, micro substitution and predefined micros.</p>',
    entries: [EDITION, MICROS_PREDEF],
  },
  {
    id: 'lang-ch-symbols',
    title: 'Names and symbols',
    intro: '<p>Names, symbols and their definition, default symbols, qualifiers, linkage symbols, registers.</p>',
    entries: [NOMS, SYMBOLES, SYMBOLES_DEFAUT, QUALIFIES, LIAISON, REGISTRES],
  },
  {
    id: 'lang-ch-data',
    title: 'Special elements and data notation',
    intro: '<p>Special elements, character and numeric data, floating point, hexadecimal, literals.</p>',
    entries: [SPECIAUX, DONNEES, CARACTERES, NUMERIQUES, FLOTTANTS, HEX, LITTERAUX],
  },
  {
    id: 'lang-ch-expressions',
    title: 'Expressions',
    intro: '<p>Syntax and arithmetic of expressions, field sizes, relocation, evaluation by pass.</p>',
    entries: [EXPRESSIONS, CHAMPS, RELOCATION, PASSES],
  },
  {
    id: 'lang-ch-program',
    title: 'Program structure',
    intro: '<p>Subprograms, blocks, counters, force upper, relocatable and absolute programs, overlays.</p>',
    entries: [PROGRAMME, BLOCS, COMPTEURS, FORCE, RELOGEABLE, ABSOLU, OVERLAYS, PARTIEL],
  },
  {
    id: 'lang-ch-charsets',
    title: 'Character sets',
    intro: '<p>The 64-character set and the character generation codes.</p>',
    entries: [JEUX, CODES],
  },
  {
    id: 'lang-ch-errors',
    title: 'Errors',
    intro: '<p>Error flags, their meaning and examples.</p>',
    entries: [ERREURS, ERREURS_FATALES, ERREURS_INFO],
  },
  {
    id: 'lang-ch-output',
    title: 'Listing, binary and execution',
    intro: '<p>Listing format, loader tables written by the assembler, execution parameters.</p>',
    entries: [LISTING, LISTING_RESUMES, REFERENCES, BINAIRE, BINAIRE_RELOC, BINAIRE_ABSOLU, EXECUTION],
  },
];
