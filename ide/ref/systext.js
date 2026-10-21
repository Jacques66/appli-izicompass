// COMPASS 3 reference: the SYSTEXT system text of the project's mini
// operating system (src/os/systext.js) and its common decks. The macros
// issue RA+1 requests served by the MTR monitor (src/os/mtr.js). Every ex()
// example is assembled by the tests, with SYSTEXT loaded by default.

import { c, src, ex, T, see, note, ul, h4 } from './fmt.js';

const p = (s) => `<p>${s}</p>`;

const RA1_WORD = src(`
 59        42 41 40 39  36 35            18 17             0
+------------+--+--+------+----------------+----------------+
|  request   |0 |R |  0   |       P2       |       P1       |
| 3 chars    |  |  |      |    18 bits     |    18 bits     |
+------------+--+--+------+----------------+----------------+
`);

const FET_WORDS = src(`
word 0   42/file name (display code, zero filled), 18/code and status
word 1   FIRST   first word of the circular buffer (bits 17-0)
word 2   IN      next word to be filled
word 3   OUT     next word to be emptied
word 4   LIMIT   last word of the buffer + 1
`);

const SYS_REGS = `${c('X1')}, ${c('A1')} (request word), and through SYS=: ${c('X2')}, ${c('X6')}, ${c('A2')}, ${c('A6')}`;
const CIO_REGS = `${c('X0')}, ${c('X1')}, ${c('X2')}, ${c('X6')}, ${c('X7')}, ${c('A1')}, ${c('A2')}, ${c('A6')}`;

