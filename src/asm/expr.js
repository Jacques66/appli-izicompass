// Expressions, constantes et données COMPASS.
//
// Une valeur d'expression (classe Val) porte :
//   w       mot de 60 bits en complément à un (BigInt masqué) ;
//   blocks  coefficients de relocation par bloc (Map bloc -> entier) ;
//   exts    coefficients par symbole externe (Map nom -> entier) ;
//   regs    registres rencontrés (instructions CPU) ;
//   undef   symboles non définis rencontrés.
// Les symboles relogeables valent toujours leur décalage dans leur bloc : la
// conversion en adresse finale se fait à l'émission (voir assembler.js).
//
// Grammaire : expression := [addop] terme {addop terme}
//             terme      := élément {mulop élément}
//             addop      := + | - | &     mulop := * | /
// Pas de parenthèses ; division par zéro = 0 ; élément vide = 0.

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
    this.hasQ = false;     // au moins un élément non registre
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
  /** Bloc relogeable unique (coefficient ±1), ou null. */
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
  /** Valeur signée (BigInt) de la partie absolue. */
  signed() {
    return signed60(this.w);
  }
  num() {
    return Number(signed60(this.w));
  }
}

const isDigit = (c) => c >= '0' && c <= '9';
const isLetter = (c) => c >= 'A' && c <= 'Z';
// Caractères qui ne peuvent pas figurer dans un symbole.
const NOT_SYMBOL = new Set(['+', '-', '*', '/', ' ', ',', '_', '&', '\u0000']);
export const isSymbolChar = (c) => c !== undefined && c !== '' && !NOT_SYMBOL.has(c);
const CHAR_TYPES = new Set(['C', 'H', 'A', 'R', 'L', 'Z']);

/** Curseur sur une image de ligne. */
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

// --------------------------------------------------------------- nombres

const BIG10 = 10n;

/**
 * Lit une donnée numérique (sans signe) : chiffres, point, modificateurs.
 * Retourne { kind: 'int'|'float'|'double', words: [BigInt...] } (valeurs positives).
 * @param preradix 'B'|'O'|'D'|null
 */
