// Désassembleur CPU 6600 en syntaxe COMPASS.

import { instructionLength } from './cpu.js';

const o = (n) => (n > 7 ? `${n.toString(8)}B` : String(n));

/** Constante K 18 bits : négatif en complément à un affiché « -n ». */
function kval(K) {
  if (K & 0o400000) {
    const n = ~K & 0o777777;
    return { neg: true, text: o(n) };
  }
  return { neg: false, text: o(K) };
}

function addrForm(base, K, label) {
  // base : 'A1', 'B0', 'X2'… ; K : constante
  if (label) return base === 'B0' ? label : `${base}+${label}`;
  const k = kval(K);
  if (base === 'B0') return k.neg ? `-${k.text}` : k.text;
  if (K === 0) return base;
  return k.neg ? `${base}-${k.text}` : `${base}+${k.text}`;
}

const BOOL = ['BX# Xj', 'BX# Xj*Xk', 'BX# Xj+Xk', 'BX# Xj-Xk', 'BX# -Xk', 'BX# -Xk*Xj', 'BX# -Xk+Xj', 'BX# -Xk-Xj'];
const COND = ['ZR', 'NZ', 'PL', 'NG', 'IR', 'OR', 'DF', 'ID'];
const FLOAT = ['FX# Xj+Xk', 'FX# Xj-Xk', 'DX# Xj+Xk', 'DX# Xj-Xk', 'RX# Xj+Xk', 'RX# Xj-Xk', 'IX# Xj+Xk', 'IX# Xj-Xk'];

/**
 * Désassemble une instruction.
 * @param parcels tableau de 4 parcelles du mot
 * @param n index de la parcelle de début
 * @param opts { symbol(addr) -> nom ou null, cmu }
 * @returns { text, length, mnemonic, operands }
 */
