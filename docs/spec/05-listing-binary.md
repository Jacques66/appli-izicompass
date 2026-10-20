# 05 - Control statement, listing format, binary output, dayfile, common decks

Source: *COMPASS Version 3 Reference Manual*, CDC 60492600 rev M (1986), chapters 10, 11, 12,
appendices B, C, D, E, plus the pseudo instructions of chapter 4 that drive the listing and the
binary (LIST, ERR/ERRxx, IDENT, SEGMENT, SEG, STEXT, COMMENT, NOLABEL, LCC, LDSET, MACHINE,
REP). Line numbers `Lnnnnn` refer to the OCR text `compass3.txt`.

Confidence tags used throughout:

- **[M]** stated by the manual (OCR checked, wording normalised).
- **[M?]** in the manual but OCR damaged; best reading given.
- **[X]** NOT in this manual. The manual says the loader table formats are "described in the
  Loader reference manual" (L3137, L4019, L4072). Content from general knowledge of the CYBER
  Loader (pub 60429800) / NOS conventions, **unverified**; treat it as our implementation
  choice and isolate it behind one module (`loader/tables.js`) so it can be corrected later.
- **[I]** inference / implementation decision where the manual is silent or the figure lost.

Important limitation: the PDF pages are JBIG2 scans and no renderer is installed, so every
listing figure (11-1, 11-2, the examples) is known only through the OCR, where horizontal
spacing is compressed. **The manual does not print column numbers for the listing line.**
The column map in section 3.4 is reconstructed (130-char width is [M], field order is [M],
the exact columns are [I]).

---

## 1. Program execution (chapter 10)

### 1.1 Control statement syntax [M] (L16081-16090)

- A control statement begins with the first nonblank character.
- A comma, a left parenthesis or a blank starts the parameter string. Parameters are
  separated by commas. A period or a right parenthesis ends the string. Comments may follow
  the terminator.
- Blanks inside the parameter string are ignored. A parameter normally has only letters and
  digits.
- A parameter between dollar signs (`$...$`) may hold any characters, and its blanks are
  kept. Inside it, `$$` stands for one `$`.
- If a parenthesis or period not inside a `$` string is never found, COMPASS reads
  continuation statements. At end of section it issues `NO CONTROL STATEMENT TERMINATOR.`
  (nonfatal, see section 7).

Formats:

```
COMPASS.
COMPASS(p1,p2,...,pn)
```

Each `p` is `mode`, `mode=0` or `mode=lfn`. `mode` is 1 or 2 characters. `lfn` is a 1-7
character file name or a character string. Parameters may be in any order. An unknown or
invalid parameter gives `BAD CONTROL STATEMENT ARGUMENT - xx` (xx = the bad argument).

### 1.2 Parameters [M] (L16113-16360)

| Param | Form | Meaning |
|---|---|---|
| **A** abort | omitted | Do not abort the job step for assembly errors. |
| | `A` | Abort the job step at end of run if any assembly error occurred. |
| **B** binary | omitted or `B` | Binary on the load-and-go file `LGO`. |
| | `B=0` | No binary output. |
| | `B=lfn` | Binary on file lfn. |
| **BL** burstable listing | `BL` | Page ejects between listing segments (storage allocation map, source code, cross reference). Even page count per program unit (blank page added at the end if needed). |
| | omitted or `BL=0` | Compact listing: no page parity, no segment ejects. |
| **D** debug | `D` | Binary is written on the B file in spite of assembly errors, whatever A says. A is ignored when D is given. D is ignored if `B=0`. |
| | omitted | Errors inhibit binary. With A: no binary at all for a subprogram with errors. Without A: the message `ERRORS IN ASSEMBLY` is written to the B file for each subprogram with errors (instead of its binary). |
| **E** error list | omitted | Error list on `OUTPUT`. |
| | `E` | Error list on file `ERRS`. |
| | `E=lfn` | Error list on lfn. |
| | `E=0` | No error list (same as sending it to the full-list file). |
| **F** FORTRAN mode | omitted or `F` | Special element `*F` = 0. |
| | `F=number` | `*F` = number (one decimal digit). |
| | `F=name` | `COMPASS`=0, `RUN`=1 (no longer supported), `FTN4`=2, `FTN5`=3. |
| **G** get system text | omitted or `G=0` | No system text from a sequential binary file. |
| | `G` | Load the first system text overlay, if any, from file `SYSTEXT`. |
| | `G=lfn` | Load the first system text overlay in sequential binary file lfn. |
| | `G=lfn/ovl` | Search lfn for an overlay named ovl and load the first one found. |
| **I** input | omitted | Source on `INPUT`. |
| | `I` | Source on `COMPILE`, compressed (UPDATE X option) or expanded. |
| | `I=0` | Illegal. |
| | `I=lfn` | Source on lfn. |
| **L** full list | omitted or `L` | Full list on `OUTPUT`. |
| | `L=lfn` | Full list on lfn. If the full list and the short list are on different files and P is not given, each subprogram listing is a separate section. Each section starts with a one-word header: `*` + first 6 characters of the subprogram name. |
| | `L=0` | No full list. |
| **LO** list options | omitted or `LO=0` | Options B, L, N, R only (the defaults). |
| | `LO` | Selects C, F, G, X and deselects R (so B,L,N,C,F,G,X). |
| | `LO=chars` | Up to 9 characters from A,B,C,D,E,F,G,L,M,N,R,S,T,X. B, L, N or R in the list **deselect** that option. Any other letter **selects** it. The base is the default set B,L,N,R. |
| | `LO=$` | Selects all options (OCR shows `LO=$$$$`; read as a `$` string, see [M?]). |
| | | Any LO other than `LO=0` **disables every LIST pseudo instruction** (L7762-7766). |
| **ML** MODLEVEL | omitted or `ML` | Micro `MODLEVEL` = value of `JDATE` at the start of each assembly. |
| | `ML=string` | `MODLEVEL` = string (9 chars max). |
| **N** no eject | omitted | Explicit ejects honoured. |
| | `N` | Ejects from TITLE and EJECT are suppressed. |
| **O** short list | omitted or `O` | Short list on `OUTPUT`. |
| | `O=lfn` | Short list on lfn. |
| | `O=0` | No short list. |
| **P** continue page | `P` | Page numbers continue from subprogram to subprogram (one continuous listing). End-of-record between routines on the L file is also suppressed. |
| | omitted | Page numbering restarts at 1 for each subprogram. |
| **PC** PCOMMENT | omitted or `PC` | Micro `PCOMMENT` = 30 blanks. |
| | `PC=string` | `PCOMMENT` = string, truncated on the right or blank-padded to exactly 30 chars. |
| **PD** print density | `PD=6` | 6 lines per inch. |
| | `PD=8` or `PD` | 8 lines per inch. |
| | other or omitted | Job default density. Affects listing files only. |
| **PS** page size | `PS=x` | x lines per page, 4 <= x <= 99. |
| | other or omitted | Job default lines per page. If PD is given: `PS = (PD * job default page size) / job default density`. |
| **S** system text name | omitted | If no G other than `G=0`: load overlay `SYSTEXT` from the job's global library set. |
| | `S=0` | No system text from a library. No effect if any other S or G is given. |
| | `S` | Load `SYSTEXT` from the global library set. |
| | `S=ovl` | Load overlay ovl from the global library set. |
| | `S=lib/ovl` | Load overlay ovl from library lib (user library file or system library). |
| **X** XTEXT source (blank-location XTEXT) | omitted | File `OLDPL`. |
| | `X` | File `OPL`. |
| | `X=lfn` | File lfn. |
| | `X=0` | Illegal. |

Rules [M]:

- E and O together are a control statement error. The error list and the short list are
  suppressed when they go to the same file as the full list, or when there is no error.
  When on a different file they hold every statement with an error flag, possibly with the
  macro call that generated the line.
- Up to **7** system text overlays per run, from G and S parameters in any order. They load
  in the order given. A system macro/micro/symbol defined by several texts keeps the **last**
  definition. More than 7 gives `MORE THAN 7 SYSTEM TEXTS SPECIFIED.` and aborts the step.
- Revision M notes mention a `PW` (page width) listing control, but chapter 10 does not
  document it. [I] Accept `PW=n` and ignore it, or use it as listing width (default 130).
- When COMPASS is called from FTN (IDENT in a FORTRAN deck), the FTN parameters apply, and
  IDENT must be in columns 11-15 (L3761).

Examples [M]:

