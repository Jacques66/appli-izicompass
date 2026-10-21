# 01 — COMPASS 3 Language Structure

Source: *COMPASS Version 3 Reference Manual*, CDC 60492600 rev. M (1986) —
chapter 1 (Introduction), chapter 2 (Language Structure), chapter 3
(Program Structure), appendix A (Character Sets), appendix D (Hints), final
reference card. A few specific references to chapters 4, 5, 7 and 11
where they clarify a language rule (BASE, CODE, CHAR, COL, USE, DATA,
VFD, LOCAL, micros, error directory).

Conventions in this document:

- Numbers with a `B` suffix are octal (`57B` = 47 decimal), as in
  COMPASS. Columns are numbered from 1.
- **[INFER]** marks a rule that is deduced (manual examples, damaged
  OCR, knowledge of CDC hardware) and not stated explicitly.
- **[AMBIG]** marks a point that the manual does not settle; an
  implementation recommendation is given.
- "CDC character" = glyph of the CDC 64-character set; "ASCII
  equivalent" = glyph of the 64-character ASCII subset (see §11). In an
  ASCII source (the case of this JS implementation), the ASCII
  equivalent is written.

Special characters of the language (summary, detailed later):

| Role | Display code | CDC glyph | ASCII equivalent |
|---|---|---|---|
| Concatenation mark | 65B | → | `_` |
| Micro mark | 64B | ≠ | `"` |
| Exclusive OR (operator) | 67B | ∧ | `&` |
| Hexadecimal pre-radix | 60B | ≡ | `#` |
| Comment (column 1) | 47B | `*` | `*` |
| Continuation (column 1) | 56B | `,` | `,` |
| Substitutable parameter flag (macros, ch. 5) | 77B | `;` | `;` |

(The manual OCR renders → as "r-"/"r+", ≠ as "rl"/";t!", ∧ as
"/\". The identification → = 65B is confirmed by the reference card,
where 65B has the ASCII equivalent "_ (underline)", and by the listing,
which shows CODE changes in the form `c1→c2`.)

---

## 1. Overview (chapter 1)

- A COMPASS program = one or more **subprograms**. Each subprogram
  begins with `IDENT` and ends with `END`. A source file may contain
  several subprograms in sequence; they are assembled one after the
  other.
- Two kinds of source statements: symbolic machine instructions
  (one machine instruction each, CPU ch. 8 or PP ch. 9) and
  pseudo instructions (assembly control: allocation, symbol definition,
  linkage, listing, macros...).
- CPU output: **absolute or relocatable** binary. PP output: **always
  absolute**.
- **Two-pass** assembly per subprogram:
  - pass 1: reading of each statement, expansion and editing of called
    sequences (macros, DUP, ECHO, RMT...), interpretation of the operation
    code, assignment of locations (counters);
  - pass 2: assignment of block origins, placement of literals,
    computation of all symbol values, production of the listing and the
    binary, symbolic reference table; then reinitialization for the next
    subprogram.
  - Pass 2 of a **block group** is triggered by each `IDENT`
    (other than the first) or `END` (see §10.1).
- All nested processing (macros, definitions...) uses a single stack;
  **maximum nesting depth: 400**.
- Up to **255** areas (blocks) designatable by the programmer and the
  system (see §10.1).
- Load/execution normally does not take place if the assembler has
  detected fatal errors (letter errors suppress the binary,
  §12).

---

## 2. Statement format (§2.1)

### 2.1 Physical line

- One card = one line. **Only columns 1 to 72 are interpreted.**
  Columns 73–80 are used for comments/sequencing, columns 81–90 for
  sequencing by library maintenance programs; columns 73–90 appear in
  the listing ("Sequence" field) but are not interpreted. (Appendix B:
  a source record may be up to 160 characters long, but only the first
  90 are reproduced in the listing.)
- Implementation: a line shorter than 72 columns is **padded with blanks
  up to column 72** (important for continuation, §2.4). Beyond 90:
  ignored.
- A line containing two or more consecutive colons may be read/printed
  as two lines (operating system convention: 12 zero bits at the end of
  a word = end of line, and `:` = code 00 in the 64-character set).
  Environment effect, **not to be emulated** in the assembler; at most
  to be reported.
- [INFER] The original source is in 6-bit display code, hence
  **uppercase only**. For an ASCII source: lowercase letters are folded
  to uppercase (appendix A, note 3); any ASCII character absent from the
  table in §11 becomes a blank (55B) (note 4). Tabs do not exist on CDC:
  recommendation, expand them to blanks (columns that are multiples of 8,
  or tab stops 11/18/30) as an input option, clearly documented as an
  extension.

### 2.2 First column

| Column 1 | Meaning |
|---|---|
| `,` (comma) | **Continuation** line of the previous line |
| `*` (asterisk) | **Comment** line |
| other (including blank) | Start of a new statement |

### 2.3 The fields

Every statement (other than comment lines) has four fields: **location**
(label), **operation**, **variable**, **comments**. Each field is
terminated by **one or more blanks**. Exceptions: a blank **inside** a
character data item (e.g. `10HERROR IN P`, `H*A B*`), inside a
parenthesized macro parameter, or inside the comments field does not
terminate the field. The size of the variable field is limited only by
the maximum size of a statement. The format is essentially free.

**Location field** (§2.1.2)

- Begins in column 1 **or 2** of a statement line and is terminated by
  a blank.
- If columns 1 **and** 2 are blank, there is no location.
- Therefore: column 1 nonblank → location begins in column 1;
  column 1 blank and column 2 nonblank → location begins in
  column 2.
- Contents (depending on the operation code): a symbol, a name, `+` or
  `-` (force upper control, §10.4). Generally optional.

**Operation field** (§2.1.3)

- If the location is empty, the operation may begin in column 3
  (first nonblank from column 3 on).
- If the location is present, the operation begins at the first
  nonblank following the location; it is terminated by one or more
  blanks.
- **The operation is blank if there is no nonblank between the end of
  the location and column 30** (comments column, changeable with
  `COL`): what follows is then a comment.
- Legal contents: CPU mnemonic (possibly with variable subfields, each
  preceded by a comma — syntax detailed in ch. 8, e.g. forms
  `SB.SUM`), PP mnemonic, pseudo instruction, macro name, or blank.
- A statement with a **symbol in the location and a blank operation**
  is equivalent to `BSSZ 1` (one zero word reserved, ch. 4 §4.8.1).

**Variable field** (§2.1.4)

- Contains zero, one or more **subfields separated by commas**.
- Begins at the first nonblank after the operation and is terminated by
  one or more blanks (except for the exceptions above).
- **It is blank if there is no nonblank between the end of the
  operation and the comments column (30 by default).**
- A subfield contains: a data item, an expression, a register
  designator, a name, a special element, or an entry specific to the
  instruction.

**Comments field** (§2.1.5)

- Begins at the first nonblank after the variable field; if the
  variable field is absent, **not before column 30** (or the column set
  by `COL`).

**Pseudo `COL n`** (ch. 4 §4.4.6) — summary useful for parsing:

- Sets the column from which a comment may begin when the variable
  field is blank. Default: 30.
- `n`: evaluable absolute expression, decimal if BASE M. `n < 12` → 12;
  `n` zero or blank → 30. Location symbol ignored.
- If the operation field of the current statement **extends to or
  beyond** the comments column, COMPASS uses, **for that statement
  only**, a "very large" comments column: any nonblank after the
  operation is then the variable field (a comment then requires a
  variable field to be present).
- The listing shows the new column in the "octal code" field.

### 2.4 Continuation (§2.1.7)

- Normally, column 72 terminates a statement that is not yet
  terminated.
- A longer statement is continued on the next line by putting
  **`,` in column 1** and continuing in **column 2**.
- **At most 9 continuation lines** (statement = 10 lines at most).
- The break may fall anywhere, **even in the middle of a symbol**.
  Implementation: statement image = columns 1–72 of the first line
  (blank-padded) + columns 2–72 of each continuation (blank-padded),
  concatenated without a separator. Maximum length:
  72 + 9×71 = **711 characters**.
- Continuation lines beyond the 9th, and continuation lines that follow
  a **terminated** statement, are processed as **comment lines**.
  [AMBIG] "terminated statement" is not defined. Recommendation: a
  continuation that follows a comment line (`*` in column 1), or that
  follows the 10th line, is a comment; in all other cases it is
  attached.
- Editing (micros) may lengthen the image: if column 72 of the last
  line is exceeded, the assembler creates up to 9 continuation cards in
  total; the excess is **lost without warning** (see §3.3). Therefore
  the edited length is also capped at 711 characters
  [INFER: the cap is the same].

### 2.5 Comment lines (§2.1.6)

Two forms:

1. `*` in column 1. Listed, with no other effect. **Not counted** in the
   line counts of IF skipping (§4.9) or in definitions (ch. 5), and
   **not saved** in definitions (macros, DUP...). Appendix D: in a
   macro, prefer `*` over the other comments, which are saved.
2. Columns 1 to 29 blank (an entirely blank line is one of these).
   **Counted** in line counts.
   [INFER] The "1–29" limit follows the comments column (30 by default,
   changeable with `COL`): the general rule is "blank location and no
   nonblank before the comments column".

### 2.6 Coding convention (§2.1.8, COMPASS coding form)

| Columns | Contents |
|---|---|
| 1 | blank, `*` or `,` |
| 2–9 | location (or `+`/`-`), left-justified |
| 10 | blank |
| 11–16 | operation, left-justified |
| 17 | blank |
| 18–29 | variable, left-justified |
| 30– | comments |

All manual examples follow this convention; it is **not mandatory**
(free format). The listing (ch. 11) reproduces the source image,
columns 1–72; the disassembler/code generator should produce this
format (location in column 1 for a symbol as in the manual examples,
operation in 11, variable in 18, comment in 30).

### 2.7 Splitting algorithm (implementation reference)

```
read line → img = col 1..72 (blank padding) ; seq = col 73..90
if img[1] == '*' : COMMENT(*) ; done
if img[1] == ',' : orphan continuation → COMMENT (see §2.4)
while next line has ',' in col 1 and n_cont < 9 :
    img += col 2..72 of that line (padding)
edit img (§3) unless the line is saved in a definition
cc = current comments column (COL, default 30)
i = 1
if img[1] != ' ' or img[2] != ' ' :
    loc = first nonblank word from col 1 (or 2) ; i = end of loc
else loc = empty ; i = 3
skip blanks → j
if j >= cc (or end) : op blank ; rest = comment
   (if loc also empty → COMMENT(counted) ; if loc = symbol → BSSZ 1)
op = word starting at j ; k = end of op
cc_eff = (k >= cc) ? ∞ : cc            -- COL rule
skip blanks → m
if m >= cc_eff or end : variable blank ; rest = comment
else variable = parsed by the subfield parser (see below)
rest after the first terminating blank = comment
```