const intro = {
  id: 'sys-intro',
  title: 'The SYSTEXT system text',
  keys: ['SYSTEXT', 'CPCTEXT'],
  syntax: ['COMPASS(S=SYSTEXT)        default: SYSTEXT is loaded at the start of every assembly'],
  html: `
${p(`A <b>system text</b> is a COMPASS program (started by ${see('ps-stext', 'STEXT')}) whose macros, opdefs, micros and
absolute symbols become available at the start of every assembly, like built-in operations. This assembler loads the
text ${c('SYSTEXT')} by default (the equivalent of ${c('S=SYSTEXT')} under NOS; ${c('CPCTEXT')} is a synonym). It
provides the macros through which a CPU program, run as a job of the mini operating system, requests services from the
monitor: messages, end of job, time, file input/output.`)}
${h4('Contents')}
${T([
  ['Subroutines and job area', `${see('sys-subr', 'SUBR')}, ${see('sys-syscom', 'SYSCOM')}`],
  ['Monitor requests', `${see('sys-system', 'SYSTEM')}, ${see('sys-message', 'MESSAGE')}, ${see('sys-endrun', 'ENDRUN')}, ${see('sys-abort', 'ABORT')}, ${see('sys-recall', 'RECALL')}, ${see('sys-time', 'TIME')}, ${see('sys-clock', 'CLOCK')}, ${see('sys-date', 'DATE')}, ${see('sys-memory', 'MEMORY')}`],
  ['Files', `${see('sys-filec', 'FILEC, FILEB')}, ${see('sys-cio', 'CIO.')}, ${see('sys-read', 'READ')}, ${see('sys-write', 'WRITE')}, ${see('sys-writer', 'WRITER')}, ${see('sys-writef', 'WRITEF')}, ${see('sys-rewind', 'REWIND')}, ${see('sys-writec', 'WRITEC')}, ${see('sys-readc', 'READC')}`],
  ['Conversions', `${see('sys-cdd', 'CDD')}, ${see('sys-cod', 'COD')}`],
  ['Deck inclusion', `${see('sys-auto', 'AUTO')}`],
  ['Common decks', `${see('sys-comcsys', 'COMCSYS')}, ${see('sys-comccio', 'COMCCIO')}, ${see('sys-comcwtc', 'COMCWTC')}, ${see('sys-comcrdc', 'COMCRDC')}, ${see('sys-comccdd', 'COMCCDD')}, ${see('sys-comccod', 'COMCCOD')}`],
], ['Group', 'Macros and decks'])}
${p(`SYSTEXT defines macros only: no symbols, no micros, no opdefs (${c('IF SST')} is always false with it). Its macros are
system macros: their expansions are listed only with ${c('LIST S')}; a program macro with the same name overrides them
(flag 3).`)}
${h4('Common decks and automatic inclusion')}
${p(`The macros do not contain the processing code: they load registers and call, by ${c('RJ')}, a subroutine
${c('xxx=')} of a <b>common deck</b> ${c('COMCxxx')}, a source text supplied to the assembler and readable by
${see('ps-xtext', 'XTEXT')}. The program does not have to include the decks: each macro calls ${see('sys-auto', 'AUTO')},
which saves an ${c('XTEXT')} of the deck as unlabeled <b>remote code</b>, assembled at ${c('END')}. A deck is included
once, even when it is used by several macros or included explicitly by the program: each deck defines a micro
${c('COMCxxx$')} on its first line, which is tested before inclusion. Decks that need other decks include them the same
way (COMCWTC and COMCRDC include COMCCIO, which includes COMCSYS).`)}
${h4('Conventions')}
${ul([
  `Subroutines are entered by ${c('RJ xxx=')} and exit through their entry word. Parameters are passed in registers (X1, X2, X7, B6, B7). Each deck page lists the registers it changes; others are preserved.`,
  `Unlike the NOS decks, B1 = 1 is not required.`,
  `The request words of SYSTEM and MESSAGE are generated in a block named ${c('RA1.')}, placed after the program blocks; the code itself stays in the block in use.`,
  `The SYSTEM and MESSAGE expansions define (SET) the symbol ${c('.R')}, which appears in the program's symbol table.`,
])}
${h4('RA+1 requests')}
${p(`A program requests a service by storing one word in RA+1 (word 1 of its field length). The MTR monitor, in PP0,
scans RA+1, performs the request, then clears RA+1. The routine ${c('SYS=')} (${see('sys-comcsys', 'COMCSYS')}) waits for
RA+1 to be free, stores the request and waits for it to be cleared: every request is completed when SYS= returns.`)}
${RA1_WORD}
${T([
  ['MSG', 'P1 = message address', 'message (at most 40 characters, 4 words) to the dayfile and to console line 1'],
  ['END', '', 'normal end of job (dayfile: NORMAL END OF JOB.)'],
  ['ABT', '', 'abnormal end of job (ABNORMAL END OF JOB.)'],
  ['RCL', 'P1 = status word', 'recall: no effect, completed at once'],
  ['TIM', 'P1 = address', 'elapsed milliseconds stored at P1'],
  ['CLK', 'P1 = address', 'time of day, display code, stored at P1'],
  ['DAT', 'P1 = address', 'date, display code, stored at P1'],
  ['MEM', 'P1 = address', 'field length, in the form 30/FL,30/0, stored at P1'],
  ['CIO', 'P1 = FET address', 'input/output on the file described by the FET'],
], ['Request', 'Parameters', 'Effect'])}
${p(`Only the first 18 bits (the request name) select the request; the R bit and P2 are not examined by MTR. An unknown
request ends the job with the dayfile message ${c('ILLEGAL RA+1 REQUEST.')}. Requests from the program and the
messages of the system appear in the Dayfile tab of the workbench.`)}
${h4('File environment table (FET)')}
${p(`A file is described by a 5-word FET, created by ${see('sys-filec', 'FILEC')}; its address is the operand of the
I/O macros. Data move through a circular buffer between FIRST and LIMIT: the writer advances IN, the reader advances
OUT; IN = OUT means the buffer is empty.`)}
${FET_WORDS}
${T([
  ['010B', 'READ', 'INPUT: one card of the 405 reader is stored as one line at IN'],
  ['014B', 'WRITE', 'OUTPUT: the lines from OUT to IN are printed on the 1612 printer'],
  ['024B', 'WRITER', 'same, end of record'],
  ['034B', 'WRITEF', 'same, end of file'],
  ['050B', 'REWIND', 'rewind'],
], ['Code', 'Function', 'Effect in the mini operating system'])}
${ul([
  `The function code is stored in bits 17-0 of word 0 by ${c('CIO=')}. When the function is complete, MTR sets bit 0 (code + 1); for INPUT, the status is 011B (card read), 021B (end of record: 7/8/9 card) or 031B (end of file: 6/7/8/9 card or empty reader).`,
  `Only the files named ${c('OUTPUT')} and ${c('INPUT')} are connected to devices. On OUTPUT, any function prints the buffer contents; on INPUT, only READ reads; any other request is simply marked complete.`,
  `A coded line occupies whole words of 10 display characters; it ends with a 12-bit zero byte in bits 11-0 of its last word. The first character of a printed line is the carriage control: ${c('1')} new page, ${c('0')} double space, other characters single space. A string generated by ${c('DIS ,*text*')} always ends with such a zero byte.`,
])}
${h4('Complete example')}
${ex(`
          IDENT  HELLO
          ENTRY  HELLO
HELLO     MESSAGE MSG
          WRITEC OUTPUT,LINE1
          SX1    12345
          CDD
          SA6    NUM
          WRITEC OUTPUT,LINE2
          WRITER OUTPUT
          ENDRUN
MSG       DIS    ,*HELLO FROM THE 6600*
LINE1     DIS    ,* FIRST LINE*
LINE2     DIS    1,  NUMBER =
NUM       DATA   0
          DATA   0
OUTPUT    FILEC  BUF,BUFL
BUFL      EQU    101B
BUF       BSS    BUFL
          END    HELLO
`)}
${p(`See also ${see('lang-execution', 'program execution')}.`)}
`,
};

const auto = {
  id: 'sys-auto',
  title: 'AUTO - automatic inclusion of a common deck',
  keys: ['AUTO'],
  syntax: ['          AUTO   deck'],
  html: `
