// DSD : programme d'affichage de la console 6612 (PP1), en COMPASS PP.

export const DSD = String.raw`          IDENT  DSD,100B
          PERIPH
          TITLE  DSD - AFFICHAGE CONSOLE DU MINI-SYSTEME.
*         DSD - RAFRAICHIT EN PERMANENCE LES DEUX ECRANS DE LA CONSOLE.
*
*         ECRAN GAUCHE : EN-TETE, ETAT DU TRAVAIL, JOURNAL, COMMANDE.
*         ECRAN DROIT  : REGISTRE P DU CPU (RPN), RA, FL, TEMPS.
*         CLAVIER : LA COMMANDE *DROP* ABANDONNE LE TRAVAIL.
*
 DAYP     EQU    20B
 STAT     EQU    21B
 JRA      EQU    22B
 JFL      EQU    23B
 TIMW     EQU    24B
 DATW     EQU    25B
 MSEC     EQU    26B
 JNAM     EQU    27B
 LIN1     EQU    30B
 CMDW     EQU    34B         COMMANDE POUR MTR (1 = DROP)
 DAYF     EQU    200B
*
 CH       EQU    10B         CANAL DE LA CONSOLE
*
 T1       EQU    1
 T2       EQU    2
 T3       EQU    3
 T4       EQU    4
 T5       EQU    5
 T6       EQU    6
 T7       EQU    7
 W        EQU    10B         MOT LU (5 CELLULES)
 BP       EQU    15B         POINTEUR DANS LE TAMPON DE SORTIE
 YY       EQU    16B         ORDONNEE DE LA LIGNE COURANTE
 IDX      EQU    17B
 NL       EQU    20B
 KEY      EQU    21B
 NCMD     EQU    22B         CARACTERES DE LA COMMANDE
*
*
          ORG    100B
 DSD      LDN    0
          STD    NCMD
*
*         BOUCLE D'AFFICHAGE.
 DSD1     FNC    7000B,CH    ECRAN GAUCHE, PETITS CARACTERES
          LDC    740B
          STD    YY
          RJM    BEG
          LDC    TITL
          RJM    TXT         EN-TETE
          LDN    DATW
          RJM    CMW         DATE
          LDN    TIMW
          RJM    CMW         HEURE
          RJM    PUT
          LDC    24B         LIGNE SUIVANTE
          RJM    NXL
          RJM    BEG
          LDC    TJOB
          RJM    TXT
          LDN    JNAM
          RJM    CMW         NOM DU TRAVAIL
          LDN    STAT        ETAT
          CRD    W
          LDD    W+4
          SBN    1
          ZJN    DSD2
          SBN    1
          ZJN    DSD3
          SBN    1
          ZJN    DSD4
          LDC    TNON
          UJN    DSD5
 DSD2     LDC    TRUN
          UJN    DSD5
 DSD3     LDC    TEND
          UJN    DSD5
 DSD4     LDC    TABT
 DSD5     RJM    TXT
          RJM    PUT
          LDC    30B
          RJM    NXL
          RJM    BEG
          LDC    TDAY
          RJM    TXT
          RJM    PUT
*         JOURNAL : LES 32 LIGNES, DE LA PLUS ANCIENNE A LA PLUS RECENTE.
          LDN    DAYP
          CRD    W
          LDD    W+4
          LPN    37B
          STD    IDX
          LDN    40B
          STD    NL
 DSD6     LDD    IDX
          SHN    2
          ADC    DAYF
          STD    T7          ADRESSE DE LA LIGNE
          CRD    W
          LDD    W
          ZJN    DSD7        LIGNE VIDE
          LDC    14B
          RJM    NXL
          RJM    BEG
          LDD    T7
          RJM    CMW
          LDD    T7
          ADN    1
          RJM    CMW
          LDD    T7
          ADN    2
          RJM    CMW
          LDD    T7
          ADN    3
          RJM    CMW
          RJM    PUT
 DSD7     AOD    IDX
          LPN    37B
          STD    IDX
          SOD    NL
          ZJN    DSD7A
          LJM    DSD6
 DSD7A    BSS    0
*         LIGNE DE COMMANDE EN BAS DE L'ECRAN.
          LDN    20B
          STD    YY
          RJM    BEG
          LDC    TCMD
          RJM    TXT
          LDN    0
          STD    T1
 DSD8     LDD    T1
          SBD    NCMD
          PJN    DSD9
          LDM    CMD,T1      UN CARACTERE PAR MOT, CADRE A GAUCHE
          SHN    6
          ADN    55B
          RJM    ADD
          AOD    T1
          UJN    DSD8
 DSD9     RJM    PUT
*
*         ECRAN DROIT : REGISTRES.
          FNC    7100B,CH    ECRAN DROIT, PETITS CARACTERES
          LDC    740B
          STD    YY
          RJM    BEG
          LDC    TREG
          RJM    TXT
          RJM    PUT
          LDC    30B
          RJM    NXL
          RJM    BEG
          LDC    TP
          RJM    TXT
          RPN                REGISTRE P DU CPU
          RJM    OCT
          RJM    PUT
          LDC    20B
          RJM    NXL
          RJM    BEG
          LDC    TRA
          RJM    TXT
          LDN    JRA
          CRD    W
          LDD    W+3
          LPN    77B
          SHN    12
          LMD    W+4
          RJM    OCT
          RJM    PUT
          LDC    20B
          RJM    NXL
          RJM    BEG
          LDC    TFL
          RJM    TXT
          LDN    JFL
          CRD    W
          LDD    W+3
          LPN    77B
          SHN    12
          LMD    W+4
          RJM    OCT
          RJM    PUT
          LDC    20B
          RJM    NXL
          RJM    BEG
          LDC    TMS
          RJM    TXT
          LDN    MSEC
          CRD    W
          LDD    W+3
          LPN    77B
          SHN    12
          LMD    W+4
          RJM    OCT
          RJM    PUT
          LDC    30B
          RJM    NXL
          RJM    BEG
          LDC    TLIN
          RJM    TXT
          RJM    PUT
          LDC    20B
          RJM    NXL
          RJM    BEG
          LDN    LIN1
          RJM    CMW
          LDN    LIN1+1
          RJM    CMW
          LDN    LIN1+2
          RJM    CMW
          LDN    LIN1+3
          RJM    CMW
          RJM    PUT
*
*         CLAVIER.
          FNC    7020B,CH
          ACN    CH
          IAN    CH
          STD    KEY
          DCN    CH
          LDD    KEY
          ZJN    DSD12
          LMN    60B         RETOUR CHARIOT : EXECUTER
          ZJN    DSD13
          LDD    KEY
          LMN    61B         RETOUR ARRIERE
          NJN    DSD10
          LDD    NCMD
          ZJN    DSD12
          SOD    NCMD
          UJN    DSD12
 DSD10    LDD    NCMD
          SBN    40B
          PJN    DSD12
          LDD    KEY
          STM    CMD,NCMD
          AOD    NCMD
 DSD12    LJM    DSD1
*         EXECUTION DE LA COMMANDE.
 DSD13    LDD    NCMD
          LMN    4
          NJN    DSD14
          LDM    CMD
          LMN    04B         D
          NJN    DSD14
          LDM    CMD+1
          LMN    22B         R
          NJN    DSD14
          LDM    CMD+2
          LMN    17B         O
          NJN    DSD14
          LDM    CMD+3
          LMN    20B         P
          NJN    DSD14
          LDN    0           DROP : DEMANDE A MTR
          STD    W
          STD    W+1
          STD    W+2
          STD    W+3
          LDN    1
          STD    W+4
          LDN    CMDW
          CWD    W
 DSD14    LDN    0
          STD    NCMD
          LJM    DSD1
          TITLE  SOUS-PROGRAMMES.
*
*         NXL - NOUVELLE LIGNE : Y = Y - (A).
 NXL      SUBR
          STD    T1
          LDD    YY
          SBD    T1
          STD    YY
          UJN    NXLX
*
*         BEG - COMMENCER UNE LIGNE (COORDONNEES X = 20B, Y = (YY)).
 BEG      SUBR
          LDN    0
          STD    BP
          LDC    6020B
          RJM    ADD
          LDC    7000B
          ADD    YY
          RJM    ADD
          UJN    BEGX
*
*         TXT - AJOUTER LE TEXTE (A) (MOTS JUSQU'AU MOT NUL).
 TXT      SUBR
          STD    T2
 TXT1     LDI    T2
          ZJN    TXTX
          RJM    ADD
          AOD    T2
          UJN    TXT1
*
*         CMW - AJOUTER LES 10 CARACTERES DU MOT CM (A).
 CMW      SUBR
          CRD    W
          LDN    W
          STD    T3
          LDN    5
          STD    T4
 CMW1     LDI    T3
          RJM    CNV
          RJM    ADD
          AOD    T3
          SOD    T4
          NJN    CMW1
          UJN    CMWX
*
*         OCT - AJOUTER 6 CHIFFRES OCTAUX DE (A).
 OCT      SUBR
          STD    T5          12 BITS BAS
          SHN    -12
          STD    T6          6 BITS HAUTS
          LDD    T6
          SHN    -3
          ADN    33B
          SHN    6
          STD    T1
          LDD    T6
          LPN    7
          ADN    33B
          RAD    T1
          LDD    T1
          RJM    ADD
          LDN    2
          STD    T4
 OCT1     LDD    T5
          SHN    3
          STD    T5
          SHN    -12
          LPN    7
          ADN    33B
          SHN    6
          STD    T1
          LDD    T5
          LPC    7777B
          SHN    3
          STD    T5
          SHN    -12
          LPN    7
          ADN    33B
          RAD    T1
          LDD    T5
          LPC    7777B
          STD    T5
          LDD    T1
          RJM    ADD
          SOD    T4
          NJN    OCT1
          LJM    OCTX
*
*         CNV - REMPLACER LES CARACTERES NON AFFICHABLES (60B-77B) PAR BLANC.
 CNV      SUBR
          STD    T6
          SHN    -6
          SBN    60B
          MJN    CNV1
          LDD    T6
          LPN    77B
          ADC    5500B
          STD    T6
 CNV1     LDD    T6
          LPN    77B
          SBN    60B
          MJN    CNV2
          LDD    T6
          SCN    77B
          ADN    55B
          STD    T6
 CNV2     LDD    T6
          UJN    CNVX
*
*         ADD - AJOUTER (A) AU TAMPON DE SORTIE.
 ADD      SUBR
          STM    BUF,BP
          AOD    BP
          UJN    ADDX
*
*         PUT - ENVOYER LE TAMPON A LA CONSOLE.
 PUT      SUBR
          ACN    CH
          LDD    BP
          OAM    BUF,CH
          DCN    CH
          LDN    0
          STD    BP
          UJN    PUTX
*
*         TEXTES (TERMINES PAR UN MOT NUL).
 TITL     DIS    ,*MINI-SYSTEME CDC 6600   *
 TJOB     DIS    ,*TRAVAIL *
 TNON     DIS    ,*  AUCUN*
 TRUN     DIS    ,*  EN COURS*
 TEND     DIS    ,*  TERMINE*
 TABT     DIS    ,*  ABANDONNE*
 TDAY     DIS    ,*JOURNAL*
 TCMD     DIS    ,*COMMANDE  *
 TREG     DIS    ,*UNITE CENTRALE*
 TP       DIS    ,*P  = *
 TRA      DIS    ,*RA = *
 TFL      DIS    ,*FL = *
 TMS      DIS    ,*MS = *
 TLIN     DIS    ,*DERNIER MESSAGE*
 CMD      BSS    40B
 BUF      BSS    100B
          END    DSD
`;
