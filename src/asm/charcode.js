// Character codes used by the assembler (CODE pseudo):
// D display, A 6-bit ASCII, E external BCD, I internal BCD, N 8-bit ASCII, O "other" (CHAR).

import { DISPLAY, toDisplay } from '../common/charset.js';

// Internal BCD (6-bit code -> rendering ASCII character).
const INTERNAL_BCD = '0123456789:="@%[+ABCDEFGHI<.)\\^;-JKLMNOPQR!$*\'?> /STUVWXYZ],(_#&';
// External BCD.
const EXTERNAL_BCD = ':1234567890="@%[ /STUVWXYZ],(_#&-JKLMNOPQR!$*\'?>+ABCDEFGHI<.)\\^;';

function reverseTable(t) {
  const m = new Map();
  for (let i = 0; i < t.length; i++) if (!m.has(t[i])) m.set(t[i], i);
  return m;
}
const intBcd = reverseTable(INTERNAL_BCD);
const extBcd = reverseTable(EXTERNAL_BCD);

/** Size in bits of a character in the given code. */
export function charBits(code, wordBits) {
  if (code === 'N') return wordBits === 16 ? 8 : 12;
  return 6;
}

/**
 * Value of a source character (ASCII) in the current code.
 * @param other CHAR table (64 entries) for code O
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

/** "Blank" value in the current code (H and A fill). */
export function blankValue(code, other) {
  return charValue(' ', code, other);
}

function displayOf(c) {
  const d = toDisplay(c);
  return d < 0 ? 0o55 : d;
}