${p(`Ensures that common deck ${c('deck')} is assembled with the program, once. All SYSTEXT macros that call a deck
subroutine end with ${c('AUTO')}; a program may also use it directly.`)}
${src(`
AUTO      MACRO  DECK
          IF     -MIC,DECK,5
DECK      MICRO  1,1,*Y*
          RMT
          IF     -MIC,DECK$,1
          XTEXT  DECK
          RMT
          ENDM
`)}
${ul([
  `On the first AUTO for a deck, the micro named after the deck (${c('COMCSYS')}...) does not exist: AUTO defines it and saves, as unlabeled remote code (${see('ps-rmt', 'RMT')}), the statements ${c('IF -MIC,COMCxxx$,1')} and ${c('XTEXT COMCxxx')}.`,
  `Later AUTOs for the same deck find the micro and do nothing (skip count of 5 statements).`,
  `At ${c('END')}, the remote code is assembled: the deck is included unless its micro ${c('COMCxxx$')} exists, that is, unless the program has already included it (by XTEXT, or as a dependency of another deck).`,
  `The deck code is therefore placed at the end of the program, in the block in use at END.`,
  `A program micro with the name of a deck prevents its automatic inclusion.`,
  `Remote code revealed while END assembles remote code is lost (${see('ps-rmt', 'RMT')}): AUTO used inside a deck would not work; the decks include their own dependencies by ${c('IF -MIC')} and ${c('XTEXT')}.`,
])}
${p(`Registers: none. Requests: none.`)}
${ex(`
          AUTO   COMCCOD
          AUTO   COMCCOD     NO EFFECT
          SX1    17B
          RJ     COD=        COD= IS ASSEMBLED AT END
`)}
`,
};

const subr = {
  id: 'sys-subr',
  title: 'SUBR - subroutine entry and exit',
  keys: ['SUBR'],
  syntax: ['name      SUBR'],
  html: `
${p(`Generates the entry word of a subroutine named ${c('name')} and the exit symbol ${c('nameX')}. Format two macro: the
location field of the call supplies the name. The same macro serves CPU and PPU programs (${see('ps-iftype', 'IFPP, IFCP')}).`)}
${src(`
          MACRO  SUBR,NAME
          IFPP   2
 NAME_X   LJM    *
 NAME     EQU    *-1
          IFCP   2
 NAME_X   EQ     *+400000B
 NAME     EQU    NAME_X
          ENDM
`)}
${T([
  ['CPU', `${c('nameX EQ *+400000B')}; ${c('name')} = nameX. ${c('RJ name')} stores the return jump in that word and enters at name+1; the routine exits by ${c('EQ nameX')}.`],
  ['PPU', `${c('nameX LJM *')}; ${c('name')} = nameX+1 (the address word of the LJM). ${c('RJM name')} stores the return address there and enters at name+1; the routine exits by ${c('UJN nameX')} or ${c('LJM nameX')}.`],
], ['Assembly', 'Generated code'])}
${p(`The entry word is forced upper (location symbol). Registers: none. Requests: none.`)}
${ex(`
          RJ     SUB
          EQ     *
SUB       SUBR
          SX6    1
          EQ     SUBX
`)}
${ex(`
          IDENT  PPSUB
          PERIPH
          ORG    100B
          RJM    SUB
          LJM    *
SUB       SUBR
          LDN    1
          UJN    SUBX
          END
`)}
`,
};

const syscom = {
  id: 'sys-syscom',
  title: 'SYSCOM - job communication area symbols',
  keys: ['SYSCOM'],
  syntax: ['          SYSCOM [B1]'],
  html: `
${p(`Defines the symbols of the job communication area (RA+0 to RA+77B), in the NOS manner. Format two macro: the
location field is accepted and ignored. With the parameter ${c('B1')}, the macro also assembles ${see('ps-b1', 'B1=1')}.`)}
${T([
  ['ARGR', '2', 'control statement arguments'],
  ['PGNR', '64B', 'program name'],
  ['CCDR', '70B', 'control statement image'],
], ['Symbol', 'Value', 'Contents (NOS convention)'])}
${p(`The mini operating system does not fill these words; the symbols are provided for programs written in the NOS style.
Registers: none. Requests: none.`)}
${ex(`
          SYSCOM B1
          SA1    ARGR
          SX6    B1
`)}
`,
};

const system = {
  id: 'sys-system',
  title: 'SYSTEM - monitor request',
  keys: ['SYSTEM'],
  syntax: ['          SYSTEM req,[r],[p1],[p2]'],
  html: `
