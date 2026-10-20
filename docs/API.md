# Contrat d'API interne

## Assembleur — `src/asm/compass.js`

```js
import { assemble } from './src/asm/compass.js';

const r = assemble(source, {
  fileName: 'PROG',        // nom affiché dans le listing
  texts: { SYSTEXT: '…' }, // textes externes (XTEXT / textes système), nom -> source
  systemText: 'SYSTEXT',   // texte système chargé au début (équivalent G=/S=), ou null
  list: 'BLR',             // options de listing par défaut (comme LO= du COMPASS)
  date: new Date(),        // pour les micros DATE/JDATE/TIME
});
```

Résultat :

```js
{
  ok: true,                // aucune erreur fatale (lettre)
  errors: [                // toutes les erreurs et avertissements
    { line: 12,            // ligne source (1 = première ligne du fichier principal)
      file: 'PROG',        // fichier (texte externe éventuel)
      flag: 'U',           // lettre (fatale) ou chiffre 1-9 (informatif)
      fatal: true,
      message: 'UNDEFINED SYMBOL. VALUE ASSUMED 0.' },
  ],
  listing: '…',            // listing complet au format COMPASS (texte)
  lines: [                 // correspondance listing <-> source pour l'IDE
    { line: 12, file: 'PROG', block: 'PROGRAM*', address: 0o100, // ou null
      octal: ['7160000005', '46000'], parcel: 0, flags: 'U', text: '…' },
  ],
  symbols: [
    { name: 'START', qual: '', value: 0o100, kind: 'rel' | 'abs' | 'ext' | 'set',
      block: 'PROGRAM*', line: 5, refs: [7, 9] },
  ],
  programs: [              // un élément par sous-programme (IDENT…END)
    { name: 'PROG',
      type: 'reloc' | 'abs' | 'pp',
      machine: '6',
      origin: 0o100,        // adresse du premier mot (abs/pp) ou 0 (reloc)
      entry: 0o100,         // adresse de lancement (abs/pp), ou nom (reloc)
      length: 0o20,
      image: { start: 0o100, words: [/* BigInt (CPU) ou Number (PP 12 bits) */] },
      overlays: [ /* même forme que image + name/origin/entry/levels pour les overlays */ ],
      binary: [ /* mots 60 bits du binaire chargeable (tables chargeur) */ ],
      entries: [{ name, value }],
      externals: ['NAME'],
    },
  ],
}
```

## Chargeur — `src/loader/loader.js`

```js
import { linkAndLoad } from './src/loader/loader.js';
const { entry, fl, map } = linkAndLoad(machine, programs, { ra: 0o1000, libraries: [] });
```

## Machine — `src/machine.js`

Voir le code : `new Machine(config)`, `run(us, opts)`, `stepCPU()`, `stepPP(n)`,
`deadstart(panelWords)`, `loadPP(n, words, origin)`, `startPP(n, addr)`,
`startCPU({P, RA, FL, EM, ...})`, `status()`, périphériques `console`, `cardReader`,
`printer`, `tapes`, points d'arrêt `cpuBreakpoints` (adresses absolues),
`ppBreakpoints` (Map pp -> Set), `watchpoints`.
