// Moniteur PP (MTR) du mini-système, écrit en COMPASS PP.
// Il s'exécute dans PP0 : il démarre le travail par un échange (EXN), puis
// sert les demandes que le programme CPU dépose en RA+1.

const EXT = '00,61,62,63,64,65,66,67,70,71,41,42,43,44,45,46,47,50,51,22,23,24,25,26,27,30,31,12,01,02,03,04,05,06,07,10,11,60,40,54,21,34,74,53,13,20,33,73,36,17,32,16,14,35,52,37,55,56,72,57,15,75,76,77';
const HOL = '55,34,35,36,37,40,41,42,43,44,00,60,74,70,54,64,33,50,23,24,25,26,27,30,31,32,75,56,63,65,73,71,46,12,13,14,15,16,17,20,21,22,62,53,47,52,77,76,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,67,01,02,03,04,05,06,07,10,11,61,57,72,51,45,66'
  + ',55'.repeat(48);

/** Table de 64 ou 128 valeurs -> lignes CON de 8 valeurs. */
function table(label, csv) {
  const v = csv.split(',');
  const out = [];
  for (let k = 0; k < v.length; k += 8) {
    const items = v.slice(k, k + 8).map((x) => x + 'B').join(',');
    out.push(`${k === 0 ? label.padEnd(10) : '          '}CON    ${items}`);
  }
  return out.join('\n');
}

