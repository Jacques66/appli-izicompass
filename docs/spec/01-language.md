# 01 — Structure du langage COMPASS 3

Source : *COMPASS Version 3 Reference Manual*, CDC 60492600 rév. M (1986) —
chapitre 1 (Introduction), chapitre 2 (Language Structure), chapitre 3
(Program Structure), annexe A (Character Sets), annexe D (Hints), carte de
référence finale. Quelques renvois ponctuels aux chapitres 4, 5, 7 et 11
quand ils précisent une règle de langage (BASE, CODE, CHAR, COL, USE, DATA,
VFD, LOCAL, micros, répertoire d'erreurs).

Conventions de ce document :

- Les nombres suffixés `B` sont en octal (`57B` = 47 décimal), comme dans
  COMPASS. Les colonnes sont numérotées à partir de 1.
- **[INFÉRENCE]** marque une règle déduite (exemples du manuel, OCR
  dégradé, connaissance du matériel CDC) et non écrite en toutes lettres.
- **[AMBIGU]** marque un point que le manuel ne tranche pas ; une
  recommandation d'implémentation est donnée.
- « Caractère CDC » = glyphe du jeu 64 caractères CDC ; « équivalent
  ASCII » = glyphe du sous-ensemble ASCII 64 caractères (voir §11). Dans un
  source ASCII (le cas de notre implémentation JS), on écrit l'équivalent
  ASCII.

Caractères spéciaux du langage (récapitulatif, détaillés plus loin) :

| Rôle | Code display | Glyphe CDC | Équivalent ASCII |
|---|---|---|---|
| Marque de concaténation | 65B | → | `_` |
| Marque de micro | 64B | ≠ | `"` |
| OU exclusif (opérateur) | 67B | ∧ | `&` |
| Pré-radix hexadécimal | 60B | ≡ | `#` |
| Commentaire (colonne 1) | 47B | `*` | `*` |
| Continuation (colonne 1) | 56B | `,` | `,` |
| Drapeau de paramètre substituable (macros, ch. 5) | 77B | `;` | `;` |

(Le manuel OCR rend → par « r- »/« r+ », ≠ par « rl »/« ;t! », ∧ par
« /\ ». L'identification → = 65B est confirmée par la carte de référence,
où 65B a pour équivalent ASCII « _ (underline) », et par le listing qui
note les changements de CODE sous la forme `c1→c2`.)

---

## 1. Vue d'ensemble (chapitre 1)

- Un programme COMPASS = un ou plusieurs **sous-programmes**. Chaque
  sous-programme commence par `IDENT` et se termine par `END`. Un fichier
  source peut contenir plusieurs sous-programmes à la suite ; ils sont
  assemblés l'un après l'autre.
- Deux sortes d'instructions source : instructions machine symboliques
  (une instruction machine chacune, CPU ch. 8 ou PP ch. 9) et
  pseudo-instructions (contrôle de l'assemblage : allocation, définition
  de symboles, liaison, listing, macros…).
- Sortie CPU : binaire **absolu ou relogeable**. Sortie PP : **toujours
  absolue**.
- Assemblage en **deux passes** par sous-programme :
  - passe 1 : lecture de chaque instruction, expansion et édition des
    séquences appelées (macros, DUP, ECHO, RMT…), interprétation du code
    opération, attribution des emplacements (compteurs) ;
  - passe 2 : attribution des origines de blocs, placement des littéraux,
    calcul de toutes les valeurs de symboles, production du listing et du
    binaire, table des références symboliques ; puis réinitialisation pour
    le sous-programme suivant.
  - La passe 2 d'un **groupe de blocs** est déclenchée par chaque `IDENT`
    (non premier) ou `END` (voir §10.1).
- Tout traitement imbriqué (macros, définitions…) utilise une pile unique ;
  **profondeur maximale d'imbrication : 400**.
- Jusqu'à **255** zones (blocs) désignables par le programmeur et le
  système (voir §10.1).
- Le chargement/exécution n'a normalement pas lieu si l'assembleur a
  détecté des erreurs fatales (les erreurs à lettre suppriment le binaire,
  §12).

---

## 2. Format des instructions (§2.1)

### 2.1 Ligne physique

- Une carte = une ligne. **Seules les colonnes 1 à 72 sont interprétées.**
  Les colonnes 73–80 servent aux commentaires/séquencement, les colonnes
  81–90 au séquencement des programmes de maintenance de bibliothèque ; les
  colonnes 73–90 apparaissent au listing (champ « Sequence ») mais ne sont
  pas interprétées. (Annexe B : un enregistrement source peut faire
  jusqu'à 160 caractères, mais seuls les 90 premiers sont reproduits au
  listing.)
- Implémentation : une ligne plus courte que 72 colonnes est **complétée
  par des blancs jusqu'à la colonne 72** (important pour la continuation,
  §2.4). Au-delà de 90 : ignoré.
- Une ligne contenant deux « deux-points » consécutifs ou plus peut être
  lue/imprimée comme deux lignes (convention du système d'exploitation :
  12 bits nuls en fin de mot = fin de ligne, et `:` = code 00 dans le jeu
  64 caractères). Effet d'environnement, **à ne pas émuler** dans
  l'assembleur ; au plus à signaler.
- [INFÉRENCE] Le source original est en code display 6 bits, donc **en
  majuscules uniquement**. Pour un source ASCII : les minuscules sont
  repliées en majuscules (annexe A, note 3) ; tout caractère ASCII absent
  du tableau du §11 devient le blanc (55B) (note 4). Les tabulations
  n'existent pas sur CDC : recommandation, les développer en blancs
  (colonnes multiples de 8 ou taquets 11/18/30) en option d'entrée,
  clairement documentée comme extension.

### 2.2 Première colonne

| Colonne 1 | Signification |
|---|---|
| `,` (virgule) | Ligne de **continuation** de la ligne précédente |
| `*` (astérisque) | Ligne de **commentaire** |
| autre (y compris blanc) | Début d'une nouvelle instruction |

### 2.3 Les champs

Toute instruction (hors lignes commentaires) a quatre champs : **location**
(étiquette), **operation**, **variable**, **comments**. Chaque champ est
terminé par **un ou plusieurs blancs**. Exceptions : un blanc **à
l'intérieur** d'une donnée caractère (ex. `10HERROR IN P`, `H*A B*`), d'un
paramètre de macro entre parenthèses, ou du champ commentaire ne termine
pas le champ. La taille du champ variable n'est limitée que par la taille
maximale d'une instruction. Le format est essentiellement libre.

**Champ location** (§2.1.2)

- Commence en colonne 1 **ou 2** d'une ligne d'instruction et se termine
  par un blanc.
- Si les colonnes 1 **et** 2 sont blanches, il n'y a pas de location.
- Donc : colonne 1 non blanche → location commence en colonne 1 ;
  colonne 1 blanche et colonne 2 non blanche → location commence en
  colonne 2.
- Contenu (selon le code opération) : un symbole, un nom, `+` ou `-`
  (contrôle du forçage en début de mot, §10.4). Généralement facultatif.

**Champ operation** (§2.1.3)

- Si la location est vide, l'opération peut commencer en colonne 3
  (premier non-blanc à partir de la colonne 3).
- Si la location est présente, l'opération commence au premier non-blanc
  qui suit la location ; elle se termine par un ou plusieurs blancs.
- **L'opération est vide s'il n'y a aucun non-blanc entre la fin de la
  location et la colonne 30** (colonne de commentaire, modifiable par
  `COL`) : ce qui suit est alors du commentaire.
- Contenus légaux : mnémonique CPU (avec éventuellement des
  sous-champs variables, chacun précédé d'une virgule — syntaxe détaillée
  au ch. 8, ex. formes `SB.SUM`), mnémonique PP, pseudo-instruction, nom
  de macro, ou vide.
- Une instruction avec un **symbole en location et une opération vide**
  équivaut à `BSSZ 1` (un mot à zéro réservé, ch. 4 §4.8.1).

**Champ variable** (§2.1.4)

- Contient zéro, un ou plusieurs **sous-champs séparés par des virgules**.
- Commence au premier non-blanc après l'opération et se termine par un
  ou plusieurs blancs (hors exceptions ci-dessus).
- **Il est vide s'il n'y a aucun non-blanc entre la fin de l'opération et
  la colonne de commentaire (30 par défaut).**
- Un sous-champ contient : donnée (data item), expression, désignateur de
  registre, nom, élément spécial, ou une entrée propre à l'instruction.

**Champ comments** (§2.1.5)

- Commence au premier non-blanc après le champ variable ; si le champ
  variable est absent, **pas avant la colonne 30** (ou la colonne fixée
  par `COL`).

**Pseudo `COL n`** (ch. 4 §4.4.6) — résumé utile à l'analyse :

- Fixe la colonne à partir de laquelle un commentaire peut commencer
  quand le champ variable est vide. Défaut : 30.
- `n` : expression absolue évaluable, décimale si BASE M. `n < 12` → 12 ;
  `n` nul ou blanc → 30. Symbole en location ignoré.
- Si le champ opération de l'instruction courante **s'étend jusqu'à ou
  au-delà** de la colonne de commentaire, COMPASS utilise, **pour cette
  instruction seulement**, une colonne de commentaire « très grande » :
  tout non-blanc après l'opération est alors le champ variable (un
  commentaire exige alors un champ variable présent).
- Le listing affiche la nouvelle colonne dans le champ « octal code ».

### 2.4 Continuation (§2.1.7)

- Normalement, la colonne 72 termine une instruction non encore terminée.
- Une instruction plus longue se continue sur la ligne suivante en
  mettant **`,` en colonne 1** et en poursuivant en **colonne 2**.
- **Au plus 9 lignes de continuation** (instruction = 10 lignes au plus).
- La coupure peut tomber n'importe où, **même au milieu d'un symbole**.
  Implémentation : image de l'instruction = colonnes 1–72 de la première
  ligne (complétées à blanc) + colonnes 2–72 de chaque continuation
  (complétées à blanc), concaténées sans séparateur. Longueur maximale :
  72 + 9×71 = **711 caractères**.
- Les lignes de continuation au-delà de la 9e, et les lignes de
  continuation qui suivent une instruction **terminée**, sont traitées
  comme des **lignes de commentaire**.
  [AMBIGU] « instruction terminée » n'est pas défini. Recommandation : une
  continuation qui suit une ligne commentaire (`*` en colonne 1), ou qui
  suit la 10e ligne, est un commentaire ; dans tous les autres cas elle
  est rattachée.
- L'édition (micros) peut allonger l'image : si la colonne 72 de la
  dernière ligne est dépassée, l'assembleur crée jusqu'à 9 cartes de
  continuation au total ; l'excédent est **perdu sans avertissement** (voir
  §3.3). Donc la longueur éditée est aussi plafonnée à 711 caractères
  [INFÉRENCE : le plafond est le même].

### 2.5 Lignes commentaire (§2.1.6)

Deux formes :

1. `*` en colonne 1. Listée, sans autre effet. **Non comptée** dans les
   comptes de lignes du saut IF (§4.9) ni dans les définitions (ch. 5), et
   **non sauvegardée** dans les définitions (macros, DUP…). Annexe D : dans
   une macro, préférer `*` aux autres commentaires, qui eux sont
   sauvegardés.
2. Colonnes 1 à 29 blanches (une ligne entièrement blanche en fait
   partie). **Comptée** dans les comptes de lignes.
   [INFÉRENCE] La limite « 1–29 » suit la colonne de commentaire (30 par
   défaut, modifiable par `COL`) : la règle générale est « location vide
   et aucun non-blanc avant la colonne de commentaire ».

### 2.6 Convention de codage (§2.1.8, formulaire COMPASS)

| Colonnes | Contenu |
|---|---|
| 1 | blanc, `*` ou `,` |
| 2–9 | location (ou `+`/`-`), cadrée à gauche |
| 10 | blanc |
| 11–16 | opération, cadrée à gauche |
| 17 | blanc |
| 18–29 | variable, cadrée à gauche |
| 30– | commentaires |

Tous les exemples du manuel suivent cette convention ; elle n'est **pas
obligatoire** (format libre). Le listing (ch. 11) reproduit l'image
source colonnes 1–72 ; le désassembleur/générateur de code devrait
produire ce format (location en colonne 1 pour un symbole tel que dans
les exemples du manuel, opération en 11, variable en 18, commentaire en
30).

### 2.7 Algorithme de découpage (référence d'implémentation)

```
lire ligne → img = col 1..72 (padding blancs) ; seq = col 73..90
si img[1] == '*' : COMMENTAIRE(*) ; fin
si img[1] == ',' : continuation orpheline → COMMENTAIRE (voir §2.4)
tant que ligne suivante a ',' en col 1 et nb_cont < 9 :
    img += col 2..72 de cette ligne (padding)
éditer img (§3) sauf si la ligne est sauvegardée dans une définition
cc = colonne de commentaire courante (COL, défaut 30)
i = 1
si img[1] != ' ' ou img[2] != ' ' :
    loc = premier mot non blanc à partir de col 1 (ou 2) ; i = fin de loc
sinon loc = vide ; i = 3
sauter blancs → j
si j >= cc (ou fin) : op vide ; reste = commentaire
   (si loc vide aussi → COMMENTAIRE(compté) ; si loc = symbole → BSSZ 1)
op = mot à partir de j ; k = fin de op
cc_eff = (k >= cc) ? ∞ : cc            -- règle COL
sauter blancs → m
si m >= cc_eff ou fin : variable vide ; reste = commentaire
sinon variable = analysée par le parseur des sous-champs (voir ci-dessous)
reste après le premier blanc terminal = commentaire
```