```
COMPASS(B,D,S=OVI)        source INPUT, binary LGO, list OUTPUT, debug mode, system text OVI
COMPASS(LO=ASGXD)         LIST pseudo disabled; options A,S,G,X,D (+ B,L,N,R)
COMPASS(I,S,S=PFMTEXT,G=MYTEXT)   source COMPILE; texts SYSTEXT, PFMTEXT, local file MYTEXT
COMPASS(G=FILE/SCPTEXT,S=MYLIB/TEXT)
COMPASS(S=0,B=MYTEXT)     assemble a system text (STEXT) onto file MYTEXT
COMPASS(G=MYTEXT,S)       use it
```

### 1.3 Other job statements [M]

- `LGO.` loads and runs the CPU binary on LGO (file rewound first). If B named another file,
  call that file by name instead. PP programs can run only under the operating system with
  system origin privileges.
- 7/8/9 card: end of section, level 0 unless cols 2-3 hold an octal level. Level 17 = 6/7/8/9.
- 6/7/8/9 card: end of job deck (end of information).

### 1.4 Operator display [M] (L20564)

`ASSEMBLING xxxxxxx` is shown on the console (not in the dayfile). It is updated at each IDENT
with a non-blank variable field.

---

## 2. List options (LIST pseudo, section 4.11.1) [M]

`LIST o1,o2,...` : letter selects, `-letter` cancels, `$` selects all, `*` pops the previous
selection. A stack of the last **50** LIST settings is kept. `LIST *` with an empty stack gives
the defaults B, L, N, R. LIST is ignored when `L=0` or when LO (other than `LO=0`) is given.
Every LIST statement is itself always listed.

| Opt | Default | Effect |
|---|---|---|
| A | off | List statements as actually assembled: a line with concatenation/micro marks is listed before and after editing. Also lists lines generated by `R=`. |
| B | **on** | List binary control statements SEG, SEGMENT, IDENT, END. Also enables the binary control card summary and block usage summary (11.2). |
| C | off | List listing-control statements EJECT, SPACE, TTL, TITLE. A statement that ejects is listed as the first line of the new page. |
| D | off | Details: 2nd and later words of DATA and DIS; remote code assembled by HERE/END; literals block; default symbols. |
| E | off | All iterations of DUP and ECHO. |
| F | off | Lines skipped by IF, IFop, IFC, IFPP, IFCP, SKIP, ELSE. The reference table then includes references in IF statements. |
| G | off | Every code-generating line regardless of other controls except L (machine instructions, BSS, BSSZ, CON, DATA, DIS, R=, VFD). |
| L | **on** | Master control. When off, the long list holds only error lines, the error directory, LIST and END. |
| M | off | Lines generated by non-system macros and opdefs. |
| N | **on** | List non-referenced symbols in the reference table. When off, non-system symbols with no accumulated reference are omitted. |
| R | **on** | Accumulate references. Off at end of assembly: no reference table. |
| S | off | Lines generated by system macros/opdefs. |
| T | off | List SST symbols in the reference table even if not referenced. |
| X | off | Lines read by XTEXT (CTEXT/ENDX toggle this designator). |

For A, C, D, E, F, M, S, X, **all** applicable options must be on for a line to be listed
(DUP inside a macro needs M and E; XTEXT inside a system macro needs X and S; edited external
text in a DUP needs A, X and E).

Default listing (no LIST, LO omitted): heading information, assembly text, statistics, error
directory (only if errors), symbolic reference table. Assembly text excludes code generated
by RMT, DUP, ECHO, XTEXT, macro or opdef. For DATA, DIS, BSSZ producing several words only the
first word is listed. For VFD and CON all words are listed. For R= only the pseudo is listed.

---

## 3. Listing format (chapter 11)

### 3.1 Listing structure, in order

Per subprogram (IDENT ... END):

1. First page: header information (3.3): binary control card summary (B option), block usage
   summary (B option), entry point list, external symbol list.
2. Octal and source statement listing (3.4).
3. Default symbols (D option) (3.6).
4. Literals block (D option) (3.5).
5. Assembler statistics (3.7). Printed at the end of the source listing, or after the default
   symbols when D is on. **[M?]** The manual says default symbols "immediately precede the
   literals block" and statistics come "following the default symbols"; with D on, the order
   source -> default symbols -> literals -> statistics is the most consistent reading. [I]
6. Error directory, on a new page, only if errors (3.8).
7. Symbolic reference table (R and L options) (3.9).

With `BL`, page ejects separate the segments, and the unit gets an even page count.

### 3.2 Page heading [M] (L16673-16697)

Two heading lines on every page:

```
title                                       COMPASS  version  date  time  PAGE x
subtitle                                    sub-sub-title  block-name  symbol-qual
```

| Field | Content |
|---|---|
| title | Up to 62 chars: first TITLE, or TTL; else the IDENT variable field (L3764). |
| COMPASS version | e.g. `COMPASS 3.6-552` [I] for the exact text. The OCR examples show `COMPASS 3.71Z0`-like strings. |
| date | Date of assembly. [I] NOS format ` yy/mm/dd.` |
| time | Time of assembly, hours minutes seconds. [I] ` hh.mm.ss.` |
| PAGE x | Restarts at 1 at each END unless P. |
| subtitle | Up to 62 chars from 2nd and later TITLE, or CTEXT. |
| sub-subtitle | Up to 10 chars from the location field of the latest EJECT, SPACE, TITLE, TTL, or ES or PS machine instruction (L11811, L11851). If that statement also ejects, it is printed right after the heading (when C is on). |
| block name | Block in use at the start of the page. |
| symbol qual | Qualifier in use (QUAL). |

Special subtitles: `ERROR DIRECTORY` (error directory page), `SYMBOLIC REFERENCE TABLE.`
(reference table pages; with ` n LOST REFERENCES` added when references were lost).

[I] Proposed columns (130-char line, column 1 = first print position, carriage control kept
separate):

```
cols   1- 62  title / subtitle (left justified)
cols  65- 79  "COMPASS 3.6-xxx"        | sub-subtitle (10 chars) on line 2
cols  82- 91  " yy/mm/dd."             | block name (8) on line 2
cols  93-102  " hh.mm.ss."             | qualifier (8) on line 2
cols 105-114  "PAGE" + page number right justified
```