${p(`Issues the RA+1 request ${c('req')} (3 characters) with its parameters, and returns once the monitor has completed it.
All other request macros are built on SYSTEM.`)}
${T([
  ['req', 'Request name: MSG, END, ABT, RCL, TIM, CLK, DAT, MEM, CIO (see the request table in ' + see('sys-intro', 'SYSTEXT') + ').'],
  ['r', 'Any nonblank text sets the recall bit R (bit 40) of the request.'],
  ['p1', 'Expression, bits 17-0 (usually an address).'],
  ['p2', 'Expression, bits 35-18.'],
], ['Parameter', 'Content'])}
${src(`
SYSTEM    MACRO  REQ,RCL,P1,P2
          LOCAL  W
.R        SET    0
          IFC    NE,$RCL$$,1
.R        SET    1
          USE    RA1.
W         VFD    18/0L_REQ,1/0,1/.R,4/0,18/P2,18/P1
          USE    *
          SA1    W
          RJ     SYS=
          AUTO   COMCSYS
          ENDM
`)}
${ul([
  `Request word: ${c('18/0Lreq,1/0,1/R,4/0,18/p2,18/p1')}, generated in block ${c('RA1.')} under an invented symbol.`,
  `Registers changed: ${SYS_REGS}.`,
  `Deck: ${see('sys-comcsys', 'COMCSYS')} (included automatically).`,
  `The symbol ${c('.R')} is defined by SET.`,
])}
${ex(`
          SYSTEM TIM,R,T
          SA1    T
          ENDRUN
T         CON    0
`)}
`,
};

/** Page for a simple request macro built on SYSTEM. */
function reqEntry(id, name, syntax, srcText, html, example) {
  return {
    id, title: name, keys: [name.split(' ')[0]], syntax: [syntax],
    html: `${html}\n${src(srcText)}\n${p(`Registers changed: ${SYS_REGS}. Deck: ${see('sys-comcsys', 'COMCSYS')} (included automatically).`)}\n${ex(example)}`,
  };
}

const message = {
  id: 'sys-message',
  title: 'MESSAGE - dayfile message',
  keys: ['MESSAGE'],
  syntax: ['          MESSAGE addr,[x],[r]'],
  html: `
${p(`Sends the message at ${c('addr')} to the job dayfile and to line 1 of the console (DSD right screen).`)}
${T([
  ['addr', 'Address of the message: display code, 10 characters per word, ending at the first word whose bits 11-0 are zero, 4 words (40 characters) at most.'],
  ['x', 'Destination code, bits 35-24 of the request (NOS: 0 system and user dayfile and line 1, 1 line 1 only, 3 user dayfile and line 1...). Accepted and ignored by MTR.'],
  ['r', 'Any nonblank text sets the recall bit.'],
], ['Parameter', 'Content'])}
${src(`
MESSAGE   MACRO  ADDR,X,RCL
          LOCAL  W
.R        SET    0
          IFC    NE,$RCL$$,1
.R        SET    1
          USE    RA1.
W         VFD    18/0LMSG,1/0,1/.R,4/0,12/X,6/0,18/ADDR
          USE    *
          SA1    W
          RJ     SYS=
          AUTO   COMCSYS
          ENDM
`)}
${ul([
  `Request: ${c('MSG')}, word ${c('18/3LMSG,1/0,1/r,4/0,12/x,6/0,18/addr')}.`,
  `MTR copies the four words starting at addr (zero words after the end of the message) to the next dayfile line and to console line 1.`,
  `Registers changed: ${SYS_REGS}. Deck: ${see('sys-comcsys', 'COMCSYS')}.`,
])}
${ex(`
          MESSAGE TEXT
          MESSAGE TEXT,1,R
          ENDRUN
TEXT      DIS    ,*PROCESSING COMPLETE.*
`)}
`,
};

const endrun = reqEntry('sys-endrun', 'ENDRUN - normal end of job', '          ENDRUN',
  `
ENDRUN    MACRO
          SYSTEM END
          ENDM
`,
  p(`Ends the job normally: request ${c('END')}. MTR writes ${c('NORMAL END OF JOB.')} in the dayfile, sets the job
status to "ended" and stops the CPU program (exchange to the idle package). The macro does not return.`),
  `
          SX6    1
          ENDRUN
`);

const abort = reqEntry('sys-abort', 'ABORT - abnormal end of job', '          ABORT',
  `
ABORT     MACRO
          SYSTEM ABT
          ENDM
`,
  p(`Ends the job abnormally: request ${c('ABT')}. MTR writes ${c('ABNORMAL END OF JOB.')} in the dayfile, sets the job
status to "aborted" and stops the CPU program. The macro does not return.`),
  `
          SA1    FLAG
          ZR     X1,OK
          ABORT
OK        ENDRUN
FLAG      CON    0
`);

const recall = reqEntry('sys-recall', 'RECALL - recall', '          RECALL [stat]',
  `
RECALL    MACRO  STAT
          SYSTEM RCL,,STAT
          ENDM