The **variable field cannot be split naively at the first blank**:
counted character data (`nHxxx`, `nRxxx`..., which consume exactly n
characters, blanks included), delimited strings (`H*A B*`) and
parenthesized macro parameters contain blanks. Recommendation: let the
subfield parser (expressions / data / macro parameters) consume the
field and stop at the first blank **outside** these constructs.

---

## 3. Statement editing (§2.2, ch. 7)

### 3.1 When editing takes place

COMPASS reads statements in sequence and **edits, then immediately
interprets** each one, except:

1. comment lines with `*` in column 1;
2. lines that are part of a **definition**: between a `MACRO`/`MACROE`/
   `OPDEF` header and `ENDM`, between `DUP` or `ECHO` and `ENDD`, or
   between a pair of `RMT`. These lines are saved **unedited** (with
   their micro and concatenation marks, ch. 5: compressed storage) and
   edited **on each** reference/expansion. `ENDD` and `ENDM` are part of
   the definition they terminate and are **not** edited (example ch. 5:
   in a definition, the location of the edited MACRO header is `T1`,
   while that of the unedited ENDM remains `T→1`).

Lines within the range of an **IF** are edited **even when they are
skipped**.

Two kinds of editing: **concatenation** and **micro substitution**.

Listing option `A` (ch. 4): without `A`, a line containing marks is
listed as read; with `A`, the line is listed before **and** after
editing.

### 3.2 Concatenation (§2.2.1)

- COMPASS searches for the concatenation character **→ (65B, ASCII `_`)**
  and **removes it from every field** of the statement: the two
  adjacent columns are joined.
- Main use: delimiting a substitutable parameter name in a macro
  definition when no other delimiter is present (e.g. `P1→X`: after
  substitution of P1, the → is removed).
- Each removal **shifts the rest of the statement one column to the
  left**. Consequence: with a blank variable field, comments may slide
  to the left of column 30 and be taken as a variable field.
- → cannot be used as a string delimiter (§8.2) or appear in a symbol.

### 3.3 Micro substitution (§2.2.2, §7.1)

- COMPASS searches for **pairs of micro marks ≠ (64B, ASCII `"`)** that
  delimit a micro reference (`≠NAME≠`) and replaces the reference,
  **marks included**, with the micro's string.
- The replacement string may have a different length: the rest of the
  statement is shifted right or left.
- Overflow of column 72 of the last line read: continuation cards are
  created, **at most 9** in total; the excess is **deleted without
  notification**.
- **No replacement** if the micro name is unknown or if one of the two
  marks is missing: marks and name remain in the line. Unknown name
  → **nonfatal error 9** ("MICRO SUBSTITUTION ERROR. NO
  SUBSTITUTION.").
- An **isolated mark** is not illegal and produces no error (it may
  appear in a character string).
- **Null name** (two adjacent marks `≠≠`): both marks are deleted, no
  error. (Appendix D: useful as a "null substitution".)
- The shift may push the operation or the variable field beyond
  column 30, or bring a comment back into a blank field.
- Predefined (system) micros: `DATE`, `JDATE`, `TIME`, `BASE`, `CODE`,
  `QUAL`, `SEQUENCE`, `MODLEVEL`, `PCOMMENT` (reference card; ch. 7).
- Substitution does not apply to `*` comment lines.

**Order and rescanning.** [AMBIG] The manual presents concatenation
first, then micros, and says that "concatenation marks and pairs of
micro marks are removed before a name/symbol/string is analyzed". It
does not say whether substituted text is rescanned.
Recommendation: a single left-to-right scan of the image: on →,
remove; on ≠, look for the next ≠; if the text between the two is a
known micro name (or empty), replace and **resume the scan after the
inserted text** (no re-substitution of the result, which avoids any
recursion); otherwise leave the ≠ and continue just after it.
→ characters contained in inserted micro text are therefore kept.
(Same practical result in every use found in the manual.)

---

## 4. Names (§2.3)

A **name** identifies: a subprogram or an overlay, a block, a macro
definition, a remote definition (RMT), a duplicated sequence
(DUP/ECHO), an IF sequence, a micro.

- A name is terminated by a **comma or a blank**. Concatenation marks and
  pairs of micro marks are removed beforehand.
- **CPU subprogram or overlay name** (used for linkage): begins with a
  letter A–Z, **7 characters at most**. System conventions may restrict
  other characters.
- **PP subprogram/overlay name**: no restriction on the first character;
  maximum length: 7 (CYBER 70/76, 7600), 4 (CYBER 180), 3 (CYBER 170,
  CYBER 70 models 72/73/74, 6000 series — **this implementation: 3**).
- In all cases, the last character of a subprogram or overlay name cannot
  be `:`.
- **Any other name: 1 to 8 characters.** (Blocks: see §10.2 for the rules
  specific to `USE`.)
- A name **has no value and no attributes** and cannot appear in an
  expression.
- The different kinds of names **do not conflict**: a micro may have the
  name of a macro, a subprogram the name of a block, and so on (separate
  name spaces). Names are also distinct from symbols.
- A name or symbol longer than 8 characters → fatal error **A**.

---

## 5. Symbols (§2.4)

### 5.1 Ordinary symbols

- A set of characters that identifies a **value** and its **attributes**.
- **1 to 8 characters.**
- First character: **not `$`, not `=`, not `:`, not a digit**.
- Characters forbidden everywhere: `+ - * / blank , → ∧` (∧ = ASCII `&`;
  → = ASCII `_`).
- The other special characters are allowed but are "to be used with
  caution" (ECHO, macros). Allowed examples: `.`, `(`, `)`, `$` (not in
  1st position), `=` (not in 1st position), `[`, `]`, `#`… [INFER: direct
  consequence of the exclusion rule; appendix D recommends `.1`, `.2` as
  symbols in macros, so a leading `.` is legal.]
- Legal examples: `P`, `R3`, `PROGRAM`. Illegal: `5A` (leading digit),
  `ABCEDEFGHI` (> 8), `ABE+15` (`+`), `=.11` (leading `=`).
- **CPU only**: a symbol normally cannot have the form of a register
  designator `An`, `Bn`, `Xn` (n a digit 0–7), nor `A.x`, `B.x`, `X.x` (x
  is then taken as data). Such a symbol can be used if **every** use is
  prefixed by `=S`, `=X` or `=Y`; a **warning** is issued when it is
  defined. This prefix is forbidden in the location field of machine
  instructions, symbol-definition pseudos, data-generation pseudos and
  `BSS`, and in the variable field of `ENTRY`, `EXT`, `SST` (the bare
  symbol is written there).
- In **PP** code, registers do not exist: `A1`, `X3`… are ordinary
  symbols.
- Number of references to a symbol: unlimited.

### 5.2 Defining a symbol — five ways

1. **Symbol in the location field** of a machine instruction or of
   certain pseudos (DATA, BSS, BSSZ, CON, DIS, VFD…): defined as an
   **address** = current value of the **location counter** (after any
   force upper), with the attribute:
   - **absolute** for the absolute block;
   - **common** for named or blank common blocks (relocatable assemblies
     only);
   - **relocatable** for local blocks other than the absolute block, in
     pass 1;
   - **absolute** for local blocks in pass 2 of an absolute assembly.
2. **Definition pseudos** (`EQU`, `=`, `SET`, `MAX`, `MIN`, `MICCNT`,
   ch. 4 §4.6): value and attributes of an expression in the variable
   field. `EQU` and `=` define permanently; `SET`, `MAX`, `MIN`, `MICCNT`
   give the **redefinable** attribute. A second definition of a
   non-redefinable symbol with a **different value** → fatal error **D**
   ("DOUBLY DEFINED SYMBOL. THE FIRST DEFINITION HOLDS").
   [INFER: a redefinition with the same value and the same attributes =
   no error, as "with a different value" implies.]
3. **External symbol**: defined outside the subprogram, declared external
   (`EXT`, or by default `=X`/`=Y`), or defined relative to an external
   symbol (`SYM EQU EXTSYM+3`). Attribute **external**; its true value is
   not known to the subprogram (value 0 for the assembler, plus any
   offset, §9.6).
4. **System symbols**: definitions made outside the program and imported
   by `SST` (system texts). COMPASS uses the actual definitions and adds
   the **systems symbol** attribute.
5. **By default**: a reference prefixed by `=S` to a symbol not otherwise
   defined (§5.4).