Reconstructed example (from the OCR of the manual's own page, L16979-16982):

```
COMPASS 3.7 - CYBER 70 COMPREHENSIVE ASSEMBLER.                 COMPASS 3.7    81/02/27. 16.27.13.  PAGE   511
COMMON AND UTILITY SUBROUTINES.                                 ALC
```

### 3.3 Header information (first page of each subprogram)

#### 3.3.1 Binary control card summary [M] (L16706-16760), B option

```
ADDRESS            LENGTH       BINARY CONTROL CARDS.
addr1              len1         binary card1
addr2              len2         binary card2
...
addrn              lenn         binary cardn
                                END card or blank
eop                (leop)
```

- One line per IDENT, SEGMENT or SEG (and END) that wrote binary.
- `addr` : CM origin (CPU) or PP memory origin (PP) of the subprogram, overlay or partial
  binary written by that card.
- `len` : octal length, CM words for a CPU assembly, PP words for a PP assembly.
- `eop` : octal CM or PP address of the end of the unit begun by the previous IDENT.
- `(leop)` : octal length in **CM words** of a peripheral assembly. Not printed for CPU.
- Binary card text: the source statement (operation + variable field), e.g. `IDENT  COMPASS,...`.

Example 2 of the manual (PP, OCR L16753-16758, digits restored):

```
ADDRESS   LENGTH        BINARY CONTROL CARDS.
                        IDENT  DSD,0          (name unreadable in OCR: "050")
      0     7761
   7761   (1462)
```

Check: 7761B PP words + 5 header PP words = 4086 PP words = 818 CM words = **1462B** (the OCR
shows `14~2`). So `leop = ceil((length + 5) / 5)` CM words, header word included. [I] from the
arithmetic.

#### 3.3.2 Block usage summary [M] (L16765-16830), B option

```
BLOCKS        TYPE          ADDRESS      LENGTH
name1         type1         baddr1       bl1
...
```

Block names:

| Name | Meaning |
|---|---|
| `PROGRAM*` | Relocatable: the zero block. Absolute: the first `PROGRAM*` is the absolute block, the second the default symbols block. |
| `ABSOLUTE*` | Relocatable only: an absolute block is used. |
| `LITERALS*` | The literals block. |
| other | Local, labelled common or blank common block (`//` for blank common [I]). |

Types:

| Type | Meaning |
|---|---|
| `ABSOLUTE` | Addresses relative to absolute zero. All blocks in an absolute assembly. |
| `LOCAL` / `+LOCAL` | Relative to the origin of block zero. `+` = ECS/LCM block. |
| `COMMON` / `+COMMON` | Relative to the origin of the common block. `+` = ECS/LCM block. |

`ADDRESS` = beginning address of the block (according to type). `LENGTH` = word count.

Examples reconstructed from OCR (L16812-16848):

```
BLOCKS     TYPE        ADDRESS     LENGTH        (absolute assembly)
PROGRAM*   ABSOLUTE          0       5414
LITERALS*  ABSOLUTE       5414        215
CONTROL    ABSOLUTE       5631       1242
PSEUDO     ABSOLUTE       7075       5175
...

BLOCKS     TYPE        ADDRESS     LENGTH        (relocatable assembly)
ABSOLUTE*  ABSOLUTE          0         62
PROGRAM*   LOCAL             0         35
DATA1      LOCAL            35          5
LCM1       +LOCAL            0          5
TABLE      +LOCAL            5         36
TABLE      +COMMON           0        123
DOUBLE     LOCAL             ...
DOUBLE     COMMON            0       1000
II         COMMON            0          1
```

#### 3.3.3 Entry point list [M] (L16835-16858)

```
ENTRY POINTS.
sym1*+addr1+/block1/   symn+1 ...            sym2n+1 ...
sym2  ...
symn  ...              sym2n ...             sym3n ...
```

- Three columns, **column-major**: n = ceil(count / 3) rows; column 1 holds entries 1..n.
- `*` right of the symbol: conditional entry point (ENTRYC).
- `+` left of the address: block is ECS/LCM.
- `+` right of the address: address is relocatable.
- `block`: blank, or a common block name between slashes.
- Undefined entry symbol: address printed as `*******`.

Reconstructed example (L16862-16874):

```
ENTRY POINTS.
     SNAP1       1345+          COL          72+          PROGOCP    2375+
     SNAP2       1352+          GOTO        224+          PRF        4461+
     SNAP3       1357+          IF          156+          RDCH       2461+
     JUMPVEC        0+/JUMPVEC/ LABEL       435+          LCM          +0+
     BEGIN          0+          READ         20+/DATA/    LGMM
     BYTESIZ        6           RECORD
```

[I] Column width 40 chars: symbol (8, + `*`), address right-justified in 8 with `+` prefix
column and `+` suffix column, then `/block/`.

#### 3.3.4 External symbol list [M] (L16877-16893)

```
EXTERNAL SYMBOLS.
sym1   symn+1   sym2n+1  ...   (8 columns)
...
symn   sym2n    ...
```

n = ceil(count / 8) rows, column-major. A weak external is followed by `*`.
[I] Column width 12 (8-char name + `*` + spaces). Example (OCR) `COMPCTF  VNDROR  SYMBOL  MCGOTO`.

### 3.4 Octal and source statement listing [M] (L16895-16965)

#### 3.4.1 Fields

The line is **130 characters** wide [M]. Fields, left to right [M] (Figure 11-1):
`Error Flags | Location Addresses | Octal Code | Source Lines | Sequence`.

| Field | Content [M] |
|---|---|
| Error flags | One letter (fatal) or digit (informative) per error type detected on the line, or in a following statement that is not listed. Lines with errors are **always** listed. User flags from ERR/ERRxx go here. |
| Location | Location counter value, octal, leading zeros suppressed. Blank if the statement generates no code and defines no location symbol. If the location counter differs from the origin counter (after LOC), an `L` precedes the address (until LOC *O, USE, ORG, ORGC or USELCM). |
| Octal code | Code generated by the statement (see 3.4.3). |
| Source | Source image, columns 1-72. |
| Sequence | Columns 73-90 of the card image, or an expansion identifier (3.4.4). |

#### 3.4.2 Column map [I]

Derivation: 72 source columns + 18 sequence columns = 90, which leaves exactly 40 columns
(4 words of 10 display characters) for the prefix in a 130-char (13-word) line. In the
Appendix D example (the cleanest OCR, digits exact) the location field ends 1 column before the
octal code, the relocation flag sits 1 column after the last digit, and the source starts 11
columns after the end of a 20-digit word. The map below fits all of that:

```
col  1- 3   error flags, left justified (up to 3 distinct flags; [I])
col  4      'L' when location counter != origin counter
col  5-10   location, octal, right justified, leading zeros suppressed (6 digits CPU,
            4 digits 12-bit PP, 5 digits 16-bit PP when MEMSEL 8 [I])
col 11      blank
col 12-31   octal code field (20 positions)
col 32      blank
col 33      relocation flag for a full 60-bit word (see below)
col 34-40   blank
col 41-112  source statement columns 1-72
col 113-130 sequence field (18 chars)
```

Carriage control: one extra leading character (`1` eject, ` ` single space, `0` double
space) is written before column 1 on the listing file [I] (line printer convention; SCOPE 2
listing MRL is 137 chars, appendix B).

#### 3.4.3 Octal code field rules [M]

CPU instructions:

- Each instruction is shown on its own source line, at the position of its parcel in the
  word: parcel p (0..3) starts at column 12 + 5p [I]. 15-bit = 5 digits, 30-bit = 10 digits.
  The location field is printed only on the line that starts a new word (parcel 0, or a force
  upper) or that defines a location symbol.
- The NO instructions (`46000`) packed for a force upper are **not** shown. Zeros packed to
  complete a parcel in a VFD are not shown.
- Relocation flag, printed one column after the last digit of the instruction or word [I]:

| Flag | Meaning |
|---|---|
| `-` | Negative relocatable address |
| `+` | Positive relocatable address |
| `C` | Common relocatable address |
| `X` | External address |
| blank | Absolute |

- Data words (DATA, CON, VFD, DIS, literals): 20 digits in cols 12-31, flag col 33.
- PPU code: 12-bit words as 4 digits. A 24-bit PP instruction is shown as two words on one
  line [M]: `dddd dddd` at cols 12-15 and 17-20 [I]. 16-bit PP (CIPPU): 6 digits per word [I].

Statements without code, field normally blank, except [M]:

| Statement | Code field content |
|---|---|
| LIT | Address of the first word of the literals generated. |
| COL | New beginning-of-comments column number. |
| SET, MAX, MIN, EQU, `=`, MICCNT | Octal value of the symbol, right justified, leading zeros suppressed. |
| BASE change | `b1->b2` right justified (old base, new base). The manual prints an arrow (OCR `brb2`). [I] use display-code `→` (ASCII rendering `>`). |
| CODE change | `c1->c2` right justified (old code letter, new code letter). |
| DUP | Repeat count. |
| BSS, BSSZ | Word count, octal, right justified, leading zeros suppressed. Blank if 0. |
| DECMIC, OCTMIC | Octal value of the expression, right justified. |
| blank operation field | One zero word of data (L6373). |

"Right justified" means flush with the end of the code field, column 31 [I].

Invented symbols (macro LOCAL) are shown as `Hsym`-style unique names [M] (L9783); the exact
form is in the macro spec.

#### 3.4.4 Sequence field [M] (L16960-16975)

Columns 73-90 of the card image, or for generated lines:

| Source of line | Identifier |
|---|---|
| Macro | macro name |
| Remote code (RMT) | `*RMT*` |
| Duplicated code (DUP) | `*DUP*` |
| Echoed code (ECHO) | `*ECHO*` |
| XTEXT | file name |
| OPDEF | operation field of the opdef call, e.g. `SB1` |

The recursion (nesting) level is shown in the right half of the field [M].
[I] identifier left-justified in cols 113-121, level right-justified in cols 122-130.

Only the first 90 characters of an input record are reproduced on the listing (appendix B).

#### 3.4.5 Reconstructed sample (Appendix D, figure D-1, NOS)

Using the column map of 3.4.2. Digits and flags are exact in the OCR; spacing is rebuilt.

```
         1         2         3         4         5         6         7
1234567890123456789012345678901234567890123456789012345678901234567890123456789012
                                        IDENT  EXAMPLE
                                        ENTRY  BEGIN
          0                  301        OBUF   BSS    301B          OUTPUT BUFFER
        301 17252420252400000001        OUTPUT FILEC  OBUF,301B
        306 6110000001                  BEGIN  SB1    1
                      66200                    SB2    B0            INITIALIZE ADDRESS COUNTER TO ZERO
        307 6130000006                         SB3    6             SET FOR USE AS A LOOP LIMIT
                      43100                    MX1    0             INITIALIZE RUNNING SUM TO ZERO
        310 5122000321 +                LOOP   SA2    TABLE+B2      GET NEXT MEMORY ADDRESS
                      66221                    SB2    B2+B1         INCREMENT THE ADDRESS COUNTER
                           36121               IX1    X2+X1         ADD NEW NUMBER TO RUNNING SUM
        311 0523000310 +                       NE     B2,B3,LOOP    LOOP IF ADDRESS CNTR .NE. (B3)
                      0100000441 X             RJ     =XCDD         CONVERT BINARY NUMBER TO DISPLAY CODE
        312 5160000331 +                       SA6    ANS           STORE THE DISPLAY CODED NUMBER IN ANS
        321 00000000000000000001        TABLE  DATA   1
        327 55241005550116232705        WORDS  DATA   H* THE ANSWER IS *
        331                    1        ANS    BSS    1
                               3        LEN    EQU    *-WORDS
```

Notes on the sample:

- The `RJ =XCDD` line shows `0100000441 +` in the manual OCR (address of the satisfied
  reference in an assembly where CDD came from XTEXT). With a true external it would carry
  `X` and K = 0 [M] (L6317).
- In the manual figure, small line numbers (1, 2, 3...) at the far left are annotations of the
  figure ("Line 5" in the text), **not** part of the listing [I].
- Macro expansion lines (FILEC, WRITEH, ...) are not listed by default (M/S off); the macro
  call line carries the code of the first word.

### 3.5 Literals [M] (L17069-17107), D option

Listed after the default symbols. Heading `CONTENT OF LITERALS BLOCK.` then one line per word:
address, octal word, display-code conversion of the word.

```
CONTENT OF LITERALS BLOCK.
  010121   17455773755000000000   O+>>X
  010122   16550000000000000000   N,
```

PP: 4-digit address, 4-digit word, 2 display characters:

```
CONTENT OF LITERALS BLOCK.
    7315   0104   AD
    7316   0706   GF
```

[I] address right-justified in cols 1-8, word from col 12, characters from col 35 (CPU) /
col 20 (PP); characters outside the printable set shown as blank.

### 3.6 Default symbols [M] (L17109-17125), D option

Heading `DEFAULT SYMBOLS DEFINED BY COMPASS`, then for each symbol created by an `=S`, `=X`, `=Y`
prefix (or literal-style default): address (6 octal digits) and the symbol. The OCR shows
`000000 X  ...MSG=` and `005461  TAB1`: an `X` marks a default external [I].

### 3.7 Assembler statistics [M] (L17114-17130)

Content: storage used (octal); number of source statements; number of symbols defined;
number of invented symbols; number of symbol references; CPU type COMPASS ran on and assembly
time; number of errors; number of lost references (references omitted from the reference
table).

Reconstructed from figure D-1 (L20183-20185):

```
          51200B CM STORAGE USED            443 STATEMENTS           78 SYMBOLS
                                                                      0 INVENTED SYMBOLS
          6600-TYPE CPU ASSEMBLY        0.216 SECONDS                25 REFERENCES
```

[M?] The OCR reads `7600-TYPE CPU ASSEMBLY`; the CPU type is that of the machine that ran
COMPASS (here use `6600-TYPE`). The invented-symbols, error and lost-reference lines are not
visible in the figure. [I] Print them only when nonzero, as `nnnnn ERRORS`,
`nnnnn WARNINGS`, `nnnnn LOST REFERENCES` (wording not confirmed). Add a
`nnnnnnB LCM USED` line when LCM/ECS was used.

### 3.8 Error directory [M] (L17132-17370)

Printed only if errors occurred, on a new page with subtitle `ERROR DIRECTORY`. Each error type
that occurred gets a two-line entry:

```
x TYPE ERROR      description
                  OCCURRED ON PAGES   p1, p2, ...
```

**Alphabetic flags are fatal**: binary output is suppressed (unless D). **Numeric flags are
informative** warnings only. ERR/ERRxx with no flag, or with a character not in these tables,
use `P` (L7661, L7706).

#### Table 11-1 fatal errors (exact message text, OCR normalised)

| Flag | Message | Significance | Action |
|---|---|---|---|
| **A** | `ADDRESS FIELD BAD.` | Error in a variable subfield: CODE character not A, D, E, I, O or `*`; symbol or name longer than 8 characters; expression does not reduce to one external term; relocatable terms do not cancel properly; instruction requires an absolute expression; instruction disallows register designators; data error, 8 or 9 in octal data and modifier not S, P, O, E, D or B [M?]; no data in the variable field of LIT; no symbol after an `=S`, `=X` or `=Y` prefix; relative jump out of range (-31 <= r <= 31) on a PPU instruction; BASE character not O, M, D or `*`; a register is illegal in a CON instruction; synonymous instruction for OPSYN or CPSYN not found; micro count < 0 or > 10 [M?]; the LABEL [M?] character is not I; negative relocation on ORG or ORGC; POS value < 0 or > word size; erroneous OPDEF reference; no comma after the DIS word count; illegal entry in the variable field of IDENT. | See the manual for the correct address field of the operation. |
| **D** | `DOUBLY DEFINED SYMBOL. THE FIRST DEFINITION HOLDS.` | A symbol was previously defined or declared external. | Rename the duplicate symbol. |
| **E** | `ECHO, DUP, RMT, OR MACRO ILLEGALLY NESTED.` | The definition of ECHO, DUP, RMT or MACRO is not entirely within the next outer definition. | Correct the program. |
| **F** | `NUMBER OF ENTRIES EXCEEDS PERMISSIBLE AMOUNT.` | LIT generates more than 100 words; data missing or erroneous on XTEXT file; more than 63 formal parameters and local names in a macro definition; more than 255 blocks; more than 511 external symbols. | Correct the condition and rerun. |
| **L** | `LOCATION FIELD BAD.` | Required location field entry is erroneous. A format-two macro definition has no substitutable parameters. | Correct the location field entry. |
| **N** | `NEGATIVE RELOCATION ON ENTRY POINT.` | An entry point may not be negatively relocated. | Use positive or absolute relocation for entry points. |
| **O** | `OPERATION FIELD BAD.` | Unrecognisable instruction; instruction out of sequence (e.g. ABS or PPU not in the first statement group); instruction illegal for this binary mode [M?: OCR "illegal for binary I mode"]; erroneous relational mnemonic on IF; AIDTEXT found the instruction changed or invalid for models 810, 815, 825, 830, 835, 845, 855. | Correct the operation field / replace the instruction. |
| **P** | `CONSULT LISTING FOR REASON BEHIND P-ERROR.` | User-generated error flag from ERR or ERRxx (default flag). | Depends on the source of the error. |
| **R** | `DATA ORIGIN OUTSIDE BLOCK OR IN BLANK COMMON.` | Attempt to set data into blank common or beyond block limits (also: resuming a block already written by SEG / blank IDENT, L4543). | Use labelled common or enlarge the block. |
| **U** | `UNDEFINED SYMBOL. VALUE ASSUMED 0.` | Reference to an undefined symbol, e.g. an IF line count, a DIS word count, an unrecognisable attribute on IF, an undefined qualifier. | Define the symbol. |
| **V** | `BIT COUNT ERROR ON VFD (MUST BE 0 < COUNT <= 60).` [M?: relational symbols lost in OCR: "{MUST BE 0 COUNT 60}"] | The VFD field size is erroneous. | Correct the VFD field size. |

#### Table 11-2 informative messages

| Flag | Message | Significance | Action |
|---|---|---|---|
| **1** | `LOCATION SYMBOL BAD. SYMBOL NOT DEFINED.` | The location field is erroneous; the instruction does not require an entry. | Define or remove the location symbol. |
| **2** | `ADDRESS ERROR ON SYMBOL DEFINITION.` | Variable field entry erroneous; the location field symbol is not defined. | Correct the symbol definition. |
| **3** | `DUPLICATE MACRO DEFINITION. NEW ONE OVERRIDES.` | The macro, opdef or synonymous operation redefines the operation code. | Rename the duplicate macro. |
| **4** | `BAD FORMAL PARAMETER NAME IGNORED.` | Macro or ECHO formal parameter name repeated or illegal. | Correct the formal parameter name. |
| **5** | `CPU OPERATION SYNTAX INCORRECTLY SPECIFIED.` | OPDEF, CPOP, CPSYN or PURGDEF specifies an illegal syntax. | Correct the syntax. |
| **6** | `LOCATION FIELD MEANINGLESS.` | The location field entry is erroneous; it is ignored. | Correct the location field. |
| **7** | `ADDRESS VALUE EXCEEDS FIELD SIZE, RESULT TRUNCATED.` | Expression value exceeds the destination field; BSS expression negative; MICRO start position or count negative. | Check the possible values of the subfield. |
| **8** | `MISSING OR EXTRA ADDRESS SUBFIELD.` | Variable subfield missing or superfluous. | Correct the subfield. |
| **9** | `MICRO SUBSTITUTION ERROR. NO SUBSTITUTION.` | Micro reference unrecognisable. | Correct the micro reference. |

Other errors raised elsewhere [M]: `RECURSION DEPTH EXCEEDED 400.` sets a fatal error (dayfile,
section 7); ERRxx test made in pass 2: `NG`/`MI` value negative, `NZ` nonzero, `PL` positive,
`ZR` zero (error flagged when the condition is true; see open point 7).

[I] Flag order on a line when several apply: fatal letters first in the order of Table 11-1,
then digits ascending. Each distinct flag appears once.

### 3.9 Symbolic reference table [M] (L17372-17420)

Generated at end of assembly if L and R are on (incomplete if L was turned off at some point).
Subtitle `SYMBOLIC REFERENCE TABLE.`, plus ` n LOST REFERENCES` when table space was exceeded.

- Global (unqualified) symbols first, then for each qualifier, in declaration order, a header
  line `SYMBOL QUALIFIER = qualifier`. Symbols alphabetical within each group.
- Columns: `symbol  value  block  references...`
  - `value`: absolute value, or address relative to the named block.
  - `block`: for SST symbols, the system text file/overlay name. Otherwise blank in an absolute
    assembly; in a relocatable assembly, the block containing the symbol.
- Reference formats by XREF mode:
  - **XREF P** (default), format 1: list of `page/line` indices sorted by page, left to right
    then top to bottom, each optionally followed by a flag letter.
  - **XREF B**, format 2: `page/line flag address` for each reference.
  - **XREF A**, format 3: only the location-counter `address` of each referencing instruction,
    no flags.
- Flags:

| Flag | Meaning |
|---|---|
| D | Definition statement: EQU, `=`, SET, MAX, MIN, MICCNT |
| E | ENTRY or ENTRYC |
| F | Symbol used in a conditional test (IF) |
| I | Indirect storage (PPU/PERIPH only) |
| L | Symbol in the location field of the statement |
| S | Symbol used for storage |
| X | EXT pseudo instruction |

- `page/line`: page number / line number on that page of the listing [I: the line counted
  from the first line after the heading].
- A symbol used as a location and also referenced elsewhere shows several entries.

Reconstructed example (L17432-17450):

```
SYMBOLIC REFERENCE TABLE.
SNTEICP     5115         74/12 L      74/53 S     75/15       76/12       76/14
SNUPIB      4421         73/14        74/12       74/14       74/18 L     79/61
...
                         SYMBOL QUALIFIER = CATI
CCS         7312        113/41       113/47 S    125/14 L
```

[I] Layout: symbol cols 1-10, value right-justified ending col 18, block cols 20-27, then up to
8 references per row in 12-column slots (`ppp/ll` right-justified + space + flag); further
rows indented to the first reference column.

---

## 4. Assembly-time I/O (appendix B) [M]

- **Main source** (SCOPE 2 detail, applies in spirit to all): sequential, records up to 160
  chars accepted, **only the first 90 characters** are reproduced on the listing. COMPASS
  auto-detects a compressed compile file (UPDATE X mode / MODIFY A mode).
- **Listing files**: records up to 137 characters (1 carriage control + up to 136).
- **Binary output** (NOS, NOS/BE): sequential, character-count blocks of 5120 chars
  (512 words = one PRU-sized block), system-logical-record (S) records. One record (section)
  per subprogram / overlay; end of section after each.
- **Scratch files**: `ZZZZZRL` and `ZZZZZRM`, used when table storage overflows.
- **System text input**: S = library file via the system overlay loader; G = sequential binary
  file, same format as binary output.
- **XTEXT files**: blank variable field: sequential, rewound, read to end of section or COMPASS
  END. Non-blank: random file with name index (SCOPE 3.3 style), or UPDATE/MODIFY random program
  library: the name must be a common deck; for UPDATE the first active card (`*COMDECK`) is
  skipped, inactive cards ignored, reading stops at end of section or END.
- Control statement file-use conflict (same lfn for source, list, binary or XTEXT):
  `FILE USE CONTRADICTION.`

[I] For our JS implementation: files are in-memory objects; "record" = array of 60-bit words
(BigInt) plus a level number; "section" boundary = end-of-record marker.

---

## 5. Binary output

### 5.1 Overall structure

**Absolute CPU program / overlay** [M] (L3126-3135): one section per overlay:

```
PRFX (7700) table            (suppressed by NOLABEL, NOLABEL I)
header table                 5000 (ASCM, single entry) or 5100 (EASCM, multiple entries),
                             also 5300 (ACPM) / 5400 (EACPM) types exist     (suppressed by NOLABEL)
memory image                 origin .. last word address (or current origin counter for SEG)
end of section
```

- Single-entry overlay: load address = origin - 1; the 5000 word is loaded at origin-1 [M].
- Multiple-entry overlay: load address = origin - wc - 1, wc = number of entry points listed in
  the 5100 table [M].
- SEG and blank IDENT write partial binary: no end of section, no new 7700 table [M].
- END, SEGMENT and non-blank IDENT complete the overlay and write end of section [M].
- Level numbers l1, l2 are 0-63 (00-77B). First IDENT = main overlay; default (0,0) for the
  first, (01,00) for later overlays when omitted [M] (L4277, L4497).

**PP program** (PERIPH 12-bit, CIPPU 16-bit, PPU 7600) [M]:

```
PRFX (7700) table            (suppressed by NOLABEL / NOLABEL I)
PP header control word       1 CM word = 5 PP words, occupying PP addresses origin-5..origin-1
PP memory image              PP words packed 5 per CM word, 12 bits each, first PP word in
                             bits 59-48
end of section
```

- Load address = origin - 5 [M]. Null origin = 0000 for a PP program [M].
- PP name: 1-3 characters (12-bit PP), 1-4 (16-bit PP), 1-7 (7600 PPU) [M].
- 7600 PPU header table is a 5200 table (COMCSRT: "7PP = 5200 table") [M].
- 6000-series PP binary is recognised by COMCSRT as "7700 table with three-character name in
  header word" (type 6PP) [M].
- PP header word layout [X/I] (NOS convention, unverified):

```
 59        42 41  36 35      24 23                    0
+------------+------+----------+-----------------------+
| name 3 chr |  0   | load adr |  length               |
| display    |      | origin-5 |  (PP words? CM words?)|
+------------+------+----------+-----------------------+
```

  Decision for our loader: `18/name, 6/0, 12/origin-5, 24/length in PP words including the
  5 header PP words`. Flag in code as `PP_HEADER_FORMAT_UNVERIFIED`.
- Length shown in the listing as `(leop)` = CM words of the whole record body (3.3.1).

**Relocatable CPU subprogram** [M + X]: one section per subprogram, tables in this order:

```
PRFX  7700                      [M]
LDSET 7000   only if LDSET used [M] "between the PRFX and the PIDL tables"
PIDL  3400                      [M]
ENTR  3600   if entry points    [X]
TEXT  4000 ...                  [X]  (and REPL 4300 at the point of REPI/REPC)
FILL  4200                      [M] written at END (and at SEGMENT, L4434)
REPL  4300                      [M] from REP/REPC/REPI and BSSZ runs >= 6 words (L6370)
LINK  4400                      [M] written at END (and at SEGMENT)
XFER  4600   if END has trasym  [X]
end of section
```

LCC directives: each written "as a section in packed display code" [M] (L4720), i.e. a
separate coded record placed with the subprogram's tables [I: before the PRFX table of the
subprogram].

