// PP monitor (MTR) of the mini-system, written in PP COMPASS.
// It runs in PP0: it starts the job with an exchange jump (EXN), then
// services the requests that the CPU program places in RA+1.

const EXT = '00,61,62,63,64,65,66,67,70,71,41,42,43,44,45,46,47,50,51,22,23,24,25,26,27,30,31,12,01,02,03,04,05,06,07,10,11,60,40,54,21,34,74,53,13,20,33,73,36,17,32,16,14,35,52,37,55,56,72,57,15,75,76,77';
const HOL = '55,34,35,36,37,40,41,42,43,44,00,60,74,70,54,64,33,50,23,24,25,26,27,30,31,32,75,56,63,65,73,71,46,12,13,14,15,16,17,20,21,22,62,53,47,52,77,76,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,67,01,02,03,04,05,06,07,10,11,61,57,72,51,45,66'
  + ',55'.repeat(48);

/** Table of 64 or 128 values -> CON lines of 8 values. */
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
          TITLE  MTR - MINI-SYSTEM MONITOR.
*         MTR - PP MONITOR OF THE 6600 MINI-SYSTEM.
*
*         RA+1 REQUESTS (WORD 18/NAME,1/0,1/R,4/0,18/P2,18/P1):
*           MSG  MESSAGE TO THE DAYFILE (P1 = MESSAGE ADDRESS)
*           END  NORMAL END OF JOB
*           ABT  ABNORMAL END OF JOB
*           RCL  RECALL (NO EFFECT)
*           TIM  TIME IN MILLISECONDS -> (P1)
*           CLK  TIME OF DAY ' HH.MM.SS.' -> (P1)
*           DAT  DATE        ' YY/MM/DD.' -> (P1)
*           MEM  FIELD LENGTH (30/FL,30/0) -> (P1)
*           CIO  INPUT/OUTPUT ON THE FET (P1):
*                OUTPUT: WRITE, WRITER, WRITEF -> 1612 LINE PRINTER
*                INPUT:  READ <- 405 CARD READER (ONE CARD)
*                        CODE 011B NORMAL, 021B END OF RECORD
*                        (7/8/9 CARD), 031B END OF FILE.
*
*         CENTRAL MEMORY (ABSOLUTE ADDRESSES):
 DAYP     EQU    20B         INDEX OF THE NEXT DAYFILE LINE
 STAT     EQU    21B         STATUS: 1 RUNNING, 2 ENDED, 3 ABORTED
 JRA      EQU    22B         JOB RA
 JFL      EQU    23B         JOB FL
 TIMW     EQU    24B         DISPLAYABLE TIME OF DAY
 DATW     EQU    25B         DISPLAYABLE DATE
 MSEC     EQU    26B         MILLISECONDS SINCE STARTUP
 LIN1     EQU    30B         LAST MESSAGE (4 WORDS)
 CMDW     EQU    34B         CONSOLE COMMAND (1 = DROP)
 JXP      EQU    100B        JOB EXCHANGE PACKAGE
 IXP      EQU    120B        IDLE EXCHANGE PACKAGE
 DAYF     EQU    200B        DAYFILE: 32 LINES OF 4 WORDS
*
*         CHANNELS.
 PCH      EQU    12B         1612 LINE PRINTER AND 405 READER
 CLK      EQU    14B         REAL-TIME CLOCK
*
*         DIRECT CELLS.
 T1       EQU    1
 T2       EQU    2
 T3       EQU    3
 T4       EQU    4
 T5       EQU    5
 W        EQU    10B         WORD READ (5 CELLS)
 X        EQU    15B         WORK WORD (5 CELLS)
 RAD      EQU    22B         RA / 100B
 AH       EQU    24B         RELATIVE ADDRESS (HIGH 6 BITS)
 AL       EQU    25B         RELATIVE ADDRESS (LOW 12 BITS)
 IDX      EQU    27B         DAYFILE INDEX
 FH       EQU    30B         FIRST
 FL       EQU    31B
 IH       EQU    32B         IN
 IL       EQU    33B
 OH       EQU    34B         OUT
 OL       EQU    35B
 LH       EQU    36B         LIMIT
 LL       EQU    37B
 BH       EQU    40B         FET ADDRESS
 BL       EQU    41B
 CODE     EQU    42B         CIO FUNCTION CODE
 NCH      EQU    43B         NUMBER OF CHARACTERS IN THE LINE
 LCLK     EQU    44B         LAST CLOCK READING
 USEC     EQU    45B         ACCUMULATED MICROSECONDS
 STA      EQU    46B         CARD STATUS
 CNT      EQU    47B         COUNTER
 SCC      EQU    50B         PRINTER CARRIAGE CONTROL
