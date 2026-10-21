// Assembly listing in COMPASS 3 format.
//
// Line: col 1-3 error flags, col 4 "L", col 5-10 address, col 12-31
// octal code (parcel p in column 12+5p), col 33 relocation indicator,
// col 41-112 source image (columns 1-72), col 113-130 sequence / origin.

import { ERROR_TEXT, FATAL } from './assembler.js';
import { wordToDisplay } from '../common/charset.js';

const PAGE_LINES = 60;
const VERSION = 'COMPASS 3.6-JS';
const FLAG_ORDER = 'ADEFLNOPRUV123456789';

export class Listing {
  constructor(asm) {
    this.asm = asm;
    this.out = [];
    this.lineMap = [];
    this.page = 0;
    this.lineOnPage = PAGE_LINES;
    this.prog = null;
    this.opts = new Set(['B', 'L', 'N', 'R']);
    this.stack = [];
    this.errorPages = new Map();
    this.title = '';
    this.subtitle = '';
    this.subsub = '';
  }

  // ---------------------------------------------------------- pages

  header() {
    const a = this.asm;
    this.page++;
    this.lineOnPage = 0;
    if (this.out.length) this.out.push('\f');
    const d = a.micros ? a.micros.get('DATE') : '';
    const t = a.micros ? a.micros.get('TIME') : '';
    const l1 = (this.title || '').padEnd(62).slice(0, 62) + '  ' + VERSION.padEnd(16) + (d || '').padEnd(11) + (t || '').padEnd(11) + 'PAGE' + String(this.page).padStart(6);
    const blk = a.cur ? a.cur.name : '';
    const l2 = (this.subtitle || '').padEnd(62).slice(0, 62) + '  ' + (this.subsub || '').padEnd(10).slice(0, 10) + '      ' + blk.padEnd(10) + (a.qual || '');
    this.out.push(l1.trimEnd());
    this.out.push(l2.trimEnd());
    this.out.push('');
  }

  emit(line) {
    if (this.lineOnPage >= PAGE_LINES) this.header();
    this.out.push(line.replace(/\s+$/, ''));
    this.lineOnPage++;
    return { page: this.page, line: this.lineOnPage };
  }

  eject() {
    this.lineOnPage = PAGE_LINES;
  }

  // ---------------------------------------------------------- lines

  /** Lines preceding the first IDENT (comments). */
  preamble(st) {
    this.emit(''.padEnd(40) + st.img);
  }

  startProgram() {
    const a = this.asm;
    this.prog = a.identEntry;
    this.opts = new Set(['B', 'L', 'N', 'R']);
    this.stack = [];
    this.errorPages = new Map();
    this.title = a.titles.main || a.titles.identTitle || '';
    this.subtitle = '';
    this.subsub = '';
    this.eject();
    this.statsStart = this.out.length;
    if (this.opts.has('B')) this.headerInfo();
  }

  /** Summary of blocks and entry points (at program start). */
  headerInfo() {
    // produced at end of program (lengths are known then): see endProgram
  }

  visible(entry) {
    if (entry.flags.size) return true;
    const op = entry.op || (entry.f && entry.f.op);
    if (op === 'LIST' || op === 'END') return true;
    if (!this.opts.has('L')) return false;
    if (this.opts.has('G') && entry.code && entry.code.length) return true;
    const req = new Set(entry.listReq || []);
    if (op === 'EJECT' || op === 'SPACE' || op === 'TTL' || op === 'TITLE') req.add('C');
    if (op === 'SEG' || op === 'SEGMENT' || op === 'IDENT' || op === 'END') req.add('B');
    for (const r of req) if (!this.opts.has(r)) return false;
    return true;
  }

  applyList(items) {
    if (!items) return;
    if (items.length === 1 && items[0] === '*') {
      this.opts = this.stack.pop() || new Set(['B', 'L', 'N', 'R']);
      return;
    }
    this.stack.push(new Set(this.opts));
    if (this.stack.length > 50) this.stack.shift();
    for (const it of items) {
      if (it === '$') { for (const c of 'ABCDEFGLMNRSTX') this.opts.add(c); continue; }
      if (it.startsWith('-')) this.opts.delete(it[1]);
      else if (it) this.opts.add(it[0]);
    }
  }

