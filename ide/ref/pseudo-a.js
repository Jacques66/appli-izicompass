// COMPASS 3 reference: pseudo instructions, part A (manual sections 4.1 to 4.8).
// Subprogram identification, binary control, mode control, block counter
// control, symbol definition, subprogram linkage, data generation.
// Each entry describes the actual behavior of the project assembler
// (src/asm/pseudos.js, assembler.js); deviations from the manual are flagged.

import { c, src, ex, T, see, note, ul, h4 } from './fmt.js';

const p = (s) => `<p>${s}</p>`;
const deviation = (s) => note(`<strong>Deviation from the manual.</strong> ${s}`);

// =====================================================================
// Overview
// =====================================================================

const vueA = {
  id: 'ps-overview',
  title: 'Classification and legality of pseudo instructions',
  keys: [],
  syntax: ['[location]  operation  [variable]  [comments]'],
  html: [
    p(`A pseudo instruction has the same format as a machine instruction (${see('lang-format', 'statement format')}): location field, operation field, variable field and comments field. It does not generate a machine instruction directly; it controls the assembler at assembly time (subprogram identification, binary type, block selection, symbol definition, data generation, and so on).`),
    p(`When the variable field is blank, text that begins at or after the comments column (column 30 by default, see ${see('ps-col', 'COL')}) is a comment; text placed before that column would be read as the variable field.`),
    h4('Classes (manual 4.1.1)'),
    T([
      ['Subprogram identification', `${see('ps-ident', 'IDENT')}, ${see('ps-end', 'END')}`],
      ['Binary control', `${see('ps-abs', 'ABS')}, ${see('ps-machine', 'MACHINE')}, ${see('ps-ppu', 'PPU')}, ${see('ps-periph', 'PERIPH')}, ${see('ps-cippu', 'CIPPU')}, ${see('ps-ident', 'IDENT')} (overlays), ${see('ps-segment', 'SEGMENT')}, ${see('ps-seg', 'SEG')}, ${see('ps-stext', 'STEXT')}, ${see('ps-comment', 'COMMENT')}, ${see('ps-nolabel', 'NOLABEL')}, ${see('ps-lcc', 'LCC')}, ${see('ps-memsel', 'MEMSEL')}, ${see('ps-ldset', 'LDSET')}`],
      ['Mode control', `${see('ps-base', 'BASE')}, ${see('ps-char', 'CHAR')}, ${see('ps-code', 'CODE')}, ${see('ps-qual', 'QUAL')}, ${see('ps-b1', 'B1=1 and B7=1')}, ${see('ps-col', 'COL')}`],
      ['Block counter control', `${see('ps-use', 'USE')}, ${see('ps-uselcm', 'USELCM')}, ${see('ps-org', 'ORG and ORGC')}, ${see('ps-bss', 'BSS')}, ${see('ps-loc', 'LOC')}, ${see('ps-pos', 'POS')}`],
      ['Symbol definition', `${see('ps-equ', 'EQU and =')}, ${see('ps-set', 'SET')}, ${see('ps-max', 'MAX')}, ${see('ps-min', 'MIN')}, ${see('ps-miccnt', 'MICCNT')}, ${see('ps-sst', 'SST')}`],
      ['Subprogram linkage', `${see('ps-entry', 'ENTRY and ENTRYC')}, ${see('ps-ext', 'EXT')}`],
      ['Data generation', `${see('ps-bssz', 'BSSZ and blank operation field')}, ${see('ps-data', 'DATA')}, ${see('ps-dis', 'DIS')}, ${see('ps-lit', 'LIT')}, ${see('ps-vfd', 'VFD')}, ${see('ps-con', 'CON')}, ${see('ps-r', 'R=')}, ${see('ps-rep', 'REP, REPC, REPI')}`],
    ], ['Class', 'Pseudo instructions']),
    p(`The other pseudo instructions (conditional assembly, error and listing control, macros, micros, duplication) are described in the second part: for example ${see('ps-if', 'IF')}, ${see('ps-err', 'ERR')}, ${see('ps-list', 'LIST')}, ${see('ps-macro', 'MACRO')}, ${see('ps-micro', 'MICRO')}, ${see('ps-dup', 'DUP')}. Only ${c('IDENT')} (first statement) and ${c('END')} (last statement) are required.`),
    h4('First statement group'),
    p(`${c('IDENT')} must be the first statement of a subprogram. The <em>first statement group</em> follows it immediately; it must precede any symbol definition, storage allocation or code generation. Pseudo instructions fall into three categories:`),
    ul([
      `<strong>First statement group only</strong>: ${c('ABS')}, ${c('MACHINE')}, ${c('PERIPH')}, ${c('PPU')}, ${c('CIPPU')}, ${c('STEXT')}, ${c('MEMSEL')}. Found after the first statement group has ended, one of these instructions is flagged <strong>O</strong> (instruction out of sequence) and is not executed.`,
      `<strong>Permitted anywhere</strong>, including within the first statement group, without terminating it: ${c('BASE')}, ${c('B1=1')}, ${c('B7=1')}, ${c('CHAR')}, ${c('CODE')}, ${c('COMMENT')}, ${c('CPOP')}, ${c('CPSYN')}, ${c('DECMIC')}, ${c('EJECT')}, ${c('ELSE')}, ${c('END')}, ${c('ENDD')}, ${c('ENDIF')}, ${c('ENDM')}, ${c('HERE')}, ${c('IFC')}, ${c('IRP')}, ${c('LDSET')}, ${c('LIST')}, ${c('MACRO')}, ${c('MACROE')}, ${c('MICCNT')}, ${c('MICRO')}, ${c('NIL')}, ${c('NOLABEL')}, ${c('NOREF')}, ${c('OCTMIC')}, ${c('OPDEF')}, ${c('OPSYN')}, ${c('PPOP')}, ${c('PURGDEF')}, ${c('PURGMAC')}, ${c('QUAL')}, ${c('RMT')}, ${c('SKIP')}, ${c('SPACE')}, ${c('SST')}, ${c('TITLE')}, ${c('TTL')}, ${c('XREF')}; this assembler adds ${c('CTEXT')}, ${c('ENDX')} and ${c('XTEXT')}. Comment lines and blank lines do not terminate the group either.`,
      `<strong>All others</strong> (CPU or PP machine instructions, and pseudo instructions absent from both lists, for example ${c('COL')}, ${c('EQU')}, ${c('SET')}, ${c('MAX')}, ${c('USE')}, ${c('ORG')}, ${c('BSS')}, ${c('DATA')}, ${c('LCC')}, ${c('IF')}, ${c('DUP')}): their first occurrence terminates the first statement group. A macro call does not terminate it by itself; the statements produced by the expansion are what count.`,
    ]),
    ex(`
          IDENT  GROUP
          BASE   O               PERMITTED ANYWHERE
          MACHINE 6              FIRST GROUP
          QUAL   Q               PERMITTED ANYWHERE
          SX6    1               ENDS THE FIRST GROUP
          ABS                    TOO LATE - O FLAG
          END
`, { errors: ['O'] }),
    note(`${c('COL')} is not in the list of instructions permitted anywhere: a ${c('COL')} placed before ${c('ABS')} or ${c('PERIPH')} makes them illegal (O flag).`),
    h4('Assembly types'),
    T([
      ['CPU relocatable', 'default', '60 bits', '60', `${see('lang-relocatable', 'relocatable program')}`],
      ['CPU absolute', c('ABS'), '60 bits', '60', `${see('lang-absolute', 'absolute program')}`],
      ['7600 PP (PPU)', c('PPU'), '12 bits', '12', 'always absolute'],
      ['6000 / 170 / 180 PP', c('PERIPH'), '12 bits', '12', 'always absolute'],
      ['CYBER 180 16-bit PP', c('CIPPU'), '16 bits', '16', 'always absolute'],
    ], ['Type', 'Declared by', 'Word', 'Initial position counter', 'Remark']),
    p(`A PP program is always absolute; no forcing upper occurs in a PP assembly (${see('lang-force', 'force upper')}). ${c('PERIPH')}, ${c('PPU')} or ${c('CIPPU')} prevails over ${c('ABS')}, in either order.`),
    h4('Legality matrix'),
    p(`The following table summarizes, for each pseudo instruction of this part, the assembly types in which this assembler accepts it: "x" legal, "O" rejected with the O flag, "1" first statement group only, "*" permitted anywhere (including the first statement group).`),
    T([
      ['IDENT (first)', 'x', 'x', 'x', 'x', 'x', 'first statement'],
      ['IDENT (subsequent, nonblank)', 'O', 'x', 'x', 'x', 'x', 'new overlay'],
      ['IDENT (subsequent, blank)', 'O', 'x', 'x', 'x', 'x', 'partial section'],
      ['END', '*', '*', '*', '*', '*', 'last statement'],
      ['ABS', '1', '1', '1', '1', '1', 'no effect in PP'],
      ['MACHINE, STEXT, MEMSEL', '1', '1', '1', '1', '1', ''],
      ['PPU, PERIPH, CIPPU', '1', '1', '1', '1', '1', 'declare a PP program'],
      ['SEGMENT', 'x', 'x', 'x', 'x', 'x', 'no overlay in relocatable'],
      ['SEG', 'O', 'x', 'O', 'O', 'O', ''],
      ['COMMENT', '*', '*', '*', '*', '*', ''],
      ['NOLABEL', 'O', '*', '*', '*', '*', ''],
      ['LCC', 'x', 'O', 'O', 'O', 'O', ''],
      ['LDSET', '*', 'O', 'O', 'O', 'O', ''],
      ['BASE, CHAR, CODE, QUAL', '*', '*', '*', '*', '*', ''],
      ['B1=1, B7=1', '*', '*', 'O', 'O', 'O', ''],
      ['COL', 'x', 'x', 'x', 'x', 'x', 'ends the first statement group'],
      ['USE, ORG, ORGC, BSS, LOC, POS', 'x', 'x', 'x', 'x', 'x', ''],
      ['USELCM', 'x', 'x', 'O', 'O', 'O', ''],
      ['EQU, =, SET, MAX, MIN', 'x', 'x', 'x', 'x', 'x', ''],
      ['MICCNT, SST', '*', '*', '*', '*', '*', ''],
      ['ENTRY, ENTRYC', 'x', 'x', 'O', 'O', 'O', '5100B table in absolute'],
      ['EXT', 'x', 'O', 'O', 'O', 'O', ''],
      ['BSSZ, DATA, DIS, LIT, VFD, CON', 'x', 'x', 'x', 'x', 'x', 'no data in blank common'],
      ['R=', 'x', 'x', 'O', 'O', 'O', ''],
      ['REP, REPC, REPI', 'x', 'O', 'O', 'O', 'O', ''],
    ], ['Pseudo instruction', 'CPU relocatable', 'CPU absolute', 'PPU', 'PERIPH', 'CIPPU', 'Remark']),
    deviation(`The manual declares ${c('SEGMENT')} illegal in a 7600 PPU assembly and restricts ${c('MEMSEL')} to ${c('CIPPU')} programs; this assembler accepts both without a diagnostic. The manual does not state whether a blank IDENT exists in PP assemblies; here it is accepted as in a CPU absolute assembly.`),
    h4('Listing of pseudo instructions'),
    p(`A listing line contains, from left to right: the error flags (columns 1 to 3), the ${c('L')} mark when the location counter differs from the origin counter (column 4), the octal address (columns 5 to 10), the octal code (20 digits for a CPU word), the relocation indicator (${c('+')}, ${c('-')}, ${c('C')} common, ${c('X')} external), then the source image from column 41 on (${see('lang-listing', 'listing')}). For a pseudo instruction that generates no code, the relevant value (value of a symbol defined by ${c('EQU')}, word count of ${c('BSS')}, old and new mode of ${c('BASE')}, and so on) is right-justified in the code column.`),
    src(`
                             17         AA        EQU    15
         0                  144         ZONE      BSS    100
                            D>O                   BASE   O
`),
    deviation(`The manual places these values in the address field and separates the old and new modes with an arrow; here they are right-justified in the code column and the separator is ${c('>')}.`),
    h4('Pseudo instructions of this part'),
    T([
      ['IDENT', see('ps-ident', 'identification, overlays')], ['END', see('ps-end', 'end of subprogram')],
      ['ABS', see('ps-abs', 'CPU absolute program')], ['MACHINE', see('ps-machine', 'object processor type')],
      ['PPU', see('ps-ppu', '7600 PPU program')], ['PERIPH', see('ps-periph', '12-bit PP program')],
      ['CIPPU', see('ps-cippu', '16-bit PP program')], ['SEGMENT', see('ps-segment', 'binary segment')],
      ['SEG', see('ps-seg', 'partial binary')], ['STEXT', see('ps-stext', 'system text')],
      ['COMMENT', see('ps-comment', 'prefix table comment')], ['NOLABEL', see('ps-nolabel', 'header table deletion')],
      ['LCC', see('ps-lcc', 'loader directive')], ['MEMSEL', see('ps-memsel', 'PP memory size')],
      ['LDSET', see('ps-ldset', 'LDSET directives')], ['BASE', see('ps-base', 'numeric base')],
      ['CHAR', see('ps-char', '"other" code')], ['CODE', see('ps-code', 'character code')],
      ['QUAL', see('ps-qual', 'symbol qualification')], ['B1=1, B7=1', see('ps-b1', 'B register equal to one')],
      ['COL', see('ps-col', 'comments column')], ['USE', see('ps-use', 'block selection')],
      ['USELCM', see('ps-uselcm', 'ECS/LCM block')], ['ORG, ORGC', see('ps-org', 'origin counter')],
      ['BSS', see('ps-bss', 'storage reservation')], ['LOC', see('ps-loc', 'location counter')],
      ['POS', see('ps-pos', 'position counter')], ['EQU, =', see('ps-equ', 'permanent definition')],
      ['SET', see('ps-set', 'redefinable definition')], ['MAX', see('ps-max', 'maximum')],
      ['MIN', see('ps-min', 'minimum')], ['MICCNT', see('ps-miccnt', 'micro length')],
      ['SST', see('ps-sst', 'system symbols')], ['ENTRY, ENTRYC', see('ps-entry', 'entry points')],
      ['EXT', see('ps-ext', 'external symbols')], ['BSSZ', see('ps-bssz', 'zeroed words')],
      ['DATA', see('ps-data', 'data words')], ['DIS', see('ps-dis', 'character strings')],
      ['LIT', see('ps-lit', 'literals')], ['VFD', see('ps-vfd', 'variable field definition')],
      ['CON', see('ps-con', 'constants')], ['R=', see('ps-r', 'conditional increment')],
      ['REP, REPC, REPI', see('ps-rep', 'replication tables')],
    ].reduce((rows, x, i, a) => (i % 2 ? rows : rows.concat([[x[0], x[1], (a[i + 1] || ['', ''])[0], (a[i + 1] || ['', ''])[1]]])), []),
    ['Operation', 'Entry', 'Operation', 'Entry']),
  ].join('\n'),
};

// =====================================================================
// Subprogram identification
// =====================================================================

