# Internal API contract

## Assembler — `src/asm/compass.js`

```js
import { assemble } from './src/asm/compass.js';

const r = assemble(source, {
  fileName: 'PROG',        // name shown in the listing
  texts: { SYSTEXT: '…' }, // external texts (XTEXT / system texts), name -> source
  systemText: 'SYSTEXT',   // system text loaded at the start (equivalent of G=/S=), or null
  list: 'BLR',             // default listing options (like COMPASS LO=)
  date: new Date(),        // for the DATE/JDATE/TIME micros
});
```

Result:

```js
{
  ok: true,                // no fatal (letter) error
  errors: [                // all errors and warnings
    { line: 12,            // source line (1 = first line of the main file)
      file: 'PROG',        // file (external text, if any)
      flag: 'U',           // letter (fatal) or digit 1-9 (informative)
      fatal: true,
      message: 'UNDEFINED SYMBOL. VALUE ASSUMED 0.' },
  ],
  listing: '…',            // complete listing in COMPASS format (text)
  lines: [                 // listing <-> source mapping for the IDE
    { line: 12, file: 'PROG', block: 'PROGRAM*', address: 0o100, // or null
      octal: ['7160000005', '46000'], parcel: 0, flags: 'U', text: '…' },
  ],
  symbols: [
    { name: 'START', qual: '', value: 0o100, kind: 'rel' | 'abs' | 'ext' | 'set',
      block: 'PROGRAM*', line: 5, refs: [7, 9] },
  ],
  programs: [              // one element per subprogram (IDENT…END)
    { name: 'PROG',
      type: 'reloc' | 'abs' | 'pp',
      machine: '6',
      origin: 0o100,        // address of the first word (abs/pp) or 0 (reloc)
      entry: 0o100,         // start address (abs/pp), or name (reloc)
      length: 0o20,
      image: { start: 0o100, words: [/* BigInt (CPU) or Number (12-bit PP) */] },
      overlays: [ /* same shape as image + name/origin/entry/levels for overlays */ ],
      binary: [ /* 60-bit words of the loadable binary (loader tables) */ ],
      entries: [{ name, value }],
      externals: ['NAME'],
    },
  ],
}
```

## Loader — `src/loader/loader.js`

```js
import { linkAndLoad } from './src/loader/loader.js';
const { entry, fl, map } = linkAndLoad(machine, programs, { ra: 0o1000, libraries: [] });
```

## Machine — `src/machine.js`

See the code: `new Machine(config)`, `run(us, opts)`, `stepCPU()`, `stepPP(n)`,
`deadstart(panelWords)`, `loadPP(n, words, origin)`, `startPP(n, addr)`,
`startCPU({P, RA, FL, EM, ...})`, `status()`, peripherals `console`, `cardReader`,
`printer`, `tapes`, breakpoints `cpuBreakpoints` (absolute addresses),
`ppBreakpoints` (Map pp -> Set), `watchpoints`.
