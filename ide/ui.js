// Interface components: tooltips, notifications, dialog boxes, menus.

import { h, icon } from './dom.js';

// --------------------------------------------------------------- tooltips

let tipEl = null;
let tipTimer = null;
let tipTarget = null;

/** Custom tooltips for every element that carries data-tip. */
export function initTooltips() {
  tipEl = h('div', { class: 'tooltip', role: 'tooltip' });
  document.body.append(tipEl);
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t === tipTarget) return;
    hideTip();
    if (!t) return;
    tipTarget = t;
    tipTimer = setTimeout(() => showTip(t), t.dataset.tipFast ? 120 : 450);
  });
  document.addEventListener('mousedown', hideTip, true);
  document.addEventListener('keydown', hideTip, true);
  window.addEventListener('blur', hideTip);
}

function showTip(t) {
  if (!t.isConnected) return;
  const text = t.dataset.tip;
  if (!text) return;
  tipEl.textContent = '';
  const lines = text.split('\n');
  tipEl.append(h('div', { class: 'tooltip-main' }, lines[0]));
  for (const l of lines.slice(1)) tipEl.append(h('div', { class: 'tooltip-sub' }, l));
  tipEl.classList.add('show');
  const r = t.getBoundingClientRect();
  const tr = tipEl.getBoundingClientRect();
  let x = r.left + r.width / 2 - tr.width / 2;
  let y = r.bottom + 6;
  if (y + tr.height > window.innerHeight - 4) y = r.top - tr.height - 6;
  x = Math.max(4, Math.min(window.innerWidth - tr.width - 4, x));
  tipEl.style.left = `${x}px`;
  tipEl.style.top = `${y}px`;
}

export function hideTip() {
  clearTimeout(tipTimer);
  tipTarget = null;
  if (tipEl) tipEl.classList.remove('show');
}

// ---------------------------------------------------------- notifications

let toastHost = null;

/** Temporary notification at the bottom right. kind: info | ok | warn | error */
export function toast(message, kind = 'info', ms = 3500) {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const ic = { info: 'info', ok: 'check', warn: 'alert', error: 'error' }[kind] || 'info';
  const el = h('div', { class: `toast toast-${kind}` }, icon(ic, 16), h('span', null, message));
  toastHost.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, ms);
}

// ------------------------------------------------------------ dialog boxes

let openDialogs = 0;
export const dialogIsOpen = () => openDialogs > 0;

/**
 * Modal dialog box.
 * @param {{ title, body: Node|string, buttons: [{ label, kind, value, action }], width, onOpen }} opts
 * @returns Promise resolved with the button value (or null if closed)
 */
export function openDialog({ title, body, buttons = [{ label: 'Close', kind: 'primary', value: true }], width = 480, onOpen, cls = '' }) {
  return new Promise((resolve) => {
    openDialogs++;
    const prevFocus = document.activeElement;
    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      openDialogs--;
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 160);
      document.removeEventListener('keydown', onKey, true);
      if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
      resolve(value);
    };
    const footer = h('div', { class: 'dialog-footer' });
    for (const b of buttons) {
      footer.append(h('button', {
        class: `btn ${b.kind === 'primary' ? 'btn-primary' : b.kind === 'danger' ? 'btn-danger' : ''}`,
        type: 'button',
        onclick: async () => {
          if (b.action) {
            const r = await b.action();
            if (r === false) return;
            close(r === undefined ? b.value : r);
          } else close(b.value);
        },
      }, b.label));
    }
    const dlg = h('div', { class: `dialog ${cls}`, role: 'dialog', 'aria-modal': 'true', style: { width: `${width}px` } },
      h('div', { class: 'dialog-header' },
        h('div', { class: 'dialog-title' }, title),
        h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Close', onclick: () => close(null) }, icon('close', 16))),
      h('div', { class: 'dialog-body' }, typeof body === 'string' ? h('p', null, body) : body),
      buttons.length ? footer : null);
    const overlay = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay) close(null); } }, dlg);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
      else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
        const primary = buttons.find((b) => b.kind === 'primary');
        if (primary) {
          e.preventDefault();
          footer.children[buttons.indexOf(primary)].click();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('show');
      const first = dlg.querySelector('[autofocus], input, select, textarea') || footer.querySelector('.btn-primary');
      if (first) first.focus();
      if (onOpen) onOpen(dlg, close);
    });
  });
}

