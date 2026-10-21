// COMPASS 3 pseudo instructions.
// Each handler receives (asm, entry, pass). Values that affect storage
// layout are computed in pass 1 and kept in entry.p1.

import { M60, to60, signed60 } from '../common/word.js';
import { Val, Cursor, AsmError, parseExpression, parseDataItem, charDataWords, readSymbolName, fitsBits, truncBits } from './expr.js';
import { simpleField, scanFields, LineSource, MARK } from './source.js';
import { SourceFrame } from './frames.js';
import { startCapture, splitNames, rawVarField, assembleRemote, parseActuals } from './macros.js';
import { assembleCpuInstruction, prepareCpuStatement, cpuSyntaxLookup } from './cpuasm.js';
import { CPU_SYNTAX } from './cpuops.js';
import { PP_OPS } from './ppops.js';
import { charValue } from './charcode.js';

export const ANYWHERE = new Set(['BASE', 'B1=1', 'B7=1', 'CHAR', 'CODE', 'COMMENT', 'CPOP', 'CPSYN', 'DECMIC',
  'EJECT', 'ELSE', 'END', 'ENDD', 'ENDIF', 'ENDM', 'HERE', 'IFC', 'IRP', 'LDSET', 'LIST', 'MACRO', 'MACROE',
  'MICCNT', 'MICRO', 'NIL', 'NOLABEL', 'NOREF', 'OCTMIC', 'OPDEF', 'OPSYN', 'PPOP', 'PURGDEF', 'PURGMAC',
  'QUAL', 'RMT', 'SKIP', 'SPACE', 'SST', 'TITLE', 'TTL', 'XREF', 'CTEXT', 'ENDX', 'XTEXT']);
export const FIRST_GROUP_ONLY = new Set(['ABS', 'MACHINE', 'PERIPH', 'PPU', 'CIPPU', 'STEXT', 'MEMSEL']);

const H = {};
export const PSEUDO_HANDLERS = H;

// ------------------------------------------------------------ utilities

function vfText(entry) {
  return simpleField(entry.img, entry.f.varPos);
}

function vfSubs(entry) {
  const t = vfText(entry);
  return t === '' ? [] : t.split(',');
}

/** Image text from the start of the variable field (strings, titles). */
function restOfStatement(entry) {
  return entry.f.varPos < 0 ? '' : entry.img.slice(entry.f.varPos);
}

/** String of TITLE/TTL/CTEXT/COMMENT: comment column rule. */
function titleString(asm, entry, max = 62) {
  const img = entry.img;
  let i = entry.f.opEnd;
  while (img[i] === ' ') i++;
  let s;
  if (i >= img.length) s = '';
  else if (i >= asm.cc - 1) s = img.slice(asm.cc - 2);
  else s = img.slice(i);
  return s.replace(/ +$/, '').slice(0, max);
}

function loc(entry) {
  return entry.f.loc;
}

function noLocation(asm, entry) {
  // location field ignored (no diagnostic)
}

/** Sign-extended 21-bit value (symbol definition pseudos). */
function to21(v) {
  const r = v.clone();
  const lo = r.w & ((1n << 21n) - 1n);
  r.w = lo & (1n << 20n) ? (lo | (M60 ^ ((1n << 21n) - 1n))) : lo;
  return r;
}

function evalDefined(asm, entry, text) {
  const v = asm.evalText(entry, text, { requireDefined: true });
  if (v.undef && v.undef.length) throw new AsmError('U', `undefined symbol: ${v.undef[0]}`);
  if (v.regs.length) throw new AsmError('A', 'register not allowed');
  asm.checkReloc(v);
  return v;
}

function setListValue(entry, value) {
  entry.listValue = value;
}

function octStr(n) {
  return (n < 0 ? (~(-n) & 0o777777) : n).toString(8);
}

// ===================================================== identification

H.IDENT = (asm, entry, pass) => {
  if (pass === 2) return;
  const subs = vfSubs(entry);
  if (!asm.identEntry) {
    asm.identEntry = entry;
    asm.progName = subs[0] || '';
    asm.identSubs = subs;
    if (!asm.progName) asm.flag(entry, 'A', 'missing program name');
    if (!asm.titles.main) asm.titles.identTitle = vfText(entry);
    return;
  }
  // subsequent IDENT: overlay (absolute / PP) or partial section (blank IDENT)
  if (asm.type === 'reloc') {
    asm.flag(entry, 'O', 'second IDENT in a relocatable program');
    return;
  }
  asm.forceUpper(asm.cur);
  asm.newOverlay(entry, subs);
};

H.END = (asm, entry, pass) => {
  if (pass === 2) {
    asm.forceUpper(asm.cur);
    return;
  }
  const fr = entry.frame;
  if (fr && fr.kind === 'xtext') {
    // END of an external text: ends only that text
    const idx = asm.frames.indexOf(fr);
    if (idx > 0) asm.frames.length = idx;
    entry.kind = 'list';
    entry.listOnly = true;
    return;
  }
  if (asm.rmt.unlabeled.length && !entry.st.remoteDone) {
    // assemble the remote code first, then replay END
    asm.entries.pop();
    asm.groupEntries.pop();
    asm.pushFrame({ kind: 'endreplay', done: false, next() { if (this.done) return null; this.done = true; return { ...entry.st, remoteDone: true, forceLevel: entry.level }; } });
    assembleRemote(asm, entry, null);
    entry.deferred = true;
    return;
  }
  asm.skip = null;
  asm.forceUpper(asm.cur);
  asm.endEntry = entry;
  asm.endTrasym = vfText(entry);
  entry.endLoc = loc(entry);
  asm.completeProgram(entry);
};

// ===================================================== binary control

H.ABS = (asm, entry, pass) => {
  if (pass === 2) return;
  if (asm.type === 'pp') return;
  asm.type = 'abs';
  asm.resetBlocksForType();
};

function declarePP(asm, entry, flavor) {
  asm.type = 'pp';
  asm.ppFlavor = flavor;
  asm.wordBits = flavor === 'CIPPU' ? 16 : 12;
  asm.ppJ = vfText(entry).startsWith('J');
  if (flavor === 'CIPPU') asm.code = 'N';
  asm.resetBlocksForType();
}
H.PERIPH = (asm, entry, pass) => { if (pass === 1) declarePP(asm, entry, 'PERIPH'); };
H.PPU = (asm, entry, pass) => { if (pass === 1) declarePP(asm, entry, 'PPU'); };
H.CIPPU = (asm, entry, pass) => { if (pass === 1) declarePP(asm, entry, 'CIPPU'); };

H.MACHINE = (asm, entry, pass) => {
  if (pass === 2) return;
  const subs = vfSubs(entry);
  asm.machineType = subs[0] || '';
  asm.hfi = subs.slice(1, 10).map((s) => s[0]);
};

H.SEGMENT = (asm, entry, pass) => {
  if (pass === 2) { asm.forceUpper(asm.cur); return; }
  if (!loc(entry)) asm.flag(entry, 'L', 'missing segment name');
  asm.forceUpper(asm.cur);
  if (asm.type === 'reloc') return;
  asm.segments.push({ name: loc(entry), subs: vfSubs(entry), block: asm.cur, at: asm.cur.origin, entry });
};

H.SEG = (asm, entry, pass) => {
  if (asm.type !== 'abs') { if (pass === 1) asm.flag(entry, 'O', 'SEG: absolute CPU program only'); return; }
  asm.forceUpper(asm.cur);
};

H.STEXT = (asm, entry, pass) => {
  if (pass === 1) asm.stext = { name: loc(entry) };
};

H.COMMENT = (asm, entry, pass) => {
  if (pass === 2) return;
  let s = titleString(asm, entry, 80);
  s = s + ' '.repeat(10 - (s.length % 10 || 10) + (s.length % 10 === 0 ? 10 : 0));
  if (!s.trim()) s = ' '.repeat(10);
  asm.comments.push(s);
};

