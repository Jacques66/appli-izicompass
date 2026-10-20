// Assemblage des instructions CPU (entrées syntaxiques).

import { Cursor, AsmError, parseExpression, Val } from './expr.js';
import { CPU_SYNTAX, syntaxKey } from './cpuops.js';

/**
 * Analyse le champ opération et les sous-champs d'une instruction CPU.
 * @param blankSep accepter des sous-champs séparés par des blancs (« UX1 B2 X3 »)
 * @returns { key, mnem, opReg, subs, varEnd } ou null si le champ opération n'est pas syntaxique
 */
export function prepareCpuStatement(asm, entry, blankSep = false) {
  const op = entry.op;
  let mnem, opReg = null;
  if (op.length === 2) {
    mnem = op;
  } else if (op.length >= 3 && 'ABX'.includes(op[1])) {
    const r = op.slice(2);
    if (/^[0-7]$/.test(r)) opReg = { n: Number(r), text: r };
    else if (r[0] === '.' && r.length > 1) {
      let n = 0;
      try {
        n = asm.evalText(entry, r.slice(1)).num();
      } catch (e) { /* signalé au codage */ }
      if (n < 0 || n > 7) { asm.flag(entry, '7'); n &= 7; }
      opReg = { n, text: r.slice(1) };
    } else return null;
    mnem = op.slice(0, 2);
  } else return null;

  const subs = [];
  const ctx = asm.ctxFor(entry, { regs: true, fieldBits: 18, noUndefError: true, noRef: true });
  const parseSub = (text, base) => {
    const cur = new Cursor(text, base);
    const start = cur.i;
    let v;
    try {
      v = parseExpression(cur, ctx);
    } catch (e) {
      if (!(e instanceof AsmError)) throw e;
      v = new Val(0n);
      v.hasQ = true;
      v.error = e;
      while (!cur.atSubEnd()) cur.next();
    }
    const t = text.slice(start, cur.i);
    return { cur, sub: { text: t, regs: v.regs, hasQ: v.hasQ || (!v.regs.length && t !== ''), val: v, start } };
  };
  if (entry.opExtra !== null && entry.opExtra !== undefined) {
    for (const part of entry.opExtra.split(',')) {
      const { sub } = parseSub(part, 0);
      subs.push(sub);
    }
  }
  const img = entry.img;
  let pos = entry.f.varPos;
  let varEnd = pos;
  if (pos >= 0) {
    for (;;) {
      const { cur, sub } = parseSub(img, pos);
      subs.push(sub);
      if (cur.peek() === ',') { pos = cur.i + 1; continue; }
      varEnd = cur.i;
      if (blankSep && subs.length < 3) {
        let k = cur.i;
        while (img[k] === ' ') k++;
        if (k < img.length && /^[ABX][0-7]/.test(img.slice(k, k + 2))) { pos = k; continue; }
      }
      break;
    }
  }
  if (subs.length === 1 && subs[0].text === '' && !subs[0].regs.length) subs.length = 0;
  const key = syntaxKey(opReg ? mnem : mnem, subs);
  return { key, mnem, opReg, subs, varEnd, blank: blankSep };
}

/** Recherche dans la table syntaxique (définitions du programme d'abord). */
export function cpuSyntaxLookup(asm, key) {
  const list = asm.syntactic.get(key);
  if (list) for (let k = list.length - 1; k >= 0; k--) if (!list[k].purged) return list[k];
  if (asm.purgedSyntax && asm.purgedSyntax.has(key)) return null;
  const b = CPU_SYNTAX.get(key);
  if (!b) return null;
  if (b.machine === '7' && asm.machineType && asm.machineType[0] === '6') return null;
  return { kind: 'cpu', ...b };
}

/** Texte de l'expression Q d'un sous-champ (registres retirés). */
export function qText(sub) {
  if (!sub.regs.length) return sub.text;
  let t = sub.text;
  const spans = sub.regs.map((r) => [r.span[0] - sub.start, r.span[1] - sub.start]).sort((a, b) => b[0] - a[0]);
  for (const [a, b] of spans) t = t.slice(0, Math.max(0, a)) + t.slice(b);
  if (t && t[0] !== '+' && t[0] !== '-') t = '+' + t;
  return t;
}