const ident = {
  id: 'ps-ident',
  title: 'IDENT — subprogram identification and overlays',
  keys: ['IDENT'],
  syntax: [
    '          IDENT  name                        CPU relocatable',
    '          IDENT  name,origin,entry,l1,l2     CPU absolute',
    '          IDENT  name,origin,entry,ppu       7600 PP (PPU)',
    '          IDENT  name,origin                 6000 PP (PERIPH, CIPPU)',
    '          IDENT                              subsequent blank IDENT: partial section',
  ],
  html: [
    h4('Purpose'),
    p(`${c('IDENT')} is the first statement of every subprogram. Lines preceding it, and lines between an ${c('END')} and the next ${c('IDENT')}, are treated as comments; an ${c('END')} found outside a subprogram is diagnosed (IDENT STATEMENT MISSING, O flag). One source file may contain several successive ${c('IDENT')} … ${c('END')} subprograms, assembled independently (${see('lang-program', 'program structure')}).`),
    p(`In a CPU absolute or PP program, subsequent ${c('IDENT')} statements divide the program into overlays (nonblank IDENT) or partial sections (blank IDENT). In a relocatable program, a second ${c('IDENT')} before ${c('END')} is an error (<strong>O</strong> flag) and is ignored.`),
    h4('Fields'),
    ul([
      `<strong>Location field</strong>: ignored, without a diagnostic.`,
      `<strong>name</strong> (required): subprogram or overlay name. It is placed in the prefix table (7 characters at most on the CPU) and, in PP assemblies, its first three characters go into the PP header word. The manual requires 1 to 7 characters on the CPU and the PPU (first character alphabetic on the CPU), 1 to 3 for PERIPH, 1 to 4 for CIPPU, last character not a colon. A missing name is flagged <strong>A</strong>.`,
      `<strong>origin</strong> (absolute and PP; ignored for relocatable): expression giving the first word address of the overlay. It is evaluated at the end of the overlay, so it may name a symbol defined later (${c('IDENT CT,CONTROL,CONTROL')}). The origin does <em>not</em> set the origin counter: it does not replace ${see('ps-org', 'ORG')}. Omitted origin: address of the first word generated (0 if none).`,
      `<strong>entry</strong> (CPU absolute and PPU): transfer address of the overlay. In a CPU absolute program this is the transfer address used (the ${c('END')} symbol is ignored). Omitted: the origin.`,
      `<strong>l1, l2</strong> (CPU absolute): primary and secondary overlay level numbers, 0 to 77B (the value is reduced to 6 bits). On the first ${c('IDENT')}, which precedes any ${c('BASE')}, these numbers are read as <strong>decimal</strong> unless suffixed ${c('B')}; on subsequent ${c('IDENT')} statements they follow the base in effect (${c('BASE M')} or ${c('BASE O')}: octal). Defaults: 0,0 for the first overlay, 1,0 for subsequent ones.`,
      `<strong>ppu</strong> (7600 PPU): number of the PPU on which the program is loaded. It is accepted but not carried into the binary.`,
    ]),
    p(`If the subprogram contains no ${c('TITLE')}, the ${c('IDENT')} variable field is used as the listing page title (${see('ps-title', 'TITLE')}).`),
    ex(`
CT        IDENT  CT,CONTROL,CONTROL
          ABS                    ABSOLUTE CPU PROGRAM
          ORG    110B
CONTROL   SX6    1               ENTRY POINT
          END
`),
    p(`The location-field symbol ${c('CT')} is not defined. The absolute program ${c('CT')} has origin and entry ${c('CONTROL')} = 110B; its 5000B overlay table contains levels 0,0, origin 110B and entry 110B.`),
    h4('Subsequent nonblank IDENT: new overlay'),
    p(`In an absolute or PP program, a nonblank ${c('IDENT')} ends the current overlay and starts another:`),
    ul([
      `the current word is completed (force upper);`,
      `the current block group is completed: its pass two is executed, each block is assigned its address, the literals are stored; then the USE table and all counters are reinitialized, so the next overlay may reuse the same block names and has its own literals block;`,
      `the symbol table is <em>not</em> cleared: every symbol receives its final absolute address, which lets one overlay refer to another and, through ${c('ORG sym')}, restart the absolute block at the address of a symbol of an earlier overlay;`,
      `the image of the previous overlay (from its origin to the maximum value of the origin counter) forms one binary section; the next overlay receives its own 7700B prefix table and its 5000B overlay table (5100B if ${see('ps-entry', 'ENTRY')} is used), or its PP header word.`,
    ]),
    ex(`
          IDENT  OV,200B,GO
          ABS
          ORG    200B
GO        SX6    1
          IDENT  OV1,300B,GO1    LEVELS 1,0 BY DEFAULT
          ORG    300B
GO1       SX6    2
          IDENT  OV2,400B,GO2,2,3
          ORG    400B
GO2       SX6    3
          END
`),
    p(`The listing shows one ${c('PROGRAM*')} block per overlay; the overlay tables carry levels 0,0, 1,0 and 2,3.`),
    src(`
                                                  IDENT  OV,200B,GO
                                                  ABS
                                                  ORG    200B
       200 7160000001                   GO        SX6    1
                                                  IDENT  OV1,300B,GO1
                                                  ORG    300B
       300 7160000002                   GO1       SX6    2
`),
    p(`An overlay may start anywhere, including within the area of a previous overlay, since all block sizes are known. Data must be generated only at or above the overlay origin.`),
    deviation(`Words generated below the declared origin of an overlay are simply omitted from its image, without an R flag. The partial word completed by a subsequent IDENT is filled with zeros, not with 46000B no-operation instructions. The prefix table of every overlay carries the name of the first IDENT. The name is checked only for presence (not for length or first character).`),
    h4('Subsequent blank IDENT: partial section'),
    p(`A ${c('IDENT')} with a blank variable field, after the first one, completes the block group as an overlay IDENT does (pass two, symbols converted to absolute addresses, USE table and counters reinitialized, block names reusable), but without a new name: the following section is a continuation of the same program. Blocks other than the absolute block of the new section are placed after the last address of the previous section.`),
    ex(`
          IDENT  WV,100B,ENT
          ABS
          ORG    100B
ENT       SX6    1
          IDENT
          ORG    101B
          SX6    2
          END
`),
    deviation(`According to the manual, a blank IDENT writes a partial section without an end-of-section and without a new 7700B table, and the new absolute block starts at the word following the section written; writing into an already written section is a range error (R). Here the absolute block of the new section restarts at address 0 (hence the ${c('ORG 101B')} in the example), no range error is detected, and each section produces a separate binary record with its own prefix table and an overlay table with levels 1,0.`),
    h4('Errors'),
    T([
      ['A', 'name missing (blank first IDENT)'],
      ['O', 'second IDENT in a relocatable program (ignored)'],
    ], ['Flag', 'Cause']),
    ex(`
          IDENT  PROG1
          IDENT  PROG2           ILLEGAL IN RELOCATABLE
          END
`, { errors: ['O'] }),
    p(`See also: ${see('ps-end', 'END')}, ${see('ps-segment', 'SEGMENT')}, ${see('ps-seg', 'SEG')}, ${see('lang-overlays', 'absolute overlays')}, ${see('lang-partial-binary', 'partial binary')}, ${see('lang-blocks', 'blocks')}.`),
  ].join('\n'),
};

const end = {
  id: 'ps-end',
  title: 'END — end of subprogram',
  keys: ['END'],
  syntax: ['[sym]     END    [trasym]'],
  html: [
    h4('Purpose'),
    p(`${c('END')} is the last statement of every subprogram. It:`),
    ul([
      `first assembles any waiting remote code (unnamed ${see('ps-rmt', 'RMT')}), then processes the ${c('END')} statement itself;`,
      `terminates any conditional assembly in progress (an ${c('END')} is recognized even in skipped code);`,
      `forces upper the current word of the block in use (CPU: no-operation instructions; PP: zeros);`,
      `completes the last block group: undefined ${c('=S')} default symbols are allocated at the end of the zero block, the literals block is stored, block addresses are assigned, pass two is executed;`,
      `relocatable: combines the zero block, the literals block and the local blocks into one program block and produces the loader tables; absolute or PP: produces the memory image of the last overlay;`,
      `produces the listing and clears the symbol table before the next subprogram.`,
    ]),
    h4('Fields'),
    ul([
      `<strong>sym</strong> (optional): defined as an absolute symbol equal to the total subprogram length. Relocatable: sum of the lengths of the zero block, the literals block and the local blocks (the absolute block and common blocks are not included). Absolute: last word address + 1 of the last group.`,
      `<strong>trasym</strong> (optional): in a relocatable assembly, name of the transfer address; a subprogram with a transfer address is a main program. The name is passed as is to the loader (XFER 4600B table); it must be an entry point of one of the subprograms loaded, not necessarily this one. In a CPU absolute assembly it is ignored (the ${c('IDENT')} entry is used). In a PP assembly, this assembler uses it as the program entry address.`,
    ]),
    ex(`
          IDENT  PROG1
          ENTRY  BEGIN
BEGIN     SX6    1
          DATA   5
LONG      END    BEGIN           LONG = 2
`),
    p(`${c('LONG')} is 2 (two words in the zero block); ${c('BEGIN')} is the transfer address.`),
    p(`An ${c('END')} read from an external source (${see('ps-xtext', 'XTEXT')}) ends only the reading of that text, not the subprogram. If the end of the file is reached without ${c('END')}, the last statement is flagged <strong>O</strong> (END missing) and the subprogram is terminated as if by an ${c('END')}.`),
    ex(`
          IDENT  NOEND
          SX6    1
`, { errors: ['O'] }),
    deviation(`The ${c('trasym')} name is not checked by the assembler (the check is left to the loader).`),
    p(`See also: ${see('ps-ident', 'IDENT')}, ${see('ps-entry', 'ENTRY')}, ${see('lang-passes', 'assembly passes')}, ${see('lang-relocatable', 'relocatable program')}.`),
  ].join('\n'),
};

// =====================================================================
// Binary control
// =====================================================================

const abs = {
  id: 'ps-abs',
  title: 'ABS — absolute CPU program',
  keys: ['ABS'],
  syntax: ['          ABS'],
  html: [
    p(`${c('ABS')} declares an absolute CPU program: the binary is a memory image loaded at a fixed address, preceded by a 7700B prefix table and a 5000B overlay table (5100B if there are entry points). The location and variable fields are ignored. ${c('ABS')} is permitted only in the first statement group (<strong>O</strong> flag otherwise).`),
    p(`If ${c('PERIPH')}, ${c('PPU')} or ${c('CIPPU')} also appears in the first statement group, the program is a PP program and ${c('ABS')} has no effect, in either order.`),
    h4('Consequences'),
    ul([
      `the nominal block is the absolute block ${c('PROGRAM*')}, with origin 0: symbols are absolute;`,
      `${c('USE /name/')} and ${c('USE //')} create <em>local</em> blocks named ${c('/name/')} and ${c('//')}, in which data may be stored;`,
      `illegal (O flag): ${see('ps-ext', 'EXT')}, ${see('ps-lcc', 'LCC')}, ${see('ps-ldset', 'LDSET')}, ${see('ps-rep', 'REP, REPC, REPI')};`,
      `legal: ${see('ps-entry', 'ENTRY and ENTRYC')} (5100B table), ${see('ps-r', 'R=')}, ${see('ps-nolabel', 'NOLABEL')}, ${see('ps-seg', 'SEG')}, ${see('ps-segment', 'SEGMENT')}, overlay ${see('ps-ident', 'IDENT')} statements;`,
      `a ${c('=X')} or ${c('=Y')} default symbol (${see('lang-default-symbols', 'default symbols')}) that is not defined in the program is undefined (U flag), since there are no externals.`,
    ]),
    ex(`
          IDENT  AB,100B
          ABS
          ORG    100B
          SX6    1
          USE    /LAB/           LOCAL BLOCK /LAB/ IN ABSOLUTE
          DATA   2               DATA PERMITTED
          END
`),
    ex(`
          IDENT  P
          SX6    1
          ABS                    OUTSIDE THE FIRST GROUP
          END
`, { errors: ['O'] }),
    p(`See also: ${see('lang-absolute', 'absolute program')}, ${see('ps-ident', 'IDENT')}, ${see('ps-org', 'ORG')}.`),
  ].join('\n'),
};

const machine = {
  id: 'ps-machine',
  title: 'MACHINE — declare object processor type',
  keys: ['MACHINE'],
  syntax: ['          MACHINE type[,hfi1,…,hfi9]'],
  html: [
    p(`${c('MACHINE')} declares the processor for which the program is intended. It affects the instruction set accepted and the "target", "valid" and "hardware instruction dependencies" fields of word 7 of the 7700B prefix table; the loader then reconciles these requirements with the actual hardware. The location field is ignored. First statement group only (<strong>O</strong> flag otherwise).`),
    h4('Parameters'),
    ul([
      `<strong>type</strong>: character string without blank or comma, whose first character selects the family: ${c('6')} (CYBER 180, 170, CYBER 70 models 71 to 74, 6000 series), ${c('7')} (CYBER 70/76, 7600), ${c('8')} (CYBER 180 models 8xx). If the first two characters are one of these digits followed by a digit, they form the target field (${c('MACHINE 74')}: target ${c('74')}).`,
      `<strong>hfi1 … hfi9</strong> (optional): hardware instruction dependencies. Only the first character of each is kept and placed, in order, in the dependencies field (at most 6 characters in the word). Recommended letters: ${c('C')} compare/move unit (CMU), ${c('D')} distributive data path, ${c('I')} integer multiply, ${c('L')} ECS/LCM, ${c('R')} interlock register, ${c('X')} central and monitor exchange jumps. Beyond nine, subfields are ignored; they have no effect on assembly.`,
    ]),
    T([
      ['omitted, blank, or first character other than 6, 7, 8', 'blank', 'blank', 'all CPU instructions'],
      [c('6…'), '6x if 2nd character is a digit', c('6X'), 'instructions unique to the 7600 (MJ, RI, TB, IB, RO, OB, …) rejected: O flag'],
      [c('7…'), '7x if 2nd character is a digit', c('7X'), 'all instructions'],
      [c('8…'), '8x if 2nd character is a digit', c('8X'), 'all instructions'],
    ], ['Type', 'Target', 'Valid', 'Instructions accepted (CPU)']),
    p(`Instructions unique to models 8xx (${c('CR')}, ${c('CW')}) are flagged O when a nonblank ${c('MACHINE')} of a type other than 8 has been given. In PP assemblies, the valid field is ${c('6P')} (PERIPH), ${c('7P')} (PPU) or ${c('8P')} (CIPPU), and the target remains blank.`),
    ex(`
          IDENT  P
          MACHINE 74,CMU,LCM     TARGET 74, VALID 7X, DEPENDENCIES CL
          SX6    1
          END
`),
    ex(`
          IDENT  P
          MACHINE 6
          MJ     *               UNIQUE TO THE 7600
          END
`, { errors: ['O'] }),
    deviation(`The manual states that with type 7, the instructions unique to the 6000/170/180 series (except PS) become undefined; this assembler accepts them. With type 8, the manual undefines the instructions unique to other systems; here only the 7600 instructions are rejected, and only with type 6.`),
    ex(`
          IDENT  P
LATE      EQU    1
          MACHINE 6              OUTSIDE THE FIRST GROUP
          END
`, { errors: ['O'] }),
    p(`See also: ${see('ps-iftype', 'IFCP, IFPP, …')}, ${see('cpu-formats', 'CPU instructions')}.`),
  ].join('\n'),
};