export function disasmInstruction(parcels, n, opts = {}) {
  const p = parcels[n];
  const fm = p >> 9, i = (p >> 6) & 7, j = (p >> 3) & 7, k = p & 7;
  const length = instructionLength(p, opts.cmu);
  let K = 0;
  if (length === 30) {
    if (n === 3) return { text: `** ${p.toString(8).padStart(5, '0')} (30 bits en parcelle 3)`, length: 15 };
    K = ((p & 7) << 15) | parcels[n + 1];
  }
  const sym = opts.symbol || (() => null);
  const lab = (a) => sym(a);
  const X = (r) => `X${r}`, A = (r) => `A${r}`, B = (r) => `B${r}`;
  let t;
  switch (fm) {
    case 0o00: t = 'PS'; break;
    case 0o01:
      switch (i) {
        case 0: t = `RJ ${lab(K) || o(K)}`; break;
        case 1: t = `RE ${addrForm(B(j), K)}`; break;
        case 2: t = `WE ${addrForm(B(j), K)}`; break;
        case 3: t = j === 0 && K === 0 ? 'XJ' : `XJ ${addrForm(B(j), K)}`; break;
        case 4: t = `RX${j} X${k}`; break;
        case 5: t = `WX${j} X${k}`; break;
        case 6: t = `RC X${j}`; break;
        default: t = `01${i}${j}${k}`;
      }
      break;
    case 0o02: t = `JP ${addrForm(B(i), K, i === 0 ? lab(K) : null)}`; break;
    case 0o03: t = `${COND[i]} X${j},${lab(K) || o(K)}`; break;
    case 0o04: case 0o05: case 0o06: case 0o07: {
      const mn = ['EQ', 'NE', 'GE', 'LT'][fm - 4];
      const target = lab(K) || o(K);
      if (fm === 0o04 && i === 0 && j === 0) t = `EQ ${target}`;
      else if (j === 0) t = `${['ZR', 'NZ', 'PL', 'NG'][fm - 4]} B${i},${target}`;
      else t = `${mn} B${i},B${j},${target}`;
      break;
    }
    case 0o10: case 0o11: case 0o12: case 0o13: case 0o14: case 0o15: case 0o16: case 0o17:
      t = BOOL[fm - 0o10].replace('#', i).replace('j', j).replace('k', k);
      break;
    case 0o20: t = `LX${i} ${o((j << 3) | k)}`; break;
    case 0o21: t = `AX${i} ${o((j << 3) | k)}`; break;
    case 0o22: t = `LX${i} B${j},X${k}`; break;
    case 0o23: t = `AX${i} B${j},X${k}`; break;
    case 0o24: t = `NX${i} B${j},X${k}`; break;
    case 0o25: t = `ZX${i} B${j},X${k}`; break;
    case 0o26: t = `UX${i} B${j},X${k}`; break;
    case 0o27: t = `PX${i} B${j},X${k}`; break;
    case 0o30: case 0o31: case 0o32: case 0o33: case 0o34: case 0o35: case 0o36: case 0o37:
      t = FLOAT[fm - 0o30].replace('#', i).replace('j', j).replace('k', k);
      break;
    case 0o40: t = `FX${i} X${j}*X${k}`; break;
    case 0o41: t = `RX${i} X${j}*X${k}`; break;
    case 0o42: t = `DX${i} X${j}*X${k}`; break;
    case 0o43: t = `MX${i} ${o((j << 3) | k)}`; break;
    case 0o44: t = `FX${i} X${j}/X${k}`; break;
    case 0o45: t = `RX${i} X${j}/X${k}`; break;
    case 0o46:
      if (length === 30 || (opts.cmu && i >= 4)) t = ['IM', 'DM', 'CC', 'CU'][i - 4] + ' (CMU)';
      else t = 'NO';
      break;
    case 0o47: t = `CX${i} X${k}`; break;
    default: {
      const grp = fm >> 3; // 5 = SA, 6 = SB, 7 = SX
      const dest = ['', '', '', '', '', 'SA', 'SB', 'SX'][grp] + i;
      const sub = fm & 7;
      switch (sub) {
        case 0: t = `${dest} ${addrForm(A(j), K)}`; break;
        case 1: t = `${dest} ${addrForm(B(j), K, j === 0 && grp === 5 ? lab(K) : null)}`; break;
        case 2: t = `${dest} ${addrForm(X(j), K)}`; break;
        case 3: t = k === 0 ? `${dest} X${j}` : `${dest} X${j}+B${k}`; break;
        case 4: t = k === 0 ? `${dest} A${j}` : `${dest} A${j}+B${k}`; break;
        case 5: t = `${dest} A${j}-B${k}`; break;
        case 6:
          if (j === 0 && k === 0) t = `${dest} B0`;
          else if (j === 0) t = `${dest} B${k}`;
          else if (k === 0) t = `${dest} B${j}`;
          else t = `${dest} B${j}+B${k}`;
          break;
        case 7: t = j === 0 ? `${dest} -B${k}` : `${dest} B${j}-B${k}`; break;
      }
    }
  }
  const op = t.split(' ');
  return { text: t, length, mnemonic: op[0], operands: op.slice(1).join(' '), fm, i, j, k, K };
}

/** Découpe un mot de 60 bits en parcelles. */
export function wordParcels(w) {
  const hi = Number(w >> 30n), lo = Number(w & 0x3fffffffn);
  return [hi >>> 15, hi & 0x7fff, lo >>> 15, lo & 0x7fff];
}

/** Désassemble un mot complet : liste d'instructions { parcel, text, length }. */
export function disasmWord(w, opts = {}) {
  const parcels = wordParcels(w);
  const out = [];
  let n = 0;
  while (n < 4) {
    const d = disasmInstruction(parcels, n, opts);
    out.push({ parcel: n, ...d });
    n += d.length === 30 ? 2 : 1;
    if (d.mnemonic === 'IM' || d.mnemonic === 'DM' || d.mnemonic === 'CC' || d.mnemonic === 'CU') break;
  }
  return out;
}

/** Octal d'une instruction (5 ou 10 chiffres). */
export function instructionOctal(parcels, n, length) {
  const a = parcels[n].toString(8).padStart(5, '0');
  return length === 30 ? a + parcels[n + 1].toString(8).padStart(5, '0') : a;
}