**Errors**: without D, a subprogram with fatal errors produces no binary. Without A, the coded
line `ERRORS IN ASSEMBLY` is written to the B file in its place [M] (L16141).

**System text overlay** (STEXT) [M] (L4600-4625): an absolute overlay with control table

```
 59      48 47  42 41  36 35                          0
+----------+------+------+-----------------------------+
|   5000   |  01  |  01  |  000000000000 (36 bits 0)   |
+----------+------+------+-----------------------------+
```

followed by: number of words in each part, system symbol table (2 words/entry), micro
definitions, macro/opdef definitions, operation table entries (2 words/entry). The internal
encoding of these parts is COMPASS-private [I]: we define our own and only keep the header.
The overlay's PRFX table carries the STEXT name (or the IDENT name if STEXT is blank).
STEXT excludes: relocatable or external symbols, qualified symbols, redefinable symbols (SET,
MAX, MIN, MICCNT), symbols from XTEXT or CTEXT..ENDX, SST symbols, 8-char symbols beginning
with a special prefix [M?]. All micros and program-defined opcodes are included.

### 5.2 Generic table header [X]

All loader tables start with a header word:

```
 59      48 47      36 35                              0
+----------+----------+---------------------------------+
| CN (12)  | WC (12)  |  table dependent (36)           |
+----------+----------+---------------------------------+
```

