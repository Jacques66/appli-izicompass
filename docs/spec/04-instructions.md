# 04 — CPU and PP Symbolic Machine Instructions (COMPASS 3, chapters 8 and 9)

Source: *COMPASS Version 3 Reference Manual*, CDC publication 60492600 rev M (1986), chapter 8
("CPU Symbolic Machine Instructions", pp. 8-1 .. 8-55) and chapter 9 ("PP Symbolic Machine
Instructions", pp. 9-1 .. 9-25). Also used: the instruction index on the inside front cover, the
summary card at the end, §2.5 (register designators), §3.2.4 (forcing upper), §4.3.3/4.3.4 (PPU /
PERIPH `J` option), §4.3.2 (MACHINE), §4.4.5/§4.8.7 (B1=1, B7=1, R=).

The OCR of that manual is noisy. Every value below was cross-checked against the manual's own
"Code Generated" examples where possible. Each item is tagged with its source:

* **[M]**: stated in the manual (an OCR reading that the examples confirm).
* **[M?]**: the OCR is garbled; this is the best reading. The basis is given.
* **[HW]**: not in this manual. It comes from CDC 6600 / 6000 hardware knowledge (6600 Hardware
  Reference Manual 60100000, 6000 Series Computer Systems Reference Manual 60100000/60045000).
  The emulator needs it. Verify it against a hardware manual or DtCyber before relying on it.
* **[INF]**: an inference about assembler behaviour that the manual does not state explicitly.

Notation: all numbers are octal unless suffixed `D`. `B` suffix = octal as in COMPASS. Bit 59 is the MSB of a
60-bit CPU word; bit 11 is the MSB of a 12-bit PP word.

---------------------------------------------------------------------------------------------------

## Part I — CPU

### 1. Instruction formats [M]

```
15-bit (one parcel):            30-bit (two parcels):
 14     9 8  6 5  3 2  0          29     24 23 21 20 18 17                 0
+--------+----+----+----+        +--------+----+----+--------------------+
|   fm   | i  | j  | k  |        |   fm   | i  | j  |         K          |
+--------+----+----+----+        +--------+----+----+--------------------+
```

| Field | Width | Meaning |
|---|---|---|
| fm | 6 | operation code (2 octal digits) |
| fmi | 9 | extended op code, where i is part of the op code (e.g. 010 RJ, 011 RE/RL, 012 WE/WL, 013 XJ/MJ, 014 RX, 015 WX, 016 RI/IB/TB, 017 RO/OB, 030-037 X-branches, 464-467 CMU) |
| i | 3 | register designator (e.g. Ai, Bi, Xi) |
| j | 3 | register designator (e.g. Bj, Xj) |
| k | 3 | register designator (e.g. Xk, Bk) |
| jk | 6 | shift count or mask count (LX/AX jk, MX jk) |
| K | 18 | constant / address / branch target. A negative value is stored as the 18-bit **ones' complement**. |

The octal "code" notation used throughout: `fmijk` (5 digits) for a 15-bit instruction, `fmijK`
(4 digits + 6 digits of K) for a 30-bit instruction. For example, `0400K` = fm 04, i 0, j 0, K.

#### 1.1 Parcel packing [M]

A 60-bit word holds four 15-bit parcels: parcel 0 = bits 59-45, parcel 1 = 44-30, parcel 2 = 29-15,
parcel 3 = 14-0. A 30-bit instruction may start in parcels 0, 1 or 2. Legal arrangements
(Figure 8-3): 15/15/15/15, 30/15/15, 15/30/15, 15/15/30, 30/30.

"Generally, the assembler does not allow a two-parcel instruction to begin in the fourth parcel of a
word." The only exception is the RL/WL block copy under SCOPE 2: COMPASS truncates it to a 15-bit
instruction if it begins in the last parcel and its K field is zero.

Hardware behaviour if a 30-bit instruction does begin in parcel 3 [M]:

* On the 6600 and Cyber 70 Model 74, the CPU takes the first parcel of the current instruction word
  (that is, parcel 0 of the same word supplies the low 15 bits). [M?] The wording is literal OCR.
  Interpretation: the second parcel wraps to parcel 0 of the same word.
* On the 6400, Cyber 70/71-73, Cyber 170 non-7600-type and Cyber 180, this is an error exit.
* On the 7600, Model 76, 175, 176, 740, 750 and 760, the instruction executes as if a fifth parcel of
  zeros existed.

#### 1.2 Position counter [M §3.2.3]

The CPU position counter (`*P`) holds 60, 45, 30 or 15. It counts the bits still free in the current
word.

#### 1.3 Forcing upper [M §3.2.4, §8.1]

**Fill rule.** Before COMPASS assembles an instruction that must start in parcel 0, and after an
instruction that requires the next one to start in parcel 0, it completes the current word as follows:

| Bits remaining in word | Filled with |
|---|---|
| lower 15 | one `NO` = `46000` |
| lower 30 | one 30-bit `SB0 B0+K` = `61000 KKKKKK`. **K value: [INF] 000000, so `6100000000`.** The manual does not print K. Some listings may show `6100046000`; confirm against a real COMPASS listing if possible. |
| lower 45 | `NO` then `SB0 B0+K`, i.e. `46000` + `61000 K` |

Rationale: SB0 is a do-nothing on the 6000 series (it writes to B0, which stays 0).

**Force upper *before* the statement** (the word is filled and the position is set to 60):

1. The next instruction does not fit in the rest of the word: a 30-bit instruction while only 15
   bits remain.
2. A machine instruction (or VFD) has a **location symbol**, or `+` in the location field.
3. The statement is RE, WE, PS, XJ, CC, CU, DM or IM. RL and WL are added under NOS and NOS/BE.
   This applies on Cyber 180, Cyber 170, Cyber 70 Models 71-74 and 6000 targets. A `-` in the
   location field cancels this force upper.
4. Pseudo instructions END, BSS, BSSZ, DATA, DIS, CON, SEGMENT, SEG, IDENT, ORGC, LOC, ORG and MD.
   LIT is not listed. R= always forces upper (§4.8.7), even if it generates nothing.

**Force upper *after* the statement:**

| Instruction | Machine condition |
|---|---|
| JP | all |
| RJ | all |
| unconditional EQ (`EQ K`) | all |
| unconditional ZR (`ZR K`) | all |
| ES | 7600 / Model 76 |
| MJ | 7600 / Model 76 |
| PS | Cyber 180 / 170 / 70 Models 71-74 / 6000 |
| XJ | Cyber 180 / 170 / 70 Models 71-74 / 6000 |
| IM | CMU machines (Cyber 70 Models 72, 73) |
| RL, WL | under NOS and NOS/BE (§8.4.5) |

The force upper after an instruction is **deferred**. It happens when the next machine instruction,
data-generating, storage-allocating or binary-control pseudo instruction appears in the **same USE
block**. A `-` in the location field of that next instruction cancels it. So a pseudo instruction that
reads `*`, `*L` or `*P` between the two still sees the pre-fill values.

[INF] `EQ B0,B0,K`, `EQ Bi,Bi,K` and `ZR B0,K` are not described as unconditional. Only the forms
written `EQ K` / `ZR K` (the encoding `0400K`) are certain to force upper. Treat a register-written form
as conditional, with no force upper.

The location symbol of a machine instruction gets the location counter value *after* any force upper.
For PS and ES, the location field text also becomes the listing sub-subtitle.

In a **PP assembly**, no force upper ever occurs. `+` in the location field is ignored, except on VFD,
where `+` or `-` makes the VFD start a new PP word.

Opdef classification (§6, CPOP/OPDEF `ctl`): 0 = 15-bit, 1 = 30-bit, 2/3 = 15/30 with force upper
before, 4/5 = with force upper after, 6/7 = with both. This mirrors the built-in rules above.

### 2. CPU execution models and functional units

#### 2.1 6600 / 6700 / Cyber 70 Model 74 [M §8.2.1]

* After an exchange jump starts the CPU, instructions issue in order from an **8-word instruction
  stack**. The stack can hold a loop of up to 26 15-bit instructions plus one 30-bit instruction.
* A scoreboard keeps track of reserved units and result registers. An instruction issues when (a) its
  functional unit is not reserved and (b) its result register is not reserved for an earlier result.
  At most one instruction issues per minor cycle (100 ns). Execution starts when both operands are
  available. There is no delay between a producing unit finishing and a waiting unit starting.
* After a branch issues, nothing more issues until the branch completes. The branch unit uses the
  **increment unit** for `JP Bi+K` and the B-register tests 04-07. It uses the **long add unit** for the
  X-register tests 030-037. That time counts as branch time.
* CM read: from the end of increment-unit time to operand-in-X, at least 500 ns (5 minor cycles)
  with no bank conflict.
* Stack behaviour: `JP` voids the stack on 6000/70/170 (not on the 7600/176). `RJ` always voids it.
  Conditional branches 03x-07x do not void the stack.

**Table 8-1. 6000/7600 functional units (6600 column)** [M] and the opcodes each unit runs. The unit
list is from the manual; the opcode-to-unit mapping is from Table 8-5 and the summary card.

| Unit | General function | 6600 opcodes |
|---|---|---|
| Branch | all jumps | 00 PS, 01 RJ, 011/012 RE/WE, 013 XJ, 02 JP, 03x, 04-07 |
| Boolean | transfer, AND, OR, XOR | 10-17 |
| Shift | shifts (left circular, right end-off with sign), normalize, pack, unpack, mask generator | 20-27, 43 |
| Floating Add | SP/DP floating add and subtract | 30-35 |
| Long Add | 60-bit fixed add and subtract | 36, 37 |
| Floating Multiply (two units on the 6600) | SP/DP floating multiply | 40-42 |
| Floating Divide | SP floating divide; population count | 44, 45, 47 |
| Increment (two units on the 6600) | 18-bit ones'-complement add and subtract | 50-77 |
| none | pass | 46 |

**6600 execution times, in minor cycles of 100 ns.** [HW] The rev M manual's Table 8-1 lists only
the general function of each unit, not times. These are the standard 6600 Reference Manual figures.

| Op | Instruction | Unit | Time |
|---|---|---|---|
| 00 | PS | — | stop |
| 01 | RJ K | Branch | 14 |
| 011, 012 | RE, WE | Branch | ECS-dependent |
| 013 | XJ | Branch | exchange (≈ 16 words × major cycle) |
| 02 | JP Bi+K | Branch + Increment | 14 |
| 030-037 | ZR..ID Xj,K | Branch + Long Add | 9 if no branch or the target is in the stack; 14 if the target is out of the stack |
| 04-07 | EQ..LT Bi,Bj,K | Branch + Increment | 8 if no branch or the target is in the stack; 14 if out of the stack |
| 10-17 | BX | Boolean | 3 |
| 20, 21 | LX/AX jk | Shift | 3 |
| 22, 23 | LX/AX Bj,Xk | Shift | 3 |
| 24, 25 | NX, ZX | Shift | 4 |
| 26, 27 | UX, PX | Shift | 3 |
| 30-35 | FX/DX/RX + − | Add | 4 |
| 36, 37 | IX + − | Long Add | 3 |
| 40-42 | FX/RX/DX * | Multiply | 10 |
| 43 | MX | Shift | 3 |
| 44, 45 | FX/RX / | Divide | 29 |
| 46 | NO | — | (issue only) |
| 47 | CX | Divide | 8 |
| 50-77 | SA/SB/SX | Increment | 3. A load delivers Xi at least about 8 cycles after issue; store time is memory-dependent. |

#### 2.2 6200 / 6400 / 6500, Cyber 70/71-73, Cyber 170 low models, Cyber 180 [M §8.2.2]

These have a unified arithmetic unit and execute sequentially. Read-next-instruction (RNI) starts
between the 1st and 2nd instruction of a word. RNI initiation costs 2 minor cycles. At least 8 minor
cycles pass before the next word is available. For timing, add 2 cycles per word, except when the
word starts with a taken jump or an RJ. The manual's worked example totals 47 cycles: jump 13, add 5,
RNI 2, add 5, load / store 12 / 10. Coding advice: put jumps in parcel 0 and loads/stores in the lower
parcels.

#### 2.3 7600 / Model 76 / Cyber 170 175, 176, 740, 750, 760, 865, 875 [M §8.2.3] and 990 [M §8.2.4]

There are nine units (Table 8-2): Boolean (also pack/unpack), Shift (also mask), Normalize, FP Add,
Long Add, FP Multiply, FP Divide, Population Count, Increment. All have 1-clock segmentation except
Multiply (2) and Divide (iterative; a new divide may follow 18 clocks after the previous one).
The 990 adds Compare and Address Control units (Table 8-3).

**Table 8-5. Unit used per instruction** [M?] (rebuilt from the OCR; the columns are 6600 / 7600 /
990).

| Mnemonic | Op | 6600, 6700, 74 | 175/176/740-760, 76, 7600 | 990 |
|---|---|---|---|---|
| AXi | 21, 23 | Shift | Shift | Shift |
| BXi | 10-17 | Boolean | Boolean | Boolean |
| CR, CW | 660, 670 | not supported | not supported | None |
| CXi | 47 | Divide | Pop count | Pop count |
| DF, ID, IR, OR | 03x | Branch | None | Compare |
| DXi + − | 32, 33 | FP Add | FP Add | FP Add |
| DXi * / IXi * | 42 | Multiply | Multiply | Multiply |
| EQ, NE, GE, LT, … | 04-07 | Branch | None | Compare |
| ES | 00 | not supported | None | None |
| FXi + − | 30, 31 | FP Add | FP Add | FP Add |
| FXi * | 40 | Multiply | Multiply | Multiply |
| FXi / | 44 | Divide | Divide | Divide |
| IBj, OBj, RI, RO, TBj | 016, 017 | not supported | None | — |
| IXi + − | 36, 37 | Long Add | Long Add | Long Add |
| JP | 02 | Branch | None | None |
| LXi | 20, 22 | Shift | Shift | Shift |
| MJ | 013 | not supported | None | — |
| MXi | 43 | Shift | Shift | Shift |
| NO | 46 | None | None | None |
| NXi, ZXi | 24, 25 | Shift | Normalize | Normalize |
| PS | 00 | None | not supported | — |
| PXi, UXi | 27, 26 | Shift | Boolean | Boolean |
| RE, WE | 011, 012 | Branch | not supported | — |
| RJ | 010 | Branch | None | None |
| RL, WL | 011, 012 | not supported | None | None |
| RXi + − | 34, 35 | FP Add | FP Add | FP Add |
| RXi * | 41 | Multiply | Multiply | Multiply |
| RXi / | 45 | Divide | Divide | Divide |
| RXj, WXj | 014, 015 | not supported | None | None |
| SAi, SBi, SXi | 5x, 6x, 7x | Increment | Increment | Increment + Address Control |
| XJ | 013 | Branch | not supported | Compare (01300) |
| ZR, NZ, PL, NG, MI | 03x / 04-07 | Branch | None | Compare |

Summary-card functional-unit table [M?], by octal code:

| Unit | Model 74 (6600) | Model 76 (7600) |
|---|---|---|
| Boolean | 10-17 | 10-17, 26, 27 |
| Shift | 20-27, 43 | 20-23, 43 |
| Normalize | — | 24, 25 |
| FP Add | 30-35 | 30-35 |
| Long Add | 36, 37 | 36, 37 |
| FP Multiply | 40-42 | 40-42 |
| FP Divide | 44, 45, 47 | 44, 45 |
| Population | — | 47 |
| Increment | 50-77 | 50-77 |

### 3. Operating registers and data representation

#### 3.1 Registers [M §8.3]

| Registers | Width | Count | Notes |
|---|---|---|---|
| X0-X7 | 60 | 8 | Operand registers. All 60-bit operands start and end in X registers. |
| A0-A7 | 18 | 8 | Address registers. **Setting A1-A5 reads CM[(Ai)] into Xi. Setting A6 or A7 writes Xi to CM[(Ai)].** A0 and X0 have no CM connection (A0 is scratch, and the CM address for block copies; X0 is the ECS/LCM address for block copies). |
| B0-B7 | 18 | 8 | Index registers. **B0 always holds +0.** By convention B1 (or B7) = 1 (see the `B1=1` and `B7=1` pseudo ops, which only affect `R=`). B registers also hold shift counts for pack/normalize and channel numbers for 7600 channel instructions. |

A register is *reserved* from issue to completion of the instruction that targets it. It is free in
the clock after the store into it.

**Address range [HW].** The relative address is 18 bits and is checked against FL (`0 ≤ addr < FL`).
The manual says the lower 15, 16 or 17 bits are used "depending on machine size". If the address is
out of range and exit-mode bit 48 is selected, an error exit occurs. If the bit is not selected, the
reference is suppressed (6000: no store; read result implementation-defined, DtCyber returns
0/unchanged). This needs confirmation.

#### 3.2 Integer arithmetic [M]

* **18-bit ones' complement** in the increment unit (SA/SB/SX) and in JP address formation. The
  adder is subtractive: **the result is −0 (777777) only if −0 is added to −0** (for subtraction
  `a−b`: only if a = −0 and b = +0). Overflow is ignored. Operands taken from Xj are its low 18 bits.
* **60-bit ones' complement** in long add (IX 36/37). If both operands are zero: the result is −0
  only if both are −0, otherwise +0. Overflow is ignored.
* B-register compares (04-07) work on 19 bits. Both operands are sign-extended by one bit, Bj is
  subtracted from Bi, and the sign of the 19-bit result decides. The ordering is: **+0 ≠ −0, +0 > −0**,
  any positive > any negative. Emulate it as a total order where −0 sits just below +0 and above −1.
* X-register zero tests (ZR/NZ) treat **both +0 and −0 (77…77) as zero**.

#### 3.3 Floating-point format [M §8.4.29-8.4.39 and HW]

```
 59  58         48 47                                   0
+---+-------------+--------------------------------------+
| S | biased exp  |  coefficient (48-bit integer)        |
+---+-------------+--------------------------------------+
```

* The value is `C × 2^e`, where C is a 48-bit integer coefficient (the binary point is to the right
  of bit 0). [HW]
* A negative number is the **ones' complement of the whole 60-bit word** of its absolute value.
  So for a negative number, bits 58-48 hold the complemented biased exponent. [HW]
* The exponent is 11 bits, biased by **2000B** (1024D): for a positive number, stored = e + 2000B.
  The range of e is −1777B..+1777B (ones' complement). Unpack yields e as an 11-bit ones' complement
  value sign-extended to 18 bits in Bj. [M]
* **Normalized**: bit 47 differs from bit 59 (the coefficient MSB is significant). [M]
* Special values, by the top 12 bits (sign + exponent) [M]:

  | Top 12 bits (octal) | Meaning |
  |---|---|
  | 3777 | + infinite (overflow) |
  | 4000 | − infinite |
  | 1777 | + indefinite |
  | 6000 | − indefinite |
  | 0000 / 7777 (exponent −1777) | underflow / zero [HW] |

* The IR/OR test on the 6000 (and Models 71-74, Cyber 170 except 176, Cyber 180): only 3777x / 4000x
  are out of range. On the 7600/76/176: 3777x, 4000x, 1777x and 6000x are all out of range, and
  underflow counts as in range. DF/ID: 1777x and 6000x are indefinite everywhere; the coefficient is
  ignored. [M]
* On the 6000, Cyber 70/71-74, 170 and 180, **an error exit occurs when an indefinite or
  out-of-range value is used as an operand** of an arithmetic instruction, if that exit mode is
  selected. On the 7600 the exit occurs when such a value is *produced*. [M]
* Arithmetic results [HW, 6600]: overflow gives infinite (exp 3777); underflow gives zero;
  ∞ ± finite gives ∞; ∞ − ∞ gives indefinite; ∞ × 0 gives indefinite; x / 0 gives ∞; 0 / 0 and ∞ / ∞
  give indefinite; any operation with an indefinite operand gives indefinite. An unnormalized divisor
  gives indefinite or an unspecified result (the manual says divide operands must be normalized).
  Verify these against DtCyber `cpu.c` (floatAdd/floatMultiply/floatDivide).

### 4. COMPASS CPU syntax — general rules [M §2.5, §8.4]

**Register designators:** `An`, `Bn`, `Xn` with n a single digit 0-7, or `A.n`, `B.n`, `X.n` where n
is an integer or symbol. If n > 7, it is truncated to 3 bits with a warning. `A8` and similar are
ordinary symbols. In CPU assemblies, a symbol that looks like a register needs a `=S`, `=X` or `=Y`
prefix. In PP assemblies, register-like names are ordinary symbols.

**Variable-field shapes.**

* 15-bit instructions take `r`, `-r`, `r,r`, `r op r`, `-r op r` (op ∈ `+ - * /`), or `jk`.
* 30-bit instructions take `K`, `r op K` (one expression containing one register term), `r,K` or
  `r,r,K`.

**K evaluation.** K reduces to 18 bits: an absolute value, a relocatable address (program or common),
an external, or a literal address. A negative K is stored as its 18-bit ones' complement.
Example: `SX1 X2-XRAY-1` with XRAY = 407B gives `7212 777367` [M].

**The register term may appear anywhere in the expression, with a `+` sign.** Examples:
`SA2 3+B1` gives 5121000003. `SX0 BNEG+A0+1` gives 70000 K. `SB2 3+B1+6` gives 6121000011 [M].

`+K` and `-K` in the manual describe the sign of the *sum* of the non-register terms. They do not
describe the leading operator.

**Subfield order.** "Unless otherwise noted, subfields can be in any order" (comma-separated
subfields). B-register branches are the exception: there the order is significant.

**Alternative separators.** Subfields may be separated by a blank instead of a comma, and may be
written in the operation field, each preceded by a comma. All of these are identical [M]:

```
UX1 B2,X3    UX1 B2 X3    UX1,B2 X3
EQ B2,B3,K   EQ,B2 B3,K   EQ,B2,B3 K   EQ,B2,B3,K
```

**jk (shift / mask counts).** jk is an absolute expression.

* If the value is in −60D..−0, COMPASS adds 60D.
* If the value is < −60D or > 63D, COMPASS sets a warning and uses the low 6 bits. The per-instruction
  text says "type 7 error" for < −60.
* Therefore `LX1 -12B` gives jk = 60D−10D = 50D = 62B [M: `LX3 -12B` gives 20362].
* [INF] `-0` (if the expression evaluator produces ones'-complement −0) gives 60D.

**B1=1 / B7=1.** These do **not** change ordinary instruction encoding. They only make `R= reg,exp`
emit `B1`, `B1+B1` or `-B1` (or the B7 equivalents) for exp = 1, 2 or −1. `R=` with exp = 0 emits B0.
With exp equal to reg, `R=` emits nothing. COMPASS never optimizes `SX6 0` into a 15-bit form by
itself. [M §4.8.7] [INF]

**MACHINE pseudo [M §4.3.2].**

* `MACHINE 6` makes 7600-only mnemonics undefined.
* `MACHINE 7` makes 6000/170/180-only mnemonics undefined, except PS.
* `MACHINE 8` restricts to models 8xx/990.
* With MACHINE omitted, all CPU instructions are defined.
* `S=AIDTEXT` flags instructions that are invalid on 8xx/990 with a type O error.
* A wrong-machine instruction assembles anyway ("will execute properly on the noted machine only").

---------------------------------------------------------------------------------------------------

### 5. CPU master opcode table

Len = length in bits. Forms are listed exactly as COMPASS accepts them. "Model" refers to §9
(Table 8-4).

| Octal | Len | Mnemonic and forms | Operation |
|---|---|---|---|
| 00000 00000 | 30 | `PS` | program stop / exchange to MA |
| 0000K | 30 | `PS K` | same, with K in the low 18 bits |
| 00000 | 15 | `ES` / `ES K` (K ignored; i, j, k = 0) | error exit to EEA (7600) |
| 0100K | 30 | `RJ K` | return jump |
| 011j0 00000 | 30 | `RE Bj` / `RL Bj` | read ECS/UEM, LCM block (Bj words) |
| 0110K | 30 | `RE K` / `RL K` | K words |
| 011jK | 30 | `RE Bj±K` / `RL Bj±K` | (Bj)+K words |
| 012j0 00000, 0120K, 012jK | 30 | `WE` / `WL` with the same three forms | write ECS/UEM, LCM block |
| 01300 00000 | 30 | `XJ` | exchange jump to MA (monitor flag clear) |
| 013j0 00000, 0130K, 013jK | 30 | `XJ Bj`, `XJ K`, `XJ Bj±K` | exchange jump to (Bj)+K (monitor flag set) |
| 01300 | **15** | `MJ` | exchange exit to NEA (7600; exit flag clear) |
| 013j0 00000, 0130K, 013jK | 30 | `MJ Bj`, `MJ K`, `MJ Bj±K` | exchange exit to (Bj)+K (7600; exit flag set) |
| 014jk | 15 | `RXj Xk` | read LCM/UEM word at (Xk) to Xj |
| 015jk | 15 | `WXj Xk` | write Xj to LCM/UEM at (Xk) |
| 0160k | 15 | `RI Bk` | reset input channel (Bk) buffer (7600) |
| 016j0 | 15 | `TBj` / `TBj K` (K ignored) | Bj = real-time clock (7600) |
| 016jk | 15 | `IBj Bk` | Bj = input channel (Bk) buffer address (7600) |
| 0170k | 15 | `RO Bk` | reset output channel (Bk) buffer (7600) |
| 017jk | 15 | `OBj Bk` | Bj = output channel (Bk) status (7600) |
| 02iiK | 30 | `JP Bi±K` (j is set equal to i) | jump to (Bi)+K |
| 02ii0 00000 | 30 | `JP Bi` | jump to (Bi) |
| 0200K | 30 | `JP K` | jump to K |
| 030jK | 30 | `ZR Xj,K` | jump if (Xj) = ±0 |
| 031jK | 30 | `NZ Xj,K` | jump if (Xj) ≠ 0 |
| 032jK | 30 | `PL Xj,K` | jump if bit 59 = 0 |
| 033jK | 30 | `NG Xj,K` = `MI Xj,K` | jump if bit 59 = 1 |
| 034jK | 30 | `IR Xj,K` | jump if in range |
| 035jK | 30 | `OR Xj,K` | jump if out of range |
| 036jK | 30 | `DF Xj,K` | jump if definite |
| 037jK | 30 | `ID Xj,K` | jump if indefinite |
| 0400K | 30 | `EQ K` = `ZR K` | unconditional jump (force upper after) |
| 04i0K | 30 | `EQ Bi,K` = `ZR Bi,K` | jump if (Bi) = +0 |
| 04ijK | 30 | `EQ Bi,Bj,K` | jump if (Bi) = (Bj) |
| 05i0K | 30 | `NE Bi,K` = `NZ Bi,K` | jump if (Bi) ≠ +0 |
| 05ijK | 30 | `NE Bi,Bj,K` | jump if (Bi) ≠ (Bj) |
| 06i0K | 30 | `GE Bi,K` = `PL Bi,K` | jump if (Bi) ≥ +0 |
| 06ijK | 30 | `GE Bi,Bj,K` | jump if (Bi) ≥ (Bj) |
| 06ijK | 30 | `LE Bj,Bi,K` (**written operands reversed**) | jump if (Bj) ≤ (Bi) |
| 060jK | 30 | `LE Bj,K` | jump if (Bj) ≤ +0 |
| 07i0K | 30 | `LT Bi,K` = `NG Bi,K` = `MI Bi,K` | jump if (Bi) < +0 |
| 07ijK | 30 | `LT Bi,Bj,K` | jump if (Bi) < (Bj) |
| 07ijK | 30 | `GT Bj,Bi,K` (**reversed**) | jump if (Bj) > (Bi) |
| 070jK | 30 | `GT Bj,K` | jump if (Bj) > +0 |
| 10ijj | 15 | `BXi Xj` (k is set equal to j) | Xi = Xj |
| 11ijk | 15 | `BXi Xj*Xk` | AND |
| 12ijk | 15 | `BXi Xj+Xk` | OR |
| 13ijk | 15 | `BXi Xj-Xk` | XOR |
| 14ikk | 15 | `BXi -Xk` (j is set equal to k) | Xi = ¬Xk |
| 15ijk | 15 | `BXi -Xk*Xj` | Xj AND ¬Xk |
| 16ijk | 15 | `BXi -Xk+Xj` | Xj OR ¬Xk |
| 17ijk | 15 | `BXi -Xk-Xj` | Xj XOR ¬Xk |
| 20ijk | 15 | `LXi jk` (±jk) | left circular shift of Xi |
| 21ijk | 15 | `AXi jk` (±jk) | right arithmetic shift of Xi |
| 22ijk | 15 | `LXi Bj,Xk`, `LXi Xk,Bj` | Xi = Xk shifted by (Bj), "left" |
| 22i0k | 15 | `LXi Xk` | Xi = Xk (shift by B0) |
| 22iji | 15 | `LXi Bj` | Xi = Xi shifted by (Bj) |
| 22ijk / 22iji | 15 | `AXi -Bj,Xk`, `AXi Xk,-Bj` / `AXi -Bj` | converted to the logical form |
| 23ijk | 15 | `AXi Bj,Xk`, `AXi Xk,Bj` | Xi = Xk shifted by (Bj), "right" |
| 23i0k | 15 | `AXi Xk` | Xi = Xk |
| 23iji | 15 | `AXi Bj` | Xi = Xi shifted by (Bj) |
| 23ijk / 23iji | 15 | `LXi -Bj,Xk`, `LXi Xk,-Bj` / `LXi -Bj` | converted to the arithmetic form |
| 24ijk | 15 | `NXi Bj,Xk`, `NXi Xk,Bj` | normalize Xk to Xi, shift count to Bj |
| 24i0k | 15 | `NXi Xk` | normalize, count discarded (B0) |
| 24iji | 15 | `NXi Bj` | normalize Xi in place, count to Bj |
| 24i0i | 15 | `NXi` | normalize Xi in place |
| 25ijk, 25i0k, 25iji, 25i0i | 15 | `ZXi` with the same forms as NX | round and normalize |
| 26ijk, 26i0k, 26iji, 26i0i | 15 | `UXi` with the same forms (`UXi Bj,Xk`, `UXi Xk,Bj`, `UXi Xk`, `UXi Bj`, `UXi`) | unpack |
| 27ijk, 27i0k, 27iji, 27i0i | 15 | `PXi` with the same forms | pack |
| 30ijk | 15 | `FXi Xj+Xk` | FP sum, unrounded |
| 31ijk | 15 | `FXi Xj-Xk` | FP difference, unrounded |
| 32ijk | 15 | `DXi Xj+Xk` | FP sum, lower (DP) |
| 33ijk | 15 | `DXi Xj-Xk` | FP difference, lower (DP) |
| 34ijk | 15 | `RXi Xj+Xk` | FP sum, rounded |
| 35ijk | 15 | `RXi Xj-Xk` | FP difference, rounded |
| 36ijk | 15 | `IXi Xj+Xk` | 60-bit integer sum |
| 37ijk | 15 | `IXi Xj-Xk` | 60-bit integer difference |
| 40ijk | 15 | `FXi Xj*Xk` | FP product, unrounded |
| 41ijk | 15 | `RXi Xj*Xk` | FP product, rounded |
| 42ijk | 15 | `DXi Xj*Xk` = `IXi Xj*Xk` | DP (lower) product / integer multiply |
| 43ijk | 15 | `MXi jk` (±jk) | form mask |
| 44ijk | 15 | `FXi Xj/Xk` | FP quotient |
| 45ijk | 15 | `RXi Xj/Xk` | FP quotient, rounded |
| 46000 | 15 | `NO` | pass |
| 46n | 15 | `NO n` (n into the low bits; see §6.14) | pass, or a CMU op if n ≥ 400B |
| 4640K, 464jK, 464j0 00000 | 30 | `IM K`, `IM Bj±K`, `IM Bj` | CMU indirect move |
| 465…, 466…, 467… | 60 | `DM`, `CC`, `CU` | CMU (§8) |
| 47ikk | 15 | `CXi Xk` (j is set equal to k) | population count |
| 50ijK | 30 | `SAi Aj±K` | Ai = (Aj)+K |
| 51i0K | 30 | `SAi K` (and `SAi B0±K`) | Ai = K |
| 51ijK | 30 | `SAi Bj±K` | Ai = (Bj)+K |
| 52ijK | 30 | `SAi Xj±K` | Ai = (Xj)+K |
| 53ij0 | 15 | `SAi Xj` | Ai = (Xj) |
| 53ijk | 15 | `SAi Xj+Bk`, `SAi Bk+Xj` | Ai = (Xj)+(Bk) |
| 54ij0 | 15 | `SAi Aj` | Ai = (Aj) |
| 54ijk | 15 | `SAi Aj+Bk`, `SAi Bk+Aj` | Ai = (Aj)+(Bk) |
| 55ijk | 15 | `SAi Aj-Bk`, `SAi -Bk+Aj` | Ai = (Aj)−(Bk) |
| 56ij0 | 15 | `SAi Bj` | Ai = (Bj) |
| 56ijk | 15 | `SAi Bj+Bk` | Ai = (Bj)+(Bk) |
| 57i0k | 15 | `SAi -Bk` | Ai = (B0)−(Bk) |
| 57ijk | 15 | `SAi Bj-Bk`, `SAi -Bk+Bj` | Ai = (Bj)−(Bk) |
| 60-67 | | `SBi …`, with exactly the same forms and layout as 50-57 | result to Bi |
| 660jk | 15 | `CR Xj,Xk` (8xx only; it overlays `SB0 Bj+Bk`) | read CM at (Xk) to Xj |
| 670jk | 15 | `CW Xj,Xk` (8xx only; it overlays `SB0 Bj-Bk`) | write Xj to CM at (Xk) |
| 70-77 | | `SXi …`, with exactly the same forms as 50-57 | result to Xi, sign-extended |

Index footnote [M]: "There is also an integer divide **macro** (`IXi Xj/Xk`)". It is not a machine
instruction; it is defined by a system text. Implement it as a macro if desired.

### 6. CPU instruction details (syntax → encoding → semantics)

#### 6.1 PS — program stop (00) [M §8.4.1]

* `PS` gives `00000 00000` and `PS K` gives `0000K` (both 30 bits). Force upper before and after.
  The location field becomes the listing sub-subtitle.
* **6000 series**: the CPU **halts** at this step. The CEJ/MEJ switch is ignored. An exchange jump
  (from a PP) is needed to restart. Under the OS, the job holds its control point until its time
  limit, then aborts.
* With CEJ/MEJ enabled (Cyber 70/170/180): an exchange jump to MA. On the 175 with CEJ/MEJ disabled:
  illegal.

#### 6.2 ES — error exit (00, 7600 only) [M §8.4.2]

15 bits, `00000`; the assembler sets i, j and k to zero. It sets the program-range condition flag,
which causes an exchange to (EEA). P is stored as P+1 of the current word. Later parcels in the word
are not executed. Force upper after it (7600). On the 6000, `00` is PS (see above).

#### 6.3 RJ — return jump (0100K) [M §8.4.3]

* `RJ K` gives `0100K`; j is set to 0. Force upper after it.
* Execution: **CM[K] = `0400` ‖ (P+1) in bits 59-30, and bits 29-0 = 0.** That is, the word written
  is `EQ B0,B0,P+1` followed by 30 zero bits: `04 0 0 <P+1> 00000 00000`. P+1 is the address of the
  word after the RJ's word. Control then goes to **K+1**. Instructions after RJ in the same word are
  not executed. The stack is voided.
* The subroutine returns with `EQ K` (or `JP K`), which jumps to the word at K.

#### 6.4 RE / WE — ECS/UEM block transfer (011, 012) [M §8.4.4]

* Forms: `RE Bj` gives `011j0 00000`; `RE K` gives `0110K`; `RE Bj±K` gives `011jK`. WE uses 012.
  Force upper before.
* Examples: `RE 2000B` gives 0110002000; `RE B7+1000B` gives 0117001000; `WE 1000B+B5` gives
  0125001000.
* Execution:
  * Word count = (Bj)+K.
  * ECS address = (X0)+RAE. CM address = (A0)+RAC.
  * Success: the next instruction is at the start of word P+1.
  * **Error exit**: execution continues at the **lower 30 bits of the instruction word** containing
    RE/WE. That half-word should hold a jump to an error routine.
  * Error conditions:
    * ECS parity error on read: the whole block is transferred, then the exit is taken.
    * ECS bank unavailable: immediate exit.
    * Address out of range:
      * Write: no transfer, immediate exit.
      * Read: in-range addresses transfer, and **zeros are stored into CM**. This is a quick way to
        clear CM.
* On the 6600, RE/WE are the only meaningful 011/012 forms. An emulator without ECS should take the
  error exit.

#### 6.5 RL / WL — LCM block copy (011, 012; 7600/176) [M §8.4.5]

* Same encodings as RE/WE. Examples: `RL 1000B+B5` gives 0115001000; `RL 2000B` gives 0110002000;
  `WL B4-100B` gives 0124777677.
* Length = (Bj)+K, truncated to **10 bits** (max 1777B). A length of 0 is a no-op.
* SCM address = (A0). LCM address = the low 19 bits of (X0), unsigned.
* A range error sets a PSD flag; the copy is not done.

#### 6.6 XJ — exchange jump (013) [M §8.4.6]

* Forms: `XJ` gives `01300 00000`; `XJ Bj` gives `013j0 00000`; `XJ K` gives `0130K`;
  `XJ Bj±K` gives `013jK`. Force upper before and after.
* Examples: `XJ 1000B` gives 0130001000; `XJ B5+600B` gives 0135000600.
* Execution: always exchanges, whatever the monitor flag.
  * **Monitor flag clear**: the package address is the 18-bit **MA** register (absolute), and the
    monitor flag is set.
  * **Monitor flag set**: the package address is (Bj)+K (absolute), and the flag is cleared.
* Not legal on the 175, 740, 750 and 760 with CEJ/MEJ disabled, or if XJ is not in parcel 0.
* [HW] A basic 6600 without the CEJ/MEJ option has no 013: treat it as illegal (error exit / stop).

#### 6.7 MJ — exchange exit (013, 7600) [M §8.4.7]

* `MJ` alone is a 15-bit `01300`. It exits to NEA when the exit-mode flag is clear; j and k are 0.
* `MJ Bj` gives `013j0 00000`; `MJ Bj±K` gives `013jK`; `MJ K` gives `0130K`. These exit to
  relative (Bj)+K when the exit flag is set (privileged; the low 16 bits are used).
* Examples: `MJ B4+500B` gives 0134000500; `MJ -300B+B6` gives 0136777477; `MJ 600B` gives
  0130000600.
* Force upper after it. It voids the stack. P is saved as P+1.

#### 6.8 RXj / WXj — direct LCM/UEM word (014, 015) [M §8.4.8-8.4.9]

* `RXj Xk` gives `014jk`; `WXj Xk` gives `015jk`. Examples: `RX6 X5` gives 01465; `WX7 X0` gives
  01570; `RX1 X2` gives 01412.
* The LCM address is the low 19 bits of Xk, unsigned. UEM: (Xk)+RAE.
* COMPASS distinguishes `RXj Xk` (one X operand) from `RXi Xj+Xk` (34/35) by the shape of the
  variable field.

#### 6.9 RI, TBj, IBj, RO, OBj — 7600 I/O channel buffer ops (016, 017) [M §8.4.10-8.4.13]

| Form | Code | Effect |
|---|---|---|
| `RI Bk` | 0160k | Reset input channel (low 4 bits of Bk) buffer. Monitor mode only, otherwise a pass. (Bk) = 0 is a pass. |
| `TBj` / `TBj K` | 016j0 | Bj = 18-bit clock-period counter. K is ignored. |
| `IBj Bk` | 016jk | Bj = input channel (Bk) buffer address. With (Bk) = 0, Bj = the clock. |
| `RO Bk` | 0170k | Reset output channel (Bk) buffer. Monitor mode only. (Bk) = 0 is a pass. |
| `OBj Bk` | 017jk | Bj = output channel (Bk) buffer address. (Bk) = 0 gives 0. |

Examples: `RI B7` gives 01607; `TB7` gives 01670; `IB6 B4` gives 01664; `RO B5` gives 01705;
`OB5 B6` gives 01756. These do not exist on the 6600.

#### 6.10 JP — unconditional jump (02) [M §8.4.14]

* `JP Bi±K` gives `02iiK` (**j is set equal to i**). `JP Bi` gives `02ii0 00000`. `JP K` gives
  `0200K`.
* Examples: `JP B5+GOTO` gives 0255002373; `JP B7` gives 0277000000.
* Target = (Bi)+K, 18-bit ones' complement. With i = 0, the target is K. Force upper after it.
* Later parcels are not executed. It voids the stack on 6000/70/170/180 (not on 7600/76/176). It is
  the only computed jump.

#### 6.11 X-register conditional branches (030-037) [M §8.4.15]

Forms: `ZR Xj,K`, `NZ Xj,K`, `PL Xj,K`, `NG Xj,K`, `MI Xj,K`, `IR Xj,K`, `OR Xj,K`, `DF Xj,K`,
`ID Xj,K`, giving `03fjK` with f = 0 (ZR), 1 (NZ), 2 (PL), 3 (NG/MI), 4 (IR), 5 (OR), 6 (DF), 7 (ID).

Examples [M]: `ZR X5,ZERO` gives 0305..; `NZ X3` gives 0313..; `PL X4` gives 0324..; `NG X1` and
`MI X1` give 0331..; `IR X0` gives 0340..; `OR X1` gives 0351..; `DF X5` gives 0365..; `ID X7` gives
0377...

Semantics:

* ZR/NZ: the full 60 bits; both 00…0 and 77…7 count as zero. This is not a valid floating-zero test,
  but it does detect underflow.
* PL/NG: bit 59 only.
* IR/OR, DF/ID: the top 12 bits (see §3.3).
* The decision waits until Xj is free. These branches do not void the stack.

The mnemonic is shared with the B forms. COMPASS picks 03x when the first subfield is an X register,
04-07 when it is a B register, and `0400K` when there is only K (`ZR K`).

#### 6.12 B-register conditional branches (04-07) [M §8.4.16]

**The operand order is significant.**

| Written form | Code | Branch condition |
|---|---|---|
| `EQ K`, `ZR K` | 0400K | always (force upper after) |
| `EQ Bi,K`, `ZR Bi,K` | 04i0K | (Bi) = +0 (a −0 is **not** zero here) |
| `EQ Bi,Bj,K` | 04ijK | (Bi) = (Bj), compared bit for bit |
| `NE Bi,K`, `NZ Bi,K` | 05i0K | (Bi) ≠ +0 |
| `NE Bi,Bj,K` | 05ijK | (Bi) ≠ (Bj) |
| `GE Bi,K`, `PL Bi,K` | 06i0K | (Bi) ≥ +0 (so −0 does not branch) |
| `GE Bi,Bj,K` | 06ijK | (Bi) ≥ (Bj) |
| `LE Bj,Bi,K` | 06ijK | first written = j, second written = i; branch if (Bj) ≤ (Bi) |
| `LE Bj,K` | 060jK | (B0) ≥ (Bj), i.e. Bj ≤ +0 (−0 branches) |
| `LT Bi,K`, `NG Bi,K`, `MI Bi,K` | 07i0K | (Bi) < +0 (−0 branches) |
| `LT Bi,Bj,K` | 07ijK | (Bi) < (Bj) |
| `GT Bj,Bi,K` | 07ijK | first written = j, second = i; branch if (Bj) > (Bi) ⇔ (Bi) < (Bj) |
| `GT Bj,K` | 070jK | (B0) < (Bj), i.e. Bj > +0 (−0 does not branch) |

Example listing [M] (all confirmed):

* `ZR B5,BZERO` gives 0450..; `EQ B0,B5,EQUAL` gives 0405..; `EQ B5,B3,JUMP` gives 0453..;
  `EQ JUMP` gives 0400...
* `NE B1,B5` gives 0515..; `NZ B6` gives 0560..; `PL B2` gives 0620..; `GE B4,B5` gives 0645..;
  `GE B5,K` gives 0650...
* **`LE B6,B7,K` gives 0676..**; `NG B7` gives 0770..; `MI B3` gives 0730...
* **`GT B7,B6,K` gives 0767..**; **`GT B5,K` gives 0705..**; `LT B1,B2,K` gives 0712...

The comparison rules are in §3.2 (19-bit, +0 > −0, +0 ≠ −0). These branches do not void the stack.

#### 6.13 Boolean (10-17) [M §8.4.17-8.4.24]

| Form | Code | Result |
|---|---|---|
| `BXi Xj` | 10ijj | Xi = Xj (assembler sets k = j) |
| `BXi Xj*Xk` | 11ijk | Xj AND Xk |
| `BXi Xj+Xk` | 12ijk | Xj OR Xk |
| `BXi Xj-Xk` | 13ijk | Xj XOR Xk |
| `BXi -Xk` | 14ikk | NOT Xk (assembler sets j = k) |
| `BXi -Xk*Xj` | 15ijk | Xj AND NOT Xk |
| `BXi -Xk+Xj` | 16ijk | Xj OR NOT Xk |
| `BXi -Xk-Xj` | 17ijk | Xj XOR NOT Xk (equivalence) |

Examples: `BX6 X2` gives 10622; `BX5 X5*X3` gives 11553; `BX7 X6+X7` gives 12767; `BX6 X0-X1` gives
13601; `BX3 -X1` gives 14311; `BX4 -X2*X3` gives 15432; `BX6 -X4+X5` gives 16654; `BX7 -X1-X3`
gives 17731.

For 11-13, the first written register is j. For 15-17, the complemented register is k, whatever its
position. [INF] Forms such as `BXi Xj*-Xk` are not documented; reject them (or accept them as
synonyms if real COMPASS does).

#### 6.14 NO — pass (46) [M §8.4.44]

* `NO` gives `46000`. `NO n` gives `46n`: n goes into the low bits of the parcel. The manual (OCR)
  says "lower 8 bits"; [M?] the field is 9 bits (ijk), since n ≥ 400B selects the CMU.
* On a CMU machine, n ≥ 400B means the parcel is interpreted as a CMU instruction. On the 175, 740,
  750 and 760, n ≥ 400B is illegal.
* The assembler pads automatically on force upper.

#### 6.15 Shifts (20-23) [M §8.4.25-8.4.28]

**`LXi jk` (20ijk).** Xi is rotated left circular by jk (0-63). A negative written jk gives 60+jk, an
effective right rotation. Examples: `LX3 25B` gives 20325; `LX3 -12B` gives 20362.

**`AXi jk` (21ijk).** Xi is shifted right arithmetic by jk. Low bits are discarded and the sign is
extended. A count of 60 gives 60 copies of the sign (±0). For a negative written jk (60+jk), "−n"
means "keep the n high-order bits". Example: `AX5 37B` gives 21537. [HW] A jk of 60-63 gives all
sign bits.

**22ijk / 23ijk (shift Xk by Bj into Xi).**

| Form | Code |
|---|---|
| `LXi Xk,Bj`, `LXi Bj,Xk` | 22ijk |
| `LXi Xk` | 22i0k (transmit) |
| `LXi Bj` | 22iji |
| `LXi -Bj,Xk`, `LXi Xk,-Bj` | 23ijk |
| `LXi -Bj` | 23iji |
| `AXi Xk,Bj`, `AXi Bj,Xk` | 23ijk |
| `AXi Xk` | 23i0k (transmit) |
| `AXi Bj` | 23iji |
| `AXi -Bj,Xk`, `AXi Xk,-Bj` | 22ijk |
| `AXi -Bj` | 22iji |

A minus sign on Bj only selects the other opcode. Bj itself is used as is.

Examples: `LX6 X5,B7` gives 22675; `LX5 B3,X4` gives 22534; `LX3 X2` gives 22302; `AX7 X4,B6` gives
23764; `AX2 B1,X1` gives 23211; `AX5 X2` gives 23502; `AX4 B2` gives 23424.

Execution of **22** (6000/70/170/180 rules; the 7600 rules differ):

* (Bj) bit 17 = 0: left circular by the low 6 bits of Bj. The higher bits are ignored.
* (Bj) bit 17 = 1: right end-off with sign extension. The count is the ones' complement of the low
  11 bits of Bj (= |Bj|).
  * Count 59-63D: 60 copies of the sign.
  * **Count ≥ 64D: Xi = 0 (60 zeros).** [M]
  * 7600/76/176: the complement of the low 12 bits; a count ≥ 59 gives all sign bits.

Execution of **23**:

* (Bj) bit 17 = 0: right arithmetic by the low 11 bits of Bj.
  * 59-63: all sign bits.
  * **≥ 64: Xi = 0.** [M]
  * 7600: low 12 bits; ≥ 59 gives all sign bits.
* (Bj) bit 17 = 1: left circular by the complement of the low 6 bits of Bj.

The usual use of 23 is to shift a coefficient by an unpacked exponent after UX.

Flag: the "≥ 64 gives zero" rule is as the manual states it. Check DtCyber for its 6600 treatment.

#### 6.16 NX / ZX — normalize, round and normalize (24, 25) [M §8.4.29-8.4.30]

Forms (the same for ZX, with 25):

| Form | Code |
|---|---|
| `NXi Xk` | 24i0k |
| `NXi Bj,Xk`, `NXi Xk,Bj` | 24ijk |
| `NXi` | 24i0i |
| `NXi Bj` | 24iji |

Examples: `NX5 X5,B7` gives 24575; `NX5 X5` gives 24505; `NX5,B5 X2` gives 24552; `ZX4 X4,B7` gives
25474; `ZX4` gives 25404; `ZX3,B6 X1` gives 25361.

**NX semantics.** Shift the coefficient left the minimum number of places so that bit 47 ≠ bit 59.
The vacated bits are filled with the sign. The exponent decreases by the count, and the count goes to
Bj (B0 discards it).

**ZX semantics.** Same as NX, but the coefficient is first rounded. A round bit is placed just right
of the coefficient LSB, so the coefficient grows by ½ LSB. Normalizing a zero coefficient puts the
round bit in bit 47 and reduces the exponent by 48.

Special cases:

* For **infinite or indefinite (Xk), no shift**: Xi = Xk and Bj = 0. (The manual states this for ZX;
  NX follows "the same rules".)
* [HW] NX of a zero coefficient gives count 48 and exponent −48. If the exponent underflows, the
  result is 0.

#### 6.17 UX — unpack (26) [M §8.4.31]

Forms are as for NX (opcode 26). Examples: `UX7 X7,B7` gives 26777; `UX3,X2 B4` gives 26342; `UX7`
gives 26707; `UX7 B7` gives 26777.

* Xi = the 48-bit coefficient (bits 47-0 of Xk), with bits 59-48 filled with copies of the sign bit.
* Bj = the exponent as an 11-bit ones'-complement value, sign-extended to 18 bits.
* The bias is removed. [HW] Exactly: if Xk is positive, E = bits 58-48 with bit 10 complemented. If
  Xk is negative, E = bits 58-48 with bits 9-0 complemented and bit 10 left as is. This is the inverse
  of PX.
* Special operands are handled like any other operand. Xk need not be normalized.

#### 6.18 PX — pack (27) [M §8.4.32]

Forms: `PXi Xk` gives 27i0k (exponent = B0 = 0); `PXi Xk,Bj` and `PXi Bj,Xk` give 27ijk; `PXi`
gives 27i0i; `PXi Bj` gives 27iji. Examples: `PX5 X5,B6` gives 27565; `PX6,B7 X1` gives 27671; `PX5`
gives 27505; `PX5 B6` gives 27565.

* Coefficient = bits 47-0 of Xk (bits 58-48 of Xk are ignored); the sign is bit 59 of Xk.
* The exponent comes from bits 10-0 of Bj (bits 17-11 are ignored).
  * If Xk is positive: packed exponent = Bj bits 10-0 with **bit 10 complemented**.
  * If Xk is negative: **bit 10 is not complemented, but bits 9-0 are complemented**.
* No normalization, no overflow/underflow test, no flags set.
* `PXi Xk` (j = 0) converts an integer to floating point with exponent 0.

#### 6.19 Floating add (30-35) [M §8.4.33-8.4.35]

* `FXi Xj+Xk` (30) and `FXi Xj-Xk` (31): the unrounded sum or difference.
  * Both operands are unpacked. The coefficient with the **smaller exponent** goes to the upper
    accumulator and is shifted right by the exponent difference. The other coefficient is then added
    or subtracted.
  * On coefficient overflow, shift right 1 and add 1 to the exponent.
  * The result is the upper 48 bits with the larger exponent. It is not normalized.
* `DXi Xj+Xk` (32) and `DXi Xj-Xk` (33): the lower 48 bits of the same double-length result, packed
  with an exponent **48 lower** than the upper result. Not normalized.
* `RXi Xj+Xk` (34) and `RXi Xj-Xk` (35): rounded. [HW] On the 6600, round bits are inserted into both
  operands before the add: a ½-LSB bit is appended to each coefficient, with sign-dependent rules.
  Copy the DtCyber algorithm.

Examples: `FX3 X4+X5` gives 30345; `FX2 X1-X3` gives 31213; `DX3 X2+X3` gives 32323; `DX4 X1-X4`
gives 33414; `RX5 X3+X4` gives 34534; `RX6 X5-X3` gives 35653.

#### 6.20 Integer add (36, 37) [M §8.4.36]

`IXi Xj+Xk` gives 36ijk; `IXi Xj-Xk` gives 37ijk. This is 60-bit ones'-complement arithmetic and
overflow is ignored. Zero rules are in §3.2. Examples: `IX5 X4+X5` gives 36545; `IX6 X3-X1` gives
37631.

#### 6.21 Floating multiply (40-42) [M §8.4.37-8.4.40]

* `FXi Xj*Xk` (40): unrounded.
  * The exponents are unpacked and added, with a correction of +48.
  * The 48-bit coefficients are multiplied as signed integers into a 96-bit product. The upper 48 bits
    form the result coefficient.
  * Normalized operands give a normalized result with exponent = sum + 47 or + 48. In other words, a
    1-bit normalizing shift may occur when the product has only 95 significant bits. Example:
    `FX0 X1*X1` gives 40011.
* `RXi Xj*Xk` (41): the same, but a round bit is added at **bit 46** of the 96-bit product before the
  upper half is taken. There is an alternate 1-bit left shift (with exponent −1) for normalized
  operands with a 95-bit product.
* `DXi Xj*Xk` (42): the **lower 48 bits** (47-0) of the product, packed with an exponent 48 less than
  the FX result. Not necessarily normalized. Usable for integer products of ≤ 48 bits if the operands
  are packed.
* `IXi Xj*Xk` is the **same 42ijk instruction**. COMPASS accepts both spellings.
  * Hardware [M]: if **both operands have their top 12 bits all 0s or all 1s**, the result is a 47-bit
    integer product in Xi, sign-extended through the top 12 bits. Exception: if each operand has
    bit 47 ≠ its sign bit, the result is shifted left 1.
  * Otherwise, a DP float multiply is done.
  * Integer multiply is an optional feature on early 6000 machines ("I" in the MACHINE hfi list).
  * Example: `IX2 X3*X4` gives 42234.

#### 6.22 MX — mask (43) [M §8.4.41]

`MXi jk` gives 43ijk. Xi is cleared, then the top jk bits are set to ones. jk = 0 gives zero; jk = 60
gives all ones. A negative written jk gives 60+jk, so "−n" means n zero bits at the low end. A value
below −60 gives a type 7 error. Example: `MX3 -14B` gives 43360. [HW] jk 61-63 gives all ones.

#### 6.23 Floating divide (44, 45) [M §8.4.42-8.4.43]

`FXi Xj/Xk` gives 44ijk (dividend Xj, divisor Xk; normalized operands). `RXi Xj/Xk` gives 45ijk
(rounded quotient). Examples: `FX6 X3/X1` gives 44631 [M?]; `RX7 X2/X4` gives 45724. The algorithm
and special cases are [HW]: take them from DtCyber.

#### 6.24 CX — population count (47) [M §8.4.45]

`CXi Xk` gives 47ikk (j is set equal to k). Xi = the number of 1 bits in Xk (0-60D), in the low bits;
bits 59-6 are cleared. Example: `CX7 X0` gives 47700.

#### 6.25 SA — set A register (50-57) [M §8.4.46]

The forms and codes are in §5. The 50-57 / 60-67 / 70-77 families share the same encoding rules.

**Encoding choice, which applies to SA, SB and SX alike.** First collect the register terms and the
non-register terms of the (single) variable-field expression.

| Variable field contains | Code (SA / SB / SX) | Size |
|---|---|---|
| no register (`K`; also `B0+K`) | 51i0K / 61i0K / 71i0K | 30 |
| `+Aj` and non-register terms | 50ijK / 60ijK / 70ijK | 30 |
| `+Bj` and non-register terms | 51ijK / 61ijK / 71ijK | 30 |
| `+Xj` and non-register terms | 52ijK / 62ijK / 72ijK | 30 |
| only `Xj` | 53ij0 / 63ij0 / 73ij0 | 15 |
| `Xj` + `Bk` (either order) | 53ijk / 63ijk / 73ijk | 15 |
| only `Aj` | 54ij0 / 64ij0 / 74ij0 | 15 |
| `Aj` + `Bk` (either order) | 54ijk / 64ijk / 74ijk | 15 |
| `Aj - Bk` or `-Bk + Aj` | 55ijk / 65ijk / 75ijk | 15 |
| only `Bj` | 56ij0 / 66ij0 / 76ij0 | 15 |
| `Bj + Bk` (first written = j) | 56ijk / 66ijk / 76ijk | 15 |
| only `-Bk` | 57i0k / 67i0k / 77i0k | 15 |
| `Bj - Bk` or `-Bk + Bj` | 57ijk / 67ijk / 77ijk | 15 |

Notes on the encoding:

* No other combination is valid: two X or two A registers, X with A, X−B, a negated A or X, or
  register-register plus K. Reject it with an error. [INF]
* [INF] An explicit non-register term whose value is 0 (e.g. `SA1 B2+0`, `SX6 0`) still produces the
  30-bit K form. COMPASS does no size optimization; R= exists for that purpose.
* A0, B0 and X0 are ordinary register numbers 0. For example, `SA1 A0+1` gives 5010000001 and
  `SX6 B0` gives 76600. `SAi B0+K` and `SAi K` give the identical code 51i0K.

Examples [M]: `SA1 A0+1` gives 5010000001; `SA0 -3` gives 5100777774; `SA2 3+B1` gives 5121000003;
`SA3 X1-6` gives 5231777771; `SA4 X1+B1` gives 53411; `SA5 A4+B1` gives 54541; `SA6 A4+B1` gives
54641; `SA5 A4` gives 54540; `SA6 -B1+A4` gives 55641; `SA7 B1+B1` gives 56711; `SA7 B2-B1` gives
57721.

**Semantics.** Ai = 18-bit ones'-complement result. Xj operands contribute their low 18 bits.
Overflow is ignored.

* i = 0: no memory reference.
* i = 1-5: **Xi = CM[RA + (Ai)]**, a load.
* i = 6, 7: **CM[RA + (Ai)] = Xi**, a store.
* The range check is against FL (§3.1).

#### 6.26 SB — set B register (60-67) [M §8.4.48]

The same forms as SA, with the result in Bi.

* Examples: `SB1 A1-5` gives 6011777772; `SB1 -5` gives 6110777772; `SB2 3+B1+6` gives 6121000011;
  `SB3 X1+100B` gives 6231000100; `SB4 X2+B7` gives 63427; `SB5 A4+B1` gives 64541; `SB5 A4` gives
  64540; `SB6 -B1+A4` gives 65641; `SB6 A4-B3` gives 65643; `SB7 B1+B1` gives 66711; `SB7 B5-B1`
  gives 67751.
* i = 0 is a no-op (it writes B0). Exception: on models 810-875, `SB0 Bj+Bk` (660jk) and
  `SB0 Bj-Bk` (670jk) are **CR/CW**.

#### 6.27 SX — set X register (70-77) [M §8.4.49]

The same forms as SA. The 18-bit result goes to the low 18 bits of Xi, and **bit 17 is sign-extended
through bits 59-18**.

Examples: `SX0 BNEG+A0+1` gives 7000005233+; `SX1 -2022B` gives 7110775755; `SX2 B1+5` gives
7121000005; `SX3 X3-33B` gives 7233777744; `SX4 X4+B2` gives 73442; `SX5 A5+B3` gives 74553; `SX5
A4` gives 74540; `SX6 A0-B4` gives 75604; `SX6 -B1+A4` gives 75641; `SX7 B7+B6` gives 76776; `SX7
B5-B1` gives 77751.

#### 6.28 CR / CW — direct CM read/write (660jk / 670jk; models 810-875 only) [M §8.4.47]

`CR Xj,Xk` gives 660jk: Xj = CM[(Xk) low 21 bits + RAC]. `CW Xj,Xk` gives 670jk: CM[…] = Xj.
Examples: `CR X1,X2` gives 66012; `CW X1,X2` gives 67012. **Not on the 6600**: there, 660jk / 670jk
are SB0 no-ops.

### 7. Exchange package, exit modes and error exit (6600) [HW unless marked]

**Exchange package**: 16 words at an absolute address (from (A) on the PP side for EXN, or from MA
or (Bj)+K for XJ). The CPU swaps its state with the package.

| Word | Bits 59-54 | Bits 53-36 | Bits 35-18 | Bits 17-0 |
|---|---|---|---|---|
| 0 | — | P | A0 | B0 (stored as 0) |
| 1 | — | RA (CM reference address) | A1 | B1 |
| 2 | — | FL (CM field length) | A2 | B2 |
| 3 | — | EM (exit mode; **bits 50-48** on the 6000) [M card] | A3 | B3 |
| 4 | RAE (ECS reference address, upper bits; units of 1000B words) | | A4 | B4 |
| 5 | FLE (ECS field length, same format) | | A5 | B5 |
| 6 | MA (monitor address, on CEJ/MEJ machines) in bits 53-36 | | A6 | B6 |
| 7 | — | — | A7 | B7 |
| 10-17 | X0-X7 | | | |

**Exit-mode bits** (summary card, "Model 72, 73, 74 exit modes") [M]:

| Bit | Meaning |
|---|---|
| 48 | address out of range |
| 49 | operand out of range (infinite) |
| 50 | indefinite operand |

**6000 error exit** [HW]: when a selected condition occurs, the CPU stores a word in RA+0 with the
exit condition in bits 53-48 and the P address in bits 47-30 (bits 59-54 = 00). It then sets P = 0
and stops. Because word RA+0 now begins with `00` (PS), resuming would stop. On CEJ/MEJ machines the
CPU exchanges to MA instead.

The 7600 uses a PSD register instead (summary card):

* Mode bits: Exit, Monitor, Step, Indefinite, Overflow, Underflow.
* Condition bits: LCM parity, SCM parity, LCM block range, SCM block range, LCM direct range, SCM
  direct range, Program range, Breakpoint, Step, Indefinite, Overflow, Underflow.

### 8. CMU instructions (Cyber 70 Models 72/73; Cyber 170 172-174, 720, 730; simulated on 8xx) [M §8.5]

Data fields are strings of 6-bit characters. Character positions 0-9 run left to right in a word, so
character 0 is in bits 59-54.

* All CMU instructions force upper before them, unless the location field holds `-`.
* IM also forces upper after it.
* DM, CC and CU are 60-bit full words. IM is 30 bits, must be in the upper half of its word, and the
  lower half is not executed.
* X0 is used as scratch and is cleared at the end. Overlapping fields give undefined results. A
  length of 0 is a slow pass.

**IM — indirect move.** `IM K` gives `4640K`; `IM Bj±K` gives `464jK`; `IM Bj` gives
`464j0 00000`. The descriptor word is at (Bj)+K.

**MD — descriptor pseudo op.** `sym MD l,ks,cs,kd,cd` generates one data word and forces upper.

* l = 0-8191D (13 bits). ks/kd = source/destination word addresses (18 bits). cs/cd = character
  positions 0-9.
* Layout:

  ```
  59-57  56-48     47-30   29-26     25-22  21-18  17-0
  000    l<12:4>   ks      l<3:0>    cs     cd     kd
  ```

* Worked example [M?]: with BUFFA = 2560D = 5000B and BUFFB = 3584D = 7000B,
  `MD 1003,BUFFA,6,BUFFB,5` gives `0076 005000 5545 007000`. This was reconstructed from the garbled
  listing; the first digits `0076…0050` match.

**DM — direct move.** `sym DM l,ks,cs,kd,cd` (l = 0-127).

```
59-51 = 465   50-48 = l<6:4>   47-30 = ks   29-26 = l<3:0>   25-22 = cs   21-18 = cd   17-0 = kd
```

Example [M]: `DM 127,BUFFA,0,BUFFB,5` gives `46570050007405007000`.

**CC — compare collated.** `CC l,ka,ca,kb,cb` uses the same layout with op 466.

* A0 holds the address of an 8-word collating table: 64 six-bit entries, 8 per word in bits 59-12,
  with bits 11-0 unused.
* Result in X0:
  * A > B: X0 = l − n (positive).
  * equal: X0 = 0.
  * A < B: X0 = n − l (negative).
  * n = the number of equal pairs before the difference.
* Example [M]: `CC 127,BUFFA,0,BUFFB,5` gives `46670050007405007000`.

**CU — compare uncollated.** The same as CC with op 467, comparing raw 6-bit values with no table.

### 9. Table 8-4 — CPU instruction / machine model correspondence [M?]

The OCR of this table is badly scrambled: the x marks are displaced and dropped. The table below is
rebuilt from the table rows, the per-instruction text, Table 8-5 and the MACHINE pseudo. Column A:
models 810-875 and 990 (Cyber 180 class). B: Cyber 70/76 and 7600. C: 171-175, 720, 730, 740, 750,
760, Cyber 70/71-74, and the **6000 series (6600)**. D: 176.

| Mnemonic | A (8xx/990) | B (76/7600) | C (6000/70/170) | D (176) | Basis |
|---|---|---|---|---|---|
| AXi, BXi, DXi, FXi, IXi, LXi, MXi, NXi, ZXi, UXi, PXi, RXi (FP), CXi | x | x | x | x | all common |
| SAi, SBi, SXi | x | x | x | x | |
| JP, RJ, NO | x | x | x | x | |
| ZR, NZ, PL, NG, MI, IR, OR, DF, ID (X forms) | x | x | x | x | IR/OR semantics differ (§3.3) |
| EQ, NE, GE, LT, LE, GT (B forms) | x | x | x | x | |
| PS | x | (assembles under MACHINE 7) | x | ? | 7600 has no PS hardware |
| ES | — | x | — | x | 7600 error exit |
| XJ | x | — | x (needs the CEJ/MEJ option on 6000) | x? | Table 8-5 |
| MJ | — | x | — | x | 7600 |
| RE, WE | x (UEM) | — | x (ECS) | — | |
| RL, WL | — | x | — | x | |
| RXj, WXj (014, 015) | x (UEM) | x (LCM) | — | x | |
| RI, RO, IBj, OBj, TBj | — | x | — | x | 7600 channels |
| CR, CW | x | — | — | — | 8xx only |
| IM, DM, CC, CU (MD) | simulated | — | 172-174, 720, 730, 72, 73 only | — | CMU footnote |
| IXi Xj*Xk (integer multiply) | x | x | x (optional feature on early 6000) | x | |

**For the 6600 emulator, the relevant set is column C**, without the CMU or CR/CW. Optionally add CEJ/MEJ
(XJ) and ECS (RE/WE).

---------------------------------------------------------------------------------------------------

## Part II — PP (peripheral processor)

### 10. PP formats [M §9.1]

**12-bit mode** (PERIPH for 6000/170/180, and PPU for 7600):

```
12-bit:   11     6 5     0          24-bit:  11     6 5     0   11              0
         +--------+-------+                  +--------+-------+ +----------------+
         |   f    |   d   |                  |   f    |   d   | |       m        |   (word P+1)
         +--------+-------+                  +--------+-------+ +----------------+
```

* f = 6-bit opcode. **SCF, CCF, SFM, CFM use a 7-bit f and a 5-bit d.**
* d meanings by mode:
  * direct: d = the operand address (0-77B);
  * indirect: d = the address of the operand address;
  * no-address: d = a 6-bit operand, shift count or relative jump;
  * other: a channel number, a CPU number, etc.
* 24-bit formats:
  * indexed: operand address = m + (d), with d = 0 meaning plain m;
  * constant: operand = d‖m (18 bits);
  * other: d = channel, m = an address or function code.

**16-bit mode** (CIPPU, Cyber 180 only) [M §9.1.1]: 16-bit and 32-bit words.

* f = 10 bits, d = 6 bits. "Long" (L-suffixed) instructions have f = `10XX`, with bit 15 set. The
  opcode is written as 4 octal digits `10XX`: bit 15, then 3 zero bits, then 6 bits XX. m is 16 bits
  (constant mode uses only the low 12 bits).
* For example, `IAPM TAG,1` gives the 16-bit word 107101 followed by 1364.
* FNCL has f = 0077 with a 16-bit m (1077 is "idle" on the 180).

**R register** (models 810-990): 22 bits. When A bit 17 = 1, the CM address = (R‖000000B) + A
bits 16-0.

### 11. PP designators and addressing-mode letters [M Table 9-1]

**Table 9-1. Designators.**

| Designator | Use |
|---|---|
| A | 18-bit A register |
| c | expression reducing to an 18-bit operand (LDC etc.). In channel instructions (index usage), c also denotes a channel. |
| d | 6-bit operand or operand-address expression. 5 bits for SCF, CCF, SFM, CFM. |
| m | 12-bit (or 16-bit) expression used with d or (d) to form an 18-bit operand or address |
| P | 12-bit program address register |
| Q | 12-bit Q register |
| r | expression reducing to a 6-bit value, −37B ≤ r ≤ 37B: a relative address or shift count |
| R | 22-bit R register (8xx/990) |
| ( ) | contents of |
| (( )) | indirect |

The third letter of the mnemonic gives the addressing mode:

| Letter | Mode |
|---|---|
| N | no address (d is the operand) |
| D | direct (d is the operand address) |
| M | memory (m or m+(d)) |
| C | 18-bit constant |
| I | indirect ((d) is the address) |

PP code is always absolute. Floating-point constants are illegal. In a PP assembly, register-like
names are ordinary symbols.

### 12. COMPASS PP operand conversion

* **d** (direct/indirect/no-address): an absolute or relocatable expression reduced to 6 bits
  (0-77B). [INF] Out of range is an error; for no-address forms, [INF] the low 6 bits are used with
  an error flag.
* **m**: reduced to 12 bits (16 in CIPPU long forms). [INF] A negative m is stored as the 12-bit ones'
  complement (−1 gives 7776B). Hardware note [M]: m+(d) can never address 7777B on most PPs, which is
  consistent with a 12-bit ones'-complement index adder (the sum is −0 only for −0 + −0).
* **c** (constant mode): reduced to 18 bits. The **upper 6 bits go into d and the lower 12 into m**.
  A negative c is the 18-bit ones' complement. Examples [M]: `LDC 707070B` gives `2070 7070`;
  `LPC 070707B` gives `2207 0707`.
* Two-operand order is **`m,d`** (address or base first, index or channel second). Examples:
  `LDM TAG6,77B`, `AJM TAG1,2`, `FNC 20B,5` (gives `7705 0020`), `SCF 100B,5`.
* `d` is optional (default 0) on LJM, RJM, LDM, ADM, SBM, LMM, STM, RAM, AOM and SOM. **`d` is
  required** on CRM, CWM, AJM, IJM, FJM, EJM, IAM, OAM, FNC, the 7600 FIM-NOM group, SCF-CFM (m also
  required on CCF though unused), IAPM and OAPM.

**Relative jumps (UJN, ZJN, NJN, PJN, MJN) and SHN.**

* d is a 6-bit ones'-complement count.
* **Hardware:** d = 01-37B jumps forward d words. d = 40-76B jumps backward 77B−d words. **d = 00 or
  77 loops on itself** (the manual says "must not be 00 or 77"). The range is ±31D. The target is P+r,
  with P = the address of the jump.
* **COMPASS without the `J` option** on PPU/PERIPH/CIPPU:
  * let v = the expression value;
  * if −31 ≤ v ≤ 31, use v as the relative count;
  * otherwise try v − LC (LC = the location counter of this instruction): if that is in range, use it;
  * otherwise a **fatal error**.
  * Encode the count r as d = r if r ≥ 0, else d = 77B + r (ones' complement).
* **With `PPU J` / `PERIPH J` / `CIPPU J`**: always d = v − LC. Then a bare `r` is not valid; the
  operand must be a tag.
* Pitfall without J: a tag whose address is ≤ 37B is taken as a relative count. [INF] r = 0 encodes
  as 00 (a loop). COMPASS probably does not diagnose it.
* Examples [M] (with J; UJN at 0040, TAG1 = 0010, TAG2 = 0011, TAG4 = 0046):
  * `UJN TAG1` gives `0347` (offset −30B, so d = 47).
  * `NJN TAG2+11B` (at 0042): offset −20B, gives `0557`.
  * `PJN -1+TAG4` (at 0043): +2, gives `0602`.
* Examples [M] (without J; UJN at 0020, TAG1 = 0012):
  * `UJN TAG1-*` gives `0371`.
  * `NJN TAG3` with TAG3 = 25B gives `0525` (the value is used directly).
  * `MJN TAG4` with TAG4 = 26B gives `0726`.
* **SHN r**: r = +1..+31 is a left circular shift of 18-bit A. r = −1..−31 is a right end-off shift
  with no sign extension. r = ±0 is no shift. The assembler places r in d as 6-bit ones' complement
  (`SHN 6` gives `1006`; `SHN -6` gives `1071`). |r| > 31 is an address error.

### 13. PP master opcode table

There are four columns of applicability:

* 6K = 6000 series, Cyber 70/71-74 and Cyber 170 (PERIPH, 12-bit);
* 7K = 7600 / Model 76 PPU (PPU);
* 17 = Cyber 170 only (not the original 6000);
* 18 = models 810-990 (NOSTEXT, PERIPH or CIPPU).

| Code | Mnemonic and syntax | Len | Operation | Machines |
|---|---|---|---|---|
| 00d | — (pass; not generated by COMPASS) | 12 | pass | 6K, 18 |
| 01dm | `LJM m,d` / `LJM m` | 24 | P = m+(d) (d = 0: m) | all |
| 02dm | `RJM m,d` / `RJM m` | 24 | [m+(d)] = P+2; P = m+(d)+1 | all |
| 03d | `UJN r` or `UJN tag` | 12 | P = P±r | all |
| 04d | `ZJN r` / `ZJN tag` | 12 | jump if A = 0 (−0 = 777777 is nonzero) | all |
| 05d | `NJN r` / tag | 12 | jump if A ≠ 0 | all |
| 06d | `PJN r` / tag | 12 | jump if A ≥ 0 (bit 17 = 0) | all |
| 07d | `MJN r` / tag | 12 | jump if A < 0 (bit 17 = 1) | all |
| 10d | `SHN r` | 12 | shift A | all |
| 11d | `LMN d` | 12 | A = A XOR d | all |
| 12d | `LPN d` | 12 | A = A AND d (upper 12 bits cleared) | all |
| 13d | `SCN d` | 12 | A = A AND NOT d (low 6 bits; upper bits unchanged) | all |
| 14d | `LDN d` | 12 | A = d | all |
| 15d | `LCN d` | 12 | A = NOT d (18-bit: upper 12 bits set) | all |
| 16d | `ADN d` | 12 | A = A + d | all |
| 17d | `SBN d` | 12 | A = A − d | all |
| 20dm | `LDC c` | 24 | A = c | all |
| 21dm | `ADC c` | 24 | A = A + c | all |
| 22dm | `LPC c` | 24 | A = A AND c | all |
| 23dm | `LMC c` | 24 | A = A XOR c | all |
| 2400 | `PSN` | 12 | pass. The variable field must be blank on 8xx (otherwise it is LRD). | all |
| 24d | `LRD d` | 12 | R<11:0> = (d+1); R<21:12> = (d)<9:0>. d = 0 is a pass. | 18 |
| 25d | `SRD d` | 12 | (d+1) = R<11:0>; (d) = R<21:12> in bits 9-0. d = 0 is a pass. | 18 |
| 25d | — | 12 | pass (not generated). 2500 is a pass on 8xx. | 6K, 7K |
| 260d | `EXN d` (d = CPU number 0/1, ignored on single-CPU systems) | 12 | exchange jump CPU d to address (A) | 6K, 18 (7K: see §15) |
| 261d | `MXN d` | 12 | monitor exchange jump CPU d to (A), only if the monitor flag is clear (it sets the flag); otherwise a pass | 17, 18 |
| 262d | `MAN d` | 12 | like MXN, but to the package address in CPU d's MA register | 17, 18 (not 6000) |
| 260d | `ETN d` | 12 | 6416 only: ECS ↔ 16K memory transfer, descriptor at (A). d = 0: ECS→16K; d = 1: 16K→ECS. | 6416 |
| 270d | `RPN d` (d bit 0 = CPU number) | 12 | A = CPU d's P register. 2700 is a pass on 8xx/990. | 6K |
| 270d | `ERN d` | 12 | 6416 only: A bit 17 = 1 if the coupler trunk is busy, else A = 0 | 6416 |
| 27d | — | 12 | pass | 7K |
| 30d | `LDD d` | 12 | A = (d) | all |
| 31d | `ADD d` | 12 | A = A + (d) | all |
| 32d | `SBD d` | 12 | A = A − (d) | all |
| 33d | `LMD d` | 12 | A = A XOR (d) | all |
| 34d | `STD d` | 12 | (d) = A<11:0> | all |
| 35d | `RAD d` | 12 | A = (d) + A; (d) = A<11:0> | all |
| 36d | `AOD d` | 12 | A = (d) + 1; (d) = A<11:0> | all |
| 37d | `SOD d` | 12 | A = (d) − 1; (d) = A<11:0> | all |
| 40d-47d | `LDI ADI SBI LMI STI RAI AOI SOI d` | 12 | as 30-37 with operand ((d)) | all |
| 50dm-57dm | `LDM ADM SBM LMM STM RAM AOM SOM m,d` | 24 | as 30-37 with operand (m+(d)) | all |
| 60d | `CRD d` | 12 | read the 60-bit CM word at (A) into d..d+4 | 6K |
| 61dm | `CRM m,d` | 24 | read (d) CM words from (A) into PP m.. | 6K |
| 62d | `CWD d` | 12 | write d..d+4 to CM at (A) | 6K |
| 63dm | `CWM m,d` | 24 | write (d) words from PP m to CM at (A) | 6K |
| 64dm | `AJM m,c` | 24 | jump to m if channel c is active | 6K |
| 65dm | `IJM m,c` | 24 | jump to m if channel c is inactive | 6K |
| 66dm | `FJM m,c` | 24 | jump to m if channel c is full | 6K |
| 67dm | `EJM m,c` | 24 | jump to m if channel c is empty | 6K |
| 64(40+c)m | `SCF m,c` (c is 5 bits) | 24 | if the channel c flag is set, jump to m; else set the flag | 17, 18 |
| 65(40+c)m | `CCF m,c` | 24 | clear the channel c flag (m required, unused) | 17, 18 |
| 66(40+c)m | `SFM m,c` | 24 | if the channel c error flag is set, jump to m and clear it | 17, 18 |
| 67(40+c)m | `CFM m,c` | 24 | if the channel c error flag is clear, jump to m; else clear it | 17, 18 |
| 60dm-67dm | `FIM EIM IRM NIM FOM EOM ORM NOM m,d` | 24 | 7600 channel flag jumps (§14.9) | 7K |
| 70d | `IAN c` | 12 | A<11:0> = word from channel c | all |
| 71dm | `IAM m,c` | 24 | input (A) words to m.. | all |
| 72d | `OAN c` | 12 | output A<11:0> to channel c | all |
| 73dm | `OAM m,c` | 24 | output (A) words from m.. | all |
| 74d | `ACN c` | 12 | activate channel c | 6K, 18 |
| 74d | `RFN d` | 12 | set the output record flag on channel d (7600) | 7K |
| 75d | `DCN c` | 12 | deactivate channel c | 6K, 18 |
| 76d | `FAN c` | 12 | function A<11:0> on channel c | 6K, 18 |
| 76d | — | 12 | pass | 7K |
| 77dm | `FNC m,c` | 24 | function m on channel c | 6K, 18 |
| 7700 | `ESN` | 12 | error stop; restart only by deadstart from the MCU | 7K |
| 1000d | `RDSL d` | 16 | CM[(A)] = CM OR PP d..d+3; d..d+3 = the old CM | 18 (CIPPU) |
| 1001d | `RDCL d` | 16 | CM[(A)] = CM AND PP d..d+3; d..d+3 = the old CM | 18 |
| 1022d | `LPDL d` | 16 | A = A AND (d) | 18 |
| 1023d | `LPIL d` | 16 | A = A AND ((d)) | 18 |
| 1024dm | `LPML m,d` | 32 | A = A AND (m+(d)) | 18 |
| 1026d | `INPN d` | 16 | interrupt the processor on memory port d (sets the External Interrupt bit in the CPU MCR) | 18 |
| 1030d-1037d | `LDDL ADDL SBDL LMDL STDL RADL AODL SODL d` | 16 | 16-bit direct | 18 |
| 1040d-1047d | `LDIL ADIL SBIL LMIL STIL RAIL AOIL SOIL d` | 16 | 16-bit indirect | 18 |
| 1050dm-1057dm | `LDML ADML SBML LMML STML RAML AOML SOML m,d` | 32 | 16-bit indexed | 18 |
| 1060d | `CRDL d` | 16 | read a 64-bit CM word at (A)+(R) into 4 PP words | 18 |
| 1061dm | `CRML m,d` | 32 | block read of 64-bit words | 18 |
| 1062d | `CWDL d` | 16 | write 4 PP words | 18 |
| 1063dm | `CWML m,d` | 32 | block write | 18 |
| 1064Xcm | `FSJM m,c` | 32 | jump to m if the channel c flag is set | 18 |
| 1065Xcm | `FCJM m,c` | 32 | jump to m if the channel c flag is clear | 18 |
| 1071Xcm | `IAPM m,c` | 32 | packed input: 4 × 12-bit channel words into 3 × 16-bit PP words | 18 |
| 1073Xcm | `OAPM m,c` | 32 | packed output | 18 |
| 0077dm (16-bit m) | `FNCL m,d` | 32 | function with a 16-bit m | 18 (CIPPU) |

Index-card encodings show the channel instructions as `740c`, `640cm`, `71Xcm`, etc. That is, the
channel occupies the low 5 bits of d, and bit 5 (40B) is either 0 or a variant selector. For
SCF/CCF/SFM/CFM, bit 5 is 1. For IAM/OAM/IAPM/OAPM/FSJM/FCJM, the card shows an `X` in that bit,
which [M?] is model-specific; on Cyber 170 it is the "no-hang" variant. For a 6000-series emulator,
treat d as a 6-bit channel number (12 channels, 0-13B, on the 6600). On 8xx, d must be < 40B for
AJM, IJM, FJM and EJM.

### 14. PP instruction semantics (6000 / Cyber 170 emphasis)

General points:

* A is 18 bits, **ones' complement**. ±0 matter: ZJN treats 777777 as nonzero. [HW] The 6000 PP
  adder is ones' complement with end-around carry. Whether the adder is subtractive (which affects
  when −0 arises) must be checked against DtCyber `pp.c`.
* PP memory is 4096 × 12 bits on 6000/170. 12-bit operands loaded from memory are zero-extended to
  18 bits. Stores write A<11:0>.

#### 14.1 Branches

* LJM, RJM, UJN, ZJN, NJN, PJN, MJN are covered in §12 and §13.
* RJM stores P+2 (the return address, i.e. the word after the 2-word RJM) at m+(d). Execution
  resumes at m+(d)+1.
* Usual convention [INF]: the target m+(d) is the m word of an `LJM` placed just before the
  subroutine body (the NOS `SUBR` macro is `xxxX LJM *`, with the entry at the following word). The
  subroutine exits by jumping to that `LJM`, which now jumps to the stored return address.

#### 14.2 No-address group (11-17)

The 6-bit d is a positive operand.

* LDN zeroes the upper bits of A.
* LCN loads NOT d: the upper 12 bits become ones and the low 6 are complemented.
* LPN zeroes the upper 12 bits of A.
* LMN and SCN leave the upper 12 bits unaltered.
* ADN and SBN are 18-bit ones' complement arithmetic.

Examples [M]: `LMN 12B` gives 1112; `LPN 7` gives 1207; `SCN 21B` gives 1321; `LDN 15B` gives 1415;
`ADN 1` gives 1601; `SBN 2` gives 1702.

#### 14.3 Constant group (20-23)

18-bit operand d‖m. LDC loads all 18 bits; ADC, LPC and LMC combine all 18 bits.

#### 14.4 Direct (30-37), indirect (40-47) and indexed (50-57) groups

* The operand is a 12-bit positive value.
* "Replace" instructions (RAD, AOD, SOD, RAI, AOI, SOI, RAM, AOM, SOM) leave the 18-bit result in A
  and store A<11:0> back to memory. (The 16-bit L forms store 16 bits.)
* LMD/LMI/LMM leave the upper 6 bits of A unaltered. LDD/LDI/LDM zero them.
* Indirect addressing reaches all of memory on 6000/170. On the 7600 it reaches 0000-7776 (7777 is
  inaccessible).
* Indexed: if d ≠ 0, the address is m+(d) (12-bit); if d = 0, it is m. **m+(d) can never reach
  7777B** (except on the 990 and some 840/850/860).

Examples [M]:

* `LDM TAG6,77B` gives `5077 0203` (TAG6 = 0203).
* `SBM TAG5` gives `5200 0202`.
* `AOM -10B+TAG6` gives `5600 0173`.
* `SOM TAG6,TAG1` gives `5712 0203`.
* `STM TAG5+70B,TAG1-2` gives `5410 0272`.

#### 14.5 PSN, LRD, SRD and the pass codes

* PSN = 2400.
* Pass codes not generated by COMPASS: on 6000/70/170/180, `00`, `25` (on 8xx only 2500) and `2700`
  (8xx only). On the 7600: `25`, `27`, `76`.
* LRD and SRD are described in §13.

#### 14.6 EXN, MXN, MAN

* **EXN**: sends the 18-bit absolute address in A to the CPU with an exchange request. The CPU swaps
  with the 16-word package at (A). The PP is not interrupted. EXN does not touch the monitor flag.
* **MXN**: conditional. If the monitor flag is clear, it sets the flag and exchanges to (A). If the
  flag is set, it is a pass.
* **MAN**: like MXN, but the address comes from MA.
* d selects the CPU in dual-CPU systems; otherwise it is ignored.
* Examples: `EXN 1` gives 2601; `MXN 0` gives 2610; `MAN 3` gives 2623.

#### 14.7 RPN (270d)

A = CPU P. On 6000/70 machines P is at most 17 bits, and "an ECS transfer is in progress when bit 17
of A is set". On Cyber 170, P is 18 bits.

#### 14.8 CRD, CRM, CWD, CWM (6000)

* **CRD d**: the CM word at absolute address (A) is split into 5 × 12 bits, MSB first, into d..d+4.
  A is unchanged.
* **CRM m,d**:
  1. (P) is saved in PP location 0, P = m, and Q = (d) (the word count).
  2. For each CM word from (A): store 5 PP words at P, P+1, …. P wraps 7777→0000. Then A = A+1 and
     Q = Q−1.
  3. When Q = 0, P is restored **from location 0** (so overwriting location 0 changes the return
     point). Execution continues at the next instruction.
  * The CM range is (A)..(A)+(d)−1; the PP range is m..m+5(d)−1.
* **CWD d**: packs 5 PP words d..d+4 into one CM word at (A).
* **CWM m,d**: the mirror image of CRM, with the same P/location-0/Q mechanics.
* All CM addresses here are **absolute**: there is no RA relocation on 6000 PPs.
* The 16-bit forms are covered in §13. Their notes: 64-bit words, address (A)+(R); R is not
  incremented, which limits a transfer to a 128K-word window.

#### 14.9 Channel jumps

* **6000**: AJM, IJM, FJM and EJM jump to m when the channel is active, inactive, full or empty.
  "Full" means: on input, the device has delivered a word and the PP has not taken it yet; on output,
  the PP has written a word and the device has not accepted it yet.
* **7600**: FIM jumps on the input word flag; EIM if there is no input word flag; IRM on the input
  record flag; NIM if there is no input record flag. FOM, EOM, ORM and NOM do the same for the output
  word and record flags.
* **SCF, CCF, SFM, CFM**: Cyber 170 channel flag and error flag instructions (§13). `SCF` with
  m = P+2 sets the flag unconditionally.
* Examples [M]:
  * `AJM TAG1,2` gives `6402 0012`.
  * `SCF 100B,5` gives `6445 0100`; `CCF 100B,5` gives `6545 0100`; `SFM 100B,5` gives
    `6645 0100`; `CFM 100B,5` gives `6745 0100`.
  * `SCF 100B,13B` gives `6453 0100`.

#### 14.10 IAN, OAN, IAM, OAM

* **IAN c**: input one word to A<11:0>. [HW] The upper bits of A are cleared.
* **OAN c**: output A<11:0>.
* On 6000/70/170/180, if the channel is **inactive**, the PP hangs until another PP activates the
  channel, or until deadstart. On a Cyber 180, IAN and OAN move 16 bits.
* **IAM m,c / OAM m,c**:
  * The word count is in A, which decrements per word. Location 0 holds P, and P runs from m. P is
    restored from location 0 at the end.
  * The transfer ends when A = 0 or (on 6000/170) **when the channel goes inactive**.
  * If IAM ends on an inactive channel, the next PP location is set to 0, and A = the remaining
    count (block length minus the words actually read).
  * **If the channel is already inactive when IAM/OAM starts, nothing happens and execution continues
    at P+2. For IAM, location m is still set to 0.**
* On the 7600, these wait on the word flags, and the record flag terminates IAM.
* Examples: `IAN 3` gives 7003; `IAM TAG,3` gives `7103 1364`; `OAM TAG,4` gives `7304 1364`.

#### 14.11 ACN, DCN, FAN, FNC (6000)

* **ACN** activates the channel. Activating an already active channel **hangs the PP**.
* **DCN** deactivates the channel. Deactivating an inactive channel **hangs the PP**. After deadstart,
  PPs wait on an input channel; a DCN makes them start at address 0001.
* **FAN** sends A<11:0> as the function code. **FNC m,c** sends m. Either one on an *active* channel
  **hangs the PP**.
* Examples: `ACN 5` gives 7405; `DCN CHAN` gives 75cc; `FAN CHAN+1` gives 76cc; `FNC 20B,5` gives
  `7705 0020`.

#### 14.12 RFN and ESN (7600)

* `RFN 6` gives 7406: sets the output record flag and sends a record pulse.
* `ESN` gives 7700.

### 15. Table 9-2 — PP instruction / machine model correspondence [M?]

The OCR places the x marks unreliably: many are lost, and some are shifted into the wrong column. The
table below is the best reconstruction from the text of §9.2, the footnotes and the opcode overlaps.
Columns are as in §9.

| Mnemonics | A (8xx/990) | B (76/7600) | C (6000/70/170) | D (176) |
|---|---|---|---|---|
| LJM RJM UJN ZJN NJN PJN MJN SHN LMN LPN SCN LDN LCN ADN SBN LDC ADC LPC LMC PSN | x | x | x | x |
| LDD ADD SBD LMD STD RAD AOD SOD; LDI … SOI; LDM … SOM | x | x | x | x |
| IAN IAM OAN OAM | x | x | x | x |
| CRD CRM CWD CWM AJM IJM FJM EJM ACN DCN FAN FNC | x | — | x | x (170-type PPs) |
| EXN | x | ? (26 is not a pass on the 7600) | x | x |
| MXN | x | — | x (Cyber 170 / 70) | x |
| MAN | x | — | x, but **not the 6000 series** (footnote ††) | x |
| RPN | — (2700 is a pass) | — | x | x |
| SCF CCF SFM CFM | x | — | Cyber 170 only | x |
| FIM EIM IRM NIM FOM EOM ORM NOM RFN ESN | — | x | — | x (7600-type PPUs) |
| ETN ERN | — | — | 6416 only (footnote †) | — |
| LRD SRD INPN RDSL RDCL FSJM FCJM IAPM OAPM and all `…L` 16-bit forms | x (L forms need CIPPU and 16-bit PPs: 990, 840, 850, 860) | — | — | — |

For a **6600 emulator**, implement the 6000 set: 00-23, 24/25 pass, 26 EXN, 27 RPN, 30-77 with the
6000 meanings. Do not implement MXN, MAN or SCF-CFM.

---------------------------------------------------------------------------------------------------

## 16. Ambiguities and open points (for the implementers)

1. **The K value in the 30-bit fill `SB0 B0+K`** is not printed. The assumption is `6100000000`.
   Verify it against a real COMPASS listing or binary.
2. **The 6600 behaviour for a 30-bit instruction starting in parcel 3** ("takes the first parcel of
   the current instruction"). COMPASS never generates this, so it matters only for hand-built code.
3. **22/23 shifts with |count| ≥ 64 give zero** (manual text). Compare this with DtCyber.
4. **The width of `NO n`**: the OCR says "lower 8 bits"; 9 bits (ijk) is likely.
5. **jk out of range**: the manual says warning in §8.4 and "type 7 error" in §8.4.25/26/41.
   Implement: < −60 is an error (type 7); > 63 is a warning plus the low 6 bits.
6. **`SA1 B2+0`-style explicit zero K**: assumed 30-bit. COMPASS performs no optimization (only R=
   does).
7. **Table 8-4 and Table 9-2** were reconstructed. The OCR x marks are unreliable.
8. **The 7600 PPU opcodes 00 and 75**, and whether EXN exists on the 7600, are not established by
   this chapter.
9. **The meaning of the `X` bit (bit 5 of d)** in IAM/OAM/IAPM/FSJM/FCJM is not explained in this
   manual (Cyber 170/180 option).
10. **FP rounding, the divide algorithm, and exact infinite/indefinite/underflow propagation** are
    hardware-level and only partly described. Take them from the 6600 hardware manual or the DtCyber
    `cpu.c` source.
11. **The PP adder's −0 behaviour** (whether it is subtractive) and the content of A after IAN
    (upper bits): check against DtCyber `pp.c`.
12. **Exchange-package bit positions** for RAE/FLE/MA and the exact EM field width are [HW]. Verify
    them.
13. Unconditional-branch detection for force upper: only `EQ K` / `ZR K` (the `0400K` encoding
    written without registers) is certain.
14. **CPU address-out-of-range behaviour** when exit-mode bit 48 is not selected (the read result and
    the suppressed store) is [HW]. Verify it.
