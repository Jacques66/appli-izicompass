// Hand-written COMPASS code editor.
//
// Principle: a transparent text area (textarea), sized to its content, laid
// over a highlighted <pre> layer. Only the visible lines are highlighted and
// displayed ("virtual" rendering), which keeps editing smooth on files of
// several thousand lines. The browser's native undo is preserved: every
// change goes through execCommand('insertText').

import { h, icon, debounce } from './dom.js';
import { highlightLine, collectMacros, opColumn, fieldAt, COMMENT_COL, LAST_COL } from './highlight.js';

const PAD_L = 10;     // left inner padding (px)
const PAD_T = 6;      // top inner padding (px)
const OVERSCAN = 6;   // lines rendered off screen
const TAB_STOPS = [10, 17, 29, 35, 41, 47, 53, 59, 65, 71]; // columns 11, 18, 30, then every 6
const GUIDE_COLS = [11, 18, 30];
const MAX_MATCHES = 20000;

export class Editor {
  /**
   * @param opts {
   *   fontSize, autoUpper,
   *   onChange(editor), onCursor(editor), onBreakpoints(set), onCommand(name)
   * }
   */
  constructor(opts = {}) {
    this.opts = opts;
    this.fontSize = opts.fontSize || 13;
    this.autoUpper = opts.autoUpper !== false;
    this.lines = [''];
    this.lineStarts = [0];
    this.maxLen = 0;
    this.breakpoints = new Set();
    this.markers = new Map();      // line -> { fatal, items: [{ flag, message }] }
    this.execLine = null;
    this.execKind = 'exec';        // 'exec' | 'error'
    this.cache = new Map();
    this.macros = new Set();
    this.ctx = { macros: this.macros, pp: false };
    this.find = { open: false, query: '', replace: '', caseSensitive: false, regex: false, matches: [], index: -1, error: false };
    this.cw = 8;
    this.lh = 20;
    this.metricsOk = false;
    this.renderQueued = false;
    this.lastCursorLine = -1;

    this.build();
    this.refreshMacros = debounce(() => this.updateMacros(), 250);
    this.recomputeFind = debounce(() => { this.computeMatches(); this.render(); }, 120);
  }

  // ---------------------------------------------------------------- DOM