CN = table code (7700, 3400, ...), WC = number of words following the header. COMPASS listings
name tables by these octal numbers [M] (L3137).

### 5.3 PRFX - prefix table 7700 [M + X]

Header `7700 0016 0000 0000 0000` (WC = 16B = 14 words) [X].

| Word | Content | Source |
|---|---|---|
| 0 | `12/7700B, 12/16B, 36/0` | [X] |
| 1 | Program/overlay name, display code, left justified, zero filled, 42 bits; bits 17-0 = 0 (COMCSRT treats nonzero bits 0-17 of word 1 as another file type) | [M] name / [X] layout |
| 2 | Date, 10 display chars, ` yy/mm/dd.` | [X] |
| 3 | Time, ` hh.mm.ss.` (COMCCPT tests word FWA+3 for a time-of-day word to tell new from old prefix form) | [M] (L17846) |
| 4 | Operating system name and version, 10 chars | [X] |
| 5 | Processor (assembler) name, `COMPASS   ` | [X] |
| 6 | Processor version / modification level (for compilers built with COMPASS, MODLEVEL goes here) | [M] (L10916) |
| 7 | Hardware word: MACHINE `target` (2 chars), `valid` (2 chars: blank, `6X`,`7X`,`8X` for CPU; `6P`,`7P`,`8P` for PP), `hfi` (first char of each MACHINE hfi subfield, up to 9) | [M] fields / [X] positions |
| 8-14 | COMMENT text, 70 chars max, blank padded to a multiple of 10; extra COMMENTs are appended. PCOMMENT micro intended for words 8-10. | [M] (L4704, L10927) |

