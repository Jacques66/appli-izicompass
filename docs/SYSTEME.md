# Mini-système d'exploitation

Le mini-système reprend l'organisation des systèmes CDC de l'époque (SCOPE,
NOS) : le programme de l'utilisateur tourne dans l'unité centrale ; il
demande des services en déposant un mot en RA+1 ; un processeur
périphérique, le moniteur, scrute RA+1, rend le service et remet RA+1 à
zéro. Tout est écrit en COMPASS et assemblé par cet assembleur :

| Programme | Emplacement | Source |
|---|---|---|
| MTR, moniteur | PP0 | `src/os/mtr.js` |
| DSD, affichage console | PP1 | `src/os/dsd.js` |
| SYSTEXT, macros CPU | texte système | `src/os/systext.js` |
| COMCSYS, COMCCIO, COMCWTC, COMCRDC, COMCCDD, COMCCOD | decks communs | `src/os/systext.js` |

## Demandes RA+1

Mot : `18/nom, 1/0, 1/R, 4/0, 18/P2, 18/P1`.

| Demande | Effet |
|---|---|
| MSG | message (P1 = adresse, 40 caractères au plus) au journal et à la console |
| END | fin normale du travail |
| ABT | fin anormale |
| RCL | rappel (sans effet) |
| TIM | millisecondes écoulées → mot P1 |
| CLK, DAT | heure ` HH.MM.SS.` et date ` AA/MM/JJ.` → mot P1 |
| MEM | longueur du champ (`30/FL,30/0`) → mot P1 |
| CIO | entrée-sortie sur le bloc de description de fichier (FET) P1 |

Une demande inconnue met fin au travail avec le message
` DEMANDE RA+1 ILLEGALE.`

## Fichiers

Un FET occupe 5 mots : `42/nom,18/code`, puis FIRST, IN, OUT, LIMIT
(adresses du tampon circulaire). Fonctions : READ 010B, WRITE 014B,
WRITER 024B, WRITEF 034B, REWIND 050B ; le bit 0 du code passe à 1 quand
la fonction est terminée.

- **OUTPUT** : les lignes du tampon (mots de 10 caractères, chaque ligne se
  terminant par 12 bits nuls) sont imprimées sur la 1612. Le premier
  caractère est le contrôle de l'avance du papier : `1` nouvelle page,
  `0` double interligne, autre caractère simple interligne.
- **INPUT** : chaque READ lit une carte du lecteur 405 et la range en une
  ligne. Code 011B normal, 021B fin d'enregistrement (carte 7/8/9), 031B
  fin de fichier (carte 6/7/8/9 ou lecteur vide).

## Console

Écran gauche : en-tête, date et heure, nom et état du travail, journal.
Écran droit : registre P du CPU (lu par l'instruction RPN), RA, FL, temps
écoulé, dernier message. Au clavier, `DROP` suivi d'Entrée abandonne le
travail.

## Carte mémoire

| Adresse | Contenu |
|---|---|
| 20B | indice du journal |
| 21B | état (1 en cours, 2 terminé, 3 abandonné) |
| 22B, 23B | RA et FL du travail |
| 24B, 25B | heure et date affichables |
| 26B | millisecondes |
| 27B | nom du travail |
| 30B-33B | dernier message |
| 34B | commande de la console (1 = DROP) |
| 100B | paquet d'échange du travail |
| 120B | paquet d'échange de repos (CPU arrêté sur PS en 140B) |
| 200B-377B | journal (32 lignes de 4 mots) |
| 2000B | RA du travail ; programme chargé à RA+100B |
