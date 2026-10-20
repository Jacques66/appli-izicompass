# CDC 6600 — émulateur, assembleur COMPASS 3 et atelier intégré

Reconstitution logicielle du CDC 6600 (1964) et de son assembleur COMPASS :

- **Émulateur** : unité centrale 60 bits (X/A/B, P, RA/FL, mode de sortie,
  exchange jump, ECS, CMU des Cyber 70, pile d'instructions de 8 mots,
  modèle temporel du *scoreboard*), dix processeurs périphériques 12 bits
  en barillet, canaux d'E/S, deadstart, console 6612 à deux écrans, lecteur
  de cartes 405, imprimante 1612, dérouleurs de bande 607, horloge temps réel.
- **Assembleur COMPASS 3** fidèle au manuel CDC 60492600 révision M :
  instructions CPU et PP, toutes les pseudo-instructions (IDENT, ABS,
  PERIPH, USE, ORG, LOC, POS, BSS, BSSZ, DATA, DIS, CON, VFD, LIT, R=, REP,
  EQU, SET, MAX, MIN, MICCNT, QUAL, BASE, CODE, CHAR, COL, IF/IFxx/IFC,
  ELSE, ENDIF, SKIP, ERR/ERRxx, LIST, TITLE, TTL, EJECT, SPACE, MACRO,
  MACROE, OPDEF, LOCAL, IRP, DUP, ECHO, STOPDUP, RMT, HERE, XTEXT, MICRO,
  DECMIC, OCTMIC, CPOP, PPOP, OPSYN, CPSYN, NIL, PURGMAC, PURGDEF…),
  littéraux, symboles par défaut (=S, =X, =Y), blocs locaux et communs,
  programmes relogeables, absolus et PP, overlays, listing au format CDC
  avec table des références, binaire en tables du chargeur.
- **Chargeur** relogeable avec édition de liens (points d'entrée, externes,
  blocs communs, réplication).
- **Mini-système d'exploitation** écrit en COMPASS : moniteur MTR (PP0)
  servant les demandes RA+1 à la manière de NOS (MSG, END, ABT, RCL, TIM,
  CLK, DAT, MEM, CIO sur les fichiers INPUT et OUTPUT), affichage console
  DSD (PP1), texte système de macros (SYSTEM, MESSAGE, ENDRUN, FILEC, READ,
  WRITE, WRITER, READC, WRITEC, CDD…) et decks communs.
- **Atelier (IDE) web** : éditeur COMPASS, assemblage, listing, symboles,
  débogueur CPU et PP, mémoire, canaux, console 6612, imprimante, cartes,
  bandes, documentation intégrée.

Aucune dépendance externe : JavaScript (modules ES) pour Node 18+ et les
navigateurs récents.

## Démarrage

```bash
node tools/serve.js
```

Ouvrir ensuite http://localhost:6600/ide/ . La version autonome en un seul
fichier se construit par :

```bash
node tools/build.js
```

et s'ouvre directement depuis le disque : `dist/cdc6600-ide.html`.

## Ligne de commande

Assembler un programme (listing sur la sortie standard, erreurs sur la
sortie d'erreur) :

```bash
node cli/compass.js programme.cmp -l programme.lst -b programme.bin
```

Assembler et exécuter sous le mini-système, avec un paquet de cartes :

```bash
node cli/cdc6600.js test/fixtures/copy.cmp --cards test/fixtures/copy.cards --console
```

Modes : `--mode systeme` (défaut pour un programme CPU), `--mode cpu`
(machine nue, arrêt sur PS), `--mode pp` (programme PP chargé dans PP0).

## Tests

```bash
npm test
```

Les tests reprennent les exemples codés du manuel COMPASS (plus de cent
instructions CPU et PP, données, codes de caractères), des assemblages de
bout en bout exécutés par l'émulateur, le mini-système et l'IDE. Le dossier
`tools/` contient aussi `corpus.mjs`, qui assemble de vrais programmes NOS.

## Documentation

- [docs/GUIDE-COMPASS.md](docs/GUIDE-COMPASS.md) — écrire en COMPASS avec cet assembleur.
- [docs/MATERIEL.md](docs/MATERIEL.md) — machine émulée : CPU, PP, canaux, périphériques.
- [docs/SYSTEME.md](docs/SYSTEME.md) — mini-système : demandes RA+1, fichiers, console.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — organisation du code.
- [docs/spec/](docs/spec/) — spécifications détaillées extraites du manuel COMPASS 3.

## Sources

- *COMPASS Version 3 Reference Manual*, Control Data, 60492600 révision M (1986).
- *6000 Series Computer Systems Hardware Reference Manual*, Control Data, 60100000.
- Comportement fin du matériel (arithmétique flottante, échanges, canaux)
  recoupé avec l'émulateur DtCyber, consulté en lecture seule.
