# COMPASS Guide

This guide summarizes what is needed to write programs with this
assembler. The detailed rules, drawn from CDC manual 60492600 M, are in
`docs/spec/`. The COMPASS Workbench also includes a searchable COMPASS
reference (Documentation tab; F1 opens the page for the word under the
cursor).

## Line format

| Columns | Contents |
|---|---|
| 1 | `*`: comment line; `,`: continuation of the previous statement |
| 1-9 | location field (symbol), optional; may start in column 2 |
| 11- | operation field |
| 18- | variable field (subfields separated by commas) |
| 30- | comments |
| 73-90 | sequence (ignored, reproduced in the listing) |

Only columns 1 to 72 are read. Fields are separated by blanks; if nothing
appears before column 30 (changed by `COL`), the rest is a comment. A
statement continues over at most 9 lines, each with `,` in column 1: the
break falls exactly at column 72. Lowercase letters are converted to
uppercase.

Special characters: `_` concatenation mark, `"NAME"` micro reference,
`&` exclusive OR, `#` hexadecimal prefix.

## Symbols and expressions

A symbol has 1 to 8 characters, does not start with a digit or with `$`,
`=`, `:`, and does not contain `+ - * / , _ &` or a blank. `A0`-`A7`,
`B0`-`B7`, `X0`-`X7` are registers in a CPU program.

Expression: terms joined by `+`, `-`, `&`; a term is a sequence of
elements joined by `*` and `/` (evaluated left to right, no parentheses).
Elements: symbol, constant, `*` (location counter), `*O` (origin), `*P`
(position), `$`, literal `=…`, register.

Constants: `17` (current base, decimal by default), `17B` octal, `17D`
decimal, `1.5E3` floating, `1S20` (×2²⁰), `0#FF` hexadecimal, `3RABC`
(characters right-justified), `5HTEXT` (left-justified, blank-filled),
`0LNAME` (left-justified, zero-filled).

## Programs

```
          IDENT  NAME         relocatable (default)
          IDENT  NAME         absolute CPU:
          ABS                  followed by ABS
          IDENT  NAME,100B     12-bit PP program:
          PERIPH               followed by PERIPH
          ...
          END    START        start address (relocatable)
```

An absolute program sets its addresses with `ORG`. A relocatable program
declares its entry points with `ENTRY` and its external references with
`EXT` (or `=Xname`). The loader places relocatable programs at RA+100B,
one after the other.

## Data and reservation

```
 TAB      DATA   1,2,3.5,10HABCDEFGHIJ    data words
 MSG      DIS    ,*TEXT ENDED BY 12 ZERO BITS*
 AREA     BSS    100B                      reservation
 ZERO     BSSZ   10                        zero words
 WORD     VFD    12/1,18/TAB,30/-1         fields of any size
 ADDR     CON    TAB,TAB+1                 one word per expression
 VAL      EQU    77B                       permanent symbol
 N        SET    N+1                       redefinable symbol
          SA1    =10HLITERAL               literal
```

## CPU instructions (examples)

```
          SA1    X        read X into X1 (A1 = address)
          SA6    Y        store X6 at Y (A6 = address)
          SX6    B1+5     X6 = B1 + 5 (18 bits, sign extended)
          SB2    B2+1
          IX6    X1+X2    60-bit integer
          FX3    X1*X2    floating (NX3 X3 to normalize)
          BX6    X1*X2    logical AND
          LX6    6        left circular shift by 6 bits
          ZR     X1,DONE  jump if X1 is zero
          NE     B1,B2,LOOP
          RJ     SUB      return jump
          EQ     SUB      return (word SUB holds the return jump)
          PS               stop
```

A jump, `RJ`, `PS`, `XJ` force the next instruction upper; unused
parcels are filled with `NO` (46000).

## PP instructions (examples)

```
          LDN    5        A = 5
          LDC    123456B  A = 18-bit constant
          LDD    T1       A = direct cell T1 (address 0-77B)
          STM    TAB,T1   TAB+(T1) = A
          CRD    W        read CM word at address (A) into W..W+4
          FNC    7000B,10B  function on channel 10B
          ACN    10B
          OAM    BUF,10B  output (A) words
          DCN    10B
          NJN    LOOP     relative jump (±31 words)
          RJM    SUB      return jump (word SUB = return address)
```

## Macros, micros, conditional assembly

```
 SUM      MACRO  A,B,C
          SA1    A
          SA2    B
          IX6    X1+X2
          SA6    C
          ENDM
          SUM    X,Y,Z

 GEN      MACRO  P
          LOCAL  HERE1        unique symbol on each call
 HERE1    SB1    B1+P
          NZ     B1,HERE1
          ENDM

 TITL     MICRO  1,5,*HELLO*
          DATA   0L"TITL"

          IFEQ   N,3          assembled if N = 3
          SX7    1
          ELSE
          SX7    2
          ENDIF

          DUP    3            repeat 3 times
          NO
          ENDD
          ECHO   ,R=(1,2,3)   once per value
          SX_R   B0+R
          ENDD
```

`OPDEF` redefines a CPU instruction form (`MXQ OPDEF REG,VAL`);
`CPOP`/`PPOP` add operation codes; `OPSYN` creates a synonym.

## System text and system calls

The `SYSTEXT` system text is loaded at the start of every assembly. It
provides the macros that call the mini system (see `docs/SYSTEM.md`):

```
 START    MESSAGE MSG             message to the dayfile
          WRITEC OUTPUT,LINE      one line on the line printer
          READC  INPUT,CARD,9     one card (X1 = 0, or -1 at end)
          SX1    123
          CDD                     X6 = '       123'
          WRITER OUTPUT
          ENDRUN
 OUTPUT   FILEC  BUFFER,101B      file environment table
```

The required routines (SYS=, CIO=, WTC=, RDC=, CDD=...) are added
automatically at the end of the program, or included explicitly with
`XTEXT COMCSYS` and so on.

## Listing

Columns: error flags (1-3), `L` if the location counter differs from
the origin counter, address (octal), octal code (parcel p in column
12+5p), relocation indicator (`+`, `-`, `C` common, `X` external), then
the source line. The `LIST` options (A, B, C, D, E, F, G, L, M, N, R, S,
T, X) control what is listed; the default is B, L, N, R.

Fatal error flags: A (variable field), D (doubly defined), E (nesting),
F (table overflow), L (location field), N (negative entry point),
O (operation), P (ERR), R (data outside a block), U (undefined symbol),
V (VFD). Warnings: 1 to 9.
