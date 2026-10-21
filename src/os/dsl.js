// DSL: deadstart loader (PP0), in PP COMPASS, and construction of the system tape.
//
// Sequence: the deadstart panel (11 words) reads the first record of tape 0
// (this program) at 7000B and jumps to it. DSL then reads the following
// records:
//   type 1: PP program - word 1 = PP number, then the image starting at
//           address 0 (word 0 holds the start address - 1). DSL sends it
//           on the PP's channel (waiting in IAM since deadstart), then
//           disconnects the channel: the PP starts.
//   type 2: central memory - words 1-2 = address (6 + 12 bits), then
//           5 PP words per CM word.
//   type 3: PP0 program - word 1 = start address, word 2 = origin, then
//           the image; DSL stores it in place and jumps to it.

import { Tape } from '../io/devices.js';

export const DSL = String.raw`          IDENT  DSL,7000B
          PERIPH
          TITLE  DSL - DEADSTART LOADER.
 MT       EQU    13B         TAPE CHANNEL
 T1       EQU    1
 T2       EQU    2
 T3       EQU    3
 CNT      EQU    4
          ORG    7000B
 DSL      FNC    2000B,MT    SELECT UNIT 0
*         READ THE NEXT RECORD INTO BUF.
 DSL1     FNC    2020B,MT    BINARY READ
          ACN    MT
          LDC    BUFL
          IAM    BUF,MT
          STD    T1          WORDS NOT READ
          LDC    BUFL
          SBD    T1
          STD    CNT         WORDS READ
          ZJN    DSL1        EMPTY RECORD
          LDM    BUF
          LMN    1
          ZJN    PPL
          LDM    BUF
          LMN    2
          ZJN    CML
          LDM    BUF
          LMN    3
          NJN    DSL1
          LJM    STR
*
*         TYPE 1: PP PROGRAM, SENT ON THE PP CHANNEL.
 PPL      LDM    BUF+1
          STD    T2          PP NUMBER = CHANNEL
          LDN    2
          STD    T1
          SOD    CNT
          SOD    CNT         IMAGE WORDS
          LDC    7300B       OAM BUF+2,(T2): MODIFIED INSTRUCTION
          ADD    T2
          STM    PPL1
          LDC    7500B       DCN (T2)
          ADD    T2
          STM    PPL2
          LDD    CNT
 PPL1     OAM    BUF+2,0
 PPL2     DCN    0           THE PP STARTS
          LJM    DSL1
*
*         TYPE 2: CENTRAL MEMORY WORDS.
 CML      LDD    CNT
          SBN    3
          STD    T3
          LDN    0
          STD    CNT
 CML1     LDD    T3          DIVIDE BY 5: NUMBER OF CM WORDS
          SBN    5
          MJN    CML2
          STD    T3
          AOD    CNT
          UJN    CML1
 CML2     LDM    BUF+1
          SHN    12
          LMM    BUF+2
          CWM    BUF+3,CNT
          LJM    DSL1
*
*         TYPE 3: PP0 PROGRAM, STORED AT ITS ORIGIN.
 STR      LDM    BUF+1
          STM    STR3+1      START ADDRESS
          LDM    BUF+2
          STD    T2          ORIGIN
          LDN    3
          STD    T1
          SOD    CNT
          SOD    CNT
          SOD    CNT
 STR1     LDD    CNT
          ZJN    STR2
          LDM    BUF,T1
          STI    T2
          AOD    T1
          AOD    T2
          SOD    CNT
          UJN    STR1
 STR2     DCN    10B         RELEASE THE CONSOLE (PP10 STARTS IDLE)
          DCN    12B         RELEASE THE PRINTER AND THE READER
 STR3     LJM    0
*
 BUF      EQU    200B        RECORD BUFFER (200B-6777B)
 BUFL     EQU    7000B-BUF
          END    DSL
`;

/** Deadstart panel: DCN 13B, select and read tape 0 at 7000B, jump to 7000B. */
export const DEADSTART_PANEL = [0o7513, 0o7713, 0o2000, 0o7713, 0o2020, 0o7413, 0o2000, 0o1000, 0o7113, 0o7000, 0o0100, 0o7000];

/**
 * Builds a deadstart tape.
 * @param dsl assembled DSL program
 * @param pps [{ pp, prog }] PP programs (PP0 = program started last)
 * @param cm [{ addr, words: BigInt[] }] central memory areas
 */
export function buildDeadstartTape(dsl, pps, cm) {
  const recs = [];
  const ds = dsl.overlays[0];
  recs.push(Uint16Array.from(ds.words));
  for (const z of cm) {
    // records of at most 100B CM words
    for (let k = 0; k < z.words.length; k += 0o100) {
      const part = z.words.slice(k, k + 0o100);
      const a = z.addr + k;
      const w = [2, (a >> 12) & 0o7777, a & 0o7777];
      for (const cw of part) for (let n = 0; n < 5; n++) w.push(Number((cw >> BigInt(48 - 12 * n)) & 0o7777n));
      recs.push(Uint16Array.from(w));
    }
  }
  let pp0 = null;
  for (const { pp, prog } of pps) {
    const ov = prog.overlays[0];
    if (pp === 0) { pp0 = prog; continue; }
    const img = new Array(ov.origin + ov.words.length).fill(0);
    ov.words.forEach((w, k) => { img[ov.origin + k] = w; });
    img[0] = (prog.entry - 1) & 0o7777;
    recs.push(Uint16Array.from([1, pp, ...img]));
  }
  if (pp0) {
    const ov = pp0.overlays[0];
    recs.push(Uint16Array.from([3, pp0.entry, ov.origin, ...ov.words]));
  }
  recs.push(null); // file mark
  return new Tape(recs);
}
