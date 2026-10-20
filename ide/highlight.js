// Coloration syntaxique COMPASS.
//
// Découpage d'une ligne en champs (manuel COMPASS 3, §2.1) :
//   - `*` en colonne 1 : ligne de commentaire ; `,` en colonne 1 : continuation ;
//   - location : de la colonne 1 (ou 2) jusqu'au premier blanc ;
//   - opération : premier mot suivant, s'il commence avant la colonne 30 ;
//   - variable : sous-champs séparés par des virgules, terminés par un blanc
//     (sauf dans une donnée caractère nHxxx ou une chaîne délimitée) ;
//   - commentaire : le reste ; colonnes 73 et suivantes : champ de séquence.
// Chaque jeton porte une classe CSS (préfixe « t-») et son champ.

export const COMMENT_COL = 30;   // colonne de commentaire par défaut
export const LAST_COL = 72;      // dernière colonne interprétée

/** Instructions CPU sans désignateur de registre. */
const CPU_PLAIN = new Set([
  'PS', 'RJ', 'RE', 'WE', 'RL', 'WL', 'XJ', 'MJ', 'ES', 'JP', 'ZR', 'NZ', 'PL', 'NG', 'MI', 'IR', 'OR',
  'DF', 'ID', 'EQ', 'NE', 'GE', 'LT', 'LE', 'GT', 'NO', 'IM', 'DM', 'CC', 'CU', 'RI', 'RO', 'CR', 'CW',
]);
/** Instructions CPU suivies d'un numéro de registre (SA1, BX6, ...). */
const CPU_REG = /^(SA|SB|SX|BX|LX|AX|NX|ZX|UX|PX|FX|DX|RX|IX|MX|CX|WX|TB|IB|OB)[0-7]$/;

/** Instructions PP (6000 et Cyber 170). */
export const PP_OPS = new Set([
  'PSN', 'LJM', 'RJM', 'UJN', 'ZJN', 'NJN', 'PJN', 'MJN', 'SHN', 'LMN', 'LPN', 'SCN', 'LDN', 'LCN',
  'ADN', 'SBN', 'LDC', 'ADC', 'LPC', 'LMC', 'LRD', 'SRD', 'EXN', 'MXN', 'MAN', 'RPN', 'LDD', 'ADD',
  'SBD', 'LMD', 'STD', 'RAD', 'AOD', 'SOD', 'LDI', 'ADI', 'SBI', 'LMI', 'STI', 'RAI', 'AOI', 'SOI',
  'LDM', 'ADM', 'SBM', 'LMM', 'STM', 'RAM', 'AOM', 'SOM', 'CRD', 'CRM', 'CWD', 'CWM', 'AJM', 'IJM',
  'FJM', 'EJM', 'SCF', 'CCF', 'SFM', 'CFM', 'IAN', 'IAM', 'OAN', 'OAM', 'ACN', 'DCN', 'FAN', 'FNC',
]);

/** Pseudo-instructions COMPASS 3. */
export const PSEUDO_OPS = new Set([
  'IDENT', 'END', 'ABS', 'MACHINE', 'PPU', 'PERIPH', 'CIPPU', 'SEGMENT', 'SEG', 'STEXT', 'COMMENT',
  'NOLABEL', 'LCC', 'MEMSEL', 'LDSET', 'BASE', 'CHAR', 'CODE', 'QUAL', 'B1=1', 'B7=1', 'COL', 'USE',
  'USELCM', 'ORG', 'ORGC', 'BSS', 'BSSZ', 'LOC', 'POS', 'EQU', '=', 'SET', 'MAX', 'MIN', 'MICCNT',
  'SST', 'ENTRY', 'ENTRYC', 'EXT', 'DATA', 'DIS', 'LIT', 'VFD', 'CON', 'R=', 'REP', 'REPC', 'REPI',
  'IF', 'IFC', 'IFEQ', 'IFNE', 'IFGT', 'IFGE', 'IFLT', 'IFLE', 'IFPL', 'IFMI', 'IFCP', 'IFCP6',
  'IFCP7', 'IFPP', 'IFPP6', 'IFPP7', 'ELSE', 'ENDIF', 'SKIP', 'ERR', 'ERRMI', 'ERRNG', 'ERRNZ',
  'ERRPL', 'ERRZR', 'LIST', 'EJECT', 'SPACE', 'TITLE', 'TTL', 'NOREF', 'CTEXT', 'ENDX', 'XREF',
  'XTEXT', 'RMT', 'HERE', 'DUP', 'ECHO', 'STOPDUP', 'ENDD', 'MACRO', 'MACROE', 'LOCAL', 'ENDM',
  'OPDEF', 'IRP', 'OPSYN', 'NIL', 'PURGMAC', 'PURGDEF', 'PPOP', 'CPOP', 'CPSYN', 'MICRO', 'OCTMIC',
  'DECMIC', 'CPU', 'REPI',
]);

