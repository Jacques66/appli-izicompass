// Assembly result panels: problems, listing, symbols, loader map,
// log.

import { h, icon, esc, o, debounce } from '../dom.js';
import { VirtualList, toolbar, tbtn, tinput, emptyState } from './common.js';
import { segmented } from '../ui.js';

const KIND_LABEL = { rel: 'relocatable', abs: 'absolute', ext: 'external', set: 'SET' };

// -------------------------------------------------------------- problems

export class ProblemsPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.summary = h('div', { class: 'ptool-text' });
    this.list = h('div', { class: 'problems' });
    this.el = h('div', { class: 'panel panel-problems' }, toolbar(this.summary), this.list);
    this.show(null);
  }

  show(result, info = null) {
    const L = this.list;
    L.textContent = '';
    if (!result) {
      this.summary.textContent = 'Not assembled';
      L.append(emptyState('hammer', 'Not assembled yet', 'Assemble the current file with F7 or Ctrl+B.'));
      return;
    }
    const errs = result.errors || [];
    const fatal = errs.filter((e) => e.fatal).length;
    const warn = errs.length - fatal;
    this.summary.innerHTML = '';
    this.summary.append(
      h('span', { class: `pill ${fatal ? 'pill-error' : 'pill-ok'}` }, icon(fatal ? 'error' : 'check', 13), fatal ? `${fatal} error${fatal > 1 ? 's' : ''}` : 'No fatal errors'),
      h('span', { class: `pill ${warn ? 'pill-warn' : 'pill-dim'}` }, icon('alert', 13), `${warn} warning${warn !== 1 ? 's' : ''}`),
      info ? h('span', { class: 'ptool-dim' }, info) : null,
    );
    if (!errs.length) {
      L.append(emptyState('check', 'Assembly successful', `${(result.programs || []).length} program(s) produced.`));
      return;
    }
    const sorted = errs.slice().sort((a, b) => (b.fatal - a.fatal) || ((a.line || 0) - (b.line || 0)));
    for (const e of sorted) {
      L.append(h('button', {
        class: `problem ${e.fatal ? 'fatal' : 'warn'}`, type: 'button',
        onclick: () => e.line && this.ctx.revealSource(e.line, e.file),
      },
      icon(e.fatal ? 'error' : 'alert', 15),
      h('span', { class: 'problem-flag mono' }, e.flag || '?'),
      h('span', { class: 'problem-msg' }, e.message || ''),
      h('span', { class: 'problem-loc mono' }, `${e.file || ''}${e.line ? `:${e.line}` : ''}`)));
    }
  }
}

// --------------------------------------------------------------- listing