  addGroup(entries, asm) {
    if (this.prog !== asm.identEntry) this.startProgram();
    for (const e of entries) this.addEntry(e);
  }

  addEntry(e) {
    const a = this.asm;
    if (e.deferred) return;
    if (e.listOpts) this.applyList(e.listOpts);
    const ctl = e.listCtl;
    if (ctl) {
      if (ctl.title !== undefined) this.title = ctl.title;
      if (ctl.clearSub) this.subtitle = '';
      if (ctl.subtitle !== undefined) this.subtitle = ctl.subtitle;
      if (ctl.subsub !== undefined) this.subsub = ctl.subsub;
    }
    if (ctl && ctl.eject && !ctl.first) this.eject();
    if (ctl && ctl.space) {
      if (this.lineOnPage + ctl.space + (ctl.remain || 0) > PAGE_LINES) this.eject();
      else for (let k = 0; k < ctl.space; k++) this.emit('');
    }
    if (!this.visible(e)) {
      this.carryToCall(e);
      // references of an unlisted line are attached to the last listed line
      if (e.level > 0 && this.lastPos) e.listPos = this.lastPos;
      this.mapLine(e, null);
      return;
    }
    const lines = this.format(e);
    // option A: edited line listed after the line as read
    if (this.opts.has('A') && e.edited && e.img !== e.rawImg && lines.length) {
      const ed = { ...e, rawImg: e.img, code: [], flags: new Set(), listValue: '' };
      lines.splice(1, 0, ...this.format(ed));
    }
    let first = null;
    for (const l of lines) {
      const pos = this.emit(l);
      if (!first) first = pos;
    }
    if (e.kind === 'maccall') this.lastCall = { idx: this.out.length - lines.length, e, chunks: [], word: null, level: e.level };
    else if (e.level <= (this.lastCall ? this.lastCall.level : -1)) this.lastCall = null;
    if (first) {
      e.listPos = first;
      this.lastPos = first;
      for (const f of e.flags) {
        const pages = this.errorPages.get(f) || new Set();
        pages.add(first.page);
        this.errorPages.set(f, pages);
      }
    }
    this.mapLine(e, first);
  }

  /** Code of an unlisted expansion appears on the call line (first word). */
  carryToCall(e) {
    const lc = this.lastCall;
    if (!lc || !e.code || !e.code.length || e.level <= lc.level) return;
    let changed = false;
    for (const c of e.code) {
      const key = c.block.key + ':' + c.word;
      if (lc.word === null) lc.word = key;
      if (key !== lc.word) { this.lastCall = null; break; }
      lc.chunks.push(c);
      changed = true;
    }
    if (changed) {
      const f = this.format({ ...lc.e, code: lc.chunks, f: { ...lc.e.f, loc: 'X' } });
      this.out[lc.idx] = f[0].replace(/\s+$/, '');
    }
  }

  /** Source line -> address map for the IDE. */
  mapLine(e, pos) {
    if (!e.site) return;
    const c = e.code && e.code.find((x) => !x.lit);
    const prev = this.lineMap.find((m) => m.line === e.site.line && m.file === e.site.file);
    if (prev) {
      if (prev.address === null && c) Object.assign(prev, this.codeInfo(c));
      if (e.code && e.code.length && e.level > 0) prev.octal = prev.octal.concat(octalWords(e, this.asm.wordBits));
      for (const f of e.flags) if (!prev.flags.includes(f)) prev.flags += f;
      return;
    }
    const m = { line: e.site.line, file: e.site.file, address: null, parcel: 0, block: '', octal: [], flags: [...e.flags].join(''),
      generated: e.level > 0, page: pos ? pos.page : null };
    if (c) Object.assign(m, this.codeInfo(c));
    if (e.code && e.code.length) m.octal = octalWords(e, this.asm.wordBits);
    this.lineMap.push(m);
  }