export function isCpuMnemonic(op) {
  return CPU_PLAIN.has(op) || CPU_REG.test(op);
}

/** Classe d'un code opération. */
export function opClass(op, macros) {
  const u = op.toUpperCase();
  if (macros && macros.has(u)) return 't-macro';
  if (PSEUDO_OPS.has(u)) return 't-pseudo';
  if (PP_OPS.has(u) || isCpuMnemonic(u)) return 't-mn';
  return 't-opx';
}

/**
 * Recense les noms de macros définis dans un source (MACRO/MACROE/OPDEF).
 * Format un : nom en location ; format deux : premier élément du champ variable.
 */
export function collectMacros(text) {
  const set = new Set();
  const re = /^([^\s*,][^\s]*)?[ ]+(MACROE?|OPDEF)\b[ ]*([^\s,()+\-*/$=.]*)/gim;
  let m;
  while ((m = re.exec(text))) {
    const loc = m[1];
    const name = loc && loc.trim() ? loc.trim() : m[3];
    if (name) set.add(name.toUpperCase());
  }
  return set;
}

const isBlank = (c) => c === ' ' || c === '\t';
const IDENT_CHARS = /[A-Za-z0-9$@_.:]/;
const DATA_LETTERS = 'HLRCAZ';

/**
 * Découpe une ligne en jetons [{ s, c, f }] : texte, classe CSS, champ
 * ('loc' | 'op' | 'var' | 'com' | 'seq' | 'cont').
 */
export function tokenizeLine(line, ctx = {}) {
  const out = [];
  if (!line) return out;
  const main = line.length > LAST_COL ? line.slice(0, LAST_COL) : line;
  const seq = line.length > LAST_COL ? line.slice(LAST_COL) : '';
  const push = (s, c, f) => { if (s) out.push({ s, c, f }); };
  const c0 = main[0];

  if (c0 === '*') {
    pushCommentWithMicros(out, main, 'com');
  } else if (c0 === ',') {
    push(',', 't-cont', 'cont');
    const end = scanVariable(main, 1, '', out, ctx);
    if (end < main.length) push(main.slice(end), 't-com', 'com');
  } else {
    let i = 0;
    // Champ location (colonne 1 ou 2).
    if (!isBlank(main[0] || ' ') || !isBlank(main[1] || ' ')) {
      const start = isBlank(main[0]) ? 1 : 0;
      push(main.slice(0, start), '', 'loc');
      let j = start;
      while (j < main.length && !isBlank(main[j])) j++;
      const loc = main.slice(start, j);
      pushWithMicros(out, loc, loc === '+' || loc === '-' ? 't-force' : 't-label', 'loc');
      i = j;
    }
    // Blancs avant l'opération.
    let j = i;
    while (j < main.length && isBlank(main[j])) j++;
    push(main.slice(i, j), '', 'loc');
    const commentCol = ctx.commentCol || COMMENT_COL;
    if (j >= main.length) {
      // rien d'autre
    } else if (j >= commentCol - 1) {
      pushCommentWithMicros(out, main.slice(j), 'com');
    } else {
      let k = j;
      while (k < main.length && !isBlank(main[k])) k++;
      const op = main.slice(j, k);
      const opName = op.split(',')[0];
      pushWithMicros(out, op, opClass(opName, ctx.macros), 'op');
      // Blancs avant le champ variable.
      let v = k;
      while (v < main.length && isBlank(main[v])) v++;
      push(main.slice(k, v), '', 'op');
      const effCol = k >= commentCol - 1 ? Infinity : commentCol - 1;
      if (v < main.length) {
        if (v >= effCol) {
          pushCommentWithMicros(out, main.slice(v), 'com');
        } else {
          const end = scanVariable(main, v, opName.toUpperCase(), out, ctx);
          if (end < main.length) pushCommentWithMicros(out, main.slice(end), 'com');
        }
      }
    }
  }
  if (seq) out.push({ s: seq, c: 't-seq', f: 'seq' });
  return out;
}

