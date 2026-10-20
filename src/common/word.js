// Arithmétique des mots CDC 6000 : 60 bits (BigInt), 18 et 12 bits (Number).
// Toute l'arithmétique entière du 6600 est en complément à un, réalisée par
// un additionneur soustractif : a + b = a - (~b). Ce schéma ne produit jamais
// de -0 sauf si les deux opérandes valent -0.

export const M60 = (1n << 60n) - 1n;
export const M48 = (1n << 48n) - 1n;
export const SIGN60 = 1n << 59n;
export const NEG_ZERO60 = M60;

export const M18 = 0o777777;
export const SIGN18 = 0o400000;
export const M12 = 0o7777;
export const M6 = 0o77;

/** Masque de n bits (BigInt). */
export function maskN(n) {
  return (1n << BigInt(n)) - 1n;
}

/** Addition 60 bits en complément à un (additionneur soustractif). */
export function add60(a, b) {
  let r = a - (~b & M60);
  if (r < 0n) r -= 1n;
  return r & M60;
}

/** Soustraction 60 bits en complément à un. */
export function sub60(a, b) {
  let r = a - b;
  if (r < 0n) r -= 1n;
  return r & M60;
}

/** Complément (négation en complément à un) 60 bits. */
export function neg60(a) {
  return ~a & M60;
}

/** Addition 18 bits en complément à un. */
export function add18(a, b) {
  let r = (a & M18) - (~b & M18);
  if (r < 0) r -= 1;
  return r & M18;
}

/** Soustraction 18 bits en complément à un. */
export function sub18(a, b) {
  let r = (a & M18) - (b & M18);
  if (r < 0) r -= 1;
  return r & M18;
}

/** Addition 12 bits en complément à un. */
export function add12(a, b) {
  let r = (a & M12) - (~b & M12);
  if (r < 0) r -= 1;
  return r & M12;
}

/** Valeur 18 bits complément à un -> entier JS signé (-0 -> 0). */
export function signed18(v) {
  v &= M18;
  return v & SIGN18 ? -(~v & M18) : v;
}

/** Valeur 12 bits complément à un -> entier JS signé. */
export function signed12(v) {
  v &= M12;
  return v & 0o4000 ? -(~v & M12) : v;
}

/** Valeur 60 bits complément à un -> BigInt signé. */
export function signed60(v) {
  v &= M60;
  return v & SIGN60 ? -(~v & M60) : v;
}

/** Entier JS signé -> 18 bits complément à un. */
export function to18(n) {
  return n < 0 ? ~(-n) & M18 : n & M18;
}

/** Entier JS signé -> 12 bits complément à un. */
export function to12(n) {
  return n < 0 ? ~(-n) & M12 : n & M12;
}

/** BigInt signé -> 60 bits complément à un. */
export function to60(n) {
  n = BigInt(n);
  return n < 0n ? ~(-n) & M60 : n & M60;
}

/** Extension de signe 18 -> 60 bits. */
export function sext18to60(v) {
  v &= M18;
  return v & SIGN18 ? (BigInt(v) | (M60 ^ BigInt(M18))) : BigInt(v);
}

/** Est-ce zéro (+0 ou -0) en complément à un ? */
export function isZero60(v) {
  return v === 0n || v === M60;
}

/** Formate un mot en octal sur n chiffres. */
export function oct(v, digits) {
  const s = (typeof v === 'bigint' ? v : BigInt(v)).toString(8);
  return digits ? s.padStart(digits, '0') : s;
}

/** Formate un mot de 60 bits en 20 chiffres octaux, groupés par 5 (option). */
export function oct60(v, grouped = false) {
  const s = (v & M60).toString(8).padStart(20, '0');
  return grouped ? `${s.slice(0, 5)} ${s.slice(5, 10)} ${s.slice(10, 15)} ${s.slice(15)}` : s;
}

/** Parcelle de 15 bits n (0 = la plus haute) d'un mot. */
export function parcel(word, n) {
  return Number((word >> BigInt(45 - 15 * n)) & 0x7fffn);
}

/** Population (nombre de bits à 1) d'un mot 60 bits. */
export function popcount60(v) {
  let c = 0;
  let hi = Number(v >> 30n) & 0x3fffffff;
  let lo = Number(v & 0x3fffffffn);
  while (hi) { hi &= hi - 1; c++; }
  while (lo) { lo &= lo - 1; c++; }
  return c;
}

/** Rotation circulaire à gauche de n (0..63, réduit modulo 60 comme le matériel). */
export function rotl60(v, n) {
  n &= 0o77;
  if (n >= 60) n -= 60;
  if (n === 0) return v & M60;
  const b = BigInt(n);
  return ((v << b) | (v >> (60n - b))) & M60;
}

/** Décalage arithmétique à droite de n (0..63, 60 et plus donnent le signe). */
export function sra60(v, n) {
  n &= 0o77;
  if (n > 60) n = 60;
  const neg = (v & SIGN60) !== 0n;
  let r = (v & M60) >> BigInt(n);
  if (neg && n > 0) r |= M60 ^ (M60 >> BigInt(n));
  return r & M60;
}

/** Masque de n bits à 1 en partant du bit 59 (instruction MX). */
export function mask60(n) {
  if (n > 60) n = 60;
  if (n === 0) return 0n;
  return M60 ^ (M60 >> BigInt(n));
}
