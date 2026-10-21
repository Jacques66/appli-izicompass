// Reading COMPASS sources: lines, continuations, editing, splitting into fields.
//
// Only columns 1-72 are interpreted; 73-90 form the sequence field.
// A line with "," in column 1 continues the previous statement (columns
// 2-72, at most 9 continuations). "*" in column 1 = comment.

import { toDisplay } from '../common/charset.js';

export const CONCAT = '_';   // concatenation mark (65B, →)
export const MICRO = '"';    // micro mark (64B, ≠)
export const MARK = '\u0001'; // internal parameter mark (;x in COMPASS)
export const MAX_IMAGE = 72 + 9 * 71;

/** Expands tabs (stops at 11, 18, 30, then every 8). */
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

/** Normalizes a source line: uppercase, characters outside the CDC set -> blank. */
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
 * Main source (or external text): produces joined statements.
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

  /** Next statement, or null at end of source. */
  next() {
    if (this.idx >= this.raw.length) return null;
    const first = this.idx++;
    const raw = this.raw[first];
    const text = normalize(raw);
    const lines = [{ no: first + 1, text: raw }];
    const seq = text.length > 72 ? text.slice(72, 90) : '';
    if (text[0] === '*' || (text[0] === ',')) {
      // comment, or orphan continuation treated as a comment
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
 * Statement editing: removal of concatenation marks and substitution of
 * micros ("NAME"). A single left-to-right scan, without rescanning the
 * substituted text.
 * @param lookupMicro (name) -> string or undefined
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
 * Splits a statement (already edited) into fields.
 * @param cc comment column (1-based, default 30)
 * @returns { loc, locPos, op, opPos, opEnd, varPos, empty, comment }
 *   0-based positions in img; varPos = -1 if the variable field is empty.
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
    // empty operation: the rest is comment
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

/** "Raw" variable field: up to the first blank (for simple pseudos). */
export function simpleField(img, pos) {
  if (pos < 0) return '';
  let s = '';
  while (pos < img.length && img[pos] !== ' ') s += img[pos++];
  return s;
}

/** Simple comma split of a field (no blanks). */
export function splitCommas(s) {
  return s === '' ? [] : s.split(',');
}
