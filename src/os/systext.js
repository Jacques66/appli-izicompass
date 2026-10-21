// CPU system text (equivalent of the NOS SYSTEXT/CPCTEXT) and common decks.
// These COMPASS sources are assembled by this assembler: SYSTEXT is loaded
// at the start of every CPU assembly; the decks are included by XTEXT (or
// automatically by the macros, through remote code assembled at END).

export const SYSTEXT = String.raw`          IDENT  SYSTEXT
          STEXT
*         CPU SYSTEM TEXT: MONITOR REQUESTS (RA+1), FILES (FET)
*         AND INPUT/OUTPUT, IN THE STYLE OF NOS.
*
*         AUTO - AUTOMATIC INCLUSION OF A COMMON DECK.
*         THE DECK IS ASSEMBLED AT *END*, UNLESS THE PROGRAM HAS
*         ALREADY INCLUDED IT (MICRO DECK$ DEFINED BY THE DECK).
AUTO      MACRO  DECK
          IF     -MIC,DECK,5
DECK      MICRO  1,1,*Y*
          RMT
          IF     -MIC,DECK$,1
          XTEXT  DECK
          RMT
          ENDM
*
*         SUBR - ENTRY AND EXIT POINT OF A SUBROUTINE.
*         CPU: NAME = WORD STORED BY *RJ NAME*, RETURN BY *EQ NAMEX*.
*         PP:  NAME = WORD STORED BY *RJM NAME*, RETURN BY *UJN NAMEX*.
          MACRO  SUBR,NAME
          IFPP   2
 NAME_X   LJM    *
 NAME     EQU    *-1
          IFCP   2
 NAME_X   EQ     *+400000B
 NAME     EQU    NAME_X
          ENDM
*
*         SYSCOM - JOB COMMUNICATION AREA (RA+0 TO RA+77B).
          MACRO  SYSCOM,LOC,REG
          IFC    EQ,$REG$B1$,1
          B1=1
 ARGR     EQU    2           CONTROL CARD ARGUMENTS
 PGNR     EQU    64B         PROGRAM NAME
 CCDR     EQU    70B         CONTROL CARD IMAGE
          ENDM
*
*         SYSTEM - MONITOR REQUEST.
*         SYSTEM REQ,R,P1,P2   WORD 18/3LREQ,1/0,1/R,4/0,18/P2,18/P1
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
*         MESSAGE ADDR,X,R - MESSAGE TO THE DAYFILE AND THE CONSOLE.
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
*         FILEC FWA,LEN - 5-WORD FILE ENVIRONMENT TABLE (FET).
*         THE FILE NAME IS THE LOCATION FIELD.
          MACRO  FILEC,LFN,FWA,LEN
LFN       VFD    42/0L_LFN,18/1
          VFD    42/0,18/FWA
          VFD    42/0,18/FWA
          VFD    42/0,18/FWA
          VFD    42/0,18/FWA+LEN
          ENDM
FILEB     OPSYN  FILEC
*
*         CIO. F,CODE,R - INPUT/OUTPUT REQUEST ON A FILE.
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
*         WRITEC F,BUF - WRITE ONE LINE (WORDS ENDED BY A ZERO BYTE).
WRITEC    MACRO  F,BUF
          SX2    F
          SB6    BUF
          RJ     WTC=
          AUTO   COMCWTC
          ENDM
*
*         READC F,BUF,N - READ ONE LINE INTO BUF (N WORDS AT MOST).
*         EXIT (X1) = 0 LINE READ, -1 END OF RECORD OR END OF FILE.
READC     MACRO  F,BUF,N
          SX2    F
          SB6    BUF
          SB7    N
          RJ     RDC=
          AUTO   COMCRDC
          ENDM
*
*         CONVERSIONS: CDD (DECIMAL), COD (OCTAL).
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
*         SYS= - MONITOR REQUEST THROUGH RA+1.
*
*         ENTRY (X1) = REQUEST WORD.
*         WAITS UNTIL RA+1 IS FREE, STORES THE REQUEST THERE, THEN
*         WAITS UNTIL THE MONITOR HAS PROCESSED IT (RA+1 CLEARED).
*         USES X2, X6, A2, A6.
SYS=      PS                 ENTRY / EXIT
SYS1      SA2    1
          NZ     X2,SYS1     RA+1 BUSY
          BX6    X1
          SA6    A2
SYS2      SA2    A2
          NZ     X2,SYS2     WAIT FOR REQUEST COMPLETION
          EQ     SYS=
`;