function ppIntro(flavor) {
  const bits = flavor === 'CIPPU' ? '16' : '12';
  return [
    ul([
      `the program is absolute; the nominal block is the absolute block, with origin 0, and ${c('ORG')} sets the address at which code is loaded;`,
      `the word is ${bits} bits: ${c('DATA')}, ${c('CON')}, ${c('DIS')}, ${c('VFD')}, ${c('POS')} and ${c('BSSZ')} work on ${bits}-bit words, and the position counter is ${bits} at the beginning of a word;`,
      `no forcing upper ever occurs: a partially filled word (by ${c('VFD')}) is completed with zeros before the next instruction; a ${c('+')} in the location field has an effect only on ${c('VFD')};`,
      `mnemonics are those of the PP instructions (${see('pp-formats', 'PP instructions')}); a symbol that looks like a CPU register designator (${c('A1')}, ${c('X3')}, ${c('B7')}, …) is an ordinary symbol;`,
      `floating-point constants are rejected (<strong>A</strong> flag);`,
      `the following are rejected with the <strong>O</strong> flag: ${c('ENTRY')}, ${c('ENTRYC')}, ${c('EXT')}, ${c('LCC')}, ${c('LDSET')}, ${c('REP')}, ${c('REPC')}, ${c('REPI')}, ${c('SEG')}, ${c('USELCM')}, ${c('R=')}, ${c('B1=1')}, ${c('B7=1')}, ${c('OPDEF')};`,
      `the binary of each overlay consists of the 7700B prefix table, a PP header word (3-character name, load address = origin − 5, length + 5) and the image, five PP words per 60-bit word.`,
    ]),
  ].join('\n');
}

const jOption = (op) => [
  h4('J option'),
  p(`A variable field beginning with ${c('J')} changes how the address of the short jumps ${c('UJN')}, ${c('ZJN')}, ${c('NJN')}, ${c('PJN')}, ${c('MJN')} is assembled; their relative displacement field is 6 bits (−31 to +31):`),
  ul([
    `without J: if the value v of the expression is in the range −31 to +31, it is taken itself as the displacement; otherwise the displacement v − (location counter) is computed; out of range, <strong>A</strong> flag (relative jump out of range);`,
    `with J: the displacement is always v − (location counter).`,
  ]),
  p(`The option distinguishes an absolute address that happens to lie in the range −31 to +31 from a true relative displacement.`),
  ex(`
          IDENT  PPA,1000B
          ${op.padEnd(7)}J
          ORG    1000B
TAG       PSN
          UJN    TAG             DISPLACEMENT -1 - 0376
          UJN    1002B           DISPLACEMENT 0 - 0300
          END
`),
  p(`Without the option, ${c('UJN 2')} assembles displacement 2 (${c('0302')}), and ${c('UJN 1002B')} at address 1002B also gives ${c('0300')}.`),
].join('\n');

const ppu = {
  id: 'ps-ppu',
  title: 'PPU — CYBER 70/76 or 7600 PPU program',
  keys: ['PPU'],
  syntax: ['          PPU    [J]'],
  html: [
    p(`${c('PPU')} declares an absolute program for a peripheral processor unit (PPU) of the CYBER 70/76 or 7600. The location field is ignored. First statement group only (<strong>O</strong> flag otherwise). The first ${c('IDENT')} takes the form ${c('IDENT name,origin,entry,ppu')}.`),
    ppIntro('PPU'),
    jOption('PPU'),
    ex(`
          IDENT  PPU1,1000B,GO,3
          PPU
          ORG    1000B
GO        LDN    1
          DATA   1.5             FLOATING POINT ILLEGAL IN PP
          END
`, { errors: ['A'] }),
    deviation(`The manual gives precedence to PPU when both PPU and PERIPH appear; here the last of the two declarations prevails. The PPU number of ${c('IDENT')} is not carried into the binary. ${c('SEGMENT')}, which the manual makes illegal for the PPU, is accepted.`),
    p(`See also: ${see('ps-periph', 'PERIPH')}, ${see('ps-cippu', 'CIPPU')}, ${see('pp-formats', 'PP instructions')}.`),
  ].join('\n'),
};

const periph = {
  id: 'ps-periph',
  title: 'PERIPH — 12-bit PP program (6000, CYBER 70/170/180)',
  keys: ['PERIPH'],
  syntax: ['          PERIPH [J]'],
  html: [
    p(`${c('PERIPH')} declares an absolute program for a 12-bit peripheral processor of the 6000 series, CYBER 70 (models 71 to 74), CYBER 170 and CYBER 180. It is the usual form of NOS PP programs. The location field is ignored. First statement group only (<strong>O</strong> flag otherwise). The first ${c('IDENT')} takes the form ${c('IDENT name,origin')}.`),
    ppIntro('PERIPH'),
    p(`${c('SEGMENT')} is legal in a PERIPH assembly (PP overlays).`),
    jOption('PERIPH'),
    ex(`
          IDENT  PPA,1000B
          PERIPH
          ORG    1000B
          ENTRY  X               ILLEGAL IN PP
          EXT    Y               ILLEGAL IN PP
          USELCM A               ILLEGAL IN PP
          R=     X1,1            ILLEGAL IN PP
          END
`, { errors: ['O'] }),
    ex(`
          IDENT  P,100B
          PERIPH
          ABS                    NO EFFECT - PERIPH PREVAILS
          ORG    100B
          DATA   1               ONE 12-BIT WORD - 0001
          END
`),
    p(`See also: ${see('ps-ppu', 'PPU')}, ${see('ps-cippu', 'CIPPU')}, ${see('pp-formats', 'PP instructions')}.`),
  ].join('\n'),
};

const cippu = {
  id: 'ps-cippu',
  title: 'CIPPU — CYBER 180 16-bit PP program',
  keys: ['CIPPU'],
  syntax: ['          CIPPU  [J]'],
  html: [
    p(`${c('CIPPU')} declares an absolute program for a CYBER 180 16-bit peripheral processor. It is required to use the "long" PP instruction set and to allow ${see('ps-memsel', 'MEMSEL')} greater than 4. The location field is ignored. First statement group only (<strong>O</strong> flag otherwise).`),
    ppIntro('CIPPU'),
    p(`The default character code becomes 8-bit ASCII (${c('CODE N')}) instead of display code: two 8-bit characters per 16-bit word. The default machine type is 8 (valid ${c('8P')}). The manual limits the ${c('IDENT')} name to 4 characters.`),
    jOption('CIPPU'),
    ex(`
          IDENT  PPC,1000B
          CIPPU
          ORG    1000B
          DATA   1R1             ASCII - 000061
          DIS    ,*AB*           040502, THEN A ZERO WORD
          CON    -1              177776
          END
`),
    p(`See also: ${see('ps-memsel', 'MEMSEL')}, ${see('ps-code', 'CODE')}, ${see('ps-periph', 'PERIPH')}.`),
  ].join('\n'),
};

const segment = {
  id: 'ps-segment',
  title: 'SEGMENT — generate binary segment (overlay)',
  keys: ['SEGMENT'],
  syntax: ['name      SEGMENT origin,entry,l1,l2'],
  html: [
    p(`${c('SEGMENT')} divides an absolute program (CPU or PP) into overlays without reinitializing the block structure. The first ${c('SEGMENT')} ends the main (0,0) overlay begun by ${c('IDENT')}; each later ${c('SEGMENT')} starts a new overlay; ${c('END')} ends the last one. ${c('SEGMENT')} forces upper.`),
    h4('Fields'),
    ul([
      `<strong>name</strong> (location field, required): overlay name (loader linkage symbol). Missing: <strong>L</strong> flag.`,
      `<strong>origin</strong>: expression giving the first word address of the overlay; only an address in the block in use is meaningful. It is not an ORG and may be lower than earlier origins. Omitted: value of the origin counter at the ${c('SEGMENT')}.`,
      `<strong>entry</strong> (CPU): overlay entry address; omitted, the origin.`,
      `<strong>l1, l2</strong> (CPU): levels, 0 to 77B, read in the base in effect; default 1,0.`,
    ]),
    h4('Division'),
    p(`At each ${c('SEGMENT')}, the previous overlay ends at the <em>current</em> value of the origin counter of the block in use; the new overlay extends from its origin to the next ${c('SEGMENT')} or to the end of the program. Unlike an overlay IDENT, ${c('SEGMENT')} clears neither the symbol table, nor the USE table, nor the block declarations: all blocks other than the block in use must be complete, a block of a previous overlay cannot be resumed, and each overlay must use new block names. On the CPU, the literals block must lie entirely within one overlay, in practice the one containing the end of the absolute block.`),
    ex(`
          IDENT  SAMPLE,110B,ENTA
          ABS
          ORG    110B
ENTA      SX6    1               ENTRY POINT
OVLOC     BSS    0               OVERLAY LOAD POINT
SEG1      SEGMENT OVLOC+1,ENTB
          ORG    OVLOC
          BSS    1               WORD FOR THE LOADER TABLE
ENTB      SX6    2               EXECUTION BEGINS HERE
          END
`),
    p(`The binary contains two overlays: ${c('SAMPLE')} (110B, one word, levels 0,0) and ${c('SEG1')} (origin 112B, entry 112B, levels 1,0).`),
    p(`In a relocatable program, ${c('SEGMENT')} reduces to forcing upper the current word (the manual specifies writing the pending FILL, REPL and LINK tables, which has no visible effect here).`),
    ex(`
          IDENT  S2
          SEGMENT                NAME MISSING
          SX6    1
          END
`, { errors: ['L'] }),
    p(`See also: ${see('ps-ident', 'IDENT')}, ${see('ps-seg', 'SEG')}, ${see('lang-overlays', 'absolute overlays')}.`),
  ].join('\n'),
};

const seg = {
  id: 'ps-seg',
  title: 'SEG — write partial binary',
  keys: ['SEG'],
  syntax: ['          SEG'],
  html: [
    p(`${c('SEG')} requests that the binary accumulated since the previous ${c('IDENT')}, ${c('SEGMENT')} or ${c('SEG')} be written, without an end-of-section and without a new prefix table: the program remains one section, but the assembler need not keep the complete image in memory. The location and variable fields are ignored. ${c('SEG')} forces upper. CPU absolute programs only: in relocatable and PP assemblies, <strong>O</strong> flag.`),
    p(`According to the manual, ${c('SEG')} does not change the counters and reinitializes neither the symbol table nor the USE table; afterwards, only the block in use at the ${c('SEG')} can be resumed, and resetting the origin counter into an already written portion, or storing data there, is a range error (R). A ${c('COMMENT')} after a ${c('SEG')} is ignored.`),
    ex(`
          IDENT  S3,100B
          ABS
          ORG    100B
          SX6    1
          SEG                    PORTION 100B
          SX6    2
          END
`),
    ex(`
          IDENT  S4
          SEG                    RELOCATABLE - ILLEGAL
          END
`, { errors: ['O'] }),
    deviation(`This assembler keeps the whole image in memory: ${c('SEG')} reduces to forcing upper the current word, has no effect on the binary (one section, identical to the one obtained without SEG) and raises no range error.`),
    p(`See also: ${see('ps-ident', 'blank IDENT')}, ${see('lang-partial-binary', 'partial binary')}.`),
  ].join('\n'),
};

const stext = {
  id: 'ps-stext',
  title: 'STEXT — generate system text record',
  keys: ['STEXT'],
  syntax: ['[name]    STEXT'],
  html: [
    p(`In COMPASS, ${c('STEXT')} causes a <em>system text</em> to be produced at the end of pass one: a record containing the unqualified, nonredefinable absolute symbols, all micros and all operations defined by the program (macros, opdefs, CPOP, PPOP, OPSYN). A later assembly called with the G or S parameter loads this text: micros and operations are then defined at the beginning of every assembly, symbols only in programs that contain ${see('ps-sst', 'SST')}. The variable field is ignored. First statement group only (<strong>O</strong> flag otherwise).`),
    ul([
      `<strong>name</strong> (location field): name of the system text record (1 to 7 characters). Blank: the overlay is named from the IDENT and only the system text is produced; nonblank: the system text precedes the ordinary binary.`,
      `not exported: relocatable or external symbols, qualified symbols, redefinable symbols (SET, MAX, MIN, MICCNT), symbols coming from a system text, and predefined operations.`,
    ]),
    p(`In this environment, system texts are built by the assembler itself: the project ${c('SYSTEXT')} text, which begins with ${c('IDENT SYSTEXT')} then ${c('STEXT')}, is assembled once and its definitions are loaded at the beginning of every assembly (equivalent of the NOS S parameter).`),
    ex(`
          IDENT  MONTXT
          STEXT
MAXL      EQU    100B            EXPORTABLE
          END
`),
    deviation(`In an ordinary program, ${c('STEXT')} is accepted but has no effect on the binary produced; the location-field name is not used. A system text is produced through the assembler interface (system texts declared in the options), not as a binary record.`),
    ex(`
          IDENT  P
          SX6    1
          STEXT                  OUTSIDE THE FIRST GROUP
          END
`, { errors: ['O'] }),
    p(`See also: ${see('ps-sst', 'SST')}, ${see('sys-intro', 'system text')}.`),
  ].join('\n'),
};

const comment = {
  id: 'ps-comment',
  title: 'COMMENT — prefix table comment',
  keys: ['COMMENT'],
  syntax: ['          COMMENT string'],
  html: [
    p(`${c('COMMENT')} places a character string in words 8 to 14 of the 7700B prefix table (70 characters at most, in display code). The loader ignores it; it identifies the binary section (version date, author, and so on). The location field is ignored. Permitted anywhere.`),
    h4('String extraction'),
    ul([
      `the scan begins after the blank that ends the operation field;`,
      `if no nonblank character is found before the comments column (${see('ps-col', 'COL')}), the string begins at the column preceding the comments column; otherwise it begins at the first nonblank character;`,
      `it ends at the last nonblank character of the statement (the comments are therefore part of it);`,
      `it is padded with 1 to 10 blanks so that it is followed by at least one blank and its length is a multiple of 10; a statement without text gives 10 blanks;`,
      `characters beyond the 70th are lost.`,
    ]),
    p(`Several ${c('COMMENT')} statements follow one another in the table: each string is appended to the previous one, within the limit of 70 characters. ${c('COMMENT')} is meaningless if ${see('ps-nolabel', 'NOLABEL')} suppresses the prefix table.`),
    ex(`
          IDENT  C1
          COMMENT TEST PROGRAM
          COMMENT
          END
`),
    p(`Words 8 to 10 of the prefix table contain ${c('TEST PROGR')}, ${c('AM        ')} and ten blanks.`),
    deviation(`The string is common to the whole subprogram: it is copied into the prefix table of every overlay, and a COMMENT after a SEG or a blank IDENT is not ignored.`),
    p(`See also: ${see('ps-title', 'TITLE')}, ${see('lang-binary', 'binary')}.`),
  ].join('\n'),
};

