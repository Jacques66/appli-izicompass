// Texte système CPU (équivalent du SYSTEXT/CPCTEXT de NOS) et decks communs.
// Ces sources COMPASS sont assemblées par notre assembleur : SYSTEXT est chargé
// au début de chaque assemblage CPU ; les decks sont inclus par XTEXT (ou
// automatiquement par les macros, via du code distant assemblé à END).

export const SYSTEXT = String.raw`          IDENT  SYSTEXT
          STEXT
*         TEXTE SYSTEME CPU : DEMANDES AU MONITEUR (RA+1), FICHIERS
*         (FET) ET ENTREES-SORTIES, DANS LE STYLE DE NOS.
*
*         AUTO - INCLUSION AUTOMATIQUE D'UN DECK COMMUN.
*         LE DECK EST ASSEMBLE A *END*, SAUF S'IL A DEJA ETE INCLUS
*         PAR LE PROGRAMME (MICRO DECK$ DEFINI PAR LE DECK).
AUTO      MACRO  DECK
          IF     -MIC,DECK,5
DECK      MICRO  1,1,*Y*
          RMT
          IF     -MIC,DECK$,1
          XTEXT  DECK
          RMT
          ENDM
*
*         SUBR - POINT D'ENTREE ET DE SORTIE D'UN SOUS-PROGRAMME.
*         CPU : NAME EST LE MOT RANGE PAR *RJ NAME* ; RETOUR PAR *EQ NAMEX*.
*         PP  : NAME EST LE MOT RANGE PAR *RJM NAME* ; RETOUR PAR *UJN NAMEX*.
          MACRO  SUBR,NAME
          IFPP   2
 NAME_X   LJM    *
 NAME     EQU    *-1
          IFCP   2
 NAME_X   EQ     *+400000B
 NAME     EQU    NAME_X
          ENDM
*
*         SYSCOM - ZONE DE COMMUNICATION DU TRAVAIL (RA+0 A RA+77B).
          MACRO  SYSCOM,LOC,REG
          IFC    EQ,$REG$B1$,1
          B1=1
 ARGR     EQU    2           ARGUMENTS DE LA CARTE DE CONTROLE
 PGNR     EQU    64B         NOM DU PROGRAMME
 CCDR     EQU    70B         IMAGE DE LA CARTE DE CONTROLE
          ENDM
*
*         SYSTEM - DEMANDE AU MONITEUR.
*         SYSTEM REQ,R,P1,P2   MOT 18/3LREQ,1/0,1/R,4/0,18/P2,18/P1
SYSTEM    MACRO  REQ,RCL,P1,P2
          LOCAL  W
.R        SET    0
          IFC    NE,$RCL$$,1
.R        SET    1
          USE    RA1.
W         VFD    18/0L_REQ,1/0,1/.R,4/0,18/P2,18/P1
          USE    *
          SA1    W
          RJ     SYS=
          AUTO   COMCSYS
          ENDM
*
*         MESSAGE ADDR,X,R - MESSAGE AU JOURNAL ET A LA CONSOLE.
MESSAGE   MACRO  ADDR,X,RCL
          LOCAL  W
.R        SET    0
          IFC    NE,$RCL$$,1
.R        SET    1
          USE    RA1.
W         VFD    18/0LMSG,1/0,1/.R,4/0,12/X,6/0,18/ADDR
          USE    *
          SA1    W
          RJ     SYS=
          AUTO   COMCSYS
          ENDM
*
ENDRUN    MACRO
          SYSTEM END
          ENDM
ABORT     MACRO
          SYSTEM ABT
          ENDM
RECALL    MACRO  STAT
          SYSTEM RCL,,STAT
          ENDM
TIME      MACRO  ADDR
          SYSTEM TIM,R,ADDR
          ENDM
CLOCK     MACRO  ADDR
          SYSTEM CLK,R,ADDR
          ENDM
DATE      MACRO  ADDR
          SYSTEM DAT,R,ADDR
          ENDM
MEMORY    MACRO  TYPE,ADDR,RCL,VAL
          SYSTEM MEM,R,ADDR
          ENDM
*
*         FILEC FWA,LEN - BLOC DE DESCRIPTION DE FICHIER (FET) DE 5 MOTS.
*         LE NOM DU FICHIER EST LE CHAMP LOCATION.
          MACRO  FILEC,LFN,FWA,LEN
LFN       VFD    42/0L_LFN,18/1
          VFD    42/0,18/FWA
          VFD    42/0,18/FWA
          VFD    42/0,18/FWA
          VFD    42/0,18/FWA+LEN
          ENDM
FILEB     OPSYN  FILEC
*
*         CIO. F,CODE,R - DEMANDE D'ENTREE-SORTIE SUR UN FICHIER.
CIO.      MACRO  F,CODE,RCL
          SX2    F
          SX7    CODE
          RJ     CIO=
          AUTO   COMCCIO
          ENDM
READ      MACRO  F,RCL
          CIO.   F,10B
          ENDM
WRITE     MACRO  F,RCL
          CIO.   F,14B
          ENDM
WRITER    MACRO  F,RCL
          CIO.   F,24B
          ENDM
WRITEF    MACRO  F,RCL
          CIO.   F,34B
          ENDM
REWIND    MACRO  F,RCL
          CIO.   F,50B
          ENDM
*
*         WRITEC F,BUF - ECRIT UNE LIGNE (MOTS TERMINES PAR UN OCTET NUL).
WRITEC    MACRO  F,BUF
          SX2    F
          SB6    BUF
          RJ     WTC=
          AUTO   COMCWTC
          ENDM
*
*         READC F,BUF,N - LIT UNE LIGNE DANS BUF (N MOTS AU PLUS).
*         SORTIE (X1) = 0 LIGNE LUE, -1 FIN D'ENREGISTREMENT OU DE FICHIER.
READC     MACRO  F,BUF,N
          SX2    F
          SB6    BUF
          SB7    N
          RJ     RDC=
          AUTO   COMCRDC
          ENDM
*
*         CONVERSIONS : CDD (DECIMAL), COD (OCTAL).
CDD       MACRO
          RJ     CDD=
          AUTO   COMCCDD
          ENDM
COD       MACRO
          RJ     COD=
          AUTO   COMCCOD
          ENDM
          END
`;