`,
  p(`Request ${c('RCL')} with P1 = ${c('stat')} (NOS: give up the CPU until bit 0 of word stat is set). In the mini
operating system the request has no effect and is completed at once; since every request is already complete when SYS=
returns, waiting for a FET is never necessary.`),
  `
          RECALL FET
          RECALL
          ENDRUN
FET       CON    0
`);

const time = reqEntry('sys-time', 'TIME - elapsed time', '          TIME   addr',
  `
TIME      MACRO  ADDR
          SYSTEM TIM,R,ADDR
          ENDM
`,
  p(`Request ${c('TIM')} (recall bit set): MTR stores at ${c('addr')} the number of milliseconds counted by the monitor
(binary integer).`),
  `
          TIME   T0
          TIME   T1
          SA1    T0
          SA2    T1
          IX6    X2-X1       DURATION IN MILLISECONDS
          ENDRUN
T0        CON    0
T1        CON    0
`);

const clock = reqEntry('sys-clock', 'CLOCK - time of day', '          CLOCK  addr',
  `
CLOCK     MACRO  ADDR
          SYSTEM CLK,R,ADDR
          ENDM
`,
  p(`Request ${c('CLK')}: MTR stores at ${c('addr')} the time of day in display code, ${c(' HH.MM.SS.')} (10 characters,
leading blank), ready to be printed.`),
  `
          CLOCK  NOW
          MESSAGE NOW
          ENDRUN
NOW       CON    0
          CON    0           ZERO WORD: END OF MESSAGE
`);

const date = reqEntry('sys-date', 'DATE - date', '          DATE   addr',
  `
DATE      MACRO  ADDR
          SYSTEM DAT,R,ADDR
          ENDM
`,
  p(`Request ${c('DAT')}: MTR stores at ${c('addr')} the date in display code, ${c(' YY/MM/DD.')} (10 characters, leading
blank). The macro DATE and the predefined micro DATE (assembly date) are distinct: macros and micros have separate names.`),
  `
          DATE   TODAY
          ENDRUN
TODAY     CON    0
`);

const memory = reqEntry('sys-memory', 'MEMORY - field length', '          MEMORY [type],addr,[r],[val]',
  `
MEMORY    MACRO  TYPE,ADDR,RCL,VAL
          SYSTEM MEM,R,ADDR
          ENDM
`,
  p(`Request ${c('MEM')}: MTR stores at ${c('addr')} the field length of the job, in the form ${c('30/FL,30/0')}. Only
${c('addr')} is used; TYPE, RCL and VAL are accepted for compatibility with the NOS macro (where VAL requests a new
field length) and ignored.`),
  `
          MEMORY CM,STAT
          SA1    STAT
          AX1    30          FIELD LENGTH
          ENDRUN
STAT      CON    0
`);

const filec = {
  id: 'sys-filec',
  title: 'FILEC, FILEB - file environment table',
  keys: ['FILEC', 'FILEB'],
  syntax: ['lfn       FILEC  fwa,len', 'lfn       FILEB  fwa,len'],
  html: `
${p(`Generates the 5-word FET of file ${c('lfn')}, with an empty circular buffer of ${c('len')} words at ${c('fwa')}.
Format two macro: the location field gives the file name, which is also defined as the address of the FET.
FILEB is a synonym (${see('ps-opsyn', 'OPSYN')}) of FILEC.`)}
${src(`
          MACRO  FILEC,LFN,FWA,LEN
LFN       VFD    42/0L_LFN,18/1
          VFD    42/0,18/FWA
          VFD    42/0,18/FWA
          VFD    42/0,18/FWA
          VFD    42/0,18/FWA+LEN
          ENDM
FILEB     OPSYN  FILEC
`)}
${ul([
  `Word 0: file name (7 characters at most, left-justified, zero filled) and code 1 (complete). FIRST = IN = OUT = fwa; LIMIT = fwa + len.`,
  `Only ${c('OUTPUT')} (printer) and ${c('INPUT')} (card reader) are connected to devices.`,
  `The buffer itself must be reserved by the program (${c('BSS')}).`,
  `Registers: none (data only). Requests: none.`,
])}
${ex(`
OUTPUT    FILEC  OBUF,101B
INPUT     FILEB  IBUF,101B
OBUF      BSS    101B
IBUF      BSS    101B
`)}
`,
};

const cio = {
  id: 'sys-cio',
  title: 'CIO. - input/output request',
  keys: ['CIO.'],
  syntax: ['          CIO.   fet,code[,r]'],
  html: `