const nolabel = {
  id: 'ps-nolabel',
  title: 'NOLABEL — delete header tables',
  keys: ['NOLABEL'],
  syntax: ['          NOLABEL [I]'],
  html: [
    p(`${c('NOLABEL')} deletes the header tables of an absolute binary, for example for a deadstart program loaded at address 0. The location field is ignored. Permitted anywhere in an absolute program (CPU or PP); in a relocatable program: <strong>O</strong> flag.`),
    T([
      ['blank', 'all tables: 7700B prefix, 5000B overlay table, 5100B table, PP header word; only the image remains'],
      [c('I…'), 'only the 7700B prefix table; other header tables are kept'],
      ['other first character', 'A flag, statement has no effect'],
    ], ['Variable field', 'Tables deleted']),
    ex(`
          IDENT  N1,100B
          ABS
          NOLABEL I              KEEPS THE 5000B TABLE
          ORG    100B
          SX6    1
          END
`),
    ex(`
          IDENT  N1,100B
          ABS
          NOLABEL X
          END
`, { errors: ['A'] }),
    ex(`
          IDENT  N2
          NOLABEL                RELOCATABLE - ILLEGAL
          END
`, { errors: ['O'] }),
    p(`See also: ${see('ps-comment', 'COMMENT')}, ${see('lang-binary', 'binary')}.`),
  ].join('\n'),
};

const lcc = {
  id: 'ps-lcc',
  title: 'LCC — loader directive',
  keys: ['LCC'],
  syntax: ['          LCC    directive'],
  html: [
    p(`${c('LCC')} passes a directive to the loader. The directive is the text of the variable field, from the first nonblank character to the next blank; it is written unedited, in display code, in a separate binary section that precedes the section containing the subprogram tables (one section per ${c('LCC')}, in order). The assembler does not check the directive: illegal forms are detected by the loader. The location field is ignored.`),
    p(`Relocatable programs only (<strong>O</strong> flag in absolute and PP assemblies). ${c('LCC')} is not among the instructions permitted anywhere: it ends the first statement group.`),
    ex(`
          IDENT  L1
          LCC    GROUP(A)
          SX6    1
          END
`),
    ex(`
          IDENT  L2,100B
          ABS
          LCC    X               ABSOLUTE - ILLEGAL
          END
`, { errors: ['O'] }),
    p(`See also: ${see('ps-ldset', 'LDSET')}, ${see('lang-relocatable', 'relocatable program')}.`),
  ].join('\n'),
};

const memsel = {
  id: 'ps-memsel',
  title: 'MEMSEL — CYBER 180 PP memory size',
  keys: ['MEMSEL'],
  syntax: ['          MEMSEL [4|8]'],
  html: [
    p(`${c('MEMSEL')} specifies the memory size of a CYBER 180 16-bit PP, which governs the calculation and validation of the ${c('m')} memory address field of PP instructions. The location field is ignored. First statement group only (<strong>O</strong> flag otherwise).`),
    T([
      ['blank or 4', '4096 words, addresses 0 to 7777B'],
      ['8', '8192 words, addresses 0 to 17777B (CYBER 180 model 990, some 840/850/860)'],
      ['other value', 'A flag; size 4096 is kept'],
    ], ['Variable field', 'Memory']),
    p(`The manual restricts ${c('MEMSEL')} to ${see('ps-cippu', 'CIPPU')} programs (CIPPU is required for a size greater than 4).`),
    ex(`
          IDENT  PPC,1000B
          CIPPU
          MEMSEL 8
          ORG    1000B
          END
`),
    ex(`
          IDENT  PPC,1000B
          CIPPU
          MEMSEL 6
          END
`, { errors: ['A'] }),
    deviation(`The selected size is recorded but does not yet change the validation of PP addresses; MEMSEL is accepted without a diagnostic in PERIPH, PPU and CPU assemblies.`),
    p(`See also: ${see('ps-cippu', 'CIPPU')}, ${see('pp-formats', 'PP instructions')}.`),
  ].join('\n'),
};

const ldset = {
  id: 'ps-ldset',
  title: 'LDSET — generate LDSET object directives',
  keys: ['LDSET'],
  syntax: ['          LDSET  option,option,…'],
  html: [
    p(`${c('LDSET')} places options intended for the loader in the relocatable binary, equivalent to the LDSET load directive. All options of all ${c('LDSET')} statements of the subprogram are collected into a single LDSET (7000B) table, placed between the 7700B prefix table and the 3400B PIDL table; without ${c('LDSET')}, the table is not written. The location field is ignored. Permitted anywhere, including the first statement group; relocatable programs only (<strong>O</strong> flag in absolute and PP assemblies).`),
    p(`The assembler does not check the meaning of the options; the loader options include:`),
    T([
      [c('LIB'), 'clear the local library set'],
      [c('LIB=l1/l2/…'), 'add libraries to the local library set'],
      [c('MAP'), 'load map to OUTPUT'],
      [c('MAP=p'), 'map contents: N none, or any combination of S statistics, B block list, E entry point list, X cross reference'],
      [`${c('MAP=p/lfn')}, ${c('MAP=/lfn')}`, 'map to file lfn'],
      [c('PS=p'), 'map page size in lines (10 to 999999)'],
      [c('PD=p'), 'print density, 6 or 8 lines per inch'],
      [c('PRESET=p'), 'memory preset: octal number of 1 to 20 digits, or NONE, ZERO, ONES, INDEF, INF, NGINDEF, NGINF, ALTZERO, ALTONES, DEBUG'],
      [c('PRESETA=p'), 'as PRESET, with the word address in its low-order bits'],
      [`${c('ERR=ALL')}, ${c('ERR=FATAL')}, ${c('ERR=NONE')}`, 'abort the load on any error, on fatal errors, or only on catastrophic errors'],
      [`${c('REWIND')}, ${c('NOREWIN')}`, 'default rewind option for load files'],
      [`${c('EPT=e1/…')}, ${c('NOEPT=e1/…')}`, 'declare or not declare capsule entry points'],
      [c('USEP=p1/…'), 'force loading of named object modules'],
      [c('USE=e1/…'), 'force loading of the modules containing these entry points'],
      [`${c('COMMON')}, ${c('COMMON=b1/…')}`, 'common blocks visible to all segments'],
      [c('SUBST=e1-e2/…'), 'treat references to e1 as references to e2'],
      [c('OMIT=e1/…'), 'do not satisfy these externals'],
    ], ['Option', 'Effect']),
    ex(`
          IDENT  L1
          LDSET  MAP=SBX,PRESET=ZERO
          LDSET  ERR=ALL
          END
`),
    ex(`
          IDENT  L2,100B
          ABS
          LDSET  MAP             ABSOLUTE - ILLEGAL
          END
`, { errors: ['O'] }),
    deviation(`The exact format of the 7000B table is defined by the loader manual; this assembler stores each option, as written, in a 10-character display-code word.`),
    p(`See also: ${see('ps-lcc', 'LCC')}.`),
  ].join('\n'),
};

// =====================================================================
// Mode control
// =====================================================================

const base = {
  id: 'ps-base',
  title: 'BASE — numeric data mode',
  keys: ['BASE'],
  syntax: ['[mname]   BASE   [O|D|M|*]'],
  html: [
    p(`${c('BASE')} selects the base in which numbers without a radix indicator are read (${see('lang-numeric-data', 'numeric data')}). The default base is decimal. Permitted anywhere, including the first statement group.`),
    h4('Fields'),
    ul([
      `<strong>mname</strong> (location field, optional): micro name (1 to 8 characters); the micro receives the letter ${c('D')}, ${c('M')} or ${c('O')} of the base in effect <em>before</em> the statement. A name longer than 8 characters is flagged L.`,
      `<strong>mode</strong>: only the first character matters (${c('OCTAL')} means ${c('O')}).`,
    ]),
    T([
      [c('O'), 'octal: unsuffixed numbers are octal (15 and 15B are 15B; 15D is 17B). A digit 8 or 9 without a D suffix is flagged A.'],
      [c('D'), 'decimal.'],
      [c('M'), 'mixed: decimal for the counts listed below, octal for everything else.'],
      [c('*'), 'resume the previous base (50-entry stack; empty stack: decimal).'],
      ['blank', 'base unchanged (useful with mname to save the base).'],
      ['other', 'A flag, base unchanged.'],
    ], ['Mode', 'Effect']),
    p(`With base M, the following are read as decimal: the bit count of a ${c('VFD')} field; the line counts of ${c('IF')}, ${c('ELSE')}, ${c('SKIP')}, ${c('DUP')}, ${c('ECHO')} and ${c('SPACE')}; the character counts of ${c('MICRO')}, ${c('OCTMIC')}, ${c('DECMIC')}; the C, B and I subfields of ${c('REP')}; the column number of ${c('COL')}; the word count of ${c('DIS')}. Whatever the base, scale factors, character counts of constants, shift counts (S) and binary point positions are decimal. An explicit radix (prefix or suffix ${c('B')}, ${c('O')}, ${c('D')}) always overrides the base.`),
    p(`Each ${c('BASE')} other than ${c('*')} and blank pushes the previous base; beyond 50 entries the oldest is lost. ${c('BASE')} also updates the predefined micro ${c('BASE')}, unless the program or the system text has defined its own micro of that name. On the listing, the code column shows the old and new base separated by ${c('>')}.`),
    ex(`
          BASE   O
          VFD    60/10           60B = 48 BITS, VALUE 10B
          BASE   D
+         VFD    48/8
          BASE   M
+         VFD    48/10           DECIMAL COUNT, OCTAL VALUE
`),
    src(`
                            D>O                   BASE   O
         0 0000000000000010                       VFD    60/10
                            O>D                   BASE   D
         1 0000000000000010             +         VFD    48/8
                            D>M                   BASE   M
         2 0000000000000010             +         VFD    48/10
`),
    ex(`
SAVEB     BASE   M               SAVE BASE IN SAVEB
          DIS    2,ABCDEFGHIJKLMNOPQRST
          BASE   "SAVEB"         RESTORE THE SAVED BASE
          BASE   *               OR RESTORE THROUGH THE STACK
`),
    ex(`
          BASE   O
          DATA   18              8 WITHOUT D SUFFIX
          BASE   X
`, { errors: ['A'] }),
    p(`See also: ${see('lang-numeric-data', 'numeric data')}, ${see('ps-code', 'CODE')}, ${see('ps-micro', 'MICRO')}.`),
  ].join('\n'),
};

const char = {
  id: 'ps-char',
  title: 'CHAR — define "other" character code',
  keys: ['CHAR'],
  syntax: ['          CHAR   exp1,exp2'],
  html: [
    p(`${c('CHAR')} modifies the "other" code table used by ${c('CODE O')}: the character whose display code is ${c('exp1')} will be generated with value ${c('exp2')}. Initially the "other" table is identical to display code. The location field is ignored. Permitted anywhere; it may be repeated any number of times for the same character (the last definition prevails).`),
    ul([
      `${c('exp1')}, ${c('exp2')}: absolute evaluatable expressions (previously defined symbols), in the range 0 to 77B;`,
      `value outside 0 to 77B: <strong>A</strong> flag, table unchanged; missing subfield: 8 flag;`,
      `the listing shows ${c('old>new')} in two-digit octal.`,
    ]),
    p(`The table is taken into account when each data statement is read: ${c('CHAR')} affects only the statements that follow it.`),
    ex(`
          CHAR   0,63B           COLON BECOMES 63B
          CHAR   63B,0           PERCENT BECOMES 00
          CODE   O
          DATA   1L:,1L%,1LA     63B, 00B, 01B
`),
    ex(`
          CHAR   100B,0
`, { errors: ['A'] }),
    p(`See also: ${see('ps-code', 'CODE')}, ${see('lang-charsets', 'character sets')}.`),
  ].join('\n'),
};

const code = {
  id: 'ps-code',
  title: 'CODE — character data code',
  keys: ['CODE'],
  syntax: ['[mname]   CODE   [A|D|E|I|N|O|*]'],
  html: [
    p(`${c('CODE')} selects the code in which character constants, strings and character data items are generated (${c('DATA')}, ${c('DIS')}, ${c('LIT')}, literals, ${c('nL…')}, ${c('nR…')}, ${c('nH…')} constants in expressions), until the next ${c('CODE')}. Default: display code, except in ${c('CIPPU')} assemblies (8-bit ASCII). Permitted anywhere. Only the first character of the variable field matters (${c('CODE ASCII')}, ${c('CODE DISPLAY')}).`),
    T([
      [c('A'), 'ASCII 6-bit subset: ASCII code − 40B (O = 57B, U = 65B, T = 64B, P = 60B)'],
      [c('D'), 'display code (6 bits)'],
      [c('E'), 'external BCD (6 bits)'],
      [c('I'), 'internal BCD (6 bits)'],
      [c('N'), '8-bit ASCII: in CIPPU, two 8-bit characters per 16-bit word; in CPU and 12-bit PP assemblies, each character occupies 12 bits (ASCII code right-justified), five per 60-bit word and one per PP word'],
      [c('O'), '"other" code, defined by CHAR'],
      [c('*'), 'previous code (50-entry stack; empty stack: display)'],
      ['blank', 'code unchanged'],
      ['other', 'A flag, code unchanged'],
    ], ['Code', 'Meaning']),
    p(`<strong>mname</strong> (location field, optional): micro receiving the letter of the code in effect before the statement. ${c('CODE')} updates the predefined micro ${c('CODE')} (unless the program has defined a micro of that name). The listing shows ${c('old>new')}.`),
    ex(`
          DATA   0LOUTPUT        17252420252400000000
          CODE   ASCII
          DATA   0LOUTPUT        57656460656400000000
          CODE   EXTERNAL BCD
          DATA   0LOUTPUT        46242347242300000000
          CODE   INTERNAL BCD
          DATA   0LOUTPUT        46646347646300000000
          CODE   DISPLAY
          DATA   0LOUTPUT        17252420252400000000
          CODE   *               BACK TO INTERNAL BCD
          DATA   0LOUTPUT        46646347646300000000
`),
    src(`
                            D>A                   CODE   ASCII
         1 57656460656400000000                   DATA   0LOUTPUT
                            A>E                   CODE   EXTERNAL BCD
`),
    ex(`
MC        CODE   A               MC = D
          CODE   D
          DIS    ,*"MC"*         STRING D
          CODE   X
`, { errors: ['A'] }),
    p(`See also: ${see('ps-char', 'CHAR')}, ${see('lang-character-data', 'character data')}, ${see('lang-charsets', 'character sets')}.`),
  ].join('\n'),
};

