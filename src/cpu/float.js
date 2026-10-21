// CDC 6600 floating-point unit.
//
// Format: bit 59 sign, bits 58-48 biased exponent (2000B), bits 47-0 integer
// coefficient; a negative number is the ones' complement of the positive number.
// Exponent (after sign folding): 3777B = infinite (out of range), 1777B = indefinite.
// A biased exponent of 0000 denotes underflow (treated as zero in
// multiplication and division).
//
// The algorithms follow the hardware data path: 98-bit ones' complement
// adder with end-around carry, round bits inserted the way the 6600
// does it, 48x48 -> 96-bit multiplication, division by successive
// subtractions with 1/3 injection for rounded division.

import { M60, M48, SIGN60 } from '../common/word.js';

const M50 = (1n << 50n) - 1n;
const SIGN48 = 1n << 47n;
const EXP_IND = 0o1777;
const EXP_INF = 0o3777;
export const INDEFINITE = BigInt(EXP_IND) << 48n;
export const POS_INFINITE = BigInt(EXP_INF) << 48n;
export const NEG_INFINITE = 0o4000n << 48n;

const signOf = (v) => ((v & SIGN60) !== 0n ? M60 : 0n);
const inRange = (e) => (e & EXP_IND) !== EXP_IND;
const overflow = (sign) => (sign ? NEG_INFINITE : POS_INFINITE);
// Biased exponent (11 bits) -> signed integer.
const unbias = (e) => (e >= 0o2000 ? e - 0o2000 : e - 0o1777);
// Signed integer -> biased exponent (may be negative = underflow).
const rebias = (e) => (e >= 0 ? e + 0o2000 : e + 0o1777);

/** Model options: `cyber175` enables the 175 floating-point unit variants. */
export const floatOptions = { cyber175: false };

/**
 * Floating add (FX, RX rounded, DX double precision).
 * For subtraction, call with the complement of the second operand.
 */
export function floatAdd(a, b, round = false, double = false) {
  let s1 = signOf(a);
  let s2 = signOf(b);
  a ^= s1;
  b ^= s2;
  let e1 = Number(a >> 48n);
  let e2 = Number(b >> 48n);

  if (!inRange(e1)) {
    if (e1 === EXP_IND || e2 === EXP_IND || (e2 === EXP_INF && s1 !== s2)) return INDEFINITE;
    return overflow(s1);
  }
  if (!inRange(e2)) {
    if (e2 === EXP_IND) return INDEFINITE;
    return overflow(s2);
  }
  e1 = unbias(e1);
  e2 = unbias(e2);

  // Round bit: present if both operands are normalized or of opposite signs.
  const roundBits = round ? ((a & b) | (s1 ^ s2)) : 0n;
  const ext1 = s1 >> 10n; // sign extension to 50 bits
  const ext2 = s2 >> 10n;

  // The larger exponent goes into the 98-bit register (50 upper + 48 lower).
  let upper, lower, small, extSmall, shift, exp;
  if (e1 > e2) {
    upper = (a & M48) ^ ext1;
    small = b & M48;
    lower = ext1 >> 2n;
    extSmall = ext2;
    shift = e1 - e2;
    exp = e1;
  } else {
    upper = (b & M48) ^ ext2;
    small = a & M48;
    lower = ext2 >> 2n;
    extSmall = ext1;
    shift = e2 - e1;
    exp = e2;
  }
  if (round) lower ^= SIGN48;
  const extSmall48 = extSmall >> 2n;

  if (shift < 48) {
    const sh = BigInt(shift);
    upper += (small >> sh) ^ extSmall;
    let low = (small << (48n - sh)) & M48;
    if (round) low |= (roundBits & SIGN48) >> sh;
    lower += low ^ extSmall48;
  } else if (shift < 96) {
    upper += extSmall;
    lower += (small >> BigInt(shift - 48)) ^ extSmall48;
  } else {
    upper += extSmall;
    lower += extSmall48;
  }

  // Carry propagation lower -> upper, then end-around carry (ones' complement).
  upper += lower >> 48n;
  lower &= M48;
  lower += (upper + ((lower + 1n) >> 48n)) >> 50n;
  upper += lower >> 48n;
  upper &= M50;
  lower &= M48;

  const sign = (upper >> 49n) & 1n ? M60 : 0n;
  upper ^= sign >> 10n;
  lower ^= sign >> 12n;

  if (double) {
    if (floatOptions.cyber175 && exp < -0o1717) return 0n;
    if (upper >> 48n) {
      lower = ((upper & 1n) << 47n) | (lower >> 1n);
      exp += 1;
    }
    if (exp < -0o1717) return 0n;
    exp = rebias(exp - 48);
    return ((BigInt(exp) << 48n) | (lower & M48)) ^ sign;
  }
  if (upper >> 48n) {
    upper >>= 1n;
    exp += 1;
  }
  exp = rebias(exp);
  return ((BigInt(exp) << 48n) | upper) ^ sign;
}

