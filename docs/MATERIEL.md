# Machine émulée

## Unité centrale

- Registres X0-X7 (60 bits), A0-A7 et B0-B7 (18 bits, B0 = 0), P (18 bits).
  Charger A1-A5 lit la mémoire dans X1-X5 ; charger A6-A7 y écrit X6-X7.
- Arithmétique en complément à un (additionneur soustractif) ; flottant
  60 bits : signe, exposant 11 bits biaisé de 2000B, coefficient entier de
  48 bits ; infini (3777B), indéfini (1777B), double précision (DX),
  arrondi (RX), normalisation (NX, ZX), paquetage (PX, UX).
- Mémoire relative : RA/FL ; adresse hors limites, opérande infini ou
  indéfini → sortie d'erreur si le mode de sortie (EM) la sélectionne
  (mot écrit en RA, arrêt, ou échange vers MA avec CEJ/MEJ).
- Exchange jump : paquet de 16 mots (P, RA, FL, EM, RAE, FLE, MA, A, B, X).
- ECS : RE/WE (transferts de blocs, sortie d'erreur sur la moitié basse du mot).
- Modèles : `6600` (pile d'instructions de 8 mots, *scoreboard*),
  `6600CEJ` (avec XJ), `6400`, `cyber73`, `cyber173` (CMU : IM, DM, CC, CU),
  `cyber175`.
- Le 6600 exécute les instructions dans la pile sans relire la mémoire :
  une instruction modifiée par le programme dans une boucle déjà présente
  dans la pile n'est pas vue, comme sur la machine réelle.
- Chronométrage : modèle du tableau de marque (unités fonctionnelles, temps
  du manuel, conflits de premier et second ordre, branchements dans ou hors
  de la pile). Le temps simulé s'exprime en cycles mineurs de 100 ns.

## Processeurs périphériques

Dix PP (PP00-PP11 en octal), mémoire de 4096 mots de 12 bits, A sur
18 bits. Toutes les instructions de la série 6000 : sauts relatifs et
absolus, adressages direct, indirect et indexé, CRD/CRM/CWD/CWM,
canaux (AJM, IJM, FJM, EJM, IAN, IAM, OAN, OAM, ACN, DCN, FAN, FNC), EXN,
RPN. Les transferts de blocs sauvegardent P dans l'emplacement 0, et un PP
reste suspendu sur un canal dans les cas prévus par le matériel. Chaque PP
dispose d'un créneau par cycle majeur (1 µs) ; les durées d'instruction
sont celles du 6600.

## Deadstart

Le panneau envoie ses mots sur le canal 0 : ils sont chargés dans PP0 à
partir de l'adresse 1, puis PP0 démarre en 1. Les autres PP attendent
d'être chargés sur leur canal (IAM), comme sur la machine réelle.

## Canaux et périphériques

| Canal | Équipement | Fonctions |
|---|---|---|
| 0 | panneau de deadstart | — |
| 10B | console 6612 | 7000B/7001B/7002B écran gauche (petits, moyens, grands caractères), 7100B-7102B écran droit, 7010B/7110B points, 7020B clavier. Mots 60xxB = X, 70xxB = Y (Y croissant vers le haut), sinon deux caractères display |
| 12B | lecteur 405 | 700B désélection, 702B lecture (80 colonnes Hollerith de 12 bits), 704B état |
| 12B | imprimante 1612 | 600B sélection, 601B simple, 602B double, 604B saut de page, 605B impression (caractères en BCD externe) |
| 13B | bandes 607 (unités 0-3) | 2000B+u sélection, 2010B écriture, 2020B lecture, 2030B recul, 2060B rebobinage, 2100B état, 2610B marque de fichier |
| 13B | disque 6603 | 1000B+s lecture du secteur s, 1200B+s écriture, 1400B+t piste, 1600B+h tête, 1700B état (secteur sous la tête) ; 128 pistes, 8 têtes, 128 ou 100 secteurs de 322 mots |
| 14B | horloge temps réel | IAN 14B : microsecondes modulo 4096 |

Les bandes s'importent et s'exportent au format `.tap`.
