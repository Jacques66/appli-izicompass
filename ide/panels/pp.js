// Peripheral processor panel (10 PPs) and channels panel.

import { h, esc, o, parseOctal } from '../dom.js';
import { VirtualList, section, tbtn, tinput, inlineEdit } from './common.js';
import { toast } from '../ui.js';
import { disasmPP } from '../../src/pp/disasm.js';
import { DISPLAY } from '../../src/common/charset.js';

/** State of a PP as readable text. */
export function ppState(pp) {
  if (pp.stopped) return { cls: 'stopped', text: 'stopped' };
  if (pp.exchanging) return { cls: 'wait', text: 'CPU exchange' };
  if (pp.hungOn) return { cls: 'hung', text: `waiting on ${pp.hungOn}` };
  if (pp.busy) return { cls: 'busy', text: 'transfer' };
  return { cls: 'run', text: 'running' };
}

/** Finds a start address from which the disassembly lands exactly on P. */
function alignedStart(mem, P, back = 10) {
  for (let s = Math.max(0, P - back); s < P; s++) {
    let a = s;
    while (a < P) a += disasmPP(mem, a).length;
    if (a === P) return s;
  }
  return P;
}

export class PpPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.sel = 0;
    this.memSel = -1;
    this.grid = h('div', { class: 'pp-grid' });
    this.grid.addEventListener('click', (e) => {
      const c = e.target.closest('[data-pp]');
      if (c) { this.select(Number(c.dataset.pp)); }
    });
    this.detailHead = h('div', { class: 'pp-detail-head' });
    this.dis = h('div', { class: 'disasm mono pp-dis' });
    this.dis.addEventListener('click', (e) => {
      const r = e.target.closest('[data-a]');
      if (!r) return;
      const a = Number(r.dataset.a);
      if (e.target.closest('.d-bp') || e.target.closest('.d-addr')) {
        const on = this.ctx.runner.togglePpAddressBreakpoint(this.sel, a);
        this.ctx.log(`PP${o(this.sel, 2)} breakpoint ${on ? 'set' : 'removed'} at ${o(a, 4)}B.`);
        this.update(true);
      } else if (r.dataset.line) this.ctx.revealSource(Number(r.dataset.line));
    });
    this.memList = new VirtualList({
      rowHeight: 20, cls: 'memlist ppmem mono', count: 512,
      render: (i) => this.memRow(i),
      onDblClick: (i, e) => this.editMem(i, e),
    });
    this.memGoto = tinput({ placeholder: 'address', width: 80, onenter: (v) => { const a = parseOctal(v); if (a !== null) this.memList.scrollToIndex(Number(a & 0o7777n) >> 3, true); } });
    this.stepBtn = tbtn('Step PP', () => this.ctx.stepPP(this.sel), { icon: 'stepPp', tip: 'Execute one instruction of this PP (Shift+F10)' });
    this.secDetail = section('Selected PP', h('div', null, this.detailHead, this.dis), { key: 'pp-detail', actions: [this.stepBtn] });
    this.secMem = section('PP memory (4096 12-bit words)', this.memList.el, { key: 'pp-mem', actions: [this.memGoto] });
    this.el = h('div', { class: 'panel panel-pp scroll' }, section('Barrel of the 10 PPs', this.grid, { key: 'pp-grid' }), this.secDetail, this.secMem);
  }

  select(n) {
    this.sel = n;
    this.update(true);
    this.memList.refresh();
  }

  onShow() {
    this.update(true);
  }

  update(force = false) {
    if (!force && !this.el.offsetParent) return;
    const m = this.ctx.machine;
    const runner = this.ctx.runner;
    let g = '';
    m.pps.forEach((pp, n) => {
      const st = ppState(pp);
      const d = disasmPP(pp.mem, pp.busy ? pp.lastP : pp.P);
      const main = runner.kind === 'pp' && runner.ppNumber === n || runner.kind === 'deadstart' && n === 0;
      g += `<button type="button" class="pp-card ${n === this.sel ? 'sel' : ''} ${main ? 'main' : ''}" data-pp="${n}">`
        + `<div class="pp-card-h"><span class="pp-name">PP${o(n, 2)}</span><span class="dot ${st.cls}" data-tip="${esc(st.text)}"></span></div>`
        + `<div class="pp-card-r mono"><span>P</span>${o(pp.P, 4)}<span>A</span>${o(pp.A, 6)}</div>`
        + `<div class="pp-card-i mono">${esc(pp.stopped ? '—' : d.text)}</div></button>`;
    });
    this.grid.innerHTML = g;

    const pp = m.pps[this.sel];
    const st = ppState(pp);
    this.detailHead.innerHTML = `<div class="pp-regs mono">`
      + `<span><b>PP${o(this.sel, 2)}</b></span><span>P <b>${o(pp.P, 4)}</b></span><span>A <b>${o(pp.A, 6)}</b></span>`
      + `<span>Q <b>${o(pp.Q, 4)}</b></span><span>K <b>${o(pp.K, 4)}</b></span>`
      + `<span>instr. <b>${pp.instructions.toLocaleString('en-US')}</b></span></div>`
      + `<div class="pp-status"><span class="dot ${st.cls}"></span>${esc(st.text)}</div>`;
    this.renderDisasm(pp);
    if (!this.secMem.classList.contains('closed')) this.memList.refresh();
  }

  renderDisasm(pp) {
    const runner = this.ctx.runner;
    const cur = pp.busy ? pp.lastP : pp.P;
    const start = alignedStart(pp.mem, cur);
    const isMain = runner.kind === 'pp' && runner.ppNumber === this.sel;
    const syms = isMain ? this.ctx.symbolMap() : new Map();
    const symbol = (a) => syms.get(a) || null;
    let a = start;
    let html = '';
    for (let k = 0; k < 22; k++) {
      const d = disasmPP(pp.mem, a, { symbol });
      const bp = runner.hasPpBreakpoint(this.sel, a);
      const lab = syms.get(a);
      const line = isMain ? runner.lineOfAddress(a) : null;
      if (lab) html += `<div class="d-label">${esc(lab)}</div>`;
      const oc = d.length === 2 ? `${o(pp.mem[a], 4)} ${o(pp.mem[(a + 1) & 0o7777], 4)}` : o(pp.mem[a], 4);
      html += `<div class="d-row ${a === cur ? 'cur' : ''}" data-a="${a}" ${line ? `data-line="${line}"` : ''}>`
        + `<span class="d-bp ${bp ? 'on' : ''}"></span><span class="d-addr">${o(a, 4)}</span>`
        + `<span class="d-oct">${oc}</span><span class="d-txt">${esc(d.text)}</span>`
        + `<span class="d-src">${line ? `l.${line}` : ''}</span></div>`;
      a = (a + d.length) & 0o7777;
    }
    this.dis.innerHTML = html;
  }

  memRow(i) {
    const pp = this.ctx.machine.pps[this.sel];
    const base = i * 8;
    let cells = '', text = '';
    for (let k = 0; k < 8; k++) {
      const a = base + k;
      const w = pp.mem[a];
      cells += `<span class="pw ${a === pp.P ? 'is-p' : ''} ${w ? '' : 'zero'}" data-a="${a}">${o(w, 4)}</span>`;
      text += DISPLAY[(w >> 6) & 0o77] + DISPLAY[w & 0o77];
    }
    return `<div class="m-row"><span class="m-a">${o(base, 4)}</span><span class="pws">${cells}</span><span class="m-t">${esc(text)}</span></div>`;
  }

  editMem(i, e) {
    const cell = e.target.closest('.pw');
    if (!cell) return;
    const a = Number(cell.dataset.a);
    const pp = this.ctx.machine.pps[this.sel];
    inlineEdit(cell, o(pp.mem[a], 4), (v) => {
      const n = parseOctal(v);
      if (n === null || n > 0o7777n) { toast('12-bit octal value expected.', 'warn'); return false; }
      pp.mem[a] = Number(n);
      setTimeout(() => { this.memList.refresh(); this.update(true); });
      return true;
    }, { width: '44px' });
  }
}

