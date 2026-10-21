// 6612 console panel (CRT screens + keyboard) and deadstart panel.

import { h, icon, o, parseOctal } from '../dom.js';
import { toolbar, tbtn } from './common.js';
import { segmented, select, toast } from '../ui.js';
import { CrtConsole, PHOSPHOR_NAMES } from '../console-canvas.js';
import { disasmPP } from '../../src/pp/disasm.js';
import { DEMO_DEADSTART } from '../../src/runtime/runner.js';
import { DEADSTART_PANEL } from '../../src/os/dsl.js';

export class ConsolePanel {
  constructor(ctx) {
    this.ctx = ctx;
    const s = ctx.settings;
    this.canvas = h('canvas', { class: 'crt-canvas', tabindex: '0', 'aria-label': '6612 console: click, then type on the keyboard' });
    this.crt = new CrtConsole(this.canvas, { phosphor: s.phosphor || 'green', persistence: s.persistence || 50000 });
    this.crt.setView(s.consoleView || 'both');
    this.kbd = h('div', { class: 'kbd-state' }, icon('keyboard', 15), h('span', null, 'Keyboard inactive — click a screen'));
    this.coords = h('span', { class: 'crt-coords mono' });
    this.lastKeys = h('span', { class: 'crt-keys mono' });
    const view = segmented([['both', 'Both screens'], ['left', 'Left'], ['right', 'Right']], this.crt.view, (v) => { this.crt.setView(v); s.consoleView = v; ctx.saveSettings(); this.draw(); });
    const ph = select(Object.entries(PHOSPHOR_NAMES), this.crt.phosphor, (v) => { this.crt.setPhosphor(v); s.phosphor = v; ctx.saveSettings(); this.draw(); });
    const pers = select([['20000', 'Short persistence'], ['50000', 'Normal persistence'], ['150000', 'Long persistence']], String(this.crt.persistence), (v) => { this.crt.persistence = Number(v); s.persistence = Number(v); ctx.saveSettings(); this.draw(); });
    this.wrap = h('div', { class: 'crt-wrap' }, this.canvas);
    this.el = h('div', { class: 'panel panel-console' },
      toolbar(view, ph, pers, h('div', { class: 'grow' }), tbtn('Clear', () => { ctx.machine.console.trace.length = 0; this.draw(); }, { icon: 'trash', tip: 'Clear the stored traces' })),
      this.wrap,
      h('div', { class: 'crt-foot' }, this.kbd, this.lastKeys, h('div', { class: 'grow' }), this.coords));

    this.canvas.addEventListener('mousedown', () => this.canvas.focus());
    this.canvas.addEventListener('focus', () => this.setKbd(true));
    this.canvas.addEventListener('blur', () => this.setKbd(false));
    this.canvas.addEventListener('keydown', (e) => this.onKey(e));
    this.canvas.addEventListener('mousemove', (e) => {
      const t = this.crt.hitTest(e.clientX, e.clientY);
      this.coords.textContent = t ? `${t.screen ? 'right' : 'left'}  X=${o(t.x, 3)}B  Y=${o(t.y, 3)}B` : '';
    });
    this.canvas.addEventListener('mouseleave', () => { this.coords.textContent = ''; });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { this.crt.layout = null; this.draw(); }).observe(this.wrap);
    this.typed = '';
  }

  setKbd(on) {
    this.kbd.classList.toggle('on', on);
    this.kbd.querySelector('span').textContent = on ? 'Keyboard active: keys go to the 6612 console' : 'Keyboard inactive — click a screen';
  }

  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^F\d+$/.test(e.key)) return;
    const con = this.ctx.machine.console;
    let k = null;
    if (e.key === 'Enter') k = 'Enter';
    else if (e.key === 'Backspace') k = 'Backspace';
    else if (e.key.length === 1) k = e.key;
    if (k === null) return;
    e.preventDefault();
    e.stopPropagation();
    con.keyPress(k);
    this.typed = (this.typed + (k === 'Enter' ? '⏎' : k === 'Backspace' ? '⌫' : k.toUpperCase())).slice(-24);
    this.lastKeys.textContent = this.typed;
  }

  draw() {
    const m = this.ctx.machine;
    this.crt.draw(m.console.visible(m.time, this.crt.persistence), m.time);
  }

  onShow() {
    this.crt.layout = null;
    this.draw();
  }

  update(force = false) {
    if (!force && !this.el.offsetParent) return;
    this.draw();
  }
}

