# Guide COMPASS

Ce guide résume ce qu'il faut savoir pour écrire des programmes avec cet
assembleur. Les règles détaillées, tirées du manuel CDC 60492600 M, sont
dans `docs/spec/`.

## Format des lignes

| Colonnes | Contenu |
|---|---|
| 1 | `*` : ligne de commentaire ; `,` : suite de l'instruction précédente |
| 1-9 | champ location (symbole), facultatif ; peut commencer en colonne 2 |
| 11- | champ opération |
| 18- | champ variable (sous-champs séparés par des virgules) |
| 30- | commentaire |
| 73-90 | séquence (ignorée, reproduite au listing) |

Seules les colonnes 1 à 72 sont lues. Les champs sont séparés par des
blancs ; si rien n'apparaît avant la colonne 30 (modifiable par `COL`), le
reste est un commentaire. Une instruction se continue sur 9 lignes au plus,
chacune avec `,` en colonne 1 : la coupure tombe exactement en colonne 72.
Les minuscules sont converties en majuscules.

Caractères spéciaux : `_` marque de concaténation, `"NOM"` référence de
micro, `&` OU exclusif, `#` préfixe hexadécimal.

## Symboles et expressions

Un symbole fait 1 à 8 caractères, ne commence ni par un chiffre ni par `$`,
`=`, `:`, et ne contient pas `+ - * / , _ &` ni blanc. `A0`-`A7`, `B0`-`B7`,
`X0`-`X7` sont des registres dans un programme CPU.

Expression : termes reliés par `+`, `-`, `&` ; un terme est une suite
d'éléments reliés par `*` et `/` (évalués de gauche à droite, sans
parenthèses). Éléments : symbole, constante, `*` (compteur location),
`*O` (origine), `*P` (position), `$`, littéral `=…`, registre.

Constantes : `17` (base courante, décimale par défaut), `17B` octal, `17D`
décimal, `1.5E3` flottant, `1S20` (×2²⁰), `0#FF` hexadécimal, `3RABC`
(caractères cadrés à droite), `5HTEXTE` (à gauche, complété par des blancs),
`0LNOM` (à gauche, complété par des zéros).

## Programmes

```
          IDENT  NOM          relogeable (défaut)
          IDENT  NOM          absolu CPU :
          ABS                  suivi de ABS
          IDENT  NOM,100B      programme PP 12 bits :
          PERIPH               suivi de PERIPH
          ...
          END    DEBUT        adresse de lancement (relogeable)
```

Un programme absolu fixe ses adresses par `ORG`. Un programme relogeable
déclare ses points d'entrée par `ENTRY` et ses références externes par
`EXT` (ou `=Xnom`). Le chargeur place les programmes relogeables à
RA+100B, à la suite.

## Données et réservation

```
 TAB      DATA   1,2,3.5,10HABCDEFGHIJ    mots de données
 MSG      DIS    ,*TEXTE TERMINE PAR 12 BITS NULS*
 ZONE     BSS    100B                      réservation
 ZERO     BSSZ   10                        mots à zéro
 MOT      VFD    12/1,18/TAB,30/-1         champs de taille libre
 ADR      CON    TAB,TAB+1                 un mot par expression
 VAL      EQU    77B                       symbole permanent
 N        SET    N+1                       symbole redéfinissable
          SA1    =10HLITTERAL              littéral
```

## Instructions CPU (exemples)

```
          SA1    X        lire X dans X1 (A1 = adresse)
          SA6    Y        ranger X6 en Y (A6 = adresse)
          SX6    B1+5     X6 = B1 + 5 (18 bits, signe étendu)
          SB2    B2+1
          IX6    X1+X2    entier 60 bits
          FX3    X1*X2    flottant (NX3 X3 pour normaliser)
          BX6    X1*X2    ET logique
          LX6    6        rotation à gauche de 6 bits
          ZR     X1,FIN   saut si X1 nul
          NE     B1,B2,BOUCLE
          RJ     SOUS     saut de retour
          EQ     SOUS     retour (le mot SOUS contient le saut de retour)
          PS               arrêt
```

Un saut, `RJ`, `PS`, `XJ` forcent l'instruction suivante en début de mot ;
les parcelles libres sont complétées par des `NO` (46000).

## Instructions PP (exemples)

```
          LDN    5        A = 5
          LDC    123456B  A = constante 18 bits
          LDD    T1       A = cellule directe T1 (adresse 0-77B)
          STM    TAB,T1   TAB+(T1) = A
          CRD    W        lire le mot CM d'adresse (A) dans W..W+4
          FNC    7000B,10B  fonction sur le canal 10B
          ACN    10B
          OAM    BUF,10B  sortir (A) mots
          DCN    10B
          NJN    BOUCLE   saut relatif (±31 mots)
          RJM    SOUS     saut de retour (mot SOUS = adresse de retour)
```

## Macros, micros, assemblage conditionnel

```
 SOMME    MACRO  A,B,C
          SA1    A
          SA2    B
          IX6    X1+X2
          SA6    C
          ENDM
          SOMME  X,Y,Z

 GEN      MACRO  P
          LOCAL  ICI          symbole unique à chaque appel
 ICI      SB1    B1+P
          NZ     B1,ICI
          ENDM

 TITRE    MICRO  1,5,*BONJOUR*
          DATA   0L"TITRE"

          IFEQ   N,3          assemblé si N = 3
          SX7    1
          ELSE
          SX7    2
          ENDIF

          DUP    3            répéter 3 fois
          NO
          ENDD
          ECHO   ,R=(1,2,3)   une fois par valeur
          SX_R   B0+R
          ENDD
```

`OPDEF` redéfinit une forme d'instruction CPU (`MXQ OPDEF REG,VAL`) ;
`CPOP`/`PPOP` ajoutent des codes opération ; `OPSYN` crée un synonyme.

## Texte système et appels au système

Le texte système `SYSTEXT` est chargé au début de chaque assemblage. Il
fournit les macros d'appel au mini-système (voir `docs/SYSTEME.md`) :

```
 DEBUT    MESSAGE MSG             message au journal
          WRITEC OUTPUT,LIGNE     une ligne sur l'imprimante
          READC  INPUT,CARTE,9    une carte (X1 = 0, ou -1 en fin)
          SX1    123
          CDD                     X6 = '       123'
          WRITER OUTPUT
          ENDRUN
 OUTPUT   FILEC  TAMPON,101B      bloc de description de fichier
```

Les routines nécessaires (SYS=, CIO=, WTC=, RDC=, CDD=…) sont ajoutées
automatiquement à la fin du programme, ou incluses explicitement par
`XTEXT COMCSYS` etc.

## Listing

Colonnes : drapeaux d'erreur (1-3), `L` si le compteur location diffère de
l'origine, adresse (octal), code octal (parcelle p en colonne 12+5p),
indicateur de relocation (`+`, `-`, `C` commun, `X` externe), puis la ligne
source. Les options `LIST` (A, B, C, D, E, F, G, L, M, N, R, S, T, X)
contrôlent ce qui est listé ; par défaut B, L, N, R.

Drapeaux d'erreur fatale : A (champ variable), D (double définition),
E (imbrication), F (dépassement de table), L (champ location), N (point
d'entrée négatif), O (opération), P (ERR), R (donnée hors bloc), U (symbole
non défini), V (VFD). Avertissements : 1 à 9.