export const MTR = String.raw`          IDENT  MTR,100B
          PERIPH
          TITLE  MTR - MONITEUR DU MINI-SYSTEME.
*         MTR - MONITEUR PP DU MINI-SYSTEME 6600.
*
*         DEMANDES RA+1 (MOT 18/NOM,1/0,1/R,4/0,18/P2,18/P1) :
*           MSG  MESSAGE AU JOURNAL (P1 = ADRESSE DU MESSAGE)
*           END  FIN NORMALE DU TRAVAIL
*           ABT  FIN ANORMALE DU TRAVAIL
*           RCL  RAPPEL (SANS EFFET)
*           TIM  TEMPS EN MILLISECONDES -> (P1)
*           CLK  HEURE  ' HH.MM.SS.' -> (P1)
*           DAT  DATE   ' AA/MM/JJ.' -> (P1)
*           MEM  LONGUEUR DU CHAMP (30/FL,30/0) -> (P1)
*           CIO  ENTREE-SORTIE SUR LE FET (P1) :
*                OUTPUT : WRITE, WRITER, WRITEF -> IMPRIMANTE 1612
*                INPUT  : READ <- LECTEUR DE CARTES 405 (UNE CARTE)
*                         CODE 011B NORMAL, 021B FIN D'ENREGISTREMENT
*                         (CARTE 7/8/9), 031B FIN DE FICHIER.
*
*         MEMOIRE CENTRALE (ADRESSES ABSOLUES) :
 DAYP     EQU    20B         INDICE DE LA PROCHAINE LIGNE DU JOURNAL
 STAT     EQU    21B         ETAT : 1 EN COURS, 2 TERMINE, 3 ABANDON
 JRA      EQU    22B         RA DU TRAVAIL
 JFL      EQU    23B         FL DU TRAVAIL
 TIMW     EQU    24B         HEURE AFFICHABLE
 DATW     EQU    25B         DATE AFFICHABLE
 MSEC     EQU    26B         MILLISECONDES DEPUIS LE DEMARRAGE
 LIN1     EQU    30B         DERNIER MESSAGE (4 MOTS)
 CMDW     EQU    34B         COMMANDE DE LA CONSOLE (1 = DROP)
 JXP      EQU    100B        PAQUET D'ECHANGE DU TRAVAIL
 IXP      EQU    120B        PAQUET D'ECHANGE DE REPOS
 DAYF     EQU    200B        JOURNAL : 32 LIGNES DE 4 MOTS
*
*         CANAUX.
 PCH      EQU    12B         IMPRIMANTE 1612 ET LECTEUR 405
 CLK      EQU    14B         HORLOGE TEMPS REEL
*
*         CELLULES DIRECTES.
 T1       EQU    1
 T2       EQU    2
 T3       EQU    3
 T4       EQU    4
 T5       EQU    5
 W        EQU    10B         MOT LU (5 CELLULES)
 X        EQU    15B         MOT DE TRAVAIL (5 CELLULES)
 RAD      EQU    22B         RA / 100B
 AH       EQU    24B         ADRESSE RELATIVE (6 BITS HAUTS)
 AL       EQU    25B         ADRESSE RELATIVE (12 BITS BAS)
 IDX      EQU    27B         INDICE DU JOURNAL
 FH       EQU    30B         FIRST
 FL       EQU    31B
 IH       EQU    32B         IN
 IL       EQU    33B
 OH       EQU    34B         OUT
 OL       EQU    35B
 LH       EQU    36B         LIMIT
 LL       EQU    37B
 BH       EQU    40B         ADRESSE DU FET
 BL       EQU    41B
 CODE     EQU    42B         CODE DE FONCTION CIO
 NCH      EQU    43B         NOMBRE DE CARACTERES DE LA LIGNE
 LCLK     EQU    44B         DERNIERE LECTURE DE L'HORLOGE
 USEC     EQU    45B         MICROSECONDES ACCUMULEES
 STA      EQU    46B         ETAT DE LA CARTE
 CNT      EQU    47B         COMPTEUR
 SCC      EQU    50B         COMMANDE DE SAUT DE L'IMPRIMANTE
*
          ORG    100B
*
*         DEMARRAGE : LIRE RA, LANCER LE TRAVAIL PAR UN ECHANGE.
 MTR      LDN    JRA
          CRD    W
          LDD    W+3
          LPN    77B
          SHN    6
          STD    RAD
          LDD    W+4
          SHN    -6
          RAD    RAD         RA / 100B
          IAN    CLK
          STD    LCLK
          LDN    0
          STD    USEC
          LDC    JXP
          EXN                DEMARRER LE CPU
*
*         BOUCLE PRINCIPALE.
 MTR1     RJM    TIM         TENIR L'HEURE A JOUR
          LDN    STAT
          CRD    W
          LDD    W+4
          SBN    1
          NJN    MTR1        PAS DE TRAVAIL EN COURS
          LDN    CMDW        COMMANDE DE LA CONSOLE ?
          CRD    W
          LDD    W+4
          ZJN    MTR1A
          LDN    0
          STD    W+4
          LDN    CMDW
          CWD    W
          LDC    MSGDRP
          RJM    DAY         DROP : ABANDON DU TRAVAIL
          LJM    ABT1
 MTR1A    LDD    RAD         SORTIE D'ERREUR DU CPU (RA+0 NON NUL) ?
          SHN    6
          CRD    W
          LDD    W
          ZJN    MTR1B
          LPN    7           CONDITION : 1 ADRESSE, 2 INFINI, 4 INDEFINI
          STD    T1
          LDC    MSGEA
          STD    T2
          LDD    T1
          LPN    1
          NJN    MTR1C
          LDC    MSGEO
          STD    T2
          LDD    T1
          LPN    2
          NJN    MTR1C
          LDC    MSGEI
          STD    T2
 MTR1C    LDD    T2
          RJM    DAY
          LJM    ABT1
 MTR1B    RJM    RA1         LIRE RA+1
          CRD    W
          LDD    W
          ADD    W+1
          ADD    W+2
          ADD    W+3
          ADD    W+4
          NJN    MTR1D
          LJM    MTR1        PAS DE DEMANDE
 MTR1D    BSS    0
*         RECHERCHE DE LA DEMANDE DANS LA TABLE.
          LDD    W+3
          LPN    77B
          STD    AH
          LDD    W+4
          STD    AL
          LDN    0
          STD    T1
 MTR2     LDM    TREQ,T1
          ZJN    MTR4        DEMANDE INCONNUE
          LMD    W
          NJN    MTR3
          LDM    TREQ+1,T1
          LMD    W+1
          SCN    77B
          NJN    MTR3
          LDM    TREQ+2,T1
          STD    T2
          LJM    0,T2        TRAITEMENT
 MTR3     LDN    3
          RAD    T1
          UJN    MTR2
 MTR4     LDC    MSGILL
          RJM    DAY         DEMANDE ILLEGALE : ABANDON
          LJM    ABT1
*
*         FIN DE DEMANDE : RA+1 = 0.
 DONE     LDN    0
          STD    X
          STD    X+1
          STD    X+2
          STD    X+3
          STD    X+4
          RJM    RA1
          CWD    X
          LJM    MTR1
*
*         TABLE DES DEMANDES : 2 CARACTERES, 3E CARACTERE, ADRESSE.
 TREQ     CON    1523B,0700B,MSG
          CON    0516B,0400B,END
          CON    0102B,2400B,ABT
          CON    2203B,1400B,DONE
          CON    2411B,1500B,TIMR
          CON    0314B,1300B,CLKR
          CON    0401B,2400B,DATR
          CON    1505B,1500B,MEMR
          CON    0311B,1700B,CIO
          CON    0
*
*         MSG - MESSAGE AU JOURNAL.
 MSG      RJM    MSGC        COPIER LE MESSAGE DANS LE JOURNAL
          LJM    DONE
*
*         END - FIN DU TRAVAIL.
 END      LDC    MSGEND
          RJM    DAY
          LDN    2
          UJN    ABT2
*
*         ABT - ABANDON DU TRAVAIL.
 ABT      LDC    MSGABT
          RJM    DAY
 ABT1     LDN    3
 ABT2     STD    X+4
          LDN    0
          STD    X
          STD    X+1
          STD    X+2
          STD    X+3
          LDN    STAT
          CWD    X
          LDC    IXP
          EXN                ARRETER LE TRAVAIL
          LJM    MTR1
*
*         TIM, CLK, DAT - TEMPS ET DATE.
 TIMR     LDN    MSEC
          UJN    CLKR1
 CLKR     LDN    TIMW
          UJN    CLKR1
 DATR     LDN    DATW
 CLKR1    CRD    X
          RJM    ABSA
          CWD    X
          LJM    DONE
*
*         MEM - LONGUEUR DU CHAMP : 30/FL,30/0.
 MEMR     LDN    JFL
          CRD    W
          LDN    0
          STD    X
          STD    X+3
          STD    X+4
          LDD    W+3         FL (18 BITS) DANS LES BITS 47-30
          LPN    77B
          SHN    6
          STD    X+1
          LDD    W+4
          SHN    -6
          RAD    X+1
          LDD    W+4
          LPN    77B
          SHN    6
          STD    X+2
          RJM    ABSA
          CWD    X
          LJM    DONE
          TITLE  CIO - ENTREES-SORTIES.
*
*         CIO - DEMANDE D'ENTREE-SORTIE SUR UN FET.
 CIO      LDD    AH
          STD    BH
          LDD    AL
          STD    BL
          RJM    ABSA        MOT 0 DU FET
          CRD    W
          LDD    W+4
          LPC    776B
          STD    CODE
          LDD    W
          LMC    1725B       OUTPUT ?
          NJN    CIO1
          LDD    W+1
          LMC    2420B
          NJN    CIO1
          LDD    W+2
          LMC    2524B
          NJN    CIO1
          RJM    PTR         IMPRIMER
          UJN    CIO2
 CIO1     LDD    W
          LMC    1116B       INPUT ?
          NJN    CIO2
          LDD    W+1
          LMC    2025B
          NJN    CIO2
          LDD    W+2
          LMC    2400B
          NJN    CIO2
          LDD    CODE
          LMN    10B
          NJN    CIO2        SEULE LA LECTURE EST TRAITEE
          RJM    CRD         LIRE UNE CARTE
          UJN    CIO4
 CIO2     LDD    CODE        FONCTION TERMINEE : CODE + 1
          ADN    1
          STD    STA
*         FIN : CODE ET ETAT DANS LE MOT 0 DU FET.
 CIO4     LDD    BH
          STD    AH
          LDD    BL
          STD    AL
          RJM    ABSA
          CRD    W
          LDD    W+4
          LPC    7000B
          ADD    STA
          STD    W+4
          RJM    ABSA
          CWD    W
          LJM    DONE
*
*         FET - LIRE FIRST, IN, OUT, LIMIT.
 FET      SUBR
          LDN    1
          RJM    FETW
          LDD    X+3
          STD    FH
          LDD    X+4
          STD    FL
          LDN    2
          RJM    FETW
          LDD    X+3
          STD    IH
          LDD    X+4
          STD    IL
          LDN    3
          RJM    FETW
          LDD    X+3
          STD    OH
          LDD    X+4
          STD    OL
          LDN    4
          RJM    FETW
          LDD    X+3
          STD    LH
          LDD    X+4
          STD    LL
          UJN    FETX
*
*         FETW - LIRE LE MOT (A) DU FET DANS X.
 FETW     SUBR
          STD    T3
          LDD    BH
          STD    AH
          LDD    BL
          ADD    T3
          STD    AL
          SHN    -12
          RAD    AH
          LDD    AL
          LPC    7777B
          STD    AL
          RJM    ABSA
          CRD    X
          LDD    X+3
          LPN    77B
          STD    X+3
          UJN    FETWX
*
*         SETW - ECRIRE (X+3, X+4) DANS LE MOT (A) DU FET.
 SETW     SUBR
          STD    T3
          LDD    X+3
          STD    T4
          LDD    X+4
          STD    T5
          LDD    T3
          RJM    FETW
          LDD    T4
          STD    X+3
          LDD    T5
          STD    X+4
          RJM    ABSA
          CWD    X
          UJN    SETWX
          TITLE  IMPRESSION.
*
*         PTR - IMPRIMER LES LIGNES DU TAMPON (DE OUT A IN).
 PTR      SUBR
          RJM    FET
 PTR1     LDD    OH          OUT = IN ?
          LMD    IH
          NJN    PTR2
          LDD    OL
          LMD    IL
          NJN    PTR2
          LDD    IH          OUT = IN : TERMINE
          STD    X+3
          LDD    IL
          STD    X+4
          LDN    3
          RJM    SETW
          LJM    PTRX
 PTR2     LDN    0
          STD    NCH
 PTR3     LDD    OH          LIRE LE MOT EN OUT
          STD    AH
          LDD    OL
          STD    AL
          RJM    ABSA
          CRD    W
          AOD    OL          OUT = OUT + 1
          SHN    -12
          ZJN    PTR4
          AOD    OH
          LDN    0
          STD    OL
 PTR4     LDD    OH          OUT = LIMIT ?
          LMD    LH
          NJN    PTR5
          LDD    OL
          LMD    LL
          NJN    PTR5
          LDD    FH
          STD    OH
          LDD    FL
          STD    OL
 PTR5     LDN    W           RANGER LES 10 CARACTERES DU MOT
          STD    T1
          LDN    5
          STD    T2
 PTR6     LDI    T1
          SHN    -6
          RJM    PUT
          LDI    T1
          LPN    77B
          RJM    PUT
          AOD    T1
          SOD    T2
          NJN    PTR6
          LDD    W+4
          ZJN    PTR7        FIN DE LIGNE
          LJM    PTR3
 PTR7     RJM    PRT         IMPRIMER LA LIGNE
          LJM    PTR1
*
*         PUT - AJOUTER LE CARACTERE (A) A LA LIGNE.
 PUT      SUBR
          STD    T3
          LDD    NCH
          ADC    -210B
          PJN    PUTX        LIGNE PLEINE (136 CARACTERES)
          LDD    T3
          STM    LINE,NCH
          AOD    NCH
          UJN    PUTX
*
*         PRT - IMPRIMER LA LIGNE (LE 1ER CARACTERE EST LE CONTROLE).
 PRT      SUBR
 PRT1     LDD    NCH         SUPPRIMER LES 00 ET BLANCS DE FIN
          ZJN    PRT2
          LDM    LINE-1,NCH
          ZJN    PRT1A
          LMN    55B
          NJN    PRT2
 PRT1A    SOD    NCH
          UJN    PRT1
 PRT2     LDC    601B        SAUT SIMPLE
          STD    SCC
          LDD    NCH
          ZJN    PRT5        LIGNE VIDE
          LDM    LINE
          LMN    34B         '1' : NOUVELLE PAGE
          NJN    PRT3
          FNC    604B,PCH
          UJN    PRT4
 PRT3     LDM    LINE
          LMN    33B         '0' : DOUBLE INTERLIGNE
          NJN    PRT4
          LDC    602B
          STD    SCC
 PRT4     LDN    1           CONVERTIR EN BCD EXTERNE
          STD    T1
 PRT4A    LDD    T1
          SBD    NCH
          PJN    PRT5
          LDM    LINE,T1
          STD    T2
          LDM    EXT,T2
          STM    LINE-1,T1
          AOD    T1
          UJN    PRT4A
 PRT5     FNC    600B,PCH    SELECTION DE L'IMPRIMANTE
          ACN    PCH
          LDD    NCH
          ZJN    PRT6
          SBN    1
          ZJN    PRT6
          OAM    LINE,PCH
 PRT6     DCN    PCH
          FNC    605B,PCH    IMPRIMER
          LDD    SCC
          FAN    PCH         AVANCE DU PAPIER
          LJM    PRTX
          TITLE  LECTURE DE CARTES.
*
*         CRD - LIRE UNE CARTE DANS LE TAMPON DU FET.
 CRD      SUBR
          RJM    FET
          FNC    702B,PCH    LECTURE
          ACN    PCH
          LDC    120B        80 COLONNES
          IAM    CARD,PCH
          STD    T1          COLONNES NON LUES
          LMC    120B
          NJN    CRD1
          LDN    31B         PAS DE CARTE : FIN DE FICHIER
          STD    STA
          LJM    CRDX
 CRD1     LDM    CARD        CARTE DE CONTROLE ?
          LMN    7           7/8/9 : FIN D'ENREGISTREMENT
          NJN    CRD2
          LDN    21B
          STD    STA
          LJM    CRDX
 CRD2     LDM    CARD
          LMN    17B         6/7/8/9 : FIN DE FICHIER
          NJN    CRD3
          LDN    31B
          STD    STA
          LJM    CRDX
*         DECODAGE HOLLERITH -> CODE DISPLAY.
 CRD3     LDN    0
          STD    T1
 CRD4     LDM    CARD,T1
          RJM    HOL
          STM    LINE,T1
          AOD    T1
          SBN    77B
          SBN    21B
          MJN    CRD4
          LDC    120B        SUPPRIMER LES BLANCS DE FIN
          STD    NCH
 CRD5     LDD    NCH
          ZJN    CRD6
          LDM    LINE-1,NCH
          LMN    55B
          NJN    CRD6
          SOD    NCH
          UJN    CRD5
*         RANGER LA LIGNE EN IN (10 CARACTERES PAR MOT).
 CRD6     LDN    0
          STD    T1          INDICE DE CARACTERE
 CRD7     LDN    0
          STD    T2          INDICE DE CELLULE
 CRD8     LDD    T1          PAIRE DE CARACTERES
          SBD    NCH
          MJN    CRD9
          LDN    0           AU-DELA DE LA LIGNE : ZERO
          UJN    CRD10
 CRD9     LDM    LINE,T1
          SHN    6
          STD    T3
          AOD    T1
          SBD    NCH
          PJN    CRD9A
          LDM    LINE,T1
          RAD    T3
 CRD9A    LDD    T3
 CRD10    STM    W,T2
          AOD    T1
          AOD    T2
          LMN    5
          NJN    CRD8
          LDD    IH          ECRIRE LE MOT EN IN
          STD    AH
          LDD    IL
          STD    AL
          RJM    ABSA
          CWD    W
          AOD    IL
          SHN    -12
          ZJN    CRD11
          AOD    IH
          LDN    0
          STD    IL
 CRD11    LDD    IH          IN = LIMIT ?
          LMD    LH
          NJN    CRD12
          LDD    IL
          LMD    LL
          NJN    CRD12
          LDD    FH
          STD    IH
          LDD    FL
          STD    IL
 CRD12    LDD    W+4         FIN DE LIGNE (12 BITS NULS) ?
          ZJN    CRD13
          LJM    CRD7
 CRD13    LDD    IH          NOUVEL IN
          STD    X+3
          LDD    IL
          STD    X+4
          LDN    2
          RJM    SETW
          LDN    11B
          STD    STA
          LJM    CRDX
*
*         HOL - CONVERTIR LA COLONNE (A) EN CODE DISPLAY.
 HOL      SUBR
          STD    T4
          SHN    -9          ZONE (LIGNES 12, 11, 0)
          SHN    4
          STD    T5
          LDD    T4
          LPC    777B        LIGNES 1 A 9
          ZJN    HOL3
          STD    T4
          LPN    2           LIGNE 8 ?
          ZJN    HOL1
          LDD    T4
          LMN    2
          ZJN    HOL1        8 SEUL
          STD    T4          8 + AUTRE LIGNE (2 A 7)
          LDN    10B
          RAD    T5
 HOL1     LDC    400B        RECHERCHER LA LIGNE PERFOREE
          STD    T3
          LDN    1
          STD    CNT
 HOL2     LDD    T3
          LMD    T4
          ZJN    HOL2A
          LDD    T3
          SHN    -1
          STD    T3
          AOD    CNT
          SBN    12B
          MJN    HOL2
          LDN    55B         COMBINAISON INCONNUE : BLANC
          LJM    HOLX
 HOL2A    LDD    CNT
          RAD    T5
 HOL3     LDM    HOLT,T5
          LJM    HOLX
          TITLE  SOUS-PROGRAMMES.
*
*         ABSA - ADRESSE ABSOLUE (A) = RA + (AH,AL).
 ABSA     SUBR
          LDD    AH
          SHN    6
          ADD    RAD
          SHN    6
          ADD    AL
          UJN    ABSAX
*
*         RA1 - ADRESSE ABSOLUE DE RA+1.
 RA1      SUBR
          LDD    RAD
          SHN    6
          ADN    1
          UJN    RA1X
*
*         MSGC - COPIER LE MESSAGE (AH,AL) DANS LE JOURNAL.
 MSGC     SUBR
          RJM    LIDX        ADRESSE DE LA LIGNE DU JOURNAL -> T5
          LDN    0
          STD    CNT
          STD    T4          FIN DU MESSAGE ATTEINTE
 MSGC1    LDD    T4
          ZJN    MSGC2
          LDN    0           APRES LA FIN : MOTS NULS
          STD    X
          STD    X+1
          STD    X+2
          STD    X+3
          STD    X+4
          UJN    MSGC3
 MSGC2    RJM    ABSA
          ADD    CNT
          CRD    X
          LDD    X+4
          NJN    MSGC3
          AOD    T4
 MSGC3    LDD    T5
          ADD    CNT
          CWD    X
          LDN    LIN1
          ADD    CNT
          CWD    X
          AOD    CNT
          LMN    4
          NJN    MSGC1
          LJM    MSGCX
*
*         DAY - MESSAGE SYSTEME (A = ADRESSE PP DE 4 MOTS) AU JOURNAL.
 DAY      SUBR
          STD    T1          ADRESSE PP DU MESSAGE (20 MOTS PP)
          RJM    LIDX
          LDN    0
          STD    CNT
 DAY1     LDN    5
          STD    T2
          LDN    X
          STD    T3
 DAY2     LDI    T1
          STI    T3
          AOD    T1
          AOD    T3
          SOD    T2
          NJN    DAY2
          LDD    T5
          ADD    CNT
          CWD    X
          LDN    LIN1
          ADD    CNT
          CWD    X
          AOD    CNT
          LMN    4
          NJN    DAY1
          UJN    DAYX
*
*         LIDX - RESERVER UNE LIGNE DU JOURNAL : (T5) = ADRESSE.
 LIDX     SUBR
          LDN    DAYP
          CRD    W
          LDD    W+4
          LPN    37B
          STD    IDX
          SHN    2
          ADC    DAYF
          STD    T5
          AOD    IDX
          LPN    37B
          STD    W+4
          LDN    DAYP
          CWD    W
          UJN    LIDXX
*
*         TIM - COMPTER LES MILLISECONDES (HORLOGE DU CANAL 14B).
 TIM      SUBR
          IAN    CLK
          STD    T1
          SBD    LCLK
          PJN    TIM1
          ADC    10000B      L'HORLOGE A FAIT LE TOUR
 TIM1     RAD    USEC
          LDD    T1
          STD    LCLK
 TIM2     LDD    USEC
          ADC    -1750B      1000 MICROSECONDES
          MJN    TIMX
          STD    USEC
          LDN    MSEC
          CRD    X
          AOD    X+4
          SHN    -12
          ZJN    TIM3
          AOD    X+3
 TIM3     LDN    MSEC
          CWD    X
          UJN    TIM2
*
*         MESSAGES SYSTEME (4 MOTS CHACUN, 10 CARACTERES PAR MOT).
 MSGEND   DIS    20, FIN NORMALE DU TRAVAIL.
 MSGABT   DIS    20, FIN ANORMALE DU TRAVAIL.
 MSGILL   DIS    20, DEMANDE RA+1 ILLEGALE.
 MSGDRP   DIS    20, TRAVAIL ABANDONNE PAR L'OPERATEUR.
 MSGEA    DIS    20, ERREUR CPU : ADRESSE HORS LIMITES.
 MSGEO    DIS    20, ERREUR CPU : OPERANDE INFINI.
 MSGEI    DIS    20, ERREUR CPU : OPERANDE INDEFINI.
*
*         TABLES DE CONVERSION.
${table('EXT', EXT)}
${table('HOLT', HOL)}
 CARD     BSS    120B        IMAGE DE LA CARTE
 LINE     BSS    210B        LIGNE A IMPRIMER / LIGNE LUE
          END    MTR
`;