/**
 * Floating multiply (FX, RX rounded, DX double precision).
 * If both exponents are zero and one operand is not normalized, this is
 * an integer multiply (IX Xj*Xk on machines that support it).
 */
export function floatMultiply(a, b, round = false, double = false) {
  let s1 = signOf(a);
  const s2 = signOf(b);
  a ^= s1;
  b ^= s2;
  const sign = s1 ^ s2;
  let e1 = Number(a >> 48n);
  let e2 = Number(b >> 48n);

  if (!inRange(e1)) {
    if (e1 === EXP_IND || e2 === EXP_IND || e2 === 0) return INDEFINITE;
    return overflow(sign);
  }
  if (!inRange(e2)) {
    if (e2 === EXP_IND || e1 === 0) return INDEFINITE;
    return overflow(sign);
  }
  a &= M48;
  b &= M48;
  const norm = ((a & b) >> 47n) !== 0n; // both operands normalized

  const product = a * b + (round ? 1n << 46n : 0n);
  let upper = product >> 48n;
  let lower = product & ((1n << 48n) - 1n);

  if (double) {
    if (!norm && e1 === 0 && e2 === 0) return (lower & M48) ^ sign;
    if (e1 === 0 || e2 === 0) return 0n;
    let exp = unbias(e1) + unbias(e2);
    if (floatOptions.cyber175) {
      if (exp > 0o1777) return overflow(sign);
      if (exp <= -0o1777) return 0n;
    }
    if (norm && !(upper >> 47n)) {
      lower <<= 1n;
      exp -= 1;
    }
    if (exp > 0o1777) return overflow(sign);
    exp = rebias(exp);
    if (exp < 0) return 0n;
    return ((BigInt(exp) << 48n) | (lower & M48)) ^ sign;
  }

  if (!norm && e1 === 0 && e2 === 0) return upper ^ sign;
  if (e1 === 0 || e2 === 0) return 0n;
  let exp = unbias(e1) + unbias(e2);
  if (floatOptions.cyber175) {
    if (exp + 48 > 0o1777) return overflow(sign);
    if (exp + 48 <= -0o1777) return 0n;
  }
  if (norm && !(upper >> 47n)) {
    upper = (upper << 1n) | ((lower >> 47n) & 1n);
    exp -= 1;
  }
  if (exp > 0o1717) return overflow(sign);
  exp = rebias(exp + 48);
  if (exp < 0) return 0n;
  return ((BigInt(exp) << 48n) | upper) ^ sign;
}

/**
 * Floating divide (FX, RX rounded). The divisor must be normalized;
 * a dividend >= 2 x divisor yields indefinite.
 */
export function floatDivide(a, b, round = false) {
  const s1 = signOf(a);
  const s2 = signOf(b);
  a ^= s1;
  b ^= s2;
  let e1 = Number(a >> 48n);
  let e2 = Number(b >> 48n);
  const sign = s1 ^ s2;

  if (!inRange(e1)) {
    if (e1 === EXP_IND || e2 === EXP_IND || e2 === EXP_INF) return INDEFINITE;
    return overflow(sign);
  }
  if (!inRange(e2)) {
    if (e2 === EXP_IND) return INDEFINITE;
    return 0n;
  }
  if (e1 === 0 || e2 === 0) {
    if (e1) return overflow(sign);
    if (e2) return 0n;
    return INDEFINITE;
  }
  a &= M48;
  b &= M48;
  if (a >= b << 1n) return INDEFINITE;

  let exp = unbias(e1) - unbias(e2);
  let roundBit = 0n;
  if (a < b) {
    a <<= 1n;
    exp -= 1;
    if (round) roundBit = 1n;
  }
  if (exp > 0o2056) return overflow(sign);
  exp = rebias(exp - 47);
  if (exp < 0) return 0n;

  let q = 0n;
  for (let i = 0; i < 48; i++) {
    q <<= 1n;
    if (a >= b) {
      a -= b;
      q += 1n;
    }
    if (round) {
      a = (a << 1n) | roundBit;
      roundBit ^= 1n;
    } else {
      a <<= 1n;
    }
  }
  return ((BigInt(exp) << 48n) | q) ^ sign;
}

