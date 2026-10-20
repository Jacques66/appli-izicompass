// DSL : chargeur de deadstart (PP0), en COMPASS PP, et construction de la bande système.
//
// Séquence : le panneau de deadstart (11 mots) lit le premier enregistrement
// de la bande 0 (ce programme) en 7000B et y saute. DSL lit ensuite les
// enregistrements suivants :
//   type 1 : programme PP — mot 1 = numéro du PP, puis l'image à partir de
//            l'adresse 0 (le mot 0 vaut adresse de lancement - 1). DSL l'envoie
//            sur le canal du PP (en attente d'IAM depuis le deadstart), puis
//            déconnecte le canal : le PP démarre.
//   type 2 : mémoire centrale — mots 1-2 = adresse (6 + 12 bits), puis
//            5 mots PP par mot CM.
//   type 3 : programme de PP0 — mot 1 = adresse de lancement, mot 2 =
//            origine, puis l'image ; DSL la range en place et y saute.

import { Tape } from '../io/devices.js';

export const DSL = String.raw`          IDENT  DSL,7000B
          PERIPH
          TITLE  DSL - CHARGEUR DE DEADSTART.
 MT       EQU    13B         CANAL DES BANDES
 T1       EQU    1
 T2       EQU    2
 T3       EQU    3
 CNT      EQU    4
          ORG    7000B
 DSL      FNC    2000B,MT    SELECTION DE L'UNITE 0
*         LECTURE DE L'ENREGISTREMENT SUIVANT DANS BUF.
 DSL1     FNC    2020B,MT    LECTURE BINAIRE
          ACN    MT
          LDC    BUFL
          IAM    BUF,MT
          STD    T1          MOTS NON LUS
          LDC    BUFL
          SBD    T1
          STD    CNT         MOTS LUS
          ZJN    DSL1        ENREGISTREMENT VIDE
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
*         TYPE 1 : PROGRAMME PP, ENVOYE SUR LE CANAL DU PP.
 PPL      LDM    BUF+1
          STD    T2          NUMERO DU PP = CANAL
          LDN    2
          STD    T1
          SOD    CNT
          SOD    CNT         MOTS DE L'IMAGE
          LDC    7300B       OAM BUF+2,(T2) : INSTRUCTION MODIFIEE
          ADD    T2
          STM    PPL1
          LDC    7500B       DCN (T2)
          ADD    T2
          STM    PPL2
          LDD    CNT
 PPL1     OAM    BUF+2,0
 PPL2     DCN    0           LE PP DEMARRE
          LJM    DSL1
*
*         TYPE 2 : MOTS DE MEMOIRE CENTRALE.
 CML      LDD    CNT
          SBN    3
          STD    T3
          LDN    0
          STD    CNT
 CML1     LDD    T3          DIVISER PAR 5 : NOMBRE DE MOTS CM
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
*         TYPE 3 : PROGRAMME DE PP0, RANGE A SON ORIGINE.
 STR      LDM    BUF+1
          STM    STR3+1      ADRESSE DE LANCEMENT
          LDM    BUF+2
          STD    T2          ORIGINE
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
 STR2     DCN    10B         LIBERER LA CONSOLE (PP10 DEMARRE A VIDE)
          DCN    12B         LIBERER L'IMPRIMANTE ET LE LECTEUR
 STR3     LJM    0
*
 BUF      EQU    200B        TAMPON D'ENREGISTREMENT (200B-6777B)
 BUFL     EQU    7000B-BUF
          END    DSL
`;

/** Panneau de deadstart : DCN 13B, sélection et lecture de la bande 0 en 7000B, saut en 7000B. */
export const DEADSTART_PANEL = [0o7513, 0o7713, 0o2000, 0o7713, 0o2020, 0o7413, 0o2000, 0o1000, 0o7113, 0o7000, 0o0100, 0o7000];

/**
 * Construit une bande de deadstart.
 * @param dsl programme DSL assemblé
 * @param pps [{ pp, prog }] programmes PP (PP0 = programme lancé en dernier)
 * @param cm [{ addr, words: BigInt[] }] zones de mémoire centrale
 */
export function buildDeadstartTape(dsl, pps, cm) {
  const recs = [];
  const ds = dsl.overlays[0];
  recs.push(Uint16Array.from(ds.words));
  for (const z of cm) {
    // enregistrements de 100B mots CM au plus
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
  recs.push(null); // marque de fichier
  return new Tape(recs);
}