Word 7 layout decision [I]: `12/target, 12/valid, 36/hfi (first 6 hfi chars)`; hfi chars 7-9
dropped. Mark unverified. MACHINE rules [M]: CPU, no MACHINE or type not 6/7/8: target and
valid blank. Type 6/7/8: valid = `6X`/`7X`/`8X`; if the type has a digit second char, target =
those two chars. PP: target blank, valid `6P` (PERIPH), `7P` (PPU), `8P` (CIPPU) by default.

COMMENT details [M]: string starts at first nonblank after the operation field (or at default
comment column - 1 if none before it), ends at last nonblank of the statement; 1-10 blanks
appended so it ends with a blank and has a length multiple of 10; all blank gives 10 blanks;
beyond 70 chars lost. Ignored after SEG and blank IDENT, and meaningless with NOLABEL.

### 5.4 PIDL - program identification and length 3400 [X]

```
word 0   12/3400, 12/WC, 36/0
word 1   42/program name, 18/program length (all local blocks + literals, CM words)
word 2.. 42/common block name, 18/block length       one word per common block
```

- Blank common name: unknown in CDC format. [I] Name field = 0 means blank common.
- ECS/LCM blocks: CDC encoding unknown. [I] List LCM blocks after the SCM blocks, same
  `42/name,18/length` words; header bits 35-18 = number of LCM entries. Unverified.
- **Relocation base numbering** [X] used by TEXT/FILL/LINK/ENTR/XFER:
  `0` absolute, `1` program (block zero = all local blocks merged), `2+k` k-th common block
  in PIDL order (k from 0). [I] negative relocation is expressed by the relocation code, not
  by the base.

### 5.5 ENTR - entry point table 3600 [X]

```
word 0     12/3600, 12/WC, 36/0          WC = 2 * number of entries
pair i:    42/entry name, 18/0
           24/0, 18/relocation base, 18/address
```

Conditional entry (ENTRYC) [X]: no known flag; decision: bit 59 of the second word = 1.

### 5.6 TEXT - text table 4000 [X]

```
word 0     12/4000, 12/WC, 18/relocation base of load address, 18/load address
word 1     relocation word: 15 x 4-bit relocation codes, code for data word 1 in bits 59-56,
           data word 2 in bits 55-52, ... data word 15 in bits 3-0
word 2..   data words (1 to 15)                  WC = number of data words + 1 (<= 16)
```

4-bit relocation code (per data word), 18-bit address fields: upper = bits 47-30 (30-bit
instruction in parcel 0), middle = bits 32-15 (parcel 1), lower = bits 17-0 (parcel 2, or
data word address) [X/I]:

```
bits 3-2 (upper / selector)   bits 1-0 (lower)
  00 none                       00 none
  10 + upper                    10 + lower
  11 - upper                    11 - lower
  01 -> middle address: bits 1-0 give its sign (10 +, 11 -)
```

i.e. codes: `0000` none, `0010` +L, `0011` -L, `1000` +U, `1100` -U, `1010` +U+L, `1011` +U-L,
`1110` -U+L, `1111` -U-L, `0110` +M, `0111` -M. Only program-base relocation (base 1, or the
TEXT base) is expressible this way; common-block and absolute-block addresses go through FILL,
externals through LINK [X]. **Unverified encoding**; isolate.

### 5.7 FILL - fill table 4200 [M existence, X format]

Used for addresses relative to blocks other than the TEXT load base (common blocks: listing
flag `C`). 30-bit items, two per word, first item in bits 59-30 [X]:

```
base item:  1/1, 2/0, 9/relocation base R (block whose origin is added), 18/0
fill item:  1/0, 2/position (00 lower, 01 middle, 10 upper), 9/base of the word, 18/address
```

A base item applies to all following fill items until the next base item. Negative relocation
not allowed with FILL [I]. Unused trailing item = 0.

### 5.8 REPL - replication table 4300 [M semantics, X format]

Generated by REP, REPC, REPI and by BSSZ runs of 6 or more words [M]. Semantics [M]:

- `S/saddr` source FWA (required, nonzero), `D/daddr` destination (0: loader uses saddr+bsz),
  `C/rep` count (0 or 1: one copy), `B/bsz` block size (0 or 1: one word), `I/inc` increment
  (0: bsz). Copy k (k = 0..rep-1) goes to daddr + k*inc.
- REP: replication done at end of load. REPI: immediately. REPC: immediately, ignored if the
  destination is in a common block first declared by an earlier subprogram (not SCOPE 2).
- Relocatable assemblies only; data must not contain externals or common relocatable
  addresses; REPC/REPI data must be in previously loaded text. Counters not advanced.

The CDC bit layout is not known. Our format [I], 3 words per entry:

```
word 0     12/4300, 12/WC, 36/0
entry w1   12/type (0 REP, 1 REPC, 2 REPI), 12/RS (base of saddr), 18/0, 18/saddr
entry w2   12/RD (base of daddr), 30/0, 18/daddr
entry w3   20/rep, 20/bsz, 20/inc
```

Unverified against CDC. Our loader is the only consumer.

### 5.9 LINK - external linkage 4400 [M existence, X format]

```
word 0         12/4400, 12/WC, 36/0
name word      42/external name, 17/0, 1/weak flag [I]
count word     42/0, 18/n = number of link items that follow [I]
link items     n 30-bit items, two per word: 1/0, 2/position (00 lower, 01 middle, 10 upper),
               9/relocation base of the referencing word, 18/address of referencing word
               (zero item = filler)
next name word ...
```

The CDC loader tells name words from item words without a count word (exact rule unknown).
The count word is our decision [I] to remove that ambiguity. The address field of the
referencing instruction holds the addend (`=XCDD+3` puts 3 in K) [I].

### 5.10 XFER - transfer table 4600 [X]

```
word 0   12/4600, 12/1, 36/0
word 1   42/transfer entry name (END trasym), 18/0
```

The loader uses the last XFER seen; at least one subprogram must give one [M] (L3811).

### 5.11 LDSET 7000 and LCC [M]

- LDSET: COMPASS merges all LDSET options of the subprogram into **one** 7000 table between
  PRFX and PIDL; not written if no LDSET; illegal in PP or absolute CPU assemblies.
  Options [M]: `LIB`, `LIB=l1/l2`, `MAP`, `MAP=p`, `MAP=p/lfn`, `MAP=/lfn`, `PS=p`, `PD=p`,
  `PRESET=p`, `PRESETA=p`, `ERR=ALL|FATAL|NONE`, `REWIND`, `NOREWIN`, `EPT=`, `NOEPT=`,
  `USEP=`, `USE=`, `COMMON`, `COMMON=`, `SUBST=a-b/...`, `OMIT=`. PRESET keywords:
  `NONE`, `ZERO`, `ONES`, `INDEF` (`1777 0000...`), `NGINDEF`, `INF` (`3777 0...`), `NGINF`,
  `ALTZERO` (`2525...`), `ALTONES` (`5252...`), `DEBUG` (`6000 0000 0004 0040 0000`);
  PRESETA also stores each word's address in the low 17 (CM) / 24 (ECS) bits. Item encoding
  [X]: decision: each option as `42/keyword display, 18/n` + n words of display-code values.
- LCC: directive text (first nonblank after LCC up to first blank), not edited, written as its
  own coded section [M].

### 5.12 Absolute header tables 5000 / 5100 / 5300 / 5400 [M names, X/I layout]

| Code | Name [M] | COMCSRT type [M] |
|---|---|---|
| 5000 | ASCM | OVL |
| 5100 | EASCM (multiple entry points) | ABS |
| 5300 | ACPM | OVL if bit 17 = 0, ABS if bit 17 = 1 |
| 5400 | EACPM | OVL if overlay levels not (0,0), ABS if (0,0) |

