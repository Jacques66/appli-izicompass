// Sources d'instructions empilées : textes externes, macros, DUP/ECHO, code distant (RMT).
// Chaque cadre produit des instructions complètes (continuations déjà jointes).

import { MARK } from './source.js';

let frameSerial = 0;

/** Cadre d'expansion de macro, d'OPDEF ou d'ECHO. */
export class MacroFrame {
  /**
   * @param def définition { name, body: [stmt], nformals, nlocals, system }
   * @param actuals textes des paramètres effectifs (index 1..n)
   * @param invent fonction () -> nouveau symbole inventé
   */
  constructor(def, actuals, invent, site, level, seqId) {
    this.kind = def.kind === 'opdef' ? 'opdef' : 'macro';
    this.def = def;
    this.name = def.name;
    this.system = !!def.system;
    this.actuals = actuals;
    this.locals = [];
    for (let k = 0; k < def.nlocals; k++) this.locals.push(invent());
    this.idx = 0;
    this.site = site;
    this.level = level;
    this.seqId = seqId || def.name;
    this.pendingIrp = null; // lignes générées par IRP en attente
    this.id = ++frameSerial;
  }

  /** Remplace les marques de paramètres dans une ligne. */
  subst(line, override) {
    if (!line.includes(MARK)) return line;
    let out = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === MARK && i + 1 < line.length) {
        const idx = line.charCodeAt(i + 1);
        i++;
        if (override && override.idx === idx) { out += override.text; continue; }
        out += this.value(idx);
      } else out += c;
    }
    return out;
  }

  value(idx) {
    const n = this.def.nformals;
    if (idx >= 1 && idx <= n) return this.actuals[idx] ?? '';
    if (idx > n && idx <= n + this.locals.length) return this.locals[idx - n - 1];
    return '';
  }

  next() {
    if (this.pendingIrp && this.pendingIrp.length) return this.pendingIrp.shift();
    if (this.idx >= this.def.body.length) return null;
    const st = this.def.body[this.idx++];
    // IRP : traité à la production des lignes (st.op / st.vf viennent de la capture)
    if (st.op === 'IRP' && st.vf && st.vf.startsWith(MARK) && this.kind === 'macro') {
      const pidx = st.vf.charCodeAt(1);
      const inner = [];
      let end = null;
      while (this.idx < this.def.body.length) {
        const s = this.def.body[this.idx++];
        if (s.op === 'IRP' && !s.vf) { end = s; break; }
        inner.push(s);
      }
      const actual = this.value(pidx);
      const subs = splitIrp(actual);
      const out = [this.make(st, this.subst(st.img))];
      for (const sp of subs) {
        for (const s of inner) out.push(this.make(s, this.subst(s.img, { idx: pidx, text: sp })));
      }
      if (end) out.push(this.make(end, this.subst(end.img)));
      this.pendingIrp = out.slice(1);
      return out[0];
    }
    return this.make(st, this.subst(st.img));
  }

  make(st, img) {
    return { img, seq: '', file: st.file, line: st.line, site: this.site, generated: true, frame: this };
  }
}

/** Découpe un paramètre IRP en sous-paramètres (virgules de premier niveau). */
export function splitIrp(text) {
  if (text === '') return [];
  const out = [];
  let depth = 0, cur = '';
  for (const c of text) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) { out.push(stripParens(cur)); cur = ''; continue; }
    cur += c;
  }
  out.push(stripParens(cur));
  return out;
}

export function stripParens(s) {
  if (s.startsWith('(') && s.endsWith(')')) {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') depth++;
      if (s[i] === ')') depth--;
      if (depth === 0 && i < s.length - 1) return s;
    }
    return s.slice(1, -1);
  }
  return s;
}

/** Cadre de duplication (DUP) ou d'écho (ECHO). */
export class DupFrame {
  constructor(kind, body, reps, lists, site, level) {
    this.kind = kind; // 'dup' | 'echo'
    this.body = body;
    this.reps = reps;
    this.lists = lists; // ECHO : tableaux de valeurs par paramètre
    this.iter = 0;
    this.idx = 0;
    this.stop = false;
    this.site = site;
    this.level = level;
    this.seqId = kind === 'dup' ? '*DUP*' : '*ECHO*';
    this.name = this.seqId;
    this.id = ++frameSerial;
  }
  next() {
    for (;;) {
      if (this.iter >= this.reps) return null;
      if (this.idx < this.body.length) {
        const st = this.body[this.idx++];
        let img = st.img;
        if (this.kind === 'echo' && img.includes(MARK)) {
          let out = '';
          for (let i = 0; i < img.length; i++) {
            if (img[i] === MARK && i + 1 < img.length) {
              const k = img.charCodeAt(++i);
              const list = this.lists[k - 1];
              out += list ? (list[this.iter] ?? '') : '';
            } else out += img[i];
          }
          img = out;
        }
        return { img, seq: '', file: st.file, line: st.line, site: this.site, generated: true, frame: this };
      }
      this.iter++;
      this.idx = 0;
      if (this.stop) return null;
    }
  }
}

/** Cadre de code distant (HERE / END). */
export class ListFrame {
  constructor(kind, body, site, level, seqId) {
    this.kind = kind;
    this.body = body;
    this.idx = 0;
    this.site = site;
    this.level = level;
    this.seqId = seqId;
    this.name = seqId;
    this.id = ++frameSerial;
  }
  next() {
    if (this.idx >= this.body.length) return null;
    const st = this.body[this.idx++];
    return { img: st.img, seq: '', file: st.file, line: st.line, site: this.site, generated: true, frame: this };
  }
}

/** Cadre de lecture d'une source texte (programme principal ou XTEXT). */
export class SourceFrame {
  constructor(src, site, level) {
    this.kind = src.xtext ? 'xtext' : 'main';
    this.src = src;
    this.site = site;
    this.level = level;
    this.name = src.name;
    this.seqId = src.name;
    this.system = src.system;
    this.id = ++frameSerial;
  }
  next() {
    const st = this.src.next();
    if (!st) return null;
    st.frame = this;
    st.site = this.kind === 'main' ? { file: st.file, line: st.line } : this.site;
    st.generated = this.kind !== 'main';
    return st;
  }
}