const qual = {
  id: 'ps-qual',
  title: 'QUAL — qualify symbols',
  keys: ['QUAL'],
  syntax: ['[mname]   QUAL   [qualifier|*]'],
  html: [
    p(`${c('QUAL')} begins a sequence of code in which symbols defined are <em>qualified</em> by the given qualifier; a blank qualifier makes symbols global again. Without ${c('QUAL')}, all symbols are global. Permitted anywhere (${see('lang-qualified', 'qualified symbols')}).`),
    h4('Fields'),
    ul([
      `<strong>mname</strong> (location field, optional): micro receiving the qualifier in effect before the statement (0 to 8 characters).`,
      `<strong>qualifier</strong>: name of 1 to 8 characters whose first character is not ${c('$')}, ${c('=')}, ${c(':')} or a digit, and which contains none of ${c('+')}, ${c('-')}, ${c('*')}, ${c('/')}, ${c(',')}, ${c('^')}; otherwise <strong>A</strong> flag and qualifier unchanged. ${c('*')} resumes the previous qualifier (50-entry stack; empty stack: global). Blank: global.`,
    ]),
    p(`Each ${c('QUAL')} other than ${c('*')} pushes the previous qualifier. The predefined micro ${c('QUAL')} receives the new qualifier; the current qualifier appears in the page heading of the listing.`),
    h4('Reference rules'),
    ul([
      `within the sequence in which it is defined, a qualified symbol is referenced unqualified; outside, it is written ${c('/qualifier/symbol')};`,
      `an unqualified reference looks first for the symbol of the current qualifier, then for the global symbol; if the symbol exists in both forms, the global form is written ${c('//symbol')};`,
      `default symbols (${c('=S')}, ${c('=X')}, ${c('=Y')}) and linkage symbols (${c('ENTRY')}, ${c('EXT')}) are never qualified: an entry point defined in a qualified sequence remains undefined (U flag);`,
      `an unknown qualifier in ${c('/q/sym')} is flagged U.`,
    ]),
    ex(`
          QUAL   PASS1
CODE1     SX6    1               QUALIFIED BY PASS1
          QUAL   PASS2
CODE1     SX6    2               QUALIFIED BY PASS2
          QUAL                   GLOBAL SYMBOLS
          SX7    /PASS1/CODE1
          SX7    /PASS2/CODE1
          QUAL   Z
ZZ        BSS    0               ZZ QUALIFIED BY Z
          QUAL   B
ZZ        =      /Z/ZZ           ZZ OF Z ALSO KNOWN IN B
          QUAL   *               BACK TO Z
`),
    ex(`
GLOB      EQU    1
          QUAL   Q
GLOB      EQU    2               /Q/GLOB
          SX6    GLOB            2
          SX6    //GLOB          1
          QUAL   *
          SX6    /X/GLOB         UNKNOWN QUALIFIER
`, { errors: ['U'] }),
    ex(`
          QUAL   1AB
          QUAL   A+B
          QUAL   ABCDEFGHI
`, { errors: ['A'] }),
    deviation(`The manual states that the first attempt to redefine a global SET, MAX, MIN or MICCNT symbol within a qualified sequence produces A and U flags and defines a local symbol with value 0. Here no error is flagged: a qualified symbol is created with the given value. In pass two, SET, MAX, MIN and MICCNT redefinitions apply to the qualifier in effect at the end of the program, so the value of a global symbol may be replaced by that of a qualified symbol of the same name; to avoid this, surround such redefinitions with a blank ${c('QUAL')} and ${c('QUAL *')}, as the manual recommends.`),
    p(`See also: ${see('lang-qualified', 'qualified symbols')}, ${see('ps-noref', 'NOREF')}.`),
  ].join('\n'),
};

const b1 = {
  id: 'ps-b1',
  title: 'B1=1 and B7=1 — B register contains one',
  keys: ['B1=1', 'B7=1'],
  syntax: ['          B1=1', '          B7=1'],
  html: [
    p(`${c('B1=1')} (respectively ${c('B7=1')}) declares that register B1 (B7) contains the value one. No code is generated: the program must load the register itself (${c('SB1 1')}). The location and variable fields are ignored. Permitted anywhere; CPU only (<strong>O</strong> flag in PP assemblies).`),
    ul([
      `the declaration changes the code generated by ${see('ps-r', 'R=')}: the values 1, 2 and −1 are obtained through ${c('B1')}, ${c('B1+B1')}, ${c('-B1')} (or with B7), as 15-bit instructions;`,
      `it also defines the absolute symbol ${c('B1=1')} (or ${c('B7=1')}) with value 1, usable for example in ${c('IF DEF,B1=1')} or in an expression;`,
      `if both are used, the last one encountered applies.`,
    ]),
    ex(`
          SB1    1               LOAD THE REGISTER
          B1=1
          R=     X1,1            SX1 B1
          SX6    B1=1            THE SYMBOL IS 1
          B7=1
          R=     X2,1            SX2 B7
`),
    ex(`
          IDENT  PP,100B
          PERIPH
          B1=1                   ILLEGAL IN PP
          END
`, { errors: ['O'] }),
    p(`See also: ${see('ps-r', 'R=')}, ${see('ps-if', 'IF')}.`),
  ].join('\n'),
};

const col = {
  id: 'ps-col',
  title: 'COL — set comments column',
  keys: ['COL'],
  syntax: ['          COL    n'],
  html: [
    p(`${c('COL')} sets the column at which the comments field begins for a statement whose variable field is blank. Default: 30. The location field is ignored. ${c('COL')} is not permitted in the first statement group: it terminates it.`),
    ul([
      `<strong>n</strong>: absolute evaluatable expression; with base M, read as decimal;`,
      `n less than 12: 12; n zero or blank field: 30;`,
      `if the operation field of a statement extends past the comments column, that statement must have a variable field in order to carry a comment;`,
      `the listing shows the new column number.`,
    ]),
    p(`The comments column is also used by ${see('ps-comment', 'COMMENT')}, ${see('ps-title', 'TITLE')} and ${see('ps-ttl', 'TTL')} to locate the beginning of their string.`),
    ex(`
          COL    36
          BSS                     WORD
`, { errors: ['U'] }),
    p(`With ${c('COL 36')}, the text ${c('WORD')} in column 30 is no longer a comment: it is read as the variable field of ${c('BSS')}, hence the undefined symbol.`),
    ex(`
          COL    5               BECOMES 12
          COL    0               BACK TO 30
          COL
`),
    p(`After ${c('COL 5')}, the comments column is 12: on a ${c('COL')} statement without a value, text in column 30 would be read as the variable field; this is why the value 0 is given explicitly.`),
    p(`See also: ${see('lang-format', 'statement format')}, ${see('lang-comments', 'comments')}.`),
  ].join('\n'),
};

// =====================================================================
// Block counter control
// =====================================================================

const use = {
  id: 'ps-use',
  title: 'USE — establish and use block',
  keys: ['USE'],
  syntax: ['          USE    [block|0|//|/name/|*]'],
  html: [
    p(`${c('USE')} designates the block that receives subsequently assembled code; the block is established when first designated (${see('lang-blocks', 'blocks')}). The location field is ignored. A block group holds at most 255 blocks, 252 of them established by the user; beyond that, <strong>F</strong> flag.`),
    T([
      [`${c('0')} or blank`, 'nominal block: absolute block in absolute or PP assemblies, zero block in relocatable (listed PROGRAM*)'],
      [c('//'), 'blank common. Relocatable: no data possible (only BSS and ORG are meaningful; data, BSSZ and machine instructions: R flag). Absolute: local block named //, data permitted'],
      [c('/name/'), 'labeled common (name of 7 characters at most, otherwise A flag). Absolute: local block named /name/'],
      [c('name'), 'local block, 1 to 8 characters, first character not a colon (otherwise A flag). USE A and USE /A/ designate two different blocks'],
      [c('*'), 'block in use before the most recent USE, USELCM, ORG or ORGC (stack)'],
    ], ['Variable field', 'Block']),
    p(`One name can designate up to four distinct blocks: local or common, in central memory or in ECS/LCM (${see('ps-uselcm', 'USELCM')}).`),
    h4('Counters'),
    ul([
      `a new block starts with origin = location = 0 and position = 60 (CPU), 12 or 16 (PP);`,
      `when a block is left, its origin and position counters are saved, together with the pending force upper indicator (after ${c('RJ')}, ${c('JP')}, unconditional ${c('EQ')}, and so on, the first instruction assembled when the block is resumed begins a new word); the location counter is <em>not</em> saved;`,
      `when a block is resumed, the location counter takes the value of the origin counter: a LOC in effect must be reissued;`,
      `${c('USE')} does not force upper: a partially filled word remains pending and can be completed later (for example by a ${c('VFD')} with a blank location field).`,
    ]),
    p(`<strong>USE stack</strong>: ${c('USE')}, ${c('USELCM')}, ${c('ORG')} and ${c('ORGC')} (except their ${c('*')} forms) push the block in use before them; each ${c('USE *')} or ${c('USELCM *')} resumes the most recent entry and removes it. Empty stack: nominal block. The stack holds 50 entries.`),
    ex(`
GAMMA     SX6    1
          USE    ALPHA           BLOCK ALPHA
          RJ     DATA1
          USE    DATA1           BLOCK DATA1
DATA1     DATA   5
          USE    *               RESUME ALPHA
          SA3    1               NEW WORD - FORCED AFTER RJ
          SX7    2
          USE    *               RESUME THE NOMINAL BLOCK
          DATA   7
`),
    p(`Separate blocks allow bytes to be packed into a table in another block while code is being assembled:`),
    ex(`
          USE    TABLE
          VFD    6/0
          USE    *
          SX6    1
          USE    TABLE           RESUME TABLE
          VFD    6/1RX,18/3      CONTINUES IN THE SAME WORD
          VFD    30/0
          USE    *
          SX7    2
`),
    ex(`
          USE    //
COMMON    BSS    1000B           512 WORDS OF BLANK COMMON
          DATA   1               ILLEGAL IN BLANK COMMON
          USE    0
          SX6    COMMON+500B     COMMON RELOCATION (C)
`, { errors: ['R'] }),
    ex(`
          USE    /ABCDEFGH/
          USE    ABCDEFGHI
          USE    :AB
`, { errors: ['A'] }),
    note(`At the end of a block group (${c('END')}, overlay IDENT), only the block in use is completed. In this implementation, a word left partially filled in another block is not counted in the length of that block and its contents do not appear in the binary: complete that word (for example with ${c('VFD')}, or by resuming the block before assembling a full word) before leaving the block for the last time.`),
    p(`See also: ${see('ps-uselcm', 'USELCM')}, ${see('ps-org', 'ORG')}, ${see('lang-blocks', 'blocks')}, ${see('lang-counters', 'counters')}, ${see('lang-force', 'force upper')}.`),
  ].join('\n'),
};

const uselcm = {
  id: 'ps-uselcm',
  title: 'USELCM — establish and use ECS/LCM block',
  keys: ['USELCM'],
  syntax: ['          USELCM block|//|/name/|*'],
  html: [
    p(`${c('USELCM')} establishes or resumes a block in extended core storage (ECS) or large core memory (LCM). The location field is ignored. CPU only (<strong>O</strong> flag in PP assemblies). The rules for counters, the stack and names are those of ${see('ps-use', 'USE')}.`),
    T([
      [`${c('0')} or blank`, 'illegal: A flag (there is no ECS/LCM absolute, zero or literals block)'],
      [c('//'), 'ECS/LCM blank common (a subprogram may have two blank commons, one in central memory and one in LCM)'],
      [c('/name/'), 'ECS/LCM labeled common'],
      [c('name'), 'ECS/LCM local block; all ECS/LCM local blocks are concatenated into one block, which the loader treats as a common block unique to the subprogram'],
      [c('*'), 'previous block (same stack as USE)'],
    ], ['Variable field', 'Block']),
    ul([
      `in the ECS/LCM blank common of a relocatable program, and in all ECS/LCM blocks of an absolute program, only ${c('BSS')}, ${c('ORG')} and ${c('ORGC')} are useful: data and instructions there are flagged <strong>R</strong>;`,
      `ECS/LCM local blocks and labeled commons of a relocatable program may receive data;`,
      `the manual rounds the length of each ECS/LCM block (including the combined local block) up to a multiple of 8 words, with a maximum of 1,048,568 words; this assembler rounds each LCM local block when they are concatenated, but the block summary of the listing shows unrounded lengths and marks these blocks with ${c('+')} (${c('+LOCAL')}, ${c('+COMMON')}).`,
    ]),
    ex(`
LCMC      USELCM LCM             LCM LOCAL BLOCK
BLOC1     BSS    0
BLOC2     BSS    100             100 WORDS
          USE    *               RESUME THE PREVIOUS BLOCK
          ORG    BLOC1+1000B     BACK INTO THE LCM BLOCK
          BSS    20
          USE    *
          SX6    BLOC2
`),
    ex(`
          USELCM 0
          USELCM //
          DATA   1               ILLEGAL IN LCM BLANK COMMON
`, { errors: ['A', 'R'] }),
    p(`See also: ${see('ps-use', 'USE')}, ${see('lang-blocks', 'block types')}.`),
  ].join('\n'),
};

const org = {
  id: 'ps-org',
  title: 'ORG and ORGC — set origin counter',
  keys: ['ORG', 'ORGC'],
  syntax: ['          ORG    exp', '          ORGC   exp'],
  html: [
    p(`${c('ORG')} and ${c('ORGC')} select (indirectly) the block that receives subsequent code and set the origin and location counters to the value of the expression. The location field is ignored. Both force upper the current word first, push the block in use on the USE stack (as ${c('USE')} does) and save the origin and position counters of the block left; assembly resumes at bit 59 (at the high-order bit of the word in PP assemblies) of the specified address.`),
    h4('Block selection'),
    ul([
      `relocatable expression: the block in which the relocatable symbol it contains was defined;`,
      `exactly ${c('*')}, ${c('*L')} or ${c('*O')}: the current block. Only force upper occurs if origin and location are equal; if they differ, ${c('*')} and ${c('*L')} set the origin counter to the location counter, and ${c('*O')} sets the location counter to the origin counter. These forms push nothing;`,
      `absolute expression: the absolute block. In a relocatable assembly this is the only way to create the absolute block ${c('ABSOLUTE*')}; symbols defined in it are absolute.`,
    ]),
    h4('Rules'),
    ul([
      `all symbols in the expression must be previously defined (otherwise <strong>U</strong> flag);`,
      `negative or multiple relocation, negative origin, external symbol, literals block: <strong>A</strong> flag;`,
      `${c('ORG')} resets the position to the beginning of the word and the location counter to the origin counter.`,
    ]),
    h4('ORGC'),
    p(`In absolute and PP assemblies, ${c('ORGC')} is identical to ${c('ORG')}. In a relocatable assembly it differs only if the designated block is a common block: the text that follows (presetting the common block) is to be ignored by the loader if that common block was first declared by a previously loaded subprogram. It must be used when several subprograms preset relocatable text in the same common block. The conditional indication remains attached to the block when it is resumed by ${c('USE')}; only an ${c('ORG')} specifying that block clears it. The SCOPE 2 loader does not support ORGC.`),
    ex(`
          USE    ALPHA
ABC       DATA   20,100,1000     IN ALPHA
          USE    BETA
XYZ       BSS    0               IN BETA
          ORG    ABC             ALPHA COUNTERS SET TO ABC
          BSS    10
          ORG    XYZ+100         BETA COUNTERS SET TO XYZ+100
          DATA   1
          USE    *               RESUME ALPHA
          DATA   2
          USE    *               RESUME BETA
          DATA   3
`),
    ex(`
          SX6    1
          ORG    -1              NEGATIVE ORIGIN
          ORG    UNDEF
          ORG    =1              LITERALS BLOCK
`, { errors: ['A', 'U'] }),
    ex(`
          USE    /DATA/
          ORGC   *               CONDITIONAL PRESET
          DATA   1,2,3
`),
    deviation(`The manual states that with ${c('ORG *')} on a partially assembled word, the code already stored in that word is lost; here the word is first completed by force upper and nothing is lost. The conditional indication of ORGC is recorded but not yet passed to the loader. In a relocatable program, the text of the absolute block ${c('ABSOLUTE*')} is merged into the relocatable image at the same addresses instead of being emitted as absolute text: avoid it if these addresses overlap the relocatable blocks.`),
    p(`See also: ${see('ps-use', 'USE')}, ${see('ps-loc', 'LOC')}, ${see('ps-bss', 'BSS')}, ${see('lang-counters', 'counters')}.`),
  ].join('\n'),
};