5000 layout (from the STEXT figure, fields at bits 59-48 / 47-42 / 41-36 / 35-0 [M]):

```
12/5000, 6/l1, 6/l2, 18/FWA (= origin) [I], 18/entry address [I]
```

5100 [I]: `12/5100, 6/l1, 6/l2, 18/origin, 18/wc` then wc words `42/entry name, 18/address`.
COMPASS writes 5000 for absolute programs with one entry and 5100 when several entry points
are declared [I]; 5300/5400 are not written by COMPASS [I].

NOLABEL [M]: NOLABEL (no I): suppress PRFX, 5000, 5100 and PP header tables (deadstart
programs loaded at 0). `NOLABEL I`: suppress only PRFX tables. Illegal in relocatable CPU.

### 5.13 COMCSRT record type codes [M] (Table 12-2, best reconstruction of a scrambled OCR)

| Type | No. | Recognised by |
|---|---|---|
| TEXT | 0 | no 7700 table, first word has zeros in bits 0-17 |
| 6PP | 1 | 7700 table, 3-character name in header word |
| OVCAP | 2 | 7700 table followed by 6000 table with bit 18 = 1 |
| REL | 3 | 3400 table |
| OVL | 4 | 5000, 5300 (bit 17=0), 5400 (non-(0,0)) |
| ULIB | 5 | 7600 table |
| OPL | 6 | 7001 table, WC 0 |
| OPLC | 7 | 7002 table, WC 0 |
| OPLD | 8 | 7000 table, WC 0 |
| ABS | 9 | 5100, 5300 (bit 17=1), 5400 ((0,0)) |
| 7PP | 10 | 5200 table |
| UPLX | 11 | no 7700, chars `CHECK` in bits 30-59 |
| UCF | 12 | 7700 table with WC 0 [M?] |
| ACF | 13 | bits 0-17 of 2nd word of 7700 table nonzero |
| CAP | 14 | 7700 followed by 6000 table |
| DATA | 15 | unrecognisable |
| PROC | 16 | `PROC` followed by delimiter |
| - | 17 | CDC reserved |
| SDR | 18 | NOS/BE deadstart tape position |
| UPLR | 19 | 7700 + 6000 table + COMDECK, YANK or DECK |

Useful consequence: in a normal PRFX table, bits 0-17 of word 1 are zero.

### 5.14 Binary card format (appendix C) [M]

Column 1 punches:

| Col 1 | Meaning |
|---|---|
| 7,8,9 (level 0-16 in cols 2-3) | End of section |
| 6,7,9 | End of partition (NOS only) |
| 6,7,8,9 or 7,8,9 level 17 | End of information |
| 7 and 9 | Binary card |
| 7 and 9 not both | Coded (Hollerith) card |

Binary card: up to 15 CPU words starting at column 3 (15 x 60 bits = 75 columns x 12 rows,
cols 3-77). Column 1 rows 0, 1, 2, 3: word count (binary). Column 1 row 4: check indicator;
0 = column 2 holds a checksum checked on input, 1 = no check. Column 78 unused. Columns 79-80:
binary serial number (sequence within the logical record). Punched sections have a checksum
and serial on each card. [X] bit order: column-major, row 12 = most significant bit of each
12-bit column, columns read in order 3..77.

---

## 6. Error and status messages (summary for implementation)

### 6.1 Listing flags

See 3.8. Fatal: `A D E F L N O P R U V`. Informative: `1-9`.

### 6.2 Binary-file marker

`ERRORS IN ASSEMBLY` (coded record) when fatal errors, no D, no A.

---

## 7. Dayfile messages (appendix E) [M]

| Message | Meaning / action |
|---|---|
| `ASSEMBLY ABORTED - ECS READ ERROR.` | ECS error persisting through 4 read attempts; job aborted. |
| `ASSEMBLY ABORTED - ECS WRITE ERROR.` | ECS write error, no retry; job aborted. |
| `ASSEMBLY ABORTED - PASS n TABLE OVERFLOW ASSEMBLING xxxxxxx` | Irrecoverable table overflow in pass n (1 or 2) after all memory requests and scratch dumps. Rerun with RFL. |
| `ASSEMBLY COMPLETE. nnnnnnB CM USED.` (`SCM` on SCOPE 2) + `xxxx.xxx CPU SECONDS ASSEMBLY TIME.` (+ `nnnnnnB LCM USED.` / `ECS`) | No fatal error in the whole run. nnnnnn = minimum field length needed (also to avoid lost references). Second line can be suppressed by installation. |
| `ASSEMBLY ERRORS. nnnnnnB CM USED.` + time line | At least one fatal error. With A the job is aborted after this message. |
| `BAD CONTROL STATEMENT ARGUMENT - xx` | Unknown/invalid argument xx. |
| `CANT LOAD COMP3$` | Loader could not load COMPASS's primary overlay. |
| `COMPASS NEEDS AT LEAST nnnnnB SCM.` | Field length too small to start. |
| `nnnnnnnnn ERRORS IN xxxxxxx` | Per subprogram with fatal errors. |
| `FILE USE CONTRADICTION.` | Same file for two of: source, list (full or short), binary, XTEXT. |
| `IDENT STATEMENT MISSING.` | END met before IDENT; fatal. |
| `IMPROPER SYSTEM TEXT FORMAT.` | (listed; meaning merged in OCR with the next) |
| `BAD SYSTEM TEXT - x=yyyyyyy/zzzzzzz` | System text has wrong internal format; ignored, job continues. x=... is `G=file`, `G=file/ovl`, `S=ovl`, `S=lib/ovl`. Also issued with the insufficient-storage and not-found cases. |
| `INPUT FILE EMPTY OR MISPOSITIONED.` | End of data on first read of source; abort. |
| `INPUT FILE RECORD TYPE NOT ALLOWED.` | Abort job step. |
| `INSUFFICIENT STORAGE FOR SYSTEM TEXT.` | Before the first assembly; job step not aborted. |
| `nnnnnB LCM NEEDED TO CONTINUE.` | Job step aborted. |
| `nnnnnnnnn LOST REFERENCES IN xxxxxxx` | Reference table did not fit for sorting; references discarded; not aborted. |
| `MORE THAN 7 SYSTEM TEXTS SPECIFIED.` | Abort job step. |
| `NO CONTROL STATEMENT TERMINATOR.` | End of section while reading continuation statements; not fatal. |
| `RECURSION DEPTH EXCEEDED 400.` | Input pushdown stack (one entry per active DUP, ECHO, HERE, XTEXT, macro call) over 400; fatal error set, stack cleared, job continues. |
| `SYSTEM TEXT NOT FOUND.` | Cannot load the overlay (with `BAD SYSTEM TEXT - x=...` identification); not aborted. |
| `nnnnnnnnn WARNING MESSAGES IN xxxxxxx` | Per subprogram with nonfatal errors. |

Console only: `ASSEMBLING xxxxxxx`.

Sample NOS dayfile (figure D-3, reconstructed):

```
15.18.02.COMPASS(S,S=IPTEXT,S=CPUTEXT,X=COMCPL)
15.18.09. ASSEMBLY COMPLETE.  52300B CM USED.
15.18.09.     0.144 CPU SECONDS ASSEMBLY TIME.
15.18.09.LGO.
```

---

## 8. Common common decks and system macros (chapter 12) - for a minimal systems text

### 8.1 Conventions [M]

- Relocatable versions on SYSLIB, program name `CPU.xxx`, entry point `xxx=`. Source versions
  as common decks `COMCxxx` on COMCPL (assembled with system texts IPTEXT and CPUTEXT; the
  macros below live in CPUTEXT).
- Calling convention: `RJ xxx=` (return jump). **B1 = 1** on entry for almost all decks.
- Registers not listed as used are not modified. Buffers must not lie in the last 10B words
  of the field length [M?: OCR "109"].

### 8.2 Deck list [M] (Table 12-1, reassembled)

