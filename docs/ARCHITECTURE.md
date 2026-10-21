# Architecture

Everything is written in JavaScript (ES modules), with no external dependencies. The
same code runs in Node (command-line tools, tests) and in the browser (IDE).

```
src/
  common/word.js      60/18/12-bit arithmetic, ones' complement (BigInt for 60 bits)
  common/charset.js   CDC display code, ASCII, external BCD, Hollerith (cards)
  cpu/float.js        6600 floating-point unit (add, mul, div, DP, rounding, normalization)
  cpu/cpu.js          central processor: X/A/B, P, RA/FL, exit mode, exchange jump,
                      ECS (RE/WE), CMU (IM/DM/CC/CU), instruction stack, timing
  cpu/scoreboard.js   timing model of the 6600 scoreboard
  cpu/disasm.js       CPU disassembler (COMPASS syntax)
  pp/pp.js            12-bit peripheral processor (barrel of 10 PPs)
  pp/disasm.js        PP disassembler
  io/channel.js       I/O channels (active/full, function, data)
  io/devices.js       peripherals: deadstart panel, 6612 console, 405 reader,
                      1612 line printer, 607 tape, 6603 disk, real-time clock
  machine.js          complete machine: central memory, ECS, CPU, PPs, channels,
                      scheduling (1 µs major cycle, 100 ns minor cycle)
  asm/compass.js      assembler entry point (see docs/API.md)
  asm/assembler.js    core: passes, blocks, counters, symbols, emission, relocation
  asm/source.js       lines, continuations, editing (concatenation, micros), fields
  asm/expr.js         expressions, constants, character and numeric data
  asm/cpuops.js       syntax table of the CPU instructions (same model as CPOP)
  asm/cpuasm.js       subfield analysis and CPU encoding
  asm/ppops.js        PP instruction table; asm/ppasm.js: PP encoding
  asm/pseudos.js      pseudo instructions
  asm/macros.js       MACRO, MACROE, OPDEF, LOCAL, IRP, DUP, ECHO, RMT
  asm/frames.js       stacked sources (text, expansion, duplication, remote code)
  asm/listing.js      COMPASS listing; asm/binary.js: loader tables
  loader/loader.js    linking and loading (relocatable, absolute, PP)
  os/systext.js       SYSTEXT system text and common decks (COMPASS)
  os/mtr.js           MTR monitor (PP0); os/dsd.js: DSD console (PP1)
  os/dsl.js           deadstart loader and system tape construction
  os/system.js        job startup (direct or by deadstart)
  runtime/runner.js   run modes and control for the IDE
ide/                  COMPASS Workbench (web IDE): editor, assembly, listing, debugger, console
ide/ref/              integrated COMPASS reference (Documentation tab, F1 help)
cli/                  compass (assembler) and cdc6600 (execution) command-line tools
test/                 tests (node --test)
ide/examples/         example programs
docs/spec/            specifications drawn from COMPASS manual 60492600 M (1986)
```

Reference sources:
- *COMPASS Version 3 Reference Manual*, CDC 60492600 revision M (1986), bitsavers.
- *6000 Series Computer Systems Hardware Reference Manual*, CDC 60100000.
- Hardware behavior checked by comparison with the DtCyber emulator (GPL),
  consulted read-only; none of its code is reused.