const bss = {
  id: 'ps-bss',
  title: 'BSS — block storage reservation',
  keys: ['BSS'],
  syntax: ['[sym]     BSS    aexp'],
  html: [
    p(`${c('BSS')} reserves words in the block in use by advancing the origin and location counters, without generating data. Its main use is reserving blank common, or an area intended for copies (${see('ps-rep', 'REP')}). ${c('BSS')} first forces upper the current word (including a pending deferred force upper). Unlike ${c('ORG')}, it does not change the block. Legal in all assembly types and in all blocks, including blank common and ECS/LCM blocks.`),
    ul([
      `<strong>sym</strong> (optional): defined as the value of the location counter after force upper, that is, the beginning of the area;`,
      `<strong>aexp</strong>: absolute expression whose symbols are previously defined (otherwise <strong>U</strong> flag); relocatable or external expression: <strong>A</strong> flag. The value, positive, zero or negative, is added to the origin and location counters;`,
      `negative value: informative <strong>7</strong> flag; the value is still applied (data stored afterwards overlays the preceding words);`,
      `${c('BSS 0')}, blank field or erroneous expression: force upper and symbol definition, no storage reserved;`,
      `on the listing: start address of the area in the address column, word count in octal in the code column (nothing if zero).`,
    ]),
    ex(`
          USE    //
COMMON    BSS    1000B           512 WORDS OF BLANK COMMON
          USE    *
          SA6    COMMON+500B
TAG       BSS    0               DEFINES TAG
`),
    src(`
         0                 1000         COMMON    BSS    1000B
`),
    ex(`
          SX6    1
          BSS    -1              BACK ONE WORD
TAG       BSS    0
          BSS    UNDEF
          BSS    TAG             RELOCATABLE EXPRESSION
`, { errors: ['7', 'A', 'U'] }),
    p(`See also: ${see('ps-bssz', 'BSSZ')}, ${see('ps-org', 'ORG')}, ${see('lang-counters', 'counters')}.`),
  ].join('\n'),
};

const locE = {
  id: 'ps-loc',
  title: 'LOC — set location counter',
  keys: ['LOC'],
  syntax: ['          LOC    exp'],
  html: [
    p(`${c('LOC')} sets the location counter of the block in use to the value of the expression. Code is still stored at the origin counter address, but symbols and listed addresses are defined as if the code were at the location counter address: code loaded in one place and executed in another, or a table whose elements are numbered from 0. The location field is ignored. ${c('LOC')} forces upper (CPU) and does not otherwise affect the origin counter.`),
    ul([
      `<strong>exp</strong>: absolute or relocatable expression whose symbols are previously defined (otherwise U flag); negative relocation: A flag. With an absolute value, symbols defined afterwards are absolute; with a relocatable value, they are relative to the block of the symbol;`,
      `${c('LOC *')} and ${c('LOC *L')}: force upper only; ${c('LOC *O')}: the location counter takes the value of the origin counter;`,
      `while location differs from origin, the listing places the ${c('L')} mark before the address (which is that of the location counter);`,
      `since the location counter is not saved per block, ${c('USE')}, ${c('USELCM')}, ${c('ORG')} and ${c('ORGC')} reset location to origin; when a block is resumed, the ${c('LOC')} must be reissued.`,
    ]),
    ex(`
          SX6    1
          LOC    100             LOCATION 144B
L1        SX6    2               L1 = 144B (ABSOLUTE)
          LOC    *O              BACK TO THE ORIGIN COUNTER
L2        SX6    3               L2 = 2
`),
    src(`
         0 7160000001                             SX6    1
                                                  LOC    100
   L   144 7160000002                   L1        SX6    2
                                                  LOC    *O
         2 7160000003                   L2        SX6    3
`),
    p(`Table numbered from 0 in a separate block; resuming the block cancels the ${c('LOC')}:`),
    ex(`
          USE    TAB
          LOC    0
          CON    1               L 0
          CON    2               L 1
          USE    *
          CON    7
          USE    TAB
          CON    3               ACTUAL ADDRESS 2
`),
    ex(`
          LOC    UNDEF
`, { errors: ['U'] }),
    deviation(`A negative absolute value is accepted without a diagnostic.`),
    p(`See also: ${see('ps-org', 'ORG')}, ${see('lang-counters', 'counters')}.`),
  ].join('\n'),
};

const pos = {
  id: 'ps-pos',
  title: 'POS — set position counter',
  keys: ['POS'],
  syntax: ['          POS    aexp'],
  html: [
    p(`${c('POS')} sets the position counter of the block in use, that is, the number of bits remaining in the word: subsequent code is assembled from that position. The location field is ignored. The origin and location counters are not altered.`),
    ul([
      `<strong>aexp</strong>: absolute evaluatable expression, from 0 to the word size (60 on the CPU, 12 or 16 in PP assemblies); out of range: <strong>A</strong> flag;`,
      `value greater than the current position: part of the word is reassembled, the new code being ORed with the data already present;`,
      `smaller value: zero bits are generated down to the given position;`,
      `value 0: the word is considered complete and subsequent code goes into the next word;`,
      `${c('POS *P')}: no effect; ${c('POS $')}: subtracts one from the position (${c('$')} is *P − 1).`,
    ]),
    p(`${c('POS')} cancels no forcing upper: a following machine instruction that does not fit in the rest of the word causes the usual force upper. Using ${c('POS')} on a word containing relocatable or external addresses may give incorrect results without a diagnostic.`),
    ex(`
          VFD    30/1
          POS    45              BACK TO BIT 44
          VFD    15/2            ORED - 0000000003
          POS    *P
          POS    $               SKIPS ONE BIT
          VFD    14/3
`),
    ex(`
          IDENT  PP,100B
          PERIPH
          ORG    100B
          VFD    6/77B
          POS    3               ZEROS DOWN TO POSITION 3
          VFD    3/7             WORD 7707
          END
`),
    ex(`
          POS    61
          POS    -1
`, { errors: ['A'] }),
    deviation(`${c('POS')} without a variable field is flagged 8, followed by an A flag (internal error in pass two).`),
    p(`See also: ${see('ps-vfd', 'VFD')}, ${see('lang-counters', 'position counter')}, ${see('lang-special', 'special elements')}.`),
  ].join('\n'),
};

// =====================================================================
// Symbol definition
// =====================================================================

const symIntro = p(`The values given to symbols by ${c('EQU')}, ${c('=')}, ${c('SET')}, ${c('MAX')}, ${c('MIN')} and ${c('MICCNT')} are 21-bit quantities: the expression value is reduced to 21 bits with sign extension (${see('lang-expressions', 'expressions')}). They may be absolute, relocatable or external; register designators are not valid in them. These instructions generate no code and do not force upper; in the symbolic reference table, the line that defines the symbol is flagged ${c('D')}. On the listing, the code column shows the value in octal (a negative value appears as an 18-bit one's complement).`);

const equ = {
  id: 'ps-equ',
  title: 'EQU and = — permanent symbol definition',
  keys: ['EQU', '='],
  syntax: ['sym       EQU    exp', 'sym       =      exp'],
  html: [
    symIntro,
    p(`${c('EQU')} and ${c('=')} are synonyms. They define ${c('sym')} permanently, with the value and attributes (absolute, relocatable in a block, external) of the expression.`),
    ul([
      `<strong>sym</strong> (required): valid symbol (${see('lang-symbols', 'symbols')}); missing or invalid: <strong>L</strong> flag;`,
      `<strong>exp</strong>: evaluatable expression whose symbols are previously defined or declared external; a ${c('=S')}, ${c('=X')}, ${c('=Y')} default symbol is allowed only if it is also defined conventionally;`,
      `erroneous expression: the symbol is not defined, the flag depends on the cause (U undefined symbol or forward reference, A incorrect expression or incorrect relocation); a register name (${c('B1')}, ${c('X2')}, …) is read as an ordinary symbol, hence the U flag if it is not defined (the manual specifies A);`,
      `symbol already defined by another statement, or declared external: <strong>D</strong> flag, the first definition holds.`,
    ]),
    ex(`
OPS       =      20437B
LINE      =      74B
PAGESIZ   EQU    3
LGOPS     =      LINE
TAG       BSS    5
LEN       EQU    *-TAG           5
REL       EQU    TAG+1           RELOCATABLE
NEG       EQU    -1              LISTED 777776
`),
    ex(`
          EQU    1               LOCATION MISSING
ERR1      EQU    UNDEF
FWD       EQU    LATER           FORWARD REFERENCE
LATER     EQU    2
OPS       EQU    1
OPS       EQU    2               ALREADY DEFINED
`, { errors: ['D', 'L', 'U'] }),
    ex(`
          EXT    EX1
E2        EQU    EX1             EXTERNAL
EX1       EQU    1               DECLARED EXTERNAL
`, { errors: ['D'] }),
    deviation(`Redefining a symbol by EQU with exactly the same value and attributes is accepted without a D flag.`),
    note(`In a CPU assembly, a symbol that looks like a register designator (${c('A1')}, ${c('B2')}, ${c('X7')}, …) is accepted but receives the informative 6 flag.`),
    p(`See also: ${see('ps-set', 'SET')}, ${see('lang-symbols', 'symbols')}, ${see('lang-relocation', 'relocation')}.`),
  ].join('\n'),
};

const set = {
  id: 'ps-set',
  title: 'SET — redefinable symbol definition',
  keys: ['SET'],
  syntax: ['sym       SET    exp'],
  html: [
    symIntro,
    p(`${c('SET')} defines or redefines ${c('sym')}. A symbol defined by ${c('SET')}, ${c('MAX')}, ${c('MIN')} or ${c('MICCNT')} can be redefined by any of these four instructions; any other previously defined symbol produces the <strong>D</strong> flag.`),
    ul([
      `<strong>sym</strong> (required): missing or invalid, <strong>L</strong> flag;`,
      `<strong>exp</strong>: no as-yet-undefined symbols; ${c('=S')}, ${c('=X')}, ${c('=Y')} only if also defined conventionally;`,
      `erroneous expression: the symbol is neither defined nor redefined; informative <strong>2</strong> flag;`,
      `a SET symbol cannot be referenced before its first definition: the reference is flagged U.`,
    ]),
    p(`Successive values are respected in pass two: each statement sees the value of the most recent ${c('SET')} preceding it.`),
    ex(`
AA        EQU    15              17B
BB        SET    *P              60 = 74B
CC        SET    AA+3            18 = 22B
CC        SET    CC+2            20 = 24B
          SX6    CC              20
CC        SET    1
          SX7    CC              1
`),
    ex(`
BB        SET    1
BB        =      BB+2            BB IS REDEFINABLE - D
DD        SET    FF+1            FF UNDEFINED - 2
          BSS    GG              REFERENCE BEFORE DEFINITION
GG        SET    16
`, { errors: ['2', 'D', 'U'] }),
    p(`See also: ${see('ps-equ', 'EQU')}, ${see('ps-max', 'MAX')}, ${see('ps-qual', 'QUAL')} (redefinition within a qualified sequence).`),
  ].join('\n'),
};

const maxE = {
  id: 'ps-max',
  title: 'MAX — largest of several values',
  keys: ['MAX'],
  syntax: ['sym       MAX    exp1,exp2,…,expn'],
  html: [
    symIntro,
    p(`${c('MAX')} defines or redefines ${c('sym')} with the largest (most positive) of the values, and the attributes of the expression selected. The symbol is redefinable by ${c('SET')}, ${c('MAX')}, ${c('MIN')}, ${c('MICCNT')}, and vice versa.`),
    ul([
      `<strong>sym</strong> required (otherwise <strong>L</strong> flag);`,
      `each expression is evaluatable, with previously defined symbols; attributes are not compared (comparing quantities of the same kind is the programmer's responsibility);`,
      `the selection is made in pass one with pass-one values (relocatable symbols relative to the origin of their block); in pass two, the selected expression is reevaluated with final values;`,
      `an erroneous expression, or a blank variable field: symbol not defined, informative <strong>2</strong> flag;`,
      `the symbol cannot be referenced before its first definition.`,
    ]),
    ex(`
PT3       EQU    5
PT31      EQU    0
PT32      EQU    2
SYM       MAX    PT3,PT31,PT32   5
SYM       SET    SYM+1           6
`),
    ex(`
TABA      BSS    1
TABB      BSS    1
HIGH      MAX    TABB,TABA       RELOCATABLE - TABB
          SX6    HIGH
`),
    ex(`
PT3       EQU    5
S3        MAX    PT3,UNDEF
          MAX    1
PT3       MAX    1               PT3 DEFINED BY EQU
`, { errors: ['2', 'D', 'L'] }),
    p(`See also: ${see('ps-min', 'MIN')}, ${see('ps-set', 'SET')}.`),
  ].join('\n'),
};

const minE = {
  id: 'ps-min',
  title: 'MIN — smallest of several values',
  keys: ['MIN'],
  syntax: ['sym       MIN    exp1,exp2,…,expn'],
  html: [
    symIntro,
    p(`${c('MIN')} is identical to ${see('ps-max', 'MAX')}, but selects the smallest (least positive) of the values. Same rules: location field required (L flag), selection in pass one then reevaluation of the selected expression in pass two, 2 flag on an erroneous expression or blank field, symbol redefinable by SET, MAX, MIN, MICCNT.`),
    ex(`
PT3       EQU    5
PT31      EQU    0
PT32      EQU    2
SYM2      MIN    PT3,PT31,PT32   0
LIM       MIN    -3,PT32         -3, LISTED 777774
`),
    ex(`
S4        MIN
`, { errors: ['2'] }),
    p(`See also: ${see('ps-max', 'MAX')}, ${see('ps-set', 'SET')}.`),
  ].join('\n'),
};

const miccnt = {
  id: 'ps-miccnt',
  title: 'MICCNT — set symbol to micro size',
  keys: ['MICCNT'],
  syntax: ['sym       MICCNT mname'],
  html: [
    p(`${c('MICCNT')} defines or redefines ${c('sym')} with the number of characters in the current value of micro ${c('mname')}. The value is absolute; the symbol is redefinable by ${c('SET')}, ${c('MAX')}, ${c('MIN')}, ${c('MICCNT')}. Permitted anywhere, including the first statement group.`),
    ul([
      `<strong>sym</strong> required (otherwise <strong>L</strong> flag);`,
      `<strong>mname</strong>: previously defined micro — system micro (${c('DATE')}, ${c('TIME')}, ${c('BASE')}, ${c('CODE')}, ${c('QUAL')}, …), or defined by ${see('ps-micro', 'MICRO')}, ${c('OCTMIC')}, ${see('ps-decmic', 'DECMIC')}, or by the location field of ${c('BASE')}, ${c('CODE')}, ${c('QUAL')}; unknown micro: symbol neither defined nor redefined, informative <strong>2</strong> flag.`,
    ]),
    ex(`
MSG       MICRO  1,,*STRING*     6-CHARACTER MICRO
MSIZE     MICCNT MSG             6
MSG       MICRO  1,,*ALPHANUMERIC STRING*
MSIZE     MICCNT MSG             19, LISTED 23
`),
    ex(`
LG        MICCNT NOMIC
          MICCNT DATE
`, { errors: ['2', 'L'] }),
    p(`See also: ${see('ps-micro', 'MICRO')}, ${see('ps-set', 'SET')}.`),
  ].join('\n'),
};

