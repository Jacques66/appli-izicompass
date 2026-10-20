# Architecture

Tout est écrit en JavaScript (ES modules), sans dépendance externe. Le même code
tourne dans Node (outils en ligne de commande, tests) et dans le navigateur (IDE).

```
src/
  common/word.js      arithmétique 60/18/12 bits, complément à un (BigInt pour 60 bits)
  common/charset.js   code display CDC, ASCII, BCD externe, Hollerith (cartes)
  cpu/float.js        unité flottante 6600 (add, mul, div, DP, arrondi, normalisation)
  cpu/cpu.js          unité centrale : X/A/B, P, RA/FL, mode de sortie, exchange jump,
                      ECS (RE/WE), CMU (IM/DM/CC/CU), pile d'instructions, chronométrage
  cpu/scoreboard.js   modèle temporel du tableau de marque (scoreboard) du 6600
  cpu/disasm.js       désassembleur CPU (syntaxe COMPASS)
  pp/pp.js            processeur périphérique 12 bits (barillet de 10 PP)
  pp/disasm.js        désassembleur PP
  io/channel.js       canaux d'E/S (actif/plein, fonction, données)
  io/devices.js       périphériques : panneau deadstart, console 6612, lecteur 405,
                      imprimante 1612, bande 607, disque 6603, horloge temps réel
  machine.js          machine complète : mémoire centrale, ECS, CPU, PP, canaux,
                      ordonnancement (cycle majeur 1 µs, cycle mineur 100 ns)
  asm/compass.js      point d'entrée de l'assembleur (voir docs/API.md)
  asm/assembler.js    cœur : passes, blocs, compteurs, symboles, émission, relocation
  asm/source.js       lignes, continuations, édition (concaténation, micros), champs
  asm/expr.js         expressions, constantes, données caractère et numériques
  asm/cpuops.js       table syntaxique des instructions CPU (même modèle que CPOP)
  asm/cpuasm.js       analyse des sous-champs et codage CPU
  asm/ppops.js        table des instructions PP ; asm/ppasm.js : codage PP
  asm/pseudos.js      pseudo-instructions
  asm/macros.js       MACRO, MACROE, OPDEF, LOCAL, IRP, DUP, ECHO, RMT
  asm/frames.js       sources empilées (texte, expansion, duplication, code distant)
  asm/listing.js      listing COMPASS ; asm/binary.js : tables du chargeur
  loader/loader.js    édition de liens et chargement (relogeable, absolu, PP)
  os/systext.js       texte système SYSTEXT et decks communs (COMPASS)
  os/mtr.js           moniteur MTR (PP0) ; os/dsd.js : console DSD (PP1)
  os/dsl.js           chargeur de deadstart et construction de la bande système
  os/system.js        lancement d'un travail (direct ou par deadstart)
  runtime/runner.js   modes d'exécution et pilotage pour l'IDE
ide/                  IDE web : éditeur, assemblage, listing, débogueur, console
cli/                  compass (assembleur) et cdc6600 (exécution) en ligne de commande
test/                 tests (node --test)
ide/examples/         programmes d'exemple
docs/spec/            spécifications extraites du manuel COMPASS 60492600 M (1986)
```

Sources de référence :
- *COMPASS Version 3 Reference Manual*, CDC 60492600 révision M (1986), bitsavers.
- *6000 Series Computer Systems Hardware Reference Manual*, CDC 60100000.
- Comportement matériel vérifié par comparaison avec l'émulateur DtCyber (GPL),
  consulté en lecture seule ; aucun code n'en est repris.
