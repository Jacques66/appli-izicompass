// Shared panel elements: virtual list, collapsible sections, toolbars.

import { h, icon, store } from '../dom.js';

/**
 * Virtual list with a fixed row height: only the visible rows are built
 * (central memory of 131072 words, listings of thousands of lines).
 */
export class VirtualList {
  constructor({ rowHeight = 20, count = 0, render, cls = '', onClick = null, onDblClick = null, onContext = null }) {
    this.rowHeight = rowHeight;
    this.count = count;
    this.renderRow = render;
    this.inner = h('div', { class: 'vl-inner' });
    this.rows = h('div', { class: 'vl-rows' });
    this.inner.append(this.rows);
    this.el = h('div', { class: `vlist ${cls}` }, this.inner);
    this.el.style.setProperty('--row-h', `${rowHeight}px`);
    this.queued = false;
    this.el.addEventListener('scroll', () => this.queue());
    const idx = (e) => {
      const r = e.target.closest('.vl-row');
      return r ? Number(r.dataset.i) : -1;
    };
    if (onClick) this.el.addEventListener('click', (e) => { const i = idx(e); if (i >= 0) onClick(i, e); });
    if (onDblClick) this.el.addEventListener('dblclick', (e) => { const i = idx(e); if (i >= 0) onDblClick(i, e); });
    if (onContext) this.el.addEventListener('contextmenu', (e) => { const i = idx(e); if (i >= 0) { e.preventDefault(); onContext(i, e); } });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.refresh()).observe(this.el);
    this.setCount(count);
  }

  setCount(n) {
    this.count = n;
    this.inner.style.height = `${n * this.rowHeight}px`;
    this.refresh();
  }

  queue() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.refresh();
    });
  }

  range() {
    const top = this.el.scrollTop;
    const hgt = this.el.clientHeight || 400;
    const first = Math.max(0, Math.floor(top / this.rowHeight) - 4);
    const last = Math.min(this.count - 1, Math.ceil((top + hgt) / this.rowHeight) + 4);
    return [first, last];
  }

  refresh() {
    const [first, last] = this.range();
    let html = '';
    for (let i = first; i <= last; i++) html += `<div class="vl-row" data-i="${i}">${this.renderRow(i)}</div>`;
    this.rows.style.transform = `translateY(${first * this.rowHeight}px)`;
    this.rows.innerHTML = html;
  }

  scrollToIndex(i, center = true) {
    const y = i * this.rowHeight;
    const hgt = this.el.clientHeight;
    if (!center && y >= this.el.scrollTop && y + this.rowHeight <= this.el.scrollTop + hgt) return;
    this.el.scrollTop = Math.max(0, center ? y - hgt / 2 + this.rowHeight : y);
    this.refresh();
  }
}

/** Collapsible section with a title and actions. */
export function section(title, body, { key = null, actions = [], open = true, cls = '' } = {}) {
  const saved = key ? store.get(`cdc6600-ide/section/${key}`) : null;
  const isOpen = saved === null ? open : saved;
  const chevron = icon('chevronDown', 14, 'sec-chevron');
  const head = h('div', { class: 'sec-head' },
    h('button', { class: 'sec-toggle', type: 'button' }, chevron, h('span', { class: 'sec-title' }, title)),
    h('div', { class: 'sec-actions' }, ...actions));
  const el = h('section', { class: `sec ${isOpen ? '' : 'closed'} ${cls}` }, head, h('div', { class: 'sec-body' }, body));
  head.querySelector('.sec-toggle').addEventListener('click', () => {
    el.classList.toggle('closed');
    if (key) store.set(`cdc6600-ide/section/${key}`, !el.classList.contains('closed'));
  });
  return el;
}

/** Panel toolbar. */
export function toolbar(...items) {
  return h('div', { class: 'ptool' }, ...items);
}

/** Small text toolbar button. */
export function tbtn(label, onclick, { icon: ic = null, tip = null, cls = '' } = {}) {
  return h('button', { class: `tbtn ${cls}`, type: 'button', onclick, 'data-tip': tip }, ic ? icon(ic, 14) : null, label ? h('span', null, label) : null);
}

/** Compact input field. */
export function tinput({ placeholder = '', value = '', width = 90, onenter = null, cls = '', mono = true } = {}) {
  const i = h('input', { class: `tinput ${mono ? 'mono' : ''} ${cls}`, type: 'text', placeholder, value, spellcheck: 'false', style: { width: `${width}px` } });
  if (onenter) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onenter(i.value, e); } });
  return i;
}

/** Empty-state message ("no program loaded"...). */
export function emptyState(iconName, title, text) {
  return h('div', { class: 'empty' }, icon(iconName, 28), h('div', { class: 'empty-title' }, title), text ? h('div', { class: 'empty-text' }, text) : null);
}

/** In-place cell editing: replaces the cell content with an input field. */
export function inlineEdit(cell, initial, commit, { width = null } = {}) {
  if (cell.querySelector('input')) return;
  const old = cell.innerHTML;
  const input = h('input', { class: 'inline-edit mono', type: 'text', value: initial, spellcheck: 'false' });
  if (width) input.style.width = width;
  cell.innerHTML = '';
  cell.append(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (ok) => {
    if (done) return;
    done = true;
    if (ok) {
      const r = commit(input.value);
      if (r === false) { done = false; input.classList.add('bad'); input.focus(); return; }
    }
    cell.innerHTML = old;
    if (ok && typeof ok === 'function') ok();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(false));
}
