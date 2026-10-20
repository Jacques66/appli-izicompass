// Chargeur et éditeur de liens pour les programmes produits par l'assembleur.
//
// Relogeable : les sous-programmes sont placés à la suite à partir de RA+100B
// (les 100B premiers mots sont la zone de communication du travail), puis les
// blocs communs nommés, puis le commun blanc. Les champs relogeables (+/-),
// communs (C) et externes (X) sont corrigés en complément à un sur 18 bits.
// Absolu : l'image est chargée à son origine (relative à RA).

import { M60, add18, sub18 } from '../common/word.js';

const M18n = 0o777777n;

function patchField(word, shift, bits, delta, sign) {
  const mask = ((1n << BigInt(bits)) - 1n) << BigInt(shift);
  const field = Number((word & mask) >> BigInt(shift));
  let v;
  if (bits === 18) v = sign < 0 ? sub18(field, delta) : add18(field, delta);
  else {
    const m = 2 ** bits - 1;
    v = (sign < 0 ? field - delta : field + delta) & m;
  }
  return (word & ~mask & M60) | (BigInt(v) << BigInt(shift));
}

/**
 * Charge une liste de programmes dans la mémoire centrale.
 * @param machine Machine (cm, cmSize)
 * @param programs résultats de l'assembleur (champ programs)
 * @param options { ra = 0, base = 100B, fl }
 * @returns { entry, fl, map, errors, entries }
 */
export function linkAndLoad(machine, programs, { ra = 0, base = 0o100, fl } = {}) {
  const errors = [];
  const map = [];
  const entries = new Map();
  const cm = machine.cm;
  const put = (addr, w) => {
    const a = ra + addr;
    if (a < 0 || a >= machine.cmSize) { errors.push(`adresse hors mémoire : ${addr.toString(8)}B`); return; }
    machine.writeCM(a, w & M60);
  };
  const cpuProgs = programs.filter((p) => p.type !== 'pp');
  let entry = null;
  let high = base;

  // 1. Programmes absolus
  for (const p of cpuProgs.filter((p) => p.type === 'abs')) {
    for (const ov of p.overlays.slice(0, 1)) {
      ov.words.forEach((w, k) => put(ov.origin + k, w));
      map.push({ name: p.name, addr: ov.origin, length: ov.words.length, kind: 'ABS' });
      high = Math.max(high, ov.origin + ov.words.length);
    }
    if (entry === null) entry = p.entry;
  }

  // 2. Programmes relogeables : implantation
  const rel = cpuProgs.filter((p) => p.type === 'reloc');
  let addr = Math.max(base, high);
  for (const p of rel) {
    p._base = addr;
    map.push({ name: p.name, addr, length: p.length, kind: 'REL' });
    for (const e of p.entries) {
      if (e.common) continue;
      const v = e.rel === '+' ? addr + e.value : e.value;
      if (entries.has(e.name) && !e.cond) errors.push(`point d'entrée en double : ${e.name}`);
      if (!entries.has(e.name)) entries.set(e.name, v);
    }
    addr += p.length;
  }
  // blocs communs : taille maximale déclarée
  const commons = new Map();
  for (const p of rel) {
    for (const c of p.commons || []) {
      if (c.name === '') continue;
      const o = commons.get(c.name);
      if (!o) commons.set(c.name, { name: c.name, length: c.length, owner: p });
      else if (c.length > o.length && o.owner) errors.push(`bloc commun /${c.name}/ agrandi par ${p.name}`);
    }
  }
  for (const c of commons.values()) {
    c.addr = addr;
    map.push({ name: `/${c.name}/`, addr, length: c.length, kind: 'COMMON' });
    addr += c.length;
  }
  let blank = 0;
  for (const p of rel) for (const c of p.commons || []) if (c.name === '') blank = Math.max(blank, c.length);
  const blankAddr = addr;
  if (blank) { map.push({ name: '//', addr, length: blank, kind: 'COMMON' }); addr += blank; }
  for (const p of rel) for (const e of p.entries) {
    if (!e.common) continue;
    const c = commons.get(e.common.slice(1, -1));
    if (c && !entries.has(e.name)) entries.set(e.name, c.addr + e.value);
  }

  // 3. Chargement du texte avec relocation
  for (const p of rel) {
    const b = p._base;
    const commonAddr = (blk) => {
      const name = blk.type === 'blank' ? '' : blk.name.slice(1, -1);
      if (name === '') return blankAddr;
      return commons.get(name)?.addr ?? 0;
    };
    const fix = (w, rels) => {
      for (const r of rels || []) {
        const bits = r.bits || 18;
        if (r.kind === '+') w = patchField(w, r.shift, bits, b, 1);
        else if (r.kind === '-') w = patchField(w, r.shift, bits, b, -1);
        else if (r.kind === 'C') w = patchField(w, r.shift, bits, commonAddr(r.block), 1);
        else if (r.kind === 'X') {
          const ext = (p.externals || []).find((x) => x.name === r.ext);
          let a = entries.get(r.ext);
          if (a === undefined) {
            if (!(ext && ext.weak)) errors.push(`externe non satisfait : ${r.ext} (${p.name})`);
            a = 0;
          }
          w = patchField(w, r.shift, bits, a, 1);
        }
      }
      return w;
    };
    const relAt = new Map((p.image.rels || []).map((r) => [r.addr, r.rels]));
    p.image.words.forEach((w, k) => put(b + k, fix(w, relAt.get(k))));
    for (const c of p.commons || []) {
      const ca = commonAddr(c.block || { type: c.name === '' ? 'blank' : 'common', name: `/${c.name}/` });
      for (const cw of c.words) put(ca + cw.offset, fix(cw.w, cw.rels));
    }
    for (const a of p.absolute || []) put(a.addr, a.w);
    for (const r of p.reps || []) {
      const src = b + Number(r.S.w);
      const dst = r.D ? b + Number(r.D.w) : src + Math.max(1, r.B);
      const bs = Math.max(1, r.B), n = Math.max(1, r.C), inc = r.I || bs;
      for (let c = 0; c < n; c++) for (let k = 0; k < bs; k++) put(dst + c * inc + k, cm[ra + src + k]);
    }
    if (p.entry) {
      const e = entries.get(p.entry);
      if (e === undefined) errors.push(`adresse de transfert inconnue : ${p.entry}`);
      else entry = e;
    }
  }
  high = Math.max(high, addr);
  const flWords = fl ?? Math.min(machine.cmSize - ra, Math.ceil((high + 0o100) / 0o100) * 0o100);
  if (entry === null) entry = rel.length ? rel[0]._base : base;
  return { entry, fl: flWords, map, errors, entries: Object.fromEntries(entries) };
}

/** Charge un programme PP dans la mémoire d'un PP. */
export function loadPP(machine, prog, pp = 0) {
  const ov = prog.overlays[0];
  machine.loadPP(pp, ov.words, ov.origin);
  return { entry: prog.entry, origin: ov.origin, length: ov.words.length };
}