H.NOLABEL = (asm, entry, pass) => {
  if (pass === 2) return;
  if (asm.type === 'reloc') { asm.flag(entry, 'O', 'NOLABEL: absolute program only'); return; }
  const t = vfText(entry);
  if (t && t[0] !== 'I') { asm.flag(entry, 'A', 'NOLABEL: character other than I'); return; }
  asm.nolabel = t ? 'I' : 'ALL';
};

H.LCC = (asm, entry, pass) => {
  if (pass === 2) return;
  if (asm.type !== 'reloc') { asm.flag(entry, 'O', 'LCC: relocatable program only'); return; }
  asm.lcc.push(vfText(entry));
};

H.MEMSEL = (asm, entry, pass) => {
  if (pass === 2) return;
  const t = vfText(entry);
  if (t && t !== '4' && t !== '8') asm.flag(entry, 'A');
  asm.memsel = t === '8' ? 8 : 4;
};

H.LDSET = (asm, entry, pass) => {
  if (pass === 2) return;
  if (asm.type !== 'reloc') { asm.flag(entry, 'O', 'LDSET: relocatable program only'); return; }
  asm.ldset.push(...vfSubs(entry));
};

// ===================================================== modes

function modeStack(asm, kind, value, mname, prev, entry) {
  if (mname) defineMicro(asm, entry, mname, prev);
}

H.BASE = (asm, entry, pass) => {
  if (pass === 2) return;
  const t = vfText(entry);
  const prev = asm.base;
  if (loc(entry)) defineMicro(asm, entry, loc(entry), prev);
  if (!t) return;
  let next;
  if (t[0] === '*') next = asm.stacks.BASE.pop() || 'D';
  else if ('OMD'.includes(t[0])) { pushStack(asm.stacks.BASE, prev); next = t[0]; }
  else { asm.flag(entry, 'A', 'BASE: character other than O, M, D or *'); return; }
  asm.base = next;
  if (!asm.userMicros.has('BASE')) asm.micros.set('BASE', next);
  setListValue(entry, `${prev}>${next}`);
};

H.CODE = (asm, entry, pass) => {
  if (pass === 2) return;
  const t = vfText(entry);
  const prev = asm.code;
  if (loc(entry)) defineMicro(asm, entry, loc(entry), prev);
  if (!t) return;
  let next;
  if (t[0] === '*') next = asm.stacks.CODE.pop() || 'D';
  else if ('ADEINO'.includes(t[0])) { pushStack(asm.stacks.CODE, prev); next = t[0]; }
  else { asm.flag(entry, 'A', 'CODE: character other than A, D, E, I, N, O or *'); return; }
  asm.code = next;
  if (!asm.userMicros.has('CODE')) asm.micros.set('CODE', next);
  setListValue(entry, `${prev}>${next}`);
};

H.CHAR = (asm, entry, pass) => {
  if (pass === 2) return;
  const s = vfSubs(entry);
  const a = asm.evalAbsolute(entry, s[0], { allowEmpty: false });
  const b = asm.evalAbsolute(entry, s[1], { allowEmpty: false });
  if (a < 0 || a > 0o77 || b < 0 || b > 0o77) { asm.flag(entry, 'A', 'CHAR: value outside 0-77B'); return; }
  asm.other = asm.other.slice();
  asm.other[a] = b;
  setListValue(entry, `${a.toString(8).padStart(2, '0')}>${b.toString(8).padStart(2, '0')}`);
};

H.QUAL = (asm, entry, pass) => {
  if (pass === 2) return;
  const t = vfText(entry);
  const prev = asm.qual;
  if (loc(entry)) defineMicro(asm, entry, loc(entry), prev);
  let next;
  if (t === '*') next = asm.stacks.QUAL.pop() ?? '';
  else {
    if (t && (t.length > 8 || /^[$=:0-9]/.test(t) || /[+\-*/,^]/.test(t))) { asm.flag(entry, 'A', 'incorrect qualifier'); return; }
    pushStack(asm.stacks.QUAL, prev);
    next = t;
  }
  asm.qual = next;
  if (!asm.qualOrder.includes(next) && next) asm.qualOrder.push(next);
  if (!asm.userMicros.has('QUAL')) asm.micros.set('QUAL', next);
};

H['B1=1'] = (asm, entry, pass) => {
  if (pass === 2) return;
  if (asm.type === 'pp') { asm.flag(entry, 'O', 'B1=1 not allowed in PP'); return; }
  asm.b1 = 'B1';
  asm.defineSymbol(entry, 'B1=1', Val.abs(1), 'equ');
};
H['B7=1'] = (asm, entry, pass) => {
  if (pass === 2) return;
  if (asm.type === 'pp') { asm.flag(entry, 'O', 'B7=1 not allowed in PP'); return; }
  asm.b1 = 'B7';
  asm.defineSymbol(entry, 'B7=1', Val.abs(1), 'equ');
};

H.COL = (asm, entry, pass) => {
  if (pass === 2) return;
  const t = vfText(entry);
  let n = t ? asm.evalAbsolute(entry, t, { base: asm.countBase(entry) }) : 0;
  if (!n) n = 30;
  if (n < 12) n = 12;
  asm.cc = n;
  setListValue(entry, String(n));
};

function pushStack(st, v) {
  st.push(v);
  if (st.length > 50) st.shift();
}

// ===================================================== blocks and counters

function useBlock(asm, entry, text, lcm) {
  const t = text;
  const prev = asm.cur;
  if (t === '*') {
    const b = asm.stacks.USE.pop();
    asm.switchTo(b || asm.nominalBlock());
    return;
  }
  let b;
  if (t === '' || t === '0') {
    if (lcm) { asm.flag(entry, 'A', 'USELCM 0 not allowed'); return; }
    b = asm.nominalBlock();
  } else if (t === '//') {
    b = asm.type === 'reloc' ? asm.getBlock('//', 'blank', lcm ? 'B+' : 'B', lcm) : asm.getBlock('//', 'local', lcm ? 'L+//' : 'L//', lcm);
  } else if (t.startsWith('/') && t.endsWith('/') && t.length > 2) {
    const name = t.slice(1, -1);
    if (name.length > 7) { asm.flag(entry, 'A', 'common block name too long'); return; }
    b = asm.type === 'reloc' ? asm.getBlock(t, 'common', (lcm ? 'C+' : 'C') + name, lcm) : asm.getBlock(t, 'local', (lcm ? 'L+' : 'L') + t, lcm);
  } else {
    if (t.length > 8 || t[0] === ':') { asm.flag(entry, 'A', 'incorrect block name'); return; }
    b = asm.getBlock(t, 'local', (lcm ? 'L+' : 'L') + t, lcm);
  }
  pushStack(asm.stacks.USE, prev);
  asm.switchTo(b);
}

H.USE = (asm, entry, pass) => {
  if (pass === 2) return;
  useBlock(asm, entry, vfText(entry), false);
};

H.USELCM = (asm, entry, pass) => {
  if (pass === 2) return;
  if (asm.type === 'pp') { asm.flag(entry, 'O', 'USELCM not allowed in PP'); return; }
  useBlock(asm, entry, vfText(entry), true);
};

function orgCommon(asm, entry, pass, cond) {
  if (pass === 2) { asm.forceUpper(asm.cur); return; }
  const t = vfText(entry);
  asm.forceUpper(asm.cur);
  const prev = asm.cur;
  let target, value;
  if (t === '*' || t === '*L' || t === '*O') {
    target = asm.cur;
    if (t === '*O') { target.locBlock = target; target.locOffset = target.origin; }
    else if (target.locBlock === target) target.origin = target.locOffset;
    return;
  }
  const v = evalDefined(asm, entry, t);
  const rb = v.relocBlock();
  if (rb) {
    if (rb.coeff !== 1) throw new AsmError('A', 'negative relocation on ORG');
    target = rb.block;
    if (target.type === 'lit') throw new AsmError('A', 'ORG in the literals block');
  } else if (v.isExternal()) {
    throw new AsmError('A', 'external in ORG');
  } else {
    target = asm.type === 'reloc' ? asm.getBlock('ABSOLUTE*', 'abs', 'absolute') : asm.absoluteBlock();
  }
  value = v.num();
  if (value < 0) throw new AsmError('A', 'negative origin');
  pushStack(asm.stacks.USE, prev);
  asm.switchTo(target);
  target.origin = value;
  target.locBlock = target;
  target.locOffset = value;
  target.pos = asm.wordBits;
  if (value > target.max) target.max = value;
  if (cond) target.cond = true;
  else target.cond = false;
}
H.ORG = (asm, entry, pass) => orgCommon(asm, entry, pass, false);
H.ORGC = (asm, entry, pass) => orgCommon(asm, entry, pass, asm.type === 'reloc');

