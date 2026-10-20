// Codes de caractères utilisés par l'assembleur (pseudo CODE) :
// D display, A ASCII 6 bits, E BCD externe, I BCD interne, N ASCII 8 bits, O « autre » (CHAR).

import { DISPLAY, toDisplay } from '../common/charset.js';

// BCD interne (code 6 bits -> caractère ASCII de rendu).
const INTERNAL_BCD = '0123456789:="@%[+ABCDEFGHI<.)\\^;-JKLMNOPQR!$*\'?> /STUVWXYZ],(_#&';
// BCD externe.
const EXTERNAL_BCD = ':1234567890="@%[ /STUVWXYZ],(_#&-JKLMNOPQR!$*\'?>+ABCDEFGHI<.)\\^;';

function reverseTable(t) {
  const m = new Map();
  for (let i = 0; i < t.length; i++) if (!m.has(t[i])) m.set(t[i], i);
  return m;
}
const intBcd = reverseTable(INTERNAL_BCD);
const extBcd = reverseTable(EXTERNAL_BCD);

/** Taille en bits d'un caractère dans le code donné. */
export function charBits(code, wordBits) {
  if (code === 'N') return wordBits === 16 ? 8 : 12;
  return 6;
}

/**
 * Valeur d'un caractère source (ASCII) dans le code courant.
 * @param other table CHAR (64 entrées) pour le code O
 */
export function charValue(ch, code, other) {
  const c = ch.toUpperCase();
  switch (code) {
    case 'A': {
      const a = c.charCodeAt(0);
      return a >= 0x20 && a < 0x60 ? a - 0x20 : 0;
    }
    case 'E': {
      const d = displayOf(c);
      const v = extBcd.get(DISPLAY[d]);
      return v === undefined ? 0o20 : v;
    }
    case 'I': {
      const d = displayOf(c);
      const v = intBcd.get(DISPLAY[d]);
      return v === undefined ? 0o60 : v;
    }
    case 'N':
      return ch.charCodeAt(0) & 0x7f;
    case 'O':
      return other ? other[displayOf(c)] : displayOf(c);
    default:
      return displayOf(c);
  }
}

/** Valeur « blanc » dans le code courant (remplissage H et A). */
export function blankValue(code, other) {
  return charValue(' ', code, other);
}

function displayOf(c) {
  const d = toDisplay(c);
  return d < 0 ? 0o55 : d;
}
