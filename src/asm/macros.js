// Définitions et appels : MACRO, MACROE, OPDEF, DUP, ECHO, RMT.
//
// Les lignes d'une définition sont capturées NON éditées. Les noms de
// paramètres formels et de symboles locaux y sont remplacés par une marque de
// deux caractères (comme le « ;x » de COMPASS) ; l'édition (concaténation,
// micros) a lieu à chaque expansion.

import { scanFields, MARK, CONCAT, MICRO } from './source.js';
import { MacroFrame, DupFrame, ListFrame, stripParens } from './frames.js';
import { qText } from './cpuasm.js';
import { toDisplay } from '../common/charset.js';

// Délimiteurs reconnaissant un nom de paramètre dans le corps.
const DELIM = new Set(['+', '-', '*', '/', '(', ')', '$', '=', ',', '.', ' ', MICRO, CONCAT]);
const PARAM_SEP = new Set(['+', '-', '*', '/', '(', ')', '$', '=', ',', '.']);
const RESERVED = new Set(['END', 'ENDD', 'ENDM', 'IRP', 'LOCAL']);

/** Découpe une liste de noms (paramètres formels, LOCAL). */
export function splitNames(text) {
  const out = [];
  let cur = '';
  for (const c of text) {
    if (PARAM_SEP.has(c)) { if (cur) out.push(cur); cur = ''; }
    else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

/** Champ variable brut (jusqu'au premier blanc hors parenthèses). */
export function rawVarField(img, pos) {
  if (pos < 0) return '';
  let s = '', depth = 0;
  for (let i = pos; i < img.length; i++) {
    const c = img[i];
    if (c === ' ' && depth <= 0) break;
    if (c === '(') depth++;
    if (c === ')') depth--;
    s += c;
  }
  return s;
}

/**
 * Remplace les noms (formels puis locaux) par des marques dans une ligne.
 * Les « ;x » déjà présents deviennent aussi des marques.
 */
export function markLine(img, names) {
  if (!names.size && !img.includes(';')) return img;
  let out = '';
  let i = 0;
  while (i < img.length) {
    const c = img[i];
    if (c === ';' && i + 1 < img.length) {
      const d = toDisplay(img[i + 1]);
      out += MARK + String.fromCharCode(d < 0 ? 0 : d);
      i += 2;
      continue;
    }
    if (DELIM.has(c)) { out += c; i++; continue; }
    let j = i;
    let run = '';
    while (j < img.length && !DELIM.has(img[j]) && img[j] !== ';') run += img[j++];
    const idx = names.get(run);
    if (idx !== undefined) out += MARK + String.fromCharCode(idx);
    else out += run;
    i = j;
  }
  return out;
}

function bodyLine(st, f) {
  return { img: st.img, file: st.file, line: st.line, op: f.op, loc: f.loc, vf: rawVarField(st.img, f.varPos) };
}

// =========================================================== capture

/** Démarre la capture d'une définition. */
export function startCapture(asm, entry, cap) {
  cap.entry = entry;
  cap.body = [];
  cap.open = cap.open || [];
  cap.heading = cap.kind === 'macro' || cap.kind === 'opdef';
  cap.locals = [];
  cap.level = entry.level;
  cap.frameDepth = asm.frames.length;
  asm.capture = cap;
}

/** Traite une instruction pendant une capture (instruction non éditée). */
export function captureStatement(asm, st) {
  const cap = asm.capture;
  if (st.comment) {
    asm.listOnly(st, { comment: true, captured: true });
    return;
  }
  const f = scanFields(st.img, asm.cc);
  const lst = () => asm.listOnly(st, { captured: true });
  switch (cap.kind) {
    case 'macro':
    case 'opdef': {
      if (cap.heading) {
        if (f.op === 'LOCAL') {
          for (const n of splitNames(rawVarField(st.img, f.varPos))) {
            if (/^[0-9]/.test(n) || RESERVED.has(n) || cap.formals.includes(n) || cap.locals.includes(n)) {
              lst().flags.add('4');
              continue;
            }
            cap.locals.push(n);
          }
          lst();
          return;
        }
        if (!f.op && !f.loc) { lst(); return; }
        cap.heading = false;
      }
      if (f.op === 'MACRO' || f.op === 'MACROE') {
        const name = f.loc || splitNames(rawVarField(st.img, f.varPos))[0] || '';
        cap.open.push(name);
      } else if (f.op === 'OPDEF') {
        cap.open.push(f.loc);
      } else if (f.op === 'ENDM') {
        cap.body.push(bodyLine(st, f));
        lst();
        if (!f.loc) return endCapture(asm);
        const k = cap.open.lastIndexOf(f.loc);
        if (k === 0) return endCapture(asm);
        if (k > 0) cap.open.length = k;
        return;
      } else if (f.op === 'END') {
        asm.flag(cap.entry, 'E', 'END dans une définition');
        endCapture(asm);
        asm.processStatement(st);
        return;
      }
      cap.body.push(bodyLine(st, f));
      lst();
      return;
    }
    case 'dup':
    case 'echo': {
      if (f.op === 'END') {
        asm.flag(cap.entry, 'E', 'END dans une séquence DUP/ECHO');
        endCapture(asm);
        asm.processStatement(st);
        return;
      }
      cap.body.push(bodyLine(st, f));
      lst();
      if (cap.count != null) {
        cap.count--;
        if (cap.count <= 0) endCapture(asm);
        return;
      }
      if (f.op === 'ENDD') {
        if (!f.loc || (cap.name && f.loc === cap.name)) endCapture(asm);
      }
      return;
    }
    case 'rmt': {
      if (f.op === 'RMT') {
        lst();
        endCapture(asm);
        return;
      }
      if (f.op === 'END') {
        asm.flag(cap.entry, 'E', 'END dans une séquence RMT');
        endCapture(asm);
        asm.processStatement(st);
        return;
      }
      cap.body.push(bodyLine(st, f));
      lst();
      return;
    }
  }
}

function endCapture(asm) {
  const cap = asm.capture;
  asm.capture = null;
  switch (cap.kind) {
    case 'macro':
    case 'opdef': {
      const names = new Map();
      cap.formals.forEach((n, k) => names.set(n, k + 1));
      cap.locals.forEach((n, k) => names.set(n, cap.formals.length + k + 1));
      if (names.size > 63) asm.flag(cap.entry, 'F', 'plus de 63 paramètres et symboles locaux');
      const body = cap.body.map((b) => {
        const img = markLine(b.img, names);
        const f = scanFields(img, asm.cc);
        return { ...b, img, op: f.op, vf: rawVarField(img, f.varPos) };
      });
      const def = {
        kind: cap.kind, name: cap.name, format: cap.format, keyword: cap.keyword, syntax: cap.syntax,
        body, nformals: cap.formals.length, nlocals: cap.locals.length, formals: cap.formals,
        system: asm.definingSystem || (cap.entry.frame && cap.entry.frame.system), entry: cap.entry,
      };
      if (cap.kind === 'macro') {
        const list = asm.mnemonic.get(def.name) || [];
        if (list.length || asm.lookupMnemonic(def.name)) asm.flag(cap.entry, '3');
        list.push(def);
        asm.mnemonic.set(def.name, list);
      } else {
        const list = asm.syntactic.get(def.syntax) || [];
        list.push(def);
        asm.syntactic.set(def.syntax, list);
      }
      return;
    }
    case 'dup': {
      if (cap.reps > 0 && cap.body.length) {
        const fr = new DupFrame('dup', cap.body, cap.reps, null, cap.entry.site, cap.level + 1);
        asm.dupDepth++;
        asm.pushFrame(fr);
      }
      return;
    }
    case 'echo': {
      const names = new Map();
      cap.params.forEach((p, k) => names.set(p.name, k + 1));
      const body = cap.body.map((b) => ({ ...b, img: markLine(b.img, names) }));
      const lists = cap.params.map((p) => p.list);
      let reps = lists.length ? Math.min(...lists.map((l) => l.length)) : 0;
      if (reps > 0 && body.length) {
        const fr = new DupFrame('echo', body, reps, lists, cap.entry.site, cap.level + 1);
        asm.dupDepth++;
        asm.pushFrame(fr);
      }
      return;
    }
    case 'rmt': {
      if (cap.name) {
        const old = asm.rmt.labeled.get(cap.name) || [];
        asm.rmt.labeled.set(cap.name, old.concat(cap.body));
      } else {
        asm.rmt.unlabeled.push(cap.body);
      }
      return;
    }
  }
}

/** Assemble du code distant (HERE ou END). */
export function assembleRemote(asm, entry, name) {
  let body = [];
  if (name) {
    body = asm.rmt.labeled.get(name) || [];
    asm.rmt.labeled.delete(name);
  } else {
    for (const b of asm.rmt.unlabeled) body = body.concat(b);
    asm.rmt.unlabeled = [];
  }
  if (body.length) asm.pushFrame(new ListFrame('rmt', body, entry.site, entry.level + 1, '*RMT*'));
}

// =========================================================== appels

/** Paramètres effectifs d'un appel (champ variable édité). */
export function parseActuals(img, pos) {
  const out = [];
  if (pos < 0) return out;
  let i = pos;
  let cur = '';
  for (;;) {
    const c = img[i];
    if (c === undefined || c === ' ') { out.push(cur); break; }
    if (c === ',') { out.push(cur); cur = ''; i++; continue; }
    if (c === '(' && cur === '') {
      // paramètre entre parenthèses : jusqu'à la parenthèse fermante associée
      let depth = 0, j = i;
      let txt = '';
      for (; j < img.length; j++) {
        const d = img[j];
        if (d === '(') depth++;
        if (d === ')') { depth--; if (depth === 0) break; }
        txt += d;
      }
      cur = txt.slice(1);
      i = j + 1;
      // texte après la parenthèse jusqu'à la virgule ou au blanc : ajouté tel quel
      while (i < img.length && img[i] !== ',' && img[i] !== ' ') cur += img[i++];
      continue;
    }
    cur += c;
    i++;
  }
  return out;
}

/** Symbole inventé pour un LOCAL (unique dans le sous-programme). */
export function invent(asm) {
  asm.inventCounter++;
  asm.inventedCount = (asm.inventedCount || 0) + 1;
  return '!' + asm.inventCounter.toString(8).padStart(6, '0');
}

/**
 * Appel de macro, MACROE ou OPDEF.
 * @param prep analyse syntaxique (OPDEF)
 */
export function beginMacroCall(asm, entry, def, prep) {
  entry.kind = 'maccall';
  entry.macro = def.name;
  asm.curEntry = entry;
  asm.beginCode(entry);
  const loc = entry.f.loc;
  let actuals = [''];
  if (def.kind === 'opdef') {
    if (prep.opReg) actuals.push(prep.opReg.text);
    for (const s of prep.subs) {
      for (const r of s.regs) actuals.push(r.numText);
      if (s.hasQ) actuals.push(qText(s));
    }
    if (loc && loc !== '-') {
      asm.prepareCode(entry);
      asm.forceUpper(asm.cur);
      asm.defineLocation(entry);
      entry.forceAtCall = true;
    }
  } else {
    const acts = parseActuals(entry.img, entry.f.varPos).map((a) => a);
    if (def.keyword) {
      const map = new Map();
      for (const a of acts) {
        const eq = a.indexOf('=');
        if (eq <= 0) { if (a) asm.flag(entry, 'A', `paramètre par mot-clé attendu : ${a}`); continue; }
        map.set(a.slice(0, eq), stripParensIf(a.slice(eq + 1)));
      }
      if (def.format === 2) actuals.push(loc || '');
      for (const fname of def.formals.slice(def.format === 2 ? 1 : 0)) actuals.push(map.get(fname) ?? '');
    } else if (def.format === 2) {
      actuals.push(loc || '');
      for (const a of acts) actuals.push(a);
    } else {
      for (const a of acts) actuals.push(a);
    }
    if (def.format !== 2 && loc && loc !== '-') {
      asm.prepareCode(entry);
      asm.forceUpper(asm.cur);
      asm.defineLocation(entry);
      entry.forceAtCall = true;
    }
  }
  asm.finishEntry(entry);
  const frame = new MacroFrame(def, actuals, () => invent(asm), entry.site, entry.level + 1,
    def.kind === 'opdef' ? entry.op : def.name);
  asm.pushFrame(frame);
}

function stripParensIf(s) {
  return s.startsWith('(') ? stripParens(s) : s;
}
