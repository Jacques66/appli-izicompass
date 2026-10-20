# 02 - Pseudo instructions, part A (manual sections 4.1 - 4.8)

Source: COMPASS Version 3 Reference Manual, CDC pub. 60492600 rev M (1986), chapter 4
sections 4.1 to 4.8 (OCR lines ~3565-6983), cross-checked against chapter 3 (block structure,
counters, forcing upper, overlays, partial binary) and chapter 11 (listing, error directory).

Conventions in this document:

- `sym` = location-field symbol; `exp` = expression; `aexp` = absolute expression.
- "Location ignored" means: a location-field symbol, if present, is NOT defined (it is ignored;
  the manual does not say a diagnostic is issued; see the note on informative flag 6 in 0.6).
- Octal values are written with a `B` suffix (e.g. `110B`) or with "octal" in words.
- **[OCR]** marks a statement reconstructed from damaged OCR text; **[INFER]** marks a
  best inference not stated explicitly by the manual; **[GAP]** marks behavior the manual
  does not define (the implementer must choose; a suggestion is given).
- "CPU" = 60-bit central processor assembly. "PP" = peripheral processor assembly. There are
  three PP flavors: `PPU` (CYBER 70/76 / 7600 PPU), `PERIPH` (6000 / CYBER 70/170/180 12-bit
  PP), `CIPPU` (CYBER 180 16-bit PP).

---------------------------------------------------------------------------------------------

## 0. Common model (needed by every pseudo instruction below)

### 0.1 Statement format

A pseudo instruction has the same format as a machine instruction: location field, operation
field, variable field, comments field. It controls the assembler at assembly time.

The comments column (default 30, see COL) matters for instructions with a blank variable field:
if the variable field is blank, text at or after the comments column is a comment.

### 0.2 Assembly types

| Type | Declared by | Word size | Position counter initial / reset value |
|---|---|---|---|
| CPU relocatable | default (no ABS/PPU/PERIPH/CIPPU) | 60 bits | 60 |
| CPU absolute | `ABS` | 60 bits | 60 |
| 7600 PPU absolute | `PPU` | 12 bits | 12 |
| 6000/170/180 PP 12-bit absolute | `PERIPH` | 12 bits | 12 |
| CYBER 180 PP 16-bit absolute | `CIPPU` | 16 bits | 16 |

Precedence when several are present: `PPU` beats `PERIPH`; `PERIPH` (or `PPU`) beats `ABS`.
**[GAP]** precedence of CIPPU against PPU/PERIPH is not stated; suggestion: CIPPU beats PERIPH,
PPU beats CIPPU (follow source order of the rules: PPU > others), or flag an O error.

PP programs are always absolute. Ch. 3: "In a PPU assembly, no forcing upper occurs."
**[INFER]** On CIPPU, ch. 3 says the normal position value is "12 (16 if CIPPU is specified and
the long instruction format is used)"; DATA/POS sections say PP word size is "12 or 16". Treat
the CIPPU memory word as 16 bits for all data generation (DATA, CON, DIS, VFD, POS).

### 0.3 Blocks and counters (summary of ch. 3, needed here)

- Each block has three counters: **origin** (`*O`), **location** (`*` or `*L`), **position**
  (`*P`; `$` = position-1 = next available bit number).
- Bits are numbered 59..0 (CPU), 11..0 (12-bit PP), 15..0 (16-bit PP). The position counter
  is the number of bits remaining in the current word: 60/12/16 = empty word; it is
  decremented per bit assembled; it "is never 0 at the beginning of an instruction": at the
  beginning of a new operation, if a value has been stored into bit 0 of a word, the origin
  and location counters are incremented and position is reset to the word size.
- Origin counter: address (relative to block start in pass one) of the next word assembled or
  reserved. Location counter: normally equal to origin; used for defining symbols; differs
  only after LOC. Both are incremented together whenever a word is completed/skipped.
- Block kinds: nominal block (`PROGRAM*` on listing; = absolute block in absolute assembly,
  = zero block "0" in relocatable), absolute block (relocatable assembly: `ABSOLUTE*`, only
  created by ORG/ORGC with an absolute value), zero block (default symbols are allocated at its
  end; in absolute assembly it exists only if default symbols exist and follows the absolute
  block), literals block (`LITERALS*`, always immediately after the zero block), user local
  blocks (allocated after the literals block in order of first establishment), labeled common
  `/name/`, blank common `//`, ECS/LCM variants of local/labeled/blank (CPU only).
- A block group = blocks between IDENT and next IDENT, or IDENT and END. Max 255 blocks per
  group, 252 user-established. More -> **F** error.
- Pass one: relocatable symbols have values relative to their block origin. At IDENT/END the
  group is completed: pass two assigns block origins and all symbols get final values
  (relative to program origin / common block origin; absolute values in absolute assembly).

### 0.4 Forcing upper (CPU only; from ch. 3.2.4)

"Force upper" = if the current word is partially filled, fill the remaining 15-bit parcels with
no-operation instructions (`46000B`), set position to 60, and increment origin and location.
If the word is empty (position = 60) nothing happens.

Before assembling, a force upper occurs when:

1. not enough room remains in the word for the next instruction/data;
2. the statement is a machine instruction or a VFD with a symbol or `+` in the location field;
3. the statement is RE, WE, PS, XJ, CC, CU, DM, IM (RL/WL on NOS, NOS/BE) on 6000/170/180
   (a `-` in the location field negates this);
4. the statement is one of the pseudo instructions **END, BSS, BSSZ, DATA, DIS, CON, SEGMENT,
   SEG, IDENT, ORGC, LOC, ORG, MD**. (R= with a location symbol also forces upper, see 4.8.7;
   VFD with location symbol or `+` forces upper; CON/DATA/DIS always.)

Deferred (post) force upper occurs after JP, RJ, unconditional EQ, unconditional ZR, ES/MJ
(7600), PS/XJ (6000/170/180), IM (CYBER 70/72-73). It is deferred until the next machine
instruction, or data-generating, storage-allocating or binary-control pseudo instruction **in
the same USE block**; a `-` in the location field of that next instruction cancels it. Pseudo
instructions that merely reference `*`, `*O`, `*P` between see the value before the force.
The pending-force-upper flag is saved per block (see USE).

In PP assemblies there is no forcing upper; a `+` in the location field is ignored except on
VFD, where `+` or `-` makes the VFD start in a new word.

### 0.5 First statement group

IDENT must be the first statement of a subprogram. The **first statement group** follows it
and must precede any symbol definition, storage allocation or code generation. These, if used,
MUST be in the first statement group:

    ABS  MACHINE  PERIPH  PPU  CIPPU  STEXT  MEMSEL

These are permissible anywhere, including inside the first statement group (they do not end
it):

    BASE    B1=1    B7=1    CHAR    CODE    COMMENT  CPOP    CPSYN   DECMIC  EJECT
    ELSE    END     ENDD    ENDIF   ENDM    HERE     IFC     IRP     LDSET   LIST
    MACRO   MACROE  MICCNT  MICRO   NIL     NOLABEL  NOREF   OCTMIC  OPDEF   OPSYN
    PPOP    PURGDEF PURGMAC QUAL    RMT     SKIP     SPACE   SST     TITLE   TTL
    XREF

plus comment lines and references to (calls of) macro definitions.