/** BSS / BSSZ: reserves words (zeros for BSSZ). */
function bssCommon(asm, entry, pass, zero) {
  asm.prepareCode(entry);
  asm.forceUpper(asm.cur);
  asm.defineLocation(entry);
  let n;
  if (pass === 1) {
    if (entry.implicit) n = 1;
    else {
      const t = vfText(entry);
      try {
        n = t ? asm.evalAbsolute(entry, t) : 0;
      } catch (e) {
        asm.handleError(entry, e);
        n = 0;
      }
    }
    if (n < 0) {
      asm.flag(entry, '7', 'negative BSS');
      if (zero) n = 0;
    }
    if (zero && asm.cur.type === 'blank') asm.flag(entry, 'R', 'BSSZ in blank common');
    entry.p1 = { n };
    setListValue(entry, n ? octStr(n) : '');
  } else n = entry.p1.n;
  if (zero) {
    if (pass === 2 || asm.wordBits) {
      for (let k = 0; k < n; k++) asm.emitBits(asm.wordBits, 0n, null, { detail: k > 0 });
    }
  } else {
    asm.reserveWords(n);
  }
}
H.BSS = (asm, entry, pass) => bssCommon(asm, entry, pass, false);
H.BSSZ = (asm, entry, pass) => bssCommon(asm, entry, pass, true);

H.LOC = (asm, entry, pass) => {
  asm.prepareCode(entry);
  asm.forceUpper(asm.cur);
  const b = asm.cur;
  if (pass === 1) {
    const t = vfText(entry);
    if (t === '*' || t === '*L') { entry.p1 = { keep: true }; return; }
    if (t === '*O') { entry.p1 = { reset: true }; }
    else {
      const v = evalDefined(asm, entry, t);
      const rb = v.relocBlock();
      if (rb && rb.coeff !== 1) throw new AsmError('A', 'negative relocation on LOC');
      entry.p1 = { block: rb ? rb.block : null, offset: v.num() };
    }
  }
  const p = entry.p1;
  if (!p || p.keep) return;
  if (p.reset) { b.locBlock = b; b.locOffset = b.origin; return; }
  b.locBlock = p.block || asm.absoluteMarker();
  b.locOffset = p.offset;
};

H.POS = (asm, entry, pass) => {
  const b = asm.cur;
  let n;
  if (pass === 1) {
    const t = vfText(entry);
    n = asm.evalAbsolute(entry, t, { allowEmpty: false });
    if (n < 0 || n > asm.wordBits) throw new AsmError('A', 'POS out of range');
    entry.p1 = { n };
  } else n = entry.p1.n;
  if (n === 0) { asm.advanceWord(b); return; }
  if (n < b.pos) asm.emitBits(b.pos - n, 0n, null, { hidden: true });
  else b.pos = n;
};

// ===================================================== symbol definition

function needLoc(asm, entry) {
  const l = loc(entry);
  if (!l || !asm.validSymbol(l)) { asm.flag(entry, 'L', 'location symbol required'); return null; }
  return l;
}

H.EQU = (asm, entry, pass) => {
  if (pass === 2) return;
  const name = needLoc(asm, entry);
  if (!name) return;
  let v;
  try {
    v = evalDefined(asm, entry, vfText(entry));
  } catch (e) {
    asm.handleError(entry, e);
    return;
  }
  v = to21(v);
  asm.defineSymbol(entry, name, v, 'equ');
  setListValue(entry, octStr(v.num()));
};
H['='] = H.EQU;

H.SET = (asm, entry, pass) => {
  const name = loc(entry);
  if (pass === 2) {
    if (entry.p1 && entry.p1.v) asm.defineSymbol(entry, name, entry.p1.v, 'set');
    return;
  }
  if (!needLoc(asm, entry)) return;
  let v;
  try {
    v = evalDefined(asm, entry, vfText(entry));
  } catch (e) {
    asm.flag(entry, '2', e.message);
    return;
  }
  v = to21(v);
  entry.p1 = { v };
  asm.defineSymbol(entry, name, v, 'set');
  setListValue(entry, octStr(v.num()));
};

function maxMin(asm, entry, pass, max) {
  const name = loc(entry);
  if (pass === 2) {
    if (entry.p1 && entry.p1.v) asm.defineSymbol(entry, name, entry.p1.v, 'set');
    return;
  }
  if (!needLoc(asm, entry)) return;
  let best = null;
  try {
    for (const t of vfSubs(entry)) {
      const v = evalDefined(asm, entry, t);
      if (!best || (max ? v.signed() > best.signed() : v.signed() < best.signed())) best = v;
    }
  } catch (e) {
    asm.flag(entry, '2', e.message);
    return;
  }
  if (!best) { asm.flag(entry, '2'); return; }
  const v = to21(best);
  entry.p1 = { v };
  asm.defineSymbol(entry, name, v, 'set');
  setListValue(entry, octStr(v.num()));
}
H.MAX = (asm, entry, pass) => maxMin(asm, entry, pass, true);
H.MIN = (asm, entry, pass) => maxMin(asm, entry, pass, false);

H.MICCNT = (asm, entry, pass) => {
  const name = loc(entry);
  if (pass === 2) {
    if (entry.p1 && entry.p1.v) asm.defineSymbol(entry, name, entry.p1.v, 'set');
    return;
  }
  if (!needLoc(asm, entry)) return;
  const m = asm.micros.get(vfText(entry));
  if (m === undefined) { asm.flag(entry, '2', `unknown micro: ${vfText(entry)}`); return; }
  const v = Val.abs(m.length);
  entry.p1 = { v };
  asm.defineSymbol(entry, name, v, 'set');
  setListValue(entry, octStr(m.length));
};

H.SST = (asm, entry, pass) => {
  if (pass === 2) return;
  const except = new Set(vfSubs(entry));
  const sys = asm.systemSymbols;
  if (!sys) return;
  asm.sstSymbols = asm.sstSymbols || new Map();
  for (const [name, s] of sys) {
    if (except.has(name)) continue;
    asm.sstSymbols.set(name, { ...s, val: s.val.clone(), kind: 'sst', refs: [], system: true });
  }
};

// ===================================================== linkage

H.ENTRY = (asm, entry, pass) => {
  if (pass === 2) return;
  if (asm.type === 'pp') { asm.flag(entry, 'O', 'ENTRY not allowed in PP'); return; }
  for (const n of vfSubs(entry)) {
    if (!/^[A-Z][^:]{0,6}$/.test(n) || n.endsWith(':')) { asm.flag(entry, 'A', `incorrect entry point: ${n}`); continue; }
    asm.entryPoints.set(n, { cond: entry.op === 'ENTRYC', entry });
  }
};
H.ENTRYC = H.ENTRY;

H.EXT = (asm, entry, pass) => {
  if (pass === 2) return;
  if (asm.type !== 'reloc') { asm.flag(entry, 'O', 'EXT: relocatable program only'); return; }
  for (const n of vfSubs(entry)) {
    if (!/^[A-Z]/.test(n) || n.length > 7) { asm.flag(entry, 'A', `incorrect external: ${n}`); continue; }
    if (asm.findSymbol(n, '')) { asm.flag(entry, 'D', `external defined in the program: ${n}`); continue; }
    if (!asm.externals.has(n)) asm.externals.set(n, { weak: false, refs: 0 });
    if (asm.externals.size > 511) asm.flag(entry, 'F', 'more than 511 externals');
  }
};