Le **champ variable ne peut pas être découpé naïvement au premier
blanc** : les données caractère à compte (`nHxxx`, `nRxxx`…, qui
consomment exactement n caractères, blancs compris), les chaînes
délimitées (`H*A B*`) et les paramètres de macro entre parenthèses
contiennent des blancs. Recommandation : laisser le parseur de
sous-champs (expressions / données / paramètres de macro) consommer le
champ et s'arrêter sur le premier blanc **hors** de ces constructions.

---

## 3. Édition des instructions (§2.2, ch. 7)

### 3.1 Quand l'édition a lieu

COMPASS lit les instructions en séquence et **édite puis interprète
immédiatement** chacune, sauf :

1. les lignes commentaire `*` en colonne 1 ;
2. les lignes faisant partie d'une **définition** : entre un en-tête
   `MACRO`/`MACROE`/`OPDEF` et `ENDM`, entre `DUP` ou `ECHO` et `ENDD`, ou
   entre une paire `RMT`. Ces lignes sont sauvegardées **non éditées**
   (avec leurs marques de micro et de concaténation, ch. 5 : stockage
   compressé) et éditées **à chaque** référence/expansion. `ENDD` et `ENDM`
   font partie de la définition qu'ils terminent et ne sont **pas** édités
   (exemple ch. 5 : en définition, la location de l'en-tête MACRO édité est
   `T1` tandis que celle de l'ENDM non édité reste `T→1`).

Les lignes situées dans la portée d'un **IF** sont éditées **même
lorsqu'elles sont sautées**.

Deux sortes d'édition : **concaténation** et **substitution de micros**.

Option de listing `A` (ch. 4) : sans `A`, une ligne contenant des marques
est listée telle que lue ; avec `A`, la ligne est listée avant **et**
après édition.

### 3.2 Concaténation (§2.2.1)

- COMPASS cherche le caractère de concaténation **→ (65B, ASCII `_`)** et
  le **supprime de tout champ** de l'instruction : les deux colonnes
  adjacentes sont soudées.
- Usage principal : délimiter un nom de paramètre substituable dans une
  définition de macro quand aucun autre délimiteur n'est présent (ex.
  `P1→X` : après substitution de P1, le → est supprimé).
- Chaque suppression **décale le reste de l'instruction d'une colonne à
  gauche**. Conséquence : avec un champ variable vide, des commentaires
  peuvent glisser à gauche de la colonne 30 et être pris pour un champ
  variable.
- → ne peut pas servir de délimiteur de chaîne (§8.2) ni apparaître dans
  un symbole.

### 3.3 Substitution de micros (§2.2.2, §7.1)

- COMPASS cherche des **paires de marques de micro ≠ (64B, ASCII `"`)**
  qui délimitent une référence de micro (`≠NOM≠`) et remplace la
  référence **marques comprises** par la chaîne du micro.
- La chaîne de remplacement peut avoir une longueur différente : le reste
  de l'instruction est décalé à droite ou à gauche.
- Dépassement de la colonne 72 de la dernière ligne lue : création de
  cartes de continuation, **au plus 9** au total ; l'excédent est
  **supprimé sans notification**.
- **Pas de remplacement** si le nom de micro est inconnu ou si une des
  deux marques manque : marques et nom restent dans la ligne. Nom inconnu
  → **erreur non fatale 9** (« MICRO SUBSTITUTION ERROR. NO
  SUBSTITUTION. »).
- Une **marque isolée** n'est pas illégale et ne produit pas d'erreur
  (elle peut figurer dans une chaîne de caractères).
- **Nom nul** (deux marques adjacentes `≠≠`) : les deux marques sont
  supprimées, pas d'erreur. (Annexe D : utile comme « substitution
  nulle ».)
- Le décalage peut repousser l'opération ou le variable au-delà de la
  colonne 30, ou ramener un commentaire dans un champ vide.
- Micros prédéfinis (système) : `DATE`, `JDATE`, `TIME`, `BASE`, `CODE`,
  `QUAL`, `SEQUENCE`, `MODLEVEL`, `PCOMMENT` (carte de référence ; ch. 7).
- La substitution ne s'applique pas aux lignes commentaire `*`.

**Ordre et ré-analyse.** [AMBIGU] Le manuel présente la concaténation
puis les micros, et dit que « les marques de concaténation et les paires
de marques de micro sont supprimées avant l'analyse d'un nom/symbole/
chaîne ». Il ne dit pas si un texte substitué est ré-examiné.
Recommandation : un balayage gauche→droite unique de l'image : sur →,
supprimer ; sur ≠, chercher le ≠ suivant ; si le texte entre les deux est
un nom de micro connu (ou vide), remplacer et **reprendre le balayage
après le texte inséré** (pas de re-substitution du résultat, ce qui
évite toute récursion) ; sinon laisser le ≠ et continuer juste après lui.
Les → contenus dans un texte de micro inséré sont donc conservés.
(Conséquence pratique identique dans tous les usages du manuel.)

---

## 4. Noms (§2.3)

Un **nom** identifie : un sous-programme ou un overlay, un bloc, une
définition de macro, une définition remote (RMT), une séquence dupliquée
(DUP/ECHO), une séquence IF, un micro.

- Un nom est terminé par une **virgule ou un blanc**. Marques de
  concaténation et paires de marques de micro sont supprimées avant.
- **Nom de sous-programme ou d'overlay CPU** (sert à la liaison) : commence
  par une lettre A–Z, **7 caractères au plus**. Les conventions du système
  peuvent restreindre d'autres caractères.
- **Nom de sous-programme/overlay PP** : pas de restriction sur le premier
  caractère ; longueur max : 7 (CYBER 70/76, 7600), 4 (CYBER 180), 3
  (CYBER 170, CYBER 70 modèles 72/73/74, série 6000 — **notre cas : 3**).
- Dans tous les cas, le dernier caractère d'un nom de sous-programme ou
  d'overlay ne peut pas être `:`.
- **Tout autre nom : 1 à 8 caractères.** (Blocs : voir §10.2 pour les
  règles propres à `USE`.)
- Un nom **n'a ni valeur ni attributs** et ne peut pas figurer dans une
  expression.
- Les différents types de noms **ne se gênent pas** : un micro peut porter
  le nom d'une macro, un sous-programme celui d'un bloc, etc. (espaces de
  noms séparés). Les noms sont aussi distincts des symboles.
- Nom ou symbole de plus de 8 caractères → erreur fatale **A**.

---

## 5. Symboles (§2.4)

### 5.1 Symboles ordinaires

- Ensemble de caractères qui identifie une **valeur** et ses
  **attributs**.
- **1 à 8 caractères.**
- Premier caractère : **ni `$`, ni `=`, ni `:`, ni un chiffre**.
- Caractères interdits partout : `+ - * / blank , → ∧` (∧ = `&` ASCII ;
  → = `_` ASCII).
- Les autres caractères spéciaux sont permis mais « à utiliser avec
  précaution » (ECHO, macros). Exemples permis : `.`, `(`, `)`, `$` (hors
  1re position), `=` (hors 1re position), `[`, `]`, `#`… [INFÉRENCE :
  conséquence directe de la règle d'exclusion ; l'annexe D recommande
  `.1`, `.2` comme symboles dans les macros, donc `.` en tête est légal.]
- Exemples légaux : `P`, `R3`, `PROGRAM`. Illégaux : `5A` (chiffre en
  tête), `ABCEDEFGHI` (> 8), `ABE+15` (`+`), `=.11` (`=` en tête).
- **CPU seulement** : un symbole ne peut normalement pas avoir la forme
  d'un désignateur de registre `An`, `Bn`, `Xn` (n chiffre 0–7) ni `A.x`,
  `B.x`, `X.x` (x est alors pris pour une donnée). Un tel symbole est
  utilisable si **chaque** usage est préfixé par `=S`, `=X` ou `=Y` ; un
  **avertissement** est émis lors de sa définition. Ce préfixe est
  interdit dans la location des instructions machine, des pseudos de
  définition de symbole, de génération de données et de `BSS`, et dans le
  champ variable de `ENTRY`, `EXT`, `SST` (on y écrit le symbole nu).
- En **PP**, les registres n'existent pas : `A1`, `X3`… sont des symboles
  ordinaires.
- Nombre de références à un symbole : illimité.

### 5.2 Définition d'un symbole — cinq manières

1. **Symbole en location** d'une instruction machine ou de certaines
   pseudos (DATA, BSS, BSSZ, CON, DIS, VFD…) : défini comme **adresse**
   = valeur courante du **compteur location** (après forçage en début de
   mot éventuel), avec l'attribut :
   - **absolu** pour le bloc absolu ;
   - **common** pour les blocs common nommés ou blanc (assemblages
     relogeables seulement) ;
   - **relogeable** pour les blocs locaux autres que l'absolu, en passe 1 ;
   - **absolu** pour les blocs locaux en passe 2 d'un assemblage absolu.
2. **Pseudos de définition** (`EQU`, `=`, `SET`, `MAX`, `MIN`, `MICCNT`,
   ch. 4 §4.6) : valeur et attributs d'une expression du champ variable.
   `EQU` et `=` définissent définitivement ; `SET`, `MAX`, `MIN`, `MICCNT`
   donnent l'attribut **redéfinissable**. Une seconde définition d'un
   symbole non redéfinissable avec une **valeur différente** → erreur
   fatale **D** (« DOUBLY DEFINED SYMBOL. THE FIRST DEFINITION HOLDS »).
   [INFÉRENCE : redéfinition avec la même valeur et les mêmes attributs =
   pas d'erreur, comme l'indique « with a different value ».]
3. **Symbole externe** : défini hors du sous-programme, déclaré externe
   (`EXT`, ou par défaut `=X`/`=Y`), ou défini relativement à un symbole
   externe (`SYM EQU EXTSYM+3`). Attribut **external** ; sa vraie valeur
   n'est pas connue du sous-programme (valeur 0 pour l'assembleur, plus
   l'éventuel décalage, §9.6).
4. **Symboles système** : définitions faites hors du programme et
   importées par `SST` (textes système). COMPASS utilise les vraies
   définitions et ajoute l'attribut **systems symbol**.
5. **Par défaut** : référence précédée de `=S` à un symbole non défini
   autrement (§5.4).

**Largeur de valeur** : les pseudos de définition assignent des valeurs
**sur 21 bits** (ch. 4 §4.6 ; §2.8.2 : « pour une pseudo de définition de
symbole, la valeur de l'expression, y compris les constantes caractère,
est justifiée dans un champ de 21 bits »). Les quantités 21 bits
(compteurs, adresses, symboles) sont **étendues en signe** à 60 bits
quand elles entrent dans une expression. Un registre n'est pas autorisé
dans l'expression d'une pseudo de définition.

### 5.3 Symboles de liaison (§2.4.1)

- Deux types : **externes** et **points d'entrée**.
- **7 caractères au plus**, premier caractère lettre A–Z, dernier
  caractère différent de `:`.
- Un symbole déclaré point d'entrée dans un autre module peut être
  déclaré externe ici, et réciproquement.
- Un externe a la **valeur zéro** et l'attribut external. Déclaration par
  `EXT` ou par défaut (`=X`, `=Y`).
- Externe **fort** (strong) : le chargeur cherche et charge un module ayant
  le point d'entrée ; échec = erreur non fatale du chargeur. Externe
  **faible** (weak) : pas de recherche ; lié seulement si un module
  correspondant est chargé pour une autre raison ; non résolu en fin de
  chargement = pas d'erreur.
- On peut définir un symbole relatif à un externe déclaré par `EXT` au
  moyen d'une pseudo de définition : si l'expression se réduit à
  « externe ± entier », le symbole a une valeur entière (le décalage) et
  l'attribut external.
- Les points d'entrée et les externes **ne sont pas qualifiés** (QUAL sans
  effet sur eux).

### 5.4 Symboles par défaut (§2.4.2)

Préfixes d'une **référence** (jamais d'une définition) : `=S`, `=X`, `=Y`.
Si le symbole n'est pas défini dans le sous-programme, COMPASS le définit
ou le déclare **en fin d'assemblage**. `=X` et `=Y` ne fonctionnent par
défaut qu'en assemblage **relogeable**.

| Forme | Si non défini conventionnellement |
|---|---|
| `=Ssym` | COMPASS lui attribue **un mot à la fin du bloc zéro** ; toutes les références (avec ou sans `=S`) désignent ce mot. |
| `=Xsym` | **externe fort**, comme déclaré par `EXT`. Doit respecter les règles des symboles externes. |
| `=Ysym` | **externe faible**, à condition que le symbole ne soit référencé ailleurs ni avec `=X` ni avec `=S`, ni déclaré par `EXT`. Doit respecter les règles des externes. |

