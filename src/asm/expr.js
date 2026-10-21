// COMPASS expressions, constants and data.
//
// An expression value (class Val) carries:
//   w       60-bit ones' complement word (masked BigInt);
//   blocks  relocation coefficients per block (Map block -> integer);
//   exts    coefficients per external symbol (Map name -> integer);
//   regs    registers encountered (CPU instructions);
//   undef   undefined symbols encountered.
// Relocatable symbols always hold their offset within their block: the
// conversion to a final address happens at emission (see assembler.js).
//
// Grammar: expression := [addop] term {addop term}
//          term       := element {mulop element}
//          addop      := + | - | &     mulop := * | /
// No parentheses; division by zero = 0; empty element = 0.

import { M60, SIGN60, add60, sub60, signed60, to60 } from '../common/word.js';
import { charValue, charBits, blankValue } from './charcode.js';

export class AsmError extends Error {
  constructor(flag, message) {
    super(message || flag);
    this.flag = flag;
  }
}

export class Val {
  constructor(w = 0n) {
    this.w = w & M60;
    this.blocks = null;
    this.exts = null;
    this.regs = [];
    this.undef = null;
    this.hasQ = false;     // at least one non-register element
    this.literal = false;
  }
  static abs(n) {
    return new Val(to60(n));
  }
  clone() {
    const v = new Val(this.w);
    if (this.blocks) v.blocks = new Map(this.blocks);
    if (this.exts) v.exts = new Map(this.exts);
    v.regs = this.regs.slice();
    v.undef = this.undef ? this.undef.slice() : null;
    v.hasQ = this.hasQ;
    return v;
  }
  isRelocatable() {
    if (this.blocks) for (const c of this.blocks.values()) if (c) return true;
    return false;
  }
  isExternal() {
    if (this.exts) for (const c of this.exts.values()) if (c) return true;
    return false;
  }
  isAbsolute() {
    return !this.isRelocatable() && !this.isExternal();
  }
  /** Single relocatable block (coefficient ±1), or null. */
  relocBlock() {
    if (!this.blocks) return null;
    let found = null;
    for (const [b, c] of this.blocks) if (c) found = { block: b, coeff: c };
    return found;
  }
  extName() {
    if (!this.exts) return null;
    for (const [e, c] of this.exts) if (c) return { name: e, coeff: c };
    return null;
  }
  /** Signed value (BigInt) of the absolute part. */
  signed() {
    return signed60(this.w);
  }
  num() {
    return Number(signed60(this.w));
  }
}

const isDigit = (c) => c >= '0' && c <= '9';
const isLetter = (c) => c >= 'A' && c <= 'Z';
// Characters that cannot appear in a symbol.
const NOT_SYMBOL = new Set(['+', '-', '*', '/', ' ', ',', '_', '&', '\u0000']);
export const isSymbolChar = (c) => c !== undefined && c !== '' && !NOT_SYMBOL.has(c);
const CHAR_TYPES = new Set(['C', 'H', 'A', 'R', 'L', 'Z']);

/** Cursor over a line image. */
export class Cursor {
  constructor(text, pos = 0) {
    this.s = text;
    this.i = pos;
  }
  peek(k = 0) { return this.s[this.i + k] ?? ''; }
  next() { return this.s[this.i++] ?? ''; }
  eof() { return this.i >= this.s.length; }
  atEnd() { const c = this.peek(); return c === '' || c === ' '; }
  atSubEnd() { const c = this.peek(); return c === '' || c === ' ' || c === ','; }
}

// --------------------------------------------------------------- numbers

const BIG10 = 10n;

/**
 * Reads a numeric data item (unsigned): digits, point, modifiers.
 * Returns { kind: 'int'|'float'|'double', words: [BigInt...] } (positive values).
 * @param preradix 'B'|'O'|'D'|null
 */
