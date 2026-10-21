// Small DOM utilities for the IDE.

import { iconSvg } from './icons.js';

/**
 * Creates an element: h('div', { class: 'x', onclick: fn, dataset: {...}, style: {...} }, children...)
 */
export function h(tag, attrs = null, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

/** SVG icon as an element. */
export function icon(name, size = 16, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = iconSvg(name, size, cls);
  return t.content.firstChild;
}

/** Icon button with a tooltip. */
export function iconButton(name, tip, onclick, opts = {}) {
  const b = h('button', {
    class: `btn-icon ${opts.cls || ''}`, type: 'button', 'data-tip': tip, 'aria-label': tip, onclick,
  }, icon(name, opts.size || 16));
  if (opts.label) b.append(h('span', { class: 'btn-label' }, opts.label));
  return b;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function debounce(fn, ms) {
  let t = null;
  const f = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  f.cancel = () => clearTimeout(t);
  return f;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/** Download of a text or of bytes. */
export function download(name, data, mime = 'text/plain;charset=utf-8') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

/** Opens the file picker; resolves with [{ name, text | bytes }]. */
export function pickFiles({ accept = '', multiple = false, binary = false } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: { display: 'none' } });
    if (multiple) input.multiple = true;
    input.addEventListener('change', async () => {
      const out = [];
      for (const f of input.files) {
        if (binary) out.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
        else out.push({ name: f.name, text: await f.text() });
      }
      input.remove();
      resolve(out);
    });
    document.body.append(input);
    input.click();
  });
}

/** Safe localStorage access (private browsing, file://...). */
export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* nothing */ }
  },
};

/** Octal on n digits. */
export const o = (v, n = 0) => (typeof v === 'bigint' ? v.toString(8) : (v >>> 0).toString(8)).padStart(n, '0');

/** 60-bit word in 4 groups of 5 octal digits. */
export const o60 = (w) => {
  const s = BigInt.asUintN(60, BigInt(w)).toString(8).padStart(20, '0');
  return `${s.slice(0, 5)} ${s.slice(5, 10)} ${s.slice(10, 15)} ${s.slice(15)}`;
};

/** Parses an octal entry (blanks ignored, B suffix accepted). */
export function parseOctal(text) {
  const t = String(text).replace(/[\s_]/g, '').replace(/B$/i, '');
  if (!/^[0-7]+$/.test(t)) return null;
  return BigInt('0o' + t);
}

/** Checks whether an element is visible (tab shown or not). */
export function isShown(el) {
  return !!(el && el.offsetParent !== null);
}