function parseNumeric(cur, ctx, preradix, allowDouble) {
  const start = cur.i;
  let intPart = '', fracPart = '', point = false;
  while (isDigit(cur.peek())) intPart += cur.next();
  if (cur.peek() === '.') {
    // « 1.5 », « 1.E-3 », « 2. » : le point fait partie du nombre
    point = true;
    cur.next();
    while (isDigit(cur.peek())) fracPart += cur.next();
  }
  let postradix = null, dexp = null, dbl = false, bscale = null, ppos = null;
  const seen = new Set();
  for (;;) {
    const c = cur.peek();
    if (c === 'B' || c === 'O' || c === 'D') {
      if (seen.has('R')) throw new AsmError('A', 'radix en double');
      seen.add('R');
      postradix = c;
      cur.next();
    } else if (c === 'E') {
      if (seen.has('E')) throw new AsmError('A', 'exposant en double');
      seen.add('E');
      cur.next();
      if (cur.peek() === 'E') { cur.next(); dbl = true; }
      dexp = readSignedInt(cur);
    } else if (c === 'S') {
      if (seen.has('S')) throw new AsmError('A', 'échelle en double');
      seen.add('S');
      cur.next();
      bscale = readSignedInt(cur);
    } else if (c === 'P') {
      if (seen.has('P')) throw new AsmError('A', 'point binaire en double');
      seen.add('P');
      cur.next();
      ppos = readSignedInt(cur);
      ppos.given = true;
    } else break;
  }
  if (preradix && postradix) throw new AsmError('A', 'pré-radix et post-radix');
  let radix = preradix || postradix;
  let base;
  if (radix === 'B' || radix === 'O') base = 8n;
  else if (radix === 'D') base = 10n;
  else base = ctx.base === 'O' ? 8n : 10n;
  const digits = intPart + fracPart;
  if (base === 8n && /[89]/.test(digits)) {
    if (!radix && ctx.base === 'O') throw new AsmError('A', '8 ou 9 dans une donnée octale');
    if (radix === 'B' || radix === 'O') throw new AsmError('A', '8 ou 9 dans une donnée octale');
  }
  // Valeur rationnelle num/den.
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
    // Entier : arrondi au plus proche.
    let v = roundDiv(num, den);
    if (v > M60) { ctx.warn && ctx.warn('7'); v &= M60; }
    return { kind: 'int', words: [v], text };
  }
  if (ctx.pp) throw new AsmError('A', 'constante flottante interdite en PP');
  if (!point && dbl) {
    // EE sur une valeur entière -> entier simple précision
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
 * Flottant CDC à partir de num/den > 0 (ou 0).
 * Simple précision : coefficient normalisé 48 bits arrondi ; double : 96 bits.
 */
function floatWords(num, den, dbl, ppos) {
  const bits = dbl ? 96 : 48;
  if (num === 0n) {
    if (dbl) return [0n, 0n];
    return [0n];
  }
  // Trouver e tel que 2^(bits-1) <= num/den / 2^e < 2^bits.
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
  // Exposant du mot haut : e + (dbl ? 48 : 0)
  let eHigh = e + (dbl ? 48 : 0);
  if (ppos && ppos.given) {
    const target = -ppos.value;
    const shift = target - eHigh;
    if (shift > 0) c >>= BigInt(shift);
    else if (shift < 0) {
      c <<= BigInt(-shift);
      if (c >= 1n << BigInt(bits)) throw new AsmError('A', 'dépassement dû au point binaire');
    }
    eHigh = target;
  }
  if (eHigh > 0o1777 || eHigh < -0o1777) throw new AsmError('A', 'exposant hors limites');
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

/** Hexadécimal : après le pré-radix '#'. */
function parseHex(cur) {
  let v = 0n;
  let n = 0;
  while (/[0-9A-F]/.test(cur.peek())) {
    v = (v << 4n) | BigInt(parseInt(cur.next(), 16));
    n++;
  }
  // Modificateurs S (échelle) et P (ignoré)
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

// --------------------------------------------------------- caractères

/**
 * Chaîne de caractères -> valeur cadrée dans `fieldBits` bits (constante).
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
    // cadré à gauche dans le champ : caractères puis remplissage
    let bitsUsed = 0;
    for (let k = 0; k < Math.min(n, slots); k++) { v = (v << BigInt(cb)) | vals[k]; bitsUsed += cb; }
    while (bitsUsed + cb <= fieldBits) { v = (v << BigInt(cb)) | fill; bitsUsed += cb; }
    v <<= BigInt(fieldBits - bitsUsed);
  } else {
    // cadré à droite : remplissage puis caractères
    const take = vals.slice(Math.max(0, n - slots));
    const pad = slots - take.length;
    for (let k = 0; k < pad; k++) v = (v << BigInt(cb)) | fill;
    for (const x of take) v = (v << BigInt(cb)) | x;
  }
  return v & ((1n << BigInt(fieldBits)) - 1n);
}

/**
 * Données caractère -> mots (DATA, LIT, littéraux).
 * @returns tableau de BigInt (mots de `ctx.wordBits` bits)
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
 * Lit une donnée (item de DATA/LIT, ou littéral après '=').
 * @returns { words: BigInt[] (déjà en complément si signe -), kind }
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
    // nType… ou nombre ou 0#hex
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
    if (d === '' || d === ' ' || d === ',') throw new AsmError('A', 'délimiteur de chaîne manquant');
    let str = '';
    while (cur.peek() !== d) {
      if (cur.eof()) throw new AsmError('A', 'délimiteur de fin de chaîne manquant');
      str += cur.next();
    }
    cur.next();
    words = charDataWords(str, c, ctx);
    kind = 'char';
  } else if (cur.atSubEnd()) {
    return { words: [], kind: 'empty' };
  } else {
    throw new AsmError('A', `donnée incorrecte « ${c} »`);
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
  if (literal && words.length === 0) throw new AsmError('A', 'littéral vide');
  return { words, kind };
}

// --------------------------------------------------------- expressions

/**
 * Évalue une expression à partir du curseur, jusqu'à ',' ' ' ou fin.
 * ctx :
 *   asm        assembleur (symboles, compteurs, littéraux)
 *   fieldBits  taille du champ destination (constantes caractère)
 *   regs       true si les désignateurs de registre CPU sont reconnus
 *   stop       ensemble de caractères d'arrêt supplémentaires (ex. '/' pour VFD)
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
      throw new AsmError('A', 'OU exclusif sur une valeur relogeable');
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
      // Registre combiné par * ou / avec un autre registre : forme BXi Xj*Xk
      if (rhs.regs.length && !rhs.hasQ && acc.regs.length && !acc.hasQ) {
        acc.regs.push(...rhs.regs);
        continue;
      }
      throw new AsmError('A', 'registre dans un produit');
    }
    const relA = acc.isRelocatable() || acc.isExternal();
    const relB = rhs.isRelocatable() || rhs.isExternal();
    if (c === '*') {
      if (relA && relB) throw new AsmError('A', 'deux éléments relogeables dans un terme');
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
      if (relA || relB) throw new AsmError('A', 'division d\'un élément relogeable');
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

/** Désignateur de registre en position courante, ou null. */
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
  // Élément vide
  if (c === '' || c === ' ' || c === ',' || c === '+' || c === '-' || c === '&' || (c === '/' && !isQualStart(cur)) || (ctx.stop && ctx.stop.has(c))) {
    if (c === '*') return parseSpecial(cur, ctx); // jamais atteint
    return new Val(0n);
  }
  // Registre
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
      // =Ssym, =Xsym, =Ysym — mais « =X… » peut aussi être un littéral ? Non : X n'est pas un type.
      cur.i += 2;
      const name = readSymbolName(cur);
      if (!name) throw new AsmError('A', `pas de symbole après =${p}`);
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
    // /qual/sym ou //sym
    cur.next();
    let q = '';
    while (cur.peek() !== '/' && isSymbolChar(cur.peek())) q += cur.next();
    if (cur.peek() !== '/') throw new AsmError('A', 'qualificatif mal formé');
    cur.next();
    const name = readSymbolName(cur);
    const v = asm.symbolValue(name, q, { ctx });
    v.hasQ = true;
    return v;
  }
  if (isSymbolChar(c) && c !== '$' && c !== '=' && c !== ':') {
    const name = readSymbolName(cur);
    if (name.length > 8) throw new AsmError('A', `symbole trop long : ${name}`);
    const v = asm.symbolValue(name, null, { ctx });
    v.hasQ = true;
    return v;
  }
  throw new AsmError('A', `élément incorrect « ${c} »`);
}

function isQualStart(cur) {
  // « /Q/SYM » ou « //SYM » en position d'élément
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
    // le / termine un symbole
    if (cur.peek() === '/') break;
    s += cur.next();
  }
  return s;
}

/** Constante dans une expression (commence par un chiffre). */
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
    // extension de signe à 60 bits depuis le champ
    if (fb < 60 && (w >> BigInt(fb - 1)) & 1n) w |= M60 ^ ((1n << BigInt(fb)) - 1n);
    v = new Val(w);
  } else {
    const r = parseNumeric(cur, ctx, null, false);
    v = new Val(r.words[0] & M60);
  }
  v.hasQ = true;
  return v;
}

/** La valeur tient-elle dans n bits (bits hauts tous à 0 ou tous à 1) ? */
export function fitsBits(w, n) {
  if (n >= 60) return true;
  const hi = w >> BigInt(n);
  const all = M60 >> BigInt(n);
  if (hi === 0n || hi === all) return true;
  // une valeur positive dont le bit n-1 vaut 1 est acceptée (ex. 777777B sur 18 bits)
  return false;
}

/** Tronque une valeur 60 bits à n bits. */
export function truncBits(w, n) {
  return w & ((1n << BigInt(n)) - 1n);
}

export { SIGN60, signed60 };