// ===================================================== data

function dataCtx(asm, entry) {
  return asm.ctxFor(entry, { wordBits: asm.wordBits });
}

H.DATA = (asm, entry, pass) => {
  asm.prepareCode(entry);
  asm.forceUpper(asm.cur);
  asm.defineLocation(entry);
  const cur = new Cursor(entry.img, entry.f.varPos < 0 ? entry.img.length : entry.f.varPos);
  const ctx = dataCtx(asm, entry);
  let first = true;
  let count = 0;
  for (;;) {
    if (cur.atEnd()) break;
    let item;
    try {
      if (cur.peek() === '=') throw new AsmError('A', 'literal not allowed in DATA');
      item = parseDataItem(cur, ctx);
    } catch (e) {
      if (pass === 1) asm.handleError(entry, e);
      while (!cur.atSubEnd()) cur.next();
      item = { words: [] };
    }
    for (const w of item.words) {
      asm.emitBits(asm.wordBits, w, null, { detail: !first });
      first = false;
      count++;
    }
    if (cur.peek() === ',') { cur.next(); continue; }
    break;
  }
};

H.CON = (asm, entry, pass) => {
  asm.prepareCode(entry);
  asm.forceUpper(asm.cur);
  asm.defineLocation(entry);
  const pos = entry.f.varPos;
  if (pos < 0) { if (pass === 1) asm.flag(entry, '8', 'CON without expression'); return; }
  const cur = new Cursor(entry.img, pos);
  const wb = asm.wordBits;
  for (;;) {
    let v = null;
    try {
      v = parseExpression(cur, asm.ctxFor(entry, { fieldBits: wb, noUndefError: pass === 1, noRef: pass === 1 }));
      if (v.regs.length) throw new AsmError('A', 'register not allowed in CON');
    } catch (e) {
      if (pass === 2) asm.handleError(entry, e);
      while (!cur.atSubEnd()) cur.next();
    }
    if (pass === 2 && v) {
      try {
        asm.checkReloc(v);
        const fin = asm.finalize(v, wb, entry);
        asm.emitBits(wb, fin.w, fin.rel ? { ...fin.rel, fieldBits: Math.min(wb, 60) } : null);
      } catch (e) {
        asm.handleError(entry, e);
        asm.emitBits(wb, 0n, null);
      }
    } else asm.emitBits(wb, 0n, null);
    if (cur.peek() === ',') { cur.next(); continue; }
    break;
  }
};

H.DIS = (asm, entry, pass) => {
  asm.prepareCode(entry);
  asm.forceUpper(asm.cur);
  asm.defineLocation(entry);
  const img = entry.img;
  let p = entry.f.varPos;
  if (p < 0) { if (pass === 1) asm.flag(entry, '8'); return; }
  const ctx = dataCtx(asm, entry);
  const wb = asm.wordBits;
  const cpw = wb === 60 ? 10 : 2;
  let words;
  const comma = img.indexOf(',', p);
  const countText = comma < 0 ? null : img.slice(p, comma);
  if (comma < 0 || /\s/.test(countText)) {
    if (pass === 1) asm.flag(entry, 'A', 'DIS: missing comma after the count');
    return;
  }
  let n = 0;
  if (countText !== '') {
    if (pass === 1) {
      try { n = asm.evalAbsolute(entry, countText, { base: asm.countBase(entry) }); } catch (e) { asm.handleError(entry, e); n = 0; }
      entry.p1 = { n };
    } else n = entry.p1.n;
  }
  if (n > 0) {
    let str = img.slice(comma + 1, comma + 1 + n * cpw);
    str = str.padEnd(n * cpw, ' ');
    words = charDataWords(str, 'H', ctx);
  } else {
    const d = img[comma + 1];
    if (d === undefined) { if (pass === 1) asm.flag(entry, 'A', 'DIS: missing string'); return; }
    const end = img.indexOf(d, comma + 2);
    if (end < 0) { if (pass === 1) asm.flag(entry, 'A', 'DIS: missing end delimiter'); }
    const str = end < 0 ? img.slice(comma + 2) : img.slice(comma + 2, end);
    words = charDataWords(str, 'C', ctx);
  }
  words.forEach((w, k) => asm.emitBits(wb, w, null, { detail: k > 0 }));
};

H.LIT = (asm, entry, pass) => {
  const cur = new Cursor(entry.img, entry.f.varPos < 0 ? entry.img.length : entry.f.varPos);
  const ctx = dataCtx(asm, entry);
  const words = [];
  for (;;) {
    if (cur.atEnd()) break;
    try {
      words.push(...parseDataItem(cur, ctx).words);
    } catch (e) {
      if (pass === 1) asm.handleError(entry, e);
      while (!cur.atSubEnd()) cur.next();
    }
    if (cur.peek() === ',') { cur.next(); continue; }
    break;
  }
  if (!words.length) { if (pass === 1) asm.flag(entry, 'A', 'LIT without data'); return; }
  if (words.length > 100) { if (pass === 1) asm.flag(entry, 'F', 'LIT of more than 100 words'); return; }
  const v = asm.literalValue(words);
  if (pass === 1 && loc(entry)) asm.defineSymbol(entry, loc(entry), v, 'loc');
  entry.litValue = v;
};

H.VFD = (asm, entry, pass) => {
  const b = asm.cur;
  const l = loc(entry);
  const cont = !l && b.vfdOpen;
  asm.prepareCode(entry, { isVfdContinue: !l });
  if (asm.wordBits === 60) {
    if (l === '-') { if (b.pos % 15) asm.emitBits(b.pos % 15, 0n, null, { hidden: true }); }
    else if (l) asm.forceUpper(b);
  } else if (l && b.pos !== asm.wordBits) {
    asm.emitBits(b.pos, 0n, null, { hidden: true });
  }
  if (l && l !== '+' && l !== '-') asm.defineLocation(entry);
  const pos = entry.f.varPos;
  if (pos < 0) { if (pass === 1) asm.flag(entry, '8'); return; }
  const cur = new Cursor(entry.img, pos);
  const fields = [];
  for (;;) {
    let nText = '';
    while (!cur.atSubEnd() && cur.peek() !== '/') nText += cur.next();
    if (cur.peek() !== '/') { if (pass === 1) asm.flag(entry, 'V', 'VFD: "n/expression" expected'); break; }
    cur.next();
    let n;
    if (pass === 1) {
      try { n = asm.evalAbsolute(entry, nText, { base: asm.countBase(entry), allowEmpty: false }); } catch (e) { n = -1; }
    }
    const start = cur.i;
    let v = null;
    try {
      v = parseExpression(cur, asm.ctxFor(entry, { fieldBits: Math.max(1, Math.min(60, n ?? 60)), noUndefError: true, noRef: true }));
    } catch (e) {
      if (pass === 2) asm.handleError(entry, e);
      while (!cur.atSubEnd()) cur.next();
    }
    fields.push({ n, text: entry.img.slice(start, cur.i), v });
    if (cur.peek() === ',') { cur.next(); continue; }
    break;
  }
  if (pass === 1) {
    for (const fd of fields) if (!(fd.n > 0 && fd.n <= 60)) { asm.flag(entry, 'V'); fd.n = fd.n > 60 ? 60 : 0; }
    entry.p1 = { sizes: fields.map((f) => f.n) };
  }
  const sizes = entry.p1.sizes;
  fields.forEach((fd, k) => {
    const n = sizes[k];
    if (!n) return;
    if (pass === 1) { asm.emitBits(n, 0n, null); return; }
    let w = 0n, rel = null;
    if (fd.v) {
      // fields: the field size determines the justification of character constants
      const v2 = parseExpression(new Cursor(fd.text, 0), asm.ctxFor(entry, { fieldBits: n }));
      try {
        asm.checkReloc(v2);
        const fin = asm.finalize(v2, n, entry);
        w = fin.w;
        rel = fin.rel;
        if (rel && asm.type === 'reloc' && b.pos < n) throw new AsmError('A', 'relocatable field spans two words');
      } catch (e) { asm.handleError(entry, e); }
    }
    asm.emitBits(n, w, rel ? { ...rel, fieldBits: n } : null);
  });
  b.vfdOpen = true;
};