  codeInfo(c) {
    const wb = this.asm.wordBits;
    return { address: c.block.final + c.word, parcel: wb === 60 ? (60 - c.pos) / 15 : 0, block: c.block.name,
      location: (c.locBlock ? c.locBlock.final : 0) + c.loc };
  }

  /** Listing lines of an entry. */
  format(e) {
    const a = this.asm;
    const flags = sortFlags(e.flags);
    const src = (e.rawImg ?? e.img ?? '').slice(0, 72);
    const seq = this.seqField(e);
    const wb = a.wordBits;
    const out = [];
    const line = (fl, Lmark, addr, code, rel, text, sq) => {
      let s = (fl || '').padEnd(3).slice(0, 3) + (Lmark ? 'L' : ' ') + (addr ?? '').padStart(6) + ' ' + (code ?? '').padEnd(20) + ' ' + (rel || ' ');
      s = s.padEnd(40) + (text || '').padEnd(72) + (sq || '');
      return s;
    };
    if (!e.code || !e.code.length) {
      let val = e.listValue ?? '';
      let addr = '';
      if (e.litValue) {
        const lb = a.literalBlock();
        val = (lb.final + e.litValue.num()).toString(8);
      }
      if (e.f && e.f.loc && e.kind === 'pseudo' && ['BSS', 'BSSZ', 'DATA', 'VFD', 'CON', 'DIS'].includes(e.pseudo)) {
        const s = e.start;
        if (s && e.block) addr = (e.block.final + (e.block.pos === wb ? s.origin : s.origin)).toString(8);
      }
      if (e.kind === 'pseudo' && (e.pseudo === 'BSS') && e.end && e.block) {
        addr = (e.block.final + (e.end.origin - (e.p1 ? e.p1.n : 0))).toString(8);
      }
      out.push(line(flags, false, addr, val.toString().padStart(20).slice(-20), '', src, seq));
      return out;
    }
    // group chunks by word (detail words: options D or G)
    const words = [];
    const showDetail = this.opts.has('D') || this.opts.has('G');
    for (const c of e.code) {
      if (c.detail && !showDetail) continue;
      const key = c.block.key + ':' + c.word;
      let w = words.find((x) => x.key === key);
      if (!w) { w = { key, c0: c, chunks: [] }; words.push(w); }
      w.chunks.push(c);
    }
    if (wb === 60) {
      words.forEach((w, idx) => {
        const c0 = w.c0;
        const loc = (c0.locBlock ? c0.locBlock.final : 0) + c0.loc;
        const orig = c0.block.final + c0.word;
        const Lmark = !!(c0.locBlock !== c0.block || c0.loc !== c0.word);
        const digits = new Array(20).fill(' ');
        let rel = '';
        for (const c of w.chunks) {
          const startBit = 60 - c.pos;       // number of bits before the chunk
          const d0 = Math.floor(startBit / 3);
          const d1 = Math.ceil((startBit + c.bits) / 3);
          const val = c.value << BigInt(c.pos - c.bits);
          for (let d = d0; d < d1 && d < 20; d++) digits[d] = Number((val >> BigInt(57 - 3 * d)) & 7n).toString();
          if (c.flag) rel = c.flag;
        }
        const showAddr = idx > 0 || w.c0.pos === 60 || (e.f && e.f.loc && e.f.loc !== '-');
        const code = digits.join('');
        out.push(line(idx === 0 ? flags : '', showAddr && Lmark, showAddr ? loc.toString(8) : '', code.trimEnd().padEnd(20), rel, idx === 0 ? src : '', idx === 0 ? seq : ''));
        if (Lmark && showAddr && orig !== loc) { /* origin address not shown */ }
      });
    } else {
      // PP: 12-bit words, a two-word instruction on one line
      const wd = wb === 16 ? 6 : 4;
      const groups = [];
      for (const w of words) {
        const g = groups[groups.length - 1];
        if (g && e.kind === 'instr' && g.length < 2) g.push(w);
        else groups.push([w]);
      }
      groups.forEach((g, idx) => {
        const c0 = g[0].c0;
        const loc = (c0.locBlock ? c0.locBlock.final : 0) + c0.loc;
        const Lmark = !!(c0.locBlock !== c0.block || c0.loc !== c0.word);
        const code = g.map((w) => {
          let v = 0n;
          for (const c of w.chunks) v |= c.value << BigInt(c.pos - c.bits);
          return v.toString(8).padStart(wd, '0');
        }).join(' ');
        out.push(line(idx === 0 ? flags : '', Lmark, loc.toString(8), code, '', idx === 0 ? src : '', idx === 0 ? seq : ''));
      });
    }
    return out;
  }