// -------------------------------------------------------------- deadstart

/** Deadstart panel: 16 words of 12 switches. */
export class DeadstartPanel {
  constructor(ctx) {
    this.ctx = ctx;
    const saved = ctx.settings.deadstart;
    this.words = (Array.isArray(saved) && saved.length ? saved : DEMO_DEADSTART).slice(0, 16);
    while (this.words.length < 16) this.words.push(0);
    this.rows = h('div', { class: 'ds-rows' });
    this.rows.addEventListener('click', (e) => {
      const sw = e.target.closest('.ds-sw');
      if (!sw) return;
      const r = Number(sw.dataset.r), b = Number(sw.dataset.b);
      this.words[r] ^= 1 << b;
      this.changed();
    });
    this.rows.addEventListener('change', (e) => {
      const inp = e.target.closest('.ds-oct');
      if (!inp) return;
      const v = parseOctal(inp.value);
      if (v === null || v > 0o7777n) { toast('12-bit octal word expected (0 to 7777).', 'warn'); inp.value = o(this.words[Number(inp.dataset.r)], 4); return; }
      this.words[Number(inp.dataset.r)] = Number(v);
      this.changed();
    });
    this.el = h('div', { class: 'panel panel-deadstart scroll' },
      toolbar(
        tbtn('Deadstart', () => ctx.deadstart(this.words.slice()), { icon: 'play', cls: 'primary', tip: 'Loads the panel into PP0 (from address 1) and starts the machine' }),
        tbtn('Demonstration program', () => { this.words = DEMO_DEADSTART.slice(); while (this.words.length < 16) this.words.push(0); this.changed(); }, { icon: 'monitor', tip: 'Displays "CDC 6600" on the left screen' }),
        tbtn('System panel', () => { this.words = DEADSTART_PANEL.slice(); while (this.words.length < 16) this.words.push(0); this.changed(); }, { icon: 'tape', tip: 'System tape loader: DCN 13B; FNC 2000B,13B; FNC 2020B,13B; ACN 13B; LDC 1000B; IAM 7000B,13B; LJM 7000B\nUsed by the "System (tape deadstart)" mode with the tape on unit 0' }),
        tbtn('All zeros', () => { this.words.fill(0); this.changed(); }, { icon: 'trash' })),
      h('div', { class: 'note' }, 'At deadstart, each PP executes IAM 10000B on its channel. The panel words arrive on channel 0 and are stored in PP0 from address 1, then PP0 starts at 1. The switches are grouped by octal digit.'),
      h('div', { class: 'ds-head mono' }, h('span', null, 'Addr.'), h('span', { class: 'ds-head-sw' }, ...[11, 8, 5, 2].map((b) => h('span', null, `${b}…${b - 2}`))), h('span', null, 'Octal'), h('span', null, 'PP instruction')),
      this.rows);
    this.render();
  }

  changed() {
    this.ctx.settings.deadstart = this.words.slice();
    this.ctx.saveSettings();
    this.render();
  }

  render() {
    const mem = new Uint16Array(4096);
    this.words.forEach((w, i) => { mem[i + 1] = w; });
    let html = '';
    let skip = 0;
    for (let r = 0; r < 16; r++) {
      const w = this.words[r];
      let sw = '';
      for (let g = 0; g < 4; g++) {
        sw += '<span class="ds-grp">';
        for (let k = 0; k < 3; k++) {
          const b = 11 - g * 3 - k;
          sw += `<button type="button" class="ds-sw ${w & (1 << b) ? 'on' : ''}" data-r="${r}" data-b="${b}" aria-label="bit ${b}"></button>`;
        }
        sw += '</span>';
      }
      let dis = '';
      if (skip) { dis = '<span class="dim">(cont.)</span>'; skip--; }
      else {
        const d = disasmPP(mem, r + 1);
        dis = d.text;
        if (d.length === 2) skip = 1;
      }
      html += `<div class="ds-row"><span class="ds-addr mono">${o(r + 1, 2)}</span><span class="ds-sws">${sw}</span>`
        + `<input class="ds-oct mono" data-r="${r}" value="${o(w, 4)}" maxlength="4" spellcheck="false">`
        + `<span class="ds-dis mono">${dis}</span></div>`;
    }
    this.rows.innerHTML = html;
  }

  onShow() {}

  update() {}
}