export const COMCCIO = String.raw`COMCCIO$ MICRO  1,1,*Y*
*         CIO= - INPUT/OUTPUT REQUEST.
*
*         ENTRY  (X2) = FET ADDRESS.
*                (X7) = FUNCTION CODE (10B READ, 14B WRITE,
*                       24B WRITER, 34B WRITEF, 50B REWIND).
*         EXIT   FET WORD 0: CODE + BIT 0 (COMPLETE), 021B END
*                OF RECORD, 031B END OF FILE.
*         USES X0, X1, X2, X6, X7, A1, A2, A6.
CIO=      PS                 ENTRY / EXIT
          SA1    X2          FET WORD 0
          MX0    42
          BX6    X0*X1       FILE NAME
          BX6    X6+X7       FUNCTION CODE
          SA6    A1
          SA1    CIOA        3LCIO
          BX1    X1+X2       FET ADDRESS
          RJ     SYS=
          EQ     CIO=
CIOA      VFD    18/0LCIO,42/0
          IF     -MIC,COMCSYS$,1
          XTEXT  COMCSYS
`;

export const COMCWTC = String.raw`COMCWTC$ MICRO  1,1,*Y*
*         WTC= - WRITE ONE CODED LINE INTO THE CIRCULAR BUFFER.
*
*         ENTRY  (X2) = FET ADDRESS.
*                (B6) = LINE ADDRESS (10-CHARACTER WORDS, THE LAST
*                       ONE ENDING WITH 12 ZERO BITS).
*         THE BUFFER IS FLUSHED (WRITE) WHEN IT IS FULL.
*         USES X0-X7, A1-A7, B3-B6.
WTC=      PS                 ENTRY / EXIT
          BX6    X2
          SA6    WTCA        SAVE THE FET ADDRESS
          MX0    48
WTC1      SA2    WTCA
          SA3    X2+2        IN
          SA4    X2+4        LIMIT
          SB3    X3
          SB4    X4
          SA1    B6          NEXT WORD OF THE LINE
          SB6    B6+1
          BX6    X1
          SA6    B3
          SB3    B3+1
          NE     B3,B4,WTC2  NOT AT LIMIT
          SA4    X2+1        FIRST
          SB3    X4
WTC2      SX6    B3
          SA6    A3          NEW IN
          SA4    X2+3        OUT
          SB5    X4
          NE     B3,B5,WTC3  BUFFER NOT FULL
          SX7    14B         WRITE
          RJ     CIO=
          SA1    B6-1        RELOAD THE CURRENT WORD
          MX0    48
          SA2    WTCA
WTC3      BX7    -X0*X1
          NZ     X7,WTC1     NOT YET THE END OF LINE
          SA2    WTCA
          EQ     WTC=
WTCA      CON    0           FET ADDRESS
          IF     -MIC,COMCCIO$,1
          XTEXT  COMCCIO
`;

