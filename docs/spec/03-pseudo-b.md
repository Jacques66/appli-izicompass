# COMPASS 3 re-implementation spec, part 03-B

## Conditional assembly, error control, listing control, definition operations (XTEXT, RMT/HERE, DUP/ECHO, macros, opdefs), operation code table management, micros

Source: *COMPASS Version 3 Reference Manual*, CDC pub. 60492600 rev. M (1986), sections 4.9 to 4.11 and chapters 5, 6 and 7. Facts were also cross-checked against section 2.1.6 (comment statements), section 2.2 (statement editing), section 10.1 (L/LO/ML/PC/N control statement parameters), section 11.3 (listing format), section 11.7 (error directory), and the pseudo instruction index and summary card.

The source is an OCR text with heavy noise in the coding-form examples. When the text conflicts or is unreadable, this spec marks the point with **[AMBIG]** and gives a best inference. Section 11 collects every ambiguity.

---

## 0. Conventions and shared definitions

### 0.1 Special characters

COMPASS works in CDC 6-bit display code. In this spec:

| Name | CDC graphic | Display code | ASCII-subset graphic (CDC 64-char ASCII subset) | Role |
|---|---|---|---|---|
| micro mark (MM) | `≠` | 64 | `"` | delimits micro references `≠name≠` |
| concatenation mark (CM) | `¬` | 76 | `^` | removed by editing; joins columns, delimits parameter names |
| parameter mark (PM) | `;` | 77 | `;` | first character of the 2-character parameter flag `77xx` in saved definitions |
| blank | ` ` | 55 | ` ` | field separator |

The OCR renders `≠` as `rl`, `;t!`, `#`, `!`, `1'`, `F`, `~`. It renders `¬` as `r+`, `r-`, `r`, `,_`. Use the graphics above; the source encoding chosen for the JS implementation (see the character-set spec) maps them.

**Display code order** is used for character comparisons (IFC) and for parameter-mark indexes: `:`=00 (64-char set), A..Z = 01..32, 0..9 = 33..44, `+`=45, `-`=46, `*`=47, `/`=50, `(`=51, `)`=52, `$`=53, `=`=54, blank=55, `,`=56, `.`=57, `≡`=60, `[`=61, `]`=62, `%`=63, `≠`=64, `_`/`→`=65, `∨`=66, `∧`=67, `↑`=70, `↓`=71, `<`=72, `>`=73, `≤`=74, `≥`=75, `¬`=76, `;`=77. All numbers here are octal.

### 0.2 Statements, comment lines and counting (section 2.1.6, applies everywhere below)

* A **statement** is one source line plus up to 9 continuation lines (`,` in column 1, text from column 2). Continuation lines beyond the ninth, and continuation lines that follow a terminated statement, are comment lines.
* **Asterisk comment line**: `*` in column 1. It is listed. It is **never counted** in any statement count (IF/ELSE/SKIP/DUP/ECHO). It is **never included in a definition** (macro, opdef, DUP, ECHO, RMT); it is dropped at capture time.
* **Blank-29 comment line**: columns 1-29 blank. It is a comments statement with no assembly effect, but it **is counted** in statement counts and **is** saved in definitions. Exception: in a macro/opdef *heading*, see 6.3.
* "Statement count" in this spec always means: the count of statements (not physical lines) that are not asterisk comments.

### 0.3 Statement editing (summary; full rules belong to the statement-editing spec)

Before a statement is interpreted, COMPASS **edits** it:
1. Every CM `¬` is removed. The remaining columns shift left one position per removal.
2. Every pair of micro marks `≠name≠` is replaced by the micro's string (chapter 7 / section 10). The line grows or shrinks.

Editing happens:
* for every statement read from the input or from an expansion, just before interpretation;
* **also for statements skipped by IF/ELSE/SKIP**, which are edited even though they are not assembled (section 2.2). This is how the skipper recognizes `ENDIF`/`ELSE` and their names;
* **not** for statements that are being *captured* into a definition (macro, opdef, DUP, ECHO, RMT). Definitions are saved unedited, with marks, and are edited each time a saved line is assembled.

Editing is never applied to asterisk comment lines.

### 0.4 Names

A *name* (IF sequence name, DUP/ECHO name, RMT name, macro name, micro name) is 1-8 characters, terminated by comma or blank. Names have no value and cannot appear in expressions. The name classes do not conflict with each other or with symbols: a micro, a macro, an IF name and a symbol may all be spelled `ABC`. A qualifier (QUAL) applies to symbols only, never to names (blocks, DUP/ECHO/RMT/macro names, formal parameters).

### 0.5 Error flags (section 11.7)

* **Fatal** errors (letters) suppress binary output unless the D mode option is on: `A` address field bad, `D` doubly defined symbol, `E` ECHO/DUP/RMT/MACRO illegally nested, `F` number of entries exceeds permissible amount, `L` location field bad, `N` negative relocation on entry point, `O` operation field bad, `P` user error (ERR/ERRxx), `R` data origin outside block or in blank common, `U` undefined symbol (value assumed 0), `V` VFD bit count error.
* **Informative** errors (digits): `1` location symbol bad/not defined, `2` address error on symbol definition, `3` duplicate macro definition (new one overrides), `4` bad formal parameter name ignored, `5` CPU operation syntax incorrectly specified, `6` location field meaningless (ignored), `7` address value exceeds field size / negative BSS / negative MICRO position or count, `8` missing or extra address subfield, `9` micro substitution error, no substitution.
* Any line that carries an error flag is always listed (if L is on, and even if L is off: see 3.1).

### 0.6 Expression evaluation conventions used here

* **absolute evaluatable expression**: all symbols already defined (pass 1), result absolute. If base is `M` (mixed), counts are decimal unless stated otherwise.
* Values are 60-bit ones' complement. `+0` and `-0` both exist.

---

## 1. Conditional assembly (section 4.9)

### 1.1 Overview

Conditional pseudo instructions: `IFtype` (`IFCP`, `IFCP6`, `IFCP7`, `IFPP`, `IFPP6`, `IFPP7`), `IFop` (`IFEQ`, `IFNE`, `IFGT`, `IFGE`, `IFLT`, `IFLE`), `IFPL`, `IFMI`, `IF` (attribute test), `IFC` (string compare), `SKIP` (unconditional), `ELSE`, `ENDIF`.

All IF tests are evaluated in **pass one**:
* A relocatable symbol has its value relative to the USE block in which it was defined.
* A symbol declared external has value 0.
* A symbol defined relative to a declared external has its relative value.
* A symbol defined only through an `=S` or `=X` prefix is not defined until the end of the assembly, so IF tests treat it as undefined.

**Implementation note.** Pass 2 must make the same skip decisions as pass 1. Recommended design: pass 1 produces the fully expanded and decided statement stream, and pass 2 consumes it. Do not re-evaluate IFs in pass 2. Only ERRxx (section 2.2) is tested in pass 2.

### 1.2 The skip machine (exact model)

COMPASS does **not** keep a stack of IF nesting. Its state is:

```
assembling                      (default)
skipping { name, count, kind }  name: '' or 1-8 chars; count: integer > 0 or null; kind: IF|SKIP|ELSE
```

A true IF records **nothing**. Nested IFs therefore work only through names or counts; see the rules below and the examples in 1.2.4.

#### 1.2.1 While assembling

| Statement | Action |
|---|---|
| IF-class test (IFtype/IFop/IFPL/IFMI/IF/IFC) whose condition is **true** | No state change. Any count on it is ignored. |
| IF-class test whose condition is **false** | Enter `skipping{name = location name or '', count = fnct or null, kind = IF}`. |
| IF-class test with an evaluation error (undefined symbol, etc.) | Flag the line and do **not** start skipping ("assembly continues with the next instruction"). **[AMBIG]** For IFop the manual also says "the expression value is set to zero"; see 11.1. |
| `SKIP` | Enter `skipping{name, count, kind = SKIP}`. |
| `ELSE` | Enter `skipping{name = ELSE's location name or '', count = ELSE's fnct or null, kind = ELSE}`. |
| `ENDIF` | No effect. It is still a statement, so it counts in any count. |

#### 1.2.2 While skipping

For each subsequent statement S, take S **after editing**, then:

1. If S is an asterisk comment: it is skipped and **not** counted.
2. If S's operation field is `END`: skipping stops, and END is processed normally. This is the only other pseudo looked for during a skip.
3. If S's operation field is `ELSE` and it **terminates** the current skip (rules below): resume assembling with the statement **after** the ELSE. The ELSE's own count is ignored when it resumes assembly. The ELSE line is not counted.
4. Else, if S's operation field is `ENDIF`, `count == null`, and it **terminates** the skip (rules below): resume assembling after the ENDIF.
5. Else S is skipped. If `count != null`, decrement count. When count reaches 0, skipping ends, and the **next** statement is assembled. Every skipped statement decrements the count, including an ENDIF, a non-terminating ELSE, a blank-29 comments line, a macro call (not expanded), and a MACRO header. A skipped statement is **not interpreted**: it is not expanded, defines nothing, and generates nothing.

**Termination rules** (identical text for IFtype, IFop, IFPL/IFMI, IF, IFC, SKIP and ELSE):

| Skip state | ENDIF terminates? | ELSE terminates? |
|---|---|---|
| count given (name irrelevant for ENDIF) | **never**: ENDIF is only counted | ELSE whose name is blank, or equals `state.name` |
| no count, no name | any ENDIF, named or unnamed | only an **unnamed** ELSE; a named ELSE has no effect |
| no count, name N | ENDIF named N, or an unnamed ENDIF | ELSE named N, or an unnamed ELSE |

ENDIF wording in 4.9.1 agrees: a named ENDIF terminates the named IF/SKIP/ELSE "and any unnamed IF, SKIP, or ELSE sequences in effect that are not under line count control".

For a count-controlled skip with a blank name, "ELSE with matching or blank name" reduces to an unnamed ELSE only.

#### 1.2.3 Consequences that must be reproduced