- Si le symbole est défini conventionnellement (n'importe où, avant ou
  après), COMPASS utilise cette définition et ne fait rien d'autre.
- Un symbole par défaut **ne peut pas** être utilisé là où un symbole
  « préalablement défini » est exigé (ex. `EQU` : l'expression ne peut
  contenir de symboles préfixés `=S`/`=X`/`=Y` que s'ils sont aussi
  définis conventionnellement).
- **Erreur** (pas de définition par défaut) si un symbole est préfixé à la
  fois par `=S` et `=X`, ou s'il est préfixé `=X` ou `=Y` dans un
  assemblage **absolu** sans définition conventionnelle. [INFÉRENCE :
  lettre **U** (symbole non défini) dans le cas absolu ; **A** pour le
  conflit =S/=X.]
- `=S`, `=X` ou `=Y` sans symbole derrière → erreur **A**.
- Les symboles par défaut sont **qualifiés** par le qualificatif en vigueur
  au moment de la référence `=S`.
- Les mots des symboles `=S` sont listés (option D) dans « DEFAULT SYMBOLS
  DEFINED BY COMPASS », juste avant le contenu du bloc des littéraux.
  [INFÉRENCE : chaque mot est initialisé à zéro.] L'ordre d'attribution des
  mots n'est pas précisé : recommandation, ordre de première référence.
- Dans un programme absolu, le bloc zéro n'existe que s'il y a des
  symboles par défaut (§10.2).

### 5.5 Symboles préalablement définis, évaluables, non définis

- **Préalablement défini** (§2.4.3) : défini dans une instruction
  *antérieure* (en ordre source de la passe 1) à celle qui l'utilise.
  Certaines pseudos l'exigent (EQU, BSS, ORG, IF…, comptes de lignes…).
- **Expression évaluable** (§2.8.1) : ne contient aucun symbole encore non
  défini.
- **Non défini** (§2.4.4) : symbole jamais défini, même par défaut → drapeau
  **U** à gauche de l'instruction qui le référence ; valeur supposée 0
  (« UNDEFINED SYMBOL. VALUE ASSUMED 0 »). U couvre aussi : compte de
  lignes d'un IF, compte de mots de DIS, attribut non reconnu dans un IF,
  qualificatif non défini.

### 5.6 Symboles qualifiés (§2.4.5, QUAL ch. 4 §4.4.4)

- Un symbole défini pendant qu'un qualificatif est en vigueur (`QUAL nom`)
  est **qualifié** par ce nom. À l'intérieur de la séquence, on le
  référence nu ; à l'extérieur, par **`/qualificatif/symbole`**.
- Un symbole **non qualifié** est **global** et se référence sans
  qualificatif — sauf si un qualificatif est en vigueur **et** qu'un
  symbole de même nom qualifié par ce qualificatif existe : le global se
  référence alors **`//symbole`**.
- Qualificatif + symbole = identifiant unique de **16 caractères** au plus
  (8 + 8).
- Les symboles de liaison ne sont pas qualifiés.
- Résolution d'une référence nue `S` (recommandation conforme) : si un
  qualificatif Q est en vigueur et `Q.S` existe → `Q.S` ; sinon global `S`.
  [AMBIGU] En cas de référence en avant (S défini plus tard, qualifié), la
  résolution doit se faire en passe 2 avec le qualificatif mémorisé au
  moment de la référence.
- Les symboles inventés pour les LOCAL de macro sont qualifiés s'ils sont
  définis dans un bloc QUAL.

### 5.7 Symboles locaux (macros) — renvoi

`LOCAL` (ch. 5 §5.4.8) : dans une définition MACRO/MACROE/OPDEF, liste de
symboles locaux (chacun commence par une lettre ; séparateurs et
caractères interdits `+ - * / ( ) $ , .`). À chaque expansion, chaque
symbole local est remplacé par un **symbole inventé** unique (listé sous
une forme `↑Wnnnnn` d'après l'OCR « tW00001 » [AMBIGU : premier caractère
illisible, probablement un caractère non autorisé dans les symboles
utilisateur, p. ex. ↑ 70B]). Limite : 63 paramètres + locaux par
définition. Annexe D : préférer `.1`, `.2`… aux symboles locaux pour la
vitesse. Détails dans la spec des macros.

---

## 6. Registres CPU (§2.5)

Les 24 registres CPU ont des désignateurs **intégrés**, non modifiables :

| Type | Désignateurs |
|---|---|
| Adresse | `An` ou `A.n` |
| Index | `Bn` ou `B.n` |
| Opérande | `Xn` ou `X.n` |

- Forme `An`/`Bn`/`Xn` : n = **un seul chiffre 0–7**. Toute autre valeur
  (ex. `A8`, `A10`) → c'est un **symbole**.