function parseNumeric(cur, ctx, preradix, allowDouble) {
  const start = cur.i;
  let intPart = '', fracPart = '', point = false;
  while (isDigit(cur.peek())) intPart += cur.next();
  if (cur.peek() === '.') {
    // "1.5", "1.E-3", "2.": the point is part of the number
    point = true;
    cur.next();
    while (isDigit(cur.peek())) fracPart += cur.next();
  }
  let postradix = null, dexp = null, dbl = false, bscale = null, ppos = null;
  const seen = new Set();
  for (;;) {
    const c = cur.peek();
    if (c === 'B' || c === 'O' || c === 'D') {
      if (seen.has('R')) throw new AsmError('A', 'duplicate radix');
      seen.add('R');
      postradix = c;
      cur.next();
    } else if (c === 'E') {
      if (seen.has('E')) throw new AsmError('A', 'duplicate exponent');
      seen.add('E');
      cur.next();
      if (cur.peek() === 'E') { cur.next(); dbl = true; }
      dexp = readSignedInt(cur);
    } else if (c === 'S') {
      if (seen.has('S')) throw new AsmError('A', 'duplicate scale');
      seen.add('S');
      cur.next();
      bscale = readSignedInt(cur);
    } else if (c === 'P') {
      if (seen.has('P')) throw new AsmError('A', 'duplicate binary point');
      seen.add('P');
      cur.next();
      ppos = readSignedInt(cur);
      ppos.given = true;
    } else break;
  }
  if (preradix && postradix) throw new AsmError('A', 'both pre-radix and post-radix');
  let radix = preradix || postradix;
  let base;
  if (radix === 'B' || radix === 'O') base = 8n;
  else if (radix === 'D') base = 10n;
  else base = ctx.base === 'O' || ctx.base === 'M' ? 8n : 10n;
  const digits = intPart + fracPart;
  if (base === 8n && /[89]/.test(digits)) {
    if (!radix && (ctx.base === 'O' || ctx.base === 'M')) throw new AsmError('A', '8 or 9 in an octal data item');
    if (radix === 'B' || radix === 'O') throw new AsmError('A', '8 or 9 in an octal data item');
  }
  // Rational value num/den.
  let num = 0n;
  for (const d of digits) num = num * base + BigInt(d);
  let den = 1n;
  for (let k = 0; k < fracPart.length; k++) den *= base;
  if (dexp) {
    const e = dexp.value;
    if (e > 0) num *= BIG10 ** BigInt(e);
    else if (e < 0) den *= BIG10 ** BigInt(-e);
  }
  if (bscale) {
    const s = bscale.value;
    if (s > 0) num <<= BigInt(s);
    else if (s < 0) den <<= BigInt(-s);
  }
  const text = cur.s.slice(start, cur.i);
  if (!point && !dbl) {
    // Integer: rounded to nearest.
    let v = roundDiv(num, den);
    if (v > M60) { ctx.warn && ctx.warn('7'); v &= M60; }
    return { kind: 'int', words: [v], text };
  }
  if (ctx.pp) throw new AsmError('A', 'floating-point constant not allowed in PP');
  if (!point && dbl) {
    // EE on an integer value -> single-precision integer
    return { kind: 'int', words: [roundDiv(num, den) & M60], text };
  }
  if (dbl && allowDouble) {
    return { kind: 'double', words: floatWords(num, den, true, ppos), text };
  }
  return { kind: 'float', words: floatWords(num, den, false, ppos), text };
}

function readSignedInt(cur) {
  let sign = 1;
  const save = cur.i;
  if ((cur.peek() === '+' || cur.peek() === '-') && isDigit(cur.peek(1))) {
    sign = cur.next() === '-' ? -1 : 1;
  }
  let s = '';
  while (isDigit(cur.peek())) s += cur.next();
  if (!s) { cur.i = save; return { value: 0 }; }
  return { value: sign * Number(s) };
}

function roundDiv(num, den) {
  if (den === 1n) return num;
  const q = num / den;
  const r = num - q * den;
  return r * 2n >= den ? q + 1n : q;
}