// -------------------------------------------------------------- channels

export class ChannelsPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.body = h('tbody');
    this.el = h('div', { class: 'panel panel-channels scroll' },
      h('div', { class: 'table-wrap' }, h('table', { class: 'grid-table channels' },
        h('thead', null, h('tr', null, ...['Channel', 'Active', 'Full', 'Data', 'Last function', 'Selected equipment', 'Connected'].map((t) => h('th', null, t)))),
        this.body)),
      h('div', { class: 'note' }, 'A channel is "active" when a connection is established (ACN, or automatically after FNC on some equipment) and "full" when a 12-bit word is waiting on it. Channels 0 to 13B are standard on the 6600; 14B carries the real-time clock.'));
  }

  onShow() {
    this.update(true);
  }

  update(force = false) {
    if (!force && !this.el.offsetParent) return;
    const m = this.ctx.machine;
    let html = '';
    for (const ch of m.channels) {
      const used = ch.devices.length || ch.active;
      html += `<tr class="${used ? '' : 'dim'}"><td class="mono strong">${o(ch.id, 2)}B</td>`
        + `<td><span class="dot ${ch.active ? 'run' : 'off'}"></span></td>`
        + `<td><span class="dot ${ch.full ? 'busy' : 'off'}"></span></td>`
        + `<td class="mono">${o(ch.data & 0o7777, 4)}</td>`
        + `<td class="mono">${ch.lastFunction === null || ch.lastFunction === undefined ? '—' : `${o(ch.lastFunction, 4)}B`}</td>`
        + `<td>${esc(ch.ioDevice ? ch.ioDevice.name : '—')}</td>`
        + `<td class="dim">${esc(ch.devices.map((d) => d.name).join(', ') || '—')}</td></tr>`;
    }
    this.body.innerHTML = html;
  }
}

