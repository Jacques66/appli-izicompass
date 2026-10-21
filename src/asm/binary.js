// Binary produced by COMPASS: CDC loader tables.
//
// Relocatable: PRFX (7700), [LDSET 7000], PIDL (3400), ENTR (3600), TEXT (4000),
// REPL (4300), FILL (4200), LINK (4400), XFER (4600).
// CPU absolute: PRFX, overlay table 5000 (or 5100 with entry points), image.
// PP: PRFX, PP header word, image (5 PP words per CM word).

import { displayToWord } from '../common/charset.js';

const hdr = (code, wc, rest = 0n) => (BigInt(code) << 48n) | (BigInt(wc) << 36n) | (rest & ((1n << 36n) - 1n));

function nameWord(name) {
  // 7 characters maximum, zero-filled on the right, low 18 bits zero
  let w = 0n;
  const s = name.slice(0, 7);
  for (let i = 0; i < 7; i++) {
    const c = i < s.length ? displayCode(s[i]) : 0;
    w = (w << 6n) | BigInt(c);
  }
  return w << 18n;
}

function displayCode(ch) {
  const w = displayToWord(ch, 0);
  return Number(w >> 54n);
}

function text10(s) {
  return displayToWord(s.padEnd(10).slice(0, 10));
}

/** Prefix table 7700 (14 words after the header). */
export function prefixTable(asm, prog) {
  const w = [hdr(0o7700, 0o16)];
  w.push(nameWord(prog.name || ''));
  w.push(text10(asm.micros.get('DATE') || ''));
  w.push(text10(asm.micros.get('TIME') || ''));
  w.push(text10('NOS 2.8.7'));
  w.push(text10('COMPASS'));
  w.push(text10(('3.6-' + (asm.micros.get('MODLEVEL') || '')).slice(0, 10)));
  // hardware: target (2 chars), validity (2 chars), hfi
  let valid = '  ', target = '  ';
  const mt = asm.machineType || '';
  if (asm.type === 'pp') valid = { PERIPH: '6P', PPU: '7P', CIPPU: '8P' }[asm.ppFlavor] || '6P';
  else if ('678'.includes(mt[0] || '-')) {
    valid = mt[0] + 'X';
    if (/^[678][0-9]/.test(mt)) target = mt.slice(0, 2);
  }
  w.push(text10(target + valid + (asm.hfi || []).join('').slice(0, 6)));
  const comment = (prog.comments || []).join('').slice(0, 70).padEnd(70);
  for (let k = 0; k < 7; k++) w.push(text10(comment.slice(k * 10, k * 10 + 10)));
  return w;
}

/**
 * Builds the binary records of a program.
 * @returns { records: [ { kind, words: BigInt[] } ] }
 */