H['R='] = (asm, entry, pass) => {
  if (asm.type === 'pp') { if (pass === 1) asm.flag(entry, 'O', 'R= not allowed in PP'); return; }
  const l = loc(entry);
  if (l) {
    asm.prepareCode(entry);
    asm.forceUpper(asm.cur);
    asm.defineLocation(entry);
  }
  if (pass === 1) {
    const s = vfSubs(entry);
    const reg = s[0] || '';
    const exp = s.slice(1).join(',');
    if (!/^[ABX][0-7]$/.test(reg)) { asm.flag(entry, 'A', 'R=: register expected'); return; }
    let field = exp;
    if (exp === reg) field = null;
    else {
      let n = null;
      try {
        const v = asm.evalText(entry, exp, { regs: true, noUndefError: true, noRef: true });
        if (!v.regs.length && v.isAbsolute() && !v.undef) n = v.num();
      } catch (e) { /* register form */ }
      if (n === 0) field = 'B0';
      else if (asm.b1 && (n === 1 || n === 2 || n === -1)) field = n === 1 ? asm.b1 : n === 2 ? `${asm.b1}+${asm.b1}` : `-${asm.b1}`;
    }
    entry.p1 = { text: field === null ? null : `S${reg}`, field };
  }
  const p = entry.p1;
  if (!p || !p.text) return;
  // generated instruction: "S<reg> <field>"
  const img = '          ' + p.text.padEnd(7, ' ') + p.field;
  const sub = { ...entry, img, f: scanFields(img, 30), op: p.text, opExtra: null };
  const prep = prepareCpuStatement(asm, sub);
  const def = prep && cpuSyntaxLookup(asm, prep.key);
  if (!def || def.kind === 'opdef') { if (pass === 1) asm.flag(entry, 'A', `R=: syntax ${prep && prep.key}`); return; }
  sub.prep = prep;
  sub.flags = entry.flags;
  sub.messages = entry.messages;
  sub.f.loc = '';
  assembleCpuInstruction(asm, sub, def, pass);
};

function repCommon(asm, entry, pass, type) {
  if (pass === 2) return;
  if (asm.type !== 'reloc') { asm.flag(entry, 'O', 'REP: relocatable program only'); return; }
  const r = { type, S: null, D: null, C: 0, B: 0, I: 0, entry };
  for (const s of vfSubs(entry)) {
    const m = /^([SDCBI])\/(.*)$/.exec(s);
    if (!m) { asm.flag(entry, 'A', `REP: subfield ${s}`); continue; }
    if (m[1] === 'S' || m[1] === 'D') r[m[1]] = evalDefined(asm, entry, m[2]);
    else r[m[1]] = asm.evalAbsolute(entry, m[2], { base: asm.countBase(entry) });
  }
  if (!r.S) { asm.flag(entry, 'A', 'REP: S/ required'); return; }
  asm.reps.push(r);
}
H.REP = (asm, entry, pass) => repCommon(asm, entry, pass, 0);
H.REPC = (asm, entry, pass) => repCommon(asm, entry, pass, 1);
H.REPI = (asm, entry, pass) => repCommon(asm, entry, pass, 2);

/** CMU descriptor (MD) and DM, CC, CU instructions (full words). */
function cmuWord(asm, entry, pass, op) {
  asm.prepareCode(entry);
  if (loc(entry) !== '-') asm.forceUpper(asm.cur);
  asm.defineLocation(entry);
  const s = vfSubs(entry);
  let w = 0n;
  if (pass === 2) {
    const ev = (t, bits) => asm.finalize(evalDefinedLoose(asm, entry, t), bits, entry);
    const l = Number(ev(s[0] || '0', 13).w);
    const ks = ev(s[1] || '0', 18), cs = Number(ev(s[2] || '0', 4).w), kd = ev(s[3] || '0', 18), cd = Number(ev(s[4] || '0', 4).w);
    if (cs > 9 || cd > 9) asm.flag(entry, 'A', 'character position > 9');
    if (op === 'MD') {
      w = (BigInt(l >> 4) << 48n) | (ks.w << 30n) | (BigInt(l & 0xf) << 26n) | (BigInt(cs) << 22n) | (BigInt(cd) << 18n) | kd.w;
    } else {
      if (l > 127) asm.flag(entry, '7');
      const code = { DM: 0o465, CC: 0o466, CU: 0o467 }[op];
      w = (BigInt(code) << 51n) | (BigInt((l >> 4) & 7) << 48n) | (ks.w << 30n) | (BigInt(l & 0xf) << 26n) | (BigInt(cs) << 22n) | (BigInt(cd) << 18n) | kd.w;
    }
  }
  asm.emitBits(60, w, null);
}
function evalDefinedLoose(asm, entry, t) {
  const v = asm.evalText(entry, t);
  asm.checkReloc(v);
  return v;
}
H.MD = (asm, entry, pass) => cmuWord(asm, entry, pass, 'MD');
H.DM = (asm, entry, pass) => cmuWord(asm, entry, pass, 'DM');
H.CC = (asm, entry, pass) => cmuWord(asm, entry, pass, 'CC');
H.CU = (asm, entry, pass) => cmuWord(asm, entry, pass, 'CU');

// ===================================================== conditional assembly

function ifCount(asm, entry, text) {
  if (text === undefined || text === '') return null;
  try {
    const n = asm.evalAbsolute(entry, text, { base: asm.countBase(entry) });
    return n > 0 ? n : null;
  } catch (e) {
    asm.handleError(entry, e);
    return undefined;
  }
}

function ifResult(asm, entry, cond, count) {
  if (count === undefined) return; // error: no skip
  entry.ifResult = cond;
  if (!cond) asm.startSkip(loc(entry), count, 'IF');
}

/** Splits "exp1,exp2,n" while respecting character constants. */
function exprSubs(asm, entry) {
  const out = [];
  let pos = entry.f.varPos;
  if (pos < 0) return out;
  const img = entry.img;
  for (;;) {
    const cur = new Cursor(img, pos);
    try {
      parseExpression(cur, asm.ctxFor(entry, { noUndefError: true, noRef: true, regs: asm.type !== 'pp' }));
    } catch (e) {
      while (!cur.atSubEnd()) cur.next();
    }
    out.push(img.slice(pos, cur.i));
    if (cur.peek() === ',') { pos = cur.i + 1; continue; }
    break;
  }
  return out;
}

function ifOp(op) {
  return (asm, entry, pass) => {
    if (pass === 2) return;
    const s = exprSubs(asm, entry);
    let a, b;
    try {
      a = asm.evalText(entry, s[0] || '', { regs: asm.type !== 'pp', refFlag: 'F' });
      b = asm.evalText(entry, s[1] || '', { regs: asm.type !== 'pp', refFlag: 'F' });
      if ((a.undef && a.undef.length) || (b.undef && b.undef.length)) throw new AsmError('U', 'undefined symbol in IF');
    } catch (e) {
      asm.handleError(entry, e);
      return;
    }
    const count = ifCount(asm, entry, s[2]);
    const x = a.signed(), y = b.signed();
    let cond;
    switch (op) {
      case 'EQ': cond = x === y && sameAttr(a, b); break;
      case 'NE': cond = !(x === y && sameAttr(a, b)); break;
      case 'GT': cond = x > y; break;
      case 'GE': cond = x >= y; break;
      case 'LT': cond = x < y; break;
      case 'LE': cond = x <= y; break;
    }
    ifResult(asm, entry, cond, count);
  };
}

function sameAttr(a, b) {
  const ra = a.relocBlock(), rb = b.relocBlock();
  if (!!ra !== !!rb) return false;
  if (ra && (ra.block !== rb.block || ra.coeff !== rb.coeff)) return false;
  const ea = a.extName(), eb = b.extName();
  if (!!ea !== !!eb) return false;
  if (ea && ea.name !== eb.name) return false;
  return true;
}