export const COMCSYS = String.raw`COMCSYS$ MICRO  1,1,*Y*
*         SYS= - DEMANDE AU MONITEUR PAR RA+1.
*
*         ENTREE (X1) = MOT DE DEMANDE.
*         ATTEND QUE RA+1 SOIT LIBRE, Y RANGE LA DEMANDE, PUIS ATTEND
*         QUE LE MONITEUR L'AIT TRAITEE (RA+1 REMIS A ZERO).
*         UTILISE X2, X6, A2, A6.
SYS=      PS                 ENTREE / SORTIE
SYS1      SA2    1
          NZ     X2,SYS1     RA+1 OCCUPE
          BX6    X1
          SA6    A2
SYS2      SA2    A2
          NZ     X2,SYS2     ATTENDRE LA FIN DE LA DEMANDE
          EQ     SYS=
`;

export const COMCCIO = String.raw`COMCCIO$ MICRO  1,1,*Y*
*         CIO= - DEMANDE D'ENTREE-SORTIE.
*
*         ENTREE (X2) = ADRESSE DU FET.
*                (X7) = CODE DE FONCTION (10B READ, 14B WRITE,
*                       24B WRITER, 34B WRITEF, 50B REWIND).
*         SORTIE MOT 0 DU FET : CODE + BIT 0 (TERMINE), 021B FIN
*                D'ENREGISTREMENT, 031B FIN DE FICHIER.
*         UTILISE X0, X1, X2, X6, X7, A1, A2, A6.
CIO=      PS                 ENTREE / SORTIE
          SA1    X2          MOT 0 DU FET
          MX0    42
          BX6    X0*X1       NOM DU FICHIER
          BX6    X6+X7       CODE DE FONCTION
          SA6    A1
          SA1    CIOA        3LCIO
          BX1    X1+X2       ADRESSE DU FET
          RJ     SYS=
          EQ     CIO=
CIOA      VFD    18/0LCIO,42/0
          IF     -MIC,COMCSYS$,1
          XTEXT  COMCSYS
`;

export const COMCWTC = String.raw`COMCWTC$ MICRO  1,1,*Y*
*         WTC= - ECRIT UNE LIGNE CODEE DANS LE TAMPON CIRCULAIRE.
*
*         ENTREE (X2) = ADRESSE DU FET.
*                (B6) = ADRESSE DE LA LIGNE (MOTS DE 10 CARACTERES,
*                       LE DERNIER SE TERMINANT PAR 12 BITS NULS).
*         LE TAMPON EST VIDE (WRITE) LORSQU'IL EST PLEIN.
*         UTILISE X0-X7, A1-A7, B3-B6.
WTC=      PS                 ENTREE / SORTIE
          BX6    X2
          SA6    WTCA        SAUVER L'ADRESSE DU FET
          MX0    48
WTC1      SA2    WTCA
          SA3    X2+2        IN
          SA4    X2+4        LIMIT
          SB3    X3
          SB4    X4
          SA1    B6          MOT SUIVANT DE LA LIGNE
          SB6    B6+1
          BX6    X1
          SA6    B3
          SB3    B3+1
          NE     B3,B4,WTC2  PAS A LA LIMITE
          SA4    X2+1        FIRST
          SB3    X4
WTC2      SX6    B3
          SA6    A3          NOUVEL IN
          SA4    X2+3        OUT
          SB5    X4
          NE     B3,B5,WTC3  TAMPON NON PLEIN
          SX7    14B         WRITE
          RJ     CIO=
          SA1    B6-1        RECHARGER LE MOT COURANT
          MX0    48
          SA2    WTCA
WTC3      BX7    -X0*X1
          NZ     X7,WTC1     PAS ENCORE LA FIN DE LIGNE
          SA2    WTCA
          EQ     WTC=
WTCA      CON    0           ADRESSE DU FET
          IF     -MIC,COMCCIO$,1
          XTEXT  COMCCIO
`;