| Deck | Entry | Function / entry -> exit (main registers) |
|---|---|---|
| COMCARG | ARG= | Process arguments against an equivalence table `12/op,18/asv,12/st,18/addr` (zero word ends). In: B4 count, A4/X4 first arg, B5 table. Out X1: 0 ok, 1 not found, 2 single arg equivalenced, 3 illegal re-entry [M?]. |
| COMCCDD | CDD= | Integer -> decimal display, 10 digits, zero suppressed, blank fill. In X1. Out X4 left-justified, X6 right-justified, B2 = 6*digits. |
| COMCCFD | CFD= | 30-bit integer -> F10.3 display (value/1000). In X1. Out X4, X6, B3. |
| COMCCIO | CIO= | Issue CIO request when buffer not busy. In X2 = `24/0,18/skip count,18/FET`, X7 = function code. Exits via ERP$ / ERP1$ if defined (X7 = FET error code). |
| COMCCOD | COD= | Integer -> octal display, 10 digits. In X1. Out X4, X6, B2. |
| COMCCPT | CPT= | Copy comment field of a 7700 table to working storage. In A1 table, A5 store-1, X1 control word. |
| COMCDXB | DXB= | Display digits -> binary. In X5 word, B7 base (0 decimal, else octal); post radix B/D overrides; DXB1$ option. Out X6 value, X4 error (0 ok). |
| COMCMNS | MNS= | Move non-overlapping bit string. In B2 src bit, B4 dst bit (bits numbered 0..59 from left), X0 count, X2 src FWA, X4 dst FWA. |
| COMCMOS | MOS= | Same, overlapping allowed (calls MNS=). |
| COMCMTM / COMCMTP | (macros) | Managed table macros / processors (source only, not on SYSLIB). |
| COMCMVE | MVE= | Move block. In X1 count, X2 source, X3 destination; either direction. |
| COMCRDC | RDC= | Read zero-byte-terminated line. In B6 buffer, B7 word count (negative: complement, no discard), X2 FET. Out X1: 0 ok, -1 EOF, -2 EOI, (B6) EOR; B6 LWA+1; X7 EOR level. Calls LCB=, RDX=. |
| COMCRDH | RDH= | Read coded line, H format (blank fill). |
| COMCRDO | RDO= | Read one word to X6. |
| COMCRDS | RDS= | Read line image to character buffer (1 char per word, right justified, blank fill). |
| COMCRDW | RDW=, RDX=, LCB= | Read words to working buffer. |
| COMCRSR | RSR= | Restore B0-B7, A0-A7, X0-X7 from save area at X1 (24 words, B/A values in bits 17-0). |
| COMCSFN | SFN= | Trailing 00 chars -> blanks. In X1. Out X6 [M?], X7 mask. |
| COMCSRT | SRT= | Identify record type (5.13). In X1 LWA+1, X2 FWA. Out X6 `42/name,12/0,6/type`, X7 name. |
| COMCSST | SST= | Shell sort of one-word entries. In B7 table, X1 count. |
| COMCSTF | STF= | Is file a terminal. In X2 FET (> 5 words). Out X6 = 0 if terminal. |
| COMCSVR | SVR= | Save all registers; save area address in bits 17-0 of the word the call came from. Order B0-B7, A0-A7, X0-X7. |
| COMCSYS | SYS=, RCL=, WNB=, MSG= | System requests through RA+1 (8.3). |
| COMCUPC | UPC= | Unpack control statement: A5/X5 first word, B7 parameter buffer (negative: blank is separator, complement = FWA). Out B6 count, X6 = 0 ok. Parameters <= 7 chars, left-justified zero-filled, separator in low 18 bits (zero for `,`); `)` and `.` terminate. |
| COMCWOD | WOD= | Word -> 20 octal display digits. In X1. Out X6, X7. |
| COMCWTC | WTC= | Write zero-byte line from working buffer. In B6 FWA, X2 FET. Calls DCB=, WTX=. WRIF$ option. |
| COMCWTH | WTH= | Write coded line, trailing spaces removed. In B6 FWA, B7 word count (0: none), X2 FET. |
| COMCWTO | WTO= | Write one word from X6. |
| COMCWTS | WTS= | Write line image from character buffer. |
| COMCWTW | WTW=, DCB=, WTX= | Write words. In B6 FWA, B7 count, X2 FET. Out B7 0 or remaining count, X7 error. Calls CIO=. WRIF$, WTX$ options. |
| COMCXJR | XJR= | Restore all registers via a system XJR call. In X1 save area. |
| COMCZTB | ZTB= | All 00 chars -> blanks. In X1. Out X6, X7 mask. |

### 8.3 RA+1 request formats [M] (sections 12.2.24, 12.3)

All monitor requests are one word stored at **RA+1**. The program waits for RA+1 to become
zero before storing (SYS=), and uses central exchange jump (XJ) if available.

```
 59          42 41 40 39  36 35           24 23    18 17               0
+--------------+--+--+------+---------------+--------+------------------+
| name 3 chars |0 |r |  0   |   field A     |   0    |   field B        |
+--------------+--+--+------+---------------+--------+------------------+
```

- **MESSAGE** `MESSAGE addr,x,r` -> `18/3LMSG, 1/0, 1/r, 4/0, 12/x, 6/0, 18/addr` [M?: bit
  boundaries 59, 40, 35, 23, 17 read from the OCR figure].
  - addr: message FWA (display code, ends at the first word with a zero 12-bit byte, or at
    80 chars; 40 chars per display line). If the upper 12 bits of the word at addr are zero,
    bits 47-30 of that word hold the real message address.
  - x: 0 system + user dayfile + line 1; 1 line 1 only; 2 line 2; 3 user dayfile + line 1;
    4 error log (SSJ/system origin) else user dayfile; 5 account dayfile (SSJ/system) else user
    dayfile; 6 = 0; 7 = 3. Omitted or illegal: 0. Undefined: 1. `LOCAL`: 3.
  - r: if present, wait for completion (auto recall bit 40).
  - `$` first char flashes on the B display (system origin jobs).
  - MSG= takes X1 = message FWA, X6 = options (bit 16 auto recall, bits 11-0 option code).
- **RECALL** `RECALL stat` -> `18/3LRCL, 1/0, 1/r, 22/0, 18/stat`. With stat: return when bit 0
  of word stat is set (auto recall). Without: periodic recall, one pass.
- **SYSTEM** `SYSTEM req,r,p1,p2` -> `18/3Lreq, 1/0, 1/r, 4/0, 18/p2 (bits 35-18), 18/p1
  (bits 17-0)`. req = any 3-character request (monitor function or PP program; a CPU program
  may call a PP program whose name starts with a letter).
- **CIO** (via CIO=) [X/I]: `18/3LCIO, 1/0, 1/r, 4/0, 18/skip count, 18/FET address`; the
  function code is in the FET (word 0 bits 17-0) [X].
- Exit/end: `ENDRUN` macro (used in appendix D) [X]: `18/3LEND, 42/0` request.

### 8.4 I/O macros [M] (all need the named deck; addr = FET address)

| Macro | Deck | Format |
|---|---|---|
| MESSAGE | COMCSYS | `MESSAGE addr,x,r` |
| MOVE | COMCMVE | `MOVE count,addr1,addr2` (overlap allowed) |
| READC | COMCRDC | `READC addr,buf,n` |
| READH | COMCRDH | `READH addr,buf,n` |
| READO | COMCRDO | `READO addr` (word to X6) |
| READS | COMCRDS | `READS addr,buf,n` |
| READW | COMCRDW | `READW addr,buf,n` |
| RECALL | COMCSYS | `RECALL stat` |
| SYSTEM | COMCSYS | `SYSTEM req,r,p1,p2` |
| WRITEC | COMCWTC | `WRITEC addr,buf` |
| WRITEH | COMCWTH | `WRITEH addr,buf,n` |
| WRITEO | COMCWTO | `WRITEO addr` (word from X6) |
| WRITES | COMCWTS | `WRITES addr,buf,n` |
| WRITEW | COMCWTW | `WRITEW addr,buf,n` |

Coded-line convention [M]: a line ends with a 12-bit zero byte in bits 11-0 of its last word
(end of line); 10 display characters per word. Writers need WRITER/WRITEF afterwards to flush.
Appendix D also uses `FILEC lfn,buf,len` (FET creation, 5-word minimum FET), `WRITER`,
`ENDRUN` [M, macros from the OS manual, not documented here].

---

## 9. Open points / ambiguities

1. **Listing columns** (3.4.2) are reconstructed, not printed in the manual. Verify against a
   real COMPASS 3 listing when one is available.
2. **All loader table bit layouts except 7700 header usage, STEXT 5000 word and RA+1 words**
   come from outside this manual ([X]). TEXT relocation codes, FILL/LINK/REPL item layouts,
   PIDL LCM handling and PP header word are our decisions.
3. PRFX word 7 positions of target/valid/hfi unknown.
4. Statistics line wording beyond the D-1 figure (errors, invented symbols, lost references).
5. V error message relational symbols lost (`0 < COUNT <= 60` assumed).
6. `LO=$` vs OCR `LO=$$$$`.
7. ERRxx `PL` condition says "positive". [I] Use the CDC hardware sense: PL = sign bit clear
   (+0 counts as positive), NG/MI = sign bit set.
8. Order of default symbols / literals / statistics with option D.
9. `PW` listing control mentioned in revision notes only.