/**
 * CDC floating-point value from num/den > 0 (or 0).
 * Single precision: rounded normalized 48-bit coefficient; double: 96 bits.
 */
function floatWords(num, den, dbl, ppos) {
  const bits = dbl ? 96 : 48;
  if (num === 0n) {
    if (dbl) return [0n, 0n];
    return [0n];
  }
  // Find e such that 2^(bits-1) <= num/den / 2^e < 2^bits.
  const nb = num.toString(2).length - den.toString(2).length;
  let e = nb - bits;
  let c;
  for (let iter = 0; iter < 4; iter++) {
    c = e >= 0 ? roundDiv(num, den << BigInt(e)) : roundDiv(num << BigInt(-e), den);
    if (c >= 1n << BigInt(bits)) e++;
    else if (c < 1n << BigInt(bits - 1)) e--;
    else break;
  }
  if (c >= 1n << BigInt(bits)) { c >>= 1n; e++; }
  // Exponent of the upper word: e + (dbl ? 48 : 0)
  let eHigh = e + (dbl ? 48 : 0);
  if (ppos && ppos.given) {
    const target = -ppos.value;
    const shift = target - eHigh;
    if (shift > 0) c >>= BigInt(shift);
    else if (shift < 0) {
      c <<= BigInt(-shift);
      if (c >= 1n << BigInt(bits)) throw new AsmError('A', 'overflow caused by the binary point');
    }
    eHigh = target;
  }
  if (eHigh > 0o1777 || eHigh < -0o1777) throw new AsmError('A', 'exponent out of range');
  const mk = (coeff, exp) => {
    const be = exp >= 0 ? exp + 0o2000 : exp + 0o1777;
    if (be < 0 || be > 0o3777) return 0n;
    return (BigInt(be) << 48n) | (coeff & ((1n << 48n) - 1n));
  };
  if (!dbl) return [mk(c, eHigh)];
  const hi = c >> 48n;
  const lo = c & ((1n << 48n) - 1n);
  return [mk(hi, eHigh), mk(lo, eHigh - 48)];
}

/** Hexadecimal: after the '#' pre-radix. */
function parseHex(cur) {
  let v = 0n;
  let n = 0;
  while (/[0-9A-F]/.test(cur.peek())) {
    v = (v << 4n) | BigInt(parseInt(cur.next(), 16));
    n++;
  }
  // Modifiers S (scale) and P (ignored)
  for (;;) {
    const c = cur.peek();
    if (c === 'S') {
      cur.next();
      const s = readSignedInt(cur).value;
      v = s >= 0 ? v << BigInt(s) : v >> BigInt(-s);
    } else if (c === 'P') {
      cur.next();
      readSignedInt(cur);
    } else break;
  }
  return v;
}

// --------------------------------------------------------- characters

/**
 * Character string -> value justified in `fieldBits` bits (constant).
 */
function charConstant(str, type, fieldBits, ctx) {
  const cb = charBits(ctx.code, ctx.wordBits);
  const blank = BigInt(blankValue(ctx.code, ctx.other));
  const n = str.length;
  const slots = Math.floor(fieldBits / cb);
  let v = 0n;
  const vals = [...str].map((ch) => BigInt(charValue(ch, ctx.code, ctx.other)));
  const fill = type === 'H' || type === 'A' ? blank : 0n;
  const left = type === 'H' || type === 'L' || type === 'C' || type === 'Z';
  if (n * cb > fieldBits) ctx.warn && ctx.warn('7');
  if (left) {
    // left-justified in the field: characters, then fill
    let bitsUsed = 0;
    for (let k = 0; k < Math.min(n, slots); k++) { v = (v << BigInt(cb)) | vals[k]; bitsUsed += cb; }
    while (bitsUsed + cb <= fieldBits) { v = (v << BigInt(cb)) | fill; bitsUsed += cb; }
    v <<= BigInt(fieldBits - bitsUsed);
  } else {
    // right-justified: fill, then characters
    const take = vals.slice(Math.max(0, n - slots));
    const pad = slots - take.length;
    for (let k = 0; k < pad; k++) v = (v << BigInt(cb)) | fill;
    for (const x of take) v = (v << BigInt(cb)) | x;
  }
  return v & ((1n << BigInt(fieldBits)) - 1n);
}

