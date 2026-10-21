// Workspace: source files (programs and XTEXT texts) kept in the browser's
// localStorage. Any storage error (private browsing, quota, file://) is
// absorbed: the workspace then stays in memory only.

import { store } from './dom.js';

const KEY = 'cdc6600-ide/workspace/v1';

let seq = 0;
const newId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Kind of a file, from its extension. */
export function kindOf(name) {
  return /\.(txt|text|tex)$/i.test(name) ? 'text' : 'program';
}

/** COMPASS name of a file: no extension, uppercase (DEFS6612.TXT -> DEFS6612). */
export function compassName(name) {
  return name.replace(/\.[^.]*$/, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'PROG';
}

export class Workspace {
  constructor() {
    this.files = [];
    this.persistent = true;
    this.listeners = new Set();
    const data = store.get(KEY, null);
    if (data && Array.isArray(data.files)) {
      this.files = data.files.filter((f) => f && typeof f.name === 'string').map((f) => ({
        id: f.id || newId(), name: f.name, kind: f.kind || kindOf(f.name), content: f.content || '',
        draft: typeof f.draft === 'string' ? f.draft : null, breakpoints: Array.isArray(f.breakpoints) ? f.breakpoints : [],
        created: f.created || Date.now(), modified: f.modified || Date.now(), example: f.example || null,
      }));
    }
    this.openIds = data && Array.isArray(data.open) ? data.open.filter((id) => this.get(id)) : [];
    this.activeId = data && this.get(data.active) ? data.active : null;
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }

  persist() {
    const ok = store.set(KEY, { files: this.files, open: this.openIds, active: this.activeId });
    if (!ok && this.persistent) {
      this.persistent = false;
      return false;
    }
    if (ok) this.persistent = true;
    return ok;
  }

  get(id) {
    return this.files.find((f) => f.id === id) || null;
  }

  byName(name) {
    const n = name.toLowerCase();
    return this.files.find((f) => f.name.toLowerCase() === n) || null;
  }

  /** Free name derived from `name` (appends -2, -3...). */
  uniqueName(name) {
    if (!this.byName(name)) return name;
    const m = /^(.*?)(\.[^.]*)?$/.exec(name);
    for (let i = 2; ; i++) {
      const cand = `${m[1]}-${i}${m[2] || ''}`;
      if (!this.byName(cand)) return cand;
    }
  }

  create({ name, content = '', kind = null, example = null }) {
    const f = {
      id: newId(), name: this.uniqueName(name), kind: kind || kindOf(name), content, draft: null,
      breakpoints: [], created: Date.now(), modified: Date.now(), example,
    };
    this.files.push(f);
    this.sort();
    this.persist();
    this.emit();
    return f;
  }

  sort() {
    this.files.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'en') : a.kind === 'program' ? -1 : 1));
  }

  rename(id, name) {
    const f = this.get(id);
    if (!f) return null;
    f.name = name;
    f.kind = kindOf(name);
    this.sort();
    this.persist();
    this.emit();
    return f;
  }

  remove(id) {
    this.files = this.files.filter((f) => f.id !== id);
    this.openIds = this.openIds.filter((x) => x !== id);
    if (this.activeId === id) this.activeId = this.openIds[0] || null;
    this.persist();
    this.emit();
  }

  /** Draft (unsaved changes), kept between sessions. */
  setDraft(id, text) {
    const f = this.get(id);
    if (!f) return;
    f.draft = text === f.content ? null : text;
    this.persist();
  }

  save(id, text) {
    const f = this.get(id);
    if (!f) return false;
    f.content = text;
    f.draft = null;
    f.modified = Date.now();
    const ok = this.persist();
    this.emit();
    return ok;
  }

  setBreakpoints(id, lines) {
    const f = this.get(id);
    if (!f) return;
    f.breakpoints = [...lines].sort((a, b) => a - b);
    this.persist();
  }

  setOpen(ids, active) {
    this.openIds = ids.slice();
    this.activeId = active;
    this.persist();
  }

  /** External texts for the assembler's `texts` option (XTEXT). */
  texts(exceptId = null) {
    const out = {};
    for (const f of this.files) {
      if (f.id === exceptId) continue;
      out[compassName(f.name)] = f.draft ?? f.content;
    }
    return out;
  }
}
