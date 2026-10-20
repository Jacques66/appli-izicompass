// Jeux de caractères CDC : code display (6 bits), BCD externe (imprimantes,
// bandes 7 pistes), Hollerith (cartes 026 et 029), ASCII 6/12 et 12 bits.

/** Code display 64 caractères -> ASCII. */
export const DISPLAY = ':ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-*/()$= ,.#[]%"_!&\'?<>@\\^;';

/** Graphies CDC d'origine (affichage console/listing « authentique »). */
export const DISPLAY_CDC = ':ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-*/()$= ,.≡[]%≠→∨∧↑↓<>≤≥¬;';

const asciiToDisplayMap = new Int16Array(256).fill(-1);
for (let i = 0; i < 64; i++) asciiToDisplayMap[DISPLAY.charCodeAt(i)] = i;
for (let i = 0; i < 26; i++) asciiToDisplayMap[0x61 + i] = 1 + i; // minuscules -> majuscules
const cdcGlyph = new Map();
for (let i = 0; i < 64; i++) cdcGlyph.set(DISPLAY_CDC[i], i);

/** Caractère (ASCII ou graphie CDC) -> code display, ou -1. */
export function toDisplay(ch) {
  const c = ch.charCodeAt(0);
  if (c < 256 && asciiToDisplayMap[c] >= 0) return asciiToDisplayMap[c];
  const g = cdcGlyph.get(ch);
  return g === undefined ? -1 : g;
}

/** Code display -> caractère ASCII. */
export function fromDisplay(code) {
  return DISPLAY[code & 0o77];
}

/** Chaîne -> tableau de codes display (caractère inconnu -> espace 55B). */
export function stringToDisplay(s) {
  const out = [];
  for (const ch of s) {
    const d = toDisplay(ch);
    out.push(d < 0 ? 0o55 : d);
  }
  return out;
}

/** Mot de 60 bits -> 10 caractères display (chaîne ASCII). */
export function wordToDisplay(w) {
  let s = '';
  for (let i = 9; i >= 0; i--) s += DISPLAY[Number((w >> BigInt(6 * i)) & 0o77n)];
  return s;
}

/** 10 caractères au plus -> mot de 60 bits (remplissage par `fill`, défaut espace). */
export function displayToWord(s, fill = 0o55) {
  const codes = stringToDisplay(s.slice(0, 10));
  while (codes.length < 10) codes.push(fill);
  let w = 0n;
  for (const c of codes) w = (w << 6n) | BigInt(c);
  return w;
}

/** Ligne de texte -> mots CDC terminés par une fin de ligne (12 bits de zéro en bas). */
export function lineToWords(s) {
  const codes = stringToDisplay(s);
  while (codes.length && codes[codes.length - 1] === 0o55) codes.pop(); // espaces finaux
  // Un octet 00 isolé en fin de mot serait ambigu : on complète par un espace.
  const words = [];
  let cur = [];
  for (const c of codes) {
    cur.push(c);
    if (cur.length === 10) { words.push(cur); cur = []; }
  }
  // Fin de ligne : au moins deux caractères 00 en fin de mot (12 bits nuls).
  if (cur.length > 8) { while (cur.length < 10) cur.push(0o55); words.push(cur); cur = []; }
  while (cur.length < 10) cur.push(0);
  words.push(cur);
  return words.map((cs) => cs.reduce((w, c) => (w << 6n) | BigInt(c), 0n));
}

