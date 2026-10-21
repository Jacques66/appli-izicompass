# Mini operating system

The mini system follows the organization of the CDC systems of the period
(SCOPE, NOS): the user program runs in the central processor; it requests
services by storing a word at RA+1; a peripheral processor, the monitor,
polls RA+1, performs the service and clears RA+1. Everything is written
in COMPASS and assembled by this assembler:

| Program | Location | Source |
|---|---|---|
| MTR, monitor | PP0 | `src/os/mtr.js` |
| DSD, console display | PP1 | `src/os/dsd.js` |
| SYSTEXT, CPU macros | system text | `src/os/systext.js` |
| COMCSYS, COMCCIO, COMCWTC, COMCRDC, COMCCDD, COMCCOD | common decks | `src/os/systext.js` |

## RA+1 requests

Word: `18/name, 1/0, 1/R, 4/0, 18/P2, 18/P1`.

| Request | Effect |
|---|---|
| MSG | message (P1 = address, 40 characters at most) to the dayfile and the console |
| END | normal end of job |
| ABT | abnormal end |
| RCL | recall (no effect) |
| TIM | elapsed milliseconds → word P1 |
| CLK, DAT | time ` HH.MM.SS.` and date ` YY/MM/DD.` → word P1 |
| MEM | field length (`30/FL,30/0`) → word P1 |
| CIO | input/output on the file environment table (FET) at P1 |

An unknown request ends the job with the message
` ILLEGAL RA+1 REQUEST.`

## Files

A FET occupies 5 words: `42/name,18/code`, then FIRST, IN, OUT, LIMIT
(addresses of the circular buffer). Functions: READ 010B, WRITE 014B,
WRITER 024B, WRITEF 034B, REWIND 050B; bit 0 of the code is set to 1 when
the function is complete.

- **OUTPUT**: the lines in the buffer (10-character words, each line
  ending with 12 zero bits) are printed on the 1612. The first character
  controls paper advance: `1` new page, `0` double space, any other
  character single space.
- **INPUT**: each READ reads one card from the 405 reader and stores it
  as one line. Code 011B normal, 021B end of record (7/8/9 card), 031B
  end of file (6/7/8/9 card or empty reader).

## Console

Left screen: header, date and time, job name and status, dayfile.
Right screen: CPU P register (read by the RPN instruction), RA, FL,
elapsed time, last message. On the keyboard, `DROP` followed by Enter
aborts the job.

## Memory map

| Address | Contents |
|---|---|
| 20B | dayfile index |
| 21B | status (1 running, 2 completed, 3 aborted) |
| 22B, 23B | job RA and FL |
| 24B, 25B | displayable time and date |
| 26B | milliseconds |
| 27B | job name |
| 30B-33B | last message |
| 34B | console command (1 = DROP) |
| 100B | job exchange package |
| 120B | idle exchange package (CPU stopped on PS at 140B) |
| 200B-377B | dayfile (32 lines of 4 words) |
| 2000B | job RA; program loaded at RA+100B |