${p(`Issues an input/output request with function ${c('code')} on the file whose FET is at ${c('fet')}. READ, WRITE,
WRITER, WRITEF and REWIND are built on CIO.; the name ends with a period.`)}
${src(`
CIO.      MACRO  F,CODE,RCL
          SX2    F
          SX7    CODE
          RJ     CIO=
          AUTO   COMCCIO
          ENDM
`)}
${ul([
  `X2 = FET address, X7 = function code; ${c('CIO=')} stores the code in word 0 of the FET (status cleared) and issues the request ${c('CIO')} with P1 = FET address.`,
  `The request is complete on return: bit 0 of the code is set (status 011B, 021B or 031B for a READ on INPUT).`,
  `${c('r')} is accepted and ignored (every request is completed before the return).`,
  `Registers changed: ${CIO_REGS}. Deck: ${see('sys-comccio', 'COMCCIO')} (and COMCSYS).`,
])}
${ex(`
          CIO.   OUTPUT,24B  SAME AS WRITER OUTPUT
          ENDRUN
OUTPUT    FILEC  BUF,10B
BUF       BSS    10B
`)}
`,
};

function ioEntry(id, name, code, html) {
  return {
    id, title: `${name} - ${html.title}`, keys: [name], syntax: [`          ${name.padEnd(6)} fet[,r]`],
    html: `
${p(html.text)}
${src(`
${name.padEnd(9)} MACRO  F,RCL
          CIO.   F,${code}
          ENDM
`)}
${p(`Request ${c('CIO')} with function code ${c(code)}. ${c('r')} is accepted and ignored. Registers changed: ${CIO_REGS}.
Deck: ${see('sys-comccio', 'COMCCIO')} (included automatically). See ${see('sys-cio', 'CIO.')}.`)}
${ex(`
          ${name.padEnd(6)} ${html.file}
          ENDRUN
${html.file.padEnd(9)} FILEC  BUF,101B
BUF       BSS    101B
`)}
`,
  };
}

const read = ioEntry('sys-read', 'READ', '10B', {
  title: 'read', file: 'INPUT',
  text: `Reads the next card of the 405 reader into the buffer of file INPUT: the 80 columns are converted from Hollerith to
display code and stored at IN as one coded line; IN is advanced. Status in word 0: 011B card read, 021B end of record
(7/8/9 card), 031B end of file (6/7/8/9 card or empty reader). On other files, READ is only marked complete.
${see('sys-readc', 'READC')} uses READ to read lines.`,
});
const write = ioEntry('sys-write', 'WRITE', '14B', {
  title: 'write', file: 'OUTPUT',
  text: `Empties the buffer of file OUTPUT: the coded lines between OUT and IN are printed on the 1612 printer and OUT is set to
IN. ${see('sys-writec', 'WRITEC')} issues WRITE itself when the buffer is full.`,
});
const writer = ioEntry('sys-writer', 'WRITER', '24B', {
  title: 'write end of record', file: 'OUTPUT',
  text: `Same as WRITE, marking the end of a record. Issue WRITER after the last WRITEC so that the remaining lines are printed.`,
});
const writef = ioEntry('sys-writef', 'WRITEF', '34B', {
  title: 'write end of file', file: 'OUTPUT',
  text: `Same as WRITE, marking the end of the file.`,
});
const rewind = ioEntry('sys-rewind', 'REWIND', '50B', {
  title: 'rewind', file: 'OUTPUT',
  text: `Rewinds the file. On OUTPUT, the buffer contents (if any) are printed, as for any function on that file; on INPUT and
other files, the request is only marked complete.`,
});

const writec = {
  id: 'sys-writec',
  title: 'WRITEC - write a coded line',
  keys: ['WRITEC'],
  syntax: ['          WRITEC fet,buf'],
  html: `
${p(`Copies the coded line at ${c('buf')} into the circular buffer of the file. The line ends with the first word whose bits
11-0 are zero (included). When the buffer becomes full, WRITEC issues a WRITE (14B) to empty it; otherwise the lines stay
in the buffer until the next WRITE, WRITER or WRITEF.`)}
${src(`
WRITEC    MACRO  F,BUF
          SX2    F
          SB6    BUF
          RJ     WTC=
          AUTO   COMCWTC
          ENDM
`)}
${ul([
  `On exit: X2 = FET address, B6 = address following the line.`,
  `Registers changed: X0-X4, X6, X7, A1-A4, A6, B3-B6.`,
  `Requests: CIO (only when the buffer is full). Deck: ${see('sys-comcwtc', 'COMCWTC')} (with COMCCIO and COMCSYS).`,
])}
${ex(`
          WRITEC OUTPUT,LINE
          WRITER OUTPUT
          ENDRUN
LINE      DIS    ,*1TITLE ON A NEW PAGE*
OUTPUT    FILEC  BUF,101B
BUF       BSS    101B
`)}
`,
};

const readc = {
  id: 'sys-readc',
  title: 'READC - read a coded line',
  keys: ['READC'],
  syntax: ['          READC  fet,buf,n'],
  html: `