/** Mots CDC (texte codé, fin de ligne = octets 00 de fin) -> lignes ASCII. */
export function wordsToLines(words) {
  const lines = [];
  let cur = '';
  for (const w of words) {
    const codes = [];
    for (let i = 9; i >= 0; i--) codes.push(Number((w >> BigInt(6 * i)) & 0o77n));
    if ((w & 0o7777n) === 0n) {
      let n = 10;
      while (n > 0 && codes[n - 1] === 0) n--;
      for (let i = 0; i < n; i++) cur += DISPLAY[codes[i]];
      lines.push(cur);
      cur = '';
    } else {
      for (const c of codes) cur += DISPLAY[c];
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// --------------------------------------------------------------- BCD externe

/** BCD externe (6 bits) -> ASCII. */
export const EXT_BCD = ':1234567890=\"@%[ /STUVWXYZ],(_#&-JKLMNOPQR!$*\'?>+ABCDEFGHI<.)\\^;';
const asciiToExtBcd = new Int16Array(256).fill(-1);
for (let i = 0; i < 64; i++) if (asciiToExtBcd[EXT_BCD.charCodeAt(i)] < 0) asciiToExtBcd[EXT_BCD.charCodeAt(i)] = i;

export function displayToExtBcd(d) {
  const v = asciiToExtBcd[DISPLAY.charCodeAt(d & 0o77)];
  return v < 0 ? 0o20 : v;
}
export function extBcdToAscii(b) {
  return EXT_BCD[b & 0o77];
}

// ---------------------------------------------------------------- Hollerith

// Perforations : bit 11 = ligne 12, bit 10 = ligne 11, bit 9 = ligne 0,
// bits 8..0 = lignes 1..9.
const R12 = 0o4000, R11 = 0o2000, R0 = 0o1000;
const row = (n) => (n === 0 ? R0 : 1 << (9 - n));

function buildHollerith(specials) {
  const map = new Map();
  map.set(' ', 0);
  for (let d = 0; d <= 9; d++) map.set(String(d), row(d));
  for (let i = 0; i < 9; i++) map.set(String.fromCharCode(65 + i), R12 | row(i + 1));
  for (let i = 0; i < 9; i++) map.set(String.fromCharCode(74 + i), R11 | row(i + 1));
  for (let i = 0; i < 8; i++) map.set(String.fromCharCode(83 + i), R0 | row(i + 2));
  for (const [ch, punches] of Object.entries(specials)) {
    let v = 0;
    for (const p of punches) v |= p === 12 ? R12 : p === 11 ? R11 : row(p);
    map.set(ch, v);
  }
  return map;
}

/** Code 026 (code « CDC », usage historique des 6000). */
export const HOLLERITH_026 = buildHollerith({
  '+': [12], '-': [11], '/': [0, 1], '=': [3, 8], '(': [0, 4, 8], ')': [12, 4, 8],
  '*': [11, 4, 8], '$': [11, 3, 8], ',': [0, 3, 8], '.': [12, 3, 8], '#': [0, 6, 8],
  '[': [7, 8], ']': [12, 2, 8], '%': [0, 5, 8], '"': [4, 8], '_': [0, 7, 8],
  '!': [11, 0], '&': [12, 7, 8], "'": [11, 5, 8], '?': [11, 6, 8], '<': [12, 0],
  '>': [11, 7, 8], '@': [5, 8], '\\': [12, 5, 8], '^': [12, 6, 8], ';': [11, 2, 8], ':': [2, 8],
});

/** Code 029 (IBM). */
export const HOLLERITH_029 = buildHollerith({
  '+': [12, 6, 8], '-': [11], '/': [0, 1], '=': [6, 8], '(': [12, 5, 8], ')': [11, 5, 8],
  '*': [11, 4, 8], '$': [11, 3, 8], ',': [0, 3, 8], '.': [12, 3, 8], '#': [3, 8],
  '[': [12, 2, 8], ']': [11, 2, 8], '%': [0, 4, 8], '"': [7, 8], '_': [0, 5, 8],
  '!': [12, 7, 8], '&': [12], "'": [5, 8], '?': [0, 7, 8], '<': [12, 4, 8],
  '>': [0, 6, 8], '@': [4, 8], '\\': [0, 2, 8], '^': [11, 7, 8], ';': [11, 6, 8], ':': [2, 8],
});

const reverse = (map) => {
  const r = new Map();
  for (const [k, v] of map) if (!r.has(v)) r.set(v, k);
  return r;
};
const HOLL026_REV = reverse(HOLLERITH_026);
const HOLL029_REV = reverse(HOLLERITH_029);

/** Ligne ASCII -> 80 colonnes Hollerith (12 bits chacune). */
export function lineToCard(s, code = '029') {
  const map = code === '026' ? HOLLERITH_026 : HOLLERITH_029;
  const cols = new Uint16Array(80);
  const up = s.toUpperCase();
  for (let i = 0; i < 80 && i < up.length; i++) cols[i] = map.get(up[i]) ?? 0;
  return cols;
}

/** Colonne Hollerith -> caractère ASCII (ou '?' si inconnu). */
export function columnToChar(v, code = '029') {
  const r = code === '026' ? HOLL026_REV : HOLL029_REV;
  return r.get(v & 0o7777) ?? '?';
}

/** Cartes spéciales de contrôle : 7/8/9 (fin d'enregistrement) et 6/7/8/9 (fin de fichier). */
export const CARD_EOR = row(7) | row(8) | row(9);
export const CARD_EOF = row(6) | row(7) | row(8) | row(9);

// ------------------------------------------------------------- ASCII 6/12

/** Chaîne ASCII -> codes display « 6/12 » (minuscules et caractères étendus via 74/76). */
export function asciiTo612(s) {
  const out = [];
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= 0x61 && c <= 0x7a) out.push(0o76, c - 0x60);
    else if (ch === '@') out.push(0o74, 0o01);
    else if (ch === '^') out.push(0o74, 0o02);
    else if (ch === ':') out.push(0o74, 0o04);
    else if (ch === '`') out.push(0o74, 0o07);
    else if (ch === '{') out.push(0o76, 0o33);
    else if (ch === '|') out.push(0o76, 0o34);
    else if (ch === '}') out.push(0o76, 0o35);
    else if (ch === '~') out.push(0o76, 0o36);
    else {
      const d = toDisplay(ch);
      out.push(d < 0 ? 0o55 : d);
    }
  }
  return out;
}