for (const op of ['EQ', 'NE', 'GT', 'GE', 'LT', 'LE']) H['IF' + op] = ifOp(op);

function ifSign(minus) {
  return (asm, entry, pass) => {
    if (pass === 2) return;
    const s = exprSubs(asm, entry);
    let v;
    try {
      v = asm.evalText(entry, s[0] || '', { refFlag: 'F' });
      if (v.undef && v.undef.length) throw new AsmError('U', 'undefined symbol in IF');
    } catch (e) {
      asm.handleError(entry, e);
      return;
    }
    const neg = (v.w >> 59n) & 1n;
    ifResult(asm, entry, minus ? neg === 1n : neg === 0n, ifCount(asm, entry, s[1]));
  };
}
H.IFPL = ifSign(false);
H.IFMI = ifSign(true);

function ifType(fn) {
  return (asm, entry, pass) => {
    if (pass === 2) return;
    const s = vfSubs(entry);
    ifResult(asm, entry, fn(asm), ifCount(asm, entry, s[0]));
  };
}
const isPP = (a) => a.type === 'pp';
const mtype = (a) => (a.machineType || '')[0];
H.IFCP = ifType((a) => !isPP(a));
H.IFCP6 = ifType((a) => !isPP(a) && mtype(a) !== '7');
H.IFCP7 = ifType((a) => !isPP(a) && mtype(a) !== '6');
H.IFPP = ifType((a) => isPP(a));
H.IFPP6 = ifType((a) => (a.ppFlavor === 'PERIPH' && mtype(a) !== '7') || (a.ppFlavor === 'PPU' && mtype(a) === '6'));
H.IFPP7 = ifType((a) => (a.ppFlavor === 'PPU' && mtype(a) !== '6') || (a.ppFlavor === 'PERIPH' && mtype(a) === '7'));

H.IF = (asm, entry, pass) => {
  if (pass === 2) return;
  const s = exprSubs(asm, entry);
  let att = s[0] || '';
  let neg = false;
  if (att.startsWith('-')) { neg = true; att = att.slice(1); }
  const operand = s[1] ?? '';
  const count = ifCount(asm, entry, s[2]);
  let cond;
  try {
    switch (att) {
      case 'SET': {
        const sym = asm.findSymbol(operand, null);
        if (!sym) throw new AsmError('U', `undefined symbol: ${operand}`);
        cond = !!sym.redef;
        break;
      }
      case 'SST': cond = !!(asm.sstSymbols && asm.sstSymbols.has(operand)) || !!(asm.systemSymbols && asm.systemSymbols.has(operand)); break;
      case 'MIC': cond = asm.micros.has(operand); break;
      case 'MAC': cond = !!asm.lookupMnemonic(operand); break;
      case 'DEF': {
        const v = asm.evalText(entry, operand, { regs: true, noUndefError: true, refFlag: 'F' });
        cond = !(v.undef && v.undef.length);
        break;
      }
      case 'REG': {
        const v = asm.evalText(entry, operand, { regs: true, noUndefError: true });
        cond = v.regs.length > 0;
        break;
      }
      case 'EXT': {
        const v = asm.evalText(entry, operand, { regs: true, noUndefError: true });
        cond = v.isExternal() || !!(v.undef && v.undef.some((n) => asm.defaults.get(n)?.prefix === 'X'));
        break;
      }
      case 'ABS': case 'REL': case 'COM': case 'LCM': case 'LOC': {
        const v = asm.evalText(entry, operand, { regs: true, refFlag: 'F' });
        if (v.undef && v.undef.length) throw new AsmError('U', `undefined symbol: ${v.undef[0]}`);
        const rb = v.relocBlock();
        if (att === 'ABS') cond = v.isAbsolute();
        else if (att === 'REL') cond = !!rb;
        else if (att === 'COM') cond = !!rb && (rb.block.type === 'common' || rb.block.type === 'blank');
        else if (att === 'LCM') cond = !!rb && rb.block.lcm;
        else cond = !!rb && rb.block.type !== 'common' && rb.block.type !== 'blank';
        break;
      }
      default:
        throw new AsmError('U', `unknown IF attribute: ${att}`);
    }
  } catch (e) {
    asm.handleError(entry, e);
    return;
  }
  ifResult(asm, entry, neg ? !cond : cond, count);
};

H.IFC = (asm, entry, pass) => {
  if (pass === 2) return;
  const img = entry.img;
  let p = entry.f.varPos;
  if (p < 0) { asm.flag(entry, '8'); return; }
  const comma = img.indexOf(',', p);
  let op = img.slice(p, comma);
  let neg = false;
  if (op.startsWith('-')) { neg = true; op = op.slice(1); }
  const d = img[comma + 1];
  const e1 = img.indexOf(d, comma + 2);
  const e2 = e1 < 0 ? -1 : img.indexOf(d, e1 + 1);
  if (comma < 0 || d === undefined || e2 < 0) { asm.flag(entry, 'A', 'IFC: badly delimited strings'); return; }
  const s1 = img.slice(comma + 2, e1), s2 = img.slice(e1 + 1, e2);
  let rest = '';
  if (img[e2 + 1] === ',') rest = simpleField(img, e2 + 2);
  const cmp = compareDisplay(s1, s2);
  let cond;
  switch (op) {
    case 'EQ': cond = cmp === 0; break;
    case 'NE': cond = cmp !== 0; break;
    case 'GT': cond = cmp > 0; break;
    case 'GE': cond = cmp >= 0; break;
    case 'LT': cond = cmp < 0; break;
    case 'LE': cond = cmp <= 0; break;
    default: asm.flag(entry, 'O', `IFC: unknown relation ${op}`); return;
  }
  ifResult(asm, entry, neg ? !cond : cond, ifCount(asm, entry, rest));
};