*
          ORG    100B
*
*         STARTUP: READ RA, START THE JOB WITH AN EXCHANGE JUMP.
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
          EXN                START THE CPU
*
*         MAIN LOOP.
 MTR1     RJM    TIM         KEEP THE TIME UP TO DATE
          LDN    STAT
          CRD    W
          LDD    W+4
          SBN    1
          NJN    MTR1        NO JOB RUNNING
          LDN    CMDW        CONSOLE COMMAND?
          CRD    W
          LDD    W+4
          ZJN    MTR1A
          LDN    0
          STD    W+4
          LDN    CMDW
          CWD    W
          LDC    MSGDRP
          RJM    DAY         DROP: ABORT THE JOB
          LJM    ABT1
 MTR1A    LDD    RAD         CPU ERROR EXIT (RA+0 NONZERO)?
          SHN    6
          CRD    W
          LDD    W
          ZJN    MTR1B
          LPN    7           ERROR: 1 ADDRESS, 2 INFINITE, 4 INDEFINITE
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
 MTR1B    RJM    RA1         READ RA+1
          CRD    W
          LDD    W
          ADD    W+1
          ADD    W+2
          ADD    W+3
          ADD    W+4
          NJN    MTR1D
          LJM    MTR1        NO REQUEST
 MTR1D    BSS    0
*         LOOK UP THE REQUEST IN THE TABLE.
          LDD    W+3
          LPN    77B
          STD    AH
          LDD    W+4
          STD    AL
          LDN    0
          STD    T1
 MTR2     LDM    TREQ,T1
          ZJN    MTR4        UNKNOWN REQUEST
          LMD    W
          NJN    MTR3
          LDM    TREQ+1,T1
          LMD    W+1
          SCN    77B
          NJN    MTR3
          LDM    TREQ+2,T1
          STD    T2
          LJM    0,T2        PROCESS THE REQUEST
 MTR3     LDN    3
          RAD    T1
          UJN    MTR2
 MTR4     LDC    MSGILL
          RJM    DAY         ILLEGAL REQUEST: ABORT
          LJM    ABT1
*
*         REQUEST COMPLETE: RA+1 = 0.
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
*         REQUEST TABLE: 2 CHARACTERS, 3RD CHARACTER, ADDRESS.
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
*         MSG - MESSAGE TO THE DAYFILE.
 MSG      RJM    MSGC        COPY THE MESSAGE TO THE DAYFILE
          LJM    DONE
*
*         END - END OF JOB.
 END      LDC    MSGEND
          RJM    DAY
          LDN    2
          UJN    ABT2
*
*         ABT - ABORT THE JOB.
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
          EXN                STOP THE JOB
          LJM    MTR1
*
*         TIM, CLK, DAT - TIME AND DATE.
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
*         MEM - FIELD LENGTH: 30/FL,30/0.
 MEMR     LDN    JFL
          CRD    W
          LDN    0
          STD    X
          STD    X+3
          STD    X+4
          LDD    W+3         FL (18 BITS) IN BITS 47-30
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
          TITLE  CIO - INPUT/OUTPUT.
*
*         CIO - INPUT/OUTPUT REQUEST ON A FET.
 CIO      LDD    AH
          STD    BH
          LDD    AL
          STD    BL
          RJM    ABSA        FET WORD 0
          CRD    W
          LDD    W+4
          LPC    776B
          STD    CODE
          LDD    W
          LMC    1725B       OUTPUT?
          NJN    CIO1
          LDD    W+1
          LMC    2420B
          NJN    CIO1
          LDD    W+2
          LMC    2524B
          NJN    CIO1
          RJM    PTR         PRINT
          UJN    CIO2
 CIO1     LDD    W
          LMC    1116B       INPUT?
          NJN    CIO2
          LDD    W+1
          LMC    2025B
          NJN    CIO2
          LDD    W+2
          LMC    2400B
          NJN    CIO2
          LDD    CODE
          LMN    10B
          NJN    CIO2        ONLY READ IS PROCESSED
          RJM    CRD         READ ONE CARD
          UJN    CIO4
 CIO2     LDD    CODE        FUNCTION COMPLETE: CODE + 1
          ADN    1
          STD    STA
