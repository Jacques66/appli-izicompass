# Emulated machine

## Central processor

- Registers X0-X7 (60 bits), A0-A7 and B0-B7 (18 bits, B0 = 0), P (18 bits).
  Setting A1-A5 reads memory into X1-X5; setting A6-A7 stores X6-X7.
- Ones' complement arithmetic (subtractive adder); 60-bit floating
  point: sign, 11-bit exponent biased by 2000B, 48-bit integer
  coefficient; infinite (3777B), indefinite (1777B), double precision (DX),
  rounding (RX), normalization (NX, ZX), pack/unpack (PX, UX).
- Relative memory: RA/FL; an out-of-range address or an infinite or
  indefinite operand → error exit if the exit mode (EM) selects it
  (word stored at RA, stop, or exchange to MA with CEJ/MEJ).
- Exchange jump: 16-word package (P, RA, FL, EM, RAE, FLE, MA, A, B, X).
- ECS: RE/WE (block transfers, error exit on the lower half of the word).
- Models: `6600` (8-word instruction stack, *scoreboard*),
  `6600CEJ` (with XJ), `6400`, `cyber73`, `cyber173` (CMU: IM, DM, CC, CU),
  `cyber175`.
- The 6600 executes instructions in the stack without reading memory
  again: an instruction modified by the program inside a loop already in
  the stack is not seen, as on the real machine.
- Timing: scoreboard model (functional units, manual timings, first- and
  second-order conflicts, branches in or out of the stack). Simulated
  time is expressed in 100 ns minor cycles.

## Peripheral processors

Ten PPs (PP00-PP11 in octal), 4096-word 12-bit memory, 18-bit A.
All 6000 series instructions: relative and absolute jumps, direct,
indirect and indexed addressing, CRD/CRM/CWD/CWM, channels (AJM, IJM,
FJM, EJM, IAN, IAM, OAN, OAM, ACN, DCN, FAN, FNC), EXN, RPN. Block
transfers save P in location 0, and a PP hangs on a channel in the cases
defined by the hardware. Each PP has one slot per major cycle (1 µs);
instruction times are those of the 6600.

## Deadstart

The panel sends its words on channel 0: they are loaded into PP0
starting at address 1, then PP0 starts at 1. The other PPs wait to be
loaded on their channel (IAM), as on the real machine.

## Channels and peripherals

| Channel | Equipment | Functions |
|---|---|---|
| 0 | deadstart panel | — |
| 10B | 6612 console | 7000B/7001B/7002B left screen (small, medium, large characters), 7100B-7102B right screen, 7010B/7110B dots, 7020B keyboard. Words 60xxB = X, 70xxB = Y (Y increasing upward), otherwise two display characters |
| 12B | 405 reader | 700B deselect, 702B read (80 12-bit Hollerith columns), 704B status |
| 12B | 1612 line printer | 600B select, 601B single space, 602B double space, 604B page eject, 605B print (characters in external BCD) |
| 13B | 607 tapes (units 0-3) | 2000B+u select, 2010B write, 2020B read, 2030B backspace, 2060B rewind, 2100B status, 2610B file mark |
| 13B | 6603 disk | 1000B+s read sector s, 1200B+s write, 1400B+t track, 1600B+h head, 1700B status (sector under the head); 128 tracks, 8 heads, 128 or 100 sectors of 322 words |
| 14B | real-time clock | IAN 14B: microseconds modulo 4096 |

Tapes are imported and exported in `.tap` format.