export class ListingPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.mode = 'listing';
    this.rows = [];
    this.query = '';
    this.matchIdx = -1;
    this.matches = [];
    this.vlist = new VirtualList({
      rowHeight: 18, cls: 'listing mono',
      render: (i) => this.renderRow(i),
      onClick: (i) => this.clickRow(i),
    });
    this.search = tinput({ placeholder: 'Search the listing', width: 220, mono: false, onenter: (_, e) => this.next(e.shiftKey ? -1 : 1) });
    this.search.addEventListener('input', debounce(() => { this.query = this.search.value; this.computeMatches(); }, 150));
    this.count = h('span', { class: 'ptool-dim' });
    this.modeSel = segmented([['listing', 'COMPASS listing', 'Listing produced by the assembler'], ['code', 'Generated code', 'Source lines with addresses and octal code']], this.mode, (v) => { this.mode = v; this.build(); });
    this.el = h('div', { class: 'panel panel-listing' },
      toolbar(this.modeSel, h('div', { class: 'grow' }), this.search, this.count,
        tbtn('', () => this.next(-1), { icon: 'chevronUp', tip: 'Previous (Shift+Enter)' }),
        tbtn('', () => this.next(1), { icon: 'chevronDown', tip: 'Next (Enter)' }),
        tbtn('', () => this.download(), { icon: 'download', tip: 'Download the listing' })),
      this.vlist.el);
    this.result = null;
    this.build();
  }

  show(result) {
    this.result = result;
    this.build();
  }

  build() {
    const r = this.result;
    if (!r) this.rows = [{ text: 'No listing: assemble the current file (F7).', dim: true }];
    else if (this.mode === 'listing') {
      const txt = r.listing || '';
      this.rows = txt ? txt.replace(/\r/g, '').split('\n').map((t) => ({ text: t.replace(/\f/g, '') , page: t.includes('\f') })) : [{ text: 'Empty listing.', dim: true }];
    } else {
      this.rows = (r.lines || []).map((l) => {
        const addr = l.address === null || l.address === undefined ? '      ' : o(l.address, 6);
        const par = l.parcel === undefined || l.parcel === null || l.address === null ? ' ' : String(l.parcel);
        const oc = (l.octal || []).join(' ');
        return { text: `${String(l.line).padStart(5)}  ${addr} ${par} ${oc.padEnd(22)} ${l.flags ? l.flags.padEnd(2) : '  '} ${l.text || ''}`, line: l.line, file: l.file, flags: l.flags };
      });
      if (!this.rows.length) this.rows = [{ text: 'No lines.', dim: true }];
    }
    this.vlist.setCount(this.rows.length);
    this.computeMatches();
  }

  renderRow(i) {
    const r = this.rows[i];
    let t = esc(r.text);
    if (this.query && this.matches.length) {
      const q = this.query.toLowerCase();
      const low = r.text.toLowerCase();
      let k = low.indexOf(q);
      if (k >= 0) {
        let out = '', last = 0;
        while (k >= 0) {
          out += esc(r.text.slice(last, k)) + `<mark class="${this.matches[this.matchIdx] === i ? 'cur' : ''}">${esc(r.text.slice(k, k + q.length))}</mark>`;
          last = k + q.length;
          k = low.indexOf(q, last);
        }
        t = out + esc(r.text.slice(last));
      }
    }
    const cls = `${r.dim ? 'dim' : ''} ${r.page ? 'page' : ''} ${r.flags ? 'flagged' : ''} ${r.line ? 'link' : ''}`;
    return `<span class="${cls}">${t || ' '}</span>`;
  }

  clickRow(i) {
    const r = this.rows[i];
    if (r && r.line) this.ctx.revealSource(r.line, r.file);
  }

  computeMatches() {
    this.matches = [];
    const q = this.query.toLowerCase();
    if (q) this.rows.forEach((r, i) => { if (r.text.toLowerCase().includes(q)) this.matches.push(i); });
    this.matchIdx = this.matches.length ? 0 : -1;
    this.count.textContent = q ? (this.matches.length ? `${this.matchIdx + 1} / ${this.matches.length}` : 'none') : '';
    if (this.matchIdx >= 0) this.vlist.scrollToIndex(this.matches[0], false);
    this.vlist.refresh();
  }

  next(dir) {
    if (!this.matches.length) return;
    this.matchIdx = (this.matchIdx + dir + this.matches.length) % this.matches.length;
    this.count.textContent = `${this.matchIdx + 1} / ${this.matches.length}`;
    this.vlist.scrollToIndex(this.matches[this.matchIdx], true);
  }

  download() {
    const text = this.rows.map((r) => r.text).join('\n');
    this.ctx.download(`${this.ctx.currentName()}.lst`, text);
  }
}

// ---------------------------------------------------------------- symbols

export class SymbolsPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.sortKey = 'name';
    this.sortDir = 1;
    this.filter = '';
    this.symbols = [];
    this.body = h('tbody');
    const th = (key, label, cls = '') => h('th', { class: `sortable ${cls}`, dataset: { key }, onclick: () => this.sortBy(key) }, label, icon('sort', 12, 'sort-ico'));
    this.head = h('tr', null, th('name', 'Name'), th('value', 'Value', 'num'), th('kind', 'Type'), th('block', 'Block'), th('line', 'Line', 'num'), th('refs', 'Refs', 'num'));
    this.table = h('table', { class: 'grid-table symbols' }, h('thead', null, this.head), this.body);
    this.search = tinput({ placeholder: 'Filter', width: 160, mono: false });
    this.search.addEventListener('input', () => { this.filter = this.search.value.toUpperCase(); this.render(); });
    this.count = h('span', { class: 'ptool-dim' });
    this.el = h('div', { class: 'panel panel-symbols' }, toolbar(this.search, this.count), h('div', { class: 'table-wrap' }, this.table));
    this.render();
  }

  show(result) {
    this.symbols = (result && result.symbols) || [];
    this.render();
  }

  sortBy(key) {
    if (this.sortKey === key) this.sortDir = -this.sortDir;
    else { this.sortKey = key; this.sortDir = 1; }
    this.render();
  }

  render() {
    const k = this.sortKey, d = this.sortDir;
    const val = (s) => (k === 'refs' ? (s.refs || []).length : s[k] ?? '');
    const list = this.symbols.filter((s) => !this.filter || s.name.includes(this.filter))
      .sort((a, b) => {
        const x = val(a), y = val(b);
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en')) * d;
      });
    for (const th of this.head.children) th.classList.toggle('sorted', th.dataset.key === k);
    this.body.textContent = '';
    this.count.textContent = this.symbols.length ? `${list.length} / ${this.symbols.length} symbols` : '';
    if (!this.symbols.length) {
      this.body.append(h('tr', null, h('td', { colspan: 6, class: 'dim' }, 'No symbols (assemble first).')));
      return;
    }
    const frag = document.createDocumentFragment();
    for (const s of list.slice(0, 5000)) {
      frag.append(h('tr', { class: s.line ? 'link' : '', onclick: () => s.line && this.ctx.revealSource(s.line) },
        h('td', { class: 'mono strong' }, s.qual ? `${s.qual}$${s.name}` : s.name),
        h('td', { class: 'mono num' }, typeof s.value === 'number' ? `${o(s.value)}B` : String(s.value ?? '')),
        h('td', null, h('span', { class: `kind kind-${s.kind}` }, KIND_LABEL[s.kind] || s.kind || '')),
        h('td', { class: 'mono dim' }, s.block || ''),
        h('td', { class: 'mono num' }, s.line || ''),
        h('td', { class: 'mono num dim', 'data-tip': (s.refs || []).length ? `Lines: ${(s.refs || []).join(', ')}` : null }, (s.refs || []).length)));
    }
    this.body.append(frag);
  }
}

