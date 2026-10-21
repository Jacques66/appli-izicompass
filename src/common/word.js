// CDC 6000 word arithmetic: 60 bits (BigInt), 18 and 12 bits (Number).
// All 6600 integer arithmetic is ones' complement, performed by a
// subtractive adder: a + b = a - (~b). This scheme never produces -0
// unless both operands are -0.

export const M60 = (1n << 60n) - 1n;
export const M48 = (1n << 48n) - 1n;
export const SIGN60 = 1n << 59n;
export const NEG_ZERO60 = M60;

export const M18 = 0o777777;
export const SIGN18 = 0o400000;
export const M12 = 0o7777;
export const M6 = 0o77;

/** Mask of n bits (BigInt). */
export function maskN(n) {
  return (1n << BigInt(n)) - 1n;
}

/** 60-bit ones' complement addition (subtractive adder). */
export function add60(a, b) {
  let r = a - (~b & M60);
  if (r < 0n) r -= 1n;
  return r & M60;
}

/** 60-bit ones' complement subtraction. */
export function sub60(a, b) {
  let r = a - b;
  if (r < 0n) r -= 1n;
  return r & M60;
}

/** 60-bit complement (ones' complement negation). */
export function neg60(a) {
  return ~a & M60;
}

/** 18-bit ones' complement addition. */
export function add18(a, b) {
  let r = (a & M18) - (~b & M18);
  if (r < 0) r -= 1;
  return r & M18;
}

/** 18-bit ones' complement subtraction. */
export function sub18(a, b) {
  let r = (a & M18) - (b & M18);
  if (r < 0) r -= 1;
  return r & M18;
}

/** 12-bit ones' complement addition. */
export function add12(a, b) {
  let r = (a & M12) - (~b & M12);
  if (r < 0) r -= 1;
  return r & M12;
}

/** 18-bit ones' complement value -> signed JS integer (-0 -> 0). */
export function signed18(v) {
  v &= M18;
  return v & SIGN18 ? -(~v & M18) : v;
}

/** 12-bit ones' complement value -> signed JS integer. */
export function signed12(v) {
  v &= M12;
  return v & 0o4000 ? -(~v & M12) : v;
}

/** 60-bit ones' complement value -> signed BigInt. */
export function signed60(v) {
  v &= M60;
  return v & SIGN60 ? -(~v & M60) : v;
}

/** Signed JS integer -> 18-bit ones' complement. */
export function to18(n) {
  return n < 0 ? ~(-n) & M18 : n & M18;
}

/** Signed JS integer -> 12-bit ones' complement. */
export function to12(n) {
  return n < 0 ? ~(-n) & M12 : n & M12;
}

/** Signed BigInt -> 60-bit ones' complement. */
export function to60(n) {
  n = BigInt(n);
  return n < 0n ? ~(-n) & M60 : n & M60;
}

/** Sign extension 18 -> 60 bits. */
export function sext18to60(v) {
  v &= M18;
  return v & SIGN18 ? (BigInt(v) | (M60 ^ BigInt(M18))) : BigInt(v);
}

/** Is this zero (+0 or -0) in ones' complement? */
export function isZero60(v) {
  return v === 0n || v === M60;
}

/** Formats a word in octal on n digits. */
export function oct(v, digits) {
  const s = (typeof v === 'bigint' ? v : BigInt(v)).toString(8);
  return digits ? s.padStart(digits, '0') : s;
}

/** Formats a 60-bit word as 20 octal digits, optionally grouped by 5. */
export function oct60(v, grouped = false) {
  const s = (v & M60).toString(8).padStart(20, '0');
  return grouped ? `${s.slice(0, 5)} ${s.slice(5, 10)} ${s.slice(10, 15)} ${s.slice(15)}` : s;
}

/** 15-bit parcel n (0 = the highest) of a word. */
export function parcel(word, n) {
  return Number((word >> BigInt(45 - 15 * n)) & 0x7fffn);
}

/** Population count (number of one bits) of a 60-bit word. */
export function popcount60(v) {
  let c = 0;
  let hi = Number(v >> 30n) & 0x3fffffff;
  let lo = Number(v & 0x3fffffffn);
  while (hi) { hi &= hi - 1; c++; }
  while (lo) { lo &= lo - 1; c++; }
  return c;
}

/** Left circular shift by n (0..63, reduced modulo 60 like the hardware). */
export function rotl60(v, n) {
  n &= 0o77;
  if (n >= 60) n -= 60;
  if (n === 0) return v & M60;
  const b = BigInt(n);
  return ((v << b) | (v >> (60n - b))) & M60;
}

/** Right arithmetic shift by n (0..63; 60 and above yield the sign). */
export function sra60(v, n) {
  n &= 0o77;
  if (n > 60) n = 60;
  const neg = (v & SIGN60) !== 0n;
  let r = (v & M60) >> BigInt(n);
  if (neg && n > 0) r |= M60 ^ (M60 >> BigInt(n));
  return r & M60;
}

/** Mask of n one bits starting at bit 59 (MX instruction). */
export function mask60(n) {
  if (n > 60) n = 60;
  if (n === 0) return 0n;
  return M60 ^ (M60 >> BigInt(n));
}
