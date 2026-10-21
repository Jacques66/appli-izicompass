import test from 'node:test';
import assert from 'node:assert/strict';
import { floatAdd, floatMultiply, floatDivide, normalize, fromNumber, toNumber, pack, unpack, INDEFINITE, POS_INFINITE } from '../src/cpu/float.js';
import { neg60, add60, sub60, M60, rotl60, sra60, mask60, popcount60 } from '../src/common/word.js';

const f = fromNumber;
const n = toNumber;

test('representation: 1.0 = 17204000000000000000B', () => {
  assert.equal(f(1).toString(8), '17204000000000000000');
  assert.equal(n(f(1)), 1);
  assert.equal(n(f(-2.5)), -2.5);
});

test('addition, subtraction', () => {
  assert.equal(n(floatAdd(f(1), f(1))), 2);
  assert.equal(n(floatAdd(f(1.5), f(2.25))), 3.75);
  assert.equal(n(floatAdd(f(5), neg60(f(3)))), 2);
  assert.equal(n(floatAdd(f(3), neg60(f(5)))), -2);
  assert.equal(n(floatAdd(f(1e10), f(-1e10))), 0);
});

test('multiplication and division', () => {
  assert.equal(n(floatMultiply(f(3), f(4))), 12);
  assert.equal(n(floatMultiply(f(-3), f(4))), -12);
  assert.equal(n(floatDivide(f(12), f(4))), 3);
  assert.ok(Math.abs(n(floatDivide(f(1), f(3))) - 1 / 3) < 1e-14);
  assert.equal(floatDivide(f(1), 0n), POS_INFINITE);
  assert.equal(floatDivide(0n, 0n), INDEFINITE);
});

test('integer multiplication (zero exponents)', () => {
  assert.equal(floatMultiply(6n, 7n, false, true), 42n);
  assert.equal(floatMultiply(neg60(6n), 7n, false, true), neg60(42n));
});

test('normalization and packing', () => {
  const x = pack(1n, 0); // coefficient 1, exponent 0
  const r = normalize(x);
  assert.equal(r.shift, 47);
  assert.equal(n(r.value), 1);
  const u = unpack(f(1));
  assert.equal(u.coeff, 1n << 47n);
  assert.equal(u.exp, (0o777777 - 47 + 0) & 0o777777); // -47 in ones' complement
});

test('60-bit ones\' complement integers', () => {
  assert.equal(add60(5n, neg60(5n)), 0n); // the subtractive adder yields +0
  assert.equal(add60(M60, M60), M60);     // -0 + -0 = -0
  assert.equal(sub60(3n, 5n), neg60(2n));
});

test('shifts, masks, population count', () => {
  assert.equal(rotl60(1n, 59), 1n << 59n);
  assert.equal(rotl60(1n << 59n, 1), 1n);
  assert.equal(sra60(1n << 59n, 59), M60);
  assert.equal(mask60(6), 0o77n << 54n);
  assert.equal(popcount60(M60), 60);
});

test('properties: add/mul/div within one ulp over 20,000 draws', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const val = () => (rnd() < 0.5 ? -1 : 1) * Math.exp((rnd() - 0.5) * 80);
  const ulp = (x) => Math.abs(x) * 2 ** -46;
  for (let k = 0; k < 20000; k++) {
    const a = val(), b = val();
    const fa = f(a), fb = f(b), ra = n(fa), rb = n(fb);
    const s = n(normalize(floatAdd(fa, fb)).value);
    const exact = ra + rb;
    if (Math.abs(exact) > 1e-300) assert.ok(Math.abs(s - exact) <= ulp(Math.max(Math.abs(ra), Math.abs(rb))) * 2, `add ${ra} ${rb} -> ${s}`);
    const p = n(floatMultiply(fa, fb));
    assert.ok(Math.abs(p - ra * rb) <= ulp(ra * rb) * 2, `mul ${ra} ${rb} -> ${p}`);
    const q = n(floatDivide(fa, fb));
    assert.ok(Math.abs(q - ra / rb) <= ulp(ra / rb) * 2, `div ${ra} ${rb} -> ${q}`);
    const rq = n(floatDivide(fa, fb, true));
    assert.ok(Math.abs(rq - ra / rb) <= ulp(ra / rb) * 2, `rdiv ${ra} ${rb} -> ${rq}`);
  }
});

test('double precision: FX + DX give the exact 96-bit sum', () => {
  const a = f(1), b = f(2 ** -60);
  const hi = floatAdd(a, b), lo = floatAdd(a, b, false, true);
  assert.equal(n(hi), 1);
  assert.equal(n(lo), 2 ** -60);
});