Any CPU/PP machine instruction and any other pseudo instruction cannot be in the first group:
the first use of one terminates the group. A first-group-only instruction found after the group
is terminated -> **O** error ("instruction out of sequence, such as ABS or PPU not in the first
statement group").

Notes: instructions NOT in the list (e.g. COL, EQU, SET, MAX, MIN, USE, ORG, IF/IFxx other
than IFC, ERR, DUP, ECHO) terminate the first statement group. In particular COL is **not** in
the anywhere list. **[OCR]** The list is read from a 6-column table; `ENDD` and `HERE` are as
printed.

### 0.6 Error flags (chapter 11 tables 11-1 / 11-2, restricted to what matters here)

Fatal (alphabetic; any fatal error suppresses binary output):

| Flag | Message | Relevant causes in sections 4.1-4.8 |
|---|---|---|
| A | ADDRESS FIELD BAD | bad variable subfield; CODE char not valid; symbol/name > 8 chars; expression not reducible to one external term; relocatable terms do not cancel; instruction requires an absolute expression; register designator not allowed; 8 or 9 in octal data; LIT with no data; no symbol after `=S`/`=X`/`=Y`; PP relative jump out of range (-31..+31); BASE char not O/M/D/*; register in CON; NOLABEL char not I; negative relocation on ORG/ORGC; POS < 0 or > word size; no comma after DIS word count; illegal entry in IDENT variable field; redefining a global symbol inside a QUAL sequence (with U) |
| D | DOUBLY DEFINED SYMBOL. THE FIRST DEFINITION HOLDS. | symbol previously defined or declared external (EQU/= of existing symbol; SET of an EQU symbol, etc.) |
| E | ECHO, DUP, RMT, OR MACRO ILLEGALLY NESTED | (not in this part) |
| F | NUMBER OF ENTRIES EXCEEDS PERMISSIBLE AMOUNT | LIT generates > 100 words; > 255 blocks; > 511 external symbols; XTEXT data missing; > 63 macro formals+locals |
| L | LOCATION FIELD BAD | the required location field entry is erroneous (missing/invalid sym on EQU, =, SET, MAX, MIN, MICCNT; missing name on SEGMENT) |
| N | NEGATIVE RELOCATION ON ENTRY POINT | ENTRY symbol with negative relocation |
| O | OPERATION FIELD BAD | unrecognizable op; out of sequence (first-group instruction late); **instruction illegal for the binary mode** (e.g. EXT in ABS, ENTRY in PP, USELCM in PP, SEG in relocatable, LDSET in PP/ABS) |
| P | CONSULT LISTING FOR REASON BEHIND P-ERROR | ERR/ERRxx (not in this part) |
| R | DATA ORIGIN OUTSIDE BLOCK OR IN BLANK COMMON | data into blank common; data beyond block limits; storing into a block already written by SEG or a blank IDENT ("range error") |
| U | UNDEFINED SYMBOL. VALUE ASSUMED 0. | undefined symbol, e.g. DIS word count, undefined qualifier |
| V | BIT COUNT ERROR ON VFD (MUST BE 0 < COUNT <= 60) **[OCR: relational signs lost]** | VFD field size erroneous |

Informative (numeric; non-fatal warnings):

| Flag | Message | Relevant causes |
|---|---|---|
| 1 | LOCATION SYMBOL BAD. SYMBOL NOT DEFINED. | location field erroneous; the instruction does not require an entry |
| 2 | ADDRESS ERROR ON SYMBOL DEFINITION. | variable field erroneous; the location symbol is not defined (SET/MAX/MIN/MICCNT "warning flag") |
| 6 | LOCATION FIELD MEANINGLESS. | location entry erroneous; it is ignored |
| 7 | ADDRESS VALUE EXCEEDS FIELD SIZE, RESULT TRUNCATED. | value too large for destination field; **BSS expression negative** |
| 8 | MISSING OR EXTRA ADDRESS SUBFIELD. | subfield missing or superfluous |
| 9 | MICRO SUBSTITUTION ERROR. NO SUBSTITUTION. | (not in this part) |

Where this document says "error" without a letter, the manual gives no letter; the best-fit
letter from the tables is proposed with **[INFER]**.

### 0.7 Mode stacks (BASE, CODE, QUAL, USE)

BASE, CODE, QUAL and USE each maintain a table of the **most recent 50** occurrences
(push-down stack, capacity 50; when a 51st entry is pushed, the oldest is discarded **[INFER]**).
`X *` pops the most recent entry and resumes it; if the stack is empty, the default is used
(BASE -> decimal, CODE -> display, QUAL -> global (null) qualifier, USE -> nominal block).

### 0.8 Predefined micros BASE, CODE, QUAL

COMPASS predefines micros named `BASE`, `CODE`, `QUAL`. When a BASE / CODE / QUAL pseudo
instruction changes the mode, **if no program or system micro of that name has been defined**,
the predefined micro is changed to: BASE -> single letter `D`, `M` or `O`; CODE -> single letter
`A`, `D`, `E`, `I`, `N` or `O`; QUAL -> the new qualifier name (0-8 chars). If the user (or
system text) has defined its own micro of that name, it is left alone. **[INFER]** initial
values: BASE = `D`, CODE = `D` (CIPPU: `N`), QUAL = empty.

---------------------------------------------------------------------------------------------

## 1. Overview and classification (4.1)

Classes (manual 4.1.1):

- Subprogram identification: IDENT, END
- Binary control: ABS, MACHINE, PERIPH, PPU, CIPPU, IDENT (overlay/partial form), SEGMENT, SEG,
  LCC, MEMSEL, LDSET, STEXT, COMMENT, NOLABEL
- Mode control: BASE, CHAR, CODE, COL, B1=1, B7=1, QUAL
- Block counter control: USE, USELCM, ORG, ORGC, BSS, LOC, POS
- Symbol definition: EQU and =, SET, MAX, MIN, MICCNT, SST
- Subprogram linkage: ENTRY, ENTRYC, EXT
- Data generation: BSSZ and blank operation code, DATA, DIS, LIT, VFD, CON, R=, REP, REPC, REPI
- (Other parts: conditional assembly, error control, listing control, definitions, micros.)

Required: IDENT (first statement) and END (last). The intro table of "important" pseudo
instructions and the assembly types they apply to is badly garbled **[OCR]**; best reading:

| Pseudo | Section | CPU reloc | CPU abs | PP abs |
|---|---|---|---|---|
| IDENT | 4.2.1 | x | x | x |
| ABS | 4.3.1 | | x | |
| PPU / PERIPH | 4.3.3/4.3.4 | | | x |
| ORG | 4.5.3 | | x | x |
| ENTRY | 4.7.1 | x | | |
| BSS | 4.5.4 | | x | x |
| CON | 4.8.6 | x | | |
| END | 4.2.2 | x | x | x |

(Informational only; legality is defined by each section below.)

---------------------------------------------------------------------------------------------

## 2. Subprogram identification

### 2.1 IDENT - subprogram identification (first IDENT) (4.2.1)

IDENT is the first statement of a subprogram. Lines before the first IDENT, and between an END
and the next IDENT, are treated as comments (normal COMPASS-control-statement run). When COMPASS
is called by another language processor (e.g. FORTRAN), control returns to that processor when
the statement after END is not IDENT; in that mode, IDENT must be in columns 11-15.

Multiple subprograms in one run: the end of the source decks is an end-of-section (7/8/9).

Relocatable subprogram: any further IDENT before END is an error **[INFER: O]**. Absolute or PP
subprogram: further IDENTs create overlays / partial binary (see 3.6).

Formats:

    CPU relocatable:      IDENT  name
    CPU absolute:         IDENT  name,origin,entry,l1,l2
    7600 PPU absolute:    IDENT  name,origin,entry,ppu
    6000-series PP abs:   IDENT  name,origin            (applies to PERIPH and CIPPU)

Location field: ignored.

Subfields:

- `name` (required): subprogram/overlay name.
  - CPU (reloc or abs): 1-7 chars, first alphabetic A-Z, last not a colon.
  - 7600 PPU: 1-7 chars, any first character, last not colon.
  - PERIPH (12-bit PP): 1-3 chars; CIPPU (16-bit PP): 1-4 chars; any first char, last not colon.
  - Violation -> **A** ("illegal entry in the variable field of IDENT").
- `origin` (absolute / PP only; ignored for relocatable): expression = first word address of the
  absolute program or overlay. May be symbolic and may refer forward (example: `IDENT
  CT,CONTROL,CONTROL` where CONTROL is defined later) **[INFER: evaluated in pass two]**.
  - The overlay = the loader table plus all code from this address up to the next SEGMENT,
    nonblank IDENT, or END.
  - Load address: CPU single entry point -> `origin-1` (the word at origin-1 is overlaid by the
    5000B loader control table). CPU multiple entry points (ENTRY used in absolute program) ->
    `origin-wc-1` where wc = number of entry points in the 5100B table (the table uses one word
    more than the number of entries). PP -> `origin-5`: five 12-bit PP words are overlaid by the
    60-bit loader table (PP header). **[GAP]** CIPPU (16-bit words): not stated; suggest 5 words
    as well (or 4 = ceil(60/16)); pick 5 for compatibility with the text.
  - Data may be generated at origin and above, never below origin -> **R** error for data below.
  - origin does NOT set the origin counter; it does not replace ORG.
  - Null origin: CPU absolute -> `000000` (RA(S)); PP -> `0000`.
  - Relocatable: ignored. The loader places the first subprogram at RA+100B, the next after it,
    etc.
- `entry`: (CPU absolute and 7600 PPU) expression, may be symbolic, = entry (transfer) address.
  For CPU absolute this is the transfer address (END's trasym is ignored in absolute).
- `l1`,`l2`: (CPU absolute) absolute expressions, overlay level numbers, primary (0-63) and
  secondary (0-63). For the first IDENT they may be omitted for the main overlay: omitted l1 ->
  0, omitted l2 -> 0. Because the first IDENT precedes any BASE, these numbers are evaluated as
  **decimal** unless an explicit post-radix (e.g. `B`) is given.
- `ppu`: (7600 PPU) absolute expression, number of the PPU on which the program is loaded;
  decimal on the first IDENT unless designated octal.

Listing: if the subprogram has no TITLE, the IDENT variable field is used as the main listing
title.

IDENT forces upper (CPU) and starts a new block group (all counters zero).

Example:

    CT      IDENT  CT,CONTROL,CONTROL     (location ignored)
            ABS                           ABSOLUTE CPU PROGRAM
            ORG    110B
    CONTROL BSS    0                      DEFINES SYMBOL CONTROL
            ...
            END
    -> absolute CPU program CT loaded with origin 110B (load address 107B).

### 2.2 END - end of subprogram (4.2.2)

Format:

    sym   END   trasym

END must be the last statement of each subprogram. It:

1. Forces upper (CPU).
2. Terminates all counters, conditional assembly, macro generation and code duplication
   (open IF ranges, macro/DUP/ECHO definitions or expansions are closed). **[INFER]** END is
   recognized even inside skipped code / open definitions; coordinate with spec of 4.9/ch.5.
3. Before terminating, assembles any waiting remote text (RMT).
4. Relocatable: combines all local blocks into a relocatable subprogram block (the local
   blocks become extensions of the zero block: order = zero block (with default symbols at its
   end), literals block, user local blocks in order of establishment), generates relocatable
   binary tables, produces the listing.
5. Absolute: assigns each block an origin relative to absolute zero (absolute block, then zero
   block if any, literals block, local blocks), combines all blocks into an absolute subprogram
   or overlay, writes the absolute binary section, produces the listing. END dumps the last
   overlay or completes a partially written section (after SEG / blank IDENT).
6. Clears the symbol table before the next subprogram (ch. 3).

Location `sym` (optional): defined as the total subprogram length, including the literals block
and all local blocks = last word address + 1. **[INFER]** For relocatable, length per ch. 3 =
sum of final origin counters of local blocks incl. zero and literals blocks, NOT the absolute
block.

Variable `trasym` (optional): relocatable assembly only: symbol naming the entry point to which
control transfers (transfer address). It must be declared as an entry point in *some*
subprogram, not necessarily this one (so it is passed by name to the loader; **[INFER]** an XFER
loader table). At least one subprogram of a load must have a transfer address (else loader
error); if several, the loader uses the last. A subprogram with a transfer address is a main
program. Absolute assembly: trasym ignored (IDENT entry is used).

END read from an external source (XTEXT) just ends that source; it does not terminate the
subprogram.

Example:

            IDENT  PROG1
            ENTRY  BEGIN
            ...
    BEGIN   SA1    ...
            ...
            END    BEGIN

---------------------------------------------------------------------------------------------

## 3. Binary control (4.3)

### 3.1 ABS - absolute CPU program (4.3.1)

    ABS

First statement group only. Location and variable fields ignored. Declares a CPU absolute
program. If both ABS and PERIPH (or PPU) appear, PERIPH/PPU wins.

Illegal in an absolute program (-> **O**): EXT, LCC, REP, REPC, REPI. (Also, per their own
sections: LDSET, NOLABEL is legal; ENTRY/ENTRYC legal and generate 5100B; R= legal.)

`=X` prefix: a symbol may carry `=X` if it is also defined conventionally; then `=X` has no
significance (conventional definition takes precedence). **[INFER]** `=X` on a symbol never
defined conventionally is an error in absolute (no externals): flag **U** or **A**.

In absolute assembly, `USE /name/` and `USE //` make local blocks named `/name/` / `//`
(data may be stored in `//`).

### 3.2 MACHINE - declare object processor type (4.3.2)

    MACHINE  type,hfi1,hfi2,...,hfi9

First statement group only. Location ignored. Effect on the instruction set and on the PRFX
(7700B prefix) table fields "target", "valid" and "hardware-instruction-dependencies". The
loader reconciles required features with actual hardware; a missing feature is a fatal loader
diagnostic.

`type`: character string of any length, any chars except blank and comma. First char:

- `6`: CYBER 180, CYBER 170, CYBER 70 models 71-74, 6000. All machine instructions unique to
  CYBER 70/76 or 7600 become **undefined** (-> O when used).
- `7`: CYBER 70/76 or 7600. All instructions unique to 6000/70-71..74/170/180 are undefined,
  **except PS** (kept because often used for subroutine entry in CPU code).
- `8`: CYBER 180 models 810, 815, 825, 830, 835, 840, 845, 850, 855, 860, 865, 875, 990. All
  instructions unique to other systems undefined. Must not be used if `S=AIDTEXT` is on the
  COMPASS control statement.

CPU assembly:
- MACHINE omitted, type blank, or first char not 6/7/8: all CPU instructions are defined; PRFX
  target and valid fields = blanks.
- First char 6/7/8: valid field = `6X`, `7X`, `8X`.
- If type has >= 2 chars, first is 6/7/8 and second is a digit 0-9: target field = those two
  characters (e.g. `MACHINE 74` -> target `74`, valid `7X`). Otherwise target blank **[INFER]**.

PP assembly:
- MACHINE omitted / blank / first char not 6,7,8: PERIPH -> MACHINE 6 assumed; PPU -> MACHINE 7;
  CIPPU -> MACHINE 8. Target field = blanks; valid field = `6P`, `7P`, `8P`.
- **[GAP]** PP with explicit valid MACHINE: presumably valid = `<c>P`, target blank.

`hfi` (optional, 0-9 subfields): string of any length, no blank/comma. No effect on assembly.
The first character of each is placed in the hardware-instruction-dependencies field of PRFX
(**[INFER]** one character per hfi, in order). Recommended letters: `C` compare/move unit,
`D` distributive data path, `I` integer multiply, `L` ECS/LCM, `R` interlock register,
`X` central and monitor exchange jumps. More than nine hfi: extras ignored. If no hfi, the comma
after type may be omitted.

Example: `MACHINE 6,CMU,LCM,XJ` -> valid `6X`, target blank, dependencies `C`,`L`,`X`.

### 3.3 PPU - CYBER 70/76 or 7600 PPU program (4.3.3)

    PPU  J

First statement group only. Location ignored. Declares a 7600 absolute PPU program (binary format
per Loader manual).

Illegal in this assembly (-> **O**): floating-point constants (-> **A** **[INFER]**), ENTRY,
ENTRYC, EXT, LCC, REP, REPC, REPI, SEG, SEGMENT, USELCM, R=, B1=1, B7=1.
Legal but not applicable: OPDEF, CPOP, CPSYN, PURGDEF (accepted, no effect on PP code).
PPU beats PERIPH if both present. `=X` allowed on a symbol also defined conventionally (X
ignored). Symbols that look like CPU register designators (A1, X3, B7, ...) are ordinary symbols
in PP assemblies.

Variable field `J` option (a character string beginning with `J`): changes how the variable
expression of short jumps **UJN, ZJN, NJN, MJN, PJN** is assembled (6-bit relative field,
range -31..+31):

- Without J: if the expression value v is in -31..+31, assemble v itself (it is taken as the
  relative displacement). Otherwise compute v - (location counter); if in range, assemble
  that; else fatal error (**A**, "relative jump out of range").
- With J: always assemble v - (location counter).
- Purpose: distinguish an absolute address that happens to be in the short-jump range from a
  true relative displacement.

Example (OCR-damaged): code at 740/741 (octal): `TAG PSN` ... `UJN TAG` assembles relative
displacement; with `PPU JUMP` the same UJN computes TAG-*. **[OCR]**

### 3.4 PERIPH - 6000/170/180 12-bit PP program (4.3.4)

    PERIPH  J

Same as PPU except: declares a CYBER 180 / 170 / 70-72,73,74 / 6000 12-bit absolute PP program.
Illegal list: floating-point constants, ENTRY, ENTRYC, EXT, LCC, REP, REPC, REPI, SEG, USELCM,
R=, B1=1, B7=1. (SEGMENT is NOT in this list: SEGMENT is legal in PERIPH; it is "intended for
6000 Series CPU absolute or PPU assemblies".) Legal-but-inapplicable: OPDEF, CPOP, CPSYN,
PURGDEF. J option identical (manual lists UJN, ZJN, MJN, PJN; NJN dropped in this copy -
**[INFER]** apply to NJN too). First statement group only. Location ignored.

### 3.5 CIPPU - CYBER 180 16-bit PP program (4.3.5)

    CIPPU  J

First statement group only. Location ignored. Declares a CYBER 180 absolute PP 16-bit program.
Required to use the "long" (16-bit) PP instruction set and to allow MEMSEL > 4. Same illegal list
as PERIPH, same legal-but-inapplicable list, same J option. Default character code becomes 8-bit
ASCII (CODE N) instead of display code. Default MACHINE 8. IDENT name 1-4 characters.

### 3.6 IDENT - identify and generate overlay (second and later IDENT) (4.3.6)

Two or more IDENTs are allowed in CPU absolute and PP assemblies.

Formats:

    CPU absolute:      IDENT  name,origin,entry,l1,l2
                  or   IDENT                          (blank variable field: partial binary)
    7600 PPU:          IDENT  name,origin,entry,ppu
    6000 PP:           IDENT  name,origin

Location ignored. Binary goes to the file given by the B parameter of the COMPASS statement.

**Nonblank second/subsequent IDENT** = new overlay. Differences from SEGMENT:

1. Allows overlay numbers.
2. The USE table and all block counters are reinitialized (block group completed: pass-two
   processing of the group happens now). The symbol table is NOT cleared; all symbols are
   reassigned absolute addresses relative to absolute zero. Hence `ORG sym` to a symbol of an
   earlier overlay restarts the absolute block at that address.
3. End of the previous overlay is normally its last word address = maximum origin counter of
   the last block established in the overlay; but if a SEG or SEGMENT preceded, the written
   binary ends at the current origin counter.

Output on a nonblank IDENT: memory image of the previous overlay from its origin (given on the
previous IDENT) to its end, then end-of-section (end-of-record), then the identification/header
information (PRFX + header table) of the new overlay.

After an IDENT all blocks, including literals, are complete; block structuring starts fresh:
each overlay may reuse block names and has its own literals block (and zero block if default
symbols).

Subfields:
- `name`: overlay name; CPU 1-7 chars, first A-Z; PERIPH 1-3 chars; 7600 PPU 1-7 chars; last
  never a colon. Required loader linkage symbol.
- `origin`: first word address of overlay. Load address origin-1 (5000B table) or origin-wc-1
  (5100B table, wc entries) for CPU; origin-5 for PP. Data only at origin and above. Not an
  ORG. The origin may be below the origin on any other IDENT/SEGMENT (may lie anywhere in a
  previous overlay; possible because all block sizes are known).
- `entry`: overlay entry address; on call, control optionally transfers there.
- `l1`,`l2`: CPU only, 00-77B each. On these later IDENTs they follow the current BASE: "If base
  is M, l1 and l2 are assumed to be octal" (base D -> decimal; base O -> octal). Not specified ->
  **l1 = 01, l2 = 00** (default 1,0 for every overlay after the first; the first gets 0,0).
- `ppu` (7600): PPU number; if base is M, octal.

Overlay level conventions (ch. 3, not enforced): 0,0 main; n,0 primary; n,m secondary.

**Blank IDENT (CPU only)** = partial binary write:
- writes all binary accumulated since previous IDENT/SEG/SEGMENT, WITHOUT end-of-section and
  WITHOUT a new 7700B table;
- USE table and block counters reinitialized; every symbol is assigned an absolute address;
- each partial section is allocated as if it were a new subprogram with its own absolute block,
  literals block, local blocks; the origin of the new absolute block = lwa+1 of the binary
  written (next word after it);
- writing into, or resetting the origin counter into, a location of a partial section already
  written -> range error (**R**);
- COMMENT after a blank IDENT is ignored silently.

Example 1 (overlays; symbols T.OVL, O.DMP1 from system text):

            IDENT  DMP1,T.OVL,O.DMP1
    ...     BASE   M
            COMMENT  ...
            ORG    T.OVL
            SST
            QUAL   DMP1
            ...
            IDENT  DMP2,T.OVL,O.DMP2       overlays DMP2 .. DMP8
            ORG    T.OVL
            ...
            IDENT  DMP9,T.OVL,O.DMP9
            ...
            END                            ends overlay DMP9

Example 2 (blank IDENTs): `IDENT WV,100B,ENT-1` ... `ABS` ... `ORG 100B` ... `LIT` ... `IDENT`
... `LIT` ... `IDENT` ... `LIT` ... `END` -> three partial binaries, each with its own
ABSOLUTE / LITERALS / local blocks, contiguous in one section. **[OCR]**

### 3.7 SEGMENT - generate binary segment (4.3.7)

    name  SEGMENT  origin,entry,l1,l2

Location `name` required (-> **L** if missing): overlay name; CPU 1-7 chars first A-Z; PP 1-3
chars; last not colon; required loader linkage symbol. Forces upper.

Legal in CPU absolute and PP assemblies (illegal in 7600 PPU per the PPU list). In a
**relocatable** subprogram SEGMENT causes the pending BSSZ code and the FILL, REPL and LINK
relocatable tables to be written to the binary file (a flush) **[INFER: no overlay is made]**.

Semantics:
- The first SEGMENT dumps all binary accumulated since the IDENT as the main (0,0) overlay.
- Each later SEGMENT starts a new overlay with the given level numbers; END dumps the last one.
- On SEGMENT: memory image from the previous overlay origin (previous SEGMENT, or IDENT for the
  first) to the **current origin counter of the block in use**, then end-of-section, then header
  information for the next overlay.
- SEGMENT does not clear the symbol table, does not reinitialize the USE table or block
  declarations. All blocks other than the block in use must be complete. Blocks of previous
  overlays cannot be resumed; their names stay in the USE table, so each new overlay must use
  new block names. Only symbols valid for the block in use can define the new origin.
- CPU: the literals block must lie entirely in one overlay (any one) - in practice the overlay
  containing the end of the absolute block.

Subfields:
- `origin`: relocatable expression = first word address of overlay; may only be an address in
  the block in use. Load address origin-1 (CPU, 5000B table) / origin-5 (PP). Data only at
  origin and above. Not an ORG. May be below other IDENT/SEGMENT origins.
- `entry`: CPU only; overlay entry address.
- `l1`,`l2`: CPU only, 00-77B; base M -> octal; default l1=01, l2=00.

Example:

            IDENT  SAMPLE,...,ENTA
            ABS
            ORG    110B
    ENTA    ...                    ENTRY POINT
    OVLOC   BSS    0               OVERLAY LOAD POINT
            ...
    SEG1    SEGMENT OVLOC+1,ENTB
            ORG    OVLOC
            BSS    1               FIRST WORD = LOADER TABLE
    ENTB    ...                    EXECUTION BEGINS HERE
            ...
            END
    -> SEG1's first word is loaded at OVLOC+1 after the loader table (at OVLOC); entry ENTB; the
       overlay occupies main-program memory from OVLOC. **[OCR]**

### 3.8 SEG - write partial binary (4.3.8)

    SEG

Location and variable ignored. CPU absolute only; illegal in PP and relocatable (-> **O**).
Forces upper.

- Writes all binary accumulated since the previous IDENT, SEGMENT or SEG: from the first block
  established in that portion to the current origin counter of the current block. No
  end-of-section, no new PRFX. A later SEGMENT, IDENT or END completes the section.
- Does not change location/origin counters. Symbol table and USE table are not reinitialized.
- Afterwards, no block established before the SEG can be resumed, except the block in use when
  the SEG was met. Resetting the origin counter to resume an already-written block -> **R**;
  storing data into a block not in the current partial record -> fatal (R). Because the old
  names stay in the USE table, no new block may reuse a name used before the SEG.
- The literals block is written in the portion containing the end of the absolute block.
- COMMENT after SEG is ignored silently.
- Purpose: assemble a large absolute program in less memory (largest partial determines
  assembler storage). The result loads as one program.

### 3.9 STEXT - generate system text record (4.3.9)

    rname  STEXT

First statement group only. Variable field ignored. `rname` in the LOCATION field **[OCR:
format box ambiguous; "An entry in the variable field, if present, is ignored" confirms rname
is the location field]**: 1-7 alphanumeric chars, first A-Z, last not colon; placed in the
prefix table preceding the overlay.

- rname blank: overlay named from IDENT; ONLY system text is generated (no program binary).
- rname nonblank: system text is generated in addition to the relocatable/absolute binary and
  precedes it on the binary file.

At the end of pass one, the binary output gets, in overlay format, all symbols, micros and
opcodes (macros, opdefs, machine and pseudo instructions) as follows:

- Symbols: all defined symbols EXCEPT those that are: relocatable or external valued; qualified;
  redefinable (defined by SET, MAX, MIN, MICCNT); defined by statements read through XTEXT or
  between CTEXT and ENDX; defined by SST (system symbols input to this assembly); "8 characters
  beginning with ..." **[OCR: the character is unreadable (`f i`); possibly a special
  character; GAP]**.
- Micros: all defined micros.
- Opcodes: all program-defined opcodes. Not included: built-in machine and pseudo instructions,
  and opcodes that came from system text input to this assembly.

Use: a later COMPASS run with the G or S control-statement option loads the system text: all
micros and opcodes are defined automatically at the start of every assembly; symbols are
defined only in assemblies containing SST. A system text cannot be generated and used in the
same COMPASS call (batch).

System text overlay control table (absolute overlay on the library) **[OCR]**:

    bits 59-48 = 5000B, bits 47-42 = 01, bits 41-36 = 01, bits 35-0 = 0

Text format: a header giving the number of words in each part, then: system symbol table (2
words per entry), micro definitions, macro/opdef definitions, operation table entries (2 words
per entry). Exact encodings are not in the manual **[GAP]**: an emulator may define its own
format (only round-tripping between our own assemblies matters).

### 3.10 COMMENT - prefix table comment (4.3.10)

    COMMENT  string

Location ignored. Inserts characters into words 8 through 14 of the PRFX (7700B) table (70
characters max). Ignored by the loader; identifies the section.

String extraction (exact rule):
1. Scan columns after the blank that ends the operation field.
2. If no nonblank character is found before the default comments column (COL value), the
   string starts at column (comments column - 1).
3. Else the string starts at the first nonblank character after the operation field.
4. The string ends with the last nonblank character of the statement (comments included;
   statement = columns 1-72).
5. Append 1 to 10 blanks so that the string is followed by at least one blank and its length is
   a multiple of 10.
6. Variable+comment fields all blank -> 10 blanks.
7. Characters beyond the 70th are lost.

Several COMMENTs: new comments are appended to the table of the most recent binary control
statement (IDENT/SEGMENT) **[INFER: still within the 7-word limit]**. Meaningless if NOLABEL is
present. Ignored silently after SEG or a blank IDENT. Characters are stored in display code
**[INFER]**.

### 3.11 NOLABEL - delete header tables (4.3.11)

    NOLABEL  I

Location ignored. Illegal in a relocatable CPU assembly (-> **O**). For absolute (CPU or PP)
output; e.g. deadstart programs loaded at location 0.

- Variable field beginning with `I`: suppress all prefix (7700B) tables, keep other header
  tables.
- Variable field blank: suppress prefix tables (7700B), overlay control tables (5000B), multiple
  entry point tables (5100B), PP header control tables.
- Any other first character -> **A** ("NOLABEL character is not I").

### 3.12 LCC - loader directive (4.3.12)

    LCC  directive

Location ignored. Relocatable only (illegal in ABS and PP -> **O**). `directive` = from the first
nonblank after LCC up to the next blank. Written unedited as a separate section in packed
display code for the loader (ch. 3: relocatable output = one section per LCC, followed by one
section with the subprogram loader tables). Illegal forms are detected by the loader, not
COMPASS.

### 3.13 MEMSEL - CYBER 180 PP memory size (4.3.13)

    MEMSEL  options

First statement group only. CIPPU (16-bit PP) programs only (CIPPU needed for size > 4).
Controls address field calculation/validation of the PP `m` (memory address) field:

- blank or `4`: 4096-word memory, addresses 0-7777B.
- `8`: 8192-word memory, addresses 0-17777B (CYBER 180 model 990 and some 840/850/860).
- **[GAP]** other values: treat as A error. MEMSEL with PERIPH/PPU: O error **[INFER]**.

### 3.14 LDSET - generate LDSET object directives (4.3.14)

    LDSET  option,option,...

Location ignored. Relocatable only (illegal in PP or absolute CPU -> **O**). Any number of
LDSET statements; COMPASS collects all options and writes one LDSET (7000B) table between the
PRFX (7700B) table and the PIDL (3400B) table. Not written if no LDSET. Allowed anywhere (also
in first statement group). COMPASS does not need to validate option semantics beyond syntax
**[INFER]**; the list (per Loader manual) is:

| Option | Meaning |
|---|---|
| `LIB` | clear local library set |
| `LIB=lib1/lib2/.../libn` | add libraries to local library set |
| `MAP` | load map to OUTPUT |
| `MAP=p` | map items p: NOS/NOS-BE: `N` none or any combination of `S` statistics, `B` block list, `E` entry point list, `X` cross reference; SCOPE 2: `0`/`O` none, `S`, `B`, `E`, `X` cumulative levels |
| `MAP=p/lfn` | map to file lfn |
| `MAP=/lfn` | map to lfn, installation default items |
| `PS=p` | map page size, decimal 10-999999 lines (else installation default; not SCOPE 2) |
| `PD=p` | print density 6 or 8 lpi (other = default; not SCOPE 2) |
| `PRESET=p` | preset memory: 1-20 digit octal with optional +/- prefix and optional B suffix (NOS/BE), or keyword: NONE (no presetting; for ECS, or LCM and SCM under SCOPE 2), ZERO (0000 0000 0000 0000 0000), ONES (7777 7777 7777 7777 7777), INDEF (1777 0000 0000 0000 0000), INF (3777 0000 0000 0000 0000), NGINDEF (6000 0000 0000 0000 0000), NGINF (4000 0000 0000 0000 0000), ALTZERO (2525 2525 2525 2525 2525), ALTONES (5252 5252 5252 5252 5252), DEBUG (6000 0000 0004 0040 0000) **[OCR: columns misaligned; pairing taken in listed order, which matches the usual CDC values]** |
| `PRESETA=p` | as PRESET, and the low 17 bits (CM/SCM) or 24 bits (ECS/LCM/LCME) of each word contain its address |
| `ERR=ALL` / `ERR=FATAL` / `ERR=NONE` | loader abort on any / fatal / only catastrophic errors |
| `REWIND` / `NOREWIN` | default rewind option for load files |
| `EPT=e1/e2/...` | declare entry points of generated CAPSULE/OVCAP |
| `NOEPT=e1/e2/...` | do not declare them |
| `USEP=p1/p2/...` | force load of named object modules |
| `USE=e1/e2/...` | force load of modules containing these entry points |
| `COMMON` | assign all labeled blocks to a segment visible to all referencing segments (segment loads) |
| `COMMON=b1/b2/...` | same for named blocks |
| `SUBST=e1-e2/...` | treat references to e1 as references to e2 |
| `OMIT=e1/e2/...` | do not satisfy these externals |

The 7000B table binary layout is in the Loader manual, not here **[GAP]**.

---------------------------------------------------------------------------------------------

## 4. Mode control (4.4)

Each mode has a default used if the instruction never appears.

### 4.1 BASE - numeric data mode (4.4.1)

    mname  BASE  mode

Default: decimal. Allowed anywhere (incl. first statement group).

- `mname` (optional location): 1-8 char micro name; if present, micro mname is (re)defined as
  the single letter `D`, `M` or `O` of the base in effect **before** this BASE.
- `mode`: blank -> base unchanged (useful with mname to save it); else 1-8 chars whose first
  char selects:
  - `O` octal: unsuffixed numeric items are octal (`15` and `15B` = 15B; `15D` = 17B). An item
    containing 8 or 9 without a D radix -> **A**. Exceptions always decimal: scale factors,
    character counts, shift counts (S modifier), binary point positions.
  - `D` decimal: unsuffixed numeric items are decimal.
  - `M` mixed: decimal for the following, octal for everything else:
    VFD bit count; IF, ELSE, SKIP line count; MICRO, OCTMIC, DECMIC character count; B, C, I
    subfields of REP/REPC/REPI; DUP or ECHO line count; character count; shift count (S
    modifier); scale factor; binary point position; COL column number; DIS word count; SPACE
    line count.
  - `*`: resume previous base (pop the BASE stack; empty -> decimal).
  - anything else -> **A** (variable field not blank and not one of these).
- Explicit radix (pre/post `O`, `D`, `B`, see ch. 2) always overrides the base.
- Each non-* BASE pushes the previous base on the 50-entry stack **[INFER: a blank-mode BASE
  pushes nothing]**.
- Updates predefined micro BASE (0.8).

Listing: address field shows `b1->b2` (old base, new base) right-justified (OCR shows e.g.
`O,.O`, `D,.M`; the separator glyph is an arrow **[OCR]**).

Examples (VFD of a 48-bit field holding 10B):

            BASE  O
            VFD   60/10        60 octal = 48 bits, value 10B -> 0000000000000010
            BASE  D
            VFD   48/8         -> 0000000000000010
            BASE  M
            VFD   48/10        bit count decimal, value octal -> 0000000000000010

    SAVEB   BASE  M            save base in use in micro SAVEB, switch to M
            ...                code using base M
            BASE  "SAVEB"      restore saved base (micro reference; micro marks shown as ")
            BASE  *            or: restore via the stack

### 4.2 CHAR - define "other" character code (4.4.2)

    CHAR  exp1,exp2

Location ignored. Both absolute evaluatable expressions in 00-77B. exp1 = display-code value of a
character; exp2 = its new code value under CODE O. Initially the "other" table equals display
code. May be repeated any number of times for the same character (last wins). Values outside
00-77B -> **A** or **7** **[INFER]**.

Example: `CHAR 0,63B` and `CHAR 63B,0` interchange colon (00) and percent (63B) in CODE O.
Listing shows `00->63`, `63->00` **[OCR]**.

### 4.3 CODE - character data code (4.4.3)

    mname  CODE  char

All constants, character strings and character data items are generated in the selected code
until the next CODE. Default: display code (6-bit); for CIPPU assemblies the default is 8-bit
ASCII (`N`). Code tables: appendix A. Allowed anywhere.

- `mname` optional: micro (re)defined to the single letter A, D, E, I, N or O of the code in
  effect before this CODE.
- `char` first character:
  - `A` ASCII six-bit subset (= 6-bit display of ASCII graphics: ASCII code - 40B, e.g. `O`=57B,
    `U`=65B, `T`=64B, `P`=60B, as in the example)
  - `D` display
  - `E` external BCD
  - `I` internal BCD
  - `N` ASCII eight-bit character set
  - `O` other (CHAR-defined)
  - `*` code before current (pop 50-entry stack; empty -> display)
  - other -> **A** ("CODE character is not A, D, E, I, O or *" - the table predates N).
- **[GAP]** blank char: suggest "unchanged" (analogous to BASE) or A error.
- Updates predefined micro CODE (0.8).
- Listing: `c1->c2` right-justified in address field.

Example (DATA 0LOUTPUT under each code; 60-bit words):

    (initial D)      DATA 0LOUTPUT   -> 17252420252400000000
    CODE ASCII  D->A DATA 0LOUTPUT   -> 57656460656400000000
    CODE EXTERNAL BCD A->E           -> 46242347242300000000
    CODE INTERNAL BCD E->I           -> 46646347646300000000
    CODE DISPLAY I->D                -> 17252420252400000000
    CODE *      D->I                 -> 46646347646300000000   (back to internal BCD)

Only the first character of the variable field matters ("ASCII", "DISPLAY" ...).

**[GAP]** Packing of N (8-bit) characters into words: not described in this part (see ch. 2 /
appendix A spec). For CIPPU, 2 eight-bit characters per 16-bit word is the natural reading.

### 4.4 QUAL - qualify symbols (4.4.4)

    mname  QUAL  qualifier

Begins a sequence of code in which symbols defined are qualified (or global for blank). No QUAL
in a subprogram -> all symbols global. Allowed anywhere.

- `mname` optional: micro (re)defined to the 0-8 chars of the qualifier in effect before this
  QUAL.
- `qualifier`:
  - 1-8 char name; first char not `$`, `=`, `:` or a digit; may not contain `+ - * / ,` or
    caret (^) **[OCR: "+ - ·I, or A" read as + - * / , ^]**. A blank terminates it.
    Symbols defined from here to the next QUAL must be referenced from outside the sequence as
    `/qualifier/symbol`. The current qualifier is shown as the 3rd sub-subtitle of the listing.
  - `*`: resume previous qualifier (pop 50-entry stack; empty -> null/global).
  - blank: symbols defined up to the next QUAL are global.
- Each non-* QUAL pushes the previous qualifier **[INFER]**. Updates predefined micro QUAL.

Reference rules:
- Inside the sequence where a symbol was defined, it may be referenced unqualified.
- If a symbol is defined both globally and under the current qualifier, an unqualified
  reference inside the sequence means the qualified one; the global must be written
  `//symbol`.
- Exception: in NOREF, if the unqualified symbol is defined and the qualified one is not, the
  reference is to the unqualified symbol.
- **[INFER]** Lookup for an unqualified reference: current qualifier first, then global.
- Default symbols (=S/=X/=Y) and linkage symbols (ENTRY/EXT) are never qualified.
- Undefined qualifier in `/q/sym` -> **U**.

NOTE: the first attempt to redefine a global symbol (SET, MAX, MIN, MICCNT) from within a QUAL
sequence produces **A and U** errors, and the symbol is defined local to the QUAL sequence with
value zero. Workaround: blank QUAL before the redefinition, QUAL * after.

Examples:

    PASS1   QUAL
    CODE    ...              CODE QUALIFIED BY PASS1
            QUAL  PASS2
    LOC2    ...              QUALIFIED BY PASS2
            QUAL             SYMBOLS GLOBAL FROM NOW ON
            ...
            RJ    /PASS1/CODE  JUMP TO PASS1 ROUTINE
            RJ    /PASS2/CODE
            QUAL  Z
    Z1      BSS   0          Z1 QUALIFIED BY Z
            QUAL  B
    Z1      =     /Z/Z1      Z1 IN Z CAN BE REFERRED TO AS Z1 IN B
    **[OCR: reconstruction]**

### 4.5 B1=1 and B7=1 (4.4.5)

    B1=1
    B7=1

CPU only (illegal in PP -> **O**). Location/variable ignored. Declare that register B1 (resp.
B7) contains one. No code generated; the user must load the register. Effect: changes code from
R= (4.8.7) and defines the symbol `B1=1` (resp. `B7=1`) **[INFER: as an absolute symbol, value 1;
usable in IF tests such as `IF DEF,B1=1`]**. If several are used, the last encountered rules
(so B1=1 then B7=1 -> B7 used). Allowed anywhere.

### 4.6 COL - set comments column (4.4.6)

    COL  n

Location ignored. Sets the column at which the comments field can begin when the variable field
is blank. Default 30. NOT allowed in first statement group (terminates it, see 0.5).

- `n`: absolute evaluatable expression; base M -> decimal (base O -> octal).
- n < 12 -> 12. n = 0 or blank -> 30.
- If the current statement's operation field extends past the current comments column, a very
  large number is used for n in that statement only; i.e. if n <= last column of the operation
  field, a variable field must be present if a comment is present.
- Listing: address field shows the new column number.

Example: `COL 36` -> later statements with blank variable field cannot have comments starting
before column 36 (`USE` then text at col 30 would be read as the variable field).

---------------------------------------------------------------------------------------------

## 5. Block counter control (4.5)

These establish local blocks, labeled common, blank common (in addition to the absolute, zero
and literals blocks made by the assembler) and change origin, location and position counters.

### 5.1 USE - establish and use block (4.5.1)

    USE  block

Location ignored. The block in use receives subsequently assembled code. Up to 252 user blocks
per group (255 total) -> **F** beyond.

`block`:
- `0` or blank: nominal block (absolute block in absolute assembly, zero block in relocatable).
- `//`: blank common. Relocatable: cannot contain data; only BSS and ORG may follow (BSSZ is
  illegal because it presets zeros); data-generating -> **R**. Absolute: a local block named `//`
  in which data may be stored.
- `/name/`: labeled common; name max 7 chars, no blank or comma, first and last chars not colons.
  Absolute assembly: treated as a local block named `/name/`.
- `name`: local block; 1-8 chars, no blank or comma, first not colon. `USE A` and `USE /A/` are
  different blocks.
- `*`: block in use prior to the current USE, USELCM, ORG or ORGC (stack pop).

Redundant names: `/0/` can coexist with block `0`; blank common `//` can coexist with a labeled
common named `////` **[OCR as printed]**. A CPU subprogram may have two blocks with the same name
and memory type if block types differ (local vs common), and two with the same name and type if
memory types differ (CM/SCM vs ECS/LCM): up to 4 blocks with one name.

Counter rules:
- New block: origin = location = 0, position = word size (60 CPU, 12 PP; 16 CIPPU
  **[INFER]**).
- On switching away: save the current block's origin and position counters plus the
  force-upper-pending indicator (if the last instruction assembled in the block forces the next
  one upper, e.g. RJ, the first instruction assembled when the block is resumed is forced
  upper). The location counter is NOT saved.
- On resuming an existing block: restore origin and position; set location = origin. If a LOC
  was in effect, the programmer must re-issue it.
- Partially filled words are kept: since position is saved, a later VFD with blank location in
  that block continues packing in the same word (see 2nd example).

USE stack: USE, USELCM, ORG, ORGC (but not USE * / USELCM *) record an entry (the block that was
in use before them) in a 50-entry USE table. Each USE * or USELCM * resumes the most recent entry
and removes it. Empty -> nominal block.

Examples:

    GAMMA   ...
            USE   ALPHA        BLOCK ALPHA IN USE
            RJ    DATA1
            USE   DATA1        BLOCK DATA1 IN USE
            DATA  ...
            USE   *            RESUME USE OF BLOCK ALPHA
            SA3   ...          forced upper because RJ forces upper of the next instr in ALPHA

            USE   TABLE        USE TABLE LOCAL BLOCK
            VFD   6/0
            USE   *            RESUME PREVIOUS BLOCK
            ...
            USE   TABLE        RESUME USING TABLE
            VFD   6/1RX,18/S   continues in same word of TABLE
            USE   *
    (separate blocks allow packing partial-word bytes into a table in another block)

### 5.2 USELCM - establish and use ECS/LCM block (4.5.2)

    USELCM  block

Location ignored. CPU only (illegal in PP -> **O**). Establishes or resumes a block in extended
core storage (ECS) / large core memory (LCM).

`block`:
- `0` or blank: illegal (-> **A** **[INFER]**).
- `//`: ECS/LCM blank common (a subprogram may have two blank commons, one in CM and one in LCM).
- `/name/`: ECS/LCM labeled common (same name rules as USE).
- `name`: ECS/LCM local block (1-8 chars). All ECS/LCM local blocks are concatenated into one
  block, treated by the loader as an ECS/LCM common block with a name unique to the subprogram.
  (SCOPE 2 does not allow LCM local blocks.)
- `*`: previous block (same stack as USE).

Restrictions: for ALL ECS/LCM blocks in an absolute CPU assembly, and for the ECS/LCM blank
common in a relocatable assembly, data-generating instructions (including BSSZ) and machine
instructions are illegal; only BSS, ORG and ORGC are allowed (-> **R** **[INFER]**). There is no
ECS/LCM absolute, zero or literals block.

Lengths: each ECS/LCM block (including the combined local block) is rounded up to a multiple of
8 words; max 1,048,568 words. Other rules as USE.

Example:

    LCMC    USELCM LCM          ESTABLISH AND USE LCM BLOCK
    BLOC1   BSS    0            DEFINE SYMBOL LCMC / BLOC1
    BLOC2   BSS    100          RESERVE 100 WORDS
    BLOC3   BSS    200          RESERVE 200 WORDS
            USE    *            RESUME PREVIOUS BLOCK
            ...
            ORG    BLOC1+1000B  (back into the LCM block)
            BSS    20           RESERVE 20 MORE WORDS
            USE    *            RESUME PREVIOUS BLOCK          **[OCR]**

### 5.3 ORG and ORGC - set origin counter (4.5.3)

    ORG   exp
    ORGC  exp

Location ignored. Both: select (indirectly) the block for subsequent code, set origin AND
location counters to exp, record an entry in the USE table (block before), save the current
block's origin and position counters. Assembly resumes at the upper position (bit 59) of the
specified location: force upper of the current word first.

Block determination from exp:
1. exp contains a symbolic address (relocatable symbol): the block in which that symbol was
   defined.
2. exp is exactly `*`, `*L` or `*O`: the current block.
   - If origin = location and no code has been assembled in the current location, the only
     effect is to force the next instruction upper.
   - If a word is partially assembled, the code already assembled into that location is LOST
     (origin is set back to the address of the partial word, which is restarted empty)
     **[INFER: literal reading]**.
   - If the counters differ: `*` or `*L` sets the origin counter equal to the location counter;
     `*O` sets the location counter to the origin counter.
3. exp absolute: the absolute block. In a relocatable assembly this is the ONLY way to create
   the absolute block (`ABSOLUTE*`). All symbols defined in the absolute block are absolute.

Rules: every symbol in exp must be already defined; exp must not give a negative relocatable
value (-> **A**, "negative relocation specified on ORG or ORGC"); undefined -> **U**. Cannot
ORG/ORGC into the literals block (-> **A** **[INFER]**). External in exp -> **A**.

ORGC (not supported by SCOPE 2 loader):
- PP or absolute assembly: identical to ORG.
- Relocatable CPU: identical to ORG if the block given by exp is not a common block. If it is a
  common block, the code following the ORGC (text presetting the common block) is ignored by the
  linking loader if that common block was first declared by a previously loaded subprogram.
  Must be used when several programs preset relocatable text in the same common block (else
  multiple relocation of those words).
- The conditional-loading indication, once set for a common block, stays in effect whenever
  that block is resumed by USE/USELCM and is cleared only by an ORG specifying that block.
- **[INFER]** implementation: text tables emitted for that block carry a "conditional" flag.

Examples:

            USE   ALPHA
    ABC     DATA  20,100,1000      LOCATED IN ALPHA
            USE   BETA
    XYZ     BSS   0                LOCATED IN BETA
            ORG   ABC              SETS ALPHA COUNTERS TO ABC AND RESUMES USE OF ALPHA
            BSS   1000
            ORG   50               SETS ABSOLUTE BLOCK COUNTER 50 AND BEGINS ITS USE
            ORG   XYZ+100          SETS BETA COUNTERS TO XYZ+100
            USE   *                RESUMES ABSOLUTE BLOCK
            USE   *                RESUMES BLOCK ALPHA
            USE   *                RESUMES BLOCK BETA ... then ALPHA, then NOMINAL BLOCK

            USE   /DATA/
            BSS   0
            ORGC  DATA ...         CONDITIONALLY PRESET /DATA/
            DATA  1,2,3
    FOUR    USE   ANYNAME          UNCONDITIONAL DATA
            ...
            ORG   FOUR             return to /DATA/ unconditionally  **[OCR: heavy damage]**

### 5.4 BSS - block storage reservation (4.5.4)

    sym  BSS  aexp

Reserves storage in the block in use by adjusting origin and location counters; generates no
data. Main use: reserving blank common; also areas for replicated code (REP...). Forces upper
first. Does not change block (unlike ORG). Legal in all assembly types and in blank common and
ECS/LCM blocks.

- `sym` (optional): defined as the location counter value after the force upper = start of the
  area.
- `aexp`: absolute expression; all symbols previously defined (-> **U** otherwise); no externals
  (-> **A**). Value may be negative, zero or positive: added to both origin and location
  counters. Negative value -> informative **7** (and still applied - **[INFER]**: the text says
  the value "can be negative", so apply it).
- `BSS 0` or an erroneous expression: force upper and symbol definition, no storage reserved.
- Listing: address field shows the word count in octal (blank if zero).

Example:

            USE   //
    COMMON  BSS   1000B        RESERVE 512 WORDS OF BLANK COMMON
            USE   *
            ...
            SA6   COMMON+500B
    TAG     BSS   0            DEFINE SYMBOL TAG

### 5.5 LOC - set location counter (4.5.5)

    LOC  exp

Location ignored. Sets the location counter of the block in use to exp (code is loaded at the
origin-counter address but addresses/symbols are defined as if at the location counter, for code
moved before execution; or for table ordinals on the listing).

- `exp`: relocatable (or absolute) expression; symbols already defined; no negative relocation
  (-> **A** **[INFER]**).
- Forces upper (CPU); does not otherwise affect the origin counter.
- `LOC *` and `LOC *L`: only force upper. `LOC *O`: location := origin.
- While location != origin, the listing prints `L` before the address field, until LOC *O, USE,
  ORG, ORGC or USELCM resets location to origin.
- Because the location counter is not saved per block, USE/ORG/ORGC/USELCM to a different block
  effectively resets location = origin; on resuming, the user must re-issue LOC.

Example (PP code loaded in one PPU, executed in another; table ordinals):

    T1      EQU   1
    C0      EQU   0
            ORG   7100B
    RES     BSS   0
            LOC   100
    PPR     PSN   0            assembled at 7100.., listed as L 100
            ...
    PPRA    BSS   0            L 205
            LOC   0
            CON   PPR          L 0  0100   (table ordinal addresses)
            CON   STM          L 1
            ...
            LOC   *-RES+PPR    resume counting under first LOC **[OCR]**
            ...
            LOC   *O           back to origin counter (7240)

### 5.6 POS - set position counter (4.5.6)

    POS  aexp

Location ignored. Sets the position counter of the block in use.

- `aexp`: absolute evaluatable expression, 0 <= value <= word size (60 CPU, 12 or 16 PP).
  Negative or greater -> **A**.
- The value = the bit position at which the next code is assembled (number of bits remaining in
  the word).
- New value > old: part of the word is reassembled: new code is ORed with previously
  assembled data.
- New value < old: zero bits are generated down to the given position.
- Value 0: next code goes in the following word (word complete; normal advance rule).
- Origin and location counters are not altered.
- `POS *P`: no effect. `POS $`: subtracts one from the counter.
- Warning: POS over a word containing relocatable or external addresses may give undefined
  results without diagnostics (implement: no special handling; relocation info for that word
  may become wrong).
- **[INFER]** POS cancels nothing about forcing upper; a following machine instruction that does
  not fit causes normal force upper.

---------------------------------------------------------------------------------------------

## 6. Symbol definition (4.6)

EQU, =, SET, MAX, MIN, MICCNT assign values directly to symbols. Values are 21-bit quantities
(expression value justified in a 21-bit field, sign-extended; see ch. 2.8.2) and may be
absolute, relocatable or external. Register designators are not valid in these expressions
(-> **A**). A later use of the symbol acts as the constant value with its attributes. In the
symbolic reference table, a reference from an EQU/=/SET/MAX/MIN/MICCNT is flagged `D`. EQU and =
symbols cannot be redefined; SET/MAX/MIN/MICCNT symbols can (by any of these four). Listing:
address field shows the octal value of the symbol right-justified, leading zeros suppressed.

None of these forces upper or generates code. They are not allowed in the first statement group
except MICCNT (which is in the anywhere list).

### 6.1 EQU or = (4.6.1)

    sym  EQU  exp
    sym  =    exp

- `sym` required (-> **L** if missing/invalid); rules of ch. 2.4.
- `exp`: evaluatable; symbols previously defined or declared external (EXT). Cannot contain
  =S/=X/=Y-prefixed symbols unless they are also defined conventionally.
- Defines sym permanently with value and attributes (absolute / relocatable in a block /
  external) of exp.
- Erroneous exp: symbol NOT defined, error flagged (**[INFER]** letter per cause: U undefined,
  A bad expression).
- sym already defined (by anything) or declared external -> **D**, first definition holds.

Examples:

    OPS      =    20437B
    LINE     =    74B
    PAGESIZ  EQU  3
    LGOPS    =    LINE
    ...      EQU  *-OPS

### 6.2 SET (4.6.2)

    sym  SET  exp

- sym required. Defines or redefines sym to exp's value/attributes. Can redefine only symbols
  defined by SET, MAX, MIN, MICCNT (else **D**).
- exp: no as-yet-undefined symbols; no =S/=X/=Y unless also conventionally defined.
- Erroneous exp: symbol not defined/redefined, warning flag (informative **2**).
- The symbol cannot be referenced before its first definition (forward reference to a SET
  symbol is illegal; flag letter not given - **[INFER]**: the earlier reference gets **U**).
- Pass handling **[INFER]**: SET values are sequential; in pass two the value seen by a
  statement is the value from the most recent SET preceding it.

Example:

    A   EQU  15      A HAS VALUE OF 15            (listing 17)
    B   SET  *P      B HAS VALUE OF POSITION COUNTER (74 = 60)
    C   SET  A+3     C HAS VALUE A+3 OR 18        (22)
    B   =    B+2     ILLEGAL, B IS DOUBLY DEFINED (D)
    C   SET  C+2     LEGAL, C CHANGES FROM 18 TO 20 (24)
    D   SET  F+A     ILLEGAL, F AS YET UNDEFINED
        BSS  AA
    AA  SET  16      ILLEGAL, REFERENCE PRECEDES FIRST DEFINITION

### 6.3 MAX (4.6.3)

    sym  MAX  exp1,exp2,...,expn

- sym required. Defined/redefined to the largest (most positive) of the expressions, with that
  expression's attributes. Redefinable by SET/MAX/MIN/MICCNT and vice versa.
- Each exp: evaluatable, symbols previously defined, no =S/=X/=Y unless conventional.
- Expressions should have similar attributes; NOT checked.
- The selection is made in pass one using pass-one values (relocatable symbols relative to their
  block origins). In pass two, the expression selected in pass one is re-evaluated with final
  values (relative to program origin) and that is the final value.
- Any erroneous expression: symbol not defined, warning (**2**).
- Cannot be referenced before first definition.

Example: `PT3 EQU 5`, `PT31 EQU 0`, `PT32 EQU 2`, `SYM MAX PT3,PT31,PT32` -> SYM = 5.

### 6.4 MIN (4.6.4)

    sym  MIN  exp1,...,expn

Same as MAX with the minimum (least positive) value.

### 6.5 MICCNT - set symbol to micro size (4.6.5)

    sym  MICCNT  mname

- sym required. Value = number of characters in the current value of micro mname (absolute).
  Redefinable (SET/MAX/MIN/MICCNT).
- mname: previously defined micro (system micro, or defined by MICRO, OCTMIC, DECMIC, BASE
  (mname form), and **[INFER]** CODE/QUAL mname forms). Not defined -> sym not defined/redefined,
  warning flag.
- Allowed anywhere.

Example:

    MSG    MICRO  1,,*STRING*            DEFINE 6-CHARACTER MICRO
    MSIZE  MICCNT MSG                    MSIZE EQUALS 6
    MSG    MICRO  1,,*ALPHANUMERIC STRING*  (19-char micro)  **[OCR]**
    MSIZE  MICCNT MSG                    MSIZE EQUALS 19 (listing 23)

### 6.6 SST - system symbol table (4.6.6)

    SST  sym1,sym2,...

Location ignored. Allowed anywhere. Defines the system symbols of the system text overlay (loaded
via the G or S control-statement option) as if they had been defined in the subprogram, except
the symbols listed in the variable field (symbols "on the file that are not to be defined").
Micros and opcodes of the system text are always defined at the start of each assembly; symbols
only with SST. In the reference table, the block column of an SST symbol shows the system text
file or overlay name. (Example in manual ch. 10.2.) **[INFER]** duplicate definitions between
SST symbols and program symbols -> D on the program definition processed second; suggest SST
definitions are entered when SST is processed.

---------------------------------------------------------------------------------------------

## 7. Subprogram linkage (4.7)

These do not define symbols; they declare entry points or externals.

### 7.1 ENTRY and ENTRYC (4.7.1)

    ENTRY   sym1,sym2,...,symn
    ENTRYC  sym1,sym2,...,symn

Location ignored. Illegal in PP assemblies (-> **O**). Legal in relocatable and absolute CPU.

- Each sym: linkage symbol 1-7 chars, first A-Z, last not colon, no `+ - * / blank , ^`.
  Must be defined in the subprogram as nonexternal (not =X/=Y default, not on EXT) and must be
  unqualified. Negative relocation -> **N**. Undefined at end -> **U** **[INFER]**.
- ENTRY declares unconditional entry points (referable from independently assembled
  subprograms).
- ENTRYC (not supported by SCOPE 2 loader): conditional entry points. Absolute CPU: synonymous
  with ENTRY. Relocatable: the linking loader ignores the entry point if its value is relative to
  a common block first declared by a previously loaded subprogram.
- Absolute CPU: ENTRY causes a 5100B multiple-entry-point overlay table (control word + list of
  entry points) placed below the overlay origin (one word more than the number of entries);
  load address origin-wc-1.
- Listing: a list of all entry points precedes the assembly listing; `*` to the right of each
  conditional entry point.
- Entry declarations may precede the definitions (checked at end) **[INFER, as in the example]**.

Example:

            IDENT  CT,CONTROL,CONTROL
            ABS
            ENTRY  ONSW
            ENTRY  OFFSW
            ENTRY  SETPP
            ENTRY  SETTL
            ...
            ORG    110B
    CONTROL SA2    X2 ...

### 7.2 EXT - declare external symbols (4.7.2)

    EXT  sym1,sym2,...,symn

Location ignored. Illegal in absolute (and PP) subprograms (-> **O**). Relocatable: declares
**strong externals** (ch. 2.4.1): symbols defined as entry points in other subprograms and
referenced here.

- Each sym: linkage symbol rules as ENTRY. Must not be defined within the subprogram (-> **D**).
  Externals are unqualified. Max 511 external symbols (-> **F**).
- Listing: a word containing an external reference is flagged `X` in the code field; all
  externals are listed in the header information of the listing.

---------------------------------------------------------------------------------------------

## 8. Data generation (4.8)

Only these pseudo instructions generate data (all other data comes from machine instructions).
No data-generating instruction may be used in a (relocatable) blank common block (-> **R**).

| Op | Generates |
|---|---|
| BSSZ / blank op with sym | zeroed words / one zeroed word |
| DATA | one or more words from data items |
| DIS | words of character data |
| LIT | literals block entries |
| VFD | expression values in user-defined fields |
| CON | expression values in full words |
| R= | CPU increment instruction, chosen per B1=1/B7=1 (for macros) |
| REP, REPC, REPI | loader replication tables (no code at assembly time) |

### 8.1 BSSZ and blank operation field (4.8.1)

    sym  BSSZ  aexp
    sym                 (symbol in location field, blank operation field) == sym BSSZ 1

- Reserves zeroed storage in the block in use: origin and location advanced by aexp; zero data
  words are generated to be loaded there. Forces upper first.
- `sym` optional: location counter after force upper.
- `aexp`: absolute evaluatable; no externals; must not be relocatable or negative (-> **A**).
- `BSSZ 0` or erroneous expression: force upper + symbol definition, no storage.
- Relocatable: a BSSZ or a group of BSSZ instructions totalling 6 or more words produces a REPL
  table instead of explicit zero text, to shrink the object (appendix B). **[INFER]** "group" =
  consecutive BSSZ in the same block forming one contiguous zero area; shorter areas are emitted
  as zero words in text tables. Absolute: memory image zeros.
- Illegal in blank common (relocatable) and in ECS/LCM absolute blocks / ECS blank common.
- Listing: blank-op form shows one zero word of data; BSSZ shows the word count (octal).

### 8.2 DATA - generate data words (4.8.2)

    sym  DATA  item1,item2,...,itemn

- Generates, in the current block, one or more complete words per item: 60-bit (CPU), 12-bit
  (PERIPH/PPU) or 16-bit (CIPPU) words. Always forces upper.
- `sym` optional: location counter after the force upper = address of the first item.
- items: character, octal numeric or decimal numeric data items per ch. 2.7 (e.g. `0LOUTPUT`,
  `H*ABC*`, `10HABCDEFGHIJ`, `-7`, `1.3E1`, `17070B`). Separated by commas, terminated by a
  blank. Floating-point notation illegal in PP assemblies. A literal (`=...`) cannot be an item.
- A blank/empty item (e.g. `,,` or `0L`) generates no word.
- Each numeric item is one word (double-precision floating point = 2 words in CPU). Negative
  numbers are one's complement. In PP assemblies a numeric item yields one 12/16-bit word
  (e.g. `-7` -> 7770B, `-4` -> 7773B) **[INFER from example]**. Character items occupy as many
  words as required (CPU 10 six-bit chars/word; PP 2 chars/word), with C/Z guaranteed trailing
  zero bits possibly adding a word.
- Listing: only item1's first word appears unless the D list option is selected.

Examples (CPU, display code):

    OPTS   DATA  0LLGO             -> 14071700000000000000
    OPT    DATA  0                 -> 00000000000000000000
    OPTT   DATA  0LSCR?            ...
    OPTY   DATA  0LOUTPUT,0        -> 17252420252400000000, 0
           DATA  1.3E1             -> floating point 13.0 (1720 5000...) **[OCR]**

Example (PERIPH, BASE M): `DATA 7070,-7,0,1R1` -> 7070 7770 0000 0034; `DATA 2C A` -> 5501 0000;
`DATA 123,-4` -> 0123 7773; `DATA H*DATA*` -> 0401 2401. **[OCR reconstruction]**

### 8.3 DIS - words of character data (4.8.3)

Two formats. Forces upper. `sym` optional = location counter after force upper = first word.
Characters are converted by the current CODE. Listing shows only the first word unless list
option D.

**Format one:**

    sym  DIS  n,string

- `n`: absolute evaluatable expression = number of words; base M -> decimal. Undefined symbol ->
  **U**. Missing comma after n -> **A**.
- CPU: take 10*n characters from the string (as they occur in the statement, starting right
  after the comma, blanks and commas included) and pack 10 per word into n words. PP: take 2*n
  characters, 2 per word. If the statement (column 72) ends before 10n (2n) characters, the rest
  of the requested words is filled with blanks.
- n = 0: the statement is treated as format two.

**Format two:**

    sym  DIS  ,dstringd

- Comma required; d = delimiter (any char); string = chars other than d. Characters between the
  delimiters are packed into as many CPU/PP words as needed; **12 zero bits are guaranteed** at
  the end of the string, generating an additional word if needed (i.e. if fewer than 12 bits
  remain in the last word, the rest of it is zero-filled and a full extra zero word is added;
  otherwise the remainder of the last word is zero filled). End of statement before the second
  delimiter -> fatal error (**A** **[INFER]**).
- **[INFER]** for PP 12-bit: 2 chars per word; 12 zero bits = one full zero word whenever the
  string length is even (no free bits) - consistent with the PP example (extra 0000 word).

Examples:

    ONE   DIS  2,GENERATE 2 CPU WORDS
          -> 07051605220124055535  55032025552717220423
    TWO   DIS  ,*GENERATE 2 CPU WORDS*
          -> same two words + 00000000000000000000 (12 zero bits forced a third word)
    (PERIPH, BASE M)
          DIS  10,GENERATE 10 PP WORDS   -> 10 words 0705 1605 2201 2405 5534 3355 2020 5527 1722 0423
          DIS  ,*GENERATE 10 PP WORDS*   -> same 10 words + 0000

### 8.4 LIT - declare literal values (4.8.4)

    sym  LIT  item1,item2,...,itemn

- Generates data words in the literals block (with the `=` literal prefix in expressions, the
  only way to put data in the literals block). Ensures sequential entries (a table).
- `sym` optional: value of the literals block location counter = address of the first word of
  this sequence (or of the matching existing sequence). Relocatable (literals block).
- items: character/octal/decimal data items (ch. 2.7.3), comma separated, blank terminated; at
  least 1 and at most 100 words (> 100 -> **F**; no data -> **A**). Floating point illegal in PP.
- Items entered in the order given.
- Duplicate elimination: if the converted binary values of ALL items of one LIT match an
  existing sequence in the literals block, nothing is generated (sym = address of the existing
  sequence). If any item does not match, the entire sequence is generated. Ch. 2.7.3 adds: if
  the LIT duplicates in part the most recent (last) entries of the block, only the unduplicated
  part is appended (the matching tail is reused) - implement both: full-match anywhere, else
  maximal overlap of the sequence's prefix with the block's current tail, else append all.
- A literal item later referenced through the `=` prefix is not duplicated (the `=` literal
  reuses any matching word(s), including LIT-generated ones).
- A null item (`H**`, `0L`) generates no word; but the LIT must contain at least one non-empty
  item.
- Does not force upper / does not affect the current block's counters **[INFER]**.
- Listing: address field = address of the first word generated. Literals block listed with the
  D option (address, octal, display conversion).

Examples:

    POOL  LIT  3.1,1.59265,2.7182818,57.2957795E1   (CPU float literals)  **[OCR]**
    N2    LIT  1R1,7070,7,0        (PP)  -> 0034 7070 0007 0000
          LIT  2C A,2LEF           (PP)  -> 5501 0000 0506
          LIT  H*LITERALS*         (PP)  -> 1411 2405 2201 1423

### 8.5 VFD - variable field definition (4.8.5)

    sym  VFD  n1/exp1,n2/exp2,...,nm/expm

Places expression values into fields of the given sizes, packed left to right in the current
block starting at the position counter.

Location field, CPU assembly:
- `sym`: force upper; sym = location counter after it; identifies the first word of data.
- `+`: force upper; data begins in a new word.
- `-`: zero bits are generated up to the next quarter-word (15-bit parcel) boundary; the first
  field begins there (no force upper; no NOPs).
- blank: the first field begins at the current position counter value.

Location field, PP assembly: `+`, `-` or a symbol -> data begins in a new word; blank -> first
field begins at the current position counter.

Fields:
- `ni`: unsigned constant or previously defined symbol giving a positive integer number of bits;
  max 60 for CPU and PP (60 = max significant bits of an expression). Base M -> decimal (base O ->
  octal, see BASE example). Bad size -> **V**. **[GAP]** behavior for n = 0: V's message reads
  "MUST BE 0 < COUNT ..." (OCR lost the signs) - treat 0 as error.
- `expi`: absolute, relocatable or external expression evaluated with field size ni; character
  constants are right/left justified in the field per their type (ch. 2.7.4). Value too large ->
  informative **7**, truncated.
- Fields may cross word boundaries (e.g. PP 60/... spans 5 words; CPU fields may span words).
- Relocatable CPU: no field containing a relocatable or external address may cross a 60-bit
  word boundary, and no word may have more than four such fields (-> **A** **[INFER]**).

End-of-VFD behavior (CPU): each field is generated as it occurs. If the next code-generating
instruction in the block is NOT a VFD with a blank location field, and the last VFD field ended
left of a quarter-word (15-bit) boundary, zero bits are inserted up to the next quarter-word
boundary (not shown on the listing); remaining parcels are then filled with no-operation
instructions (when a force upper occurs) **[INFER: i.e. the zero padding is to parcel boundary;
NOP fill happens only if a later force upper occurs; otherwise the next 15/30-bit instruction
may pack into the remaining parcels]**. A VFD with a blank location immediately following another
VFD in the same block continues without padding or force upper.

After a VFD, the position counter = number of bits remaining in the last word written.

PP: no padding/force rules (no forcing upper); a VFD that ends mid-word leaves the position
counter there; the next instruction starts a new word when it begins (ch. 3: position reset
at new operation if bit 0 was stored) **[INFER]**: a PP machine instruction after a partial VFD
word starts in the next word.

Examples:

    ALPHA  SET  22
    TABLE  VFD  36/0LTAB,6/19,18/TABLOC   (TABLOC = 551)  -> 240102000000 23 000551  **[OCR]**
           VFD  30/-1,...                 -> 7777777776 ...
    (PPU, BASE M)
    N4     VFD  60/10R0123456789          -> 3334 3536 3740 4142 4344 (5 PP words)
    A11    VFD  12/10,12/11,12/-12,...    -> 0010 0011 7765 ...       **[OCR]**

### 8.6 CON - generate constants (4.8.6)

    sym  CON  exp1,exp2,...,expn

- One full word per expression in the block in use (60 bits CPU, 12 PERIPH/PPU, 16 CIPPU).
  Always forces upper. `sym` optional = location counter after force upper.
- Each exp: absolute, relocatable or external expression, field size = one word.
  PP: floating point not allowed. CPU: double precision not allowed. Register designator ->
  **A**. Value too large -> **7**.
- Relocatable/external address: CON generates a 60-bit address constant (relocation applied to
  the full word / low 18 bits per loader rules), not appropriate for capsules or overlay
  capsules.
- Differs from DATA (expressions, not data items) and from VFD (fixed field size).

Examples: (PPU) with FAIL=2204, PASS=2172: `CON 12` -> 0012, `CON FAIL` -> 2204, `CON PASS` ->
2172. (CPU) `CON 55B` -> 00000000000000000055; under LOC the listing shows L addresses.
**[OCR: examples heavily damaged]**

### 8.7 R= - conditional increment instruction (4.8.7)

    sym  R=  reg,exp

CPU only (illegal in PP -> **O**). Generates a CPU increment-unit instruction (S-type) depending
on the subfields and on a prior B1=1 or B7=1. The A list option controls listing of the
substituted instructions.

- `sym` optional: location counter after force upper. **This force upper occurs whether or not
  R= generates an instruction.** (**[INFER]** without sym, no force upper beyond normal fit rules.)
- `reg`: register letter A, X or B plus digit 0-7; concatenated after `S` to form the operation
  code: `SAi`, `SXi`, `SBi`.
- `exp`: operand register or value expression:
  - exp is the same two characters as reg (e.g. `R= B5,B5`): no instruction (SB5 B5 would be a
    no-op).
  - value 0: variable field `B0` (e.g. `SX1 B0`).
  - after B1=1 and value 1, 2, -1: variable field `B1`, `B1+B1`, `-B1`.
  - after B7=1 and value 1, 2, -1: `B7`, `B7+B7`, `-B7`.
  - otherwise: the variable field is exp itself (register expression or value).
- Result is assembled as if the generated source line `SXi <field>` were written (15-bit form
  for register forms, 30-bit for K forms).

Examples (manual examples' code columns are blank in OCR; illustrative):

            B1=1
            R=    X1,1       -> SX1 B1
            R=    X2,2       -> SX2 B1+B1
            R=    A3,-1      -> SA3 -B1
            R=    X4,0       -> SX4 B0
            R=    X6,5       -> SX6 5
    REG     R=    B5,B5      -> no instruction (force upper only, because of REG)

### 8.8 REP, REPC, REPI - loader replication tables (4.8.8)

    REP   S/saddr,D/daddr,C/rep,B/bsz,I/inc
    REPC  S/saddr,D/daddr,C/rep,B/bsz,I/inc
    REPI  S/saddr,D/daddr,C/rep,B/bsz,I/inc

Location ignored. Relocatable assemblies only (ABS, PP -> **O**). Subfields in any order. No code
is generated; an REPL loader table is generated so the loader copies a data sequence.

- REPI: loader makes the copies immediately when it meets the table.
- REP: replication at end of loading.
- REPC (not supported by SCOPE 2): ignored by the loader if the destination address is in a
  common block first declared by a previously loaded subprogram; otherwise copies immediately.

Subfields:
- `S/saddr` (required): relocatable expression = first word address of the code to copy. Zero
  or omitted -> instruction flagged erroneous (**A** **[INFER]**, or **8**), no REPL table.
- `D/daddr`: relocatable expression = destination of first word of first copy. Omitted -> 0; the
  loader then uses saddr+bsz.
- `C/rep`: absolute, number of copies; base M -> decimal. Omitted -> 0; 0 or 1 -> one copy.
- `B/bsz`: absolute, number of words per copy (block size); base M -> decimal. Omitted -> 0;
  0 or 1 -> one word.
- `I/inc`: absolute, increment in words between first words of successive copies; base M ->
  decimal. 0/omitted -> loader uses bsz. Copies at daddr, daddr+inc, daddr+2*inc, ... for rep
  copies.

Rules:
1. S cannot be omitted.
2. Room for the copies must be reserved in the destination block (ORG, ORGC, BSS); origin and
   location counters of the destination block are NOT advanced by inc*rep.
3. Relocatable assemblies only.
4. Replicated data must not contain external references or common-block relocatable addresses.
5. REPC and REPI: data must be in previously loaded (assembled) text.

Example (illustrative of the damaged manual example):

            USE   BUFF
    TAB     DATA  15,20,7070B,1,2,3.14
    COPY    BSS   6*10
            USE   *
            REPI  S/TAB,D/COPY,C/10,B/6
    -> loader writes 10 copies of the 6 words at TAB into COPY, COPY+6, ...

The REPL table binary format is in the Loader manual / appendix B (not in this part) **[GAP]**.

---------------------------------------------------------------------------------------------

## 9. Legality matrix (derived)

`x` legal, `-` illegal (O error), `1` first statement group only, `*` anywhere.

| Pseudo | CPU reloc | CPU abs | PPU (7600) | PERIPH | CIPPU | Notes |
|---|---|---|---|---|---|---|
| IDENT (first) | x | x | x | x | x | must be first |
| IDENT (2nd+, nonblank) | - | x | x | x | x | overlay |
| IDENT (blank) | - | x | ? | ? | ? | CPU only per text |
| END | x | x | x | x | x | * |
| ABS | 1 | 1 | ignored | ignored | ignored | PP wins |
| MACHINE, STEXT | 1 | 1 | 1 | 1 | 1 | |
| PPU, PERIPH, CIPPU | 1 | 1 | 1 | 1 | 1 | declare PP |
| MEMSEL | - | - | - | - | 1 | **[INFER]** |
| SEGMENT | x (flush) | x | - | x | x | |
| SEG | - | x | - | - | - | |
| COMMENT | x* | x* | x* | x* | x* | |
| NOLABEL | - | x* | x* | x* | x* | |
| LCC | x | - | - | - | - | |
| LDSET | x* | - | - | - | - | |
| BASE, CHAR, CODE, QUAL | * | * | * | * | * | |
| B1=1, B7=1 | * | * | - | - | - | |
| COL | x | x | x | x | x | ends first group |
| USE, ORG, ORGC, BSS, LOC, POS | x | x | x | x | x | |
| USELCM | x | x | - | - | - | |
| EQU, =, SET, MAX, MIN | x | x | x | x | x | |
| MICCNT, SST | * | * | * | * | * | |
| ENTRY, ENTRYC | x | x | - | - | - | abs -> 5100B |
| EXT | x | - | - | - | - | |
| BSSZ, DATA, DIS, LIT, VFD, CON | x | x | x | x | x | no blank common (reloc) |
| R= | x | x | - | - | - | |
| REP, REPC, REPI | x | - | - | - | - | |

---------------------------------------------------------------------------------------------

## 10. Ambiguities and decisions to make (consolidated)

1. CIPPU vs PPU/PERIPH precedence; CIPPU word size for data (assume 16); CIPPU PP header size
   (origin-5 assumed).
2. STEXT excluded symbol class "8 characters beginning with ..." (character unreadable).
3. STEXT/system-text binary format: not specified; define our own.
4. VFD zero bit count: treat as V error.
5. VFD padding after last field: zero to 15-bit parcel boundary, then NOP fill on force upper.
6. ORG * with a partially assembled word: partial word content discarded (literal reading).
7. BASE/CODE/QUAL stack: does a blank-mode statement push? (assume no). Overflow drops oldest.
8. LIT dedup: full-sequence match anywhere vs tail overlap (ch. 2) - implement both.
9. Error letters not given for: second IDENT in relocatable, SET forward reference, REP without
   S, DIS missing delimiter, USELCM 0, ORG into literals block. Proposals given inline.
10. Redundant block name "////" printed as such; meaning unclear.
11. LDSET PRESET keyword-to-value pairing garbled; LDSET/7000B and REPL table formats come from
    the Loader manual.
12. MACHINE PP target/valid when MACHINE explicitly given in a PP assembly.
13. "PERIPH" J option list omits NJN (assume included).
14. Many listing examples (VFD, CON, REP, R=) are illegible; examples above are reconstructions.