export const COMCRDC = String.raw`COMCRDC$ MICRO  1,1,*Y*
*         RDC= - LIT UNE LIGNE CODEE DEPUIS LE TAMPON CIRCULAIRE.
*
*         ENTREE (X2) = ADRESSE DU FET.
*                (B6) = ADRESSE DE RECEPTION.
*                (B7) = NOMBRE DE MOTS MAXIMAL.
*         SORTIE (X1) = 0 SI UNE LIGNE A ETE LUE, -1 EN FIN
*                D'ENREGISTREMENT OU DE FICHIER.
*         UTILISE X0-X7, A1-A7, B3-B7.
RDC=      PS                 ENTREE / SORTIE
          BX6    X2
          SA6    RDCA
RDC1      MX0    48
          SA2    RDCA
          SA3    X2+2        IN
          SA4    X2+3        OUT
          SB3    X3
          SB4    X4
          NE     B3,B4,RDC3  DONNEES PRESENTES
          SA1    X2          ETAT DU FET
          SX5    X1          18 BITS BAS
          AX5    4
          MX6    -2
          BX5    -X6*X5      BITS 5-4 : FIN D'ENREGISTREMENT / DE FICHIER
          NZ     X5,RDC8
          SX7    10B         READ
          RJ     CIO=
          EQ     RDC1
RDC3      SA1    B4          MOT SUIVANT
          SB4    B4+1
          SA5    X2+4        LIMIT
          SB5    X5
          NE     B4,B5,RDC4
          SA5    X2+1        FIRST
          SB4    X5
RDC4      ZR     B7,RDC5     ZONE DE RECEPTION PLEINE
          BX6    X1
          SA6    B6
          SB6    B6+1
          SB7    B7-1
RDC5      SX6    B4
          SA6    A4          NOUVEL OUT
          BX7    -X0*X1
          NZ     X7,RDC1     LIGNE NON TERMINEE
          SX1    0
          EQ     RDC=
RDC8      MX0    42          REMETTRE LE CODE A 011B (LECTURE SUIVANTE)
          BX6    X0*X1
          SX7    11B
          BX6    X6+X7
          SA6    A1
          SX1    -1
          EQ     RDC=
RDCA      CON    0
          IF     -MIC,COMCCIO$,1
          XTEXT  COMCCIO
`;

export const COMCCDD = String.raw`COMCCDD$ MICRO  1,1,*Y*
*         CDD= - CONVERSION D'UN ENTIER EN DECIMAL (CODE DISPLAY).
*
*         ENTREE (X1) = ENTIER POSITIF (MOINS DE 10 CHIFFRES).
*         SORTIE (X6) = CHIFFRES CADRES A DROITE, BLANCS A GAUCHE.
*                (X4) = CHIFFRES CADRES A GAUCHE, BLANCS A DROITE.
*                (B2) = 6 * NOMBRE DE CHIFFRES.
*         UTILISE X1-X7, B2, B3, B7.
CDD=      PS                 ENTREE / SORTIE
          SA2    CDDA        10.0
          SA4    CDDB        10 BLANCS
          BX6    X4
          SB2    0
CDD1      PX3    X1          ENTIER -> FLOTTANT
          NX3    X3
          FX3    X3/X2       X / 10
          UX3    B7,X3
          LX3    B7,X3       QUOTIENT ENTIER
          BX5    X3
          LX5    3
          BX7    X3
          LX7    1
          IX5    X5+X7       10 * QUOTIENT
          IX5    X1-X5       CHIFFRE
          SX5    X5+1R0
          AX6    6
          MX7    6
          BX6    -X7*X6
          LX5    54
          BX6    X6+X5       CHIFFRE EN TETE
          SB2    B2+6
          BX1    X3
          NZ     X1,CDD1
          BX4    X6          CHIFFRES CADRES A GAUCHE
          LX6    B2,X6       CHIFFRES CADRES A DROITE
          EQ     CDD=
CDDA      DATA   10.0
CDDB      DATA   10H
CDD       EQU    CDD=
`;

export const COMCCOD = String.raw`COMCCOD$ MICRO  1,1,*Y*
*         COD= - CONVERSION D'UN MOT EN OCTAL (CODE DISPLAY).
*
*         ENTREE (X1) = VALEUR (30 BITS BAS CONVERTIS).
*         SORTIE (X6) = 10 CHIFFRES OCTAUX.
*         UTILISE X1, X2, X5, X6, X7, B2.
COD=      PS                 ENTREE / SORTIE
          SX6    0
          SB2    10
          LX1    30          30 BITS UTILES EN TETE
COD1      LX1    3
          MX7    -3
          BX5    -X7*X1
          SX5    X5+1R0
          LX6    6
          BX6    X6+X5
          SB2    B2-1
          NZ     B2,COD1
          EQ     COD=
COD       EQU    COD=
`;

/** Textes fournis par défaut à l'assembleur (XTEXT et textes système). */
export const SYSTEM_TEXTS = { SYSTEXT, CPCTEXT: SYSTEXT, COMCSYS, COMCCIO, COMCWTC, COMCRDC, COMCCDD, COMCCOD };
