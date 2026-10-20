// Panneau de la console 6612 (écrans cathodiques + clavier) et panneau de deadstart.

import { h, icon, o, parseOctal } from '../dom.js';
import { toolbar, tbtn } from './common.js';
import { segmented, select, toast } from '../ui.js';
import { CrtConsole, PHOSPHOR_NAMES } from '../console-canvas.js';
import { disasmPP } from '../../src/pp/disasm.js';
import { DEMO_DEADSTART } from '../../src/runtime/runner.js';

export class ConsolePanel {
  constructor(ctx) {
    this.ctx = ctx;
    const s = ctx.settings;
    this.canvas = h('canvas', { class: 'crt-canvas', tabindex: '0', 'aria-label': 'Console 6612 : cliquez puis tapez au clavier' });
    this.crt = new CrtConsole(this.canvas, { phosphor: s.phosphor || 'green', persistence: s.persistence || 50000 });
    this.crt.setView(s.consoleView || 'both');
    this.kbd = h('div', { class: 'kbd-state' }, icon('keyboard', 15), h('span', null, 'Clavier inactif — cliquez sur un écran'));
    this.coords = h('span', { class: 'crt-coords mono' });
    this.lastKeys = h('span', { class: 'crt-keys mono' });
    const view = segmented([['both', 'Deux écrans'], ['left', 'Gauche'], ['right', 'Droit']], this.crt.view, (v) => { this.crt.setView(v); s.consoleView = v; ctx.saveSettings(); this.draw(); });
    const ph = select(Object.entries(PHOSPHOR_NAMES), this.crt.phosphor, (v) => { this.crt.setPhosphor(v); s.phosphor = v; ctx.saveSettings(); this.draw(); });
    const pers = select([['20000', 'Rémanence courte'], ['50000', 'Rémanence normale'], ['150000', 'Rémanence longue']], String(this.crt.persistence), (v) => { this.crt.persistence = Number(v); s.persistence = Number(v); ctx.saveSettings(); this.draw(); });
    this.wrap = h('div', { class: 'crt-wrap' }, this.canvas);
    this.el = h('div', { class: 'panel panel-console' },
      toolbar(view, ph, pers, h('div', { class: 'grow' }), tbtn('Effacer', () => { ctx.machine.console.trace.length = 0; this.draw(); }, { icon: 'trash', tip: 'Effacer les tracés mémorisés' })),
      this.wrap,
      h('div', { class: 'crt-foot' }, this.kbd, this.lastKeys, h('div', { class: 'grow' }), this.coords));

    this.canvas.addEventListener('mousedown', () => this.canvas.focus());
    this.canvas.addEventListener('focus', () => this.setKbd(true));
    this.canvas.addEventListener('blur', () => this.setKbd(false));
    this.canvas.addEventListener('keydown', (e) => this.onKey(e));
    this.canvas.addEventListener('mousemove', (e) => {
      const t = this.crt.hitTest(e.clientX, e.clientY);
      this.coords.textContent = t ? `${t.screen ? 'droit' : 'gauche'}  X=${o(t.x, 3)}B  Y=${o(t.y, 3)}B` : '';
    });
    this.canvas.addEventListener('mouseleave', () => { this.coords.textContent = ''; });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { this.crt.layout = null; this.draw(); }).observe(this.wrap);
    this.typed = '';
  }

  setKbd(on) {
    this.kbd.classList.toggle('on', on);
    this.kbd.querySelector('span').textContent = on ? 'Clavier actif : les touches vont à la console 6612' : 'Clavier inactif — cliquez sur un écran';
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

/** Panneau de deadstart : 16 mots de 12 interrupteurs. */
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
      if (v === null || v > 0o7777n) { toast('Mot octal de 12 bits attendu (0 à 7777).', 'warn'); inp.value = o(this.words[Number(inp.dataset.r)], 4); return; }
      this.words[Number(inp.dataset.r)] = Number(v);
      this.changed();
    });
    this.el = h('div', { class: 'panel panel-deadstart scroll' },
      toolbar(
        tbtn('Deadstart', () => ctx.deadstart(this.words.slice()), { icon: 'play', cls: 'primary', tip: 'Charge le panneau dans PP0 (à partir de 1) et lance la machine' }),
        tbtn('Programme de démonstration', () => { this.words = DEMO_DEADSTART.slice(); while (this.words.length < 16) this.words.push(0); this.changed(); }, { icon: 'monitor', tip: 'Affiche « CDC 6600 » sur l\'écran gauche' }),
        tbtn('Tout à zéro', () => { this.words.fill(0); this.changed(); }, { icon: 'trash' })),
      h('div', { class: 'note' }, 'Au deadstart, chaque PP exécute IAM 10000B sur son canal. Les mots du panneau arrivent par le canal 0 et sont rangés dans PP0 à partir de l\'adresse 1, puis PP0 démarre en 1. Les interrupteurs sont groupés par chiffre octal.'),
      h('div', { class: 'ds-head mono' }, h('span', null, 'Adr.'), h('span', { class: 'ds-head-sw' }, ...[11, 8, 5, 2].map((b) => h('span', null, `${b}…${b - 2}`))), h('span', null, 'Octal'), h('span', null, 'Instruction PP')),
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
      if (skip) { dis = '<span class="dim">(suite)</span>'; skip--; }
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