/**
 * Character data -> words (DATA, LIT, literals).
 * @returns array of BigInt (words of `ctx.wordBits` bits)
 */
export function charDataWords(str, type, ctx) {
  const wb = ctx.wordBits;
  const cb = charBits(ctx.code, wb);
  const cpw = Math.floor(wb / cb);
  const vals = [...str].map((ch) => BigInt(charValue(ch, ctx.code, ctx.other)));
  const blank = BigInt(blankValue(ctx.code, ctx.other));
  const n = vals.length;
  let nchars;
  if (type === 'C') nchars = Math.ceil((n * cb + 12) / wb) * cpw;
  else if (type === 'Z') nchars = Math.ceil((n * cb + 6) / wb) * cpw;
  else nchars = Math.max(1, Math.ceil(n / cpw)) * cpw;
  if (n === 0 && (type === 'H' || type === 'L')) return [];
  const fill = type === 'H' || type === 'A' ? blank : 0n;
  let seq;
  if (type === 'A' || type === 'R') seq = new Array(nchars - n).fill(fill).concat(vals);
  else seq = vals.concat(new Array(nchars - n).fill(fill));
  const words = [];
  for (let k = 0; k < seq.length; k += cpw) {
    let w = 0n;
    for (let m = 0; m < cpw; m++) w = (w << BigInt(cb)) | seq[k + m];
    w <<= BigInt(wb - cpw * cb);
    words.push(w);
  }
  return words;
}

/**
 * Reads a data item (DATA/LIT item, or literal after '=').
 * @returns { words: BigInt[] (already complemented if sign -), kind }
 */
export function parseDataItem(cur, ctx, { literal = false } = {}) {
  const wb = ctx.wordBits;
  const wmask = (1n << BigInt(wb)) - 1n;
  let neg = false;
  if (cur.peek() === '+' || cur.peek() === '-') neg = cur.next() === '-';
  let words;
  let kind = 'int';
  const c = cur.peek();
  if (isDigit(c)) {
    // nType..., or number, or 0#hex
    let k = cur.i, n = '';
    while (isDigit(cur.s[k])) n += cur.s[k++];
    const t = cur.s[k];
    if (t === '#' && n === '0') {
      cur.i = k + 1;
      words = [parseHex(cur) & M60];
    } else if (CHAR_TYPES.has(t)) {
      cur.i = k + 1;
      const count = Number(n);
      let str;
      if (count === 0) {
        str = '';
        while (!cur.atSubEnd()) str += cur.next();
      } else {
        str = cur.s.slice(cur.i, cur.i + count).padEnd(count, ' ');
        cur.i += count;
      }
      words = charDataWords(str, t, ctx);
      kind = 'char';
    } else {
      const r = parseNumeric(cur, ctx, null, wb === 60);
      words = r.words;
      kind = r.kind;
    }
  } else if (c === '.' && isDigit(cur.peek(1))) {
    const r = parseNumeric(cur, ctx, null, wb === 60);
    words = r.words;
    kind = r.kind;
  } else if (c === '#') {
    cur.next();
    words = [parseHex(cur) & M60];
  } else if ((c === 'B' || c === 'O' || c === 'D') && (isDigit(cur.peek(1)) || cur.peek(1) === '.')) {
    cur.next();
    const r = parseNumeric(cur, ctx, c, wb === 60);
    words = r.words;
    kind = r.kind;
  } else if (CHAR_TYPES.has(c)) {
    cur.next();
    const d = cur.next();
    if (d === '' || d === ' ' || d === ',') throw new AsmError('A', 'missing string delimiter');
    let str = '';
    while (cur.peek() !== d) {
      if (cur.eof()) throw new AsmError('A', 'missing string end delimiter');
      str += cur.next();
    }
    cur.next();
    words = charDataWords(str, c, ctx);
    kind = 'char';
  } else if (cur.atSubEnd()) {
    return { words: [], kind: 'empty' };
  } else {
    throw new AsmError('A', `incorrect data item "${c}"`);
  }
  if (wb !== 60) {
    words = words.map((w) => {
      if (kind === 'int' && w > wmask && w !== (w & wmask)) {
        if ((w & ~wmask & M60) !== 0n) ctx.warn && ctx.warn('7');
      }
      return w & wmask;
    });
  }
  if (neg) words = words.map((w) => ~w & wmask);
  if (literal && words.length === 0) throw new AsmError('A', 'empty literal');
  return { words, kind };
}