const sst = {
  id: 'ps-sst',
  title: 'SST — system symbol table',
  keys: ['SST'],
  syntax: ['          SST    [sym1,sym2,…]'],
  html: [
    p(`${c('SST')} defines in the subprogram the symbols of the system text loaded at the beginning of the assembly (${see('ps-stext', 'STEXT')}), as if they had been defined by the program, except those listed in the variable field. The micros and operations of a system text are always available; its symbols are available only after ${c('SST')}. The location field is ignored. Permitted anywhere.`),
    ul([
      `only absolute, unqualified, nonredefinable symbols of the system text are available;`,
      `a program definition with the same name prevails, without a diagnostic, over the system symbol, whether it precedes or follows ${c('SST')};`,
      `in the symbolic reference table, the block column of an SST symbol shows the originating system text.`,
    ]),
    p(`With a system text that defines ${c('ARGR EQU 2')} and ${c('PGNR EQU 64B')}:`),
    src(`
          IDENT  P
          SST    ARGR            ALL EXCEPT ARGR
          SX6    PGNR            64B
          SX7    ARGR            UNDEFINED - U
          END
`),
    p(`The ${c('SYSTEXT')} system text used by default in this project defines only micros, macros and opdefs: ${c('SST')} has no effect with it.`),
    ex(`
          IDENT  SSTX
          SST
          SX6    1
          END
`),
    p(`See also: ${see('ps-stext', 'STEXT')}, ${see('ps-if', 'IF SST')}, ${see('sys-intro', 'system text')}.`),
  ].join('\n'),
};

// =====================================================================
// Subprogram linkage
// =====================================================================

const entry = {
  id: 'ps-entry',
  title: 'ENTRY and ENTRYC — entry points',
  keys: ['ENTRY', 'ENTRYC'],
  syntax: ['          ENTRY  sym1,sym2,…,symn', '          ENTRYC sym1,sym2,…,symn'],
  html: [
    p(`${c('ENTRY')} declares entry points: symbols of the subprogram that independently assembled subprograms can reference (${see('lang-linkage', 'linkage symbols')}). These instructions do not define symbols. The location field is ignored. Legal in CPU relocatable and absolute assemblies; in PP assemblies, <strong>O</strong> flag.`),
    ul([
      `each <strong>sym</strong> is a linkage symbol: 1 to 7 characters, first character alphabetic, last not a colon (otherwise <strong>A</strong> flag);`,
      `it must be defined in the subprogram, as nonexternal and unqualified; the declaration may precede the definition, since the check is made at the end. Not defined (or defined only under a qualifier): <strong>U</strong> flag on the ENTRY line;`,
      `negative relocation: <strong>N</strong> flag;`,
      `the listing contains, after the block summary, the list of entry points with their address and relocation (${c('*******')} for an undefined entry point); a ${c('*')} follows the name of a conditional entry point (the manual places this list before the code listing).`,
    ]),
    p(`<strong>ENTRYC</strong> declares conditional entry points: in a relocatable program, the loader ignores the entry point if its value is relative to a common block first declared by a previously loaded subprogram (bit 59 of the entry in the 3600B ENTR table). In an absolute program, ${c('ENTRYC')} is synonymous with ${c('ENTRY')}. The SCOPE 2 loader does not support ENTRYC.`),
    p(`<strong>In a CPU absolute program</strong>, ${c('ENTRY')} replaces the 5000B overlay table with a 5100B multiple entry point table: a control word (levels, number of entries) followed by one word per entry point (name and address), that is, one word more than the number of entries; it precedes the image, and the manual places it below the overlay origin (load address origin − number of entries − 1).`),
    ex(`
          IDENT  P
          ENTRY  START,ALT
          ENTRYC CNDE
          EXT    SUB1
START     RJ     SUB1
ALT       SX6    1
          USE    /BLK/
CNDE      BSS    1               RELATIVE TO THE COMMON BLOCK
          END    START
`),
    ex(`
          IDENT  P,100B,GO
          ABS
          ENTRY  GO,GO2          5100B TABLE
          ORG    100B
GO        SX6    1
GO2       SX6    2
          END
`),
    ex(`
          IDENT  P
          ENTRY  NONE            NEVER DEFINED
          ENTRY  1BAD
          ENTRY  NEG
NEG       EQU    -*              NEGATIVE RELOCATION
          END
`, { errors: ['A', 'N', 'U'] }),
    p(`See also: ${see('ps-ext', 'EXT')}, ${see('ps-end', 'END')}, ${see('lang-linkage', 'linkage')}.`),
  ].join('\n'),
};

const ext = {
  id: 'ps-ext',
  title: 'EXT — declare external symbols',
  keys: ['EXT'],
  syntax: ['          EXT    sym1,sym2,…,symn'],
  html: [
    p(`${c('EXT')} declares strong externals: symbols defined as entry points in other subprograms and referenced in this one (${see('lang-linkage', 'linkage symbols')}). The loader links them (4400B LINK table). The location field is ignored. Relocatable programs only: in absolute and PP assemblies, <strong>O</strong> flag.`),
    ul([
      `each <strong>sym</strong>: 1 to 7 characters, first character alphabetic (otherwise <strong>A</strong> flag);`,
      `it must not be defined within the subprogram: declaring an already defined symbol, or later defining a symbol declared external, produces the <strong>D</strong> flag;`,
      `externals are unqualified;`,
      `more than 511 externals: <strong>F</strong> flag;`,
      `an expression containing an external must reduce to that external plus or minus a constant; two externals, or an external and a relocatable term: A flag;`,
      `on the listing, a word containing an external reference is flagged ${c('X')}; the list of externals appears in the listing, after the block summary.`,
    ]),
    p(`A symbol prefixed by ${c('=X')} or ${c('=Y')} and not defined automatically becomes an external (strong or weak) at the end of the assembly (${see('lang-default-symbols', 'default symbols')}).`),
    ex(`
          IDENT  P
          EXT    SUB1,SUB2
          RJ     SUB1            FLAGGED X
          SA1    SUB2+1
          CON    SUB2
          END
`),
    ex(`
          IDENT  P
          EXT    LOCL
LOCL      BSS    1               DECLARED EXTERNAL
          EXT    9X
          SX6    LOCL+LOCL
          END
`, { errors: ['A', 'D'] }),
    ex(`
          IDENT  P,100B
          ABS
          EXT    X               ABSOLUTE - ILLEGAL
          END
`, { errors: ['O'] }),
    p(`See also: ${see('ps-entry', 'ENTRY')}, ${see('lang-relocation', 'relocation')}.`),
  ].join('\n'),
};

// =====================================================================
// Data generation
// =====================================================================

const bssz = {
  id: 'ps-bssz',
  title: 'BSSZ and blank operation field — zeroed words',
  keys: ['BSSZ'],
  syntax: ['[sym]     BSSZ   aexp', 'sym                          (blank operation field = BSSZ 1)'],
  html: [
    p(`${c('BSSZ')} reserves words in the block in use, as ${see('ps-bss', 'BSS')} does, but generates zero words to be loaded at these addresses. A line with only a symbol in the location field and a blank operation field is equivalent to ${c('sym BSSZ 1')}. ${c('BSSZ')} forces upper first.`),
    ul([
      `<strong>sym</strong> (optional): value of the location counter after force upper;`,
      `<strong>aexp</strong>: absolute evaluatable expression; relocatable or external: <strong>A</strong> flag; undefined symbol: U flag;`,
      `negative value: informative 7 flag, and no word is reserved;`,
      `${c('BSSZ 0')} or erroneous expression: force upper and symbol definition, no storage;`,
      `illegal in the blank common of a relocatable program and in the ECS/LCM blocks where data is prohibited (<strong>R</strong> flag);`,
      `on the listing, the first zero word is shown (the following ones with the ${c('LIST D')} option).`,
    ]),
    p(`The manual specifies that in a relocatable program an area of 6 words or more be passed to the loader through a REPL replication table rather than as text; this assembler emits the zero words in the text tables.`),
    ex(`
          SX6    1
ZONE      BSSZ   3               THREE ZERO WORDS
WORD                             ONE ZERO WORD
          BSSZ   0
          SX6    ZONE
`),
    ex(`
          BSSZ   -1
ZONE      BSSZ   1
          BSSZ   ZONE
          USE    //
          BSSZ   1
`, { errors: ['7', 'A', 'R'] }),
    p(`See also: ${see('ps-bss', 'BSS')}, ${see('ps-data', 'DATA')}.`),
  ].join('\n'),
};

const dataE = {
  id: 'ps-data',
  title: 'DATA — generate data words',
  keys: ['DATA'],
  syntax: ['[sym]     DATA   item1,item2,…,itemn'],
  html: [
    p(`${c('DATA')} generates in the block in use one or more complete words per item: 60-bit words on the CPU, 12-bit words in PERIPH and PPU assemblies, 16-bit words in CIPPU assemblies. ${c('DATA')} always forces upper. The location-field symbol receives the address of the first word.`),
    h4('Data items'),
    ul([
      `character, octal, decimal or hexadecimal data items (${see('lang-character-data', 'character')}, ${see('lang-numeric-data', 'numeric')}, ${see('lang-hex', 'hexadecimal')}): ${c('0LOUTPUT')}, ${c('H*ABC*')}, ${c('10HABCDEFGHIJ')}, ${c('-7')}, ${c('1.3E1')}, ${c('17070B')}, ${c('1R1')}, …, separated by commas, terminated by a blank;`,
      `a numeric item occupies one word (a double-precision floating-point item, two words on the CPU); a negative number is represented in one's complement; in PP assemblies, a value that does not fit in the word receives the 7 flag;`,
      `a character item occupies as many words as needed (10 six-bit characters per CPU word, 2 per 12-bit PP word); types C and Z guarantee trailing zero bits and may add a word;`,
      `an empty item (${c(',,')}, ${c('0L')}) generates nothing;`,
      `floating-point constants are illegal in PP assemblies, and literals (${c('=…')}) are not data items: <strong>A</strong> flag; an incorrect item (symbol, expression): A flag.`,
    ]),
    p(`The listing shows only the first word of the first item, unless the ${c('LIST D')} option is selected.`),
    ex(`
OPTS      DATA   0LLGO           14071700000000000000
OPT       DATA   0
OPTY      DATA   0LOUTPUT,0      TWO WORDS
          DATA   1.3E1           FLOATING 13.0
          DATA   H*ABC*,10HABCDEFGHIJ,-7,17070B
          DATA   ,,0L            NOTHING
          DATA   1.0D0           DOUBLE PRECISION - TWO WORDS
`),
    ex(`
          IDENT  PP,100B
          PERIPH
          BASE   M
          ORG    100B
          DATA   7070,-7,0,1R1   7070 7770 0000 0034
          DATA   2C A            5501 0000
          DATA   123,-4          0123 7773
          DATA   H*DATA*         0401 2401
          END
`),
    ex(`
          DATA   =1
          DATA   X
`, { errors: ['A'] }),
    p(`See also: ${see('ps-con', 'CON')}, ${see('ps-dis', 'DIS')}, ${see('ps-lit', 'LIT')}, ${see('ps-code', 'CODE')}.`),
  ].join('\n'),
};

const dis = {
  id: 'ps-dis',
  title: 'DIS — words of character data',
  keys: ['DIS'],
  syntax: ['[sym]     DIS    n,string', '[sym]     DIS    ,dstringd'],
  html: [
    p(`${c('DIS')} generates words of characters, converted according to the ${see('ps-code', 'CODE')} in effect. ${c('DIS')} forces upper; the location-field symbol receives the address of the first word. The listing shows only the first word, unless the ${c('LIST D')} option is selected.`),
    h4('Format one: word count'),
    ul([
      `<strong>n</strong>: absolute evaluatable expression giving the number of words; with base M, read as decimal; undefined symbol: <strong>U</strong> flag;`,
      `the 10n characters (CPU) or 2n characters (PP) immediately following the comma are taken as they are, blanks and commas included, and stored 10 (or 2) per word; if the statement ends earlier, the requested words are filled with blanks;`,
      `${c('n')} zero: the statement is treated as format two.`,
    ]),
    h4('Format two: delimited string'),
    ul([
      `the comma is required; the character following it is the delimiter, and the string consists of the characters up to the next occurrence of the delimiter;`,
      `the characters are stored in as many words as needed, and <strong>12 zero bits</strong> are guaranteed at the end of the string: if fewer than 12 bits remain in the last word, an additional zero word is generated;`,
      `closing delimiter missing: <strong>A</strong> flag (the string extends to the end of the statement).`,
    ]),
    p(`Variable field without a comma: A flag, no word; blank variable field: 8 flag.`),
    ex(`
ONE       DIS    2,GENERATE 2 CPU WORDS
TWO       DIS    ,*GENERATE 2 CPU WORDS*
          DIS    1,AB            AB FOLLOWED BY 8 BLANKS
          DIS    ,*ABCDEFGHI*    9 CHARACTERS - 2 WORDS
          DIS    ,*ABCDEFGH*     8 CHARACTERS - 1 WORD
`),
    p(`${c('ONE')} gives ${c('07051605220124055535')} and ${c('55032025552717220423')}; ${c('TWO')} gives the same words followed by a zero word, since the second word is full.`),
    ex(`
          IDENT  PP,100B
          PERIPH
          BASE   M
          ORG    100B
          DIS    10,GENERATE 10 PP WORDS
          DIS    ,*GENERATE 10 PP WORDS*
          END
`),
    p(`In the PP assembly, the first statement gives the 10 words ${c('0705 1605 2201 2405 5534 3355 2020 5527 1722 0423')}; the second, the same words followed by ${c('0000')}.`),
    ex(`
          DIS    ,*ABC
          DIS    5
          DIS
`, { errors: ['8', 'A'] }),
    deviation(`When the word count is an undefined symbol, the U flag is accompanied by processing as format two, which usually also produces the A flag.`),
    p(`See also: ${see('ps-data', 'DATA')}, ${see('lang-character-data', 'character data')}.`),
  ].join('\n'),
};

const lit = {
  id: 'ps-lit',
  title: 'LIT — declare literal values',
  keys: ['LIT'],
  syntax: ['[sym]     LIT    item1,item2,…,itemn'],
  html: [
    p(`${c('LIT')} generates words in the literals block ${c('LITERALS*')}; together with the ${c('=')} literal prefix in expressions (${see('lang-literals', 'literals')}), it is the only way to place data there. ${c('LIT')} guarantees that its words are sequential, which makes it possible to build a table. It does not force upper and does not change the counters of the block in use.`),
    ul([
      `<strong>sym</strong> (optional): defined as the address, in the literals block, of the first word of the sequence; it is relocatable in a relocatable assembly;`,
      `<strong>items</strong>: as for ${see('ps-data', 'DATA')} (character, octal, decimal), entered in the order given; at least one word and at most 100: no word (${c('0L')}, blank field): <strong>A</strong> flag; more than 100 words: <strong>F</strong> flag; floating point illegal in PP assemblies;`,
      `<strong>duplicate elimination</strong>: if the complete sequence of words already exists in the literals block, nothing is generated and sym receives the address of the existing sequence; otherwise, if the beginning of the sequence matches the last words of the block, only the unduplicated part is appended; otherwise the whole sequence is appended. An ${c('=…')} literal likewise reuses words already present, including those of LIT;`,
      `on the listing, the code column shows the address of the first word; the contents of the literals block are listed with the ${c('LIST D')} option.`,
    ]),
    ex(`
          SX6    1
POOL      LIT    1,2,3           LITERALS 0 TO 2
P2        LIT    2,3             EXISTING SEQUENCE - POOL+1
P3        LIT    3,4             OVERLAP - APPENDS 4
          SA1    =4              REUSES WORD 4
          SX6    POOL
`),
    src(`
         0 7160000001                             SX6    1
                              2         POOL      LIT    1,2,3
                              3         P2        LIT    2,3
                              4         P3        LIT    3,4
                     5110000005 +                 SA1    =4
`),
    ex(`
          IDENT  PP,100B
          PERIPH
          BASE   M
          ORG    100B
N2        LIT    1R1,7070,7,0    0034 7070 0007 0000
          LIT    2C A,2LEF       5501 0000 0506
          LIT    H*LITERALS*     1411 2405 2201 1423
          LDC    N2
          END
`),
    ex(`
EMPTY     LIT    0L
          LIT
`, { errors: ['A'] }),
    p(`See also: ${see('lang-literals', 'literals')}, ${see('ps-data', 'DATA')}, ${see('lang-blocks', 'literals block')}.`),
  ].join('\n'),
};