**Value width**: the definition pseudos assign values **on 21 bits**
(ch. 4 §4.6; §2.8.2: "for a symbol-definition pseudo, the value of the
expression, including character constants, is justified in a 21-bit
field"). 21-bit quantities (counters, addresses, symbols) are **sign
extended** to 60 bits when they enter an expression. A register is not
allowed in the expression of a definition pseudo.

### 5.3 Linkage symbols (§2.4.1)

- Two kinds: **externals** and **entry points**.
- **7 characters at most**, first character a letter A–Z, last character
  other than `:`.
- A symbol declared as an entry point in another module may be declared
  external here, and vice versa.
- An external has the **value zero** and the external attribute.
  Declaration by `EXT` or by default (`=X`, `=Y`).
- **Strong** external: the loader searches for and loads a module that
  has the entry point; failure = nonfatal loader error. **Weak** external:
  no search; linked only if a matching module is loaded for another
  reason; unresolved at the end of loading = no error.
- A symbol can be defined relative to an external declared by `EXT` with
  a definition pseudo: if the expression reduces to "external ± integer",
  the symbol has an integer value (the offset) and the external
  attribute.
- Entry points and externals **are not qualified** (QUAL has no effect on
  them).

### 5.4 Default symbols (§2.4.2)

Prefixes of a **reference** (never of a definition): `=S`, `=X`, `=Y`.
If the symbol is not defined in the subprogram, COMPASS defines or
declares it **at the end of assembly**. `=X` and `=Y` work by default
only in a **relocatable** assembly.

| Form | If not conventionally defined |
|---|---|
| `=Ssym` | COMPASS assigns it **one word at the end of block zero**; all references (with or without `=S`) designate this word. |
| `=Xsym` | **strong external**, as if declared by `EXT`. Must follow the rules for external symbols. |
| `=Ysym` | **weak external**, provided that the symbol is not referenced elsewhere with `=X` or `=S`, nor declared by `EXT`. Must follow the rules for externals. |

- If the symbol is conventionally defined (anywhere, before or after),
  COMPASS uses that definition and does nothing else.
- A default symbol **cannot** be used where a "previously defined" symbol
  is required (e.g. `EQU`: the expression can contain symbols prefixed
  `=S`/`=X`/`=Y` only if they are also conventionally defined).
- **Error** (no default definition) if a symbol is prefixed by both `=S`
  and `=X`, or if it is prefixed `=X` or `=Y` in an **absolute** assembly
  without a conventional definition. [INFER: flag **U** (undefined
  symbol) in the absolute case; **A** for the =S/=X conflict.]
- `=S`, `=X` or `=Y` with no symbol after it → error **A**.
- Default symbols are **qualified** by the qualifier in effect at the
  time of the `=S` reference.
- The words of `=S` symbols are listed (option D) under "DEFAULT SYMBOLS
  DEFINED BY COMPASS", just before the contents of the literals block.
  [INFER: each word is initialized to zero.] The order in which words are
  assigned is not specified: recommendation, order of first reference.
- In an absolute program, block zero exists only if there are default
  symbols (§10.2).

### 5.5 Previously defined, evaluable, undefined symbols

- **Previously defined** (§2.4.3): defined in a statement *preceding*
  (in pass 1 source order) the one that uses it. Some pseudos require it
  (EQU, BSS, ORG, IF…, line counts…).
- **Evaluable expression** (§2.8.1): contains no symbol that is still
  undefined.
- **Undefined** (§2.4.4): a symbol never defined, not even by default →
  flag **U** to the left of the statement that references it; value
  assumed 0 ("UNDEFINED SYMBOL. VALUE ASSUMED 0"). U also covers: line
  count of an IF, word count of DIS, unrecognized attribute in an IF,
  undefined qualifier.

### 5.6 Qualified symbols (§2.4.5, QUAL ch. 4 §4.4.4)

- A symbol defined while a qualifier is in effect (`QUAL name`) is
  **qualified** by that name. Inside the sequence it is referenced bare;
  outside, as **`/qualifier/symbol`**.
- An **unqualified** symbol is **global** and is referenced without a
  qualifier — except when a qualifier is in effect **and** a symbol of the
  same name qualified by that qualifier exists: the global symbol is then
  referenced as **`//symbol`**.
- Qualifier + symbol = unique identifier of **16 characters** at most
  (8 + 8).
- Linkage symbols are not qualified.
- Resolution of a bare reference `S` (recommendation consistent with the
  manual): if a qualifier Q is in effect and `Q.S` exists → `Q.S`;
  otherwise global `S`. [AMBIG] For a forward reference (S defined later,
  qualified), resolution must be done in pass 2 with the qualifier saved
  at the time of the reference.
- Symbols invented for macro LOCALs are qualified if they are defined in
  a QUAL block.

### 5.7 Local symbols (macros) — cross-reference

`LOCAL` (ch. 5 §5.4.8): in a MACRO/MACROE/OPDEF definition, a list of
local symbols (each begins with a letter; separators and forbidden
characters `+ - * / ( ) $ , .`). At each expansion, each local symbol is
replaced by a unique **invented symbol** (listed in a form `↑Wnnnnn`
according to the OCR "tW00001" [AMBIG: first character unreadable,
probably a character not allowed in user symbols, e.g. ↑ 70B]). Limit:
63 parameters + locals per definition. Appendix D: prefer `.1`, `.2`… to
local symbols for speed. Details in the macro spec.

---

## 6. CPU registers (§2.5)

The 24 CPU registers have **built-in** designators that cannot be
changed:

| Type | Designators |
|---|---|
| Address | `An` or `A.n` |
| Index | `Bn` or `B.n` |
| Operand | `Xn` or `X.n` |

- Form `An`/`Bn`/`Xn`: n = **a single digit 0–7**. Any other value
  (e.g. `A8`, `A10`) → it is a **symbol**.
- Form `A.n`/`B.n`/`X.n`: n is a **symbol or an integer** (evaluated in
  the current base [INFER: the example assumes decimal base]). If the
  value exceeds 7, it is **truncated to the low-order 3 bits** with a
  **warning** [INFER: flag 7, "value exceeds field size, result
  truncated"].
- Examples: `A1` → register A1; `A10` → symbol; `A.1` → A1;
  `A.NUM` with NUM=6 → A6; `A.10` → decimal 10 = 12B → **A2** +
  warning.
- A1–A5 are used to read memory (load into X1–X5), A6–A7 to write
  (store from X6–X7).
- PP: no registers are recognized.
- Equivalence (manual example, ALPHA = 1000B): `SB3 A2+ALPHA` and
  (`SUM SET 3`, `SUB SET 2`, `SB.SUM A.SUB+ALPHA`) both generate
  `6032001000`.

---

## 7. Special elements (§2.6, §3.2)

Reserved designators, **never usable as symbols**, cannot be changed.
In an expression they are replaced by the value shown ("current block" =
block of the current `USE`).

| Element | Value | Attribute |
|---|---|---|
| `*` or `*L` | **location** counter of the current block | relocatable (in the current block), **absolute** if the current block is the absolute block |
| `*O` | **origin** counter of the current block | same |
| `*P` | value of the **position** counter of the current block (bits remaining in the word: 60…1, or 12/16 in PP) | absolute |
| `$` | position counter **minus one** (number of the next free bit) | absolute |
| `*F` | 0: called by a COMPASS control statement; 1: RUN compiler (no longer supported); 2: FTN4; 3: FTN5. Can be redefined by the `F` parameter of the COMPASS control statement (`F=n` decimal). | absolute |

Notes:

- These elements are recognized only **in element position** in an
  expression. `*` in operator position is multiplication; thus
  `**` = element `*` × null element (0); `*+3` = location + 3;
  `ABLE*4` = ABLE × 4.
- `-*O` is a negative relocatable expression (manual example).
- After a statement that causes a deferred force upper (§10.4), pseudos
  that reference `*`, `*O`, `*P`, `$` see the value **before** the force
  upper.
- `POS *P` has no effect; `POS $` subtracts 1 from the position counter
  (ch. 4).
- Manual examples (degraded OCR): `JP *+1`, `... X3,*L-1`,
  `VFD *P/0`, `... $/0,1/1`, `... *F,…`.

---

## 8. Data notation (§2.7)

Two kinds: **character** and **numeric** (octal, decimal, hexadecimal;
integer, single- or double-precision floating point). Three ways to
introduce them:

1. **Data item**: subfields of `DATA` and `LIT`, and field values of
   `VFD` (ch. 4).
2. **Constant**: expression element.
3. **Literal**: `=data` in an expression (or a subfield of `LIT`).

Differences between a constant and a data item:

- A constant **must begin with a digit**: no delimited character form, no
  pre-radix (`B`, `O`, `D`), and the `0` of hexadecimal is mandatory.
- The field size of a constant is that of the **destination field** of
  the expression, 60 bits at most: **no double precision**.
- A sign in front of a constant is an expression **operator**; in front
  of a data item or a literal, it is part of the data.

### 8.1 Character data (§2.7.4)

**Code**: strings are converted into the code in effect at the time of
evaluation (`CODE` pseudo, §11.4); default: **display code** (except
`CIPPU`: 8-bit ASCII).

**Formats**

```
Data item :   [sign] n type string
              [sign] type d string d
Constant  :   n type string                 (n required)
Literal   :   = [sign] n type string
              = [sign] type d string d
```

- `=`: literals only (as an expression element).
- `sign`: optional (data item/literal). `+` or absent: positive value.
  `-`: the **complemented value** is formed (ones' complement, bit by
  bit; [INFER] word by word for a multiword string).
- `n`: defines the length, **always decimal** whatever the base.
  - **absent**: string delimited by `d` (forbidden for a constant);
  - **0**: data item/literal: the string = all characters after `type`
    up to the first **blank or comma** (excluded). Constant: up to the
    first **`+ - * / blank , ∧`** (excluded);
  - **n > 0**: the string = **exactly the n characters** that follow
    `type` (blanks, commas, operators included). Data item/literal: n does
    not count the guaranteed zeros, limited only by the size of the
    statement. Constant: n ≤ (bits of the destination field) / 6.
- `type` (justification and fill):

| Type | Data item / literal | Constant |
|---|---|---|
| `C` | left justified, zero fill, **12 zero bits guaranteed** at the end of the string (one more word if needed) | = `L` (no guaranteed zeros) |
| `H` | left justified, **blank** fill | same |
| `A` | right justified, **blank** fill | same |
| `R` | right justified, zero fill | same |
| `L` | left justified, zero fill | same |
| `Z` | left justified, zero fill, **6 zero bits guaranteed** at the end (one more word if needed) | = `L` |

- `d`: delimiter (only if n is absent). The string = characters between
  the 1st and the 2nd occurrence of d. **d can be any character except
  → (concatenation) and ≠ (micro mark).** [INFER: blank and comma as
  delimiters must be rejected, since they terminate the subfield.]
- `string`: characters of a COMPASS character set (appendix A), except
  the delimiters (see n and d), the concatenation mark and **pairs** of
  micro marks — these have been removed/processed by editing before the
  string is examined; an **isolated** ≠ mark is allowed.

**Empty strings**

- empty if: n = 0 and `type` is immediately followed by a terminator
  (e.g. `0L,`); or n absent and adjacent delimiters (e.g. `H++`).
- `DATA`: an omitted string is legal and **generates no word**.
- Constant: an omitted string is valid, **value zero**.
- `LIT`: an omitted string is legal and generates no literal for that
  item; but the LIT must contain at least one nonempty item (otherwise
  error A, "no data is found in the variable field of a LIT").
- Literal in an expression: empty string **illegal** → error.
- **An empty string cannot be generated with C, Z, R or A**: `0C`, `0Z`,
  `0R`, `0A`… [INFER: `0C`/`0Z` generate a word of zeros (the guaranteed
  zeros), `0R` a word of zeros, `0A` a word of blanks; only `H` and `L`
  can give an empty string.] [AMBIG]

**Word allocation (data items and literals)** [INFER, consistent with
all the examples] — let `cpw` = characters per word (10 in CPU, 2 in
12-bit PP), `wb` = bits per word (60 or 12):

- `H`, `L`, `A`, `R`: `ceil(n / cpw)` words; the string is justified in
  this multiword field (H/L: characters at the start, fill at the end of
  the last word; A/R: characters at the end of the last word, fill at the
  start of the first word);
- `C`: `ceil((6n + 12) / wb)` words; `Z`: `ceil((6n + 6) / wb)` words;
  zero fill.
- CPU examples: `DATA 10HABCDEFGHIJ` = 1 word; `DATA 10CABCDEFGHIJ` =
  2 words (the 2nd is zero); `DATA 9ZABCDEFGHI` = 1 word.
- Manual examples: `WORDS DATA H* THE ANSWER IS *` →
  `55241005550116232705`, `11235555555555555555`… (blank fill);
  PP `DATA 0LOUTPUT` → `1725`, `2420`, `2524`; CPU `DATA 0LCOMPILE` →
  `03171520111405000000`; `DATA 0LLGO` → `14071700000000000000`;
  PP `DATA H*DATA*` → `0401`, `2401`.

**Character constants in an expression** (§2.8.2): the string is first
justified (left or right) in a field of the **size of the destination
field**, filled according to the type, then extended to 60 bits; then
the arithmetic applies.

- E.g. `SX4 1R.+1`: `.` = 57B, +1 → K = `60` → `7140000060`.
- `SX3 1R*` → `7130000047`. `SA1 3RCIO` → `5110031117`.
- `SBi X0+1L$` (18-bit K field) → K = `530000` (listing:
  `6260530000`, i.e. SB6; register barely legible in the OCR).
- `VFD 30/4H....,6/1RA,24/1AX+1`: `1AX` in 24 bits = `55555530`, +1 →
  `55555531` (the blank fill covers the whole destination field).
- `VFD 42/0LOUTPUT,18/1` → `17252420252400000001` (42 bits:
  `17252420252400`, then 18 bits: `000001`).
- Truncation: **right-justified** constant → truncation error if the
  highest significant bit exceeds the field (truncated zeros are not an
  error); **left-justified** constant → error if low-order positions are
  truncated, **even if they are zero**.
  [INFER: flag 7.]

### 8.2 Numeric data (§2.7.5)

**Formats**

```
Data item :   [sign] [preradix] value [modifiers]
Constant  :   value [modifiers]                 (begins with a digit)
Literal   :   = [sign] [preradix] value [modifiers]
```

- `sign`: `+`/absent: positive; `-`: the value is **complemented** (ones'
  complement: -1 in 60 bits = `77777777777777777776`; in a 12-bit PP word,
  -9 = `7766`, -1 = `7776`).
- `preradix` (data items and literals only): `B` or `O` = octal; `D` =
  decimal; absent = postradix or current base (`BASE`, decimal by default).
- `value`: octal or decimal digits: integer part, point (decimal or
  octal), fractional part. **No point = integer (fixed point). With a
  point = floating point** (CPU only; illegal in PP).
  - octal: at most **20 significant digits** (integer) or **32**
    (floating); no 8 or 9;
  - decimal: at most **1.15 × 10^18** (integer, ≈ 2^60) or **7.9 × 10^28**
    (floating, point ignored); beyond that, the result is incorrect (not
    guaranteed);
  - `value` omitted = 0 (e.g. `=D`, `B` alone… [INFER]).
- `modifiers`: optional, **in any order**, each **only once** (duplicate →
  error):
  - **postradix** `B`, `O` (octal) or `D` (decimal). Preradix **and**
    postradix → error;
  - **decimal exponent** `E±n`, `En`, `E` (single precision); `EE±n`,
    `EEn`, `EE` (**double precision**). n decimal, absent = 0, |n| ≤ 32767.
    Effect: multiplies by 10^n. `EE` on an integer value → single-precision
    integer;
  - **binary scale** `S±n`, `Sn`, `S`: multiplies by 2^n. n decimal,
    absent = 0, |n| ≤ 32767;
  - **binary point position** `P±n`, `Pn`, `P` (floating point only): see
    below.
- With BASE O, a data item that contains 8 or 9 without a D radix is in
  error; character counts and the n of the S/E/P modifiers are **always
  decimal** (BASE, ch. 4). Error A: "8 or 9 is encountered in octal data
  and the modifier is not S, P, O, E, D, or B".
- Order of application, whatever the order in which they are written:
  **1. decimal exponent, 2. binary scale, 3. binary point** (CPU only).
- Precision: computations in **144 bits**; rounded to **96 bits** (double),
  **48 bits** (single floating), **60 bits** (integers).
  [INFER] Round to nearest (half up in absolute value) at the last
  retained bit; confirmed by `1.1` → `17204314631463146315` (truncation
  would give `…6314`). For an integer with a negative exponent (`15E-1`),
  1.5 rounds to 2 [AMBIG].
- Scales may exceed the valid ranges, but the **numbers** are bounded by
  the hardware. Example: `1.0E400S-1200` ≈ 5.8 × 10^38: valid.

**Integers**: exact value (after E and S), rounded to an integer, then
represented in 60 bits (≥ 2^59 → sign bit set; [INFER] "excess
high-order bits are lost"). Negative = ones' complement of the positive
value. In a PP data item, the word is 12 bits [INFER: truncation with flag
7 if the value does not fit].

**CDC 6000 floating-point format** (single precision, 60 bits) — [INFER:
standard hardware format, checked against the manual's examples]:

```
bit 59        : sign (1 = negative; a negative number is the ones'
                complement of all 60 bits of the positive number)
bits 58..48   : biased exponent (11 bits)
bits 47..0    : integer coefficient C (48 bits); value = C × 2^e
```

- Exponent field for a positive number: `e ≥ 0` → `2000B + e`; `e < 0` →
  `1777B + e` (11-bit ones' complement with the leading bit inverted).
  Range of `e`: −1777B…+1777B (−1023…+1023).
- **Normalized**: bit 47 of C set (zero = the all-zero word
  `00000000000000000000`).
- Examples: `1.0` = `17204000000000000000`; `0.1` =
  `17146314631463146315`; `1.1` = `17204314631463146315`; `-0.0`
  (complement of zero) = `77777777777777777777`.
- **Binary point P**: `P+n` / `Pn`: the point is placed to the right of
  bit n, that is, the **exponent is forced to −n**; `P-n`: exponent +n.
  "The exponent is adjusted to −(±n)": `P-6` → exponent field `2006B`;
  `P10` → `1765B`. The result is an **unnormalized** floating-point
  number; without P (or P without n) → normalized. If, because of P, the
  most significant bit moves out of the coefficient (single or double) →
  **overflow or underflow error**. [INFER] Rounding to 48 significant bits
  takes place before the P alignment, and the right shift caused by P
  truncates: the example `0.1P47` → `17200314631463146314` (not …6315).
- **Double precision** (`EE`, CPU, data items and literals only): two
  words. Word 1 = normalized single-precision floating-point number formed
  from the 48 leading bits of the coefficient (overall rounding to 96
  bits); word 2 = the next 48 bits, **exponent = exponent of word 1 − 48**
  (field − `60B`), unnormalized; a negative number complements both words.
  Examples: `DATA 1.3EE` → `17205146314631463146`,
  `16403146314631463146`; `10.0EE` [INFER from the literals example] →
  `17235000000000000000`, `16430000000000000000` (low word with a zero
  coefficient but an exponent present).
- **Integer**: a floating-point number cannot be double precision when it
  is used as an expression constant (60 bits maximum). All expression
  arithmetic is **integer**: `2.3` in an expression is the bit pattern of
  the floating-point number 2.3 treated as an integer.
- Exponent overflow (> 1777B) or underflow → error [INFER: flag A].

**Examples (default decimal base)**

| Source | Result |
|---|---|
| `DATA 1` | `00000000000000000001` |
| `DATA -1` | `77777777777777777776` |
| `SX3 100B` | K = `000100` |
| `1S17` | 2^17 = `400000B` |
| PP `DATA 5,-9` | `0005`, `7766` |
| PP `LDC =10` | literal `0012` |
| PP `LDC =-1` | literal `7776` |
| `SA5 =20046755000234000004B` | literal = this octal pattern |

### 8.3 Hexadecimal notation (§2.7.6)

Always a **single-precision integer**.

```
Data item :   [sign] [0] preradix value [modifiers]
Constant  :   0 preradix value [modifiers]        (the 0 is required)
Literal   :   = [sign] [0] preradix value [modifiers]
```

- `preradix`: required, **≡ (60B), ASCII `#`** ("= or # depending on the
  printer" in the OCR: this is ≡/#).
- The leading `0` is optional for data items and literals, **required for
  a constant** (otherwise the preradix would be taken as the start of a
  symbol).
- `value`: hexadecimal digits `0–9`, `A–F`; up to **26 significant
  digits**; no point; absent = 0. [AMBIG] 26 × 4 = 104 bits > 60:
  recommendation: keep the 60 low-order bits and raise flag 7 if nonzero
  bits are lost.
- `modifiers`: `S` (binary scale, same form as §8.2) allowed; `P` allowed
  but **ignored**.
- Examples: `DATA #123ABC` → `00000000000004435274`;
  `CON 0#A01576` → `00000000000050012566`; `SX3 =-#12345S2` → literal
  `77777777777776671353` (−(12345h × 4)).

### 8.4 Literals (§2.7.3)

- A literal is a **read-only constant**, specified as a data item of a
  `LIT` or as an expression element prefixed by **`=`** (`=1`,
  `=10HOUTPUT`, `=-3RABC`, `=R*ABC*`, `=1.0`, `=3.14159EE+6`, `=#FF`…).
  All data forms (§8.1–8.3) are allowed, including preradix, sign,
  delimited strings and double precision.
- In an expression, the literal's value is **the address** of its entry
  in the **literals block**: it is therefore **relocatable** (local
  literals block; absolute after pass 2 of an absolute assembly).
- "Conventionally", a literal is the only element of its expression, but
  combining it is legal (e.g. `1+=3.14159EE+6`).
- An empty literal in an expression is illegal (error A).
- `DATA` does not accept a literal as an item.
- **Pool and duplicate elimination**: the first use of a literal assembles
  its words in the literals block. If the bit pattern of a prefixed
  literal, or of **all** the items of a `LIT` sequence, matches words
  already present, no entry is created. Algorithm [INFER, consistent with
  the manual's three examples]:
  1. Form the word sequence S (1 word or more; for `LIT`, the
     concatenation of all its items in order).
  2. If S appears as a **contiguous subsequence** anywhere in the pool
     → reuse its starting address.
  3. Otherwise, find the longest **suffix of the pool equal to a prefix of
     S**; append only the remaining part of S; the address is that of the
     start of the overlapped prefix (or of the first appended word if
     there is no overlap).
  - Only the **bit pattern** matters: `=1` and `=1RA` (A = 01) share the
    same word.
  - Example: `SB2 =1` (creates 5555: `…01`), `SB3 =1RA` (reuses 5555),
    `SB4 =1RB` (creates 5556: `…02`), `L LIT 1,2` (reuses 5555–5556,
    L = 5555). Then `LIT 1,3,1RD,2` → 4 new words (5557–5562). But
    `LIT 1,2,3,4` instead → overlaps the last two words `1,2` and appends
    only `3,4`.
- `LIT` associates a symbol with pool entries (address of the first word
  in the octal field of the listing). These words must remain read-only
  (integrity of the shared pool).
- `LIT` generating more than **100 words** → fatal error **F**.
- Listing (option D): "CONTENT OF LITERALS BLOCK.", each address with its
  octal content and its display-code conversion.
- Placement: literals block = `LITERALS*`, **immediately after the zero
  block** (§10.2). In an IDENT-type overlay or a partial section started
  by a blank IDENT, each section has its own pool.

### 8.5 Lexical rules for subfields (implementation reference)

In an expression, in **element position**:

| Start | Interpretation |
|---|---|
| digit | constant: numeric (digits, `.`, B/O/D/E/EE/S/P modifiers), character (decimal `n`, then type `C H A R L Z`, then n characters, or n = 0 up to the terminator), or hexadecimal (`0` then `≡`/`#`) |
| `=` followed by `S`, `X` or `Y` | default symbol prefix |
| `=` other | literal (complete data item, sign allowed) |
| `/` | qualified symbol `/Q/SYM` or global symbol `//SYM` |
| `*O`, `*L`, `*P`, `*F`, `*` | special element |
| `$` | special element |
| `An`, `Bn`, `Xn` (n 0–7, followed by a character that is not a symbol character), `A.x`, `B.x`, `X.x` | register (CPU) |
| other symbol character | symbol |
| operator, `,`, blank, end | empty element (= 0) |

- The character type letters (`C H A R L Z`) and the numeric modifiers
  (`B O D E S P`) are **disjoint**, which removes the ambiguity after the
  digits. `0#…`: the hexadecimal digits A–F are not types because the
  preradix has been seen.
- A modifier followed by `+`/`-` and then a digit consumes the sign and
  the integer; without a digit, n = 0 and the sign becomes an operator
  again [INFER].
- In `DATA`/`LIT` (pure data, no symbols): an item that begins with a
  letter is either a numeric preradix (`B`, `O`, `D` followed by digits)
  or a character type followed by a delimiter.

---

## 9. Expressions (§2.8)

### 9.1 Syntax

- Most subfields are **expressions**: one or more **terms**; each term =
  one or more **elements** joined by element operators. A **comma or a
  blank terminates the expression**.
- Elements: symbol, numeric or character constant, special element,
  register designator (CPU), literal. Examples: `ALPHA`, `$`, `*P`,
  `A.7`, `X3`, `3HABC`, `=10HOUTPUT`, `77B`.
- Element operators (form a term): `*` multiplication, `/` division.
- Term operators (form the expression): `+` addition, `-` subtraction,
  `∧` (ASCII `&`) **exclusive OR**.
- **No grouping parentheses**; **no relational operators** and no logical
  AND/OR. Precedence: `*` `/` (left to right) before `+ - ∧` (left to
  right).

Equivalent grammar:

```
expression := [addop] term { addop term }
term       := element { mulop element }
addop      := '+' | '-' | '∧'
mulop      := '*' | '/'
element    := (see §8.5) | ε
```

### 9.2 Rules (§2.8)

1. Last element of a term omitted → a **zero** element is supplied:
   `ABLE*+3` = ABLE×0 + 3.
2. **Two successive elements are illegal** (error A). But `**` is legal:
   element `*`, operator `*`, null (blank) element.
3. A term contains **at most one relocatable or external element**:
   `**ABLE` (ABLE relocatable) is illegal.
4. The element to the **left of a divisor must be absolute** [INFER: the
   partial product of the term to the left of the `/` must be absolute;
   so must the divisor].
5. **Division by zero → zero, without error.**
6. Two or more consecutive additive operators (`+`, `-`, `∧`) → a term
   with a value of zero is inserted between them.
7. Expression that begins with an additive operator → a zero term is
   inserted before it.
8. All arithmetic is **integer**, even if an element is a floating-point
   constant (`2.3`). Results are limited to **60 bits**: excess high-order
   bits of a term or a value are lost **without a message**.

### 9.3 Arithmetic (§2.8.2)

- Each element is replaced by a **60-bit value**; signs are extended for
  21-bit quantities (counters, addresses, symbols); a character constant
  is justified in the destination field, then extended to 60 bits;
  register → value 0.
- **Division**: integer part of the quotient, remainder lost. `5/2*2` = 4
  (left to right).
- Left-to-right evaluation: COMPASS forms a term up to the next
  `+`/`-`/`∧`, notes whether the term contains a relocatable or external
  symbol or registers, then adds/subtracts/"differences" (XOR) it into the
  running absolute, relocatable and external parts.
- Representation: **60-bit ones' complement** (minus forms the
  complemented value; −0 = `777…777` exists; IFPL/IFMI distinguish +0 and
  −0). [INFER — to be validated by tests] Recommended semantics, those of
  the 6600 subtractive adder: interpret the operands as signed integers
  (word with bit 59 = 1 → −(complement)), compute exactly (BigInt), then
  convert: result 0 → +0, **except** (−0)+(−0) and (−0)−(+0), which give
  −0; result r ≠ 0 → |r| mod 2^60, complemented if r < 0. Multiplication
  and division on the signed values, quotient truncated toward zero.
- `∧`: bitwise exclusive OR of the two 60-bit words. [AMBIG] With a
  relocatable or external term: recommendation: error A (relocation
  undefined), unless all relocatable elements cancel.
- The final value is truncated if necessary and placed in the destination
  field; **too large for the field → error flag** (7, "ADDRESS VALUE
  EXCEEDS FIELD SIZE, RESULT TRUNCATED"). [INFER] "Fits in n bits" = bits
  59..n are all 0 or all 1 (so `777777B` and `-1` are accepted in an
  18-bit field).
- Maximum size of an expression field: 60 bits.

**Destination field size**

| Context | Field |
|---|---|
| Symbol-defining pseudo instruction (EQU, =, SET, MAX, MIN, MICCNT) | **21 bits** (character constants included) |
| `VFD` | specified size (≤ 60) |
| `CON` | one word: 60 bits (CPU), 12 or 16 bits (PP) |
| CPU machine instruction | 18-bit (K) or 6-bit (jk) address field |
| PP machine instruction | 18, 16, 12 or 6 bits |

### 9.4 Registers in an expression

- The operator immediately preceding a register designator is the
  **register operator**, whatever the position of the register in the
  expression: `+`, `-`, `*` or `/`.
- If the register is the **first element**, the operator may be omitted:
  `+` is assumed.
- The rest forms the **operand** (absolute, relocatable or external).
- `3+A6-NUM` → register A6 (operator +) and operand `3-NUM`.
- `X3+LIMA-10B`, `LIMA+X3-10B`, `-10B+LIMA+X3` produce the same result.
  Other examples: `B1+XYZ`, `*+A.NUM`.
- In practice, reserved for CPU machine instructions, which interpret the
  form (ch. 8); a pseudo instruction that disallows registers (EQU,
  CON…) → error A ("the instruction disallows register designators", "a
  register is illegal in a CON instruction").

### 9.5 Expression types and relocation (§2.8.1)

An expression reduces to:

- an **absolute value** (absolute address or integer);
- an **external ± 21-bit integer**;
- a **relocatable value ± 21-bit integer**;
- **registers + one of the above** (CPU);
- **registers alone** (CPU).

**Recommended implementation model**: each intermediate value carries
(a) a 60-bit absolute part, (b) a vector of integer coefficients per
relocatable block (local block, common block; the absolute block does not
count), (c) a vector of coefficients per external symbol, (d) the list of
registers. A relocatable element has coefficient +1 in its block;
multiplication by an absolute value multiplies the coefficients (`3*FOX`
is legal); a term can have only one non-absolute element (rule 3); the
dividend must be absolute (rule 4).

At the end:

- **Absolute**: all coefficients zero. Possible with relocatable elements
  if they cancel **in pairs within the same block** (opposite signs,
  possibly multiples, not necessarily contiguous). Examples (EASY, FOX
  relocatable in the same block, MIKE absolute, counters of the same
  block): `EASY-FOX+MIKE`, `FOX-*`, `MIKE+16`, `*-EASY-FOX*2`.
- **Relocatable**: a single block with coefficient ±1, all others 0, no
  external. Three kinds: **program positive**, **program negative**,
  **common positive** (common negative is **not allowed** by the loader →
  error). Examples (LIMA in another block): `LIMA+MIKE-16`,
  `FOX-EASY+FOX`, `3*FOX-2*EASY`, `EASY-*+FOX`, `FOX-100B/MIKE`,
  `-MIKE*2+LIMA`, `=10HMESSAGE 33`, `-*O`.
- **External**: a single external with coefficient **+1** (positive), all
  block coefficients zero. Examples (XYZ, ABC external; counters of LIMA's
  block): `XYZ-*+FOX-EASY+LIMA`, `FOX-3*EASY+2*FOX+XYZ`,
  `ABC+100B+MIKE`. Illegal: `XYZ+ABC` (two externals), `-ABC+*-LIMA`
  (negative external), `XYZ+*O` (unpaired relocatable).
- **Register**: as above, plus registers.
- Any other combination (coefficient ±2, two uncanceled blocks, external
  + relocatable…) → error **A** ("The relocatable terms do not cancel
  properly" / "The expression does not reduce to one external term").
- The notion of block is that of **pass 1**: two symbols of **different**
  local blocks do not cancel, even if their difference would be constant
  after allocation. [Strict INFER from the text.]
- A symbol of a local block in an **absolute assembly** is relocatable in
  pass 1 and absolute in pass 2; a common block in an absolute program is
  treated as a local block (§10.2).
- Context constraints (ch. 4, 8): some instructions require an absolute
  expression (error A), or an evaluable one, or disallow externals; a
  negative relocatable entry point → error **N**; ORG/ORGC with negative
  relocation → error A.
- Listing: the octal code of a word that contains an address is followed
  by `+` (positive relocatable), `-` (negative relocatable), `C`
  (common), `X` (external). (The `-` sign is unreadable in the OCR;
  inferred.)
- Warning from the manual: some loaders misbehave if a relocatable/external
  address is assembled more than once into the same field of the same word
  (ORG backward, common preset by several modules); `ORGC` avoids this. In
  a relocatable `VFD`: no relocatable/external field can cross a word
  boundary, and at most 4 relocatable/external fields per word.

### 9.6 Evaluation by pass and value of externals

- **External** defined outside the subprogram: value **0**. External
  defined within the subprogram relative to an external: value = offset
  from that external.
- **Pass 1**: the value of a relocatable symbol is relative to the
  **start of its block**. **Pass 2**: relative to the origin of the
  **program** (for local blocks) or of the **common block**. An
  expression containing relocatable symbols therefore does not
  necessarily evaluate the same way in both passes (hence the
  "evaluable"/"previously defined" requirement for pseudo instructions
  that influence allocation).

### 9.7 Expression examples (§2.8)

| Expression | Reading |
|---|---|
| `ABLE` | one term |
| `$-29` | two terms: `$` and 29 |
| `1+=3.14159EE+6` | constant + address of a double-precision literal |
| `*+3` | location + 3 |
| `ABLE*4-72/NUM` | (ABLE×4) − (72÷NUM) |
| `10B` | octal constant |
| `3+A6-NUM` | register A6, operand 3−NUM |
| `1R=∧1R/` | XOR of the codes of `=` (54B) and `/` (50B) = 04B |

---

## 10. Program structure (chapter 3)

### 10.1 Subprogram and block group

- Subprogram = `IDENT` … `END`. It is a main program if `END` gives a
  **transfer address** (`END BEGIN`).
- A subprogram can be divided into **blocks**; code can be directed
  alternately to several blocks (`USE`, `USELCM`, `ORG`, `ORGC`); the
  locations of a block are assigned consecutively.
- A symbol defined in a block **is not local to the block**: it is global
  to the subprogram (only QUAL restricts it).
- The blocks established between two `IDENT`s, or between `IDENT` and
  `END`, form a **block group**. **At most 255 blocks per group, of which
  252 are established by the user** (> 255 → error **F**). When COMPASS
  interprets `IDENT` or `END`, it executes **pass 2 of the completed
  group**: all symbols receive absolute values, the block name table is
  cleared, the USE/USELCM/ORG/ORGC list is cleared, and the block structure
  starts over from zero. For `END`, the symbol table is also cleared
  before the next subprogram.
- Code generated before any `USE` (or without `USE`) → **nominal block**,
  listed as `PROGRAM*`: the **absolute** block for an absolute program, the
  **zero block** for a relocatable program.
- External limits: more than **511 external symbols** → error F.

### 10.2 Block types

| Block | Name in listing | Description |
|---|---|---|
| **Absolute** | `PROGRAM*` (absolute assembly) / `ABSOLUTE*` (relocatable) | Nominal block of an absolute assembly. Absolute code; symbols defined in pass 1 as absolute values relative to 0 (= block origin); must be loaded at the specified origin. In a relocatable assembly, it exists only if an `ORG`/`ORGC` receives an **absolute** value; the loader loads this text as is (addresses relative to RA, with no manipulation). There is no ECS/LCM absolute block. |
| **Zero** | `PROGRAM*` | Block name `0`. Nominal CM/SCM block of a **relocatable** assembly; **local** (inaccessible to other modules). At the end of assembly, undefined **default symbols** are placed at its end. In an absolute program, it exists only if there are default symbols, and it immediately follows the absolute block (also listed as `PROGRAM*`). There is no ECS/LCM zero block. |
| **Literals** | `LITERALS*` | Literal entries; local; **always immediately after the zero block**. The user does not control it (except through `LIT`). There is no ECS/LCM literals block. |
| **User local** | name | Established by `USE name` / `USELCM name`. At the end of assembly, each receives an origin relative to the nominal block, **in order of establishment**. All CM/SCM local blocks are concatenated into a single block for the loader (name unique to the module); likewise for the ECS/LCM local blocks. |
| **Named common** | `/name/` | Presettable area shared between relocatable modules. `USE /name/` (CM) or `USELCM /name/` (LCM). The first loaded module that declares it sets its maximum size. In an **absolute program**, `USE /name/` creates a **local** block named `/name/`. |
| **Blank common** | `//` | Not presettable (the loader loads nothing into it). `USE //` (CM) / `USELCM //` (LCM). Allocated by the loader after all modules are loaded, at the largest declared size. Only `BSS` and `ORG` may follow (`BSSZ` is illegal). Data in blank common → error **R**. In an absolute program: local block named `//`, data allowed. |

Additional details (`USE`, ch. 4 §4.5.1):

- `USE 0` or blank `USE`: nominal block. `USE *`: the block in use before
  the current USE/USELCM/ORG/ORGC (stack).
- Local block name: 1 to 8 characters, no blank or comma, first
  character ≠ `:`. `USE A` and `USE /A/` are different blocks.
- Common name: at most 7 characters, no blank or comma, first and last
  characters ≠ `:`.
- `/0/` (common) coexists with block `0`; `//` (blank) coexists with a
  named common `////` [OCR].
- **Redundant names** (CPU): two blocks with the same name and the same
  memory can coexist if they are of different types (local/common); with
  the same name and the same type if they are in different memories
  (CM/LCM) → up to **4 blocks** with the same name. Block key = (name,
  local|common, CM|LCM).
- `USELCM`: CPU only.
- The length of each ECS/LCM block (including the combined local block)
  is **rounded up to a multiple of 8 words**; maximum size of an ECS/LCM
  block: **1 048 568 words**.
- Block summary in the listing (option B): `BLOCKS TYPE ADDRESS LENGTH`,
  types `ABSOLUTE` (any block of an absolute assembly), `LOCAL` (relative
  to the origin of the zero block), `COMMON` (relative to the origin of the
  common), prefix `+` for an ECS/LCM block (ch. 11).

### 10.3 Block counters (§3.2)

For **each block**, COMPASS keeps three counters, which are restored when
the block is resumed:

- When a block is established: origin = location = 0 in pass 1;
  position = 60 (CPU), 12 (PP) or 16 (PP `CIPPU` long format).
- In pass 2, each local block receives an **initial value** of
  origin/location = its allocated origin.

**Origin counter** (`*O`): relative position of the next word assembled
or reserved in the block. +1 per word assembled or skipped forward, −1 per
word skipped backward. `ORG`, `ORGC`, `BSS` advance it; `ORG`/`ORGC` can
also move it backward or change blocks; `BSS` can decrement it (negative
BSS) without changing blocks.

**Location counter** (`*`, `*L`): normally equal to the origin counter;
used to define symbolic addresses. Incremented together with the origin
counter. `LOC` can make it different (code loaded in one place and
executed elsewhere, or a table numbered from 0); this **does not change**
where the code is placed. In the listing, an address is preceded by `L`
when location ≠ origin.

**Position counter** (`*P`, `$` = *P − 1): bits numbered 59..0 (CPU),
11..0 (12-bit PP), 15..0 (16-bit PP). It is 60/12/16 at the start = the
number of bits **remaining** in the word; decremented by one per bit
assembled; 0 when the word is complete, reset to 60/16/12 at the start of
a new operation (next word). In CPU code, 15-bit and 30-bit instructions
normally give it the values 60, 45, 30, 15. In PP code, the normal value
is 12 (16 for CIPPU long format). `VFD` and `POS` modify this progression.

**Block length**: [AMBIG] the manual speaks sometimes of "the final value
of the origin counters", sometimes of "the maximum value of the origin
counter". Recommendation: length = **maximum value reached** by the
block's origin counter (identical in normal use).

### 10.4 Force upper (§3.2.4)

**CPU.** Before assembling the next instruction, if one of the following
conditions is true, the assembler fills the remaining parcels of the
current word with **no-ops** (`46000B`, 15 bits), sets position = 60 and
increments origin and location:

1. insufficient room in the word for the next instruction or data item;
2. machine instruction or `VFD` with **a symbol or `+` in the location
   field**;
3. instruction `RE`, `WE`, `PS`, `XJ`, `CC`, `CU`, `DM`, `IM` (and `RL`,
   `WL` under NOS and NOS/BE) on CYBER 180/170, CYBER 70 models 71–74,
   6000 series — **can be cancelled by `-` in the location field**;
4. pseudo instruction `END`, `BSS`, `BSSZ`, `DATA`, `DIS`, `CON`,
   `SEGMENT`, `SEG`, `IDENT`, `ORGC`, `LOC`, `ORG` or `MD`.

Force upper **after** assembly (deferred) of: `JP`, `RJ`, unconditional
`EQ`, unconditional `ZR`, `ES` and `MJ` (CYBER 70/76, 7600), `PS` and `XJ`
(CYBER 180/170, 70 models 71–74, 6000), `IM` (CYBER 70 models 72, 73).
This deferred force upper takes place only when the next machine
instruction, or data generation, allocation or binary control pseudo
instruction, is encountered **in the same USE block**; it is cancelled by
a `-` in the location field of that next instruction. Intervening pseudo
instructions that read the counters see the value **before** the force
upper.

("Unconditional EQ" = `EQ` without registers, i.e. `EQ K` ≡ `EQ B0,B0,K`;
"unconditional ZR" = `ZR K` [INFER; details in ch. 8].)

VFD (ch. 4 §4.8.5): symbol in location → force upper, symbol = location
after force upper; `+` → force upper; `-` → COMPASS generates zero bits up
to the next **quarter-word** boundary (15 bits) and the first field starts
there; blank → the first field starts at the current position. If the next
instruction in the block is not a `VFD` with a blank location field and
the last field ends before a quarter-word boundary, zeros are inserted up
to that boundary (not visible in the listing), then the remaining parcels
are filled with no-ops. Consecutive VFDs without location: contiguous
fields, no padding.

**PP.** No force upper. A `+` in the location field is ignored except on
`VFD`; on a `VFD`, `+` or `-` (or a symbol) makes the data start in the
next word.

### 10.5 Relocatable program (§3.3)

- CPU only. Made of one or more separately assembled/compiled modules
  (COMPASS or other languages producing relocatable binary acceptable to
  the loader).
- In memory, the modules occupy contiguous blocks of words; the first word
  of the first block is the **reference address RA**; the total is the
  field length (FL).
- Relocatable modules are assembled **as if starting at address 0**;
  every address becomes a function of RA.
- **A nonblank IDENT without a fixed load address** ⇒ relocatable module.
- At the end of assembly, each local block receives an origin relative to
  the zero block; each block becomes an extension of the zero block.
  Allocation order [INFER from §3.1 and fig. 3-1/3-2]:

```
0                      : zero block (PROGRAM*), length L0
                         including, at the end, 1 word per undefined =S symbol
L0                     : LITERALS*, length Llit
L0+Llit                : 1st user CM local block (order of establishment)
...                    : following local blocks
(LCM) combined LCM local block: LCM local blocks concatenated, origin 0 relative to this block
common /X/, //         : each relative to its own origin (common relocation)
ABSOLUTE*              : absolute addresses relative to RA
```

- **Module length in the listing** = sum of the final values of the origin
  counters of the local blocks, **including** the zero block and the
  literals block, **excluding** the absolute block.
- Linkage: `ENTRY`, `ENTRYC`, `EXT`.
- Relocatable binary: one section per `LCC` pseudo instruction (if any),
  followed by a section containing the loader tables.

### 10.6 Absolute program (§3.4)

- Nonrelocatable code, loaded at fixed addresses (faster loading). CPU
  code is absolute or relocatable; PP code is always absolute.
- COMPASS builds a **memory image**. In pass 2, each block receives an
  origin relative to the absolute block; every relocatable symbol receives
  an absolute address; each block becomes an extension of the absolute
  block. Order (fig. 3-2): `PROGRAM*` (absolute) → `PROGRAM*` (zero
  block, if there are default symbols) → `LITERALS*` (if there are
  literals) → local blocks A, B, C in order of establishment.
- Absolute binary module: **prefix** table (PRFX, `7700B`), **header**
  table, binary image. Possible headers: ASCM (`5000B`), EASCM (`5100B`),
  ACPM (`5300B`), EACPM (`5400B`). The tables are identified in the listing
  by their octal number; formats are in the loader manual (loader spec).
- Amount of binary written at a binary control instruction (`IDENT`,
  `SEGMENT`, `SEG`, `END`):
  - complete block group (IDENT…END or IDENT…IDENT): the image ends at the
    **maximum value of the origin counter of the last block established**
    (last word address);
  - a portion only: the image ends at the **current** value of the origin
    counter.
- `END`, `SEGMENT` and a nonblank `IDENT` terminate an overlay and write an
  **end of section**; `SEGMENT` and `IDENT` write the header information of
  the next overlay.

### 10.7 Absolute overlays (§3.4.1)

- More than one (nonblank) `IDENT`, or `SEGMENT`s, in an absolute program
  ⇒ **one section per overlay**.
- CPU: three levels — main, primary, secondary. Level = **pair of octal
  numbers 0–77B** `(p,s)` given by `IDENT` or `SEGMENT`: `0,0` = main;
  `p≠0, s=0` = primary; `p≠0, s≠0` = secondary. Without explicit levels:
  `0,0` for the first overlay, `1,0` for all following ones. Hierarchy,
  order and coexistence in memory are **not** checked by COMPASS.
- PP overlays: no levels, otherwise similar. PP code at `7774B–7777B` may
  load incorrectly (wraps around to 0000).
- **IDENT-type overlay**: from one `IDENT` to the next (exclusive), or from
  the last `IDENT` to `END`. The first `IDENT` produces the
  identification; a second `IDENT` before `END` produces the image of the
  overlay from the origin of the previous IDENT up to the max. of the
  origin counter of the last block declared (or up to the current origin
  if a SEG/SEGMENT came before), then end of section and identification of
  the next one. **All blocks, including the literals, are completed**; the
  block structure starts over from zero (the same block names can be
  reused, each overlay has its own literals block; USE table and counters
  reset). The origin of an IDENT overlay can fall anywhere in a previous
  overlay (all symbols have received an absolute address). The loader
  control table is loaded below the address given by `ORG`.
- **SEGMENT-type overlay**: from `IDENT` to the first `SEGMENT`, from one
  `SEGMENT` to the next, from the last `SEGMENT` to `END`. At each
  `SEGMENT`: image from the origin of the previous overlay up to the
  **current** value of the origin counter of the current block; end of
  section; identification of the next one. `SEGMENT` **clears neither the
  symbol table nor the USE table**: the current block is incomplete, the
  user must make sure the other blocks are complete; only symbols valid
  for the current block can define the origin of the new overlay; each
  SEGMENT overlay must use **new block names** (a block of a previous
  overlay cannot be resumed). The zero block and the literals block fall
  into the overlay that contains the end of the absolute block.
- **Multiple-entry-point overlays** (§3.4.2): `ENTRY` is allowed in an
  absolute assembly and generates a **5100B overlay table** (control word
  + list of entry points) placed **below the origin of the overlay**, one
  word longer than the number of entries.

### 10.8 Partial binary (§3.4.3)

- Absolute CPU program or overlay containing `SEG`s or `IDENT`s with a
  **blank** variable field: COMPASS writes a **partial section** = the
  binary produced since the previous `IDENT`, `SEGMENT` or `SEG`, **with no
  end of section and no new prefix table**. `SEGMENT`, a nonblank `IDENT`
  or `END` completes the section.
- **SEG**: reduces assembler memory; does not write a complete block
  group: from the first block established in this portion up to the
  origin counter of the current block. Storing data in a block outside the
  current portion → **fatal error** [INFER: R]. The portion containing the
  end of the absolute block contains the literals block. Symbol and USE
  tables are **not** reset.
- **Blank IDENT**: writes all binary accumulated since the previous
  IDENT/SEG/SEGMENT, with no end of section and no `7700B` table. USE
  table and counters are **reset**; each symbol receives an absolute
  address. The blocks of each partial section are allocated as if it were
  a new subprogram (its own absolute block, literals block and local
  blocks); the origin of the new absolute block = last address + 1 of the
  last block of the previous portion. Image: from the origin of the
  absolute block to the max. of the origin counter of the last block (or
  to the current origin if a SEG/SEGMENT already wrote part of the group).
  Block names can be reused (independent blocks). Writing into, or moving
  the origin back into, a partial section already written → **range
  error** [INFER: R].

---

## 11. Character sets (appendix A)

### 11.1 Notes from appendix A

1. "Uppercase/lowercase" refers only to case conversions.
2. Display → ASCII/EBCDIC: the uppercase equivalent is used.
3. ASCII/EBCDIC → display: uppercase and lowercase give the same display
   code.
4. Any ASCII/EBCDIC code not listed → display **55B** (blank).
5. Two display graphics for one code: on the left the **CDC 64-character
   set** (IP CSET = C64.1), on the right the **ASCII 64-character subset**
   (C64.2).
6. **63-character set**: `:` = display **63B**; `%` does not exist
   (ASCII `%` → 55B); display code **00 is undefined**.
7. 12 or more zero bits at the end of a 60-bit word = **end-of-line mark**
   (and not two `:`). Converted to external BCD 1632 / internal BCD 1672
   on 7-track tape in even parity, and converted back to 0000 on read.
8. (External BCD code `00` of `:`) changed to 12 when written to 7-track
   tape in even parity.
9. 11-0 and 11-8-2 are equivalent on read (11-0 is punched).
10. 12-0 and 12-8-2 are equivalent on read (12-0 is punched).
11. 12-8-7 and 11-0 are equivalent on read (12-8-7 is punched) [doubtful
    OCR].
12. 12-8-4 and 12-0 are equivalent on read (12-8-4 is punched) [doubtful
    OCR].
13. `CODE` pseudo instruction: `A` ASCII (6-bit subset), `D` display
    (default), `E` external BCD, `I` internal BCD (plus `N` 8-bit ASCII and
    `O` "other", ch. 4).

### 11.2 Complete table

Columns: display code (octal); CDC 64 graphic; ASCII equivalent (64
subset); Hollerith 026 punch; **external BCD** (`CODE E`); **internal
BCD** (`CODE I`); ASCII (hex); **6-bit ASCII** (`CODE A`, octal); ASCII
029 punch.

Rule verified over the whole table: **6-bit ASCII = ASCII code − 40B**
(e.g. `O` = 4Fh → 57B). The BCD values were reconstructed from the OCR of
appendix A and of the reference card, and checked against the BCD
construction rules (zone 12 → 6x/7x external, 2x/3x internal; zone 11 →
4x/5x; zone 0 → 2x/3x external, 6x/7x internal; digit 0 = 12B external, 00
internal; blank = 20B external, 60B internal) and against the manual's
`CODE` example (`OUTPUT` → E: `46 24 23 47 24 23`, I: `46 64 63 47 64
63`, A: `57 65 64 60 65 64`).

| Display | CDC | ASCII | 026 | Ext. BCD (E) | Int. BCD (I) | ASCII hex | 6-bit ASCII (A) | 029 |
|---|---|---|---|---|---|---|---|---|
| 00 | `:` (64 set) | `:` | 8-2 | 00 (note 8) | 12 [INFER] | 3A | 32 | 8-2 |
| 01 | A | A | 12-1 | 61 | 21 | 41 | 41 | 12-1 |
| 02 | B | B | 12-2 | 62 | 22 | 42 | 42 | 12-2 |
| 03 | C | C | 12-3 | 63 | 23 | 43 | 43 | 12-3 |
| 04 | D | D | 12-4 | 64 | 24 | 44 | 44 | 12-4 |
| 05 | E | E | 12-5 | 65 | 25 | 45 | 45 | 12-5 |
| 06 | F | F | 12-6 | 66 | 26 | 46 | 46 | 12-6 |
| 07 | G | G | 12-7 | 67 | 27 | 47 | 47 | 12-7 |
| 10 | H | H | 12-8 | 70 | 30 | 48 | 50 | 12-8 |
| 11 | I | I | 12-9 | 71 | 31 | 49 | 51 | 12-9 |
| 12 | J | J | 11-1 | 41 | 41 | 4A | 52 | 11-1 |
| 13 | K | K | 11-2 | 42 | 42 | 4B | 53 | 11-2 |
| 14 | L | L | 11-3 | 43 | 43 | 4C | 54 | 11-3 |
| 15 | M | M | 11-4 | 44 | 44 | 4D | 55 | 11-4 |
| 16 | N | N | 11-5 | 45 | 45 | 4E | 56 | 11-5 |
| 17 | O | O | 11-6 | 46 | 46 | 4F | 57 | 11-6 |
| 20 | P | P | 11-7 | 47 | 47 | 50 | 60 | 11-7 |
| 21 | Q | Q | 11-8 | 50 | 50 | 51 | 61 | 11-8 |
| 22 | R | R | 11-9 | 51 | 51 | 52 | 62 | 11-9 |
| 23 | S | S | 0-2 | 22 | 62 | 53 | 63 | 0-2 |
| 24 | T | T | 0-3 | 23 | 63 | 54 | 64 | 0-3 |
| 25 | U | U | 0-4 | 24 | 64 | 55 | 65 | 0-4 |
| 26 | V | V | 0-5 | 25 | 65 | 56 | 66 | 0-5 |
| 27 | W | W | 0-6 | 26 | 66 | 57 | 67 | 0-6 |
| 30 | X | X | 0-7 | 27 | 67 | 58 | 70 | 0-7 |
| 31 | Y | Y | 0-8 | 30 | 70 | 59 | 71 | 0-8 |
| 32 | Z | Z | 0-9 | 31 | 71 | 5A | 72 | 0-9 |
| 33 | 0 | 0 | 0 | 12 | 00 | 30 | 20 | 0 |
| 34 | 1 | 1 | 1 | 01 | 01 | 31 | 21 | 1 |
| 35 | 2 | 2 | 2 | 02 | 02 | 32 | 22 | 2 |
| 36 | 3 | 3 | 3 | 03 | 03 | 33 | 23 | 3 |
| 37 | 4 | 4 | 4 | 04 | 04 | 34 | 24 | 4 |
| 40 | 5 | 5 | 5 | 05 | 05 | 35 | 25 | 5 |
| 41 | 6 | 6 | 6 | 06 | 06 | 36 | 26 | 6 |
| 42 | 7 | 7 | 7 | 07 | 07 | 37 | 27 | 7 |
| 43 | 8 | 8 | 8 | 10 | 10 | 38 | 30 | 8 |
| 44 | 9 | 9 | 9 | 11 | 11 | 39 | 31 | 9 |
| 45 | + | + | 12 | 60 | 20 | 2B | 13 | 12-8-6 |
| 46 | - | - | 11 | 40 | 40 | 2D | 15 | 11 |
| 47 | * | * | 11-8-4 | 54 | 54 | 2A | 12 | 11-8-4 |
| 50 | / | / | 0-1 | 21 | 61 | 2F | 17 | 0-1 |
| 51 | ( | ( | 0-8-4 | 34 | 74 | 28 | 10 | 12-8-5 |
| 52 | ) | ) | 12-8-4 | 74 | 34 | 29 | 11 | 11-8-5 |
| 53 | $ | $ | 11-8-3 | 53 | 53 | 24 | 04 | 11-8-3 |
| 54 | = | = | 8-3 | 13 | 13 | 3D | 35 | 8-6 |
| 55 | blank | blank | (none) | 20 | 60 | 20 | 00 | (none) |
| 56 | , | , | 0-8-3 | 33 | 73 | 2C | 14 | 0-8-3 |
| 57 | . | . | 12-8-3 | 73 | 33 | 2E | 16 | 12-8-3 |
| 60 | ≡ | # | 0-8-6 | 36 | 76 | 23 | 03 | 8-3 |
| 61 | [ | [ | 8-7 | 17 | 17 | 5B | 73 | 12-8-2 |
| 62 | ] | ] | 0-8-2 | 32 | 72 | 5D | 75 | 11-8-2 |
| 63 | % (64 set) / `:` (63 set) | % | 8-6 | 16 | 16 | 25 | 05 | 0-8-4 |
| 64 | ≠ | " | 8-4 | 14 | 14 | 22 | 02 | 8-7 |
| 65 | → | _ | 0-8-5 | 35 | 75 | 5F | 77 | 0-8-5 |
| 66 | ∨ | ! | 11-0 | 52 | 52 | 21 | 01 | 12-8-7 |
| 67 | ∧ | & | 0-8-7 | 37 | 77 | 26 | 06 | 12 |
| 70 | ↑ | ' | 11-8-5 | 55 | 55 | 27 | 07 | 8-5 |
| 71 | ↓ | ? | 11-8-6 | 56 | 56 | 3F | 37 | 0-8-7 |
| 72 | < | < | 12-0 | 72 | 32 | 3C | 34 | 12-8-4 |
| 73 | > | > | 11-8-7 | 57 | 57 | 3E | 36 | 0-8-6 |
| 74 | ≤ | @ | 8-5 | 15 | 15 | 40 | 40 | 8-4 |
| 75 | ≥ | \ | 12-8-5 | 75 | 35 | 5C | 74 | 0-8-2 |
| 76 | ¬ | ^ | 12-8-6 | 76 | 36 | 5E | 76 | 11-8-7 |
| 77 | ; | ; | 12-8-7 | 77 | 37 | 3B | 33 | 11-8-6 |

Points of the table to watch (OCR): internal BCD of `:` (12B, inferred
from the 8-2 punch);
029 punches of 66B/67B; the appendix's lowercase ASCII and EBCDIC columns
(not needed by the assembler, omitted).

### 11.3 Reading an ASCII source (JS implementation)

- ASCII → display: use the "ASCII equivalent" column in reverse;
  lowercase a–z → 01–32B; also accept the Unicode CDC graphics (`≡ ≠ →
  ∨ ∧ ↑ ↓ ≤ ≥ ¬`) as aliases; any other character → 55B (blank).
- `:` → **00B** (64 set) or **63B** (63 set); `%` → 63B (64 set) or 55B
  (63 set). Recommendation: option `charset: 64 | 63`, default 64 (the
  manual's main table); NOS is often installed with 63 characters.
- All assembler logic (editing, parsing, constant values) operates on
  **display codes**; conversion to the output code (CODE) takes place when
  a character data item/constant is evaluated.

### 11.4 Generation codes (CODE and CHAR pseudos, ch. 4)

- `CODE D` (default): display. `CODE A`: **6-bit** ASCII (ASCII − 40B).
  `CODE E`: external BCD. `CODE I`: internal BCD. `CODE N`: **8-bit**
  ASCII (default under `CIPPU`; packing outside the scope of this
  document). `CODE O`: "other" code defined by `CHAR`. `CODE *`: returns
  to the previous code (stack of the last **50**; empty stack → display).
  Unknown character → error A.
- `mname CODE c`: redefines micro `mname` as the letter of the previous
  code (`A`, `D`, `E`, `I`, `N`, `O`); if no program or system micro named
  `CODE` is defined, the predefined micro `CODE` takes the letter of the
  new code. The listing shows `c1→c2` (old → new).
- `CHAR exp1,exp2`: in `CODE O` mode, the character with display code
  `exp1` (0–77B) is generated with the value `exp2` (0–77B). Initially,
  "other" = display. E.g. `CHAR 0,63B` then `CHAR 63B,0` swap `:` and
  `%`.
- `BASE` (same chapter) governs the base of numeric data without a radix:
  `D` decimal (default), `O` octal, `M` mixed (decimal for: VFD bit
  counts, IF/ELSE/SKIP line counts, MICRO/OCTMIC/DECMIC character counts,
  B/C/I subfields of REP/REPI, DUP/ECHO counts, character counts, S, scale
  factors, binary point, n of COL, DIS word count, SPACE line count; octal
  otherwise), `*` (stack of 50). Character counts, S, E, P: **always
  decimal** whatever the base.

---

## 12. Error flags (reference, ch. 11 and card)

The flag is printed in the "Error Flags" column to the left of the
offending line (lines in error are always listed). **Letter = fatal
error** (suppresses the binary); **digit = informative warning**. An error
directory ("ERROR DIRECTORY") is printed at the end of the listing:
`x TYPE ERROR  description / OCCURRED ON PAGES …`.

| Flag | Message | Causes (excerpts relevant to this document) |
|---|---|---|
| A | ADDRESS FIELD BAD. | bad subfield; CODE character ≠ A,D,E,I,O,*; BASE character ≠ O,M,D,*; symbol/name > 8 characters; expression that does not reduce to a single external; relocatable terms that do not cancel; absolute expression required; illegal registers; 8/9 in an octal data item; LIT without data; `=S`/`=X`/`=Y` without a symbol; PP relative jump outside −31..31; register in CON; negative relocation on ORG/ORGC; POS < 0 or > word size; missing comma after the DIS word count; illegal entry in IDENT; micro count outside 0..10… |
| D | DOUBLY DEFINED SYMBOL. THE FIRST DEFINITION HOLDS. | symbol already defined or declared external (the OCR of the reference card reads "B") |
| E | ECHO, DUP, RMT, OR MACRO ILLEGALLY NESTED. | definition not entirely contained in the enclosing definition |
| F | NUMBER OF ENTRIES EXCEEDS PERMISSIBLE AMOUNT. | LIT > 100 words; more than 63 parameters+locals; more than 255 blocks; more than 511 externals; missing/bad XTEXT data |
| L | LOCATION FIELD BAD. | bad required location; format 2 macro without a substitutable parameter |
| N | NEGATIVE RELOCATION ON ENTRY POINT. | negative relocatable entry point |
| O | OPERATION FIELD BAD. | unknown operation; out of sequence (ABS or PPU not in the first group of instructions); illegal for the binary mode; bad IF relation; instruction changed/invalid for 810…855 (AIDTEXT) |
| P | CONSULT LISTING FOR REASON BEHIND P-ERROR. | user flag `ERR`/`ERRxx` |
| R | DATA ORIGIN OUTSIDE BLOCK OR IN BLANK COMMON BLOCK. | data in blank common or outside the block limits |
| U | UNDEFINED SYMBOL. VALUE ASSUMED 0. | undefined symbol (including IF line count, DIS count, IF attribute, qualifier) |
| V | BIT COUNT ERROR ON VFD (MUST BE 0 ≤ COUNT ≤ 60). | bad VFD field size |
| 1 | LOCATION SYMBOL BAD. SYMBOL NOT DEFINED. | bad location for an instruction that does not require one |
| 2 | ADDRESS ERROR ON SYMBOL DEFINITION. | bad variable field; location symbol not defined |
| 3 | DUPLICATE MACRO DEFINITION. NEW ONE OVERRIDES. | macro/opdef/synonym redefining an operation code |
| 4 | BAD FORMAL PARAMETER NAME IGNORED. | repeated or illegal formal parameter |
| 5 | CPU OPERATION SYNTAX INCORRECTLY SPECIFIED. | OPDEF/CPOP/CPSYN/PURGDEF |
| 6 | LOCATION FIELD MEANINGLESS. | bad location, ignored |
| 7 | ADDRESS VALUE EXCEEDS FIELD SIZE, RESULT TRUNCATED. | value > destination field; negative BSS; negative MICRO position/count |
| 8 | MISSING OR EXTRA ADDRESS SUBFIELD. | missing or extra subfield |
| 9 | MICRO SUBSTITUTION ERROR. NO SUBSTITUTION. | unrecognized micro reference |

[INFER] The warnings mentioned without a number in chapters 1–3 (register
truncation `A.10`, definition of a symbol shaped like a register,
truncation of a character constant) belong with flag 7 (truncation); the
definition of a register-shaped symbol has no identifiable number [AMBIG:
use 6 or 7, document the choice].

---

## 13. Appendix D — hints useful to the implementation

- In a macro: `*` comments in column 1 **are not saved**, other comments
  are. `IRP` is faster than `ECHO`/`DUP`. The parameter flags `;A`, `;B`…
  (77B followed by a letter; the 1st parameter becomes the internal mark
  7701B, the 2nd 7702B…) can be written directly. Prefer `.1`, `.2`… to
  local symbols.
- IF: prefer line counts to `ENDIF`; `SKIP` rather than `IF PP`.
- Micros: substitution is costly; `≠≠` for a null substitution.
- `SEG` in absolute programs to reduce memory; `NOREF` for symbols that
  should not appear in the reference table; `QUAL` for all overlays.
- Example program (fig. D-1, NOS): `IDENT EXAMPLE`, `ENTRY BEGIN`,
  `OBUF BSS 301B`, `OUTPUT FILEC OBUF,301B`, `BEGIN SB1 1`, `SB2 B0`,
  `SB3 6`, `MX1 0`, `LOOP SA2 TABLE+B2`, `SB2 B2+B1`, `IX1 X2+X1`,
  `NE B2,B3,LOOP`, `RJ =XCDD`, `SA6 ANS`, `WRITEH OUTPUT,WORDS,LEN`,
  `WRITER OUTPUT`, `ENDRUN`, `TABLE DATA 1` … `DATA 6`,
  `WORDS DATA H* THE ANSWER IS *`, `ANS BSS 1`, `LEN EQU *-WORDS`, `SST`,
  `XTEXT COMCSYS`, `XTEXT COMCWTH`, `XTEXT COMCCIO`, `XTEXT COMCCDD`,
  `END BEGIN`. Language points illustrated: `MX1 0` (15 bits) followed by
  a 30-bit instruction → the remaining parcel is filled with a no-op
  (force upper); the `+` after the octal code marks a relocatable K field;
  `=XCDD` declares CDD a strong external by default; `LEN EQU *-WORDS` is
  absolute (cancelled pair). Code produced: `SB1 1` → `6110000001`,
  `SB2 B0` → `66200`, `SB3 6` → `6130000006`, `MX1 0` → `43100`,
  `SA2 TABLE+B2` → `5122000321 +`, `SB2 B2+B1` → `66221`,
  `IX1 X2+X1` → `36121`, `NE B2,B3,LOOP` → `0523000310 +`,
  `DATA 1` → `00000000000000000001`.

---

## 14. Summary of ambiguities

1. **Continuation after a "terminated statement"** (§2.4): interpreted as
   continuation after a `*` line; otherwise attached to the statement.
2. **Order of concatenation / micros and rescanning** (§3.3): single
   left→right scan, no re-substitution.
3. **Empty C, Z, R, A strings** (§8.1): one zero word (blank for A).
4. **Multiword allocation of A/R** (§8.1): right-justified in
   `ceil(n/cpw)` words.
5. **Rounding of integers with a negative exponent** and **rounding/
   truncation with P** (§8.2).
6. **Hexadecimal > 60 bits** (§8.3).
7. **Ones' complement arithmetic**: production of −0, signed products and
   quotients (§9.3) — to be validated by regression tests against real
   listings.
8. **"Value too large for the field" criterion** (§9.3).
9. **XOR with relocatable terms** (§9.3).
10. **Block length**: maximum vs final value of the origin counter
    (§10.3).
11. **Internal BCD of `:`** and 029 punches of 66B/67B (§11.2).
12. **Warning number** for register-shaped symbols and `A.x` truncation
    (§12).
13. **Letter D vs B** for "doubly defined" (table 11-1: D; OCR of the
    card: B) — use **D**.
14. **Prefix of invented symbols** for LOCAL (`?Wnnnnn`) (§5.7).
