// Mise en page : groupes d'onglets et séparateurs redimensionnables.

import { h, icon, store } from './dom.js';

/**
 * Groupe d'onglets. Chaque onglet : { id, label, icon, panel } où panel
 * possède `el` et, éventuellement, onShow() / onHide().
 */
export class Tabs {
  constructor(host, { key, cls = '', actions = null } = {}) {
    this.key = key;
    this.tabs = new Map();
    this.active = null;
    this.onChange = null;
    this.saved = key ? store.get(`cdc6600-ide/tab/${key}`) : null;
    this.strip = h('div', { class: 'tab-strip', role: 'tablist' });
    this.actions = h('div', { class: 'tab-actions' });
    if (actions) this.actions.append(...actions);
    this.body = h('div', { class: 'tab-body' });
    this.el = h('div', { class: `tabs ${cls}` }, h('div', { class: 'tab-bar' }, this.strip, this.actions), this.body);
    host.append(this.el);
    this.strip.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { this.strip.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
  }

  add({ id, label, icon: ic, panel, badge = false }) {
    const btn = h('button', { class: 'tab', type: 'button', role: 'tab', dataset: { id }, onclick: () => this.select(id) },
      ic ? icon(ic, 15) : null, h('span', { class: 'tab-label' }, label));
    const badgeEl = h('span', { class: 'tab-badge' });
    if (badge) btn.append(badgeEl);
    const pane = h('div', { class: 'tab-pane', role: 'tabpanel' }, panel.el);
    this.strip.append(btn);
    this.body.append(pane);
    this.tabs.set(id, { id, btn, pane, panel, badgeEl });
    if (!this.active || this.saved === id) this.select(id, true);
    return this;
  }

  select(id, silent = false) {
    const t = this.tabs.get(id);
    if (!t) return;
    if (this.active === id) {
      if (t.panel.onShow) t.panel.onShow();
      return;
    }
    const prev = this.tabs.get(this.active);
    if (prev) {
      prev.btn.classList.remove('active');
      prev.btn.setAttribute('aria-selected', 'false');
      prev.pane.classList.remove('active');
      if (prev.panel.onHide) prev.panel.onHide();
    }
    this.active = id;
    t.btn.classList.add('active');
    t.btn.setAttribute('aria-selected', 'true');
    t.pane.classList.add('active');
    t.btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (this.key) store.set(`cdc6600-ide/tab/${this.key}`, id);
    if (t.panel.onShow) t.panel.onShow();
    if (!silent && this.onChange) this.onChange(id);
  }

  /** Pastille sur un onglet (nombre d'erreurs, activité...). */
  setBadge(id, text, kind = '') {
    const t = this.tabs.get(id);
    if (!t) return;
    t.badgeEl.textContent = text || '';
    t.badgeEl.className = `tab-badge ${text ? 'show' : ''} ${kind}`;
  }

  activePanel() {
    const t = this.tabs.get(this.active);
    return t ? t.panel : null;
  }
}

/**
 * Séparateur redimensionnable.
 * @param el      l'élément séparateur
 * @param target  l'élément dont on règle la taille
 * @param opts    { axis: 'x'|'y', invert, min, max, key, onResize }
 */
export function makeSplitter(el, target, { axis = 'x', invert = false, min = 120, max = 2000, key = null, onResize = null } = {}) {
  const prop = axis === 'x' ? 'width' : 'height';
  if (key) {
    const saved = store.get(`cdc6600-ide/split/${key}`);
    if (typeof saved === 'number') target.style[prop] = `${saved}px`;
  }
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const start = axis === 'x' ? e.clientX : e.clientY;
    const size0 = target.getBoundingClientRect()[prop];
    document.body.classList.add(axis === 'x' ? 'resizing-x' : 'resizing-y');
    el.classList.add('dragging');
    const move = (ev) => {
      const d = (axis === 'x' ? ev.clientX : ev.clientY) - start;
      const lim = typeof max === 'function' ? max() : max;
      const size = Math.max(min, Math.min(lim, size0 + (invert ? -d : d)));
      target.style[prop] = `${size}px`;
      if (onResize) onResize(size);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing-x', 'resizing-y');
      el.classList.remove('dragging');
      if (key) store.set(`cdc6600-ide/split/${key}`, Math.round(target.getBoundingClientRect()[prop]));
      if (onResize) onResize(target.getBoundingClientRect()[prop]);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
  el.addEventListener('dblclick', () => {
    target.classList.toggle('collapsed');
    if (onResize) onResize(target.getBoundingClientRect()[prop]);
  });
}