/** Text input. Resolves with the string or null. */
export async function promptDialog(title, label, value = '', { placeholder = '', validate } = {}) {
  const input = h('input', { class: 'input', type: 'text', value, placeholder, autofocus: true, spellcheck: 'false' });
  const err = h('div', { class: 'field-error' });
  const body = h('div', { class: 'form' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input), err);
  let result = null;
  const ok = await openDialog({
    title, body, width: 420,
    buttons: [
      { label: 'Cancel', value: false },
      {
        label: 'OK', kind: 'primary',
        action: () => {
          const v = input.value.trim();
          const msg = validate ? validate(v) : null;
          if (msg) { err.textContent = msg; input.focus(); return false; }
          result = v;
          return true;
        },
      },
    ],
    onOpen: () => input.select(),
  });
  return ok ? result : null;
}

/** Confirmation. Resolves with true/false. */
export async function confirmDialog(title, message, { okLabel = 'Confirm', danger = false } = {}) {
  const r = await openDialog({
    title, body: message, width: 420,
    buttons: [{ label: 'Cancel', value: false }, { label: okLabel, kind: danger ? 'danger' : 'primary', value: true }],
  });
  return r === true;
}

// ------------------------------------------------------------------ menus

let menuEl = null;

/** Context menu: items [{ label, icon, action, danger, separator, disabled, hint }]. */
export function contextMenu(items, x, y) {
  closeMenu();
  menuEl = h('div', { class: 'menu', role: 'menu' });
  for (const it of items) {
    if (it.separator) { menuEl.append(h('div', { class: 'menu-sep' })); continue; }
    menuEl.append(h('button', {
      class: `menu-item ${it.danger ? 'danger' : ''}`, type: 'button', disabled: it.disabled,
      onclick: () => { closeMenu(); it.action && it.action(); },
    }, it.icon ? icon(it.icon, 15) : h('span', { class: 'menu-ico' }), h('span', { class: 'menu-label' }, it.label), it.hint ? h('span', { class: 'menu-hint' }, it.hint) : null));
  }
  document.body.append(menuEl);
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = `${Math.min(x, window.innerWidth - r.width - 6)}px`;
  menuEl.style.top = `${Math.min(y, window.innerHeight - r.height - 6)}px`;
  setTimeout(() => {
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onMenuKey, true);
  });
}

function onOutside(e) {
  if (menuEl && !menuEl.contains(e.target)) closeMenu();
}
function onMenuKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
}

export function closeMenu() {
  if (!menuEl) return;
  menuEl.remove();
  menuEl = null;
  document.removeEventListener('mousedown', onOutside, true);
  document.removeEventListener('keydown', onMenuKey, true);
}

// ----------------------------------------------------------- form controls

/** Labeled form field. */
export function field(label, control, hint = null) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'field-hint' }, hint) : null);
}

/** Styled drop-down list. options: [[value, label]] */
export function select(options, value, onchange, cls = '') {
  const s = h('select', { class: `select ${cls}`, onchange: (e) => onchange && onchange(e.target.value) });
  for (const [v, l] of options) s.append(h('option', { value: v }, l));
  s.value = value;
  return s;
}

/** Switch (styled checkbox). */
export function toggle(checked, onchange, label = null) {
  const input = h('input', { type: 'checkbox', class: 'switch-input', onchange: (e) => onchange && onchange(e.target.checked) });
  input.checked = !!checked;
  return h('label', { class: 'switch' }, input, h('span', { class: 'switch-track' }, h('span', { class: 'switch-thumb' })), label ? h('span', { class: 'switch-label' }, label) : null);
}

/** Segmented control: options [[value, label, tooltip]] */
export function segmented(options, value, onchange) {
  const el = h('div', { class: 'segmented', role: 'radiogroup' });
  const set = (v) => {
    for (const b of el.children) b.classList.toggle('active', b.dataset.value === v);
  };
  for (const [v, l, tip] of options) {
    el.append(h('button', {
      type: 'button', class: 'seg', dataset: { value: v }, 'data-tip': tip || null,
      onclick: () => { set(v); onchange && onchange(v); },
    }, l));
  }
  set(value);
  el.setValue = set;
  return el;
}
