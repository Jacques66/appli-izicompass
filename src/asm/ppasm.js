// Assembly of PP instructions (12 bits).

import { Cursor, AsmError, parseExpression } from './expr.js';
import { signed60 } from '../common/word.js';

/** Splits the variable field into expression subfields. */
export function ppSubfields(asm, entry) {
  const img = entry.img;
  const out = [];
  let pos = entry.f.varPos;
  if (pos < 0) return out;
  for (;;) {
    const cur = new Cursor(img, pos);
    const start = cur.i;
    // scan the expression to find its end (without evaluating symbols)
    try {
      parseExpression(cur, asm.ctxFor(entry, { noUndefError: true, fieldBits: 12, noRef: true }));
    } catch (e) {
      while (!cur.atSubEnd()) cur.next();
    }
    out.push(img.slice(start, cur.i));
    if (cur.peek() === ',') { pos = cur.i + 1; continue; }
    break;
  }
  return out;
}

function evalField(asm, entry, text, bits, pass) {
  if (pass === 1) return 0n;
  const ctx = asm.ctxFor(entry, { fieldBits: bits });
  const cur = new Cursor(text, 0);
  const v = parseExpression(cur, ctx);
  if (!cur.atSubEnd()) throw new AsmError('A', `incorrect expression: ${text}`);
  asm.checkReloc(v);
  return v;
}

/** Assembles a PP instruction (pass 1: space; pass 2: value). */
export function assemblePpInstruction(asm, entry, def, pass) {
  asm.prepareCode(entry);
  const loc = entry.f.loc;
  if (loc && loc !== '+' && loc !== '-') asm.defineLocation(entry);
  const subs = ppSubfields(asm, entry);
  const fmt = def.fmt;
  const code = def.code;
  const word1 = (d) => BigInt(((code & 0o77) << 6) | (d & 0o77));
  const n = (k) => (subs[k] === undefined || subs[k] === '' ? null : subs[k]);
  const num = (k, bits) => {
    const t = n(k);
    if (t === null) return 0n;
    const v = evalField(asm, entry, t, bits, pass);
    if (pass === 1) return 0n;
    return asm.finalize(v, bits, entry).w;
  };
  if (def.error) {
    asm.emitBits(12, 0n, null);
    asm.emitBits(12, 0n, null);
    return;
  }
  switch (fmt) {
    case 'none': {
      if (subs.length && pass === 2) asm.flag(entry, '8', 'extra subfield');
      asm.emitBits(12, BigInt(def.fixed ?? (code << 6)), null);
      return;
    }
    case 'optd': {
      const d = Number(num(0, 6)) & 7;
      asm.emitBits(12, word1((def.base || 0) | d), null);
      return;
    }
    case 'd': {
      if (n(0) === null && pass === 2) asm.flag(entry, '8', 'missing subfield');
      let d = Number(num(0, 6));
      if (subs.length > 1 && pass === 2) asm.flag(entry, '8', 'extra subfield');
      asm.emitBits(12, word1(d), null);
      return;
    }
    case 'rel': {
      let d = 0;
      if (pass === 2) {
        const t = n(0);
        if (t === null) throw new AsmError('8', 'missing jump address');
        const v = evalField(asm, entry, t, 12, pass);
        const fin = asm.finalize(v, 60, entry, { signedField: false });
        const target = Number(signed60(fin.w));
        const lc = Number(asm.finalize(asm.locationValue(), 60, entry).w);
        let r;
        if (!asm.ppJ && target >= -31 && target <= 31) r = target;
        else r = target - lc;
        if (r < -31 || r > 31) throw new AsmError('A', 'relative jump out of range (-31..+31)');
        d = r >= 0 ? r : 0o77 + r;
      }
      asm.emitBits(12, word1(d), null);
      return;
    }
    case 'shift': {
      let d = 0;
      if (pass === 2) {
        const t = n(0);
        const v = t === null ? null : evalField(asm, entry, t, 12, pass);
        let r = v ? v.num() : 0;
        if (r < -31 || r > 31) throw new AsmError('A', 'shift count out of range (-31..+31)');
        d = r >= 0 ? r : 0o77 + r;
      }
      asm.emitBits(12, word1(d), null);
      return;
    }
    case 'c18': {
      const c = num(0, 18);
      asm.emitBits(12, word1(Number(c >> 12n)), null);
      asm.emitBits(12, c & 0o7777n, null);
      return;
    }
    case 'md':
    case 'mdr': {
      const m = num(0, 12);
      let d = 0;
      if (n(1) === null) {
        if (fmt === 'mdr' && pass === 2) asm.flag(entry, '8', 'second subfield required');
      } else d = Number(num(1, 6));
      if (def.flag) d = (d & 0o37) | def.flag;
      asm.emitBits(12, word1(d), null);
      asm.emitBits(12, m, null);
      return;
    }
    default:
      throw new AsmError('O', `unknown PP format ${fmt}`);
  }
}