  build() {
    this.ta = h('textarea', {
      class: 'ed-input', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off',
      wrap: 'off', 'aria-label': 'COMPASS source editor',
    });
    this.code = h('div', { class: 'ed-code' });
    this.hl = h('div', { class: 'ed-hl' });
    this.guides = h('div', { class: 'ed-guides' });
    this.content = h('div', { class: 'ed-content' }, this.guides, this.hl, this.code, this.ta);
    this.scroller = h('div', { class: 'ed-scroller' }, this.content);
    this.gutterRows = h('div', { class: 'ed-gutter-rows' });
    this.gutter = h('div', { class: 'ed-gutter' }, this.gutterRows);
    this.rulerInner = h('div', { class: 'ed-ruler-inner' });
    this.rulerCaret = h('div', { class: 'ed-ruler-caret' });
    this.ruler = h('div', { class: 'ed-ruler' }, h('div', { class: 'ed-ruler-corner' }), h('div', { class: 'ed-ruler-track' }, this.rulerInner, this.rulerCaret));
    this.findBar = this.buildFindBar();
    this.measure = h('span', { class: 'ed-measure' }, 'M'.repeat(100));
    this.el = h('div', { class: 'editor' },
      this.ruler,
      h('div', { class: 'ed-main' }, this.gutter, this.scroller),
      this.findBar, this.measure);
    this.applyFont();

    const ta = this.ta;
    ta.addEventListener('input', () => this.onInput());
    ta.addEventListener('keydown', (e) => this.onKeyDown(e));
    ta.addEventListener('beforeinput', (e) => this.onBeforeInput(e));
    ta.addEventListener('keyup', () => this.cursorMoved(true));
    ta.addEventListener('mouseup', () => this.cursorMoved(false));
    ta.addEventListener('focus', () => { this.el.classList.add('focused'); this.cursorMoved(false); });
    ta.addEventListener('blur', () => this.el.classList.remove('focused'));
    ta.addEventListener('scroll', () => { ta.scrollTop = 0; ta.scrollLeft = 0; });
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === ta) this.cursorMoved(false);
    });
    this.scroller.addEventListener('scroll', () => this.queueRender());
    this.gutter.addEventListener('mousedown', (e) => this.onGutterDown(e));
    this.gutter.addEventListener('wheel', (e) => {
      this.scroller.scrollTop += e.deltaY;
      e.preventDefault();
    }, { passive: false });
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => { this.updateSize(); this.render(); });
      this.ro.observe(this.scroller);
    }
  }

  applyFont() {
    this.el.style.setProperty('--ed-font-size', `${this.fontSize}px`);
    this.lh = Math.round(this.fontSize * 1.54);
    this.el.style.setProperty('--ed-line', `${this.lh}px`);
    this.metricsOk = false;
    this.cache.clear();
  }

  setFontSize(px) {
    this.fontSize = Math.max(9, Math.min(28, px | 0));
    this.applyFont();
    this.updateSize();
    this.render();
  }

  setAutoUpper(on) {
    this.autoUpper = !!on;
  }

  measureFont() {
    if (!this.el.isConnected) return false;
    const w = this.measure.getBoundingClientRect().width;
    if (!w) return false;
    this.cw = w / 100;
    this.metricsOk = true;
    this.buildGuides();
    this.buildRuler();
    return true;
  }

  // ---------------------------------------------------------- content

  getValue() {
    return this.ta.value;
  }

  setValue(text, { keepScroll = false } = {}) {
    this.ta.value = text.replace(/\r\n?/g, '\n').replace(/\t/g, '        ');
    this.textChanged(null);
    this.updateMacros();
    if (!keepScroll) {
      this.scroller.scrollTop = 0;
      this.scroller.scrollLeft = 0;
      this.ta.setSelectionRange(0, 0);
    }
    this.render();
  }

  get lineCount() {
    return this.lines.length;
  }

  getLine(n) {
    return this.lines[n - 1] ?? '';
  }

  /**
   * Words for help (F1): the word under the cursor, then the operation
   * field of the line. The characters = . are part of names (R=, CIO.).
   */
  helpWords() {
    const { line, col } = this.cursor();
    const text = this.getLine(line);
    const isW = (ch) => /[A-Za-z0-9=.$%#]/.test(ch);
    let a = col - 1;
    let b = col - 1;
    if (!isW(text[a] || '') && isW(text[a - 1] || '')) { a--; b--; }
    while (a > 0 && isW(text[a - 1])) a--;
    while (b < text.length && isW(text[b])) b++;
    const words = [];
    const w = text.slice(a, b).replace(/^[=.]+|[.,]+$/g, '');
    if (w) words.push(w);
    if (text[0] !== '*') {
      const m = /^\S*\s+([^\s,]+)/.exec(text.slice(0, 72));
      if (m && !words.includes(m[1])) words.push(m[1]);
    }
    return words;
  }

  /** Recomputes lines, line starts, max width; shifts breakpoints and markers. */
  textChanged(oldLines) {
    const text = this.ta.value;
    const lines = text.split('\n');
    if (oldLines) this.shiftAnnotations(oldLines, lines);
    this.lines = lines;
    const starts = new Array(lines.length);
    let pos = 0, max = 0;
    for (let i = 0; i < lines.length; i++) {
      starts[i] = pos;
      const L = lines[i].length;
      pos += L + 1;
      if (L > max) max = L;
    }
    this.lineStarts = starts;
    this.maxLen = max;
    this.ctx.pp = /^\s+(PERIPH|PPU)\b/m.test(text.length > 20000 ? text.slice(0, 20000) : text);
    this.updateSize();
  }

  /** Shifts annotations (breakpoints, error markers) after an edit. */
  shiftAnnotations(oldL, newL) {
    const a = oldL.length, b = newL.length;
    let p = 0;
    const lim = Math.min(a, b);
    while (p < lim && oldL[p] === newL[p]) p++;
    let s = 0;
    while (s < lim - p && oldL[a - 1 - s] === newL[b - 1 - s]) s++;
    const delta = b - a;
    if (delta === 0) return;
    const oldEnd = a - s;      // lines [p, oldEnd) changed (0-based)
    const newEnd = b - s;
    const map = (line) => {
      const i = line - 1;
      if (i < p) return line;
      if (i >= oldEnd) return line + delta;
      return i < newEnd ? line : null; // line inside the changed area
    };
    const bps = new Set();
    for (const l of this.breakpoints) {
      const n = map(l);
      if (n !== null) bps.add(n);
    }
    const changedBp = bps.size !== this.breakpoints.size || [...bps].some((x) => !this.breakpoints.has(x));
    this.breakpoints = bps;
    const mk = new Map();
    for (const [l, v] of this.markers) {
      const n = map(l);
      if (n !== null) mk.set(n, v);
    }
    this.markers = mk;
    if (this.execLine !== null) this.execLine = map(this.execLine);
    if (changedBp && this.opts.onBreakpoints) this.opts.onBreakpoints(this.breakpoints);
  }

  updateMacros() {
    const m = collectMacros(this.ta.value);
    if (this.opts.extraMacros) for (const x of this.opts.extraMacros) m.add(x);
    const same = m.size === this.macros.size && [...m].every((x) => this.macros.has(x));
    if (!same) {
      this.macros = m;
      this.ctx = { ...this.ctx, macros: m };
      this.cache.clear();
      this.render();
    }
  }

  onInput() {
    const old = this.lines;
    this.textChanged(old);
    this.refreshMacros();
    if (this.find.open && this.find.query) this.recomputeFind();
    this.render();
    this.ensureCaretVisible();
    this.cursorMoved(false);
    if (this.opts.onChange) this.opts.onChange(this);
  }

  // ----------------------------------------------------------- geometry

  updateSize() {
    if (!this.metricsOk && !this.measureFont()) return;
    const cols = Math.max(this.maxLen + 4, 92);
    const width = Math.ceil(PAD_L * 2 + cols * this.cw);
    const viewH = this.scroller.clientHeight || 0;
    const height = Math.max(PAD_T * 2 + this.lines.length * this.lh + Math.max(this.lh * 3, viewH * 0.4), viewH);
    this.content.style.width = `${Math.max(width, this.scroller.clientWidth)}px`;
    this.content.style.height = `${height}px`;
    this.ta.style.width = `${Math.max(width, this.scroller.clientWidth)}px`;
    this.ta.style.height = `${height}px`;
    const digits = Math.max(3, String(this.lines.length).length);
    const gw = Math.ceil(20 + digits * this.cw + 22);
    if (gw !== this.gutterWidth) {
      this.gutterWidth = gw;
      this.gutter.style.width = `${gw}px`;
      this.el.style.setProperty('--ed-gutter-w', `${gw}px`);
    }
  }

  buildGuides() {
    const g = this.guides;
    g.textContent = '';
    for (const c of GUIDE_COLS) {
      g.append(h('div', { class: 'ed-guide', style: { left: `${PAD_L + (c - 1) * this.cw}px` } }));
    }
    g.append(h('div', { class: 'ed-guide limit', style: { left: `${PAD_L + LAST_COL * this.cw}px` } }));
    g.append(h('div', { class: 'ed-seqzone', style: { left: `${PAD_L + LAST_COL * this.cw}px` } }));
  }

  buildRuler() {
    const r = this.rulerInner;
    r.textContent = '';
    const marks = new Set([1, 11, 18, 30, 72]);
    for (let c = 1; c <= 90; c++) {
      const x = PAD_L + (c - 1) * this.cw;
      const major = marks.has(c);
      const cls = major ? 'tick major' : c % 10 === 0 ? 'tick ten' : c % 5 === 0 ? 'tick five' : 'tick';
      r.append(h('div', { class: c > 72 ? `${cls} seq` : cls, style: { left: `${x}px`, width: `${this.cw}px` } }));
      if (major || c % 10 === 0) {
        r.append(h('div', { class: `tick-label ${major ? 'major' : ''} ${c > 72 ? 'seq' : ''}`, style: { left: `${x}px` } }, String(c)));
      }
    }
    this.rulerCaret.style.width = `${this.cw}px`;
  }

  queueRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  visibleRange() {
    const top = this.scroller.scrollTop;
    const hgt = this.scroller.clientHeight || 600;
    const first = Math.max(0, Math.floor((top - PAD_T) / this.lh) - OVERSCAN);
    const last = Math.min(this.lines.length - 1, Math.ceil((top + hgt - PAD_T) / this.lh) + OVERSCAN);
    return [first, last];
  }

  // ---------------------------------------------------------- rendering

  render() {
    if (!this.metricsOk) {
      if (!this.measureFont()) return;
      this.updateSize();
    }
    const [first, last] = this.visibleRange();
    const lh = this.lh;
    const y0 = PAD_T + first * lh;

    // Highlighted text layer.
    let html = '';
    for (let i = first; i <= last; i++) {
      const text = this.lines[i];
      let row = this.cache.get(text);
      if (row === undefined) {
        row = highlightLine(text, this.ctx);
        if (this.cache.size > 30000) this.cache.clear();
        this.cache.set(text, row);
      }
      html += `<div class="ed-row">${row || ' '}</div>`;
    }
    this.code.style.transform = `translateY(${y0}px)`;
    this.code.innerHTML = html;

    // Highlight layer: current line, execution line, errors, search.
    const cur = this.cursorLine();
    let hl = '';
    const W = '100%';
    if (cur >= first && cur <= last) hl += `<div class="ed-curline" style="top:${PAD_T + cur * lh}px;height:${lh}px;width:${W}"></div>`;
    for (const [line, m] of this.markers) {
      const i = line - 1;
      if (i < first || i > last) continue;
      hl += `<div class="ed-errline ${m.fatal ? 'fatal' : 'warn'}" style="top:${PAD_T + i * lh}px;height:${lh}px"></div>`;
    }
    if (this.execLine !== null) {
      const i = this.execLine - 1;
      if (i >= first && i <= last) hl += `<div class="ed-execline ${this.execKind}" style="top:${PAD_T + i * lh}px;height:${lh}px"></div>`;
    }
    if (this.find.open && this.find.matches.length) {
      const ms = this.find.matches;
      const startOff = this.lineStarts[first];
      let k = lowerBound(ms, startOff);
      const endOff = last + 1 < this.lineStarts.length ? this.lineStarts[last + 1] : Infinity;
      for (; k < ms.length && ms[k].start < endOff; k++) {
        const m = ms[k];
        const li = this.lineOf(m.start);
        const col = m.start - this.lineStarts[li];
        const len = Math.max(1, Math.min(m.end, this.lineStarts[li] + this.lines[li].length) - m.start);
        hl += `<div class="ed-match ${k === this.find.index ? 'current' : ''}" style="top:${PAD_T + li * lh}px;height:${lh}px;left:${PAD_L + col * this.cw}px;width:${len * this.cw}px"></div>`;
      }
    }
    this.hl.innerHTML = hl;

    // Gutter: numbers, breakpoints, markers.
    const st = this.scroller.scrollTop;
    let g = '';
    for (let i = first; i <= last; i++) {
      const n = i + 1;
      const bp = this.breakpoints.has(n);
      const mk = this.markers.get(n);
      let cls = 'g-row';
      if (i === cur) cls += ' current';
      if (bp) cls += ' bp';
      if (this.execLine === n) cls += ` exec ${this.execKind}`;
      let mark = '';
      if (mk) {
        const tip = mk.items.map((x) => `${x.flag ? `[${x.flag}] ` : ''}${x.message}`).join('\n').replace(/"/g, '&quot;');
        mark = `<span class="g-mark ${mk.fatal ? 'fatal' : 'warn'}" data-tip="${tip}" data-tip-fast="1">${mk.fatal ? '✕' : '!'}</span>`;
      } else mark = '<span class="g-mark"></span>';
      g += `<div class="${cls}" data-line="${n}"><span class="g-bp"></span><span class="g-num">${n}</span>${mark}</div>`;
    }
    this.gutterRows.style.transform = `translateY(${y0 - st}px)`;
    this.gutterRows.innerHTML = g;

    // Column ruler.
    this.rulerInner.style.transform = `translateX(${-this.scroller.scrollLeft}px)`;
    this.updateRulerCaret();
  }

  updateRulerCaret() {
    const { col } = this.cursor();
    this.rulerCaret.style.transform = `translateX(${PAD_L + (col - 1) * this.cw - this.scroller.scrollLeft}px)`;
    this.rulerCaret.classList.toggle('beyond', col > LAST_COL);
  }

  // ------------------------------------------------------------- cursor

  lineOf(offset) {
    const s = this.lineStarts;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (s[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  activeOffset() {
    const ta = this.ta;
    return ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd;
  }

  /** Cursor line (0-based). */
  cursorLine() {
    return this.lineOf(this.activeOffset());
  }

  /** { line, col } 1-based, plus the selection length. */
  cursor() {
    const off = this.activeOffset();
    const li = this.lineOf(off);
    return { line: li + 1, col: off - this.lineStarts[li] + 1, selection: Math.abs(this.ta.selectionEnd - this.ta.selectionStart) };
  }

  cursorMoved(fromKey) {
    const li = this.cursorLine();
    if (li !== this.lastCursorLine) {
      this.lastCursorLine = li;
      this.render();
    } else {
      this.updateRulerCaret();
    }
    if (fromKey) this.ensureCaretVisible();
    if (this.opts.onCursor) this.opts.onCursor(this);
  }

  ensureCaretVisible() {
    if (!this.metricsOk) return;
    const off = this.activeOffset();
    const li = this.lineOf(off);
    const col = off - this.lineStarts[li];
    const sc = this.scroller;
    const y = PAD_T + li * this.lh;
    if (y < sc.scrollTop) sc.scrollTop = Math.max(0, y - this.lh);
    else if (y + this.lh > sc.scrollTop + sc.clientHeight) sc.scrollTop = y + this.lh * 2 - sc.clientHeight;
    const x = PAD_L + col * this.cw;
    if (x < sc.scrollLeft + PAD_L) sc.scrollLeft = Math.max(0, x - 4 * this.cw - PAD_L);
    else if (x + this.cw * 2 > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = x + this.cw * 8 - sc.clientWidth;
  }

  focus() {
    this.ta.focus({ preventScroll: true });
  }

  /** Puts the cursor at the start of a line and makes it visible. */
  revealLine(line, { select = false, center = true, focus = true } = {}) {
    const i = Math.max(0, Math.min(this.lines.length - 1, line - 1));
    const start = this.lineStarts[i];
    if (focus) this.focus();
    if (select) this.ta.setSelectionRange(start, start + this.lines[i].length);
    else this.ta.setSelectionRange(start, start);
    this.scrollToLine(line, center);
    this.cursorMoved(false);
  }

  scrollToLine(line, center = true) {
    const i = Math.max(0, line - 1);
    const sc = this.scroller;
    const y = PAD_T + i * this.lh;
    if (!center && y >= sc.scrollTop && y + this.lh <= sc.scrollTop + sc.clientHeight) return;
    if (y < sc.scrollTop || y + this.lh > sc.scrollTop + sc.clientHeight || center) {
      sc.scrollTop = Math.max(0, y - sc.clientHeight / 2 + this.lh);
    }
    this.render();
  }

  // ------------------------------------------------------------ editing

  /** Inserts text in place of the selection, keeping the undo history. */
  insertText(text) {
    const ta = this.ta;
    if (document.activeElement !== ta) ta.focus({ preventScroll: true });
    let ok = false;
    try {
      ok = document.execCommand('insertText', false, text);
    } catch {
      ok = false;
    }
    if (!ok) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
      this.onInput();
    }
  }

  /** Replaces a range [start, end) with text. */
  replaceRange(start, end, text) {
    this.ta.setSelectionRange(start, end);
    this.insertText(text);
  }

  onKeyDown(e) {
    if (e.isComposing) return;
    const ta = this.ta;
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'Tab' && !ctrl && !e.altKey) {
      e.preventDefault();
      if (e.shiftKey) this.backTab(); else this.tab();
      return;
    }
    if (e.key === 'Enter' && !ctrl && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      this.newline();
      return;
    }
    if ((e.key === 'PageDown' || e.key === 'PageUp') && !ctrl && !e.altKey) {
      e.preventDefault();
      this.page(e.key === 'PageDown' ? 1 : -1, e.shiftKey);
      return;
    }
    if (ctrl && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'f') { e.preventDefault(); this.openFind(false); return; }
      if (k === 'h') { e.preventDefault(); this.openFind(true); return; }
      if (k === 'g') { e.preventDefault(); if (this.opts.onCommand) this.opts.onCommand('gotoLine'); return; }
    }
    if (e.key === 'Escape' && this.find.open) {
      e.preventDefault();
      this.closeFind();
      return;
    }
    if (e.key === 'F3') {
      e.preventDefault();
      if (!this.find.query) this.openFind(false);
      else this.findStep(e.shiftKey ? -1 : 1);
      return;
    }
  }

  /** Automatic uppercase: outside comments, typed text is converted to uppercase. */
  onBeforeInput(e) {
    if (!this.autoUpper || e.inputType !== 'insertText' || !e.data || !/[a-zà-ÿ]/.test(e.data) || this.upperBusy) return;
    const off = this.ta.selectionStart;
    const li = this.lineOf(off);
    const col = off - this.lineStarts[li];
    const line = this.lines[li];
    let f = fieldAt(line, col, this.ctx);
    if (f !== 'var' && f !== 'com' && col >= COMMENT_COL - 1) f = 'com';
    if (f === 'com' || f === 'seq') return;
    e.preventDefault();
    this.upperBusy = true;
    try {
      this.insertText(e.data.toUpperCase());
    } finally {
      this.upperBusy = false;
    }
  }

  tab() {
    const ta = this.ta;
    const off = ta.selectionStart;
    const li = this.lineOf(off);
    const col = off - this.lineStarts[li];
    const stop = TAB_STOPS.find((s) => s > col) ?? col + 1;
    this.insertText(' '.repeat(stop - col));
  }

  backTab() {
    const ta = this.ta;
    const off = ta.selectionStart;
    const li = this.lineOf(off);
    const col = off - this.lineStarts[li];
    let stop = 0;
    for (const s of TAB_STOPS) if (s < col) stop = s;
    const line = this.lines[li];
    const between = line.slice(stop, col);
    const start = this.lineStarts[li] + stop;
    if (between.length && /^ +$/.test(between)) {
      this.replaceRange(start, off, '');
    } else {
      ta.setSelectionRange(start, start);
      this.cursorMoved(true);
    }
  }

  /** Enter: new line indented to the operation column of the current line. */
  newline() {
    const off = this.ta.selectionStart;
    const li = this.lineOf(off);
    const line = this.lines[li];
    let ind = 0;
    if (line[0] !== '*') {
      ind = opColumn(line, this.ctx);
      if (ind < 0) {
        const m = /^ */.exec(line)[0].length;
        ind = m === line.length ? Math.min(m, COMMENT_COL - 1) : m;
      }
    }
    const col = off - this.lineStarts[li];
    if (col <= ind && /^ *$/.test(line.slice(0, col))) ind = col;
    this.insertText('\n' + ' '.repeat(Math.max(0, ind)));
  }

  page(dir, extend) {
    const ta = this.ta;
    const n = Math.max(1, Math.floor(this.scroller.clientHeight / this.lh) - 2);
    const off = this.activeOffset();
    const li = this.lineOf(off);
    const col = off - this.lineStarts[li];
    const target = Math.max(0, Math.min(this.lines.length - 1, li + dir * n));
    const pos = this.lineStarts[target] + Math.min(col, this.lines[target].length);
    if (extend) {
      const anchor = ta.selectionDirection === 'backward' ? ta.selectionEnd : ta.selectionStart;
      if (pos < anchor) ta.setSelectionRange(pos, anchor, 'backward');
      else ta.setSelectionRange(anchor, pos, 'forward');
    } else ta.setSelectionRange(pos, pos);
    this.scroller.scrollTop += dir * n * this.lh;
    this.cursorMoved(true);
  }

  // --------------------------------------------------------- gutter

  onGutterDown(e) {
    const row = e.target.closest('.g-row');
    if (!row) return;
    e.preventDefault();
    const line = Number(row.dataset.line);
    if (e.target.classList.contains('g-num') && e.detail === 2) {
      this.revealLine(line, { select: true, center: false });
      return;
    }
    this.toggleBreakpoint(line);
  }

  toggleBreakpoint(line) {
    if (this.breakpoints.has(line)) this.breakpoints.delete(line); else this.breakpoints.add(line);
    this.render();
    if (this.opts.onBreakpoints) this.opts.onBreakpoints(this.breakpoints);
  }

  setBreakpoints(lines) {
    this.breakpoints = new Set(lines);
    this.render();
  }

  /** Error markers: [{ line, fatal, flag, message }] */
  setMarkers(errors) {
    const m = new Map();
    for (const e of errors) {
      if (!e.line) continue;
      let v = m.get(e.line);
      if (!v) m.set(e.line, (v = { fatal: false, items: [] }));
      v.fatal = v.fatal || !!e.fatal;
      v.items.push({ flag: e.flag, message: e.message });
    }
    this.markers = m;
    this.render();
  }

  /** Current execution line (null to clear). kind: 'exec' | 'error' */
  setExecLine(line, { reveal = true, kind = 'exec' } = {}) {
    this.execLine = line || null;
    this.execKind = kind;
    if (line && reveal) this.scrollToLine(line, false);
    this.render();
  }

  // --------------------------------------------------------- search

  buildFindBar() {
    const mk = (cls, tip, label, onclick) => h('button', { class: `fb-btn ${cls}`, type: 'button', 'data-tip': tip, onclick }, label);
    this.fInput = h('input', { class: 'fb-input', type: 'text', placeholder: 'Find', spellcheck: 'false' });
    this.rInput = h('input', { class: 'fb-input', type: 'text', placeholder: 'Replace with', spellcheck: 'false' });
    this.fCount = h('span', { class: 'fb-count' }, '');
    this.fCase = mk('fb-toggle', 'Match case', 'Aa', () => { this.find.caseSensitive = !this.find.caseSensitive; this.fCase.classList.toggle('on', this.find.caseSensitive); this.computeMatches(); this.render(); });
    this.fRegex = mk('fb-toggle', 'Regular expression', '.*', () => { this.find.regex = !this.find.regex; this.fRegex.classList.toggle('on', this.find.regex); this.computeMatches(); this.render(); });
    this.fExpand = h('button', { class: 'fb-btn fb-expand', type: 'button', 'data-tip': 'Show replace (Ctrl+H)', onclick: () => this.setReplaceVisible(!this.findBar.classList.contains('with-replace')) }, icon('chevronRight', 14));
    const rowFind = h('div', { class: 'fb-row' }, this.fInput, this.fCase, this.fRegex, this.fCount,
      h('button', { class: 'fb-btn', type: 'button', 'data-tip': 'Previous (Shift+Enter)', onclick: () => this.findStep(-1) }, icon('chevronUp', 14)),
      h('button', { class: 'fb-btn', type: 'button', 'data-tip': 'Next (Enter)', onclick: () => this.findStep(1) }, icon('chevronDown', 14)),
      h('button', { class: 'fb-btn', type: 'button', 'data-tip': 'Close (Esc)', onclick: () => this.closeFind() }, icon('close', 14)));
    const rowRep = h('div', { class: 'fb-row fb-replace' }, this.rInput,
      h('button', { class: 'fb-text', type: 'button', onclick: () => this.replaceOne() }, 'Replace'),
      h('button', { class: 'fb-text', type: 'button', onclick: () => this.replaceAll() }, 'All'));
    const bar = h('div', { class: 'ed-find' }, this.fExpand, h('div', { class: 'fb-rows' }, rowFind, rowRep));
    this.fInput.addEventListener('input', () => { this.find.query = this.fInput.value; this.computeMatches(true); this.render(); });
    this.rInput.addEventListener('input', () => { this.find.replace = this.rInput.value; });
    const keys = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.closeFind(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.target === this.rInput) { if (e.ctrlKey || e.altKey) this.replaceAll(); else this.replaceOne(); }
        else this.findStep(e.shiftKey ? -1 : 1);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') { e.preventDefault(); this.setReplaceVisible(true); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); this.fInput.select(); }
    };
    this.fInput.addEventListener('keydown', keys);
    this.rInput.addEventListener('keydown', keys);
    return bar;
  }

  setReplaceVisible(on) {
    this.findBar.classList.toggle('with-replace', on);
    this.fExpand.innerHTML = '';
    this.fExpand.append(icon(on ? 'chevronDown' : 'chevronRight', 14));
  }

  openFind(withReplace) {
    const ta = this.ta;
    this.find.open = true;
    this.findBar.classList.add('open');
    this.setReplaceVisible(!!withReplace);
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (sel && !sel.includes('\n')) {
      this.fInput.value = sel;
      this.find.query = sel;
    }
    this.computeMatches(true);
    this.render();
    (withReplace && this.find.query ? this.rInput : this.fInput).focus();
    this.fInput.select();
  }

  closeFind() {
    this.find.open = false;
    this.findBar.classList.remove('open');
    this.render();
    this.focus();
  }

  buildRegex() {
    const q = this.find.query;
    if (!q) return null;
    try {
      this.find.error = false;
      return new RegExp(this.find.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), this.find.caseSensitive ? 'g' : 'gi');
    } catch {
      this.find.error = true;
      return null;
    }
  }

  computeMatches(selectNearest = false) {
    const re = this.buildRegex();
    const ms = [];
    if (re) {
      const text = this.ta.value;
      let m;
      while ((m = re.exec(text)) && ms.length < MAX_MATCHES) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        ms.push({ start: m.index, end: m.index + m[0].length });
      }
    }
    this.find.matches = ms;
    if (selectNearest) {
      const pos = this.ta.selectionStart;
      const k = lowerBound(ms, pos);
      this.find.index = ms.length ? (k < ms.length ? k : 0) : -1;
      if (this.find.index >= 0) this.scrollToMatch();
    } else if (this.find.index >= ms.length) this.find.index = ms.length - 1;
    this.updateFindCount();
  }

  updateFindCount() {
    const n = this.find.matches.length;
    this.fCount.textContent = this.find.error ? 'error' : !this.find.query ? '' : n ? `${this.find.index + 1} / ${n}${n >= MAX_MATCHES ? '+' : ''}` : 'none';
    this.fCount.classList.toggle('none', !!this.find.query && !n);
  }

  scrollToMatch() {
    const m = this.find.matches[this.find.index];
    if (!m) return;
    const li = this.lineOf(m.start);
    this.scrollToLine(li + 1, false);
    const sc = this.scroller;
    const x = PAD_L + (m.start - this.lineStarts[li]) * this.cw;
    if (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = Math.max(0, x - sc.clientWidth / 3);
  }

  findStep(dir) {
    const ms = this.find.matches;
    if (!ms.length) return;
    if (this.find.index < 0) this.find.index = 0;
    else this.find.index = (this.find.index + dir + ms.length) % ms.length;
    const m = ms[this.find.index];
    this.ta.setSelectionRange(m.start, m.end);
    this.scrollToMatch();
    this.updateFindCount();
    this.render();
  }

  replacement(matchText) {
    if (!this.find.regex) return this.find.replace;
    const re = this.buildRegex();
    return matchText.replace(new RegExp(re.source, re.flags.replace('g', '')), this.find.replace);
  }

  replaceOne() {
    const ms = this.find.matches;
    if (!ms.length) return;
    if (this.find.index < 0) this.find.index = 0;
    const m = ms[this.find.index];
    const text = this.ta.value.slice(m.start, m.end);
    this.replaceRange(m.start, m.end, this.replacement(text));
    this.computeMatches();
    const k = lowerBound(this.find.matches, m.start + 1);
    this.find.index = this.find.matches.length ? k % this.find.matches.length : -1;
    this.updateFindCount();
    if (this.find.index >= 0) {
      const n = this.find.matches[this.find.index];
      this.ta.setSelectionRange(n.start, n.end);
      this.scrollToMatch();
    }
    this.render();
    this.fInput.focus();
  }

  replaceAll() {
    const re = this.buildRegex();
    if (!re) return;
    const text = this.ta.value;
    const out = text.replace(re, this.find.regex ? this.find.replace : () => this.find.replace);
    if (out === text) return;
    const n = this.find.matches.length;
    this.replaceRange(0, text.length, out);
    this.computeMatches();
    this.render();
    if (this.opts.onCommand) this.opts.onCommand('replacedAll', n);
  }

  dispose() {
    if (this.ro) this.ro.disconnect();
    this.el.remove();
  }
}

/** First index k such that ms[k].start >= pos. */
function lowerBound(ms, pos) {
  let lo = 0, hi = ms.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ms[mid].start < pos) lo = mid + 1; else hi = mid;
  }
  return lo;
}