*         DONE: CODE AND STATUS IN FET WORD 0.
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
*         FET - READ FIRST, IN, OUT, LIMIT.
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
*         FETW - READ FET WORD (A) INTO X.
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
*         SETW - WRITE (X+3, X+4) INTO FET WORD (A).
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
          TITLE  PRINTING.
*
*         PTR - PRINT THE LINES OF THE BUFFER (FROM OUT TO IN).
 PTR      SUBR
          RJM    FET
 PTR1     LDD    OH          OUT = IN?
          LMD    IH
          NJN    PTR2
          LDD    OL
          LMD    IL
          NJN    PTR2
          LDD    IH          OUT = IN: DONE
          STD    X+3
          LDD    IL
          STD    X+4
          LDN    3
          RJM    SETW
          LJM    PTRX
 PTR2     LDN    0
          STD    NCH
 PTR3     LDD    OH          READ THE WORD AT OUT
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
 PTR4     LDD    OH          OUT = LIMIT?
          LMD    LH
          NJN    PTR5
          LDD    OL
          LMD    LL
          NJN    PTR5
          LDD    FH
          STD    OH
          LDD    FL
          STD    OL
 PTR5     LDN    W           STORE THE 10 CHARACTERS OF THE WORD
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
          ZJN    PTR7        END OF LINE
          LJM    PTR3
 PTR7     RJM    PRT         PRINT THE LINE
          LJM    PTR1
*
*         PUT - APPEND CHARACTER (A) TO THE LINE.
 PUT      SUBR
          STD    T3
          LDD    NCH
          ADC    -210B
          PJN    PUTX        LINE FULL (136 CHARACTERS)
          LDD    T3
          STM    LINE,NCH
          AOD    NCH
          UJN    PUTX
*
*         PRT - PRINT THE LINE (THE 1ST CHARACTER IS CARRIAGE CONTROL).
 PRT      SUBR
 PRT1     LDD    NCH         STRIP TRAILING 00 AND BLANKS
          ZJN    PRT2
          LDM    LINE-1,NCH
          ZJN    PRT1A
          LMN    55B
          NJN    PRT2
 PRT1A    SOD    NCH
          UJN    PRT1
 PRT2     LDC    601B        SINGLE SPACE
          STD    SCC
          LDD    NCH
          ZJN    PRT5        EMPTY LINE
          LDM    LINE
          LMN    34B         '1': NEW PAGE
          NJN    PRT3
          FNC    604B,PCH
          UJN    PRT4
 PRT3     LDM    LINE
          LMN    33B         '0': DOUBLE SPACE
          NJN    PRT4
          LDC    602B
          STD    SCC
 PRT4     LDN    1           CONVERT TO EXTERNAL BCD
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
 PRT5     FNC    600B,PCH    SELECT THE PRINTER
          ACN    PCH
          LDD    NCH
          ZJN    PRT6
          SBN    1
          ZJN    PRT6
          OAM    LINE,PCH
 PRT6     DCN    PCH
          FNC    605B,PCH    PRINT
          LDD    SCC
          FAN    PCH         PAPER ADVANCE
          LJM    PRTX
          TITLE  CARD READING.
*
*         CRD - READ ONE CARD INTO THE FET BUFFER.
 CRD      SUBR
          RJM    FET
          FNC    702B,PCH    READ
          ACN    PCH
          LDC    120B        80 COLUMNS
          IAM    CARD,PCH
          STD    T1          COLUMNS NOT READ
          LMC    120B
          NJN    CRD1
          LDN    31B         NO CARD: END OF FILE
          STD    STA
          LJM    CRDX
 CRD1     LDM    CARD        CONTROL CARD?
          LMN    7           7/8/9: END OF RECORD
          NJN    CRD2
          LDN    21B
          STD    STA
          LJM    CRDX
 CRD2     LDM    CARD
          LMN    17B         6/7/8/9: END OF FILE
          NJN    CRD3
          LDN    31B
          STD    STA
          LJM    CRDX
*         HOLLERITH -> DISPLAY CODE DECODING.
 CRD3     LDN    0
          STD    T1
 CRD4     LDM    CARD,T1
          RJM    HOL
          STM    LINE,T1
          AOD    T1
          SBN    77B
          SBN    21B
          MJN    CRD4
          LDC    120B        STRIP TRAILING BLANKS
          STD    NCH
 CRD5     LDD    NCH
          ZJN    CRD6
          LDM    LINE-1,NCH
          LMN    55B
          NJN    CRD6
          SOD    NCH
          UJN    CRD5