  seqField(e) {
    if (e.level > 0 && e.frame) {
      const id = (e.frame.seqId || e.frame.name || '').slice(0, 9);
      return id.padEnd(9) + String(e.level).padStart(9);
    }
    return (e.st && e.st.seq) || '';
  }

  // ---------------------------------------------------------- end of program

  endProgram(a) {
    // block summary
    if (this.opts.has('B')) {
      this.eject();
      this.emit('BLOCKS        TYPE          ADDRESS      LENGTH');
      for (const g of a.groups) {
        for (const b of g.blocks) {
          const type = a.type === 'reloc' ? (b.type === 'abs' ? 'ABSOLUTE' : (b.lcm ? '+' : '') + (b.type === 'common' || b.type === 'blank' ? 'COMMON' : 'LOCAL')) : 'ABSOLUTE';
          this.emit(b.name.padEnd(14) + type.padEnd(14) + b.final.toString(8).padStart(7) + b.max.toString(8).padStart(12));
        }
      }
      if (a.entryPoints.size) {
        this.emit('');
        this.emit('ENTRY POINTS.');
        const items = [...a.entryPoints.keys()].map((n) => {
          const s = a.findSymbol(n, '');
          const v = s ? s.val : null;
          const rb = v ? v.relocBlock() : null;
          const addr = v ? ((rb ? rb.block.final : 0) + v.num()).toString(8) + (rb ? '+' : ' ') : '*******';
          return '     ' + n.padEnd(8) + (a.entryPoints.get(n).cond ? '*' : ' ') + addr.padStart(9);
        });
        columns(items, 3, 40).forEach((l) => this.emit(l));
      }
      if (a.externals.size) {
        this.emit('');
        this.emit('EXTERNAL SYMBOLS.');
        const items = [...a.externals].map(([n, x]) => '     ' + n + (x.weak ? '*' : ''));
        columns(items, 6, 16).forEach((l) => this.emit(l));
      }
    }
    // literals and default symbols (option D)
    const lb = a.blockOrder.find((b) => b.type === 'lit');
    if (this.opts.has('D') && lb && a.literals.length) {
      this.emit('');
      this.emit('CONTENT OF LITERALS BLOCK.');
      a.literals.forEach((w, i) => {
        const addr = (lb.final + i).toString(8);
        if (a.wordBits === 60) this.emit(addr.padStart(8) + '   ' + w.toString(8).padStart(20, '0') + '   ' + wordToDisplay(w));
        else this.emit(addr.padStart(8) + '   ' + w.toString(8).padStart(4, '0'));
      });
    }
    // statistics
    this.emit('');
    const used = Math.max(0o40000, (a.statements * 3) & ~0o77);
    const nsyms = a.symbolOrder.filter((s) => !s.name.startsWith('!')).length;
    this.emit(`${used.toString(8).padStart(16)}B CM STORAGE USED${String(a.statements).padStart(12)} STATEMENTS${String(nsyms).padStart(12)} SYMBOLS`);
    this.emit(`${''.padStart(56)}${String(a.inventedCount || 0).padStart(14)} INVENTED SYMBOLS`);
    this.emit(`${'6600-TYPE CPU ASSEMBLY'.padStart(32)}${''.padStart(24)}${String(a.references || 0).padStart(14)} REFERENCES`);
    // error directory
    let nErr = 0, nWarn = 0;
    for (const e of a.entries) for (const f of e.flags) (FATAL.has(f) ? nErr++ : nWarn++);
    if (nErr) this.emit(`${String(nErr).padStart(16)} ERRORS`);
    if (nWarn) this.emit(`${String(nWarn).padStart(16)} WARNINGS`);
    if (this.errorPages.size) {
      this.subtitle = 'ERROR DIRECTORY';
      this.eject();
      for (const f of FLAG_ORDER) {
        const pages = this.errorPages.get(f);
        if (!pages) continue;
        this.emit(`${f} TYPE ERROR      ${ERROR_TEXT[f]}`);
        this.emit(`                  OCCURRED ON PAGES   ${[...pages].join(', ')}`);
      }
    }
    // symbolic reference table
    if (this.opts.has('R')) this.referenceTable(a);
  }