* Statements in a skipped range are not expanded. An `ENDIF` or `ELSE` that would have come from a macro expansion is not seen.
* A macro definition inside a skipped range is not defined. Its header is not recognized, so an `ENDIF`/`ELSE` *inside* the would-be macro body **does** terminate the skip.
* `IRP` sequences inside a macro are expanded when the macro lines are produced (section 7.9), **even if the IF is skipping**. Their generated lines are counted one by one. The manual therefore advises named brackets instead of counts around IRP.
* A count or named range is not bounded by definition levels. If skipping starts inside an expansion and the expansion ends, skipping continues in the enclosing source. **[AMBIG]**: not stated; this is the natural consequence of a single global state.
* Skipped lines are listed only with LIST option `F` (section 3.1). The IF line itself and the terminating ELSE/ENDIF are ordinary listed lines.

#### 1.2.4 Worked examples

```
IF1  IFEQ  X,0          true
       ...
IF2  IFEQ  Y,0          false: skip{IF2}
       ...  (skipped)
IF2  ELSE               terminates (name matches): assemble
       ...
IF2  ENDIF              assembling: no effect
IF1  ELSE               assembling: skip{IF1}
       ...
IF1  ENDIF              terminates
```

Same code with `X≠0`: skip{IF1}. `IF2 ELSE` and `IF2 ENDIF` do not match, so they have no effect. `IF1 ELSE` terminates the skip, the else-part is assembled, and `IF1 ENDIF` has no effect.