/**
 * Normalize (NX) or round and normalize (ZX).
 * Returns { value, shift }: shift is the number of positions shifted.
 */
export function normalize(x, round = false) {
  x &= M60;
  const sign = signOf(x);
  x ^= sign;
  let coeff = x & M48;
  let exp = Number(x >> 48n) & 0o7777;

  if ((exp & EXP_IND) === EXP_IND) return { value: x ^ sign, shift: 0 };
  if (!round && coeff === 0n) return { value: 0n, shift: 48 };

  let count = 0;
  while (count < 48 && !(coeff & SIGN48)) {
    coeff = (coeff << 1n) | (round && count === 0 ? 1n : 0n);
    count++;
  }
  exp = rebias(unbias(exp) - count);
  const value = exp < 0 ? 0n : (((BigInt(exp) << 48n) & (0o7777n << 48n)) | (coeff & M48)) ^ sign;
  return { value, shift: count };
}

/** Unpack (UX): returns { coeff, exp } with exp as 18-bit ones' complement. */
export function unpack(x) {
  const sign = signOf(x);
  x ^= sign;
  const exp = (Number(x >> 48n) - 0o2000) & 0o777777;
  return { coeff: (x & M48) ^ sign, exp };
}

/** Pack (PX): coefficient Xk and exponent Bj (18 bits) -> floating-point number. */
export function pack(coeff, exp) {
  const sign = signOf(coeff);
  coeff ^= sign;
  const e = (exp ^ 0o2000) & 0o3777;
  return ((BigInt(e) << 48n) | (coeff & M48)) ^ sign;
}

/** Operand classification: 'infinite', 'indefinite' or null. */
export function classify(x) {
  const e = Number((x >> 48n) & 0o7777n);
  if (e === 0o3777 || e === 0o4000) return 'infinite';
  if (e === 0o1777 || e === 0o6000) return 'indefinite';
  return null;
}

// ---------------------------------------------------------------------------
// Conversions with host floating-point numbers (for the IDE and the assembler).

/** JS number -> normalized CDC floating-point (single precision). */
export function fromNumber(v) {
  if (Number.isNaN(v)) return INDEFINITE;
  if (!Number.isFinite(v)) return v < 0 ? NEG_INFINITE : POS_INFINITE;
  if (v === 0) return 0n;
  const neg = v < 0;
  let m = Math.abs(v);
  // Exponent such that coeff = m / 2^e lies in [2^47, 2^48).
  let e = Math.floor(Math.log2(m)) - 47;
  let c = m / 2 ** e;
  while (c >= 2 ** 48) { c /= 2; e++; }
  while (c < 2 ** 47) { c *= 2; e--; }
  let coeff = BigInt(Math.floor(c));
  if (e > 0o1776) return neg ? NEG_INFINITE : POS_INFINITE;
  if (e < -0o1776) return 0n;
  const w = (BigInt(rebias(e)) << 48n) | coeff;
  return neg ? ~w & M60 : w;
}

/** CDC floating-point -> JS number (IEEE double precision approximation). */
export function toNumber(x) {
  const cls = classify(x);
  if (cls === 'infinite') return x & SIGN60 ? -Infinity : Infinity;
  if (cls === 'indefinite') return NaN;
  const sign = signOf(x);
  const a = x ^ sign;
  const e = unbias(Number(a >> 48n));
  const c = Number(a & M48);
  const v = c * 2 ** e;
  return sign ? -v : v;
}

/** Double precision (upper/lower pair) -> JS number. */
export function toNumberDouble(hi, lo) {
  return toNumber(hi) + toNumber(lo);
}