  referenceTable(a) {
    this.subtitle = 'SYMBOLIC REFERENCE TABLE.';
    this.eject();
    const groups = new Map();
    for (const s of a.symbolOrder) {
      if (s.name.startsWith('!') || a.noref.has(s.name)) continue;
      if (!this.opts.has('N') && !s.refs.length) continue;
      const q = s.qual || '';
      if (!groups.has(q)) groups.set(q, []);
      groups.get(q).push(s);
    }
    const quals = [...groups.keys()].sort((x, y) => (x === '' ? -1 : y === '' ? 1 : 0));
    for (const q of quals) {
      if (q) this.emit(`${''.padEnd(25)}SYMBOL QUALIFIER = ${q}`);
      const list = groups.get(q).sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
      for (const s of list) {
        const v = s.val;
        const rb = v.relocBlock();
        const value = (rb ? rb.block.final : 0) + v.num();
        const blk = a.type === 'reloc' && rb ? rb.block.name : '';
        const refs = [];
        if (s.entry && s.entry.listPos) refs.push(`${s.entry.listPos.page}/${s.entry.listPos.line} ${s.kind === 'loc' ? 'L' : 'D'}`);
        for (const r of s.refs) if (r.entry.listPos) refs.push(`${r.entry.listPos.page}/${r.entry.listPos.line}${r.flag ? ' ' + r.flag : ''}`);
        let head = s.name.padEnd(10) + (value < 0 ? (~(-value) & 0o777777) : value).toString(8).padStart(8) + ' ' + blk.padEnd(9);
        if (!refs.length) { this.emit(head); continue; }
        for (let k = 0; k < refs.length; k += 8) {
          const chunk = refs.slice(k, k + 8).map((r) => r.padStart(10) + ' ').join('');
          this.emit((k === 0 ? head : ''.padEnd(28)) + chunk);
        }
      }
    }
  }

  text() {
    return this.out.join('\n') + '\n';
  }
}

function sortFlags(set) {
  return [...set].sort((a, b) => FLAG_ORDER.indexOf(a) - FLAG_ORDER.indexOf(b)).join('');
}

/** Octal code of an entry: one value per instruction, or per word for data. */
function octalWords(e, wb) {
  if (e.kind === 'instr' && wb === 60) return e.code.map((x) => octDigits(x.value, x.bits));
  const words = [];
  const index = new Map();
  for (const c of e.code) {
    const key = c.block.key + ':' + c.word;
    let w = index.get(key);
    if (!w) { w = { v: 0n }; index.set(key, w); words.push(w); }
    w.v |= c.value << BigInt(c.pos - c.bits);
  }
  return words.map((w) => w.v.toString(8).padStart(wb === 60 ? 20 : wb === 16 ? 6 : 4, '0'));
}

function octDigits(v, bits) {
  return v.toString(8).padStart(Math.ceil(bits / 3), '0');
}

function columns(items, ncol, width) {
  const rows = Math.ceil(items.length / ncol);
  const out = [];
  for (let r = 0; r < rows; r++) {
    let s = '';
    for (let c = 0; c < ncol; c++) {
      const it = items[c * rows + r];
      if (it !== undefined) s += it.padEnd(width);
    }
    out.push(s);
  }
  return out;
}