// --------------------------------------------------------- expressions

/**
 * Evaluates an expression from the cursor, up to ',' ' ' or end.
 * ctx:
 *   asm        assembler (symbols, counters, literals)
 *   fieldBits  size of the destination field (character constants)
 *   regs       true if CPU register designators are recognized
 *   stop       set of additional stop characters (e.g. '/' for VFD)
 */
export function parseExpression(cur, ctx) {
  const total = new Val(0n);
  let first = true;
  let op = '+';
  let opStart = cur.i;
  if (cur.peek() === '+' || cur.peek() === '-' || cur.peek() === '&') {
    op = cur.next();
  }
  for (;;) {
    ctx._opStart = opStart;
    const term = parseTerm(cur, ctx, op, first);
    combine(total, term, op, ctx);
    first = false;
    const c = cur.peek();
    if (c === '+' || c === '-' || c === '&') {
      opStart = cur.i;
      op = cur.next();
      continue;
    }
    break;
  }
  return total;
}

function combine(total, term, op, ctx) {
  for (const r of term.regs) total.regs.push(r);
  if (term.hasQ) total.hasQ = true;
  if (term.undef) total.undef = (total.undef || []).concat(term.undef);
  if (term.literal) total.literal = true;
  if (op === '&') {
    if (term.isRelocatable() || term.isExternal() || total.isRelocatable() || total.isExternal()) {
      throw new AsmError('A', 'exclusive OR on a relocatable value');
    }
    total.w = (total.w ^ term.w) & M60;
    return;
  }
  const sgn = op === '-' ? -1 : 1;
  total.w = op === '-' ? sub60(total.w, term.w) : add60(total.w, term.w);
  if (term.blocks) {
    total.blocks = total.blocks || new Map();
    for (const [b, c] of term.blocks) total.blocks.set(b, (total.blocks.get(b) || 0) + sgn * c);
  }
  if (term.exts) {
    total.exts = total.exts || new Map();
    for (const [e, c] of term.exts) total.exts.set(e, (total.exts.get(e) || 0) + sgn * c);
  }
}