// ------------------------------------------------------------- loader map

export class MapPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.body = h('div', { class: 'map' });
    this.el = h('div', { class: 'panel panel-map' }, this.body);
    this.show(null, null);
  }

  show(result, runner) {
    const B = this.body;
    B.textContent = '';
    const progs = (result && result.programs) || [];
    if (!progs.length && !(runner && runner.kind === 'deadstart')) {
      B.append(emptyState('map', 'No program', 'The loader map appears after a successful assembly.'));
      return;
    }
    const loaded = runner && runner.loaderMap;
    if (loaded && loaded.length) {
      B.append(h('div', { class: 'map-title' }, 'Loaded program'));
      const t = h('table', { class: 'grid-table' },
        h('thead', null, h('tr', null, ...['Name', 'Type', 'Absolute address', 'Origin', 'Length', 'End'].map((x) => h('th', null, x)))));
      const tb = h('tbody');
      for (const e of loaded) {
        const typ = e.type === 'pp' ? `PP${o(e.pp ?? 0, 2)}` : e.type === 'deadstart' ? 'panel → PP00' : e.type === 'abs' ? 'CPU absolute' : 'CPU relocatable';
        tb.append(h('tr', null, h('td', { class: 'mono strong' }, e.name || ''), h('td', null, typ),
          h('td', { class: 'mono' }, `${o(e.address, e.type === 'pp' || e.type === 'deadstart' ? 4 : 6)}B`),
          h('td', { class: 'mono' }, `${o(e.origin || 0)}B`), h('td', { class: 'mono' }, `${o(e.length || 0)}B`),
          h('td', { class: 'mono' }, `${o((e.address || 0) + (e.length || 0))}B`)));
      }
      t.append(tb);
      B.append(t);
      if (runner.kind === 'cpu') {
        B.append(h('div', { class: 'map-note' }, `RA = ${o(runner.ra, 6)}B, FL = ${o(runner.fl, 6)}B. Assembly addresses are relative to RA${runner.base ? ` + ${o(runner.base)}B` : ''}.`));
      }
    }
    if (progs.length) {
      B.append(h('div', { class: 'map-title' }, 'Assembled subprograms'));
      for (const p of progs) {
        const kv = (k, v) => h('div', { class: 'kv' }, h('span', { class: 'kv-k' }, k), h('span', { class: 'kv-v mono' }, v));
        const typ = { abs: 'CPU absolute (ABS)', reloc: 'CPU relocatable', pp: 'PP (PERIPH)' }[p.type] || p.type;
        B.append(h('div', { class: 'map-card' },
          h('div', { class: 'map-card-head' }, h('span', { class: 'mono strong' }, p.name || '?'), h('span', { class: 'pill pill-dim' }, typ)),
          h('div', { class: 'kv-grid' },
            kv('Origin', `${o(p.origin || 0)}B`),
            kv('Entry', typeof p.entry === 'number' ? `${o(p.entry)}B` : String(p.entry ?? '—')),
            kv('Length', `${o(p.length || 0)}B (${p.length || 0} words)`),
            kv('Image', p.image ? `${o(p.image.start || 0)}B, ${p.image.words.length} words` : '—'),
            kv('Machine', p.machine || '—'),
            kv('Overlays', String((p.overlays || []).length)),
            kv('Entry points', (p.entries || []).map((e) => `${e.name}=${o(e.value)}B`).join(', ') || '—'),
            kv('Externals', (p.externals || []).join(', ') || '—'))));
      }
    }
  }
}

// -------------------------------------------------------------------- log

export class LogPanel {
  constructor() {
    this.list = h('div', { class: 'log mono' });
    this.el = h('div', { class: 'panel panel-log' }, toolbar(h('div', { class: 'grow' }), tbtn('Clear', () => { this.list.textContent = ''; }, { icon: 'trash' })), this.list);
  }

  add(message, kind = 'info') {
    const t = new Date();
    const ts = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
    const row = h('div', { class: `log-row log-${kind}` }, h('span', { class: 'log-time' }, ts), h('span', { class: 'log-msg' }, message));
    this.list.append(row);
    while (this.list.childElementCount > 500) this.list.firstChild.remove();
    this.list.scrollTop = this.list.scrollHeight;
  }
}
