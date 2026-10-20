// Lecture des sources COMPASS : lignes, continuations, édition, découpage en champs.
//
// Seules les colonnes 1-72 sont interprétées ; 73-90 forment le champ de séquence.
// Une ligne avec « , » en colonne 1 continue l'instruction précédente (colonnes
// 2-72, au plus 9 continuations). « * » en colonne 1 = commentaire.

import { toDisplay } from '../common/charset.js';

export const CONCAT = '_';   // marque de concaténation (65B, →)
export const MICRO = '"';    // marque de micro (64B, ≠)
export const MARK = '\u0001'; // marque de paramètre interne (;x de COMPASS)
export const MAX_IMAGE = 72 + 9 * 71;

/** Développe les tabulations (taquets 11, 18, 30 puis tous les 8). */
export function expandTabs(line) {
  if (!line.includes('\t')) return line;
  const stops = [10, 17, 29];
  let out = '';
  for (const ch of line) {
    if (ch === '\t') {
      const col = out.length;
      let next = stops.find((s) => s > col);
      if (next === undefined) next = col + 8 - ((col - 29) % 8);
      out = out.padEnd(next, ' ');
    } else out += ch;
  }
  return out;
}

/** Normalise une ligne source : majuscules, caractères hors jeu CDC -> blanc. */
export function normalize(line) {
  line = expandTabs(line.replace(/\r$/, ''));
  let out = '';
  for (const ch of line) {
    const u = ch.toUpperCase();
    if (u === MARK) { out += ch; continue; }
    out += toDisplay(u) >= 0 ? (u.length === 1 ? u : ' ') : ' ';
  }
  return out;
}

/**
 * Source principale (ou texte externe) : produit des instructions jointes.
 */
export class LineSource {
  constructor(name, text, { system = false, xtext = false } = {}) {
    this.name = name;
    this.raw = text.replace(/\r\n?/g, '\n').split('\n');
    if (this.raw.length && this.raw[this.raw.length - 1] === '') this.raw.pop();
    this.idx = 0;
    this.system = system;
    this.xtext = xtext;
    this.kind = xtext ? 'xtext' : 'main';
  }

  /** Instruction suivante, ou null en fin de source. */
  next() {
    if (this.idx >= this.raw.length) return null;
    const first = this.idx++;
    const raw = this.raw[first];
    const text = normalize(raw);
    const lines = [{ no: first + 1, text: raw }];
    const seq = text.length > 72 ? text.slice(72, 90) : '';
    if (text[0] === '*' || (text[0] === ',')) {
      // commentaire, ou continuation orpheline traitée comme commentaire
      return { img: text.slice(0, 72), seq, lines, file: this.name, line: first + 1, comment: true };
    }
    let img = text.slice(0, 72).padEnd(72, ' ');
    let n = 0;
    while (n < 9 && this.idx < this.raw.length) {
      const nt = normalize(this.raw[this.idx]);
      if (nt[0] !== ',') break;
      img += nt.slice(1, 72).padEnd(71, ' ');
      lines.push({ no: this.idx + 1, text: this.raw[this.idx] });
      this.idx++;
      n++;
    }
    return { img: img.replace(/ +$/, ''), seq, lines, file: this.name, line: first + 1 };
  }
}

/**
 * Édition d'une instruction : suppression des marques de concaténation et
 * substitution des micros « "NOM" ». Un seul balayage gauche-droite, sans
 * ré-examen du texte substitué.
 * @param lookupMicro (nom) -> chaîne ou undefined
 * @returns { img, warnings: ['9'...], changed }
 */
export function editStatement(img, lookupMicro) {
  if (!img.includes(CONCAT) && !img.includes(MICRO)) return { img, warnings: [], changed: false };
  let out = '';
  const warnings = [];
  let i = 0;
  while (i < img.length) {
    const c = img[i];
    if (c === CONCAT) { i++; continue; }
    if (c === MICRO) {
      const j = img.indexOf(MICRO, i + 1);
      if (j < 0) { out += c; i++; continue; }
      const name = img.slice(i + 1, j);
      if (name === '') { i = j + 1; continue; }
      if (!/^[^ ,]{1,8}$/.test(name)) { out += c; i++; continue; }
      const v = lookupMicro(name);
      if (v === undefined) {
        warnings.push('9');
        out += img.slice(i, j + 1);
        i = j + 1;
        continue;
      }
      out += v;
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  if (out.length > MAX_IMAGE) out = out.slice(0, MAX_IMAGE);
  return { img: out, warnings, changed: true };
}

/**
 * Découpe d'une instruction (déjà éditée) en champs.
 * @param cc colonne de commentaire (1-based, défaut 30)
 * @returns { loc, locPos, op, opPos, opEnd, varPos, empty, comment }
 *   positions 0-based dans img ; varPos = -1 si champ variable vide.
 */
export function scanFields(img, cc = 30) {
  const ccIdx = cc - 1;
  let i = 0;
  let loc = '', locPos = -1;
  if (img[0] && img[0] !== ' ' || img[1] && img[1] !== ' ') {
    locPos = img[0] !== ' ' ? 0 : 1;
    i = locPos;
    while (i < img.length && img[i] !== ' ') loc += img[i++];
  } else {
    i = 2;
  }
  while (img[i] === ' ') i++;
  if (i >= img.length || i >= ccIdx) {
    // opération vide : le reste est du commentaire
    return { loc, locPos, op: '', opPos: -1, opEnd: i, varPos: -1, blank: !loc };
  }
  const opPos = i;
  let op = '';
  while (i < img.length && img[i] !== ' ') op += img[i++];
  const opEnd = i;
  const ccEff = opEnd >= ccIdx ? Infinity : ccIdx;
  while (img[i] === ' ') i++;
  const varPos = i < img.length && i < ccEff ? i : -1;
  return { loc, locPos, op, opPos, opEnd, varPos, blank: false };
}

/** Champ variable « brut » : jusqu'au premier blanc (pour les pseudos simples). */
export function simpleField(img, pos) {
  if (pos < 0) return '';
  let s = '';
  while (pos < img.length && img[pos] !== ' ') s += img[pos++];
  return s;
}

/** Découpe simple par virgules d'un champ (sans blancs). */
export function splitCommas(s) {
  return s === '' ? [] : s.split(',');
}