${p(`Reads the next coded line of the file into ${c('buf')} (at most ${c('n')} words). When the buffer is empty, READC
issues a READ (10B); at the end of a record or file, it returns -1.`)}
${src(`
READC     MACRO  F,BUF,N
          SX2    F
          SB6    BUF
          SB7    N
          RJ     RDC=
          AUTO   COMCRDC
          ENDM
`)}
${ul([
  `On exit: X1 = 0 if a line was read, -1 at end of record or end of file (the FET code is then reset to 011B so that a later READ continues).`,
  `Words beyond n are read and discarded. The line in buf ends with its zero-byte word (if n allows it).`,
  `Registers changed: X0-X7, A1-A6, B3-B7.`,
  `Requests: CIO (READ). Deck: ${see('sys-comcrdc', 'COMCRDC')} (with COMCCIO and COMCSYS).`,
])}
${ex(`
LOOP      READC  INPUT,CARD,9
          NZ     X1,DONE     END OF DATA
          WRITEC OUTPUT,CARD
          EQ     LOOP
DONE      WRITER OUTPUT
          ENDRUN
CARD      BSS    9
INPUT     FILEC  IBUF,101B
OUTPUT    FILEC  OBUF,101B
IBUF      BSS    101B
OBUF      BSS    101B
`)}
`,
};

const cdd = {
  id: 'sys-cdd',
  title: 'CDD - convert to decimal display code',
  keys: ['CDD'],
  syntax: ['          CDD'],
  html: `
${p(`Converts the positive integer in X1 (fewer than 10 digits) to decimal display code, without leading zeros.`)}
${src(`
CDD       MACRO
          RJ     CDD=
          AUTO   COMCCDD
          ENDM
`)}
${T([
  ['X1', 'input', 'positive integer'],
  ['X6', 'output', 'digits right-justified, blank filled on the left'],
  ['X4', 'output', 'digits left-justified, blank filled on the right'],
  ['B2', 'output', '6 × number of digits'],
], ['Register', 'Use', 'Content'])}
${p(`Registers changed: X1-X7, A2, A4, B2, B7. Requests: none. Deck: ${see('sys-comccdd', 'COMCCDD')}, which also defines
the symbol ${c('CDD')} = ${c('CDD=')}.`)}
${ex(`
          SX1    1985
          CDD
          SA6    TEXT        '      1985'
          ENDRUN
TEXT      CON    0
`)}
`,
};

const cod = {
  id: 'sys-cod',
  title: 'COD - convert to octal display code',
  keys: ['COD'],
  syntax: ['          COD'],
  html: `
${p(`Converts the low 30 bits of X1 to 10 octal digits in display code, leading zeros included.`)}
${src(`
COD       MACRO
          RJ     COD=
          AUTO   COMCCOD
          ENDM
`)}
${T([
  ['X1', 'input', 'value (bits 29-0 converted)'],
  ['X6', 'output', '10 octal digits'],
], ['Register', 'Use', 'Content'])}
${p(`Registers changed: X1, X5, X6, X7, B2 (the deck header also lists X2). Requests: none. Deck:
${see('sys-comccod', 'COMCCOD')}, which also defines the symbol ${c('COD')} = ${c('COD=')}.`)}
${ex(`
          SX1    777B
          COD
          SA6    TEXT        '0000000777'
          ENDRUN
TEXT      CON    0
`)}
`,
};

function deck(id, name, html, example) {
  return { id, title: `${name} - common deck`, keys: [name], syntax: [`          XTEXT  ${name}`], html: `${html}\n${ex(example)}` };
}

const comcsys = deck('sys-comcsys', 'COMCSYS', `
${p(`Entry ${c('SYS=')}: issues the monitor request in X1.`)}
${ul([
  `Waits until RA+1 is zero, stores X1 in RA+1, then waits until the monitor clears RA+1 (request complete).`,
  `Input: X1 = request word. Registers changed: X2, X6, A2, A6.`,
  `Defines the micro ${c('COMCSYS$')}. Used by ${see('sys-system', 'SYSTEM')} and all request macros, and by COMCCIO.`,
])}
${src(`
SYS=      PS                 ENTRY / EXIT
SYS1      SA2    1
          NZ     X2,SYS1     RA+1 BUSY
          BX6    X1
          SA6    A2
SYS2      SA2    A2
          NZ     X2,SYS2     WAIT FOR COMPLETION
          EQ     SYS=
`)}`, `
          XTEXT  COMCSYS
          SA1    REQ
          RJ     SYS=
REQ       VFD    18/0LEND,42/0
`);

const comccio = deck('sys-comccio', 'COMCCIO', `
${p(`Entry ${c('CIO=')}: input/output request.`)}
${ul([
  `Input: X2 = FET address, X7 = function code (10B READ, 14B WRITE, 24B WRITER, 34B WRITEF, 50B REWIND).`,
  `Replaces bits 17-0 of FET word 0 by the code (status cleared), then issues the request ${c('18/3LCIO,42/fet')} through SYS=.`,
  `On exit, word 0 holds the code + 1 (complete), or the READ status 011B, 021B, 031B.`,
  `Registers changed: ${CIO_REGS} (X2 is not preserved).`,
  `Defines the micro ${c('COMCCIO$')}; includes COMCSYS if it is absent. Used by ${see('sys-cio', 'CIO.')} and its derivatives, COMCWTC and COMCRDC.`,
])}`, `
          XTEXT  COMCCIO
          SX2    OUTPUT
          SX7    24B
          RJ     CIO=