function parseTerm(cur, ctx, addop, firstTerm) {
  let acc = parseElement(cur, ctx, addop);
  for (;;) {
    const c = cur.peek();
    if (c !== '*' && c !== '/') break;
    if (ctx.stop && ctx.stop.has(c)) break;
    ctx._opStart = cur.i;
    cur.next();
    const rhs = parseElement(cur, ctx, c);
    if (rhs.regs.length || acc.regs.length) {
      // Register combined by * or / with another register: form BXi Xj*Xk
      if (rhs.regs.length && !rhs.hasQ && acc.regs.length && !acc.hasQ) {
        acc.regs.push(...rhs.regs);
        continue;
      }
      throw new AsmError('A', 'register in a product');
    }
    const relA = acc.isRelocatable() || acc.isExternal();
    const relB = rhs.isRelocatable() || rhs.isExternal();
    if (c === '*') {
      if (relA && relB) throw new AsmError('A', 'two relocatable elements in a term');
      const a = acc.signed(), b = rhs.signed();
      const r = new Val(to60(a * b));
      r.hasQ = acc.hasQ || rhs.hasQ;
      r.undef = mergeUndef(acc, rhs);
      const rel = relA ? acc : relB ? rhs : null;
      const factor = relA ? Number(b) : Number(a);
      if (rel) {
        if (rel.blocks) { r.blocks = new Map(); for (const [k, v] of rel.blocks) r.blocks.set(k, v * factor); }
        if (rel.exts) { r.exts = new Map(); for (const [k, v] of rel.exts) r.exts.set(k, v * factor); }
      }
      if (acc.literal || rhs.literal) r.literal = true;
      acc = r;
    } else {
      if (relA || relB) throw new AsmError('A', 'division of a relocatable element');
      const a = acc.signed(), b = rhs.signed();
      const q = b === 0n ? 0n : a / b;
      const r = new Val(to60(q));
      r.hasQ = acc.hasQ || rhs.hasQ;
      r.undef = mergeUndef(acc, rhs);
      acc = r;
    }
  }
  return acc;
}

function mergeUndef(a, b) {
  if (!a.undef && !b.undef) return null;
  return (a.undef || []).concat(b.undef || []);
}

/** Register designator at the current position, or null. */
export function peekRegister(cur, ctx) {
  const c = cur.peek();
  if (!ctx.regs || (c !== 'A' && c !== 'B' && c !== 'X')) return null;
  const d = cur.peek(1);
  if (d >= '0' && d <= '7' && !isSymbolChar(cur.peek(2))) return { type: c, len: 2, n: Number(d) };
  if (d === '.') return { type: c, dotted: true };
  return null;
}

function parseElement(cur, ctx, op) {
  const c = cur.peek();
  const asm = ctx.asm;
  // Empty element
  if (c === '' || c === ' ' || c === ',' || c === '+' || c === '-' || c === '&' || (c === '/' && !isQualStart(cur)) || (ctx.stop && ctx.stop.has(c))) {
    if (c === '*') return parseSpecial(cur, ctx); // never reached
    return new Val(0n);
  }
  // Register
  const reg = peekRegister(cur, ctx);
  if (reg) {
    let n = reg.n;
    const regStart = cur.i;
    if (reg.dotted) {
      cur.i += 2;
      const sub = parseElement(cur, { ...ctx, regs: false, _opStart: cur.i }, '+');
      n = sub.num();
      if (n < 0 || n > 7) { ctx.warn && ctx.warn('7'); n &= 7; }
    } else {
      cur.i += 2;
    }
    const v = new Val(0n);
    v.regs.push({ type: reg.type, n, op, span: [ctx._opStart ?? regStart, cur.i],
      numText: reg.dotted ? cur.s.slice(regStart + 2, cur.i) : String(n) });
    return v;
  }
  if (isDigit(c)) return parseConstant(cur, ctx);
  if (c === '=') {
    const p = cur.peek(1);
    if ((p === 'S' || p === 'X' || p === 'Y') && isSymbolChar(cur.peek(2)) && !(p === 'S' && false)) {
      // =Ssym, =Xsym, =Ysym - could "=X..." also be a literal? No: X is not a data type.
      cur.i += 2;
      const name = readSymbolName(cur);
      if (!name) throw new AsmError('A', `no symbol after =${p}`);
      const v = asm.symbolValue(name, null, { defaultPrefix: p, ctx });
      v.hasQ = true;
      return v;
    }
    cur.next();
    const item = parseDataItem(cur, { ...ctx, wordBits: ctx.wordBits || 60 }, { literal: true });
    const v = asm.literalValue(item.words, ctx);
    v.hasQ = true;
    v.literal = true;
    return v;
  }
  if (c === '*') return parseSpecial(cur, ctx);
  if (c === '$') {
    cur.next();
    const v = Val.abs(asm.positionCounter() - 1);
    v.hasQ = true;
    return v;
  }
  if (c === '/') {
    // /qual/sym or //sym
    cur.next();
    let q = '';
    while (cur.peek() !== '/' && isSymbolChar(cur.peek())) q += cur.next();
    if (cur.peek() !== '/') throw new AsmError('A', 'malformed qualifier');
    cur.next();
    const name = readSymbolName(cur);
    const v = asm.symbolValue(name, q, { ctx });
    v.hasQ = true;
    return v;
  }
  if (isSymbolChar(c) && c !== '$' && c !== '=' && c !== ':') {
    const name = readSymbolName(cur);
    if (name.length > 8) throw new AsmError('A', `symbol too long: ${name}`);
    const v = asm.symbolValue(name, null, { ctx });
    v.hasQ = true;
    return v;
  }
  throw new AsmError('A', `incorrect element "${c}"`);
}