export const COMCRDC = String.raw`COMCRDC$ MICRO  1,1,*Y*
*         RDC= - READ ONE CODED LINE FROM THE CIRCULAR BUFFER.
*
*         ENTRY  (X2) = FET ADDRESS.
*                (B6) = RECEIVING ADDRESS.
*                (B7) = MAXIMUM NUMBER OF WORDS.
*         EXIT   (X1) = 0 IF A LINE WAS READ, -1 AT END OF RECORD
*                OR END OF FILE.
*         USES X0-X7, A1-A7, B3-B7.
RDC=      PS                 ENTRY / EXIT
          BX6    X2
          SA6    RDCA
RDC1      MX0    48
          SA2    RDCA
          SA3    X2+2        IN
          SA4    X2+3        OUT
          SB3    X3
          SB4    X4
          NE     B3,B4,RDC3  DATA PRESENT
          SA1    X2          FET STATUS
          SX5    X1          LOW 18 BITS
          AX5    4
          MX6    -2
          BX5    -X6*X5      BITS 5-4: END OF RECORD / END OF FILE
          NZ     X5,RDC8
          SX7    10B         READ
          RJ     CIO=
          EQ     RDC1
RDC3      SA1    B4          NEXT WORD
          SB4    B4+1
          SA5    X2+4        LIMIT
          SB5    X5
          NE     B4,B5,RDC4
          SA5    X2+1        FIRST
          SB4    X5
RDC4      ZR     B7,RDC5     RECEIVING AREA FULL
          BX6    X1
          SA6    B6
          SB6    B6+1
          SB7    B7-1
RDC5      SX6    B4
          SA6    A4          NEW OUT
          BX7    -X0*X1
          NZ     X7,RDC1     LINE NOT COMPLETE
          SX1    0
          EQ     RDC=
RDC8      MX0    42          RESET THE CODE TO 011B (NEXT READ)
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
*         CDD= - CONVERT AN INTEGER TO DECIMAL (DISPLAY CODE).
*
*         ENTRY  (X1) = POSITIVE INTEGER (FEWER THAN 10 DIGITS).
*         EXIT   (X6) = DIGITS RIGHT-JUSTIFIED, BLANK-FILLED ON LEFT.
*                (X4) = DIGITS LEFT-JUSTIFIED, BLANK-FILLED ON RIGHT.
*                (B2) = 6 * NUMBER OF DIGITS.
*         USES X1-X7, B2, B3, B7.
CDD=      PS                 ENTRY / EXIT
          SA2    CDDA        10.0
          SA4    CDDB        10 BLANKS
          BX6    X4
          SB2    0
CDD1      PX3    X1          INTEGER -> FLOATING POINT
          NX3    X3
          FX3    X3/X2       X / 10
          UX3    B7,X3
          LX3    B7,X3       INTEGER QUOTIENT
          BX5    X3
          LX5    3
          BX7    X3
          LX7    1
          IX5    X5+X7       10 * QUOTIENT
          IX5    X1-X5       DIGIT
          SX5    X5+1R0
          AX6    6
          MX7    6
          BX6    -X7*X6
          LX5    54
          BX6    X6+X5       DIGIT AT THE TOP
          SB2    B2+6
          BX1    X3
          NZ     X1,CDD1
          BX4    X6          DIGITS LEFT-JUSTIFIED
          LX6    B2,X6       DIGITS RIGHT-JUSTIFIED
          EQ     CDD=
CDDA      DATA   10.0
CDDB      DATA   10H
CDD       EQU    CDD=
`;

export const COMCCOD = String.raw`COMCCOD$ MICRO  1,1,*Y*
*         COD= - CONVERT A WORD TO OCTAL (DISPLAY CODE).
*
*         ENTRY  (X1) = VALUE (LOW 30 BITS CONVERTED).
*         EXIT   (X6) = 10 OCTAL DIGITS.
*         USES X1, X2, X5, X6, X7, B2.
COD=      PS                 ENTRY / EXIT
          SX6    0
          SB2    10
          LX1    30          30 USEFUL BITS AT THE TOP
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

/** Texts supplied to the assembler by default (XTEXT and system texts). */
export const SYSTEM_TEXTS = { SYSTEXT, CPCTEXT: SYSTEXT, COMCSYS, COMCCIO, COMCWTC, COMCRDC, COMCCDD, COMCCOD };
