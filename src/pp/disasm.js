// Désassembleur PP en syntaxe COMPASS.

const MN = [
  'PSN', 'LJM', 'RJM', 'UJN', 'ZJN', 'NJN', 'PJN', 'MJN',
  'SHN', 'LMN', 'LPN', 'SCN', 'LDN', 'LCN', 'ADN', 'SBN',
  'LDC', 'ADC', 'LPC', 'LMC', 'PSN', 'PSN', 'EXN', 'RPN',
  'LDD', 'ADD', 'SBD', 'LMD', 'STD', 'RAD', 'AOD', 'SOD',
  'LDI', 'ADI', 'SBI', 'LMI', 'STI', 'RAI', 'AOI', 'SOI',
  'LDM', 'ADM', 'SBM', 'LMM', 'STM', 'RAM', 'AOM', 'SOM',
  'CRD', 'CRM', 'CWD', 'CWM', 'AJM', 'IJM', 'FJM', 'EJM',
  'IAN', 'IAM', 'OAN', 'OAM', 'ACN', 'DCN', 'FAN', 'FNC',
];

export const PP_MNEMONICS = MN;

/** Instructions PP sur deux mots. */
export function ppIsLong(f) {
  return f === 0o01 || f === 0o02 || (f >= 0o20 && f <= 0o23) || (f >= 0o50 && f <= 0o57)
    || f === 0o61 || f === 0o63 || (f >= 0o64 && f <= 0o67) || f === 0o71 || f === 0o73 || f === 0o77;
}

const o = (n) => n.toString(8);

/**
 * Désassemble l'instruction en `addr` de la mémoire PP `mem`.
 * @returns { text, length (1 ou 2), mnemonic }
 */
export function disasmPP(mem, addr, opts = {}) {
  const w = mem[addr & 0o7777];
  const f = (w >> 6) & 0o77;
  const d = w & 0o77;
  const m = mem[(addr + 1) & 0o7777];
  const sym = opts.symbol || (() => null);
  const len = ppIsLong(f) ? 2 : 1;
  const mn = MN[f];
  let t;
  const md = () => (d ? `${sym(m) || o(m)},${o(d)}` : `${sym(m) || o(m)}`);
  if (f >= 0o03 && f <= 0o07) {
    const off = d < 0o40 ? d : d - 0o77;
    const target = (addr + off) & 0o7777;
    t = `${mn} ${sym(target) || o(target)}`;
  } else if (f === 0o10) {
    t = d < 0o40 ? `SHN ${o(d)}` : `SHN -${o(0o77 - d)}`;
  } else if (f >= 0o11 && f <= 0o17) {
    t = `${mn} ${o(d)}`;
  } else if (f >= 0o20 && f <= 0o23) {
    t = `${mn} ${o((d << 12) | m)}`;
  } else if (f === 0o00 || f === 0o24 || f === 0o25) {
    t = 'PSN';
  } else if (f === 0o26) {
    t = (d & 0o70) === 0o10 ? 'MXN' : (d & 0o70) === 0o20 ? 'MAN' : 'EXN';
    if (d & 7) t += ` ${o(d & 7)}`;
  } else if (f === 0o27) {
    t = 'RPN';
  } else if (f >= 0o30 && f <= 0o47) {
    t = `${mn} ${sym(d) || o(d)}`;
  } else if (f === 0o01 || f === 0o02 || (f >= 0o50 && f <= 0o57)) {
    t = `${mn} ${md()}`;
  } else if (f === 0o60 || f === 0o62) {
    t = `${mn} ${o(d)}`;
  } else if (f === 0o61 || f === 0o63) {
    t = `${mn} ${sym(m) || o(m)},${o(d)}`;
  } else if (f >= 0o64 && f <= 0o67) {
    t = `${mn} ${sym(m) || o(m)},${o(d)}`;
  } else if (f === 0o71 || f === 0o73 || f === 0o77) {
    t = `${mn} ${sym(m) || o(m)},${o(d)}`;
  } else {
    t = `${mn} ${o(d)}`;
  }
  return { text: t, length: len, mnemonic: t.split(' ')[0], f, d, m };
}