/** Commentaire, avec repérage des références de micros "NOM". */
function pushCommentWithMicros(out, s, f) {
  out.push({ s, c: 't-com', f });
}

function pushWithMicros(out, s, c, f) {
  if (s.indexOf('"') < 0) { out.push({ s, c, f }); return; }
  const re = /"[^"]*"/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ s: s.slice(last, m.index), c, f });
    out.push({ s: m[0], c: 't-micro', f });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ s: s.slice(last), c, f });
}

/**
 * Analyse le champ variable à partir de `i`. Pousse les jetons et retourne
 * l'indice du premier caractère du commentaire (ou la longueur de la ligne).
 */
function scanVariable(s, i, op, out, ctx) {
  const n = s.length;
  const push = (a, b, c) => { if (b > a) out.push({ s: s.slice(a, b), c, f: 'var' }); };
  const macroCall = ctx.macros && ctx.macros.has(op);
  const dataOp = op === 'DATA' || op === 'LIT';
  let depth = 0;
  let subfield = 0;
  // DIS n,texte : le texte occupe 10n (CPU) ou 2n (PP) caractères, blancs compris.
  if (op === 'DIS') {
    let j = i;
    while (j < n && s[j] !== ',' && !isBlank(s[j])) j++;
    const count = s.slice(i, j);
    if (j < n && s[j] === ',') {
      scanExpr(s, i, j, out, ctx);
      push(j, j + 1, 't-punct');
      const start = j + 1;
      if (!count.trim()) {
        // Format deux : ,dchainedd
        const d = s[start];
        if (d === undefined) return n;
        let e = s.indexOf(d, start + 1);
        e = e < 0 ? n : e + 1;
        push(start, e, 't-str');
        return skipToComment(s, e, out);
      }
      const words = /^\d+$/.test(count) ? Number(count) : 1;
      const len = Math.max(0, words) * (ctx.pp ? 2 : 10);
      const e = Math.min(n, start + len);
      push(start, e, 't-str');
      return skipToComment(s, e, out);
    }
  }
  if (op === 'MICRO') {
    // MICRO n1,n2,dchaîned
    let commas = 0, j = i;
    while (j < n && commas < 2 && !isBlank(s[j])) { if (s[j] === ',') commas++; j++; }
    if (commas === 2) {
      scanExpr(s, i, j, out, ctx);
      const d = s[j];
      if (d === undefined) return n;
      let e = s.indexOf(d, j + 1);
      e = e < 0 ? n : e + 1;
      push(j, e, 't-str');
      return skipToComment(s, e, out);
    }
  }
  while (i < n) {
    const c = s[i];
    if (isBlank(c)) {
      if (depth > 0 && macroCall) { push(i, i + 1, ''); i++; continue; }
      break;
    }
    if (c === '"') {
      let e = s.indexOf('"', i + 1);
      e = e < 0 ? n : e + 1;
      push(i, e, 't-micro');
      i = e;
      continue;
    }
    if (c >= '0' && c <= '9') {
      // Donnée caractère à compte : nHxxx, nLxxx, nRxxx… (n caractères, blancs compris ;
      // n = 0 : jusqu'au premier blanc ou virgule).
      let j = i;
      while (j < n && s[j] >= '0' && s[j] <= '9') j++;
      const L = (s[j] || '').toUpperCase();
      if (DATA_LETTERS.includes(L) && L !== '') {
        const count = Number(s.slice(i, j));
        let e = j + 1;
        if (count > 0) e = Math.min(n, j + 1 + count);
        else while (e < n && !isBlank(s[e]) && s[e] !== ',') e++;
        push(i, e, 't-str');
        i = e;
        continue;
      }
      // Nombre : 77B, 12D, 1.5E3, 10000B, 1.0 ...
      let e = i;
      while (e < n && /[0-9A-Za-z.]/.test(s[e])) {
        if ((s[e] === 'E' || s[e] === 'e') && (s[e + 1] === '+' || s[e + 1] === '-')) e += 2;
        else e++;
      }
      push(i, e, 't-num');
      i = e;
      continue;
    }
    if (DATA_LETTERS.includes(c.toUpperCase()) && i + 1 < n && !/[A-Za-z0-9\s,"^]/.test(s[i + 1])
      && (dataOp || s[i - 1] === '=') && (i === 0 || /[,=(+\-\s]/.test(s[i - 1]))) {
      // Donnée délimitée : H*texte*, L/texte/ … (DATA, LIT et littéraux seulement).
      const d = s[i + 1];
      const e = s.indexOf(d, i + 2);
      if (e > 0) {
        push(i, e + 1, 't-str');
        i = e + 1;
        continue;
      }
    }
    if (IDENT_CHARS.test(c) && c !== '.') {
      let e = i;
      while (e < n && IDENT_CHARS.test(s[e])) e++;
      const word = s.slice(i, e);
      const up = word.toUpperCase();
      let cls = 't-sym';
      if (/^[ABX][0-7]$/.test(up)) cls = 't-reg';
      push(i, e, cls);
      i = e;
      continue;
    }
    if (c === '(') depth++;
    if (c === ')') depth = Math.max(0, depth - 1);
    if (c === ',') subfield++;
    if (c === '^') { push(i, i + 1, 't-concat'); i++; continue; }
    push(i, i + 1, c === '=' ? 't-lit' : 't-punct');
    i++;
  }
  return i;
}

/** Expression simple (sans données caractère) entre a et b. */
function scanExpr(s, a, b, out, ctx) {
  const sub = s.slice(0, b);
  const tmp = [];
  scanVariable(sub, a, '', tmp, ctx);
  for (const t of tmp) out.push(t);
}

/** Saute les blancs ; le reste est du commentaire. */
function skipToComment(s, i, out) {
  let j = i;
  while (j < s.length && isBlank(s[j])) j++;
  if (j > i) out.push({ s: s.slice(i, j), c: '', f: 'var' });
  return j;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ESC[c]);

/** Ligne colorée en HTML. */
export function highlightLine(line, ctx) {
  let html = '';
  for (const t of tokenizeLine(line, ctx)) {
    const e = escapeHtml(t.s);
    html += t.c ? `<span class="${t.c}">${e}</span>` : e;
  }
  return html;
}

/** Champ de la ligne sous la colonne `col` (0 = première colonne). */
export function fieldAt(line, col, ctx) {
  let pos = 0;
  let last = null;
  for (const t of tokenizeLine(line, ctx)) {
    if (col < pos + t.s.length) return t.f;
    pos += t.s.length;
    last = t.f;
  }
  if (line[0] === '*') return 'com';
  return last === 'com' ? 'com' : col >= LAST_COL ? 'seq' : null;
}

/** Colonne (0-based) du début du champ opération, ou -1. */
export function opColumn(line, ctx) {
  let pos = 0;
  for (const t of tokenizeLine(line, ctx)) {
    if (t.f === 'op' && t.c) return pos;
    pos += t.s.length;
  }
  return -1;
}