const vfd = {
  id: 'ps-vfd',
  title: 'VFD — variable field definition',
  keys: ['VFD'],
  syntax: ['[sym|+|-]  VFD    n1/exp1,n2/exp2,…,nm/expm'],
  html: [
    p(`${c('VFD')} places expression values into fields whose size in bits is given by the user, packed from left to right in the block in use, starting at the position counter. Fields may cross word boundaries.`),
    h4('Location field'),
    T([
      ['symbol', 'force upper, then the symbol receives the value of the location counter: it identifies the first word of the data', 'the data begins in the next word (if the current one is partially filled)'],
      [c('+'), 'force upper: the data begins in a new word', 'same'],
      [c('-'), 'no force upper and no no-operation instructions: zero bits are generated up to the next quarter-word (15-bit parcel) boundary, where the first field begins', 'same'],
      ['blank', 'the first field begins at the current position counter value', 'same'],
    ], ['Location', 'CPU', 'PP']),
    h4('Fields'),
    ul([
      `<strong>ni</strong>: number of bits, constant or previously defined symbol, from 1 to 60; with base M, read as decimal (with base O, as octal). Zero, negative, missing or incorrect size: <strong>V</strong> flag and field ignored; size greater than 60: V flag and a 60-bit field. A subfield without ${c('/')}: V flag;`,
      `<strong>expi</strong>: absolute, relocatable or external expression, evaluated with the field size: a character constant is justified in the field according to its type. Value too large: informative <strong>7</strong> flag, value truncated. Undefined symbol: U flag;`,
      `in a relocatable assembly, a field containing a relocatable or external address must not cross a word boundary: <strong>A</strong> flag.`,
    ]),
    h4('End of a VFD (CPU)'),
    p(`After a ${c('VFD')}, the position counter is the number of bits remaining in the last word. A ${c('VFD')} with a blank location field immediately following another ${c('VFD')} in the same block continues without padding. If the next code-generating statement in the block is not such a ${c('VFD')}, and the last field ended left of a parcel boundary, zero bits (not listed) are inserted up to that boundary; a machine instruction may then occupy the remaining parcels, and a force upper, if any, fills them with no-operation instructions.`),
    p(`In PP assemblies there is no forcing upper: an instruction that follows a word partially filled by ${c('VFD')} begins in the next word (the rest of the word is set to zero).`),
    ex(`
TABLE     VFD    36/0LTAB,6/19,18/TABLE
          VFD    30/-1,30/1      7777777776 0000000001
`),
    ex(`
          VFD    12/1
          SX6    1               ZEROS TO BIT 45, THEN SX6
          VFD    12/2
          VFD    12/3            CROSSES THE WORD - 3 + 9 BITS
+         VFD    12/4            NEW WORD
-         VFD    6/5             ZEROS TO BIT 45
          SX7    2
`),
    src(`
         0 0001                                   VFD    12/1
                7160000001                        SX6    1
                          0002                    VFD    12/2
                              0                   VFD    12/3
         1 003
         2 0004                         +         VFD    12/4
                05                      -         VFD    6/5
                     7170000002                   SX7    2
`),
    ex(`
          IDENT  PP,100B
          PPU
          BASE   M
          ORG    100B
N4        VFD    60/10R0123456789   FIVE PP WORDS
A11       VFD    12/10,12/11,12/-12 0010 0011 7765
          VFD    6/1
          VFD    6/2             SAME WORD - 0102
-         VFD    6/3             NEW WORD - 0300
          LDN    1               NEXT WORD
          END
`),
    ex(`
          VFD    61/1
          VFD    0/1
          VFD    12
          VFD    6/100B          TRUNCATED
          VFD    6/UNDEF
`, { errors: ['7', 'U', 'V'] }),
    ex(`
TAB       VFD    12/1
          VFD    18/0
          VFD    42/TAB          ADDRESS CROSSES TWO WORDS
`, { errors: ['A'] }),
    p(`See also: ${see('ps-pos', 'POS')}, ${see('ps-con', 'CON')}, ${see('lang-force', 'force upper')}, ${see('lang-character-data', 'character constants')}.`),
  ].join('\n'),
};

const con = {
  id: 'ps-con',
  title: 'CON — generate constants',
  keys: ['CON'],
  syntax: ['[sym]     CON    exp1,exp2,…,expn'],
  html: [
    p(`${c('CON')} generates one full word per expression in the block in use (60 bits on the CPU, 12 in PERIPH and PPU assemblies, 16 in CIPPU assemblies). ${c('CON')} always forces upper; the location-field symbol receives the address of the first word. It differs from ${see('ps-data', 'DATA')} (which takes data items, not expressions) and from ${see('ps-vfd', 'VFD')} (whose fields have a free size).`),
    ul([
      `each expression is absolute, relocatable or external, evaluated with a field size of one word; it may reference symbols defined later;`,
      `a relocatable or external address gives an address constant over the full word (${c('+')}, ${c('C')} or ${c('X')} mark on the listing), which is not appropriate for capsules;`,
      `value too large: <strong>7</strong> flag; undefined symbol: U flag; incorrect relocation (sum of two addresses, and so on): A flag;`,
      `floating-point constants are illegal in PP assemblies, and double precision on the CPU;`,
      `blank variable field: 8 flag.`,
    ]),
    ex(`
          CON    55B             00000000000000000055
          CON    -1,TAB          77777777777777777776, ADDRESS
TAB       CON    1R+             45B
          CON    1.5             FLOATING
`),
    ex(`
          IDENT  PP,100B
          PPU
          ORG    100B
FAIL      CON    12B             0012
PASS      CON    FAIL,PASS       0100 0101
          END
`),
    ex(`
TAB       CON    TAB+TAB
          CON    1000000000000000000000B
          CON
`, { errors: ['7', '8', 'A'] }),
    deviation(`A register name (${c('X1')}, …) in CON is read as a symbol and produces the U flag if it is not defined, instead of the A flag specified by the manual.`),
    p(`See also: ${see('ps-data', 'DATA')}, ${see('ps-vfd', 'VFD')}, ${see('lang-relocation', 'relocation')}.`),
  ].join('\n'),
};

const rEq = {
  id: 'ps-r',
  title: 'R= — conditional increment instruction',
  keys: ['R='],
  syntax: ['[sym]     R=     reg,exp'],
  html: [
    p(`${c('R=')} generates an increment unit instruction (${c('SAi')}, ${c('SBi')}, ${c('SXi')}) whose form depends on the subfields and on a prior ${see('ps-b1', 'B1=1 or B7=1')}. It is intended for macros, which thereby obtain the shortest instruction. CPU only (<strong>O</strong> flag in PP assemblies).`),
    ul([
      `<strong>sym</strong> (optional): force upper, then the symbol receives the location counter; this force upper occurs whether or not ${c('R=')} generates an instruction. Without a symbol, the ordinary placement rules apply;`,
      `<strong>reg</strong>: letter ${c('A')}, ${c('B')} or ${c('X')} followed by a digit 0 to 7, appended to ${c('S')} to form the operation code; otherwise <strong>A</strong> flag;`,
      `<strong>exp</strong>: register or value expression that determines the variable field of the generated instruction.`,
    ]),
    T([
      ['exp identical to reg (R= B5,B5)', 'no instruction'],
      ['value 0', c('Sreg B0')],
      ['value 1, 2, −1 after B1=1', `${c('Sreg B1')}, ${c('Sreg B1+B1')}, ${c('Sreg -B1')}`],
      ['value 1, 2, −1 after B7=1', `${c('Sreg B7')}, ${c('Sreg B7+B7')}, ${c('Sreg -B7')}`],
      ['other case', `${c('Sreg exp')} (15-bit register form or 30-bit K form)`],
    ], ['Subfields', 'Instruction generated']),
    p(`The selection is made in pass one: a value defined later does not allow the short form. The A list option lists the substituted instruction.`),
    ex(`
          B1=1
          R=     X1,1            SX1 B1      76110
          R=     X2,2            SX2 B1+B1   76211
          R=     A3,-1           SA3 -B1     57301
          R=     X4,0            SX4 B0      76400
          R=     X6,5            SX6 5       7160000005
          SX6    B1
REG       R=     B5,B5           NOTHING, BUT FORCE UPPER
          SX7    2
`),
    src(`
         0 76110                                  R=     X1,1
                76211                             R=     X2,2
                     57301                        R=     A3,-1
                          76400                   R=     X4,0
         1 7160000005                             R=     X6,5
                     76610                        SX6    B1
                                        REG       R=     B5,B5
         2 7170000002                             SX7    2
`),
    ex(`
          R=     X1,1            WITHOUT B1=1 - SX1 1 (30 BITS)
          R=     X2,X3+B4        SX2 X3+B4
          R=     Y1,1
          R=     X5,UNDEF
`, { errors: ['A', 'U'] }),
    p(`See also: ${see('ps-b1', 'B1=1')}, ${see('cpu-formats', 'CPU instructions')}, ${see('ps-macro', 'MACRO')}.`),
  ].join('\n'),
};

const rep = {
  id: 'ps-rep',
  title: 'REP, REPC, REPI — loader replication tables',
  keys: ['REP', 'REPC', 'REPI'],
  syntax: [
    '          REP    S/saddr,D/daddr,C/rep,B/bsz,I/inc',
    '          REPC   S/saddr,D/daddr,C/rep,B/bsz,I/inc',
    '          REPI   S/saddr,D/daddr,C/rep,B/bsz,I/inc',
  ],
  html: [
    p(`These instructions generate no code: they produce a REPL (4300B) replication table that directs the loader to copy a sequence of words. The location field is ignored. Relocatable programs only (<strong>O</strong> flag in absolute and PP assemblies). Subfields may be given in any order.`),
    T([
      [c('REPI'), 'immediate copy, as soon as the loader encounters the table'],
      [c('REP'), 'copy at the end of loading'],
      [c('REPC'), 'ignored if the destination address is in a common block first declared by a previously loaded subprogram; otherwise immediate copy (not supported by the SCOPE 2 loader)'],
    ], ['Instruction', 'Time of copy']),
    h4('Subfields'),
    ul([
      `<strong>S/saddr</strong> (required): relocatable expression, address of the first word to copy; missing: <strong>A</strong> flag and no table;`,
      `<strong>D/daddr</strong>: relocatable expression, address of the first word of the first copy; omitted: 0, and the loader uses saddr + bsz;`,
      `<strong>C/rep</strong>: number of copies, absolute (decimal with base M); 0 or 1: one copy;`,
      `<strong>B/bsz</strong>: number of words per copy, absolute (decimal with base M); 0 or 1: one word;`,
      `<strong>I/inc</strong>: increment in words between the first words of successive copies, absolute (decimal with base M); 0 or omitted: bsz. Copies are placed at daddr, daddr + inc, daddr + 2·inc, …;`,
      `a subfield of another form: A flag; symbols in S and D must be previously defined (otherwise U flag).`,
    ]),
    h4('Rules'),
    ul([
      `room for the copies must be reserved in the destination block (${c('ORG')}, ${c('ORGC')}, ${c('BSS')}): the counters of that block are not advanced by the replication;`,
      `replicated data must contain neither external references nor relocatable addresses relative to a common block;`,
      `with REPC and REPI, the data must belong to previously loaded text.`,
    ]),
    ex(`
          USE    BUFF
TAB       DATA   15,20,7070B,1,2,3.14
COPY      BSS    6*10            ROOM FOR 10 COPIES OF 6 WORDS
          USE    *
          REPI   S/TAB,D/COPY,C/10,B/6
`),
    ex(`
          REPC   D/1,C/2         S MISSING
          REP    S/1,X/1         UNKNOWN SUBFIELD
`, { errors: ['A'] }),
    ex(`
          IDENT  P,100B
          ABS
          REP    S/1             ABSOLUTE - ILLEGAL
          END
`, { errors: ['O'] }),
    p(`See also: ${see('ps-bss', 'BSS')}, ${see('ps-bssz', 'BSSZ')}, ${see('lang-binary', 'relocatable binary')}.`),
  ].join('\n'),
};

// =====================================================================
// Chapters
// =====================================================================

export const CHAPTERS = [
  {
    id: 'ps-ch-overview',
    title: 'Pseudo instructions: overview',
    intro: p(`Classification of pseudo instructions, first statement group, assembly types and legality matrix.`),
    entries: [vueA],
  },
  {
    id: 'ps-ch-ident',
    title: 'Subprogram identification',
    intro: p(`Every subprogram begins with ${c('IDENT')} and ends with ${c('END')}.`),
    entries: [ident, end],
  },
  {
    id: 'ps-ch-binary',
    title: 'Binary control',
    intro: p(`Assembly type (relocatable, absolute, PP), division into overlays and sections, contents of the loader tables.`),
    entries: [abs, machine, ppu, periph, cippu, segment, seg, stext, comment, nolabel, lcc, memsel, ldset],
  },
  {
    id: 'ps-ch-modes',
    title: 'Mode control',
    intro: p(`Numeric base, character code, symbol qualification, B register equal to one, comments column. Each mode has a default used if the instruction does not appear.`),
    entries: [base, char, code, qual, b1, col],
  },
  {
    id: 'ps-ch-blocks',
    title: 'Block counter control',
    intro: p(`Establishment of local blocks, labeled common and blank common (in addition to the absolute, zero and literals blocks created by the assembler), and control of the origin, location and position counters (${see('lang-blocks', 'blocks')}, ${see('lang-counters', 'counters')}).`),
    entries: [use, uselcm, org, bss, locE, pos],
  },
  {
    id: 'ps-ch-symbols',
    title: 'Symbol definition',
    intro: p(`Direct assignment of a value to a symbol, permanently (${c('EQU')}, ${c('=')}) or redefinably (${c('SET')}, ${c('MAX')}, ${c('MIN')}, ${c('MICCNT')}), and access to the symbols of a system text.`),
    entries: [equ, set, maxE, minE, miccnt, sst],
  },
  {
    id: 'ps-ch-linkage',
    title: 'Subprogram linkage',
    intro: p(`Declaration of entry points and external symbols; these instructions do not define symbols.`),
    entries: [entry, ext],
  },
  {
    id: 'ps-ch-data',
    title: 'Data generation',
    intro: p(`Only these pseudo instructions generate data; all other code comes from machine instructions. No data-generating instruction is permitted in the blank common of a relocatable program (R flag).`),
    entries: [bssz, dataE, dis, lit, vfd, con, rEq, rep],
  },
];