export function buildBinary(asm, prog) {
  const records = [];
  const prfx = prog.nolabel ? [] : prefixTable(asm, prog);
  if (prog.type === 'reloc') {
    for (const d of prog.lcc || []) records.push({ kind: 'LCC', words: textWords(d) });
    const w = [...prfx];
    if (prog.ldset && prog.ldset.length) {
      const items = prog.ldset.map((o) => text10(o));
      w.push(hdr(0o7000, items.length), ...items);
    }
    // PIDL
    const commons = prog.commons || [];
    const pidl = [nameWord(prog.name) | BigInt(prog.length & 0o777777)];
    for (const c of commons) pidl.push(nameWord(c.name) | BigInt(c.length & 0o777777));
    w.push(hdr(0o3400, pidl.length), ...pidl);
    // ENTR
    if (prog.entries.length) {
      const e = [];
      for (const en of prog.entries) {
        e.push(nameWord(en.name));
        const base = en.common ? 2 + commons.findIndex((c) => '/' + c.name + '/' === en.common) : en.rel ? 1 : 0;
        e.push((en.cond ? 1n << 59n : 0n) | (BigInt(base) << 18n) | BigInt(en.value));
      }
      w.push(hdr(0o3600, e.length), ...e);
    }
    // TEXT in groups of 15 consecutive words
    const words = prog.image.words;
    const relAt = new Map((prog.image.rels || []).map((r) => [r.addr, r.rels]));
    const fills = [], links = new Map();
    let a = 0;
    while (a < words.length) {
      // skip unwritten zero words
      const start = a;
      const n = Math.min(15, words.length - a);
      const relWord = [];
      const data = [];
      for (let k = 0; k < n; k++) {
        const addr = start + k;
        let code = 0;
        for (const r of relAt.get(addr) || []) {
          if (r.kind === '+' || r.kind === '-') {
            const sign = r.kind === '+' ? 0b10 : 0b11;
            if (r.shift === 30) code |= sign << 2;
            else if (r.shift === 15) code |= 0b0100 | (sign & 1);
            else code |= sign;
          } else if (r.kind === 'C') {
            fills.push({ base: 2 + commons.findIndex((c) => c.block === r.block), addr, shift: r.shift });
          } else if (r.kind === 'X') {
            if (!links.has(r.ext)) links.set(r.ext, []);
            links.get(r.ext).push({ addr, shift: r.shift });
          }
        }
        relWord.push(code);
        data.push(words[addr]);
      }
      let rw = 0n;
      relWord.forEach((c, k) => { rw |= BigInt(c) << BigInt(56 - 4 * k); });
      w.push(hdr(0o4000, data.length + 1, (1n << 18n) | BigInt(start)), rw, ...data);
      a += n;
    }
    // REPL
    if (prog.reps && prog.reps.length) {
      const r = [];
      for (const rep of prog.reps) {
        r.push((BigInt(rep.type) << 48n) | (1n << 36n) | rep.S.w);
        r.push((BigInt(rep.D ? 1 : 0) << 48n) | (rep.D ? rep.D.w : 0n));
        r.push((BigInt(rep.C & 0xfffff) << 40n) | (BigInt(rep.B & 0xfffff) << 20n) | BigInt(rep.I & 0xfffff));
      }
      w.push(hdr(0o4300, r.length), ...r);
    }
    // FILL
    if (fills.length) {
      const items = [];
      let lastBase = -1;
      for (const f of fills) {
        if (f.base !== lastBase) { items.push((1n << 29n) | (BigInt(f.base) << 18n)); lastBase = f.base; }
        items.push((BigInt(posCode(f.shift)) << 27n) | (1n << 18n) | BigInt(f.addr));
      }
      w.push(...pack30(0o4200, items));
    }
    // LINK
    if (links.size) {
      const lw = [];
      for (const [name, refs] of links) {
        const ext = prog.externals.find((x) => x.name === name);
        lw.push(nameWord(name) | (ext && ext.weak ? 1n : 0n));
        lw.push(BigInt(refs.length));
        const items = refs.map((r) => (BigInt(posCode(r.shift)) << 27n) | (1n << 18n) | BigInt(r.addr));
        for (let k = 0; k < items.length; k += 2) lw.push((items[k] << 30n) | (items[k + 1] ?? 0n));
      }
      w.push(hdr(0o4400, lw.length), ...lw);
    }
    // XFER
    if (prog.entry) w.push(hdr(0o4600, 1), nameWord(prog.entry));
    records.push({ kind: 'REL', words: w });
  } else if (prog.type === 'abs') {
    for (const ov of prog.overlays) {
      const w = [...prfx];
      if (!prog.nolabel || prog.nolabel === 'I') {
        if (prog.entries.length) {
          w.push(hdr(0o5100, 0, (BigInt(ov.levels[0]) << 30n) | (BigInt(ov.levels[1]) << 24n) | BigInt(prog.entries.length)));
          for (const e of prog.entries) w.push(nameWord(e.name) | BigInt(e.value & 0o777777));
        } else {
          w.push((0o5000n << 48n) | (BigInt(ov.levels[0]) << 42n) | (BigInt(ov.levels[1]) << 36n) | (BigInt(ov.origin) << 18n) | BigInt(ov.entry & 0o777777));
        }
      }
      w.push(...ov.words);
      records.push({ kind: 'ABS', name: ov.name, words: w });
    }
  } else {
    for (const ov of prog.overlays) {
      const w = [...prfx];
      if (!prog.nolabel || prog.nolabel === 'I') {
        const nm = (ov.name || '').slice(0, 3);
        let nw = 0n;
        for (let i = 0; i < 3; i++) nw = (nw << 6n) | BigInt(i < nm.length ? displayCode(nm[i]) : 0);
        const load = (ov.origin - 5) & 0o7777;
        w.push((nw << 42n) | (BigInt(load) << 24n) | BigInt(ov.words.length + 5));
      }
      for (let k = 0; k < ov.words.length; k += 5) {
        let cw = 0n;
        for (let m = 0; m < 5; m++) cw = (cw << 12n) | BigInt(ov.words[k + m] ?? 0);
        w.push(cw);
      }
      records.push({ kind: 'PP', name: ov.name, words: w });
    }
  }
  return { records };
}

function posCode(shift) {
  return shift === 30 ? 2 : shift === 15 ? 1 : 0;
}

/** Table of 30-bit items, two per word. */
function pack30(code, items) {
  const words = [];
  for (let k = 0; k < items.length; k += 2) words.push((items[k] << 30n) | (items[k + 1] ?? 0n));
  return [hdr(code, words.length), ...words];
}

/** Text as display-code words (LCC directive). */
function textWords(s) {
  const out = [];
  for (let k = 0; k < s.length; k += 10) out.push(text10(s.slice(k, k + 10)));
  out.push(0n);
  return out;
}