Count example (from the manual's MX opdef, 4.9.5):

```
A    SET   VAL
A    SET   A-A/60D*60D
     IFPL  A,3      A<0: skip next 3 (IFEQ, IFLE, SKIP)
     IFEQ  A,0,3    A>0: skip next 3 (IFLE, SKIP, A SET)
     IFLE  VAL,0,1
     SKIP  1
A    SET   A+60D
     VFD   6/43B,3/REG,6/A
```

`IF ...,2 / X / ELSE 1 / Y`: if the IF is true, X is assembled, the ELSE starts skip{count 1}, and Y is skipped. If the IF is false, skip{count 2}: X is skipped (count 1), then the ELSE terminates the skip, and Y is assembled.

### 1.3 Count operand (`fnct`) common rules

* Optional absolute evaluatable expression. With base M it is decimal.
* When fnct is blank, the preceding comma may be omitted (IFop, IFPL/IFMI, IF, IFC).
* fnct symbols not previously defined: `U` error ("an IF statement line count" undefined). **[AMBIG]** The IF is then probably treated as erroneous (no skip).
* fnct = 0: **[AMBIG]**, not stated. Treat 0 as "no count" (consistent with ECHO, where 0 or omitted means an ENDD-terminated range). A negative value: treat as error `A` and no count.

### 1.4 ENDIF (4.9.1)

```
ifname  ENDIF
```
* `ifname`: blank, or the name of an IF/SKIP/ELSE sequence.
* Variable field: none. **[AMBIG]** Probably ignored if present.
* While assembling, or in a count-controlled skip, it only counts as a statement.
* Index note: ENDIF is one of the two pseudos "looked for during IF skipping".

### 1.5 ELSE (4.9.2)

```
ifname  ELSE  fnct
```
* While skipping, it terminates the skip per the 1.2.2 table, and assembly resumes after it. The count is ignored.
* While assembling, it starts a skip with its own name and count. That skip ends on count exhaustion, a "second ELSE for the sequence", or an ENDIF for the sequence (same table).
* An ELSE that would come from a skipped expansion is never seen.

### 1.6 IFtype (4.9.3)

```
ifname  IFtype  fnct
```
The condition depends on the processor type declared by MACHINE / PERIPH / PPU (and CIPPU):

| type | Condition for assembly (literal manual text) |
|---|---|
| `CP` | any CPU assembly (neither PERIPH, PPU nor CIPPU in effect) |
| `CP6` | neither PERIPH nor PPU nor `MACHINE 7` has been specified |
| `CP7` | neither PERIPH nor PPU nor `MACHINE 6` has been specified |
| `PP` | any PPU assembly |
| `PP6` | (PERIPH specified and MACHINE 7 not specified) **or** (PPU and MACHINE 6 both specified) |
| `PP7` | (PPU specified and MACHINE 6 not specified) **or** (PERIPH and MACHINE 7 both specified) |

Notes:
* In a CPU assembly without MACHINE, both IFCP6 and IFCP7 are true (literal reading). This is consistent with section 4.3.2: no MACHINE means all CPU instructions are defined.
* **[AMBIG]**: CIPPU (MACHINE 8 PP) is not covered by PP6/PP7. Literal reading: IFPP true, IFPP6 and IFPP7 false. `MACHINE 8` in a CPU assembly: IFCP6 and IFCP7 both true (literal).

### 1.7 IFop (4.9.4)

```
ifname  IFop  exp1,exp2,fnct        op ∈ EQ NE GT GE LT LE
```
* `EQ`: equal **in all respects**, meaning the same numeric value and the same attributes (both absolute, or both program-relocatable in the same block, or both common relocatable in the same common block, or the same external, etc.).
* `NE`: the logical negation of EQ (value or any attribute differs).
* `GT GE LT LE`: compare values only, with no attribute test.
* For every op, `+0` equals `-0`.
* exp1/exp2 may contain only previously defined symbols. The result may be absolute, relocatable or external. With an undefined symbol: value set to zero, the IF line flagged (`U`), and "assembly continues with the next instruction" **[AMBIG 11.1]**.
* Unknown op letters (e.g. `IFXX`) are an unrecognizable operation: `O` error. "The relational mnemonic on the IF statement is erroneous" is listed under O.

Manual example (PPU): `IFLT *-LOOP,40B` (meaning) assembles `ZJN LOOP` when LOOP is within short-jump range, otherwise `ELSE` gives `NJN *+2 / LJM LOOP`.

### 1.8 IFPL / IFMI (4.9.5)

```
ifname  IFPL  exp,fnct
ifname  IFMI  exp,fnct
```
* IFPL is true if exp ≥ +0, i.e. the sign bit is clear (+0 is plus).
* IFMI is true if exp ≤ -0, i.e. the sign bit is set (-0 is minus).
* exp: previously defined symbols only. The result may be absolute, relocatable or external. With an undefined symbol, the line is flagged and assembly continues with the next instruction (no skip).

### 1.9 IF attribute test (4.9.6)

```
ifname  IF  att,exp,fnct
ifname  IF  -att,exp,fnct        (minus prefix: assemble on the false condition)
```

| att | True when |
|---|---|
| `SET` | the symbol in subfield 2 was defined by SET, MAX, MIN or MICCNT |
| `-SET` | the symbol was defined other than by SET/MAX/MIN/MICCNT |
| `ABS` | the expression reduces to a value that is neither relocatable nor external |
| `-ABS` | the expression reduces to a relocatable or external address |
| `REL` | the expression reduces to a local (program) or common relocatable address |
| `-REL` | not REL |
| `REG` | the expression contains one or more register names (A0-A7, B0-B7, X0-X7) |
| `-REG` | it contains no register name |
| `COM` | the expression reduces to a common relocatable address (blank or labeled common) |
| `-COM` | not COM |
| `EXT` | the expression contains one or more external symbols |
| `-EXT` | it contains no external symbol |
| `LCM` | the expression reduces to an LCM (ECS) address (USELCM block) |
| `-LCM` | not LCM |
| `LOC` | the expression reduces to a program relocatable address |
| `-LOC` | not LOC |
| `DEF` | all symbols in the expression are defined |
| `-DEF` | one or more symbols are undefined |
| `MAC` | the name in subfield 2 is an operation code name (any mnemonic op-table entry: macro, pseudo, PPU mnemonic, OPSYN; see 11.7) |
| `-MAC` | it is not an opcode name |
| `MIC` | the name in subfield 2 is a currently defined micro |
| `-MIC` | it is not |
| `SST` | subfield 2 is a system symbol (defined through SST or in system text) |
| `-SST` | it is not |

(The OCR table is column-shifted. The mapping above follows the order of the att list and of the condition texts, and it is self-consistent.)

Operand rules:
* For `SET`, `-SET`, `SST`, `-SST`: exp must be a **single defined symbol**.
* For `MIC`, `-MIC` (and `MAC`, `-MAC`): exp is a **name**, not evaluated.
* For all other tests, exp is an expression.
* Undefined symbols are allowed only with `DEF`, `-DEF`, `REG`, `-REG`, `EXT`, `-EXT`. With any other att, an undefined symbol sets the value to 0 and flags the line (`U`), and assembly continues with the next statement.
* An unrecognizable att gives a `U` error ("an unrecognizable attribute on an IF statement").

Manual example: `IF COM,OTA,2` where OTA is not yet defined is erroneous.

### 1.10 IFC character string compare (4.9.7)

```
ifname  IFC  op,dstring1dstring2d,fnct
```
* `op`: `EQ` (= `-NE`), `NE` (= `-EQ`), `GT` (= `-LE`), `GE` (= `-LT`), `LT` (= `-GE`), `LE` (= `-GT`).
* `d`: the first character after `op,`. String1 lies between the 1st and 2nd occurrence of d. String2 lies between the 2nd and 3rd occurrence. Then comes an optional `,fnct`. The strings may contain blanks and commas.
* The string text is taken **after editing**, so concatenation and micro references have already been processed. In a macro or ECHO body, each string may be a formal parameter. Substitution happens at expansion, because d characters such as `*` or `/` delimit parameter names (6.5).
* **Comparison**: compare character by character, left to right, by **display-code value**, until an inequality is found or both strings are exhausted. The shorter string is padded with a value lower than any character, so a prefix is less. The relation of the first differing pair decides; if none differs, the strings are equal.
* A missing third delimiter before end of statement is an error (flag; **[AMBIG]** letter, use `A`). The line is not treated as a valid test (no skip).

Manual examples:
```
TEST1  IFC  EQ,$ABC$ABC$,1      true
TEST2  IFC  LT,*AB*ABC*,1       true  (AB < ABC)
TEST3  IFC  GT,XAXX             true  (A > null)
       IFC  -GE,*Z*8*,3         true  (Z=32 < 8=43)
       IFC  EQ,**P2*,1          in a macro: true when P2 is empty
```

### 1.11 SKIP (4.9.8)

```
ifname  SKIP  fnct
```
SKIP unconditionally starts skipping (an IF with no true condition). Its termination rules are the 1.2.2 table.

### 1.12 Listing and references

* LIST option `F` lists every line skipped by IF, IFop, IFC, IFPP, IFCP, SKIP and ELSE.
* With `F` on, symbol references in IF-class statements are recorded in the symbolic reference table. With `F` off, they are not, and a symbol whose only occurrences are in IF statements counts as "nonreferenced" (LIST N).

---

## 2. Error control (section 4.10)

### 2.1 ERR

```
flag  ERR
```
* Unconditionally produces an assembly error on this line. No other effect.
* `flag`: a single alphanumeric character, placed in the error-flag column at the left of the line. It must be one of the letters or digits of 0.5 (fatal letters: A D E F L N O P R U V; informative: 1-9). If it is blank or not one of those, `P` is used. A fatal flag suppresses binary output unless the D mode option is set.
* The variable field is ignored.
* Typical use is inside a macro, under an IF, to reject illegal parameters (`IFC EQ,**P2*,1` then `ERR`).

### 2.2 ERRxx (conditional, tested in pass 2)

```
flag  ERRNG aexp    (synonym ERRMI)   error if the value is negative
flag  ERRNZ aexp                      error if the value is nonzero
flag  ERRPL aexp                      error if the value is positive
flag  ERRZR aexp                      error if the value is zero
```
* `flag`: as for ERR (default P).
* `aexp`: absolute expression. It may not contain external symbols or references to blank common.
* The test is made in **pass 2**, the only conditional evaluated in pass 2. Relocatable addresses take values relative to the **program origin**, not to their block. ERRxx is therefore the only way to detect PPU memory overflow when literals and USE blocks exist. Example: `ERRPL LASTTAG-7777B`.
* **Sign semantics [AMBIG]**: use ones' complement sign-bit semantics like IFPL/IFMI. NG/MI: sign bit set (-0 counts as negative). PL: sign bit clear (+0 counts as positive). ZR: value is +0 or -0. NZ: neither +0 nor -0.

---

## 3. Listing control (section 4.11)

### 3.1 LIST

```
        LIST  p1,p2,...,pn
        LIST  *
        LIST  $
```
* The location field is ignored.
* Each `pi` is a letter (selects the option) or `-letter` (cancels it). Options are separated by commas and terminated by a blank. `$` selects all options.
* **Disabled** (the statement still appears in the listing but has no effect) when the `L` control statement parameter is `L=0`, or when `LO` is given with a value other than `LO=0`.
* **Defaults** (no LIST, `LO` omitted or `LO=0`): `B`, `L`, `N`, `R` selected; all others off. (`LO` with no value selects C, F, G, X and deselects R. `LO=chars`: B, L, N, R toggle off and other letters select. `LO=$$$$` selects all; see the control-statement spec.)
* **`LIST *` stack**: every LIST that is not `*` first pushes the **current** option set onto a stack of at most 50 entries (the oldest entry is discarded when full), then applies its changes. `LIST *` pops the top entry and makes it current. If the stack is empty, it uses the defaults B, L, N, R.

Options:

| Letter | Meaning |
|---|---|
| `A` | List the statements actually assembled. Without A, a line containing CM or micro marks is listed as presented (unedited). With A, such a line is listed **before and after** editing (two lines). A also lists the instructions generated by `R=`. |
| `B` | List binary control statements: SEG, SEGMENT, IDENT, END. (Default on.) |
| `C` | List listing control statements: EJECT, SPACE, TTL, TITLE. A listing statement that causes an eject is printed as the first line of the new page. |
| `D` | Details: 2nd and later lines of DATA and DIS; code assembled remotely (by HERE or END); the literals block; default symbols. |
| `E` | List all iterations of DUP and ECHO expansions. |
| `F` | List IF-skipped lines; record references in IF statements. |
| `G` | List every code-generating line (machine instructions, BSS, BSSZ, CON, DATA, DIS, R=, VFD) regardless of all list controls except L. It also lists all words of DATA (section 2). |
| `L` | Master list control (default on). When cancelled, the long list contains only error-flagged lines, the error directory, and LIST and END statements, whatever else is selected. |
| `M` | List lines generated by calls to non-system macros and opdefs. |
| `N` | List nonreferenced symbols in the reference table (default on). When cancelled, nonsystem symbols with no accumulated reference are omitted. |
| `R` | Accumulate and list references (default on). If R is cancelled at the end of the assembly, no reference table is produced. |
| `S` | List lines generated by calls to system macros and opdefs. |
| `T` | Include SST (system) symbols in the reference table even without references. |
| `X` | List statements from XTEXT, and statements between CTEXT and ENDX. |

**Line listing decision** (normative algorithm, derived from the "all applicable options must be selected" rule):

```
listLine(line):
  if line has an error flag            -> list
  if line is LIST or END               -> list   (even with L off)
  if !L                                -> don't list
  if G && line generates code          -> list
  req = {}
  for each recursion-stack entry the line comes from (innermost to outermost):
     macro/opdef call, user-defined    -> req += M
     macro/opdef call, system-defined  -> req += S
     DUP or ECHO iteration             -> req += E
     remote code (HERE/END assembly)   -> req += D
     XTEXT text                        -> req += X
  if inside CTEXT..ENDX                -> req += X
  if line is IF-skipped                -> req += F
  if line is EJECT/SPACE/TTL/TITLE     -> req += C
  if line is SEG/SEGMENT/IDENT/END     -> req += B
  list iff req ⊆ selected
  (A only changes how a listed edited line appears: two images)
```

Examples (manual): a DUP inside a macro needs M and E. XTEXT inside a system macro needs X and S. Showing edited (¬/≠ removed) external text inside a DUP needs A, X and E.

Even when not listed, lines with errors are listed. For data lines that generate several words (DATA, DIS, BSSZ), only the first word is listed by default; all words are listed with D or G. VFD and CON always list all words. For `R=`, only the pseudo line is listed unless A is on.

### 3.2 EJECT

```
name  EJECT
```
* Advances to a new page and prints the headings.
* `name` becomes the new sub-subtitle (printed in character positions 70-79 of the second heading line). A blank name clears it.
* The variable field is ignored.
* If the EJECT is generated by DUP, ECHO, RMT, XTEXT, or a macro/opdef expansion and the corresponding LIST options are not all selected, it has **no effect except setting the sub-subtitle**.
* The `N` control statement parameter suppresses explicit ejects (from EJECT and TITLE).

### 3.3 SPACE

```
name  SPACE  scnt,rcnt
```
* `name` sets or clears the sub-subtitle (as EJECT).
* `scnt`: absolute expression, the number of blank lines to space (decimal with base M). Omitted or 0: no line is skipped.
* `rcnt`: absolute expression, the number of lines that must remain on the page after spacing (decimal with base M).
* If `scnt + rcnt` exceeds the lines remaining on the page, SPACE acts like EJECT. Either the eject occurs or the spaces are made, never both.
* A SPACE immediately after an EJECT is ignored. When the page is full during spacing, an eject occurs and listing resumes.
* It has the same restriction as EJECT when generated by DUP/ECHO/RMT/XTEXT/macro/opdef without the corresponding options.
* Blank cards also space the listing.

### 3.4 TITLE

```
name  TITLE  string
```
* The **first** TITLE in the subprogram sets the main title printed on every page. It is known from pass 1, so it appears on page 1 even when the IDENT line precedes it (inference).
* Each subsequent TITLE sets the **subtitle** and causes a page eject.
* If no TITLE exists, the variable field of the first IDENT is the title.
* A TITLE with a blank string produces an untitled listing (or clears the subtitle). `name` sets or clears the sub-subtitle.
* String extraction (also used by TTL and CTEXT):
  * Search the columns after the blank that terminates the operation field.
  * If no nonblank character is found before the default comments column (COL pseudo; normally 30), take the characters from (comments column - 1) to the end of the statement.
  * Otherwise, take from the first nonblank character to the end of the statement.
  * In both cases at most 62 characters are kept; the rest is lost.
* TITLE has **no effect** when X is deselected and the TITLE is in XTEXT text or between CTEXT and ENDX.
* All other TITLEs (except the first) eject, even when generated by a macro, unless L is deselected (and subject to the N control parameter).

### 3.5 TTL

```
name  TTL  string
```
* Introduces a new **main** title (same string rules as TITLE) and clears the subtitle.
* It does **not** eject.
* `name` sets or clears the sub-subtitle.

### 3.6 NOREF

```
      NOREF  sym1,sym2,...,symn
```
* The named symbols are omitted from the symbolic reference table.
* If a qualifier is in effect, each symbol is taken as qualified by it, unless an unqualified symbol of that name is defined before the NOREF and the qualified one is not.
* An item may be `/qualifier/`: all symbols with that (nonblank) qualifier are suppressed.
* The location field is ignored.

### 3.7 CTEXT / ENDX

```
name  CTEXT  string
      ENDX
```
* CTEXT sets the "XTEXT flag" for list control. Until ENDX, lines are treated like external text: they are listed, and their symbol references recorded, only if X is selected.
* If X is selected: `name` is a sub-subtitle. A nonblank string becomes a subtitle and causes a page eject; the string starts at the first nonblank after CTEXT or at (comments column - 1), whichever comes first, up to the end or 62 characters. If X is not selected, CTEXT does not affect titling.
* ENDX clears the flag. Listing resumes with the statement after ENDX. ENDX location and variable fields are ignored.

### 3.8 XREF

```
      XREF  string
```
* The first character of the string selects the reference table form:
  * `A`: addresses only, no flags.
  * `B`: page/line and address, with flags.
  * `P`: page and line, with flags.
* Omitted, or no XREF: `P` form.
* The **last** XREF in the subprogram decides the form for the whole subprogram.
* The location field is ignored.

---

## 4. Definition operations: common machinery (chapter 5 introduction)

### 4.1 Kinds

| Kind | Capture | Assembly |
|---|---|---|
| XTEXT | from an external file | immediately after the definition is saved |
| DUP, ECHO | the following source range | immediately, N times |
| RMT | between an RMT pair | later, by HERE or END |
| MACRO, MACROE, OPDEF | header to ENDM | on each call |

Any instruction **except END** may appear in a definition body, including other definitions and calls. A definition nested inside another must be **wholly contained** in its next outer definition; otherwise a fatal `E` error.

### 4.2 Recursion stack

Each request to assemble a saved sequence (XTEXT, DUP/ECHO iteration, RMT assembly, macro or opdef call) pushes an entry on the **recursion stack**. Statements are always read from the top entry. When a definition is exhausted, the entry is popped and reading resumes in the previous source. When the stack is empty, reading continues from the main input.

Maximum nesting is **400** levels. **[AMBIG]** The OCR reads "400". Exceeding it is an error; best inference `F`.

### 4.3 Storage form (informative)

Definitions are saved compressed but otherwise **unedited** (CM and MM kept). Blank compression, in display code:
* one blank = `55`;
* two blanks = `5555`;
* *k* blanks with 3 ≤ k ≤ 64 = the 12-bit byte `00nn` with nn = k-1;
* 65 blanks = `0077 55`; 66 = `0077 5555`; 67 = `0077 0002`; and so on.
* Trailing blanks are kept.
* A colon (00) is stored as `0001`.
* A 12-bit zero byte ends the statement.

A JS implementation may store plain strings. The only observable effects are column positions, which are preserved exactly.

### 4.4 Block and qualifier rules

* XTEXT, DUP, ECHO: code goes to the block in use, and symbols get the qualifier in use, at the time of the pseudo instruction (unless the text itself has USE, USELCM, ORG or QUAL).
* RMT, macros, opdefs: the block and qualifier in effect **when the saved text is assembled** apply (at HERE/END or at the call), not those at definition time.
* Changing block or qualifier per expansion through substitutable parameters works. The manual's example 7, `TAB MACRO BLOCK,KWAL` with `USE BLOCK` / `QUAL KWAL`, expands to `USE ONE` / `QUAL ONE`. **[AMBIG]**: the OCR prose says "not possible"; the example shows it is possible.

### 4.5 Listing of definitions and expansions (section 11.3)

* Lines **read** from a source (including lines being captured into a definition, which are not assembled at that time) are listed at that source's level, subject to 3.1.
* Lines produced by an expansion are listed at level+1, subject to 3.1 (M, S, E, D, X).
* The **sequence field** (columns 73-90 of the listing line) shows the card's sequence columns for main input. For generated lines it shows an identifier, with the recursion level in the right half of the field:

| Source | Identifier |
|---|---|
| macro expansion | the macro name |
| opdef expansion | the operation field of the opdef call (e.g. `SB1`) |
| RMT | `*RMT*` |
| DUP | `*DUP*` |
| ECHO | `*ECHO*` |
| XTEXT | the file name |

Example: `*ECHO  1`, `*ECHO  2`. **[AMBIG]**: exact columns. Put the identifier left-justified in the first 9 columns and the level number in the last 9.
* DUP line: its octal-code field shows the repeat count. DECMIC/OCTMIC lines show the octal value of the expression. SET/MICCNT lines show the symbol value.

---

## 5. XTEXT, RMT/HERE, DUP, ECHO, STOPDUP, ENDD

### 5.1 XTEXT (5.1)

```
file  XTEXT  rname
```
* `file`: the file name. Blank means the file named by the X control statement parameter, or `OLDPL` if none.
* `rname` blank: a sequential file. COMPASS rewinds it and reads the **first section**. An rname given with a sequential file is an error.
* `rname` nonblank: an indexed or random library file (SCOPE 3 indexed, record indexed, UPDATE or MODIFY random PL). The named record/deck is read.
* Text formats:
  * normal text: if the first line has rname starting in column 1, that line is skipped;
  * UPDATE common deck: the `*COMDECK rname` line is skipped;
  * MODIFY: the 7700/7702 tables are skipped;
  * UPDATE/MODIFY directives such as `*IF` are **not** interpreted.
* Reading stops at end of section or at an `END` statement. **[AMBIG]**: the END terminating XTEXT text ends only the XTEXT, not the assembly. Best inference: it is not processed as program END.
* Missing or bad data on the file: `F` error ("data is missing or erroneous on XTEXT file").
* JS mapping: a virtual file system keyed by file name, with optional record name.
* Listing: X option; sequence field = the file name.

### 5.2 RMT (5.2.1)

```
rmtname  RMT        (begin; rmtname optional)
         RMT        (end; location ignored)
```
* Statements between the pair are captured unedited and **not assembled now**. Asterisk comments are dropped.
* The first RMT after a begin always ends the capture; RMT pairs cannot be lexically nested.
* The variable field is ignored. rmtname matters only on the beginning RMT.
* Unlabeled sequences accumulate in order. Labeled sequences are kept under their name. **[AMBIG]**: two RMTs with the same name; best inference: appended to the same named sequence.
* An RMT pair may appear in a macro body. The capture then happens during expansion, so parameters and invented LOCAL symbols are already substituted. Local symbols keep their meaning where the remote code is assembled.
* Nested ("implicit") pairs: if assembling remote text reveals another RMT pair (for example via a macro call in the remote text), that new pair is saved as usual. Remote code generated while END is assembling remote code is **lost**. So to get an inner pair assembled, the outer one must be assembled by HERE so that END can assemble the inner one (and so on per level).

### 5.3 HERE (5.2.2)

```
rmtname  HERE
```
* With rmtname: assemble the named saved sequence now. Without: assemble all saved **unlabeled** sequences (in save order).
* Each saved sequence is assembled once, then discarded.
* A HERE with nothing saved (or no such name) has no effect.
* The variable field is ignored.
* The block is the one in use at HERE (unless the text has USE, USELCM, IDENT or ORG). The qualifier is the one in use at HERE (unless the text has QUAL).
* **END**: before terminating, it assembles all remaining unlabeled remote code. RMT pairs revealed during that are lost. Remaining labeled remote code is discarded **without notice**.
* Listing: remote lines need option D; sequence field `*RMT*`.

### 5.4 DUP (5.3.1)

```
dupname  DUP  rep,fnct
```
* `rep`: absolute evaluatable expression, the number of times the range is assembled (decimal with base M). Null or 0: the range is captured and not assembled (skipped). **[AMBIG]**: an undefined rep is a `U` error; treat it as 0. A very large rep with STOPDUP gives indefinite repetition.
* `fnct`: evaluatable expression, the number of statements in the range (decimal with base M). It counts statements only (0.2). Macro calls and other "recursive" statements in the range count as one statement each, because they are counted before expansion.
* **Range determination** (capture reads the current source; lines are unedited):

| Given | Range ends |
|---|---|
| count | after fnct statements. ENDDs inside are just counted. The name is irrelevant. |
| no count, no name | at the first **unnamed** ENDD (named ENDDs do not end it) |
| no count, name N | at an ENDD named N or an unnamed ENDD (other names: no effect) |

* The terminating ENDD is part of the definition (it is assembled as the last line of each iteration, as a no-op, and listed).
* ENDD matching compares the **unedited** ENDD location field with the **edited** DUP name. `T¬1 DUP` / `T¬1 ENDD` does not match: the DUP's name is `T1` after editing, while the ENDD location field stays `T¬1`.
* Capture does not track nested DUP/ECHO headers; only the rules above apply. Inner unnamed, uncounted DUPs therefore need a named or counted outer range.
* **Iteration**: for i = 1..rep, push an entry that reads the saved lines. Each line is edited and assembled. After the last saved line, the iteration ends. Then check STOPDUP (5.6).
* **Nesting**: an inner DUP/ECHO whose range (count or terminator) extends past the end of the outer definition gives a fatal `E`.
* Listing:
  * The DUP line shows the repeat count.
  * Range lines are listed as read (source).
  * Iterations are listed only with E, sequence field `*DUP*` plus the level.

Example (manual 1): `DUP 5,1` followed by `DATA 1` produces five words of 1.

### 5.5 ECHO (5.3.2)

```
dupname  ECHO  fnct,p1=(list1),p2=(list2),...,pn=(listn)
```
* `fnct`: optional absolute evaluatable count of source statements in the range (decimal with base M). If it is 0 or omitted, **the comma must still be present** (`ECHO ,P=(A,B)`) and the range ends with ENDD. Range rules are identical to DUP (5.4 table). "Recursive" statements are counted before expansion. A count that exceeds the range of an outer DUP/ECHO is a fatal `E`.
* Formal names `pi`:
  * at most **63**, each 1-8 characters, first alphabetic;
  * a name may not be END, LOCAL, ENDD, IRP or ENDM;
  * a repeated name is ignored, and so is a name beginning with a digit (informative `4`);
  * more than 63 names: `F`.
* Separator between `pi` and `(listi)`: conventionally `=`, but any of `+ - * / ( ) $ = , .` is accepted. **[AMBIG]** Parsing: read the name up to the first separator character; if that character is `(` it opens the list; otherwise consume it, then expect `(`. A list not in parentheses: treat it as a single item running up to the next comma or blank.
* `listi`: `a1,a2,...,ak` inside the parentheses.
  * Two consecutive commas give a null item. An explicit zero must be written.
  * An item beginning with `(` extends to its matching `)`. The outer parentheses of such an item are removed when it is substituted. It may contain blanks and commas, and inner parentheses must pair.
  * `()` is a **null list**.
  * The whole variable field ends at the first blank outside parentheses.
* **Iterations** = the length of the **shortest** list. With no parameters, or any null list, there are zero iterations (the range is skipped).
* **Definition-time processing**: before saving, every occurrence of a formal name in the body is replaced by the parameter mark `77xx` (xx = 01 for p1, 02 for p2, ...), using the recognition rules of 6.5. Otherwise the body is saved unedited (CM/MM kept). Asterisk comments are not part of the definition.
* On iteration i, each `77xx` is replaced by the i-th item of list xx. Then the line is edited (¬ removed, micros substituted) and assembled. The user may write `;A`, `;B`, ... directly instead of names (same effect).
* The terminating ENDD is not edited at definition time; the same `T¬1` pitfall applies.
* Nesting example (manual 3):
  ```
        ECHO  ,CM=(X,Y,Z)
        ECHO  2,P1=(A,B,C)
        LDN   CM
        STM   P1
        ENDD
  ```
  This gives `LDN X/STM A/LDN X/STM B/LDN X/STM C`, then the same with Y and with Z. Each outer iteration lists the inner ECHO line and its two captured lines (level 1), the inner iterations (level 2), and then the outer ENDD (level 1).
* ECHO vs IRP: ECHO is not expanded during IF skips, allows several parameters, and can be nested. IRP is faster.

### 5.6 STOPDUP (5.3.3)

```
      STOPDUP
```
* Sets "stop after this iteration" on the **innermost** active DUP/ECHO entry of the recursion stack. This holds even when STOPDUP comes from a macro called inside the DUP range, as in manual example 2.
* The current iteration is completed to the end of the range; then assembly continues with the statement after the range.
* Outside any DUP/ECHO it has no effect. Location and variable fields are ignored.

### 5.7 ENDD (5.3.4)

```
dupname  ENDD
```
* Terminates DUP/ECHO capture per 5.4.
* Inside a count-controlled range it is only counted. Outside any DUP/ECHO range it has no effect (a nil instruction).

---

## 6. Macros (5.4 to 5.4.5, 5.4.8, 5.4.9)

### 6.1 Definition structure

* **Heading**: a `MACRO`/`MACROE` (or `OPDEF`, section 8) statement, optionally followed by one or more `LOCAL` statements. Between the header and the LOCALs only comment lines may appear.
* **Body**: from the first statement that is neither LOCAL nor a comment line. In the heading area, both comment kinds (`*` in column 1, and columns 1-29 blank) are ignored. After the body has started, only asterisk comments are dropped; blank-29 lines are kept.
* **Terminator**: `ENDM`.

### 6.2 MACRO header (5.4.2) and MACROE header (5.4.4)

```
Format one:   mname  MACRO   p1,p2,...,pn        (parameters optional)
Format two:          MACRO   mname,p1,p2,...,pn  (blank location; p1 = location argument; ≥1 parameter required)
              mname  MACROE  p1,...              /          MACROE  mname,p1,...
```
* `mname`: a legal name of 1-8 characters, not END, ENDD, IRP, LOCAL or ENDM.
  * If mname already exists in the mnemonic op table (pseudo instruction, PPU instruction, macro), the new definition **redefines** it: the most recent definition holds, with informative flag `3`.
  * A macro whose name looks like a CPU instruction (e.g. `SB4`) is a mnemonic entry, and it takes precedence over the CPU instruction (chapter 9).
* Parameter list:
  * Separators: `+ - * / ( ) $ = , .` (any of them, with no other meaning). A **blank** ends the list.
  * In format two, any separator may also separate mname from p1.
  * A null parameter (two adjacent separators, or a trailing separator) is ignored.
  * A name beginning with a digit, or a repeated name, is ignored (informative `4`).
  * A name may not be END, IRP, LOCAL, ENDD, ENDM, or a local symbol.
  * Each name is 1-8 characters, first alphabetic.
  * Manual examples: `SUM MACRO X=Y+1+X` gives parameters X, Y. `SUM MACRO X,Y,(Z+X)` gives X, Y, Z. In format two `MACRO X(Y+Z)` is macro X with parameters Y, Z.
* The total of unique parameters plus local symbols must be ≤ 63, otherwise `F`.
* Format two errors: if there is no substitutable parameter (`MACRO ABC`), it is a fatal error (`L`: "the format two macro definition has no substitutable parameters") and the definition is ignored (body skipped to its ENDM). The manual also lists `MACRO ABC,,FP` (null parameter field) and `MACRO ABC,16,FP` (numeric parameter field) as illegal. **[AMBIG]** Best inference: in format two the item immediately after mname must be a legal parameter name; otherwise fatal `L` and the definition is ignored.
* MACROE differs only in the call: parameters are given by keyword (6.8).
* Placement: a definition must precede its calls. A definition nested in another body is not defined until the outer macro is called.

### 6.3 LOCAL (5.4.8)

```
      LOCAL  sym1,sym2,...
```
* Allowed only in a macro or opdef heading. Several LOCAL lines are allowed. The location field is ignored.
* Separators: `+ - * / ( ) $ , .`; a blank ends the list. Null items are ignored.
* Ignored items: a parameter name, a duplicate local, or a name beginning with a digit.
* A local symbol cannot be END, ENDD, ENDM, IRP or LOCAL. It must begin with a letter, but see 6.10 (invented names passed to inner LOCALs are accepted).
* Locals are numbered after the parameters: with n parameters, locals get indexes n+1, n+2, .... Parameters plus locals ≤ 63.
* LOCAL is **not** in the op table. A LOCAL outside a heading is an unrecognized operation (`O`).
* **[AMBIG]**: heading LOCAL lines are not part of the saved body and do not appear in expansions.

### 6.4 Definition capture algorithm (normative)

```
on MACRO/MACROE/OPDEF header H (edited, interpreted):
   parse name/syntax and formal list -> formals[1..n]
   read heading: skip comment lines; collect LOCAL lines -> locals[n+1..m]
   body = []
   open = [ name(H) ]                // edited outer name
   loop: read next statement S from the current source (NOT edited)
      if S is '*' comment            -> drop (list it if appropriate)
      if S.op == 'END'               -> [AMBIG] flag E, close all, process END
      if S.op in {MACRO,MACROE,OPDEF}-> push inner name (format two: first item of the variable
                                         field; OPDEF: location field syntax)
      if S.op == 'ENDM':
          if S.loc blank             -> body += S; end capture (closes all open definitions)
          if S.loc == some open[k]   -> pop open[k..top]; body += S;
                                        if k == 0 (outermost): end capture
          else                       -> body += S (no effect)
          continue
      body += S
   replace formal/local names in every body line by marks (6.5)
   store the definition; add the op table entry (mnemonic for MACRO/MACROE, syntactic for OPDEF)
```
* Op-field and location-field recognition on unedited lines uses the normal field scan on the raw text. An `ENDM` produced only by micro substitution is not seen at capture time.
* `T¬1 MACRO` / `T¬1 ENDM` is an error. The macro is named `T1` (the header was edited), while the ENDM location stays `T¬1` and does not match, so the capture continues.
* A named ENDM terminates the named definition and every unterminated definition inside it. An unnamed ENDM terminates **all** open definitions. Inner definitions therefore need named ENDMs when the outer continues. Manual example:
  ```
  JAY     MACRO  P1,P2,P3
  KAY     MACROE PK1,PK2,PK3,PK4
  JPX/XQ  OPDEF  OP1,OP2,OP3
  KAY     ENDM            terminates KAY and the OPDEF
  JAY     ENDM            terminates JAY
  ```
* An ENDM outside any definition has no effect beyond being counted (a nil instruction). Each expansion ends with its ENDM line, which is listed and assembled as a no-op.
* IF/ELSE/ENDIF/DUP/ECHO/RMT/IRP lines inside the body are **not** acted upon during capture. They are saved.

### 6.5 Recognition of formal names in a body (character-level rule)

Applies to macros, opdefs and ECHO, at definition time.
* **Delimiter set Δ** = `+ - * / ( ) $ = , .` blank `≠` `¬`, plus the beginning and end of the statement image. (The manual list reads "+ - * / ( ) $ = blank , . ≠ or ¬"; the OCR shows `· 1 or r`.)
* Split each body statement (all fields: location, operation, variable **and comments**) into maximal runs of characters not in Δ.
* A run that exactly equals a formal name or a local symbol is replaced by `;` + chr(index), where chr(i) is the display-code character with value i (01=A ... 32=Z, 33='0' ... 77=';').
* Runs that only *contain* a name are untouched: with formal `A`, `ALPHA` is not replaced.
* `¬` is the explicit delimiter for a name otherwise run together: `AX¬P1` → `AX¬;A`. At expansion the parameter is substituted, then editing removes the `¬`, giving the concatenation `AX3`.
* Characters such as `. ( ) : $ =` may appear in user symbols, but they act as delimiters here. Manual example 6: `SA7 Z.ALPHA` with formal Z is substituted, giving a "symbol too long" error.
* A symbol should not begin with a colon (the colon is ignored, with no message).
* The mark is 2 characters; columns are otherwise unchanged (4.3).
* Asterisk comment lines are never scanned (they are not saved).
* Any `;` already in the body is a mark too: `;A` is parameter 1. This is the documented fast-coding trick (example 8, `CON ;A;B...`). Use of `;` in bodies is therefore restricted. **[AMBIG]**: a `;x` whose index exceeds m; best inference: replaced by the null string.

### 6.6 Macro call (5.4.3), MACRO-defined

```
sym  mname  a1,a2,...,an
```
* Operation-field recognition is the mnemonic op-table search on the edited operation field (chapter 9).
* **Actual parameter scan** (the variable field, edited):
  * Parameters are separated by commas and the field ends at the first blank not inside a parenthesized parameter.
  * Two consecutive commas give a null parameter. Missing trailing parameters are null. An explicit zero must be written.
  * A parameter whose **first** character is `(` extends to the **matching** `)` (nesting counted). The outer pair is removed; the enclosed text may contain blanks and commas. If the parameter is the subject of an IRP, it is an *iterative* parameter (6.9); otherwise it is an *embedded* parameter.
  * `(` not in first position has no special meaning: `A(B,C)` is two parameters, `A(B` and `C)`.
  * **[AMBIG]** Text after the matching `)` up to the next comma or blank: append it verbatim to the stripped text. An unmatched `(` extends to the end of the statement; flag `A`.
  * Extra actuals beyond the number of formals: **[AMBIG]**; ignore them silently (or flag `8`).
  * Example: `MESSAGE (=C*PROGRAM ABORT.*)` passes `=C*PROGRAM ABORT.*`.
* **Format one** (name in the location field of MACRO): actual i is substituted for formal i.
  * **Location symbol** on the call: forces the first word of generated code upper; the symbol gets the current location counter value after the force upper, in the current block, with the current qualifier. A location symbol on the definition line that generates the first code gets the same address.
  * No symbol: the call does not change the location or position counters.
  * **[AMBIG]**: `+` or `-` in the call location field follows the normal location-field rules.
* **Format two** (name in the variable field of MACRO): the call's location field text is substituted for p1 (the location argument), and actual i for p(i+1). It has no other significance: no symbol is defined, and no force upper happens because of it. The location argument is at most 8 characters; parentheses have no special meaning there.
* **Substitution**: each mark `;x` (index ≤ n) in each saved line is replaced by the actual text; local marks are replaced by invented symbols (6.10). The text is inserted as is. The spacing (blank runs) between fields stays exactly as in the definition, so later columns shift by len(actual) - len(formal as written).
  * Consequence: a null actual in the variable field moves the comments left. With a column-sensitive empty-variable-field rule, the comments may then be read as a variable field. This must be reproduced.
* Each substituted line is then processed exactly like a source statement: editing (¬ removal, micro substitution with the micros current at that moment), then interpretation. This includes recognition of nested definitions, calls, IFs, DUPs and so on.
* **Micro interaction**: an actual parameter may carry micro marks or a micro name in marks. They are substituted at editing time of the expanded line, not at the call. The call line itself is edited before its actuals are scanned, so micro references written directly in the call are expanded at the call.

### 6.7 Concatenation example (manual 5.4.3 ex. 1, reconstructed)

```
MACK    MACRO  P1,P2
        SX¬P1  P1+1R¬P2     body saved as  SX¬;A  ;A+1R¬;B
        ENDM
        MACK   6,X          expands to SX¬6  6+1R¬X, edited to SX6 6+1RX
```

### 6.8 MACROE call (5.4.5)

```
sym  mname  p1=a1,p2=a2,...
```
* Keyword parameters may come in any order; omitted parameters are null.
* Items are separated by commas and the field ends at a blank. An `ai` beginning with `(` has the same embedded/iterative rule as 6.6.
* **[AMBIG]**: an unknown keyword or a missing `=`: flag `A` and ignore the item. A duplicated keyword: the last one wins.
* Location field: identical to MACRO formats one and two. In format one without a symbol, the force upper is decided by the first code-generating line.
* Manual example:
  ```
  SAM   MACROE A,B,C
        CON  A
        CON  B
        CON  C
        ENDM
        SAM  C=3,A=1,B=2      gives CON 1, CON 2, CON 3
  ```

### 6.9 IRP (5.4.9)

```
      IRP  param     (begin; param must be a formal of this MACRO/MACROE)
      IRP            (end)
```
* The location field is ignored in both forms.
* Processed at **line-production time** of the expansion (before IF skipping looks at the lines). When the producer reaches an `IRP ;x` line, it gathers the lines up to the closing `IRP`.
* It splits actual x (the stripped content of its outer parentheses) at top-level commas into subparameters. **[AMBIG]** A subparameter beginning with `(` also has its outer parentheses removed. A non-parenthesized actual is one subparameter. A **null** actual gives **zero** copies.
* It emits the begin IRP line once, then one copy of the inner lines per subparameter (with `;x` replaced by that subparameter), then the end IRP line once. Expansion then continues after the end IRP.
* Outside the IRP range, `;x` gives the whole stripped actual.
* If param does not occur between the IRPs, the lines are repeated unchanged once per subparameter.
* The IRP lines reach the assembler as nil instructions (listed and counted).
* IRP outside a macro: no effect beyond being counted.
* IRP pairs cannot be nested (inference: the manual offers ECHO when nesting is needed).
* IF-skips across IRP sequences should use names, not counts: the generated count varies and IRP is expanded even when skipping.

Manual example 1:
```
ZAB   MACRO  ARG,B
      IRP    ARG
      SA1    ARG
      SX6    X1+B
      SA6    ARG
      IRP
      ENDM
      ZAB    (X,Y,Z),1     gives 3 x (SA1/SX6/SA6)
```

Manual example 2: `IRP P1 / P1 BSSZ 100B / IRP`, called with a list of tags, assigns a symbol to every 100B words of zeroed storage.

### 6.10 Local symbols: invented names

* On each expansion, for each local of the definition, COMPASS invents a new symbol unique within the subprogram, and substitutes it for each mark of that local (in all fields).
* Format: a special leading character followed by a 6-digit sequence number, starting at 1 and incremented for every invented symbol in the subprogram (the manual shows `?000001` and `?000002`).
  * **[AMBIG]**: the leading character is unreadable in the OCR (it renders as `U`, `u`, `t~`, `tW`, `H`). Best guess: display code 66 `∨` (ASCII `!`).
  * **[AMBIG]**: radix of the digits; assume octal.
  * The listing shows the invented form.
* An invented symbol is qualified if defined under QUAL. It is **not** listed in the symbolic reference table. It is counted in the "invented symbols" assembler statistic.
* **Passing to inner definitions**:
  * Substitution of outer marks applies to the whole outer body, including the text of inner MACRO definitions. A local of the outer macro is therefore visible in an inner macro that does not itself declare it LOCAL (manual example 1, `ABC`/`XYZ`).
  * If the inner macro declares the same name LOCAL, the outer expansion has already replaced it, in the inner LOCAL statement too, by the outer invented name. The inner LOCAL then declares that invented name local, and each inner expansion gets a fresh symbol, so the name is local to each level (manual example 2, `BCD`/`YZA`).
  * Invented names are therefore accepted in LOCAL lists.

### 6.11 Inner-definition capture during an expansion

When an expansion produces a MACRO/OPDEF/DUP/ECHO/RMT header, the inner capture reads the following produced lines. These lines have outer marks already substituted but are **not edited**. Inner editing happens when the inner definition is later assembled.

### 6.12 Limits and errors summary (macros, opdefs)

* Parameters plus locals > 63: `F`.
* Bad or duplicate formal: `4` (ignored).
* Redefinition of an existing op: `3`.
* Format two with no parameters: `L`.
* Recursion deeper than 400: error (`F` assumed).
* A definition not wholly inside its outer definition: `E`.
* Recursion of a macro calling itself is allowed (it is bounded only by the stack). Use IF to stop it.

---

## 7. System macros and opdefs (5.5)

* System definitions come from the system text (S/G control statement parameters; SYSTEXT, etc.) or from XTEXT files. They are available at the start of every assembly, like built-ins.
* Their expansions are listed only with LIST `S`.
* All micros and opcodes in a system text overlay are defined at the start of each assembly.
* User macros are distinguished from system ones only for listing (M vs S) and precedence (9.3).

---

## 8. OPDEF (5.4.6, 5.4.7)

### 8.1 Definition

```
syntax  OPDEF  p1,p2,...
```
* **syntax** (location field) = mnemonic operator (2 characters) followed immediately by 0 to 3 subfield descriptors separated by commas. A blank ends it.
* Mnemonic operator:
  * The first character may be any character except blank.
  * If the second character is `A`, `B` or `X`, it is a **register designator**: the call's operation field must be `cAn`, `cBn` or `cXn` (c = the first character, n = 0..7), and n is captured as a register parameter.
  * Otherwise the call's operation field must be exactly the 2 characters (e.g. `EQ`, `JP`).
* The **22 descriptors** (`r` stands for the letter A, B or X; `Q` stands for an expression):
  ```
  void   r     -r     r+r    -r+r    r*r    -r*r    r/r    -r/r    r-r    -r-r
  Q      rQ    -rQ    r+rQ   -r+rQ   r*rQ   -r*rQ   r/rQ   -r/rQ   r-rQ   -r-rQ
  ```
  Examples of written syntaxes: `JPQ`, `JPBQ` (JP Bn+K), `JPB+BQ`, `JPB,Q`, `JPX/XQ`, `NEB,B,Q`, `LJB-B,A-X,Q`, `BX-X*X`, `SBX+B`, `LXB,X`, `IXX/X`, `SXX+B`, `MXQ`, `RXQ`, `DXX-X`.
  * **[AMBIG]**: `void` = an empty subfield in that position (e.g. a leading null subfield). A syntax with zero descriptors means an empty variable field.
* **Parameters**:
  * One per register designator and per Q, in order of occurrence. The op-field register comes first, if the mnemonic has one; then the variable-field registers and Qs left to right.
  * Same separators and rules as MACRO (`+ - * / ( ) $ = , .`; blank ends; nulls ignored; numeric or duplicate names ignored with `4`; not END, ENDD, ENDM, IRP, LOCAL, or a local).
  * Parameters plus locals ≤ 63.
  * LOCAL lines are allowed after OPDEF.
* Capture, mark replacement and ENDM rules are those of 6.4 and 6.5. The ENDM location may name the syntax.
* An illegal syntax: informative `5` ("CPU operation syntax incorrectly specified"). **[AMBIG]**: the definition is ignored.
* The entry goes in the **syntactic** part of the op table. If the syntax equals an existing CPU instruction or opdef syntax, the new opdef takes precedence. The informative `3` "macro, opdef ... redefines the operation code" probably applies (**[AMBIG]** whether it is issued when overriding a built-in CPU syntax).
* An opdef cannot be deleted. It can be bypassed by a later redefinition or disabled by `PURGDEF` (which also disables what it overrode, see 9.6).
* Opdefs exist only in **CPU** assemblies.

### 8.2 Call matching (normative)

An opdef call is a statement whose operation field was **not** found in the mnemonic search, in a CPU assembly. COMPASS builds its syntax key and searches the syntactic table (newest entry first). The built-in CPU instructions are the oldest entries.

```
key(statement):
  op = edited operation field
  if len(op) >= 3 and op[1] in {A,B,X} and op[2..] is a register number (digit 0-7)
        -> mnem = op[0..1]; regs = [op[2..]]
  elif len(op) == 2 -> mnem = op; regs = []
  else -> no syntactic match
  subfields = variable field split at commas (≤ 3; more -> no match)
  for each subfield s:
     if s == ''                             -> 'void'           [AMBIG]
     neg = s starts with '-' followed by a register designator; if so strip '-'
     if s starts with a register designator R1 (A|B|X + number):
         rest = after R1
         if rest starts with op ∈ {+,-,*,/} followed by a register designator R2:
              d = L1 op L2 ; rest = after R2
         else d = L1
         if rest == ''            -> descriptor (neg?'-':'') + d
         elif rest[0] in {+,-}    -> descriptor (neg?'-':'') + d + 'Q' ; Q text = rest
         else                     -> malformed (no match)
         registers R1[,R2] appended to regs (number part only)
     else                                   -> 'Q' ; Q text = s
  key = mnem + join(descriptors, ',')     e.g. 'SAX+B', 'JPBQ', 'NEB,B,Q'
```

* A register designator is `A`, `B` or `X` followed by a digit 0-7 (end of token), or the `A.expr`, `B.expr`, `X.expr` forms. See the CPU instruction spec for the exact token rules; symbols that look like registers must be written `=Sxx` / `=Xxx`.
* "The mnemonic code, quantity and sequence of registers, arithmetic operators, and expressions (excluding operators within expressions) must match." When Q is combined with registers, the expression in the call must be preceded by `+` or `-`.

  | Syntax | Call | Q form |
  |---|---|---|
  | `JPQ` | `JP K` | not combined |
  | `JPBQ` | `JP Bn+K` | combined |
  | `JPB,Q` | `JP Bn,K` | not combined |
  | `JPX/XQ` | `JP Xn/Xn+K` | combined |

* Only a statement with exactly the defined syntax calls the definition. Manual examples for `SXX+B`: `SX7 X1+B2` matches. These do not: `SX2 X1+` (incomplete), `SX6 A3+X4` (registers interchanged), `SX6 X4+CH` (no register).

### 8.3 Opdef parameter values

* **Register parameters** receive **only the register number text**, not the letter: for `X3` the value is `3`; for `X.DIV` the value is `DIV`. Manual example `IXX/X`: P1=3, P2=4, P3=DIV, with body lines written `PX.P2  X.P2`, `NX.P2  X.P2,B4`, and so on (`.` both delimits the formal and forms `X.n`).
* **Q parameters** receive the expression text. A standalone Q gets the whole subfield (e.g. `-52` in `MX6 -52`).
  * **[AMBIG]**: for a combined Q, best inference is that the value includes the leading sign (`+K`, `-K`), because `-` must survive (`SX6 X1-5`).
* The location field is like a MACRO format-one call: a symbol forces upper and is assigned the location counter after the force upper. The first code-generating line's location symbol gets the same value. Without a symbol, the force upper is decided by the first code-generating line.
* The expansion is listed with M (user) or S (system). The sequence field is the operation field of the call.

Manual example (4.9.5):
```
MXQ   OPDEF  REG,VAL
      LOCAL  A
A     SET    VAL
...
      VFD    6/43B,3/REG,6/A
      ENDM
      MX6    -52          REG=6, VAL=-52
```

Example 2: `JPQ OPDEF P1 / EQ P1 / ENDM` turns every `JP K` (syntax JPQ) into `EQ K`; `JP B1+ALPHA` (JPBQ) is not affected. Example 4: `RXQ OPDEF P1,P2 / AX¬P1 P2 / ENDM` makes `RXi K` assemble as `AXi K`.

---

## 9. Operation code table management (chapter 6)

### 9.1 Structure

At the start of each assembly the table holds:
* the pseudo instructions (except LOCAL);
* the CPU symbolic instructions;
* the CMU instructions;
* the PPU symbolic instructions;
* the system macros and opdefs.

User entries are added by MACRO, MACROE, OPDEF, CPOP, PPOP, OPSYN and CPSYN. They are not preserved between assemblies: the table is rebuilt from the originals for every subprogram. The table holds at most **4123** entries (`F` beyond).

The table has two logical parts:
* **Mnemonic entries** are found by the operation field text. They are: pseudo instructions, macros (MACRO/MACROE), PPU instructions, PPOP entries, OPSYN copies, and CMU instructions except IM.
* **Syntactic entries** are found by syntax key (CPU assemblies only). They are: CPU instructions, CPOP entries, OPDEF entries, CPSYN copies, and CMU IM.

Synonyms can only be made within one part (OPSYN mnemonic, CPSYN syntactic).

### 9.2 Lookup algorithm

```
lookup(statement):
  e = newest active mnemonic entry whose name == operation field
  if e: return e
  if PPU assembly: error O; generate a 24- or 32-bit instruction whose first 12 or 16 bits are zero
  e = newest active syntactic entry whose key == key(statement)   (8.2)
  if e: return e
  error O; generate a 30-bit zero instruction (CPU)
```

### 9.3 Precedence (from highest to lowest)

1. Programmer-created mnemonic entries (macros, MACROE, PPOP, OPSYN).
2. System macros, pseudo instructions, PPU instructions, and CMU instructions other than IM.
3. Programmer-created syntactic entries (OPDEF, CPOP, CPSYN).
4. CPU symbolic instructions and CMU IM.

"Newest first within each part" reproduces this order. Consequence: a macro named `SB4` hides `SB4 A1+ABLE` as a machine instruction (other `SBn` forms still assemble). After `SB4 OPSYN NIL`, `SB4` is still a mnemonic entry; even an OPDEF for that syntax would not be reached. `PURGMAC SB4` restores the machine instruction.

### 9.4 OPSYN (6.1.2)

```
name1  OPSYN  name2
```
* name2 must already be a mnemonic entry (macro, pseudo instruction, PPU instruction). If it is not found: `A` ("a synonymous instruction for OPSYN or CPSYN cannot be located").
* Creates a mnemonic entry name1 that is a **copy** of name2's entry, so later redefinition of name2 does not affect name1.
* If name1 already exists, the new entry takes precedence **without notification**. The old macro is not lost (see PURGMAC). The only limit on the number of synonyms is the table size.
* Example: `CALL OPSYN RJM` makes `CALL =XSUB` assemble as an RJM.

### 9.5 NIL (6.1.3)

```
      NIL
```
* NIL produces no code and has no effect. The location field is ignored: a symbol there is **not defined**.
* Its main use is disabling a macro: `MACK OPSYN NIL`; then `TAG MACK A,A,6,73` does nothing and TAG is not defined.
* NIL cannot be used with CPSYN.
* ENDM, ENDD, ENDIF and IRP act as nil instructions outside their contexts.

### 9.6 PURGMAC (6.1.4) and PURGDEF (6.2.3)

```
      PURGMAC  name1,name2,...
      PURGDEF  sytx
```
* PURGMAC disables, for the rest of the assembly, the mnemonic entries for each name (macro, pseudo instruction, PPU instruction).
* PURGDEF disables syntactic entries for the syntax (opdef, CPOP, CPSYN, or a built-in CPU instruction).
* The location field is ignored.
* **[AMBIG]**: whether PURGMAC removes all entries of the name or only the newest. Sources conflict:
  * the SB4 example (`SB4 OPSYN NIL` then `PURGMAC SB4` "restores normal use of SB4") and the chapter 6 intro ("obsolete entry ... saved so that the table can be reconstructed between assemblies") imply **all**;
  * the OPSYN text ("old macro ... can be restored by purging the new definition with PURGMAC") implies **newest only**.
  * Recommended: PURGMAC disables **all** mnemonic entries for that name, and PURGDEF disables all syntactic entries for the key.
  * The usual idioms work under both readings: `LJMX OPSYN LJM / PURGMAC LJM / LJM MACRO ... / ENDM / ... / LJM OPSYN LJMX`.

### 9.7 PPOP (6.1.1)

```
name  PPOP  ctl,val,type
```
* `name`: 1-8 characters, the mnemonic.
* `ctl` (format):

  | ctl | Format |
  |---|---|
  | 0 | illegal (PPOP ignored) |
  | 1 | 24-bit, 12-bit address, no indexing |
  | 2 | 12-bit, signed relative or absolute address (like UJN) |
  | 3 | 24-bit, 18-bit address (LDC) |
  | 4 | 12-bit, 6-bit address (LDN) |
  | 5 | 24-bit, 12-bit address, optional indexing (LDM) |
  | 6 | 12-bit, signed relative address (SHN) |
  | 7 | 24-bit, 12-bit address, required second field (IAM) |

* `val`: evaluatable expression, the 4-digit octal opcode value (usually only the 2 leftmost digits matter; octal when base is M). Example: `STM PPOP 5,5400B`.
* `type`: 6 restricts the instruction to 6000/170/180/71-74 PPs (error if used in a Model 76 PPU assembly); 7 restricts it to Model 76/7600 PPUs; other or omitted means unrestricted (octal with base M; the comma may be omitted).
* An existing entry of the same name is overridden **without error**.
* Any illegal parameter: the PPOP is ignored with an error flag. **[AMBIG]** OCR "7-type"; it may be `A`.
* Instruction encoding details belong to the PPU spec.

### 9.8 CPOP (6.2.1)

```
sytx  CPOP  ctl,val,reg,type
```
* `sytx`: syntax as for OPDEF (8.1).
* `ctl`:

  | ctl | Format |
  |---|---|
  | 0 | 15-bit |
  | 1 | 30-bit |
  | 2 | 15-bit, force upper before |
  | 3 | 30-bit, force upper before |
  | 4 | 15-bit, force upper after |
  | 5 | 30-bit, force upper after |
  | 6 | 15-bit, force upper before and after |
  | 7 | 30-bit, force upper before and after |

* `val`: evaluatable expression, the 9-bit opcode (`fmi` with i = 0; octal with base M).
* `reg`: 3 octal digits giving, left to right, the source of the i, j, k fields (a 30-bit instruction uses only i and j). Digit meanings:
  * 1 = register number from the operation field;
  * 2 = the second register, or the only register, of the variable field;
  * 3 = the first of two registers in the variable field;
  * 0 = set the field to 0.
  * The expression Q goes into K for 30-bit forms. **[AMBIG]**: Q placement for 15-bit forms (presumably jk).
* `type`: 6 restricts to 6000/170/180/71-74 (error when MACHINE 7); 7 restricts to 7600/76 (error when MACHINE 6); other or omitted means unrestricted.
* It overrides an existing entry. Any illegal parameter: the CPOP is ignored with an error flag (`5` for a bad syntax).
* Manual examples:
  * `SAX+B CPOP 0,530B,132B` defines `SAi Xj+Bk`, so `SA7 X3+B1` gives `53731`.
  * `SXXQ CPOP 1,720B,120B` defines `SXi Xj+K`, so `SX3 X1+3` gives `7231000003`.

### 9.9 CPSYN (6.2.2)

```
sytx1  CPSYN  sytx2
```
* sytx2 must exist (CPU instruction, CPOP, OPDEF or CPSYN). If it does not: `A`.
* Afterwards, an instruction in either syntax produces what sytx2's entry describes (a copy).
* An existing sytx1 entry is overridden without notification. The limit is the table size.
* NIL is not allowed here.

---

## 10. Micros (chapter 7)

### 10.1 Micro substitution

* In every statement except asterisk comments, wherever `≠name≠` appears (any field, including comments, and including skipped lines), the reference (marks included) is replaced by the micro's string **before** the statement is interpreted or examined for syntax.
* A micro may supply a whole statement: example 6 defines `NAM` as ` LOC  SA1 ADDRESS+` and then writes a line `≠NAM≠1`.
* Unknown name: no replacement, the marks and name stay, and informative `9` is flagged.
* A single unpaired mark: left as is, no error.
* Null name (`≠≠`): both marks are deleted, no error.
* **[AMBIG]** Scan rule: scan left to right. The first MM opens a reference and the next MM closes it. The substituted text is **not rescanned**. After an unknown reference, scanning continues after its closing mark.
* Length: if the substituted statement exceeds column 72 of its last line, COMPASS creates up to 9 continuation lines. Each holds columns 2-72, so the statement image is at most 72 + 9×71 = 711 characters. The excess is discarded without notice.
* Columns shift accordingly. This may push the operation or variable field past the comments column, or pull comments into a blank field.
* A line with two or more consecutive colons after editing may print as two lines (an operating-system artifact; may be ignored).
* Listing: without LIST A, the line is shown as before substitution. With A, it is shown before and after.

### 10.2 MICRO

```
micname  MICRO  n1,n2,dstringd
```
* `micname` (1-8 characters) is required. **[AMBIG]**: missing → `L`.
* `n1`: absolute evaluatable expression, the starting character (decimal with base M).
* `n2`: absolute evaluatable expression, the number of characters (decimal with base M).
* `d`: the first character of the third subfield. The string is between it and the next d; it may contain blanks and commas.
* Rules (count the first character after d as character 1):
  * Extract n2 characters starting at n1; stop early at the closing delimiter.
  * If n1 > 0 and n2 is omitted, zero or negative: take everything from n1 to the closing delimiter.
  * If n1 is omitted, zero or negative: the micro is **empty** (n2 and the string are ignored). A reference to it substitutes nothing.
  * n1 or n2 negative: informative `7`.
  * **[AMBIG]**: n1 beyond the string end gives an empty micro. A missing closing delimiter: flag `A` and take the string to the end of the statement.
* The string is taken after editing, so it may be built from other micros. A micro may be redefined; the old value is then inaccessible. A redefinition may reference the old value (`MSG MICRO 1,19,*ALPHANUMERIC ≠MSG≠*`).
* Manual examples:
  * `NAME MICRO 1,19,*ALPHANUMERIC STRING*` gives `ALPHANUMERIC STRING`.
  * `MICKY MICRO 1,,*ALPHANUMERIC STRING*` gives the same.
  * `NAM1 MICRO 1,12,$ALPHANUMERIC$`, `NAM2 MICRO 1,7,X STRINGX` (value ` STRING`), then `NAM3 MICRO 1,,+≠NAM1≠≠NAM2≠+` gives `ALPHANUMERIC STRING`.

### 10.3 DECMIC / OCTMIC

```
micname  DECMIC  aexp,n
micname  OCTMIC  aexp,n
```
* `aexp`: absolute evaluatable expression. `n`: optional absolute count (decimal with base M).
* Convert the value to decimal (DECMIC) or octal (OCTMIC) digits.
  * n omitted or 0: as many digits as the conversion needs, at most 10.
  * Otherwise exactly n digits: more digits are truncated **on the left** (the most significant are dropped); fewer are right-justified with leading zeros.
  * The string is at most 10 characters whatever n is.
  * "All numbers are treated as positive." **[AMBIG]**: for a negative value, convert the magnitude (complement).
* n < 0 or n > 10: `A` ("the micro count is less than zero or greater than ten"); clamp to 10.
* The listing's octal field shows the value of aexp.
* Example: B = 1024 (2000B). `SYMBL DECMIC B,6` gives `001024`; `V1 OCTMIC B,6` gives `002000`. Then `MICRO 1,,*≠SYMBL≠ STORAGE NEEDED*` gives `001024 STORAGE NEEDED`.

### 10.4 MICCNT interplay (4.6.5)

```
sym  MICCNT  mname
```
* `sym` is set (SET-like, redefinable) to the length of micro mname.
* An unknown micro: the symbol is not defined and a warning is issued.
* `IF SET,sym` is true for MICCNT symbols.

### 10.5 Micros defined by BASE / CODE / QUAL

* `mname BASE`, `mname CODE` and `mname QUAL` define micro mname as the **previous** base letter (D, M, O), code letter (A, D, E, I, N, O) or qualifier (0-8 characters).
* They also update the predefined micro of the same name (BASE, CODE, QUAL) **unless** a program or system micro of that name has been defined.
* Details belong to the BASE/CODE/QUAL spec.

### 10.6 Predefined micros (reset at the start of each subprogram assembly)

| Micro | Value |
|---|---|
| `DATE` | 10 characters from the OS: ` yy/mm/dd.` or ` mm/dd/yy.` (a leading blank) |
| `JDATE` | 5 digits `yyddd` (Julian date) |
| `TIME` | 10 characters ` hh.mm.ss.` |
| `BASE` | `D`, `M` or `O`: the current base; initially `D` |
| `CODE` | the current character code letter: `A`, `D`, `E`, `I` (`N` and `O` per CODE pseudo); initially `D` |
| `QUAL` | 0-8 characters: the current qualifier; null for the blank qualifier |
| `SEQUENCE` | 18 characters: columns 73-90 of the first line of the statement most recently read from the **main** input file (unchanged during expansions and XTEXT) |
| `MODLEVEL` | the `ML=` control parameter (≤ 9 characters); default = the JDATE value; may be supplied by a calling compiler |
| `PCOMMENT` | the `PC=` parameter, padded or truncated to exactly 30 characters; default 30 blanks; may be supplied by a calling compiler |

* A user definition overrides a predefined micro until the next assembly. For BASE, CODE and QUAL it also stops the automatic updates (10.5).
* Example: `TITLE PROGRAM ASSEMBLED ON ≠DATE≠ AT ≠TIME≠`.

---

## 11. Ambiguities and best inferences (consolidated)

1. **IF/IFop with an undefined symbol**: the manual says "the expression value is set to zero, the IF instruction is flagged as erroneous, and assembly continues with the next instruction". Inference: flag `U` and do not start a skip.
2. **fnct = 0 on IF/ELSE/SKIP/DUP**: treated as no count.
3. **Skip state across expansion boundaries**: a single global skip state that persists when an expansion ends.
4. **CP6/CP7 with no MACHINE**: both true (literal). CIPPU vs PP6/PP7: false.
5. **ERRxx sign semantics**: sign-bit tests; ZR is true for ±0.
6. **TITLE "comments column minus one"**: taken literally.
7. **IF MAC operand**: a name (like MIC). "Opcode name" means any mnemonic op-table entry. Unverified for syntactic entries.
8. **Recursion stack limit 400**: from OCR; the error letter is not stated (`F` assumed).
9. **Parameter delimiter set**: `+ - * / ( ) $ = blank , . ≠ ¬` (the OCR `· 1 or r` read as `. ≠ ¬`).
10. **Comment lines in definitions**: asterisk lines dropped (section 2.1.6 says "not included in definitions"); blank-29 lines kept and counted.
11. **Heading LOCAL lines**: not part of the expansion.
12. **Format-two MACRO illegal forms**: the item immediately after mname must be a legal name.
13. **Text after a matching `)`** in actual parameters: appended. Unknown keyword or excess actuals: ignored or flagged.
14. **`;x` with an out-of-range index**: replaced by null.
15. **Invented local symbol format**: leading character unreadable (`∨` guessed); 6 digits, octal assumed.
16. **ECHO separator and unparenthesized list parsing**: see 5.5. IRP subparameter parenthesis stripping: assumed.
17. **OPDEF**: `void` meaning; whether a combined Q includes its sign (assumed yes); Q placement for 15-bit CPOP; informative `3` on overriding built-ins.
18. **PURGMAC semantics**: removes all entries for the name (recommended) vs only the newest.
19. **PPOP error letter**: OCR "7"; possibly `A`.
20. **MICRO missing closing delimiter, n1 past the end**: assumed `A` and an empty micro. Micro substitution rescanning: none.
21. **DECMIC/OCTMIC negative values**: magnitude.
22. **XTEXT END**: ends only the XTEXT text.
23. **RMT same-name accumulation**: appended.
24. **Sequence-field layout for expansions**: identifier left half, level right half.
25. **Block/qualifier via parameters (4.4)**: possible, contrary to the OCR prose.
26. **ENDIF with a variable field**: ignored.
27. **ERR flag letters**: the valid set is taken from section 11.7 (A D E F L N O P R U V, 1-9). The summary card OCR shows `B` for doubly defined, but the main table shows `D`.