- Forme `A.n`/`B.n`/`X.n` : n est un **symbole ou un entier** (évalué dans
  la base courante [INFÉRENCE : l'exemple suppose la base décimale]). Si la
  valeur dépasse 7, elle est **tronquée aux 3 bits de poids faible** avec
  un **avertissement** [INFÉRENCE : drapeau 7, « value exceeds field size,
  result truncated »].
- Exemples : `A1` → registre A1 ; `A10` → symbole ; `A.1` → A1 ;
  `A.NUM` avec NUM=6 → A6 ; `A.10` → 10 décimal = 12B → **A2** +
  avertissement.
- A1–A5 servent à lire la mémoire (chargement dans X1–X5), A6–A7 à
  écrire (rangement de X6–X7).
- PP : pas de registres reconnus.
- Équivalence (exemple du manuel, ALPHA = 1000B) : `SB3 A2+ALPHA` et
  (`SUM SET 3`, `SUB SET 2`, `SB.SUM A.SUB+ALPHA`) génèrent tous deux
  `6032001000`.

---

## 7. Éléments spéciaux (§2.6, §3.2)

Désignateurs réservés, **jamais utilisables comme symboles**, non
modifiables. Dans une expression ils sont remplacés par la valeur
indiquée (« bloc en cours » = bloc du `USE` courant).

| Élément | Valeur | Attribut |
|---|---|---|
| `*` ou `*L` | compteur **location** du bloc en cours | relogeable (dans le bloc en cours), **absolu** si le bloc en cours est le bloc absolu |
| `*O` | compteur **origin** du bloc en cours | idem |
| `*P` | valeur du compteur **position** du bloc en cours (bits restant dans le mot : 60…1, ou 12/16 en PP) | absolu |
| `$` | compteur position **moins un** (n° du prochain bit libre) | absolu |
| `*F` | 0 : appel par carte de contrôle COMPASS ; 1 : compilateur RUN (plus supporté) ; 2 : FTN4 ; 3 : FTN5. Redéfinissable par le paramètre `F` de la carte COMPASS (`F=n` décimal). | absolu |

Remarques :

- Ces éléments ne sont reconnus qu'**en position d'élément** d'une
  expression. `*` en position d'opérateur est la multiplication ; ainsi
  `**` = élément `*` × élément nul (0) ; `*+3` = location + 3 ;
  `ABLE*4` = ABLE × 4.
- `-*O` est une expression relogeable négative (exemple du manuel).
- Après une instruction qui provoque un forçage différé (§10.4), les
  pseudos qui référencent `*`, `*O`, `*P`, `$` voient la valeur **avant**
  le forçage.
- `POS *P` est sans effet ; `POS $` retire 1 au compteur position (ch. 4).
- Exemples du manuel (OCR dégradé) : `JP *+1`, `... X3,*L-1`,
  `VFD *P/0`, `... $/0,1/1`, `... *F,…`.

---

## 8. Notation des données (§2.7)

Deux sortes : **caractère** et **numérique** (octal, décimal,
hexadécimal ; entier, flottant simple ou double précision). Trois façons
de les introduire :

1. **Data item** (donnée) : sous-champs de `DATA` et `LIT`, et valeurs de
   champs de `VFD` (ch. 4).
2. **Constante** : élément d'expression.
3. **Littéral** : `=donnée` dans une expression (ou sous-champ de `LIT`).

Différences entre constante et donnée :

- Une constante **commence obligatoirement par un chiffre** : pas de forme
  caractère délimitée, pas de pré-radix (`B`, `O`, `D`), et le `0` de
  l'hexadécimal est obligatoire.
- La taille du champ d'une constante est celle du **champ destination**
  de l'expression, 60 bits au plus : **pas de double précision**.
- Un signe devant une constante est un **opérateur** d'expression ; devant
  une donnée ou un littéral, il fait partie de la donnée.

### 8.1 Donnée caractère (§2.7.4)

**Code** : les chaînes sont converties dans le code en vigueur au moment
de l'évaluation (pseudo `CODE`, §11.4) ; défaut : **code display** (sauf
`CIPPU` : ASCII 8 bits).

**Formats**

```
Data item :   [sign] n type string
              [sign] type d string d
Constante :   n type string                 (n obligatoire)
Littéral  :   = [sign] n type string
              = [sign] type d string d
```

- `=` : littéraux seulement (comme élément d'expression).
- `sign` : facultatif (donnée/littéral). `+` ou absent : valeur positive.
  `-` : on forme la **valeur complémentée** (complément à un, bit à bit ;
  [INFÉRENCE] mot par mot pour une chaîne de plusieurs mots).
- `n` : définit la longueur, **toujours décimal** quelle que soit la base.
  - **absent** : chaîne délimitée par `d` (interdit pour une constante) ;
  - **0** : donnée/littéral : la chaîne = tous les caractères après `type`
    jusqu'au premier **blanc ou virgule** (exclus). Constante : jusqu'au
    premier **`+ - * / blank , ∧`** (exclus) ;
  - **n > 0** : la chaîne = **exactement les n caractères** qui suivent
    `type` (blancs, virgules, opérateurs compris). Donnée/littéral : n ne
    compte pas les zéros garantis, limité seulement par la taille de
    l'instruction. Constante : n ≤ (bits du champ destination) / 6.
- `type` (justification et remplissage) :

| Type | Donnée / littéral | Constante |
|---|---|---|
| `C` | cadré à gauche, remplissage zéro, **12 bits nuls garantis** en fin de chaîne (un mot de plus si nécessaire) | = `L` (pas de zéros garantis) |
| `H` | cadré à gauche, remplissage **blanc** | idem |
| `A` | cadré à droite, remplissage **blanc** | idem |
| `R` | cadré à droite, remplissage zéro | idem |
| `L` | cadré à gauche, remplissage zéro | idem |
| `Z` | cadré à gauche, remplissage zéro, **6 bits nuls garantis** en fin (un mot de plus si nécessaire) | = `L` |

- `d` : délimiteur (seulement si n absent). La chaîne = caractères entre la
  1re et la 2e occurrence de d. **d peut être n'importe quel caractère sauf
  → (concaténation) et ≠ (marque de micro).** [INFÉRENCE : le blanc et la
  virgule comme délimiteurs sont à rejeter, ils terminent le sous-champ.]
- `string` : caractères d'un jeu COMPASS (annexe A), sauf les délimiteurs
  (cf. n et d), la marque de concaténation et les **paires** de marques de
  micro — celles-ci ont été supprimées/traitées par l'édition avant
  l'examen de la chaîne ; une marque ≠ **isolée** est permise.

**Chaînes vides**

- vide si : n = 0 et `type` immédiatement suivi d'un terminateur (ex.
  `0L,`) ; ou n absent et délimiteurs adjacents (ex. `H++`).
- `DATA` : chaîne omise légale, **ne génère aucun mot**.
- Constante : chaîne omise valide, **valeur zéro**.
- `LIT` : chaîne omise légale, ne génère pas de littéral pour cet item ;
  mais le LIT doit contenir au moins un item non vide (sinon erreur A,
  « no data is found in the variable field of a LIT »).
- Littéral dans une expression : chaîne vide **illégale** → erreur.
- **Impossible de générer une chaîne vide avec C, Z, R ou A** : `0C`, `0Z`,
  `0R`, `0A`… [INFÉRENCE : `0C`/`0Z` génèrent un mot de zéros (les zéros
  garantis), `0R` un mot de zéros, `0A` un mot de blancs ; seuls `H` et
  `L` peuvent donner une chaîne vide.] [AMBIGU]

**Allocation en mots (data items et littéraux)** [INFÉRENCE, cohérente
avec tous les exemples] — soit `cpw` = caractères par mot (10 en CPU,
2 en PP 12 bits), `wb` = bits par mot (60 ou 12) :

- `H`, `L`, `A`, `R` : `ceil(n / cpw)` mots ; la chaîne est cadrée dans
  ce champ multi-mot (H/L : caractères au début, remplissage à la fin du
  dernier mot ; A/R : caractères à la fin du dernier mot, remplissage au
  début du premier mot) ;
- `C` : `ceil((6n + 12) / wb)` mots ; `Z` : `ceil((6n + 6) / wb)` mots ;
  remplissage zéro.
- Ex. CPU : `DATA 10HABCDEFGHIJ` = 1 mot ; `DATA 10CABCDEFGHIJ` = 2 mots
  (le 2e nul) ; `DATA 9ZABCDEFGHI` = 1 mot.
- Ex. du manuel : `WORDS DATA H* THE ANSWER IS *` →
  `55241005550116232705`, `11235555555555555555`… (blanc remplissage) ;
  PP `DATA 0LOUTPUT` → `1725`, `2420`, `2524` ; CPU `DATA 0LCOMPILE` →
  `03171520111405000000` ; `DATA 0LLGO` → `14071700000000000000` ;
  PP `DATA H*DATA*` → `0401`, `2401`.

**Constantes caractère dans une expression** (§2.8.2) : la chaîne est
d'abord cadrée (gauche ou droite) dans un champ de la **taille du champ
destination**, remplie selon le type, puis étendue à 60 bits ; ensuite
l'arithmétique s'applique.

- Ex. `SX4 1R.+1` : `.` = 57B, +1 → K = `60` → `7140000060`.
- `SX3 1R*` → `7130000047`. `SA1 3RCIO` → `5110031117`.
- `SBi X0+1L$` (champ K de 18 bits) → K = `530000` (listing :
  `6260530000`, soit SB6 ; registre peu lisible dans l'OCR).
- `VFD 30/4H....,6/1RA,24/1AX+1` : `1AX` dans 24 bits = `55555530`, +1 →
  `55555531` (le remplissage blanc couvre tout le champ destination).
- `VFD 42/0LOUTPUT,18/1` → `17252420252400000001` (42 bits :
  `17252420252400`, puis 18 bits : `000001`).
- Troncature : constante **cadrée à droite** → erreur de troncature si le
  bit significatif le plus haut dépasse le champ (les zéros tronqués ne
  sont pas une erreur) ; constante **cadrée à gauche** → erreur si des
  positions de poids faible sont tronquées, **même si elles sont nulles**.
  [INFÉRENCE : drapeau 7.]

### 8.2 Donnée numérique (§2.7.5)

**Formats**

```
Data item :   [sign] [preradix] value [modifiers]
Constante :   value [modifiers]                 (commence par un chiffre)
Littéral  :   = [sign] [preradix] value [modifiers]
```

- `sign` : `+`/absent positif ; `-` : valeur **complémentée** (complément à
  un : -1 en 60 bits = `77777777777777777776` ; en PP 12 bits, -9 =
  `7766`, -1 = `7776`).
- `preradix` (données et littéraux seulement) : `B` ou `O` = octal ; `D` =
  décimal ; absent = postradix ou base courante (`BASE`, défaut décimal).
- `value` : chiffres octaux ou décimaux : partie entière, point
  (décimal ou octal), partie fractionnaire. **Sans point = entier (virgule
  fixe). Avec point = flottant** (CPU seulement ; illégal en PP).
  - octal : au plus **20 chiffres significatifs** (entier) ou **32**
    (flottant) ; pas de 8 ni 9 ;
  - décimal : au plus **1,15 × 10^18** (entier, ≈ 2^60) ou **7,9 × 10^28**
    (flottant, point ignoré) ; au-delà, résultat erroné (non garanti) ;
  - `value` omise = 0 (ex. `=D`, `B` seuls… [INFÉRENCE]).
- `modifiers` : facultatifs, **dans n'importe quel ordre**, chacun **une
  seule fois** (doublon → erreur) :
  - **postradix** `B`, `O` (octal) ou `D` (décimal). Pré-radix **et**
    postradix → erreur ;
  - **exposant décimal** `E±n`, `En`, `E` (simple précision) ; `EE±n`,
    `EEn`, `EE` (**double précision**). n décimal, absent = 0, |n| ≤ 32767.
    Effet : multiplie par 10^n. `EE` sur une valeur entière → entier
    simple précision ;
  - **échelle binaire** `S±n`, `Sn`, `S` : multiplie par 2^n. n décimal,
    absent = 0, |n| ≤ 32767 ;
  - **position du point binaire** `P±n`, `Pn`, `P` (flottants seulement) :
    voir plus bas.
- Avec BASE O, une donnée contenant 8 ou 9 sans radix D est en erreur ;
  les comptes de caractères, les n des modificateurs S/E/P sont **toujours
  décimaux** (BASE ch. 4). Erreur A : « 8 or 9 is encountered in octal
  data and the modifier is not S, P, O, E, D, or B ».
- Ordre d'application, quel que soit l'ordre d'écriture : **1. exposant
  décimal, 2. échelle binaire, 3. point binaire** (CPU seulement).
- Précision : calculs en **144 bits** ; arrondi à **96 bits** (double),
  **48 bits** (flottant simple), **60 bits** (entiers).
  [INFÉRENCE] Arrondi au plus proche (moitié vers le haut en valeur
  absolue) au niveau du dernier bit retenu ; confirmé par
  `1.1` → `17204314631463146315` (troncature donnerait `…6314`). Pour un
  entier avec exposant négatif (`15E-1`), arrondi de 1,5 → 2 [AMBIGU].
- Les échelles peuvent dépasser les plages valides, mais les **nombres**
  sont bornés par le matériel. Ex. `1.0E400S-1200` ≈ 5,8 × 10^38 : valide.

**Entiers** : valeur exacte (après E et S), arrondie à l'entier, puis
représentée sur 60 bits (≥ 2^59 → bit de signe à 1 ; [INFÉRENCE]
« les bits de poids fort excédentaires sont perdus »). Négatif =
complément à un du positif. Dans une donnée PP, le mot fait 12 bits
[INFÉRENCE : troncature avec drapeau 7 si la valeur ne tient pas].

**Format flottant CDC 6000** (simple précision, 60 bits) — [INFÉRENCE :
format matériel standard, vérifié sur les exemples du manuel] :

```
bit 59        : signe (1 = négatif ; un négatif est le complément à un
                des 60 bits du positif)
bits 58..48   : exposant biaisé (11 bits)
bits 47..0    : coefficient entier C (48 bits) ; valeur = C × 2^e
```

- Champ exposant pour un positif : `e ≥ 0` → `2000B + e` ; `e < 0` →
  `1777B + e` (complément à un sur 11 bits avec bit de tête inversé).
  Plage `e` : −1777B…+1777B (−1023…+1023).
- **Normalisé** : bit 47 de C à 1 (zéro = mot nul `00000000000000000000`).
- Exemples : `1.0` = `17204000000000000000` ; `0.1` =
  `17146314631463146315` ; `1.1` = `17204314631463146315` ; `-0.0`
  (complément de zéro) = `77777777777777777777`.
- **Point binaire P** : `P+n` / `Pn` : le point est placé à droite du bit
  n, c.-à-d. **exposant forcé à −n** ; `P-n` : exposant +n. « L'exposant
  est ajusté à −(±n) » : `P-6` → champ exposant `2006B` ; `P10` →
  `1765B`. Donne un flottant **non normalisé** ; sans P (ou P sans n) →
  normalisé. Si, à cause de P, le bit le plus significatif sort du
  coefficient (simple ou double) → **erreur de dépassement (overflow ou
  underflow)**. [INFÉRENCE] L'arrondi à 48 bits significatifs a lieu
  avant l'alignement P, et le décalage à droite dû à P tronque :
  l'exemple `0.1P47` → `17200314631463146314` (et non …6315).
- **Double précision** (`EE`, CPU, données et littéraux seulement) :
  deux mots. Mot 1 = flottant simple normalisé formé des 48 bits de tête
  du coefficient (arrondi global à 96 bits) ; mot 2 = les 48 bits
  suivants, **exposant = exposant du mot 1 − 48** (champ − `60B`), non
  normalisé ; un négatif complémente les deux mots. Exemples :
  `DATA 1.3EE` → `17205146314631463146`, `16403146314631463146` ;
  `10.0EE` [INFÉRENCE d'après l'exemple de littéraux] →
  `17235000000000000000`, `16430000000000000000` (mot bas de coefficient
  nul mais exposant présent).
- **Entier** : un flottant ne peut pas être en double précision s'il est
  utilisé comme constante d'expression (60 bits max). Toute arithmétique
  d'expression est **entière** : `2.3` dans une expression vaut le motif
  binaire du flottant 2.3 traité comme entier.
- Dépassement d'exposant (> 1777B) ou sous-dépassement → erreur
  [INFÉRENCE : drapeau A].

**Exemples (base décimale par défaut)**

| Source | Résultat |
|---|---|
| `DATA 1` | `00000000000000000001` |
| `DATA -1` | `77777777777777777776` |
| `SX3 100B` | K = `000100` |
| `1S17` | 2^17 = `400000B` |
| PP `DATA 5,-9` | `0005`, `7766` |
| PP `LDC =10` | littéral `0012` |
| PP `LDC =-1` | littéral `7776` |
| `SA5 =20046755000234000004B` | littéral = ce motif octal |

### 8.3 Notation hexadécimale (§2.7.6)

Toujours un **entier simple précision**.

```
Data item :   [sign] [0] preradix value [modifiers]
Constante :   0 preradix value [modifiers]        (le 0 est obligatoire)
Littéral  :   = [sign] [0] preradix value [modifiers]
```

- `preradix` : obligatoire, **≡ (60B), ASCII `#`** (« = ou # selon
  l'imprimante » dans l'OCR : il s'agit de ≡/#).
- Le `0` de tête est facultatif pour données et littéraux, **obligatoire
  pour une constante** (sinon le pré-radix serait pris pour le début d'un
  symbole).
- `value` : chiffres hexadécimaux `0–9`, `A–F` ; jusqu'à **26 chiffres
  significatifs** ; pas de point ; absente = 0. [AMBIGU] 26 × 4 = 104 bits
  > 60 : recommandation, garder les 60 bits de poids faible et lever le
  drapeau 7 si des bits non nuls sont perdus.
- `modifiers` : `S` (échelle binaire, même forme que §8.2) permis ; `P`
  permis mais **ignoré**.
- Exemples : `DATA #123ABC` → `00000000000004435274` ;
  `CON 0#A01576` → `00000000000050012566` ; `SX3 =-#12345S2` → littéral
  `77777777777776671353` (−(12345h × 4)).

### 8.4 Littéraux (§2.7.3)

- Un littéral est une **constante en lecture seule**, spécifiée comme
  donnée d'un `LIT` ou comme élément d'expression préfixé par **`=`**
  (`=1`, `=10HOUTPUT`, `=-3RABC`, `=R*ABC*`, `=1.0`, `=3.14159EE+6`,
  `=#FF`…). Toutes les formes de données (§8.1–8.3) sont permises, y
  compris pré-radix, signe, chaînes délimitées et double précision.
- Dans une expression, le littéral vaut **l'adresse** de son entrée dans le
  **bloc des littéraux** : il est donc **relogeable** (bloc local des
  littéraux ; absolu après la passe 2 d'un assemblage absolu).
- « Conventionnellement », un littéral est le seul élément de son
  expression, mais la combinaison est légale (ex. `1+=3.14159EE+6`).
- Un littéral vide dans une expression est illégal (erreur A).
- `DATA` n'accepte pas de littéral comme item.
- **Pool et dédoublonnage** : la première utilisation d'un littéral
  assemble ses mots dans le bloc des littéraux. Si le motif binaire d'un
  littéral préfixé, ou de **tous** les items d'une séquence `LIT`,
  correspond à des mots déjà présents, aucune entrée n'est créée. Algorithme
  [INFÉRENCE, conforme aux trois exemples du manuel] :
  1. Former la suite de mots S (1 mot ou plus ; pour `LIT`, la
     concaténation de tous ses items dans l'ordre).
  2. Si S apparaît comme **sous-suite contiguë** n'importe où dans le pool
     → réutiliser l'adresse de début.
  3. Sinon, chercher le plus long **suffixe du pool égal à un préfixe de
     S** ; n'ajouter que la partie restante de S ; l'adresse est celle du
     début du préfixe recouvert (ou du premier mot ajouté si aucun
     recouvrement).
  - Le **motif binaire** seul compte : `=1` et `=1RA` (A = 01) partagent
    le même mot.
  - Exemple : `SB2 =1` (crée 5555 : `…01`), `SB3 =1RA` (réutilise 5555),
    `SB4 =1RB` (crée 5556 : `…02`), `L LIT 1,2` (réutilise 5555–5556,
    L = 5555). Puis `LIT 1,3,1RD,2` → 4 mots nouveaux (5557–5562). Mais
    `LIT 1,2,3,4` à la place → recouvre les deux derniers mots `1,2` et
    n'ajoute que `3,4`.
- `LIT` permet d'associer un symbole à des entrées du pool (adresse du
  premier mot dans le champ octal du listing). Ces mots doivent rester en
  lecture seule (intégrité du pool partagé).
- `LIT` générant plus de **100 mots** → erreur fatale **F**.
- Listing (option D) : « CONTENT OF LITERALS BLOCK. », chaque adresse avec
  son contenu octal et sa conversion en code display.
- Placement : bloc des littéraux = `LITERALS*`, **immédiatement après le
  bloc zéro** (§10.2). Dans un overlay de type IDENT ou une section
  partielle par IDENT blanc, chaque section a son propre pool.

### 8.5 Règles lexicales des sous-champs (référence d'implémentation)

Dans une expression, en **position d'élément** :

| Début | Interprétation |
|---|---|
| chiffre | constante : numérique (chiffres, `.`, modificateurs B/O/D/E/EE/S/P), caractère (`n` décimal puis type `C H A R L Z` puis n caractères, ou n = 0 jusqu'au terminateur), ou hexadécimale (`0` puis `≡`/`#`) |
| `=` suivi de `S`, `X` ou `Y` | préfixe de symbole par défaut |
| `=` autre | littéral (donnée complète, signe permis) |
| `/` | symbole qualifié `/Q/SYM` ou global `//SYM` |
| `*O`, `*L`, `*P`, `*F`, `*` | élément spécial |
| `$` | élément spécial |
| `An`, `Bn`, `Xn` (n 0–7, suivi d'un non-caractère de symbole), `A.x`, `B.x`, `X.x` | registre (CPU) |
| autre caractère de symbole | symbole |
| opérateur, `,`, blanc, fin | élément vide (= 0) |

- Les lettres de type caractère (`C H A R L Z`) et les modificateurs
  numériques (`B O D E S P`) sont **disjoints**, ce qui lève l'ambiguïté
  après les chiffres. `0#…` : les chiffres A–F hexadécimaux ne sont pas des
  types car le pré-radix a été vu.
- Un modificateur suivi de `+`/`-` puis d'un chiffre consomme le signe et
  l'entier ; sans chiffre, n = 0 et le signe redevient opérateur
  [INFÉRENCE].
- Dans `DATA`/`LIT` (données pures, pas de symboles) : un item commençant
  par une lettre est soit un pré-radix numérique (`B`, `O`, `D` suivis de
  chiffres), soit un type caractère suivi d'un délimiteur.

---

## 9. Expressions (§2.8)

### 9.1 Syntaxe

- La plupart des sous-champs sont des **expressions** : un ou plusieurs
  **termes** ; chaque terme = un ou plusieurs **éléments** reliés par des
  opérateurs d'éléments. Une **virgule ou un blanc termine l'expression**.
- Éléments : symbole, constante numérique ou caractère, élément spécial,
  désignateur de registre (CPU), littéral. Exemples : `ALPHA`, `$`, `*P`,
  `A.7`, `X3`, `3HABC`, `=10HOUTPUT`, `77B`.
- Opérateurs d'éléments (forment un terme) : `*` multiplication, `/`
  division.
- Opérateurs de termes (forment l'expression) : `+` addition, `-`
  soustraction, `∧` (ASCII `&`) **OU exclusif**.
- **Aucune parenthèse** de regroupement ; **pas d'opérateurs relationnels**
  ni de ET/OU logiques. Précédence : `*` `/` (gauche à droite) avant `+ -
  ∧` (gauche à droite).

Grammaire équivalente :

```
expression := [addop] term { addop term }
term       := element { mulop element }
addop      := '+' | '-' | '∧'
mulop      := '*' | '/'
element    := (voir §8.5) | ε
```

### 9.2 Règles (§2.8)

1. Dernier élément d'un terme omis → élément **zéro** fourni :
   `ABLE*+3` = ABLE×0 + 3.
2. **Deux éléments successifs sont illégaux** (erreur A). Mais `**` est
   légal : élément `*`, opérateur `*`, élément nul (blanc).
3. Un terme contient **au plus un élément relogeable ou externe** :
   `**ABLE` (ABLE relogeable) est illégal.
4. L'élément à **gauche d'un diviseur doit être absolu** [INFÉRENCE : le
   produit partiel du terme à gauche du `/` doit être absolu ; le diviseur
   aussi].
5. **Division par zéro → zéro, sans erreur.**
6. Deux opérateurs additifs ou plus à la suite (`+`, `-`, `∧`) → un terme
   de valeur zéro est inséré entre eux.
7. Expression commençant par un opérateur additif → terme zéro inséré
   avant.
8. Toute l'arithmétique est **entière**, même si un élément est une
   constante flottante (`2.3`). Résultats limités à **60 bits** : les bits
   de poids fort excédentaires d'un terme ou d'une valeur sont perdus
   **sans message**.

### 9.3 Arithmétique (§2.8.2)

- Chaque élément est remplacé par une **valeur 60 bits** ; signes étendus
  pour les quantités 21 bits (compteurs, adresses, symboles) ; constante
  caractère cadrée dans le champ destination puis étendue à 60 bits ;
  registre → valeur 0.
- **Division** : partie entière du quotient, reste perdu. `5/2*2` = 4
  (gauche à droite).
- Évaluation gauche à droite : COMPASS forme un terme jusqu'au prochain
  `+`/`-`/`∧`, note si le terme contient un symbole relogeable ou externe
  ou des registres, puis l'ajoute/retranche/« différencie » (XOR) au
  cumul des parties absolue, relogeable, externe.
- Représentation : **complément à un 60 bits** (le moins forme la valeur
  complémentée ; −0 = `777…777` existe ; IFPL/IFMI distinguent +0 et −0).
  [INFÉRENCE — à valider par tests] Sémantique recommandée, celle de
  l'additionneur soustractif du 6600 : interpréter les opérandes en
  entiers signés (mot à bit 59 = 1 → −(complément)), calculer
  exactement (BigInt), puis convertir : résultat 0 → +0, **sauf**
  (−0)+(−0) et (−0)−(+0) qui donnent −0 ; résultat r ≠ 0 → |r| mod 2^60,
  complémenté si r < 0. Multiplication et division sur les valeurs
  signées, quotient tronqué vers zéro.
- `∧` : OU exclusif bit à bit des deux mots 60 bits. [AMBIGU] Avec un
  terme relogeable ou externe : recommandation, erreur A (relocation non
  définie), sauf si tous les éléments relogeables s'annulent.
- La valeur finale est tronquée si nécessaire et placée dans le champ
  destination ; **trop grande pour le champ → drapeau d'erreur** (7,
  « ADDRESS VALUE EXCEEDS FIELD SIZE, RESULT TRUNCATED »). [INFÉRENCE]
  « Tient dans n bits » = les bits 59..n sont tous à 0 ou tous à 1 (on
  accepte ainsi `777777B` et `-1` dans un champ de 18 bits).
- Taille maximale d'un champ d'expression : 60 bits.

**Taille du champ destination**

| Contexte | Champ |
|---|---|
| Pseudo de définition de symbole (EQU, =, SET, MAX, MIN, MICCNT) | **21 bits** (y compris constantes caractère) |
| `VFD` | taille indiquée (≤ 60) |
| `CON` | un mot : 60 bits (CPU), 12 ou 16 bits (PP) |
| Instruction machine CPU | champ adresse 18 bits (K) ou 6 bits (jk) |
| Instruction machine PP | 18, 16, 12 ou 6 bits |

### 9.4 Registres dans une expression

- L'opérateur qui précède immédiatement un désignateur de registre est
  l'**opérateur de registre**, quelle que soit la position du registre
  dans l'expression : `+`, `-`, `*` ou `/`.
- Si le registre est le **premier élément**, l'opérateur peut être omis :
  `+` supposé.
- Le reste forme l'**opérande** (absolu, relogeable ou externe).
- `3+A6-NUM` → registre A6 (opérateur +) et opérande `3-NUM`.
- `X3+LIMA-10B`, `LIMA+X3-10B`, `-10B+LIMA+X3` produisent le même
  résultat. Autres exemples : `B1+XYZ`, `*+A.NUM`.
- Usage réservé en pratique aux instructions machine CPU, qui
  interprètent la forme (ch. 8) ; une pseudo qui interdit les registres
  (EQU, CON…) → erreur A (« the instruction disallows register
  designators », « a register is illegal in a CON instruction »).

### 9.5 Types d'expression et relocation (§2.8.1)

Une expression se réduit à :

- une **valeur absolue** (adresse absolue ou entier) ;
- un **externe ± entier 21 bits** ;
- une **valeur relogeable ± entier 21 bits** ;
- des **registres + l'un des précédents** (CPU) ;
- des **registres seuls** (CPU).

**Modèle d'implémentation recommandé** : chaque valeur intermédiaire porte
(a) une partie absolue 60 bits, (b) un vecteur de coefficients entiers
par bloc relogeable (bloc local, bloc common ; le bloc absolu ne compte
pas), (c) un vecteur de coefficients par symbole externe, (d) la liste des
registres. Un élément relogeable vaut coefficient +1 dans son bloc ; la
multiplication par un absolu multiplie les coefficients (`3*FOX`
légal) ; un terme ne peut avoir qu'un seul élément non absolu
(règle 3) ; le dividende doit être absolu (règle 4).

À la fin :

- **Absolue** : tous les coefficients nuls. Possible avec des éléments
  relogeables s'ils s'annulent **par paires dans le même bloc** (signes
  opposés, éventuellement multiples, non nécessairement contigus).
  Exemples (EASY, FOX relogeables du même bloc, MIKE absolu, compteurs du
  même bloc) : `EASY-FOX+MIKE`, `FOX-*`, `MIKE+16`, `*-EASY-FOX*2`.
- **Relogeable** : un seul bloc avec coefficient ±1, tous les autres à 0,
  aucun externe. Trois sortes : **programme positive**, **programme
  négative**, **common positive** (common négatif **interdit** par le
  chargeur → erreur). Exemples (LIMA d'un autre bloc) : `LIMA+MIKE-16`,
  `FOX-EASY+FOX`, `3*FOX-2*EASY`, `EASY-*+FOX`, `FOX-100B/MIKE`,
  `-MIKE*2+LIMA`, `=10HMESSAGE 33`, `-*O`.
- **Externe** : un seul externe avec coefficient **+1** (positif), tous
  les coefficients de blocs nuls. Exemples (XYZ, ABC externes ; compteurs
  du bloc de LIMA) : `XYZ-*+FOX-EASY+LIMA`, `FOX-3*EASY+2*FOX+XYZ`,
  `ABC+100B+MIKE`. Illégaux : `XYZ+ABC` (deux externes), `-ABC+*-LIMA`
  (externe négatif), `XYZ+*O` (relogeable non apparié).
- **Registre** : comme ci-dessus, plus des registres.
- Toute autre combinaison (coefficient ±2, deux blocs non annulés, externe
  + relogeable…) → erreur **A** (« The relocatable terms do not cancel
  properly » / « The expression does not reduce to one external term »).
- La notion de bloc est celle de la **passe 1** : deux symboles de blocs
  locaux **différents** ne s'annulent pas, même si leur différence serait
  constante après allocation. [INFÉRENCE stricte d'après le texte.]
- Un symbole d'un bloc local dans un **assemblage absolu** est relogeable
  en passe 1 et absolu en passe 2 ; un bloc common dans un programme
  absolu est traité comme un bloc local (§10.2).
- Contraintes de contexte (ch. 4, 8) : certaines instructions exigent une
  expression absolue (erreur A), ou évaluable, ou interdisent les
  externes ; un point d'entrée relogeable négatif → erreur **N** ; ORG/ORGC
  avec relocation négative → erreur A.
- Listing : le code octal d'un mot contenant une adresse est suivi de
  `+` (relogeable positive), `-` (relogeable négative), `C` (common),
  `X` (externe). (Le signe `-` est illisible dans l'OCR ; inféré.)
- Avertissement du manuel : certains chargeurs se comportent mal si une
  adresse relogeable/externe est assemblée plusieurs fois dans le même
  champ du même mot (ORG en arrière, common préréglé par plusieurs
  modules) ; `ORGC` permet de l'éviter. En `VFD` relogeable : aucun champ
  relogeable/externe ne peut chevaucher une frontière de mot, et 4 champs
  relogeables/externes au plus par mot.

### 9.6 Évaluation selon la passe et valeur des externes

- **Externe** défini hors du sous-programme : valeur **0**. Externe défini
  dans le sous-programme relativement à un externe : valeur = décalage
  par rapport à cet externe.
- **Passe 1** : la valeur d'un symbole relogeable est relative au **début
  de son bloc**. **Passe 2** : relative à l'origine du **programme** (pour
  les blocs locaux) ou du **bloc common**. Une expression contenant des
  symboles relogeables ne s'évalue donc pas forcément pareil dans les deux
  passes (d'où l'exigence « évaluable »/« préalablement défini » pour les
  pseudos qui influencent l'allocation).

### 9.7 Exemples d'expressions (§2.8)

| Expression | Lecture |
|---|---|
| `ABLE` | un terme |
| `$-29` | deux termes : `$` et 29 |
| `1+=3.14159EE+6` | constante + adresse d'un littéral double précision |
| `*+3` | location + 3 |
| `ABLE*4-72/NUM` | (ABLE×4) − (72÷NUM) |
| `10B` | constante octale |
| `3+A6-NUM` | registre A6, opérande 3−NUM |
| `1R=∧1R/` | XOR des codes de `=` (54B) et `/` (50B) = 04B |

---

## 10. Structure de programme (chapitre 3)

### 10.1 Sous-programme et groupe de blocs

- Sous-programme = `IDENT` … `END`. Programme principal si `END` donne une
  **adresse de transfert** (`END BEGIN`).
- Un sous-programme peut être divisé en **blocs** ; le code peut être
  dirigé alternativement vers plusieurs blocs (`USE`, `USELCM`, `ORG`,
  `ORGC`) ; les emplacements d'un bloc sont attribués consécutivement.
- Un symbole défini dans un bloc **n'est pas local au bloc** : il est
  global au sous-programme (seul QUAL le restreint).
- Les blocs établis entre deux `IDENT`, ou entre `IDENT` et `END`, forment
  un **groupe de blocs**. **255 blocs au plus par groupe, dont 252
  établis par l'utilisateur** (> 255 → erreur **F**). Quand COMPASS
  interprète `IDENT` ou `END`, il exécute la **passe 2 du groupe achevé** :
  tous les symboles reçoivent des valeurs absolues, la table des noms de
  blocs est effacée, la liste des USE/USELCM/ORG/ORGC est effacée, la
  structure de blocs repart de zéro. Pour `END`, la table des symboles est
  aussi effacée avant le sous-programme suivant.
- Code généré avant tout `USE` (ou sans `USE`) → **bloc nominal**, listé
  `PROGRAM*` : bloc **absolu** pour un programme absolu, **bloc zéro**
  pour un programme relogeable.
- Limites externes : plus de **511 symboles externes** → erreur F.

### 10.2 Types de blocs

| Bloc | Nom au listing | Description |
|---|---|---|
| **Absolu** | `PROGRAM*` (assemblage absolu) / `ABSOLUTE*` (relogeable) | Bloc nominal d'un assemblage absolu. Code absolu ; symboles définis en passe 1 comme valeurs absolues relatives à 0 (= origine du bloc) ; doit être chargé à l'origine indiquée. Dans un assemblage relogeable, n'existe que si un `ORG`/`ORGC` reçoit une valeur **absolue** ; le chargeur charge ce texte tel quel (adresses relatives à RA, sans manipulation). Pas de bloc absolu ECS/LCM. |
| **Zéro** | `PROGRAM*` | Nom de bloc `0`. Bloc nominal CM/SCM d'un assemblage **relogeable** ; **local** (inaccessible aux autres modules). En fin d'assemblage, les **symboles par défaut** non définis y sont placés à la fin. Dans un programme absolu, il n'existe que s'il y a des symboles par défaut, et suit immédiatement le bloc absolu (également listé `PROGRAM*`). Pas de bloc zéro ECS/LCM. |
| **Littéraux** | `LITERALS*` | Entrées littérales ; local ; **toujours immédiatement après le bloc zéro**. L'utilisateur ne le contrôle pas (sauf via `LIT`). Pas de bloc littéraux ECS/LCM. |
| **Locaux utilisateur** | nom | Établis par `USE nom` / `USELCM nom`. En fin d'assemblage, chacun reçoit une origine relative au bloc nominal, **dans l'ordre d'établissement**. Tous les blocs locaux CM/SCM sont concaténés en un seul bloc pour le chargeur (nom unique au module) ; de même pour les blocs locaux ECS/LCM. |
| **Common nommé** | `/nom/` | Zone préréglable partagée entre modules relogeables. `USE /nom/` (CM) ou `USELCM /nom/` (LCM). Le premier module chargé qui le déclare fixe sa taille maximale. Dans un **programme absolu**, `USE /nom/` crée un bloc **local** nommé `/nom/`. |
| **Common blanc** | `//` | Non préréglable (le chargeur n'y charge rien). `USE //` (CM) / `USELCM //` (LCM). Alloué par le chargeur après chargement de tous les modules, à la plus grande taille déclarée. Seules `BSS` et `ORG` peuvent suivre (`BSSZ` illégal). Données dans le common blanc → erreur **R**. Dans un programme absolu : bloc local nommé `//`, données permises. |

Compléments (`USE`, ch. 4 §4.5.1) :

- `USE 0` ou `USE` blanc : bloc nominal. `USE *` : bloc utilisé avant le
  USE/USELCM/ORG/ORGC courant (pile).
- Nom de bloc local : 1 à 8 caractères, sans blanc ni virgule, premier
  caractère ≠ `:`. `USE A` et `USE /A/` sont des blocs différents.
- Nom de common : 7 caractères au plus, sans blanc ni virgule, premier et
  dernier caractères ≠ `:`.
- `/0/` (common) coexiste avec le bloc `0` ; `//` (blanc) coexiste avec un
  common nommé `////` [OCR].
- **Noms redondants** (CPU) : deux blocs de même nom et même mémoire
  peuvent coexister s'ils sont de types différents (local/common) ; de
  même nom et même type s'ils sont de mémoires différentes (CM/LCM) →
  jusqu'à **4 blocs** de même nom. Clé d'un bloc = (nom, local|common,
  CM|LCM).
- `USELCM` : CPU seulement.
- Longueur de chaque bloc ECS/LCM (y compris le bloc local combiné)
  **arrondie au multiple de 8 mots** supérieur ; taille max d'un bloc
  ECS/LCM : **1 048 568 mots**.
- Résumé des blocs au listing (option B) : `BLOCKS TYPE ADDRESS LENGTH`,
  types `ABSOLUTE` (tout bloc d'un assemblage absolu), `LOCAL` (relatif
  à l'origine du bloc zéro), `COMMON` (relatif à l'origine du common),
  préfixe `+` pour un bloc ECS/LCM (ch. 11).

### 10.3 Compteurs de bloc (§3.2)

Pour **chaque bloc**, COMPASS tient trois compteurs, rétablis à la reprise
du bloc :

- À l'établissement d'un bloc : origin = location = 0 en passe 1 ;
  position = 60 (CPU), 12 (PP) ou 16 (PP `CIPPU` format long).
- En passe 2, chaque bloc local reçoit une **valeur initiale**
  d'origin/location = son origine allouée.

**Compteur origin** (`*O`) : position relative du prochain mot assemblé ou
réservé dans le bloc. +1 par mot assemblé ou sauté en avant, −1 par mot
sauté en arrière. `ORG`, `ORGC`, `BSS` l'avancent ; `ORG`/`ORGC` peuvent
aussi le ramener en arrière ou changer de bloc ; `BSS` peut le
décrémenter (BSS négatif) sans changer de bloc.

**Compteur location** (`*`, `*L`) : normalement égal à l'origin ; sert à
définir les adresses symboliques. Incrémenté avec l'origin. `LOC` peut le
rendre différent (code chargé à un endroit et exécuté ailleurs, ou table
numérotée depuis 0) ; cela **ne change pas** le placement du code. Au
listing, une adresse est précédée de `L` quand location ≠ origin.

**Compteur position** (`*P`, `$` = *P − 1) : bits numérotés 59..0 (CPU),
11..0 (PP 12 bits), 15..0 (PP 16 bits). Vaut 60/12/16 au départ = nombre
de bits **restants** dans le mot ; décrémenté d'un par bit assemblé ; 0
quand le mot est complet, remis à 60/16/12 au début d'une nouvelle
opération (mot suivant). En CPU, les instructions 15 et 30 bits lui
donnent normalement les valeurs 60, 45, 30, 15. En PP, valeur normale 12
(16 si CIPPU format long). `VFD` et `POS` modifient cette progression.

**Longueur d'un bloc** : [AMBIGU] le manuel parle tantôt de « la valeur
finale des compteurs origin », tantôt de « la valeur maximale du compteur
origin ». Recommandation : longueur = **valeur maximale atteinte** par le
compteur origin du bloc (identique dans l'usage normal).

### 10.4 Forçage en début de mot (« force upper », §3.2.4)

**CPU.** Avant d'assembler l'instruction suivante, si l'une des conditions
est vraie, l'assembleur complète les parcelles restantes du mot en cours
avec des **no-op** (`46000B`, 15 bits), met position = 60 et incrémente
origin et location :

1. place insuffisante dans le mot pour l'instruction ou la donnée
   suivante ;
2. instruction machine ou `VFD` avec **un symbole ou `+` en location** ;
3. instruction `RE`, `WE`, `PS`, `XJ`, `CC`, `CU`, `DM`, `IM` (et `RL`,
   `WL` sous NOS et NOS/BE) sur CYBER 180/170, CYBER 70 modèles 71–74,
   série 6000 — **annulable par `-` en location** ;
4. pseudo `END`, `BSS`, `BSSZ`, `DATA`, `DIS`, `CON`, `SEGMENT`, `SEG`,
   `IDENT`, `ORGC`, `LOC`, `ORG` ou `MD`.

Forçage **après** assemblage (différé) de : `JP`, `RJ`, `EQ` inconditionnel,
`ZR` inconditionnel, `ES` et `MJ` (CYBER 70/76, 7600), `PS` et `XJ`
(CYBER 180/170, 70 modèles 71–74, 6000), `IM` (CYBER 70 modèles 72, 73).
Ce forçage différé n'a lieu qu'à la rencontre de la prochaine instruction
machine, ou pseudo de génération de données, d'allocation ou de contrôle
binaire, **dans le même bloc USE** ; il est annulé par un `-` en location
de cette instruction suivante. Les pseudos intermédiaires qui lisent les
compteurs voient la valeur **avant** forçage.

(« EQ inconditionnel » = `EQ` sans registres, i.e. `EQ K` ≡ `EQ B0,B0,K` ;
« ZR inconditionnel » = `ZR K` [INFÉRENCE ; détails au ch. 8].)

VFD (ch. 4 §4.8.5) : location symbole → forçage, symbole = location après
forçage ; `+` → forçage ; `-` → COMPASS génère des bits nuls jusqu'à la
prochaine frontière de **quart de mot** (15 bits) et le premier champ y
commence ; blanc → le premier champ commence à la position courante. Si
l'instruction suivante du bloc n'est pas un `VFD` à location blanche et que
le dernier champ s'arrête avant une frontière de quart de mot, des zéros
sont insérés jusqu'à cette frontière (invisibles au listing), puis les
parcelles restantes sont remplies de no-op. VFD consécutifs sans location :
champs contigus, sans remplissage.

**PP.** Aucun forçage. Un `+` en location est ignoré sauf sur `VFD` ; sur
un `VFD`, `+` ou `-` (ou un symbole) fait commencer les données au mot
suivant.

### 10.5 Programme relogeable (§3.3)

- CPU seulement. Composé d'un ou plusieurs modules assemblés/compilés
  séparément (COMPASS ou autres langages produisant du binaire relogeable
  acceptable par le chargeur).
- En mémoire, les modules occupent des blocs de mots contigus ; le premier
  mot du premier bloc est l'**adresse de référence RA** ; le total est la
  longueur de champ (FL).
- Les modules relogeables sont assemblés **comme commençant à l'adresse
  0** ; toute adresse devient fonction de RA.
- **Un IDENT non blanc sans adresse de chargement fixe** ⇒ module
  relogeable.
- En fin d'assemblage, chaque bloc local reçoit une origine relative au
  bloc zéro ; chaque bloc devient une extension du bloc zéro. Ordre
  d'allocation [INFÉRENCE d'après §3.1 et fig. 3-1/3-2] :

```
0                      : bloc zéro (PROGRAM*), longueur L0
                         dont, à la fin, 1 mot par symbole =S non défini
L0                     : LITERALS*, longueur Llit
L0+Llit                : 1er bloc local utilisateur CM (ordre d'établissement)
...                    : blocs locaux suivants
(LCM) bloc local LCM combiné : blocs locaux LCM concaténés, origine 0 relative à ce bloc
common /X/, //         : chacun relatif à sa propre origine (relocation common)
ABSOLUTE*              : adresses absolues relatives à RA
```

- **Longueur du module au listing** = somme des valeurs finales des
  compteurs origin des blocs locaux, **y compris** bloc zéro et bloc
  littéraux, **sans** le bloc absolu.
- Liaison : `ENTRY`, `ENTRYC`, `EXT`.
- Binaire relogeable : une section par pseudo `LCC` (s'il y en a), suivie
  d'une section contenant les tables du chargeur.

### 10.6 Programme absolu (§3.4)

- Code non relogeable, chargé à des adresses fixes (chargement plus
  rapide). CPU absolu ou relogeable ; PP toujours absolu.
- COMPASS construit une **image mémoire**. En passe 2, chaque bloc reçoit
  une origine relative au bloc absolu ; tout symbole relogeable reçoit une
  adresse absolue ; chaque bloc devient une extension du bloc absolu.
  Ordre (fig. 3-2) : `PROGRAM*` (absolu) → `PROGRAM*` (bloc zéro, si
  symboles par défaut) → `LITERALS*` (si littéraux) → blocs locaux A, B,
  C dans l'ordre d'établissement.
- Module binaire absolu : table **préfixe** (PRFX, `7700B`), table
  d'**en-tête**, image binaire. En-têtes possibles : ASCM (`5000B`),
  EASCM (`5100B`), ACPM (`5300B`), EACPM (`5400B`). Les tables sont
  désignées au listing par leur numéro octal ; formats dans le manuel du
  chargeur (spec du chargeur).
- Quantité de binaire écrite à une instruction de contrôle binaire
  (`IDENT`, `SEGMENT`, `SEG`, `END`) :
  - groupe de blocs complet (IDENT…END ou IDENT…IDENT) : l'image se
    termine à la **valeur maximale du compteur origin du dernier bloc
    établi** (dernière adresse de mot) ;
  - portion seulement : l'image se termine à la valeur **courante** du
    compteur origin.
- `END`, `SEGMENT` et un `IDENT` non blanc terminent un overlay et
  écrivent une **fin de section** ; `SEGMENT` et `IDENT` écrivent les
  informations d'en-tête de l'overlay suivant.

### 10.7 Overlays absolus (§3.4.1)

- Plus d'un `IDENT` (non blanc) ou des `SEGMENT` dans un programme absolu ⇒
  une **section par overlay**.
- CPU : trois niveaux — principal (main), primaire, secondaire. Niveau =
  **paire de nombres octaux 0–77B** `(p,s)` donnée par `IDENT` ou
  `SEGMENT` : `0,0` = principal ; `p≠0, s=0` = primaire ; `p≠0, s≠0` =
  secondaire. Sans niveaux explicites : `0,0` pour le premier overlay,
  `1,0` pour tous les suivants. Hiérarchie, ordre et cohabitation en
  mémoire ne sont **pas** contrôlés par COMPASS.
- Overlays PP : pas de niveaux, sinon semblables. Code PP en `7774B–7777B`
  peut mal se charger (retour à 0000).
- **Overlay de type IDENT** : du `IDENT` au suivant (exclu), ou du dernier
  `IDENT` à `END`. Le premier `IDENT` produit l'identification ; un
  second `IDENT` avant `END` produit l'image de l'overlay de l'origine du
  précédent IDENT jusqu'à la max. du compteur origin du dernier bloc
  déclaré (ou jusqu'à l'origin courant si un SEG/SEGMENT a précédé), puis
  fin de section et identification du suivant. **Tous les blocs, y compris
  les littéraux, sont complétés** ; la structure de blocs repart à zéro
  (mêmes noms de blocs réutilisables, chaque overlay a son bloc
  littéraux ; table USE et compteurs réinitialisés). L'origine d'un
  overlay IDENT peut tomber n'importe où dans un overlay précédent (tous
  les symboles ont reçu une adresse absolue). La table de contrôle du
  chargeur est chargée sous l'adresse donnée par `ORG`.
- **Overlay de type SEGMENT** : de `IDENT` au premier `SEGMENT`, d'un
  `SEGMENT` au suivant, du dernier `SEGMENT` à `END`. À chaque `SEGMENT` :
  image depuis l'origine de l'overlay précédent jusqu'à la valeur
  **courante** du compteur origin du bloc en cours ; fin de section ;
  identification du suivant. `SEGMENT` **n'efface ni la table des
  symboles ni la table USE** : le bloc en cours est incomplet, l'utilisateur
  doit s'assurer que les autres blocs sont complets ; seuls les symboles
  valides pour le bloc en cours peuvent définir l'origine du nouvel
  overlay ; chaque overlay SEGMENT doit utiliser des **noms de blocs
  nouveaux** (un bloc d'un overlay précédent ne peut pas être repris). Le
  bloc zéro et le bloc littéraux tombent dans l'overlay qui contient la
  fin du bloc absolu.
- **Overlays à points d'entrée multiples** (§3.4.2) : `ENTRY` est permis
  en assemblage absolu et génère une **table overlay 5100B** (mot de
  contrôle + liste des points d'entrée) placée **sous l'origine de
  l'overlay**, longue d'un mot de plus que le nombre d'entrées.

### 10.8 Binaire partiel (§3.4.3)

- Programme ou overlay CPU absolu contenant des `SEG` ou des `IDENT` à
  champ variable **blanc** : COMPASS écrit une **section partielle** = le
  binaire produit depuis le précédent `IDENT`, `SEGMENT` ou `SEG`, **sans
  fin de section ni nouvelle table préfixe**. `SEGMENT`, `IDENT` non blanc
  ou `END` complètent la section.
- **SEG** : réduit la mémoire de l'assembleur ; n'écrit pas un groupe de
  blocs complet : du premier bloc établi dans cette portion jusqu'au
  compteur origin du bloc courant. Stocker des données dans un bloc hors
  de la portion courante → **erreur fatale** [INFÉRENCE : R]. La portion
  contenant la fin du bloc absolu contient le bloc littéraux. Tables des
  symboles et USE **non** réinitialisées.
- **IDENT blanc** : écrit tout le binaire accumulé depuis le précédent
  IDENT/SEG/SEGMENT, sans fin de section ni table `7700B`. Table USE et
  compteurs **réinitialisés** ; chaque symbole reçoit une adresse absolue.
  Les blocs de chaque section partielle sont alloués comme si c'était un
  nouveau sous-programme (son bloc absolu, son bloc littéraux, ses blocs
  locaux) ; l'origine du nouveau bloc absolu = dernière adresse + 1 du
  dernier bloc de la portion précédente. Image : de l'origine du bloc
  absolu à la max. du compteur origin du dernier bloc (ou à l'origin
  courant si un SEG/SEGMENT a déjà écrit une partie du groupe). Les noms de
  blocs peuvent être réutilisés (blocs indépendants). Écrire dans, ou
  ramener l'origin vers, une section partielle déjà écrite → **erreur de
  plage** (« range error » [INFÉRENCE : R]).

---

## 11. Jeux de caractères (annexe A)

### 11.1 Notes de l'annexe A

1. « Majuscule/minuscule » ne désigne que les conversions de casse.
2. Display → ASCII/EBCDIC : on prend l'équivalent majuscule.
3. ASCII/EBCDIC → display : majuscules et minuscules donnent le même code
   display.
4. Tout code ASCII/EBCDIC non listé → display **55B** (blanc).
5. Deux glyphes display pour un code : à gauche jeu **CDC 64 caractères**
   (IP CSET = C64.1), à droite **sous-ensemble ASCII 64 caractères**
   (C64.2).
6. Jeu **63 caractères** : `:` = display **63B** ; `%` n'existe pas
   (ASCII `%` → 55B) ; le code display **00 est indéfini**.
7. 12 bits nuls ou plus en fin de mot 60 bits = **marque de fin de ligne**
   (et non deux `:`). Convertie en BCD externe 1632 / BCD interne 1672 sur
   bande 7 pistes en parité paire, et reconvertie en 0000 en lecture.
8. (Code `00` BCD externe de `:`) changé en 12 à l'écriture sur bande 7
   pistes en parité paire.
9. 11-0 et 11-8-2 équivalents en lecture (perforé 11-0).
10. 12-0 et 12-8-2 équivalents en lecture (perforé 12-0).
11. 12-8-7 et 11-0 équivalents en lecture (perforé 12-8-7) [OCR douteux].
12. 12-8-4 et 12-0 équivalents en lecture (perforé 12-8-4) [OCR douteux].
13. Pseudo `CODE` : `A` ASCII (sous-ensemble 6 bits), `D` display
    (défaut), `E` BCD externe, `I` BCD interne (plus `N` ASCII 8 bits et
    `O` « autre », ch. 4).

### 11.2 Table complète

Colonnes : code display (octal) ; glyphe CDC 64 ; équivalent ASCII
(sous-ensemble 64) ; perforation Hollerith 026 ; **BCD externe** (`CODE
E`) ; **BCD interne** (`CODE I`) ; ASCII (hex) ; **ASCII 6 bits** (`CODE
A`, octal) ; perforation ASCII 029.

Règle vérifiée sur toute la table : **ASCII 6 bits = code ASCII − 40B**
(ex. `O` = 4Fh → 57B). Les valeurs BCD ont été reconstruites à partir de
l'OCR de l'annexe A et de la carte de référence, et contrôlées par les
règles de construction BCD (zone 12 → 6x/7x externe, 2x/3x interne ; zone
11 → 4x/5x ; zone 0 → 2x/3x externe, 6x/7x interne ; chiffre 0 = 12B
externe, 00 interne ; blanc = 20B externe, 60B interne) et par l'exemple
`CODE` du manuel (`OUTPUT` → E : `46 24 23 47 24 23`, I : `46 64 63 47 64
63`, A : `57 65 64 60 65 64`).

| Display | CDC | ASCII | 026 | BCD ext. (E) | BCD int. (I) | ASCII hex | ASCII 6 bits (A) | 029 |
|---|---|---|---|---|---|---|---|---|
| 00 | `:` (jeu 64) | `:` | 8-2 | 00 (note 8) | 12 [INFÉRENCE] | 3A | 32 | 8-2 |
| 01 | A | A | 12-1 | 61 | 21 | 41 | 41 | 12-1 |
| 02 | B | B | 12-2 | 62 | 22 | 42 | 42 | 12-2 |
| 03 | C | C | 12-3 | 63 | 23 | 43 | 43 | 12-3 |
| 04 | D | D | 12-4 | 64 | 24 | 44 | 44 | 12-4 |
| 05 | E | E | 12-5 | 65 | 25 | 45 | 45 | 12-5 |
| 06 | F | F | 12-6 | 66 | 26 | 46 | 46 | 12-6 |
| 07 | G | G | 12-7 | 67 | 27 | 47 | 47 | 12-7 |
| 10 | H | H | 12-8 | 70 | 30 | 48 | 50 | 12-8 |
| 11 | I | I | 12-9 | 71 | 31 | 49 | 51 | 12-9 |
| 12 | J | J | 11-1 | 41 | 41 | 4A | 52 | 11-1 |
| 13 | K | K | 11-2 | 42 | 42 | 4B | 53 | 11-2 |
| 14 | L | L | 11-3 | 43 | 43 | 4C | 54 | 11-3 |
| 15 | M | M | 11-4 | 44 | 44 | 4D | 55 | 11-4 |
| 16 | N | N | 11-5 | 45 | 45 | 4E | 56 | 11-5 |
| 17 | O | O | 11-6 | 46 | 46 | 4F | 57 | 11-6 |
| 20 | P | P | 11-7 | 47 | 47 | 50 | 60 | 11-7 |
| 21 | Q | Q | 11-8 | 50 | 50 | 51 | 61 | 11-8 |
| 22 | R | R | 11-9 | 51 | 51 | 52 | 62 | 11-9 |
| 23 | S | S | 0-2 | 22 | 62 | 53 | 63 | 0-2 |
| 24 | T | T | 0-3 | 23 | 63 | 54 | 64 | 0-3 |
| 25 | U | U | 0-4 | 24 | 64 | 55 | 65 | 0-4 |
| 26 | V | V | 0-5 | 25 | 65 | 56 | 66 | 0-5 |
| 27 | W | W | 0-6 | 26 | 66 | 57 | 67 | 0-6 |
| 30 | X | X | 0-7 | 27 | 67 | 58 | 70 | 0-7 |
| 31 | Y | Y | 0-8 | 30 | 70 | 59 | 71 | 0-8 |
| 32 | Z | Z | 0-9 | 31 | 71 | 5A | 72 | 0-9 |
| 33 | 0 | 0 | 0 | 12 | 00 | 30 | 20 | 0 |
| 34 | 1 | 1 | 1 | 01 | 01 | 31 | 21 | 1 |
| 35 | 2 | 2 | 2 | 02 | 02 | 32 | 22 | 2 |
| 36 | 3 | 3 | 3 | 03 | 03 | 33 | 23 | 3 |
| 37 | 4 | 4 | 4 | 04 | 04 | 34 | 24 | 4 |
| 40 | 5 | 5 | 5 | 05 | 05 | 35 | 25 | 5 |
| 41 | 6 | 6 | 6 | 06 | 06 | 36 | 26 | 6 |
| 42 | 7 | 7 | 7 | 07 | 07 | 37 | 27 | 7 |
| 43 | 8 | 8 | 8 | 10 | 10 | 38 | 30 | 8 |
| 44 | 9 | 9 | 9 | 11 | 11 | 39 | 31 | 9 |
| 45 | + | + | 12 | 60 | 20 | 2B | 13 | 12-8-6 |
| 46 | - | - | 11 | 40 | 40 | 2D | 15 | 11 |
| 47 | * | * | 11-8-4 | 54 | 54 | 2A | 12 | 11-8-4 |
| 50 | / | / | 0-1 | 21 | 61 | 2F | 17 | 0-1 |
| 51 | ( | ( | 0-8-4 | 34 | 74 | 28 | 10 | 12-8-5 |
| 52 | ) | ) | 12-8-4 | 74 | 34 | 29 | 11 | 11-8-5 |
| 53 | $ | $ | 11-8-3 | 53 | 53 | 24 | 04 | 11-8-3 |
| 54 | = | = | 8-3 | 13 | 13 | 3D | 35 | 8-6 |
| 55 | blanc | blanc | (aucune) | 20 | 60 | 20 | 00 | (aucune) |
| 56 | , | , | 0-8-3 | 33 | 73 | 2C | 14 | 0-8-3 |
| 57 | . | . | 12-8-3 | 73 | 33 | 2E | 16 | 12-8-3 |
| 60 | ≡ | # | 0-8-6 | 36 | 76 | 23 | 03 | 8-3 |
| 61 | [ | [ | 8-7 | 17 | 17 | 5B | 73 | 12-8-2 |
| 62 | ] | ] | 0-8-2 | 32 | 72 | 5D | 75 | 11-8-2 |
| 63 | % (jeu 64) / `:` (jeu 63) | % | 8-6 | 16 | 16 | 25 | 05 | 0-8-4 |
| 64 | ≠ | " | 8-4 | 14 | 14 | 22 | 02 | 8-7 |
| 65 | → | _ | 0-8-5 | 35 | 75 | 5F | 77 | 0-8-5 |
| 66 | ∨ | ! | 11-0 | 52 | 52 | 21 | 01 | 12-8-7 |
| 67 | ∧ | & | 0-8-7 | 37 | 77 | 26 | 06 | 12 |
| 70 | ↑ | ' | 11-8-5 | 55 | 55 | 27 | 07 | 8-5 |
| 71 | ↓ | ? | 11-8-6 | 56 | 56 | 3F | 37 | 0-8-7 |
| 72 | < | < | 12-0 | 72 | 32 | 3C | 34 | 12-8-4 |
| 73 | > | > | 11-8-7 | 57 | 57 | 3E | 36 | 0-8-6 |
| 74 | ≤ | @ | 8-5 | 15 | 15 | 40 | 40 | 8-4 |
| 75 | ≥ | \ | 12-8-5 | 75 | 35 | 5C | 74 | 0-8-2 |
| 76 | ¬ | ^ | 12-8-6 | 76 | 36 | 5E | 76 | 11-8-7 |
| 77 | ; | ; | 12-8-7 | 77 | 37 | 3B | 33 | 11-8-6 |

Points de la table à surveiller (OCR) : BCD interne de `:` (12B,
inféré de la perforation 8-2) ;
perforations 029 de 66B/67B ; colonnes ASCII minuscules et EBCDIC de
l'annexe (non nécessaires à l'assembleur, omises).

### 11.3 Lecture d'un source ASCII (implémentation JS)

- ASCII → display : utiliser la colonne « équivalent ASCII » à l'envers ;
  minuscules a–z → 01–32B ; accepter aussi les glyphes CDC Unicode (`≡ ≠ →
  ∨ ∧ ↑ ↓ ≤ ≥ ¬`) comme alias ; tout autre caractère → 55B (blanc).
- `:` → **00B** (jeu 64) ou **63B** (jeu 63) ; `%` → 63B (jeu 64) ou 55B
  (jeu 63). Recommandation : option `charset: 64 | 63`, défaut 64 (table
  principale du manuel) ; NOS est souvent installé en 63 caractères.
- Toute la logique de l'assembleur (édition, analyse, valeurs des
  constantes) opère sur les **codes display** ; la conversion vers le code
  de sortie (CODE) se fait au moment où une donnée/constante caractère est
  évaluée.

### 11.4 Codes de génération (pseudos CODE et CHAR, ch. 4)

- `CODE D` (défaut) : display. `CODE A` : ASCII **6 bits** (ASCII − 40B).
  `CODE E` : BCD externe. `CODE I` : BCD interne. `CODE N` : ASCII
  **8 bits** (défaut sous `CIPPU` ; mise en paquet hors du périmètre de ce
  document). `CODE O` : code « autre » défini par `CHAR`. `CODE *` :
  revient au code précédent (pile des **50** derniers ; pile vide →
  display). Caractère inconnu → erreur A.
- `mname CODE c` : redéfinit le micro `mname` à la lettre du code
  précédent (`A`, `D`, `E`, `I`, `N`, `O`) ; si aucun micro programme ou
  système nommé `CODE` n'est défini, le micro prédéfini `CODE` prend la
  lettre du nouveau code. Le listing affiche `c1→c2` (ancien → nouveau).
- `CHAR exp1,exp2` : en mode `CODE O`, le caractère de code display
  `exp1` (0–77B) est généré avec la valeur `exp2` (0–77B). Initialement,
  « autre » = display. Ex. `CHAR 0,63B` puis `CHAR 63B,0` échangent `:` et
  `%`.
- `BASE` (même chapitre) gouverne la base des données numériques sans
  radix : `D` décimal (défaut), `O` octal, `M` mixte (décimal pour : comptes
  de bits VFD, comptes de lignes IF/ELSE/SKIP, comptes de caractères
  MICRO/OCTMIC/DECMIC, sous-champs B/C/I de REP/REPI, comptes DUP/ECHO,
  comptes de caractères, S, facteurs d'échelle, point binaire, n de COL,
  compte de mots DIS, compte de lignes SPACE ; octal sinon), `*` (pile de
  50). Comptes de caractères, S, E, P : **toujours décimaux** quelle que
  soit la base.

---

## 12. Drapeaux d'erreur (référence, ch. 11 et carte)

Le drapeau est imprimé dans la colonne « Error Flags » à gauche de la
ligne fautive (les lignes en erreur sont toujours listées). **Lettre =
erreur fatale** (supprime le binaire) ; **chiffre = avertissement
informatif**. Un répertoire des erreurs (« ERROR DIRECTORY ») est édité en
fin de listing : `x TYPE ERROR  description / OCCURRED ON PAGES …`.

| Drapeau | Message | Causes (extraits pertinents pour ce document) |
|---|---|---|
| A | ADDRESS FIELD BAD. | sous-champ erroné ; caractère CODE ≠ A,D,E,I,O,* ; caractère BASE ≠ O,M,D,* ; symbole/nom > 8 caractères ; expression ne se réduisant pas à un seul externe ; termes relogeables qui ne s'annulent pas ; expression absolue exigée ; registres interdits ; 8/9 dans une donnée octale ; LIT sans donnée ; `=S`/`=X`/`=Y` sans symbole ; saut relatif PP hors de −31..31 ; registre dans CON ; relocation négative sur ORG/ORGC ; POS < 0 ou > taille de mot ; virgule manquante après le compte de mots DIS ; entrée illégale dans IDENT ; compte de micro hors 0..10… |
| D | DOUBLY DEFINED SYMBOL. THE FIRST DEFINITION HOLDS. | symbole déjà défini ou déclaré externe (la carte de référence OCR lit « B ») |
| E | ECHO, DUP, RMT, OR MACRO ILLEGALLY NESTED. | définition non entièrement contenue dans la définition englobante |
| F | NUMBER OF ENTRIES EXCEEDS PERMISSIBLE AMOUNT. | LIT > 100 mots ; plus de 63 paramètres+locaux ; plus de 255 blocs ; plus de 511 externes ; données XTEXT manquantes/erronées |
| L | LOCATION FIELD BAD. | location exigée erronée ; macro format 2 sans paramètre substituable |
| N | NEGATIVE RELOCATION ON ENTRY POINT. | point d'entrée relogeable négatif |
| O | OPERATION FIELD BAD. | opération inconnue ; hors séquence (ABS ou PPU pas dans le premier groupe d'instructions) ; illégale pour le mode binaire ; relation IF erronée ; instruction changée/invalide pour 810…855 (AIDTEXT) |
| P | CONSULT LISTING FOR REASON BEHIND P-ERROR. | drapeau utilisateur `ERR`/`ERRxx` |
| R | DATA ORIGIN OUTSIDE BLOCK OR IN BLANK COMMON BLOCK. | données dans le common blanc ou hors des limites du bloc |
| U | UNDEFINED SYMBOL. VALUE ASSUMED 0. | symbole non défini (y compris compte de lignes IF, compte DIS, attribut IF, qualificatif) |
| V | BIT COUNT ERROR ON VFD (MUST BE 0 ≤ COUNT ≤ 60). | taille de champ VFD erronée |
| 1 | LOCATION SYMBOL BAD. SYMBOL NOT DEFINED. | location erronée pour une instruction qui n'en demande pas |
| 2 | ADDRESS ERROR ON SYMBOL DEFINITION. | champ variable erroné ; symbole de location non défini |
| 3 | DUPLICATE MACRO DEFINITION. NEW ONE OVERRIDES. | macro/opdef/synonyme redéfinissant un code opération |
| 4 | BAD FORMAL PARAMETER NAME IGNORED. | paramètre formel répété ou illégal |
| 5 | CPU OPERATION SYNTAX INCORRECTLY SPECIFIED. | OPDEF/CPOP/CPSYN/PURGDEF |
| 6 | LOCATION FIELD MEANINGLESS. | location erronée, ignorée |
| 7 | ADDRESS VALUE EXCEEDS FIELD SIZE, RESULT TRUNCATED. | valeur > champ destination ; BSS négatif ; position/compte MICRO négatif |
| 8 | MISSING OR EXTRA ADDRESS SUBFIELD. | sous-champ manquant ou superflu |
| 9 | MICRO SUBSTITUTION ERROR. NO SUBSTITUTION. | référence de micro non reconnue |

[INFÉRENCE] Les avertissements mentionnés sans numéro dans les chapitres
1–3 (troncature de registre `A.10`, définition d'un symbole en forme de
registre, troncature d'une constante caractère) sont à rattacher au
drapeau 7 (troncature) ; la définition d'un symbole à forme de registre
n'a pas de numéro identifiable [AMBIGU : utiliser 6 ou 7, documenter le
choix].

---

## 13. Annexe D — conseils utiles à l'implémentation

- Dans une macro : les commentaires `*` en colonne 1 **ne sont pas
  sauvegardés**, les autres oui. `IRP` est plus rapide que `ECHO`/`DUP`.
  Les drapeaux de paramètre `;A`, `;B`… (77B suivi d'une lettre ; le 1er
  paramètre devient la marque interne 7701B, le 2e 7702B…) peuvent être
  écrits directement. Préférer `.1`, `.2`… aux symboles locaux.
- IF : préférer les comptes de lignes à `ENDIF` ; `SKIP` plutôt que
  `IF PP`.
- Micros : la substitution est coûteuse ; `≠≠` pour une substitution
  nulle.
- `SEG` dans les programmes absolus pour réduire la mémoire ; `NOREF` pour
  les symboles qu'on ne veut pas au tableau des références ; `QUAL` pour
  tous les overlays.
- Programme d'exemple (fig. D-1, NOS) : `IDENT EXAMPLE`, `ENTRY BEGIN`,
  `OBUF BSS 301B`, `OUTPUT FILEC OBUF,301B`, `BEGIN SB1 1`, `SB2 B0`,
  `SB3 6`, `MX1 0`, `LOOP SA2 TABLE+B2`, `SB2 B2+B1`, `IX1 X2+X1`,
  `NE B2,B3,LOOP`, `RJ =XCDD`, `SA6 ANS`, `WRITEH OUTPUT,WORDS,LEN`,
  `WRITER OUTPUT`, `ENDRUN`, `TABLE DATA 1` … `DATA 6`,
  `WORDS DATA H* THE ANSWER IS *`, `ANS BSS 1`, `LEN EQU *-WORDS`, `SST`,
  `XTEXT COMCSYS`, `XTEXT COMCWTH`, `XTEXT COMCCIO`, `XTEXT COMCCDD`,
  `END BEGIN`. Points de langage illustrés : `MX1 0` (15 bits) suivi d'une
  instruction 30 bits → la parcelle restante est remplie d'un no-op
  (forçage) ; le `+` après le code octal marque un champ K relogeable ;
  `=XCDD` déclare CDD externe fort par défaut ; `LEN EQU *-WORDS` est
  absolu (paire annulée). Code produit : `SB1 1` → `6110000001`,
  `SB2 B0` → `66200`, `SB3 6` → `6130000006`, `MX1 0` → `43100`,
  `SA2 TABLE+B2` → `5122000321 +`, `SB2 B2+B1` → `66221`,
  `IX1 X2+X1` → `36121`, `NE B2,B3,LOOP` → `0523000310 +`,
  `DATA 1` → `00000000000000000001`.

---

## 14. Synthèse des ambiguïtés

1. **Continuation après une « instruction terminée »** (§2.4) : interprété
   comme continuation après une ligne `*` ; sinon rattachement.
2. **Ordre concaténation / micros et ré-analyse** (§3.3) : balayage
   unique gauche→droite, pas de re-substitution.
3. **Chaînes vides C, Z, R, A** (§8.1) : un mot nul (blanc pour A).
4. **Allocation multi-mot de A/R** (§8.1) : cadrage à droite dans
   `ceil(n/cpw)` mots.
5. **Arrondi des entiers avec exposant négatif** et **arrondi/troncature
   avec P** (§8.2).
6. **Hexadécimal > 60 bits** (§8.3).
7. **Arithmétique en complément à un** : production de −0, produits et
   quotients signés (§9.3) — à valider par tests de non-régression sur des
   listings réels.
8. **Critère « valeur trop grande pour le champ »** (§9.3).
9. **XOR avec termes relogeables** (§9.3).
10. **Longueur de bloc** : maximum vs valeur finale du compteur origin
    (§10.3).
11. **BCD interne de `:`** et perforations 029 de 66B/67B (§11.2).
12. **Numéro d'avertissement** pour les symboles en forme de registre et
    la troncature `A.x` (§12).
13. **Lettre D vs B** pour « doubly defined » (tableau 11-1 : D ; carte
    OCR : B) — retenir **D**.
14. **Préfixe des symboles inventés** des LOCAL (`?Wnnnnn`) (§5.7).