function compareDisplay(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = i < a.length ? charValue(a[i], 'D') : -1;
    const y = i < b.length ? charValue(b[i], 'D') : -1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

H.SKIP = (asm, entry, pass) => {
  if (pass === 2) return;
  const s = vfSubs(entry);
  const c = ifCount(asm, entry, s[0]);
  asm.startSkip(loc(entry), c ?? null, 'SKIP');
};

H.ELSE = (asm, entry, pass) => {
  if (pass === 2) return;
  const s = vfSubs(entry);
  const c = ifCount(asm, entry, s[0]);
  asm.startSkip(loc(entry), c ?? null, 'ELSE');
};

H.ENDIF = () => {};

// ===================================================== errors

H.ERR = (asm, entry, pass) => {
  if (pass === 1) return;
  asm.flag(entry, userFlag(loc(entry)), 'ERR');
};

function userFlag(l) {
  return l && /^[ADEFLNOPRUV1-9]$/.test(l) ? l : 'P';
}

function errTest(test) {
  return (asm, entry, pass) => {
    if (pass === 1) return;
    let v;
    try {
      v = asm.evalText(entry, vfText(entry));
      if (v.isExternal()) throw new AsmError('A', 'external not allowed in ERRxx');
    } catch (e) { asm.handleError(entry, e); return; }
    const fin = asm.finalize(v, 60, entry, { signedField: false });
    const w = fin.w;
    const neg = (w >> 59n) & 1n;
    const zero = w === 0n || w === M60;
    let bad;
    switch (test) {
      case 'NG': bad = neg === 1n; break;
      case 'PL': bad = neg === 0n; break;
      case 'NZ': bad = !zero; break;
      case 'ZR': bad = zero; break;
    }
    if (bad) asm.flag(entry, userFlag(loc(entry)), `ERR${test}`);
  };
}
H.ERRNG = errTest('NG');
H.ERRMI = H.ERRNG;
H.ERRPL = errTest('PL');
H.ERRNZ = errTest('NZ');
H.ERRZR = errTest('ZR');

// ===================================================== listing

H.LIST = (asm, entry, pass) => {
  if (pass === 2) return;
  entry.listOpts = vfSubs(entry);
};

H.EJECT = (asm, entry, pass) => { if (pass === 1) entry.listCtl = { eject: true, subsub: loc(entry) }; };
H.SPACE = (asm, entry, pass) => {
  if (pass === 2) return;
  const s = vfSubs(entry);
  let n = 0, r = 0;
  try {
    n = s[0] ? asm.evalAbsolute(entry, s[0], { base: asm.countBase(entry) }) : 0;
    r = s[1] ? asm.evalAbsolute(entry, s[1], { base: asm.countBase(entry) }) : 0;
  } catch (e) { asm.handleError(entry, e); }
  entry.listCtl = { space: n, remain: r, subsub: loc(entry) };
};
H.TITLE = (asm, entry, pass) => {
  if (pass === 2) return;
  const s = titleString(asm, entry);
  if (!asm.firstTitleSeen) {
    asm.firstTitleSeen = true;
    asm.titles.main = s;
    entry.listCtl = { title: s, subsub: loc(entry), first: true };
  } else {
    entry.listCtl = { subtitle: s, eject: true, subsub: loc(entry) };
  }
};
H.TTL = (asm, entry, pass) => {
  if (pass === 2) return;
  entry.listCtl = { title: titleString(asm, entry), clearSub: true, subsub: loc(entry) };
};
H.NOREF = (asm, entry, pass) => {
  if (pass === 2) return;
  for (const n of vfSubs(entry)) asm.noref.add(n);
};
H.CTEXT = (asm, entry, pass) => {
  if (pass === 2) return;
  asm.ctext = true;
  entry.listCtl = { subtitle: titleString(asm, entry), ctext: true, subsub: loc(entry) };
};
H.ENDX = (asm, entry, pass) => { if (pass === 1) asm.ctext = false; };
H.XREF = (asm, entry, pass) => { if (pass === 1) asm.xrefMode = (vfText(entry)[0] || 'P'); };

// ===================================================== definitions

H.XTEXT = (asm, entry, pass) => {
  if (pass === 2) return;
  const file = loc(entry) || asm.options.X || 'OLDPL';
  const rname = vfText(entry);
  let text = asm.texts[rname ? `${file}/${rname}` : file] ?? asm.texts[rname] ?? asm.texts[file];
  if (text === undefined) { asm.flag(entry, 'F', `external text not found: ${file}${rname ? '/' + rname : ''}`); return; }
  const src = new LineSource(rname || file, text, { xtext: true });
  // a first line carrying the text name in column 1 is skipped
  if (rname && src.raw.length && src.raw[0].split(/\s+/)[0] === rname) src.idx = 1;
  if (src.raw.length && /^\*COMDECK/.test(src.raw[0])) src.idx = 1;
  asm.pushFrame(new SourceFrame(src, entry.site, entry.level + 1));
};

H.RMT = (asm, entry, pass) => {
  if (pass === 2) return;
  startCapture(asm, entry, { kind: 'rmt', name: loc(entry) });
};

H.HERE = (asm, entry, pass) => {
  if (pass === 2) return;
  assembleRemote(asm, entry, loc(entry) || null);
};

H.DUP = (asm, entry, pass) => {
  if (pass === 2) return;
  const s = vfSubs(entry);
  let reps = 0, count = null;
  try {
    reps = s[0] ? asm.evalAbsolute(entry, s[0], { base: asm.countBase(entry) }) : 0;
  } catch (e) { asm.handleError(entry, e); reps = 0; }
  if (s[1]) {
    try { count = asm.evalAbsolute(entry, s[1], { base: asm.countBase(entry) }); } catch (e) { asm.handleError(entry, e); }
    if (!(count > 0)) count = null;
  }
  setListValue(entry, octStr(Math.max(0, reps)));
  startCapture(asm, entry, { kind: 'dup', name: loc(entry), reps: Math.max(0, reps), count });
};

H.ECHO = (asm, entry, pass) => {
  if (pass === 2) return;
  const img = entry.img;
  let p = entry.f.varPos;
  if (p < 0) { asm.flag(entry, '8'); return; }
  // optional count up to the first comma
  const comma = img.indexOf(',', p);
  let count = null;
  const ctext = comma < 0 ? img.slice(p).split(' ')[0] : img.slice(p, comma);
  if (ctext) {
    try { count = asm.evalAbsolute(entry, ctext, { base: asm.countBase(entry) }); } catch (e) { asm.handleError(entry, e); }
    if (!(count > 0)) count = null;
  }
  const params = [];
  let i = comma < 0 ? img.length : comma + 1;
  while (i < img.length && img[i] !== ' ') {
    let name = '';
    while (i < img.length && !'+-*/()$=,.'.includes(img[i]) && img[i] !== ' ') name += img[i++];
    if (img[i] !== '(' && i < img.length && '+-*/$=.'.includes(img[i])) i++;
    let list = [];
    if (img[i] === '(') {
      let depth = 0, txt = '';
      for (; i < img.length; i++) {
        if (img[i] === '(') depth++;
        if (img[i] === ')') { depth--; if (depth === 0) { i++; break; } }
        txt += img[i];
      }
      list = txt.slice(1) === '' ? [] : splitTop(txt.slice(1));
    } else {
      let item = '';
      while (i < img.length && img[i] !== ',' && img[i] !== ' ') item += img[i++];
      list = [item];
    }
    if (!name || /^[0-9]/.test(name)) asm.flag(entry, '4');
    else params.push({ name, list });
    if (img[i] === ',') i++;
    else break;
  }
  if (params.length > 63) asm.flag(entry, 'F', 'more than 63 parameters');
  startCapture(asm, entry, { kind: 'echo', name: loc(entry), params, count });
};

function splitTop(text) {
  const out = [];
  let depth = 0, cur = '';
  for (const c of text) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) { out.push(stripOuter(cur)); cur = ''; continue; }
    cur += c;
  }
  out.push(stripOuter(cur));
  return out;
}
function stripOuter(s) {
  return s.startsWith('(') && s.endsWith(')') ? s.slice(1, -1) : s;
}

H.STOPDUP = (asm, entry, pass) => {
  if (pass === 2) return;
  for (let k = asm.frames.length - 1; k >= 0; k--) {
    const f = asm.frames[k];
    if (f.kind === 'dup' || f.kind === 'echo') { f.stop = true; break; }
  }
};

H.ENDD = () => {};
H.ENDM = () => {};
H.IRP = () => {};
H.NIL = () => {};
H.LOCAL = (asm, entry, pass) => {
  if (pass === 1) asm.flag(entry, 'O', 'LOCAL outside a macro header');
};

function macroHeader(asm, entry, keyword) {
  const l = loc(entry);
  const vf = rawVarField(entry.img, entry.f.varPos);
  let name, formals, format;
  if (l) {
    name = l;
    formals = splitNames(vf);
    format = 1;
  } else {
    const parts = splitNames(vf);
    name = parts[0];
    formals = parts.slice(1);
    format = 2;
    if (!formals.length) asm.flag(entry, 'L', 'format two definition without parameters');
  }
  if (!name || name.length > 8 || ['END', 'ENDD', 'IRP', 'LOCAL', 'ENDM'].includes(name)) {
    asm.flag(entry, 'L', 'incorrect macro name');
  }
  const seen = new Set();
  const ok = [];
  for (const f of formals) {
    if (/^[0-9]/.test(f) || seen.has(f) || ['END', 'ENDD', 'IRP', 'LOCAL', 'ENDM'].includes(f) || f.length > 8) { asm.flag(entry, '4'); continue; }
    seen.add(f);
    ok.push(f);
  }
  startCapture(asm, entry, { kind: 'macro', name, formals: ok, format, keyword, open: [name] });
}
H.MACRO = (asm, entry, pass) => { if (pass === 1) macroHeader(asm, entry, false); };
H.MACROE = (asm, entry, pass) => { if (pass === 1) macroHeader(asm, entry, true); };

/** Validates an OPDEF / CPOP syntax and normalizes it into a key. */
export function normalizeSyntax(sx) {
  if (!sx || sx.length < 2) return null;
  const mn = sx.slice(0, 2);
  const rest = sx.slice(2);
  const descs = rest === '' ? [] : rest.split(',');
  const re = /^(-?[ABX]([+\-*/][ABX])?Q?|Q|)$/;
  for (const d of descs) if (!re.test(d)) return null;
  if (descs.length > 3) return null;
  return mn + rest;
}

