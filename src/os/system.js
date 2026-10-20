// Mini-système d'exploitation : mise en place d'un travail et des PP système.
//
// Carte mémoire centrale (absolue) :
//   20B  indice du journal      21B  état du travail (1 en cours, 2 fin, 3 abandon)
//   22B  RA du travail          23B  FL du travail
//   24B  heure ' HH.MM.SS.'     25B  date ' AA/MM/JJ.'
//   26B  millisecondes          27B  nom du travail
//   30B-33B dernier message     100B paquet d'échange du travail
//   120B paquet d'échange de repos (P = 0, RA = 140B : instruction PS)
//   200B-377B journal (32 lignes de 4 mots)
//   2000B  RA du travail (programme à RA+100B, comme sous NOS)

import { assemble } from '../asm/compass.js';
import { linkAndLoad, loadPP } from '../loader/loader.js';
import { displayToWord, wordToDisplay } from '../common/charset.js';
import { MTR } from './mtr.js';
import { DSD } from './dsd.js';
import { DSL, DEADSTART_PANEL, buildDeadstartTape } from './dsl.js';

export const CM = {
  DAYP: 0o20, STAT: 0o21, JRA: 0o22, JFL: 0o23, TIMW: 0o24, DATW: 0o25, MSEC: 0o26, JNAM: 0o27,
  LIN1: 0o30, JXP: 0o100, IXP: 0o120, IDLE: 0o140, DAYF: 0o200, RA: 0o2000,
};

let cache = null;

/** Programmes PP du système (assemblés une fois). */
export function systemPrograms() {
  if (cache) return cache;
  const mtr = assemble(MTR, { fileName: 'MTR' });
  const dsd = assemble(DSD, { fileName: 'DSD' });
  const dsl = assemble(DSL, { fileName: 'DSL' });
  cache = { mtr, dsd, dsl };
  return cache;
}

function pkg(machine, addr, { P = 0, RA = 0, FL = 0, EM = 0, MA = 0 }) {
  const w = new Array(16).fill(0n);
  w[0] = BigInt(P) << 36n;
  w[1] = BigInt(RA) << 36n;
  w[2] = BigInt(FL) << 36n;
  w[3] = BigInt(EM) << 36n;
  w[6] = BigInt(MA) << 36n;
  for (let i = 0; i < 16; i++) machine.writeCM(addr + i, w[i]);
}

/**
 * Lance un travail sous le mini-système.
 * @param programs programmes CPU assemblés (absolus ou relogeables)
 * @param options { name, ra, em, date }
 * @returns { ok, errors, entry, fl, map }
 */
export function startJob(machine, programs, options = {}) {
  const sys = systemPrograms();
  const st = prepareJob(machine, programs, options);
  if (!st.ok) return st;
  // PP : MTR dans PP0, DSD dans PP1 (console), les autres arrêtés
  for (let n = 0; n < machine.pps.length; n++) machine.stopPP(n);
  const mtr = sys.mtr.programs[0];
  loadPP(machine, mtr, 0);
  machine.startPP(0, mtr.entry);
  const dsd = sys.dsd.programs[0];
  loadPP(machine, dsd, 1);
  machine.startPP(1, dsd.entry);
  return st;
}

/**
 * Lance un travail par un vrai deadstart : la bande 0 reçoit le chargeur DSL,
 * la mémoire centrale préparée, DSD (PP1) et MTR (PP0) ; le panneau lit DSL.
 */
export function deadstartJob(machine, programs, options = {}) {
  const sys = systemPrograms();
  const scratch = new machine.constructor({ ...machine.config, ecsWords: 0 });
  const st = prepareJob(scratch, programs, options);
  if (!st.ok) return st;
  const zones = [];
  let cur = null;
  const end = Math.min(scratch.cmSize, st.ra + st.fl);
  for (let a = 0; a < end; a++) {
    const w = scratch.cm[a];
    if (w !== 0n || (cur && a - (cur.addr + cur.words.length) < 4)) {
      if (!cur || a !== cur.addr + cur.words.length) {
        if (cur && a - (cur.addr + cur.words.length) < 4) while (cur.addr + cur.words.length < a) cur.words.push(0n);
        else { cur = { addr: a, words: [] }; zones.push(cur); }
      }
      cur.words.push(w);
    }
  }
  const tape = buildDeadstartTape(sys.dsl.programs[0], [
    { pp: 1, prog: sys.dsd.programs[0] },
    { pp: 0, prog: sys.mtr.programs[0] },
  ], zones);
  machine.tapes.mount(0, tape);
  for (let a = 0; a < end; a++) machine.writeCM(a, 0n);
  machine.deadstart(DEADSTART_PANEL);
  return { ...st, tape };
}

/** Prépare la mémoire centrale d'un travail (programme, paquets d'échange, constantes). */
export function prepareJob(machine, programs, { name = 'JOB', ra = CM.RA, em = 0o070000, date = new Date() } = {}) {
  const sys = systemPrograms();
  const errs = [...sys.mtr.errors, ...sys.dsd.errors, ...sys.dsl.errors].filter((e) => e.fatal);
  if (errs.length) return { ok: false, errors: errs.map((e) => `système : ligne ${e.line} ${e.flag} ${e.message}`) };
  machine.cpu.reset();
  for (let a = 0; a < 0o400; a++) machine.writeCM(a, 0n);
  const ld = linkAndLoad(machine, programs, { ra });
  if (ld.errors.length) return { ok: false, errors: ld.errors };
  const fl = Math.min(ld.fl + 0o1000, machine.cmSize - ra);
  const p2 = (n) => String(n).padStart(2, '0');
  machine.writeCM(CM.STAT, 1n);
  machine.writeCM(CM.JRA, BigInt(ra));
  machine.writeCM(CM.JFL, BigInt(fl));
  machine.writeCM(CM.TIMW, displayToWord(` ${p2(date.getHours())}.${p2(date.getMinutes())}.${p2(date.getSeconds())}.`));
  machine.writeCM(CM.DATW, displayToWord(` ${p2(date.getFullYear() % 100)}/${p2(date.getMonth() + 1)}/${p2(date.getDate())}.`));
  machine.writeCM(CM.JNAM, displayToWord(name.toUpperCase().slice(0, 7), 0));
  pkg(machine, CM.JXP, { P: ld.entry, RA: ra, FL: fl, EM: em });
  pkg(machine, CM.IXP, { P: 0, RA: CM.IDLE, FL: 1 });
  machine.writeCM(CM.IDLE, 0n); // PS
  return { ok: true, errors: [], entry: ld.entry, fl, ra, map: ld.map };
}

/** État du travail : 'run' | 'end' | 'abort' | 'none'. */
export function jobStatus(machine) {
  const s = Number(machine.cm[CM.STAT]);
  return s === 1 ? 'run' : s === 2 ? 'end' : s === 3 ? 'abort' : 'none';
}

/** Lignes du journal (dayfile), dans l'ordre. */
export function dayfile(machine) {
  const n = Number(machine.cm[CM.DAYP] & 0o37n);
  const out = [];
  for (let k = 0; k < 32; k++) {
    const idx = (n + k) % 32;
    let s = '';
    let any = false;
    for (let w = 0; w < 4; w++) {
      const word = machine.cm[CM.DAYF + idx * 4 + w];
      if (word) any = true;
      s += wordToDisplay(word);
    }
    if (any) out.push(s.replace(/:+$/, '').replace(/:+\s*$/, '').trimEnd());
  }
  return out;
}
