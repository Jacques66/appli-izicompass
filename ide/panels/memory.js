// Central memory panel: virtual view of the 60-bit words, editing,
// watchpoints (stop on write).

import { h, esc, o, o60, parseOctal } from '../dom.js';
import { VirtualList, toolbar, tbtn, tinput, inlineEdit } from './common.js';
import { segmented, toast } from '../ui.js';
import { wordToDisplay } from '../../src/common/charset.js';
import { interpret, parseWord } from './cpu.js';

export class MemoryPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.relative = false;
    this.interp = 'text';
    this.last = new Map();     // address -> value displayed the previous time
    this.flash = new Set();
    this.selected = -1;
    this.vlist = new VirtualList({
      rowHeight: 21, cls: 'memlist mono',
      render: (i) => this.row(i),
      onClick: (i, e) => this.click(i, e),
      onDblClick: (i, e) => this.edit(i, e),
    });
    this.goto = tinput({ placeholder: 'address (octal)', width: 120, onenter: (v) => this.gotoText(v) });
    this.modeSel = segmented([['abs', 'Absolute'], ['rel', 'Relative to RA']], 'abs', (v) => { this.relative = v === 'rel'; this.resize(); });
    this.interpSel = segmented([['text', 'Display'], ['auto', 'Number'], ['int', 'Integer'], ['float', 'Float']], this.interp, (v) => { this.interp = v; this.vlist.refresh(); });
    this.info = h('span', { class: 'ptool-dim' });
    this.el = h('div', { class: 'panel panel-memory' },
      toolbar(this.goto,
        tbtn('P', () => this.gotoAddr(this.ctx.machine.cpu.absolute(this.ctx.machine.cpu.P), true), { tip: 'Go to the word addressed by P' }),
        tbtn('RA', () => this.gotoAddr(this.ctx.machine.cpu.RA, true), { tip: 'Go to the start of the program field' }),
        tbtn('', () => this.toggleWatch(this.selected), { icon: 'eye', tip: 'Watch the selected word (stop on write)' }),
        h('div', { class: 'grow' }), this.modeSel, this.interpSel),
      h('div', { class: 'mem-head mono' }, h('span', { class: 'm-w' }, ''), h('span', { class: 'm-a' }, 'Address'), h('span', { class: 'm-o' }, 'Contents (octal)'), h('span', { class: 'm-t' }, 'Interpretation')),
      this.vlist.el,
      h('div', { class: 'ptool ptool-foot' }, this.info));
    this.resize();
  }

  /** Row count: whole CM (absolute) or FL (relative). */
  resize() {
    const m = this.ctx.machine;
    const n = this.relative ? Math.max(1, Math.min(m.cpu.FL || m.cmSize, m.cmSize)) : m.cmSize;
    this.vlist.setCount(n);
    this.info.textContent = `${m.cmSize.toLocaleString('en-US')} 60-bit words (${o(m.cmSize)}B)` + (m.ecsSize ? ` · ECS ${m.ecsSize.toLocaleString('en-US')} words` : '');
  }

  addrOf(i) {
    const m = this.ctx.machine;
    return this.relative ? (m.cpu.RA + i) % m.cmSize : i;
  }

  row(i) {
    const m = this.ctx.machine;
    const a = this.addrOf(i);
    const w = m.cm[a];
    const cpu = m.cpu;
    const pAbs = cpu.absolute(cpu.P);
    const watch = m.watchpoints.has(a);
    const prev = this.last.get(a);
    const changed = prev !== undefined && prev !== w;
    this.last.set(a, w);
    if (this.last.size > 4000) this.last.clear();
    const inField = a >= cpu.RA && a < cpu.RA + cpu.FL;
    const cls = `${a === pAbs && this.ctx.runner.kind === 'cpu' ? 'is-p' : ''} ${watch ? 'watch' : ''} ${changed ? 'chg' : ''} ${i === this.selected ? 'sel' : ''} ${w === 0n ? 'zero' : ''} ${inField ? '' : 'out'}`;
    const t = w === 0n ? '' : this.interp === 'text' ? wordToDisplay(w) : interpret(w, this.interp);
    const sym = this.ctx.runner.kind === 'cpu' ? this.ctx.symbolMap().get(a - cpu.RA) : null;
    return `<div class="m-row ${cls}"><span class="m-w" data-tip="${watch ? 'Watched' : 'Click to watch'}"></span>`
      + `<span class="m-a">${o(this.relative ? i : a, 6)}${sym ? `<em>${esc(sym)}</em>` : ''}</span>`
      + `<span class="m-o" data-i="${i}">${o60(w)}</span><span class="m-t">${esc(t)}</span></div>`;
  }

  click(i, e) {
    if (e.target.closest('.m-w')) {
      this.toggleWatch(i);
      return;
    }
    this.selected = i;
    this.vlist.refresh();
  }

  toggleWatch(i) {
    if (i < 0) { toast('Select a word first.', 'info'); return; }
    const m = this.ctx.machine;
    const a = this.addrOf(i);
    if (m.watchpoints.has(a)) m.watchpoints.delete(a);
    else m.watchpoints.add(a);
    this.ctx.log(`Watchpoint ${m.watchpoints.has(a) ? 'set' : 'removed'} at ${o(a, 6)}B.`);
    this.vlist.refresh();
  }

  edit(i, e) {
    const cell = e.target.closest('.m-o');
    if (!cell) return;
    const m = this.ctx.machine;
    const a = this.addrOf(i);
    inlineEdit(cell, o60(m.cm[a]), (v) => {
      const w = parseWord(v);
      if (w === null) { toast('Invalid value: octal (20 digits), integer with a D suffix, or floating-point.', 'warn'); return false; }
      m.cm[a] = w;
      this.ctx.log(`Word ${o(a, 6)}B modified.`);
      setTimeout(() => this.vlist.refresh());
      return true;
    }, { width: '100%' });
  }

  gotoText(v) {
    const a = parseOctal(v);
    if (a === null) { toast('Invalid octal address.', 'warn'); return; }
    this.gotoAddr(Number(a), false);
  }

  gotoAddr(abs, isAbsolute) {
    const m = this.ctx.machine;
    let i = abs;
    if (this.relative && isAbsolute) i = abs - m.cpu.RA;
    i = Math.max(0, Math.min(this.vlist.count - 1, i));
    this.selected = i;
    this.vlist.scrollToIndex(i, true);
  }

  onShow() {
    this.resize();
  }

  update(force = false) {
    if (!force && !this.el.offsetParent) return;
    this.vlist.refresh();
  }
}