H.OPDEF = (asm, entry, pass) => {
  if (pass === 2) return;
  if (asm.type === 'pp') { asm.flag(entry, 'O', 'OPDEF: CPU assembly only'); }
  const sx = normalizeSyntax(loc(entry));
  if (!sx) { asm.flag(entry, '5', `incorrect syntax: ${loc(entry)}`); }
  const vf = rawVarField(entry.img, entry.f.varPos);
  const formals = [];
  const seen = new Set();
  for (const f of splitNames(vf)) {
    if (/^[0-9]/.test(f) || seen.has(f)) { asm.flag(entry, '4'); continue; }
    seen.add(f);
    formals.push(f);
  }
  startCapture(asm, entry, { kind: 'opdef', name: loc(entry), syntax: sx || loc(entry), formals, format: 1, open: [loc(entry)] });
};

// ===================================================== operation code table

H.CPOP = (asm, entry, pass) => {
  if (pass === 2) return;
  const sx = normalizeSyntax(loc(entry));
  if (!sx) { asm.flag(entry, '5'); return; }
  const s = vfSubs(entry);
  try {
    const ctl = asm.evalAbsolute(entry, s[0], { allowEmpty: false });
    const val = asm.evalAbsolute(entry, s[1], { allowEmpty: false, base: entry.ctx.base === 'M' ? 'O' : entry.ctx.base });
    const reg = (s[2] || '0').replace(/B$/, '').padStart(3, '0');
    if (ctl < 0 || ctl > 7 || !/^[0-3]{3}$/.test(reg)) throw new AsmError('A', 'CPOP: incorrect parameter');
    const def = { kind: 'cpop', key: sx, len: ctl & 1 ? 30 : 15, val: val & 0o777, reg,
      before: ctl === 2 || ctl === 3 || ctl === 6 || ctl === 7, after: ctl >= 4, jk: !(ctl & 1) && sx.endsWith('Q') };
    const list = asm.syntactic.get(sx) || [];
    list.push(def);
    asm.syntactic.set(sx, list);
  } catch (e) { asm.handleError(entry, e); }
};

H.PPOP = (asm, entry, pass) => {
  if (pass === 2) return;
  const name = loc(entry);
  const s = vfSubs(entry);
  try {
    const ctl = asm.evalAbsolute(entry, s[0], { allowEmpty: false });
    const val = asm.evalAbsolute(entry, s[1], { allowEmpty: false, base: entry.ctx.base === 'M' ? 'O' : entry.ctx.base });
    const fmt = { 1: 'md', 2: 'rel', 3: 'c18', 4: 'd', 5: 'md', 6: 'shift', 7: 'mdr' }[ctl];
    if (!fmt || !name) throw new AsmError('A', 'PPOP: incorrect parameter');
    const def = { kind: 'ppop', name, code: (val >> 6) & 0o77, fmt };
    const list = asm.mnemonic.get(name) || [];
    list.push(def);
    asm.mnemonic.set(name, list);
  } catch (e) { asm.handleError(entry, e); }
};

H.OPSYN = (asm, entry, pass) => {
  if (pass === 2) return;
  const name1 = loc(entry);
  const name2 = vfText(entry);
  const e2 = asm.lookupMnemonic(name2);
  if (!e2 || !name1) { asm.flag(entry, 'A', `OPSYN: ${name2} not found`); return; }
  const copy = { ...e2, synonymOf: name2 };
  if (e2.kind === 'pseudo' && name2 === 'NIL') copy.kind = 'nil';
  const list = asm.mnemonic.get(name1) || [];
  list.push(copy);
  asm.mnemonic.set(name1, list);
};

H.CPSYN = (asm, entry, pass) => {
  if (pass === 2) return;
  const s1 = normalizeSyntax(loc(entry));
  const s2 = normalizeSyntax(vfText(entry));
  const d2 = s2 && cpuSyntaxLookup(asm, s2);
  if (!s1 || !d2) { asm.flag(entry, 'A', 'CPSYN: syntax not found'); return; }
  const list = asm.syntactic.get(s1) || [];
  list.push({ ...d2 });
  asm.syntactic.set(s1, list);
};

H.PURGMAC = (asm, entry, pass) => {
  if (pass === 2) return;
  for (const n of vfSubs(entry)) {
    const list = asm.mnemonic.get(n);
    if (list) for (const d of list) d.purged = true;
    asm.purgedBuiltin = asm.purgedBuiltin || new Set();
    if (H[n] || PP_OPS.has(n)) asm.purgedBuiltin.add(n);
  }
};

H.PURGDEF = (asm, entry, pass) => {
  if (pass === 2) return;
  const sx = normalizeSyntax(vfText(entry));
  if (!sx) { asm.flag(entry, '5'); return; }
  const list = asm.syntactic.get(sx);
  if (list) for (const d of list) d.purged = true;
  asm.purgedSyntax = asm.purgedSyntax || new Set();
  asm.purgedSyntax.add(sx);
};

// ===================================================== micros

export function defineMicro(asm, entry, name, value) {
  if (!name || name.length > 8) { asm.flag(entry, 'L', 'incorrect micro name'); return; }
  asm.micros.set(name, value);
  asm.userMicros.add(name);
}

H.MICRO = (asm, entry, pass) => {
  if (pass === 2) return;
  const name = loc(entry);
  if (!name) { asm.flag(entry, 'L', 'missing micro name'); return; }
  const img = entry.img;
  let p = entry.f.varPos;
  if (p < 0) { defineMicro(asm, entry, name, ''); return; }
  const c1 = img.indexOf(',', p);
  const c2 = c1 < 0 ? -1 : img.indexOf(',', c1 + 1);
  if (c2 < 0) { asm.flag(entry, 'A', 'MICRO: three subfields expected'); return; }
  const base = asm.countBase(entry);
  let n1 = 0, n2 = 0;
  try {
    n1 = img.slice(p, c1) ? asm.evalAbsolute(entry, img.slice(p, c1), { base }) : 0;
    n2 = img.slice(c1 + 1, c2) ? asm.evalAbsolute(entry, img.slice(c1 + 1, c2), { base }) : 0;
  } catch (e) { asm.handleError(entry, e); return; }
  const d = img[c2 + 1];
  let end = d === undefined ? -1 : img.indexOf(d, c2 + 2);
  if (end < 0) { asm.flag(entry, 'A', 'MICRO: missing end delimiter'); end = img.length; }
  const str = d === undefined ? '' : img.slice(c2 + 2, end);
  if (n1 < 0 || n2 < 0) asm.flag(entry, '7');
  let value;
  if (n1 <= 0) value = '';
  else if (n2 <= 0) value = str.slice(n1 - 1);
  else value = str.slice(n1 - 1, n1 - 1 + n2);
  defineMicro(asm, entry, name, value);
};

function decOctMic(radix) {
  return (asm, entry, pass) => {
    if (pass === 2) return;
    const name = loc(entry);
    if (!name) { asm.flag(entry, 'L', 'missing micro name'); return; }
    const s = vfSubs(entry);
    let v, n = 0;
    try {
      v = asm.evalAbsolute(entry, s[0], { allowEmpty: false });
      if (s[1]) n = asm.evalAbsolute(entry, s[1], { base: asm.countBase(entry) });
    } catch (e) { asm.handleError(entry, e); return; }
    if (n < 0 || n > 10) { asm.flag(entry, 'A', 'micro count outside 0-10'); n = 10; }
    let digits = Math.abs(v).toString(radix);
    if (n) digits = digits.length > n ? digits.slice(digits.length - n) : digits.padStart(n, '0');
    digits = digits.slice(-10);
    defineMicro(asm, entry, name, digits);
    setListValue(entry, octStr(v));
  };
}
H.DECMIC = decOctMic(10);
H.OCTMIC = decOctMic(8);