*         STORE THE LINE AT IN (10 CHARACTERS PER WORD).
 CRD6     LDN    0
          STD    T1          CHARACTER INDEX
 CRD7     LDN    0
          STD    T2          CELL INDEX
 CRD8     LDD    T1          CHARACTER PAIR
          SBD    NCH
          MJN    CRD9
          LDN    0           PAST THE END OF THE LINE: ZERO
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
          LDD    IH          WRITE THE WORD AT IN
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
 CRD11    LDD    IH          IN = LIMIT?
          LMD    LH
          NJN    CRD12
          LDD    IL
          LMD    LL
          NJN    CRD12
          LDD    FH
          STD    IH
          LDD    FL
          STD    IL
 CRD12    LDD    W+4         END OF LINE (12 ZERO BITS)?
          ZJN    CRD13
          LJM    CRD7
 CRD13    LDD    IH          NEW IN
          STD    X+3
          LDD    IL
          STD    X+4
          LDN    2
          RJM    SETW
          LDN    11B
          STD    STA
          LJM    CRDX
*
*         HOL - CONVERT COLUMN (A) TO DISPLAY CODE.
 HOL      SUBR
          STD    T4
          SHN    -9          ZONE (ROWS 12, 11, 0)
          SHN    4
          STD    T5
          LDD    T4
          LPC    777B        ROWS 1 TO 9
          ZJN    HOL3
          STD    T4
          LPN    2           ROW 8?
          ZJN    HOL1
          LDD    T4
          LMN    2
          ZJN    HOL1        8 ALONE
          STD    T4          8 + ANOTHER ROW (2 TO 7)
          LDN    10B
          RAD    T5
 HOL1     LDC    400B        FIND THE PUNCHED ROW
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
          LDN    55B         UNKNOWN COMBINATION: BLANK
          LJM    HOLX
 HOL2A    LDD    CNT
          RAD    T5
 HOL3     LDM    HOLT,T5
          LJM    HOLX
          TITLE  SUBROUTINES.
*
*         ABSA - ABSOLUTE ADDRESS (A) = RA + (AH,AL).
 ABSA     SUBR
          LDD    AH
          SHN    6
          ADD    RAD
          SHN    6
          ADD    AL
          UJN    ABSAX
*
*         RA1 - ABSOLUTE ADDRESS OF RA+1.
 RA1      SUBR
          LDD    RAD
          SHN    6
          ADN    1
          UJN    RA1X
*
*         MSGC - COPY THE MESSAGE (AH,AL) TO THE DAYFILE.
 MSGC     SUBR
          RJM    LIDX        DAYFILE LINE ADDRESS -> T5
          LDN    0
          STD    CNT
          STD    T4          END OF MESSAGE REACHED
 MSGC1    LDD    T4
          ZJN    MSGC2
          LDN    0           AFTER THE END: ZERO WORDS
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
*         DAY - SYSTEM MESSAGE (A = PP ADDRESS, 4 WORDS) TO THE DAYFILE.
 DAY      SUBR
          STD    T1          PP ADDRESS OF THE MESSAGE (20 PP WORDS)
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
*         LIDX - RESERVE A DAYFILE LINE: (T5) = ADDRESS.
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
*         TIM - COUNT MILLISECONDS (CHANNEL 14B CLOCK).
 TIM      SUBR
          IAN    CLK
          STD    T1
          SBD    LCLK
          PJN    TIM1
          ADC    10000B      THE CLOCK WRAPPED AROUND
 TIM1     RAD    USEC
          LDD    T1
          STD    LCLK
 TIM2     LDD    USEC
          ADC    -1750B      1000 MICROSECONDS
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
*         SYSTEM MESSAGES (4 WORDS EACH, 10 CHARACTERS PER WORD).
 MSGEND   DIS    20, NORMAL END OF JOB.
 MSGABT   DIS    20, ABNORMAL END OF JOB.
 MSGILL   DIS    20, ILLEGAL RA+1 REQUEST.
 MSGDRP   DIS    20, JOB DROPPED BY OPERATOR.
 MSGEA    DIS    20, CPU ERROR: ADDRESS OUT OF RANGE.
 MSGEO    DIS    20, CPU ERROR: INFINITE OPERAND.
 MSGEI    DIS    20, CPU ERROR: INDEFINITE OPERAND.
*
*         CONVERSION TABLES.
${table('EXT', EXT)}
${table('HOLT', HOL)}
 CARD     BSS    120B        CARD IMAGE
 LINE     BSS    210B        LINE TO PRINT / LINE READ
          END    MTR
`;
