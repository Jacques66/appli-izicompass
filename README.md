# CDC 6600 — emulator, COMPASS 3 assembler and integrated workbench

Software reconstruction of the CDC 6600 (1964) and of its COMPASS assembler:

- **Emulator**: 60-bit central processor (X/A/B, P, RA/FL, exit mode,
  exchange jump, ECS, Cyber 70 CMU, 8-word instruction stack, *scoreboard*
  timing model), ten 12-bit peripheral processors in a barrel, I/O
  channels, deadstart, two-screen 6612 console, 405 card reader, 1612 line
  printer, 607 tape units, real-time clock.
- **COMPASS 3 assembler** faithful to CDC manual 60492600 revision M:
  CPU and PP instructions, all pseudo instructions (IDENT, ABS,
  PERIPH, USE, ORG, LOC, POS, BSS, BSSZ, DATA, DIS, CON, VFD, LIT, R=, REP,
  EQU, SET, MAX, MIN, MICCNT, QUAL, BASE, CODE, CHAR, COL, IF/IFxx/IFC,
  ELSE, ENDIF, SKIP, ERR/ERRxx, LIST, TITLE, TTL, EJECT, SPACE, MACRO,
  MACROE, OPDEF, LOCAL, IRP, DUP, ECHO, STOPDUP, RMT, HERE, XTEXT, MICRO,
  DECMIC, OCTMIC, CPOP, PPOP, OPSYN, CPSYN, NIL, PURGMAC, PURGDEF...),
  literals, default symbols (=S, =X, =Y), local and common blocks,
  relocatable, absolute and PP programs, overlays, CDC-format listing
  with cross-reference table, binary in loader tables.
- **Relocating loader** with linking (entry points, externals,
  common blocks, replication).
- **Mini operating system** written in COMPASS: MTR monitor (PP0)
  serving RA+1 requests in the manner of NOS (MSG, END, ABT, RCL, TIM,
  CLK, DAT, MEM, CIO on the INPUT and OUTPUT files), DSD console display
  (PP1), macro system text (SYSTEM, MESSAGE, ENDRUN, FILEC, READ,
  WRITE, WRITER, READC, WRITEC, CDD...) and common decks.
- **COMPASS Workbench (web IDE)**: COMPASS editor, assembly, listing,
  symbols, CPU and PP debugger, memory, channels, 6612 console, line
  printer, cards, tapes. An integrated, searchable COMPASS reference
  (Documentation tab) covers the language, the pseudo instructions, the
  CPU and PP instructions and the system text macros: F1 opens the page for the word under the cursor, Shift+F1 lists the
  keyboard shortcuts.

No external dependencies: JavaScript (ES modules) for Node 18+ and
current browsers.

## Getting started

```bash
node tools/serve.js
```

Then open http://localhost:6600/ide/ . The standalone single-file
version is built with:

```bash
node tools/build.js
```

and opens directly from disk: `dist/cdc6600-ide.html`.

## Command line

Assemble a program (listing on standard output, errors on standard
error):

```bash
node cli/compass.js program.cmp -l program.lst -b program.bin
```

Assemble and run under the mini system, with a card deck:

```bash
node cli/cdc6600.js test/fixtures/copy.cmp --cards test/fixtures/copy.cards --console
```

Modes: `--mode system` (default for a CPU program), `--mode cpu`
(bare machine, stops on PS), `--mode pp` (PP program loaded into PP0).

## Tests

```bash
npm test
```

The tests cover the coded examples of the COMPASS manual (more than one
hundred CPU and PP instructions, data, character codes), end-to-end
assemblies run by the emulator, the mini system and the IDE. The
`tools/` directory also contains `corpus.mjs`, which assembles real NOS
programs.

## Documentation

- [docs/COMPASS-GUIDE.md](docs/COMPASS-GUIDE.md) — writing COMPASS with this assembler.
- [docs/HARDWARE.md](docs/HARDWARE.md) — emulated machine: CPU, PP, channels, peripherals.
- [docs/SYSTEM.md](docs/SYSTEM.md) — mini system: RA+1 requests, files, console.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — code organization.
- [docs/API.md](docs/API.md) — internal API contract (assembler, loader, machine).
- [docs/spec/](docs/spec/) — detailed specifications drawn from the COMPASS 3 manual.

## Sources

- *COMPASS Version 3 Reference Manual*, Control Data, 60492600 revision M (1986).
- *6000 Series Computer Systems Hardware Reference Manual*, Control Data, 60100000.
- Fine hardware behavior (floating-point arithmetic, exchanges, channels)
  cross-checked against the DtCyber emulator, consulted read-only.