OUTPUT    FILEC  BUF,10B
BUF       BSS    10B
`);

const comcwtc = deck('sys-comcwtc', 'COMCWTC', `
${p(`Entry ${c('WTC=')}: writes a coded line into the circular buffer.`)}
${ul([
  `Input: X2 = FET address, B6 = address of the line (10 characters per word, last word ending with 12 zero bits).`,
  `Copies the words at IN, wrapping from LIMIT to FIRST, and updates IN; when IN reaches OUT (buffer full), issues a WRITE (14B) through CIO=.`,
  `On exit: X2 = FET address, B6 = address following the line.`,
  `Registers changed (deck header): X0-X7, A1-A7, B3-B6; in practice X0-X4, X6, X7, A1-A4, A6, B3-B6.`,
  `Defines the micro ${c('COMCWTC$')}; includes COMCCIO if it is absent. Used by ${see('sys-writec', 'WRITEC')}.`,
])}`, `
          XTEXT  COMCWTC
          SX2    OUTPUT
          SB6    LINE
          RJ     WTC=
LINE      DIS    ,* LINE*
OUTPUT    FILEC  BUF,10B
BUF       BSS    10B
`);

const comcrdc = deck('sys-comcrdc', 'COMCRDC', `
${p(`Entry ${c('RDC=')}: reads a coded line from the circular buffer.`)}
${ul([
  `Input: X2 = FET address, B6 = receiving area, B7 = maximum number of words.`,
  `When the buffer is empty (IN = OUT): if the FET status shows an end of record or end of file, resets the code to 011B and returns X1 = -1; otherwise issues a READ (10B) and tries again.`,
  `Otherwise copies words from OUT (wrapping from LIMIT to FIRST) to the area, at most B7 words, up to the word ending with a zero byte, and updates OUT; returns X1 = 0.`,
  `Registers changed (deck header): X0-X7, A1-A7, B3-B7; in practice A7 is not used.`,
  `Defines the micro ${c('COMCRDC$')}; includes COMCCIO if it is absent. Used by ${see('sys-readc', 'READC')}.`,
])}`, `
          XTEXT  COMCRDC
          SX2    INPUT
          SB6    CARD
          SB7    9
          RJ     RDC=
CARD      BSS    9
INPUT     FILEC  BUF,101B
BUF       BSS    101B
`);

const comccdd = deck('sys-comccdd', 'COMCCDD', `
${p(`Entry ${c('CDD=')}: converts a positive integer to decimal display code.`)}
${ul([
  `Input: X1 = positive integer (fewer than 10 digits). Output: X6 = digits right-justified, blank filled; X4 = digits left-justified, blank filled; B2 = 6 × number of digits.`,
  `Divides by 10 in floating point (constant 10.0) to extract the digits from right to left.`,
  `Registers changed: X1-X7, A2, A4, B2, B7 (the header lists X1-X7, B2, B3, B7).`,
  `Defines the micro ${c('COMCCDD$')} and the symbol ${c('CDD')} = ${c('CDD=')}. Used by ${see('sys-cdd', 'CDD')}.`,
])}`, `
          XTEXT  COMCCDD
          SX1    42
          RJ     CDD=
          SA6    TEXT
TEXT      CON    0
`);

const comccod = deck('sys-comccod', 'COMCCOD', `
${p(`Entry ${c('COD=')}: converts a value to octal display code.`)}
${ul([
  `Input: X1 = value; bits 29-0 are converted. Output: X6 = 10 octal digits (leading zeros included).`,
  `Registers changed: X1, X5, X6, X7, B2 (the header also lists X2).`,
  `Defines the micro ${c('COMCCOD$')} and the symbol ${c('COD')} = ${c('COD=')}. Used by ${see('sys-cod', 'COD')}.`,
])}`, `
          XTEXT  COMCCOD
          SX1    1234B
          RJ     COD=
          SA6    TEXT
TEXT      CON    0
`);

export const CHAPTERS = [{
  id: 'sys-ch-text',
  title: 'SYSTEXT system text',
  intro: p(`Macros of the default system text and common decks of the mini operating system: monitor requests through RA+1,
files and conversions. See ${see('sys-intro', 'SYSTEXT')} for the conventions.`),
  entries: [intro, auto, subr, syscom, system, message, endrun, abort, recall, time, clock, date, memory,
    filec, cio, read, write, writer, writef, rewind, writec, readc, cdd, cod,
    comcsys, comccio, comcwtc, comcrdc, comccdd, comccod],
}];
