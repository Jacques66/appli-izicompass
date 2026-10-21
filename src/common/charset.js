// CDC character sets: display code (6 bits), external BCD (line printers,
// 7-track tapes), Hollerith (026 and 029 cards), ASCII 6/12 and 12 bits.

/** 64-character display code -> ASCII. */
export const DISPLAY = ':ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-*/()$= ,.#[]%"_!&\'?<>@\\^;';

/** Original CDC glyphs ("authentic" console/listing display). */
export const DISPLAY_CDC = ':ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-*/()$= ,.≡[]%≠→∨∧↑↓<>≤≥¬;';

const asciiToDisplayMap = new Int16Array(256).fill(-1);
for (let i = 0; i < 64; i++) asciiToDisplayMap[DISPLAY.charCodeAt(i)] = i;
for (let i = 0; i < 26; i++) asciiToDisplayMap[0x61 + i] = 1 + i; // lowercase -> uppercase
const cdcGlyph = new Map();
for (let i = 0; i < 64; i++) cdcGlyph.set(DISPLAY_CDC[i], i);

/** Character (ASCII or CDC glyph) -> display code, or -1. */
export function toDisplay(ch) {
  const c = ch.charCodeAt(0);
  if (c < 256 && asciiToDisplayMap[c] >= 0) return asciiToDisplayMap[c];
  const g = cdcGlyph.get(ch);
  return g === undefined ? -1 : g;
}

/** Display code -> ASCII character. */
export function fromDisplay(code) {
  return DISPLAY[code & 0o77];
}

/** String -> array of display codes (unknown character -> blank 55B). */
export function stringToDisplay(s) {
  const out = [];
  for (const ch of s) {
    const d = toDisplay(ch);
    out.push(d < 0 ? 0o55 : d);
  }
  return out;
}

/** 60-bit word -> 10 display characters (ASCII string). */
export function wordToDisplay(w) {
  let s = '';
  for (let i = 9; i >= 0; i--) s += DISPLAY[Number((w >> BigInt(6 * i)) & 0o77n)];
  return s;
}

/** At most 10 characters -> 60-bit word (padded with `fill`, default blank). */
export function displayToWord(s, fill = 0o55) {
  const codes = stringToDisplay(s.slice(0, 10));
  while (codes.length < 10) codes.push(fill);
  let w = 0n;
  for (const c of codes) w = (w << 6n) | BigInt(c);
  return w;
}

/** Text line -> CDC words terminated by an end of line (12 zero bits at the bottom). */
export function lineToWords(s) {
  const codes = stringToDisplay(s);
  while (codes.length && codes[codes.length - 1] === 0o55) codes.pop(); // trailing blanks
  // A lone 00 character at the end of a word would be ambiguous: pad with a blank.
  const words = [];
  let cur = [];
  for (const c of codes) {
    cur.push(c);
    if (cur.length === 10) { words.push(cur); cur = []; }
  }
  // End of line: at least two 00 characters at the end of a word (12 zero bits).
  if (cur.length > 8) { while (cur.length < 10) cur.push(0o55); words.push(cur); cur = []; }
  while (cur.length < 10) cur.push(0);
  words.push(cur);
  return words.map((cs) => cs.reduce((w, c) => (w << 6n) | BigInt(c), 0n));
}

/** CDC words (coded text, end of line = trailing 00 characters) -> ASCII lines. */
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

// -------------------------------------------------------------- external BCD

/** External BCD (6 bits) -> ASCII. */
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

// Punches: bit 11 = row 12, bit 10 = row 11, bit 9 = row 0,
// bits 8..0 = rows 1..9.
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

/** 026 code ("CDC" code, historically used on the 6000 series). */
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

/** ASCII line -> 80 Hollerith columns (12 bits each). */
export function lineToCard(s, code = '029') {
  const map = code === '026' ? HOLLERITH_026 : HOLLERITH_029;
  const cols = new Uint16Array(80);
  const up = s.toUpperCase();
  for (let i = 0; i < 80 && i < up.length; i++) cols[i] = map.get(up[i]) ?? 0;
  return cols;
}

/** Hollerith column -> ASCII character (or '?' if unknown). */
export function columnToChar(v, code = '029') {
  const r = code === '026' ? HOLL026_REV : HOLL029_REV;
  return r.get(v & 0o7777) ?? '?';
}

/** Special control cards: 7/8/9 (end of record) and 6/7/8/9 (end of file). */
export const CARD_EOR = row(7) | row(8) | row(9);
export const CARD_EOF = row(6) | row(7) | row(8) | row(9);

// ------------------------------------------------------------- ASCII 6/12

/** ASCII string -> "6/12" display codes (lowercase and extended characters via 74/76). */
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