/** Source d'un champ de registre selon le chiffre CPOP. */
function regField(d, prep, val3) {
  const regs = [];
  for (const s of prep.subs) for (const r of s.regs) regs.push(r);
  switch (d) {
    case '0': return val3;
    case '1': return prep.opReg ? prep.opReg.n : 0;
    case '2': return regs.length === 1 ? regs[0].n : regs.length >= 2 ? regs[1].n : 0;
    case '3': return regs.length >= 1 ? regs[0].n : 0;
    default: return 0;
  }
}

/** Assemble une instruction CPU (passe 1 : place ; passe 2 : valeur). */
export function assembleCpuInstruction(asm, entry, def, pass) {
  const b = asm.cur;
  const loc = entry.f.loc;
  const len = def.len || 30;
  if (def.machine === '8' && asm.machineType && asm.machineType[0] !== '8') {
    if (pass === 1) asm.flag(entry, 'O', 'instruction réservée aux modèles 8xx');
  }
  asm.prepareCode(entry);
  if ((loc && loc !== '-') || (def.before && loc !== '-')) asm.forceUpper(b);
  if (b.pos < len) asm.forceUpper(b);
  asm.defineLocation(entry);
  if (def.kind === 'cpuerror') {
    asm.emitBits(30, 0n, null);
    return;
  }
  let prep = entry.prep;
  if (pass === 2) {
    prep = prepareCpuStatement(asm, entry, entry.prep && entry.prep.blank);
    if (!prep || prep.key !== entry.prep.key) prep = entry.prep;
  }
  // erreurs d'analyse des sous-champs
  for (const s of prep.subs) if (s.val.error && pass === 2) asm.flag(entry, s.val.error.flag, s.val.error.message);
  const val = def.val;
  const iBits = val & 7;
  const fmi = val & ~7;
  const i = def.reg[0] === '0' ? iBits : regField(def.reg[0], prep, 0);
  const j = regField(def.reg[1], prep, 0);
  const k = regField(def.reg[2], prep, 0);
  const qsub = prep.subs.find((s) => s.hasQ);
  let word, rel = null;
  if (len === 30) {
    let K = 0n;
    if (qsub) {
      const q = pass === 2 ? evalQ(asm, entry, qsub) : null;
      if (q) {
        const fin = asm.finalize(q, 18, entry);
        K = fin.w;
        if (fin.rel) rel = { ...fin.rel, fieldBits: 18 };
      }
    }
    word = (BigInt((fmi | i) & 0o777) << 21n) | (BigInt(j & 7) << 18n) | K;
  } else {
    let jk = (j << 3) | k;
    if (def.jk || def.n9) {
      let n = 0;
      if (qsub && pass === 2) {
        const q = evalQ(asm, entry, qsub);
        if (!q.isAbsolute()) throw new AsmError('A', 'compte absolu exigé');
        n = q.num();
      }
      if (def.jk) {
        if (n < 0 && n >= -60) n += 60;
        else if (Object.is(n, -0)) n = 60;
        if (n < -60 || n > 63) { asm.flag(entry, '7'); n &= 0o77; }
        jk = n & 0o77;
        word = (BigInt((fmi | i) & 0o777) << 6n) | BigInt(jk);
      } else {
        word = (BigInt(0o46) << 9n) | BigInt(n & 0o777);
      }
    }
    if (word === undefined) word = (BigInt((fmi | i) & 0o777) << 6n) | BigInt(jk & 0o77);
  }
  asm.emitBits(len, word, rel);
  if (def.after) b.pendingForce = true;
  if (def.kind === 'cpu' && (def.key === 'PS' || def.key === 'PSQ') && loc) asm.titles.subsub = loc;
}

/** Évalue la partie expression (Q) d'un sous-champ en passe 2. */
function evalQ(asm, entry, sub) {
  const ctx = asm.ctxFor(entry, { regs: true, fieldBits: 18 });
  // réévaluation du texte du sous-champ, registres comptés pour zéro
  const c2 = new Cursor(sub.text, 0);
  const v = parseExpression(c2, ctx);
  asm.checkReloc(v);
  return v;
}