function isQualStart(cur) {
  // "/Q/SYM" or "//SYM" in element position
  const s = cur.s;
  let k = cur.i + 1;
  while (isSymbolChar(s[k]) && s[k] !== '/') k++;
  return s[k] === '/' && (isSymbolChar(s[k + 1]) && s[k + 1] !== '/');
}

function parseSpecial(cur, ctx) {
  const asm = ctx.asm;
  cur.next(); // '*'
  const n = cur.peek();
  let v;
  if (n === 'L' && !isSymbolChar(cur.peek(1))) { cur.next(); v = asm.locationValue(); }
  else if (n === 'O' && !isSymbolChar(cur.peek(1))) { cur.next(); v = asm.originValue(); }
  else if (n === 'P' && !isSymbolChar(cur.peek(1))) { cur.next(); v = Val.abs(asm.positionCounter()); }
  else if (n === 'F' && !isSymbolChar(cur.peek(1))) { cur.next(); v = Val.abs(asm.options.F || 0); }
  else v = asm.locationValue();
  v.hasQ = true;
  return v;
}

export function readSymbolName(cur) {
  let s = '';
  while (isSymbolChar(cur.peek())) {
    // / ends a symbol
    if (cur.peek() === '/') break;
    s += cur.next();
  }
  return s;
}

/** Constant in an expression (starts with a digit). */
function parseConstant(cur, ctx) {
  let k = cur.i, n = '';
  while (isDigit(cur.s[k])) n += cur.s[k++];
  const t = cur.s[k];
  let v;
  if (t === '#' && n === '0') {
    cur.i = k + 1;
    v = new Val(parseHex(cur) & M60);
  } else if (CHAR_TYPES.has(t)) {
    cur.i = k + 1;
    const count = Number(n);
    let str = '';
    if (count === 0) {
      while (!cur.eof() && !'+-*/ ,&'.includes(cur.peek())) str += cur.next();
    } else {
      str = cur.s.slice(cur.i, cur.i + count).padEnd(count, ' ');
      cur.i += count;
    }
    const fb = ctx.fieldBits || 60;
    let w = charConstant(str, t === 'C' || t === 'Z' ? 'L' : t, fb, ctx);
    // sign extension to 60 bits from the field
    if (fb < 60 && (w >> BigInt(fb - 1)) & 1n) w |= M60 ^ ((1n << BigInt(fb)) - 1n);
    v = new Val(w);
  } else {
    const r = parseNumeric(cur, ctx, null, false);
    v = new Val(r.words[0] & M60);
  }
  v.hasQ = true;
  return v;
}

/** Does the value fit in n bits (upper bits all 0 or all 1)? */
export function fitsBits(w, n) {
  if (n >= 60) return true;
  const hi = w >> BigInt(n);
  const all = M60 >> BigInt(n);
  if (hi === 0n || hi === all) return true;
  // a positive value whose bit n-1 is 1 is accepted (e.g. 777777B in 18 bits)
  return false;
}

/** Truncates a 60-bit value to n bits. */
export function truncBits(w, n) {
  return w & ((1n << BigInt(n)) - 1n);
}

export { SIGN60, signed60 };
