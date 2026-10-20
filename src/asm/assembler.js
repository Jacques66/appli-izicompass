// Assembleur COMPASS 3 : cœur (deux passes, blocs, compteurs, symboles, émission).
//
// Passe 1 : lecture, édition, expansion (macros, DUP, ECHO, RMT, XTEXT),
// assemblage conditionnel, définition des symboles (valeurs relatives à leur
// bloc), attribution des emplacements. Chaque instruction retenue devient une
// « entrée » qui mémorise l'état des compteurs au début et à la fin.
// Passe 2 (à chaque IDENT d'overlay et à END) : origine des blocs, puis
// réexécution des entrées qui produisent du code, avec les valeurs finales.

import { M60, to60, signed60 } from '../common/word.js';
import { Val, Cursor, AsmError, parseExpression, parseDataItem, fitsBits, truncBits, readSymbolName, isSymbolChar } from './expr.js';
import { LineSource, editStatement, scanFields, MARK } from './source.js';
import { SourceFrame } from './frames.js';
import { CPU_SYNTAX } from './cpuops.js';
import { PP_OPS } from './ppops.js';
import { PSEUDO_HANDLERS, ANYWHERE, FIRST_GROUP_ONLY } from './pseudos.js';
import { Listing } from './listing.js';
import { buildBinary } from './binary.js';
import { assembleCpuInstruction, cpuSyntaxLookup, prepareCpuStatement } from './cpuasm.js';
import { assemblePpInstruction } from './ppasm.js';
import { captureStatement, beginMacroCall } from './macros.js';

export const ERROR_TEXT = {
  A: 'ADDRESS FIELD BAD.',
  D: 'DOUBLY DEFINED SYMBOL. THE FIRST DEFINITION HOLDS.',
  E: 'ECHO, DUP, RMT, OR MACRO ILLEGALLY NESTED.',
  F: 'NUMBER OF ENTRIES EXCEEDS PERMISSIBLE AMOUNT.',
  L: 'LOCATION FIELD BAD.',
  N: 'NEGATIVE RELOCATION ON ENTRY POINT.',
  O: 'OPERATION FIELD BAD.',
  P: 'CONSULT LISTING FOR REASON BEHIND P-ERROR.',
  R: 'DATA ORIGIN OUTSIDE BLOCK OR IN BLANK COMMON.',
  U: 'UNDEFINED SYMBOL. VALUE ASSUMED 0.',
  V: 'BIT COUNT ERROR ON VFD (MUST BE 0 < COUNT <= 60).',
  1: 'LOCATION SYMBOL BAD. SYMBOL NOT DEFINED.',
  2: 'ADDRESS ERROR ON SYMBOL DEFINITION.',
  3: 'DUPLICATE MACRO DEFINITION. NEW ONE OVERRIDES.',
  4: 'BAD FORMAL PARAMETER NAME IGNORED.',
  5: 'CPU OPERATION SYNTAX INCORRECTLY SPECIFIED.',
  6: 'LOCATION FIELD MEANINGLESS.',
  7: 'ADDRESS VALUE EXCEEDS FIELD SIZE, RESULT TRUNCATED.',
  8: 'MISSING OR EXTRA ADDRESS SUBFIELD.',
  9: 'MICRO SUBSTITUTION ERROR. NO SUBSTITUTION.',
};
export const FATAL = new Set(['A', 'D', 'E', 'F', 'L', 'N', 'O', 'P', 'R', 'U', 'V']);

export class Block {
  constructor(asm, name, type, key, lcm = false) {
    this.name = name;
    this.type = type;          // 'abs' | 'zero' | 'lit' | 'local' | 'common' | 'blank'
    this.key = key;
    this.lcm = lcm;
    this.order = asm.blockOrder.length;
    asm.blockOrder.push(this);
    this.origin = 0;
    this.locBlock = this;
    this.locOffset = 0;
    this.pos = asm.wordBits;
    this.max = 0;
    this.pendingForce = false;
    this.vfdOpen = false;
    this.final = 0;            // origine attribuée en passe 2
    this.mem = new Map();      // passe 2 : décalage -> { w, rels }
    this.cond = false;         // ORGC (préréglage conditionnel)
    this.everData = false;
  }
  isRelocatable() {
    return this.type !== 'abs';
  }
  snapshot() {
    return { origin: this.origin, locBlock: this.locBlock, locOffset: this.locOffset, pos: this.pos,
      pendingForce: this.pendingForce, vfdOpen: this.vfdOpen };
  }
  restore(s) {
    this.origin = s.origin;
    this.locBlock = s.locBlock;
    this.locOffset = s.locOffset;
    this.pos = s.pos;
    this.pendingForce = s.pendingForce;
    this.vfdOpen = s.vfdOpen;
  }
}

/** Liste de pseudo-instructions de contrôle binaire, de données, d'allocation (forçage différé). */
const CODE_PSEUDOS = new Set(['BSS', 'BSSZ', 'DATA', 'DIS', 'CON', 'VFD', 'R=', 'LIT', 'SEG', 'SEGMENT', 'IDENT', 'END', 'ORG', 'ORGC', 'LOC', 'MD', 'DM', 'CC', 'CU']);

export class Assembler {
  constructor(options = {}) {
    this.options = { F: 0, ...options };
    this.texts = options.texts || {};
    this.date = options.date || new Date();
    this.allErrors = [];
    this.programs = [];
    this.lines = [];
    this.symbolsOut = [];
    this.listing = new Listing(this);
    this.systemDefs = options.systemDefs || null;
    this.inventCounter = 0;
  }

  // =============================================================== pilotage

  /** Assemble un fichier source complet (un ou plusieurs sous-programmes). */
  assemble(source, fileName = 'PROG') {
    this.fileName = fileName;
    this.frames = [new SourceFrame(new LineSource(fileName, source), null, 0)];
    this.inProgram = false;
    let st;
    let guard = 0;
    while ((st = this.nextStatement()) !== null) {
      if (++guard > 5_000_000) { this.fatalRun('assemblage interrompu : boucle infinie probable'); break; }
      if (!this.inProgram) {
        this.betweenPrograms(st);
        continue;
      }
      this.processStatement(st);
    }
    if (this.inProgram) {
      // fin de fichier sans END
      this.flagEntry(this.lastEntry, 'O', 'END manquant');
      this.endProgram(null);
    }
    return this.result();
  }

  fatalRun(msg) {
    this.allErrors.push({ line: 0, file: this.fileName, flag: 'F', fatal: true, message: msg });
  }

  /** Instructions hors sous-programme : commentaires jusqu'au IDENT. */
  betweenPrograms(st) {
    if (!st.comment) {
      const f = scanFields(st.img);
      if (f.op === 'IDENT') {
        this.beginProgram();
        this.processStatement(st);
        return;
      }
      if (f.op === 'END') {
        this.allErrors.push({ line: st.line, file: st.file, flag: 'O', fatal: true, message: 'IDENT STATEMENT MISSING.' });
      }
    }
    this.listing.preamble(st);
  }

  nextStatement() {
    while (this.frames.length) {
      const f = this.frames[this.frames.length - 1];
      const st = f.next();
      if (st) {
        st.level = st.forceLevel ?? this.frames.length - 1;
        return st;
      }
      this.frames.pop();
      if (f.kind === 'dup' || f.kind === 'echo') this.dupDepth--;
    }
    return null;
  }

  pushFrame(frame) {
    if (this.frames.length > 400) {
      this.flagEntry(this.lastEntry, 'F', 'RECURSION DEPTH EXCEEDED 400.');
      this.frames.length = 1;
      return;
    }
    this.frames.push(frame);
  }

  // ========================================================= sous-programme

  beginProgram() {
    this.inProgram = true;
    this.type = 'reloc';
    this.ppFlavor = null;
    this.wordBits = 60;
    this.machine = null;
    this.machineType = '';
    this.hfi = [];
    this.progName = '';
    this.identEntry = null;
    this.firstGroup = true;
    this.symbols = new Map();
    this.symbolOrder = [];
    this.externals = new Map();       // nom -> { weak, refs }
    this.entryPoints = new Map();     // nom -> { cond, entry }
    this.defaults = new Map();        // =S non définis : nom -> { qual }
    this.mnemonic = new Map();        // nom -> [entrées], la plus récente à la fin
    this.syntactic = new Map();       // clé -> [entrées]
    this.micros = new Map();
    this.userMicros = new Set();
    this.base = 'D';
    this.code = 'D';
    this.qual = '';
    this.stacks = { BASE: [], CODE: [], QUAL: [], USE: [], LIST: [] };
    this.other = Array.from({ length: 64 }, (_, i) => i);
    this.cc = 30;
    this.b1 = null;                   // 'B1' ou 'B7' après B1=1 / B7=1
    this.skip = null;                 // état de saut IF
    this.capture = null;              // définition en cours de capture
    this.rmt = { unlabeled: [], labeled: new Map() };
    this.dupDepth = 0;
    this.ctext = false;
    this.xrefMode = 'P';
    this.comments = [];
    this.nolabel = null;
    this.ldset = [];
    this.lcc = [];
    this.reps = [];
    this.seg = [];
    this.overlays = [];
    this.groupIndex = 0;
    this.groups = [];
    this.segments = [];
    this.overlayHeads = [];
    this.qualOrder = [];
    this.groupBase = undefined;
    this.listOpts = new Set(['B', 'L', 'N', 'R']);
    this.titles = { main: null, sub: '', subsub: '' };
    this.firstTitleSeen = false;
    this.programErrors = [];
    this.inventCounter = 0;
    this.statements = 0;
    this.references = 0;
    this.noref = new Set();
    this.entries = [];
    this.pass = 1;
    this.startGroup();
    this.initMicros();
    this.loadSystemText();
  }

  startGroup() {
    this.blocks = new Map();
    this.blockOrder = [];
    this.literals = [];               // mots du bloc des littéraux
    this.groupEntries = [];
    this.nominal = null;
    this.cur = null;
    this.stacks && (this.stacks.USE = []);
  }

  /** Bloc nominal selon le type d'assemblage (créé à la demande). */
  nominalBlock() {
    if (this.nominal) return this.nominal;
    const type = this.type === 'reloc' ? 'zero' : 'abs';
    this.nominal = this.getBlock('PROGRAM*', type, 'nominal');
    return this.nominal;
  }

  getBlock(name, type, key, lcm = false) {
    let b = this.blocks.get(key);
    if (!b) {
      b = new Block(this, name, type, key, lcm);
      this.blocks.set(key, b);
      if (this.blocks.size > 255) this.flagCur('F', 'plus de 255 blocs');
    }
    return b;
  }

  literalBlock() {
    return this.getBlock('LITERALS*', 'lit', 'literals');
  }

  initMicros() {
    const d = this.date;
    const p2 = (n) => String(n).padStart(2, '0');
    const yy = p2(d.getFullYear() % 100);
    this.micros.set('DATE', ` ${yy}/${p2(d.getMonth() + 1)}/${p2(d.getDate())}.`);
    const start = new Date(d.getFullYear(), 0, 0);
    const ddd = String(Math.floor((d - start) / 86400000)).padStart(3, '0');
    this.micros.set('JDATE', `${yy}${ddd}`);
    this.micros.set('TIME', ` ${p2(d.getHours())}.${p2(d.getMinutes())}.${p2(d.getSeconds())}.`);
    this.micros.set('BASE', 'D');
    this.micros.set('CODE', 'D');
    this.micros.set('QUAL', '');
    this.micros.set('SEQUENCE', ''.padEnd(18, ' '));
    this.micros.set('MODLEVEL', this.options.ML || `${yy}${ddd}`);
    this.micros.set('PCOMMENT', (this.options.PC || '').padEnd(30, ' ').slice(0, 30));
  }

  /** Charge les définitions d'un texte système (macros, opdefs, micros, symboles). */
  loadSystemText() {
    const sys = this.systemDefs;
    if (!sys) return;
    for (const [name, list] of sys.mnemonic) this.mnemonic.set(name, list.slice());
    for (const [key, list] of sys.syntactic) this.syntactic.set(key, list.slice());
    for (const [name, v] of sys.micros) if (!['DATE', 'JDATE', 'TIME', 'SEQUENCE'].includes(name)) this.micros.set(name, v);
    this.systemSymbols = sys.symbols;
  }

  // ======================================================= instruction source

  processStatement(st) {
    this.statements++;
    if (st.frame && st.frame.kind === 'main' && st.seq !== undefined) {
      this.micros.set('SEQUENCE', (st.seq || '').padEnd(18, ' ').slice(0, 18));
    }
    // Capture d'une définition (macro, DUP, ECHO, RMT) : instructions non éditées.
    if (this.capture) {
      captureStatement(this, st);
      return;
    }
    if (st.comment) {
      this.listOnly(st, { comment: true });
      return;
    }
    const ed = editStatement(st.img, (n) => this.micros.get(n));
    const img = ed.img;
    if (this.skip) {
      this.skipStatement(st, img, ed);
      return;
    }
    let f = scanFields(img, this.cc);
    if (!f.op) {
      if (f.loc) {
        // symbole avec opération vide = BSSZ 1
        this.dispatch(st, img, f, 'BSSZ', ed, true);
      } else {
        this.listOnly(st, { blank: true, img });
      }
      return;
    }
    // Sous-champs dans le champ opération (« EQ,B1 B2,K », « SB.SUM »)
    let op = f.op;
    let opExtra = null;
    const comma = op.indexOf(',');
    if (comma > 0) {
      opExtra = op.slice(comma + 1);
      op = op.slice(0, comma);
    }
    this.dispatch(st, img, f, op, ed, false, opExtra);
  }

  /** Recherche le code opération et lance son traitement. */
  dispatch(st, img, f, op, ed, implicitBssz = false, opExtra = null) {
    const entry = this.newEntry(st, img, f, op, ed);
    entry.opExtra = opExtra;
    if (implicitBssz) {
      entry.implicit = true;
      this.runPseudo(entry, 'BSSZ');
      return;
    }
    // 1. entrées mnémoniques : macros, pseudo-instructions, instructions PP
    const mn = this.lookupMnemonic(op);
    if (mn) {
      if (mn.kind === 'macro') return beginMacroCall(this, entry, mn);
      if (mn.kind === 'pseudo') return this.runPseudo(entry, mn.name);
      if (mn.kind === 'pp') return this.runInstruction(entry, mn);
      if (mn.kind === 'ppop') return this.runInstruction(entry, mn);
      if (mn.kind === 'nil') return this.finishEntry(entry);
    }
    if (this.type === 'pp') {
      this.flag(entry, 'O', `opération inconnue : ${op}`);
      entry.kind = 'pperror';
      return this.runInstruction(entry, { kind: 'pp', name: op, code: 0, fmt: 'md', error: true });
    }
    // 2. entrées syntaxiques : OPDEF, CPOP, CPSYN, instructions CPU
    const prep = prepareCpuStatement(this, entry);
    if (prep) {
      const sx = cpuSyntaxLookup(this, prep.key);
      if (sx) {
        if (sx.kind === 'opdef') return beginMacroCall(this, entry, sx, prep);
        entry.prep = prep;
        return this.runInstruction(entry, sx);
      }
      // essai avec les sous-champs séparés par des blancs (« UX1 B2 X3 »)
      const prep2 = prepareCpuStatement(this, entry, true);
      if (prep2 && prep2.key !== prep.key) {
        const sx2 = cpuSyntaxLookup(this, prep2.key);
        if (sx2) {
          if (sx2.kind === 'opdef') return beginMacroCall(this, entry, sx2, prep2);
          entry.prep = prep2;
          return this.runInstruction(entry, sx2);
        }
      }
    }
    this.flag(entry, 'O', `opération inconnue : ${op}${prep ? ` (syntaxe ${prep.key})` : ''}`);
    entry.kind = 'cpuerror';
    this.runInstruction(entry, { kind: 'cpuerror', len: 30, val: 0, reg: '000' });
  }

  lookupMnemonic(op) {
    const list = this.mnemonic.get(op);
    if (list) {
      for (let k = list.length - 1; k >= 0; k--) if (!list[k].purged) return list[k];
    }
    if (this.purgedBuiltin && this.purgedBuiltin.has(op)) return null;
    if (PSEUDO_HANDLERS[op]) {
      if (op === 'LOCAL') return null;
      return { kind: 'pseudo', name: op };
    }
    if (this.type === 'pp') {
      const pp = PP_OPS.get(op);
      if (pp) return { kind: 'pp', ...pp };
    }
    return null;
  }

  newEntry(st, img, f, op, ed) {
    const frame = st.frame;
    const entry = {
      st, img, f, op,
      file: st.file, line: st.line,
      site: st.site || { file: st.file, line: st.line },
      level: st.level || 0,
      frame,
      flags: new Set(),
      messages: [],
      code: [],
      ctx: { qual: this.qual, base: this.base, code: this.code, other: this.other },
      edited: ed && ed.changed ? true : false,
      rawImg: st.img,
      listReq: this.listRequirements(st),
      group: this.groupIndex,
      kind: null,
    };
    if (ed && ed.warnings.length) for (const w of ed.warnings) this.flag(entry, w);
    this.lastEntry = entry;
    this.entries.push(entry);
    this.groupEntries.push(entry);
    return entry;
  }

  /** Options de listing nécessaires selon l'origine de la ligne. */
  listRequirements(st) {
    const req = new Set();
    for (let k = 1; k < this.frames.length; k++) {
      const fr = this.frames[k];
      if (fr.kind === 'macro' || fr.kind === 'opdef') req.add(fr.system ? 'S' : 'M');
      else if (fr.kind === 'dup' || fr.kind === 'echo') req.add('E');
      else if (fr.kind === 'rmt') req.add('D');
      else if (fr.kind === 'xtext') req.add('X');
    }
    if (this.ctext) req.add('X');
    return req;
  }

  /** Ligne seulement listée (commentaire, ligne sautée, ligne de définition). */
  listOnly(st, info = {}) {
    const entry = {
      st, img: info.img ?? st.img, rawImg: st.img, file: st.file, line: st.line,
      site: st.site || { file: st.file, line: st.line }, level: st.level || 0,
      flags: new Set(info.flags || []), messages: [], code: [], listOnly: true, info,
      listReq: this.listRequirements(st), group: this.groupIndex, kind: 'list',
    };
    if (info.skipped) entry.listReq.add('F');
    this.entries.push(entry);
    this.groupEntries.push(entry);
    return entry;
  }

  // ============================================================ erreurs

  flag(entry, flag, message) {
    if (!entry) return;
    flag = String(flag);
    entry.flags.add(flag);
    if (message) {
      const key = flag + message;
      if (!entry.messages.some((m) => m.key === key)) entry.messages.push({ key, flag, message });
    }
  }

  flagEntry(entry, flag, message) {
    this.flag(entry, flag, message);
  }

  flagCur(flag, message) {
    this.flag(this.curEntry || this.lastEntry, flag, message);
  }

  // ============================================================ IF : saut

  skipStatement(st, img, ed) {
    const f = scanFields(img, this.cc);
    const s = this.skip;
    let op = f.op;
    const name = f.loc;
    if (op === 'END') {
      this.skip = null;
      this.processStatement({ ...st, img });
      return;
    }
    if (op === 'ELSE') {
      const ok = s.count != null ? (name === '' || name === s.name) : s.name === '' ? name === '' : (name === s.name || name === '');
      if (ok) {
        this.skip = null;
        this.listOnly(st, { img, ifctl: true });
        return;
      }
    } else if (op === 'ENDIF' && s.count == null) {
      const ok = s.name === '' ? true : (name === s.name || name === '');
      if (ok) {
        this.skip = null;
        this.listOnly(st, { img, ifctl: true });
        return;
      }
    }
    this.listOnly(st, { img, skipped: true });
    if (s.count != null) {
      s.count--;
      if (s.count <= 0) this.skip = null;
    }
  }

  startSkip(name, count, kind) {
    this.skip = { name: name || '', count: count && count > 0 ? count : null, kind };
  }

  // =================================================== traitements communs

  runPseudo(entry, name) {
    const h = PSEUDO_HANDLERS[name];
    entry.kind = 'pseudo';
    entry.pseudo = name;
    if (this.firstGroup && !ANYWHERE.has(name) && !FIRST_GROUP_ONLY.has(name) && name !== 'IDENT') {
      this.firstGroup = false;
    } else if (!this.firstGroup && FIRST_GROUP_ONLY.has(name)) {
      this.flag(entry, 'O', `${name} hors du premier groupe d'instructions`);
      return this.finishEntry(entry);
    }
    this.curEntry = entry;
    try {
      this.beginCode(entry);
      h(this, entry, 1);
    } catch (e) {
      this.handleError(entry, e);
    }
    this.finishEntry(entry);
  }

  runInstruction(entry, def) {
    entry.kind = 'instr';
    entry.def = def;
    if (this.firstGroup) this.firstGroup = false;
    this.curEntry = entry;
    try {
      this.beginCode(entry);
      if (this.type === 'pp') assemblePpInstruction(this, entry, def, 1);
      else assembleCpuInstruction(this, entry, def, 1);
    } catch (e) {
      this.handleError(entry, e);
    }
    this.finishEntry(entry);
  }

  handleError(entry, e) {
    if (e instanceof AsmError) this.flag(entry, e.flag, e.message);
    else {
      this.flag(entry, 'A', `erreur interne : ${e.message}`);
      if (this.options.debug) console.error(e);
    }
  }

  /** Mémorise l'état du bloc courant au début de l'entrée (pour la passe 2). */
  beginCode(entry) {
    const b = this.cur || this.nominalBlock();
    if (!this.cur) this.cur = b;
    entry.block = b;
    entry.start = b.snapshot();
  }

  finishEntry(entry) {
    this.curEntry = null;
    if (entry.block) entry.end = entry.block.snapshot();
    entry.endBlock = this.cur;
  }

  // ============================================================ symboles

  symKey(qual, name) {
    return `${qual}\u0000${name}`;
  }

  /** Recherche d'un symbole (qualificatif explicite ou résolution courante). */
  findSymbol(name, qual, ctxQual = this.qual) {
    if (qual !== null && qual !== undefined) return this.symbols.get(this.symKey(qual, name)) || null;
    if (ctxQual) {
      const s = this.symbols.get(this.symKey(ctxQual, name));
      if (s) return s;
    }
    const g = this.symbols.get(this.symKey('', name));
    if (g) return g;
    if (this.sstSymbols && this.sstSymbols.has(name)) return this.sstSymbols.get(name);
    return null;
  }

  /**
   * Définit un symbole.
   * @param kind 'loc' | 'equ' | 'set' | 'sst'
   */
  defineSymbol(entry, name, val, kind = 'equ') {
    if (!this.validSymbol(name)) {
      this.flag(entry, kind === 'loc' ? '1' : 'L', `symbole incorrect : ${name}`);
      return null;
    }
    const redef = kind === 'set';
    const qual = this.qual;
    const key = this.symKey(qual, name);
    const old = this.symbols.get(key);
    if (this.pass === 2) {
      // passe 2 : seuls les SET sont réaffectés
      if (old && old.redef) old.val = val.clone();
      return old;
    }
    if (old) {
      if (old.redef && redef) {
        old.val = val.clone();
        old.history.push(entry);
        return old;
      }
      if (!old.redef && !redef && sameValue(old.val, val)) return old;
      this.flag(entry, 'D', `symbole déjà défini : ${name}`);
      return null;
    }
    if (this.externals.has(name) && !qual) {
      this.flag(entry, 'D', `symbole déclaré externe : ${name}`);
      return null;
    }
    if (this.type !== 'pp' && /^[ABX][0-7]$/.test(name)) this.flag(entry, '6', 'symbole de la forme d\'un registre');
    const sym = { name, qual, val: val.clone(), kind, redef, entry, line: entry ? entry.site.line : 0, refs: [], history: [entry] };
    this.symbols.set(key, sym);
    this.symbolOrder.push(sym);
    return sym;
  }

  validSymbol(name) {
    if (!name || name.length > 8) return false;
    const c = name[0];
    if (c === '$' || c === '=' || c === ':' || (c >= '0' && c <= '9')) return false;
    for (const ch of name) if (!isSymbolChar(ch) || ch === '/') return false;
    return true;
  }

  /** Valeur d'un symbole dans une expression. */
  symbolValue(name, qual, { defaultPrefix = null, ctx } = {}) {
    const ctxQual = ctx && ctx.qual !== undefined ? ctx.qual : this.qual;
    const sym = this.findSymbol(name, qual, ctxQual);
    if (sym && sym.kind !== 'pending') {
      this.reference(sym, ctx);
      if (sym.forward && this.pass === 1 && ctx && ctx.requireDefined) {
        throw new AsmError('U', `symbole non encore défini : ${name}`);
      }
      return sym.val.clone();
    }
    if (!qual && this.externals.has(name)) {
      const v = new Val(0n);
      v.exts = new Map([[name, 1]]);
      this.externals.get(name).refs++;
      return v;
    }
    if (defaultPrefix === 'X' || defaultPrefix === 'Y') {
      if (this.type !== 'reloc') {
        if (this.pass === 2) throw new AsmError('U', `symbole non défini : ${name}`);
        const v = new Val(0n); v.undef = [name]; return v;
      }
      if (!this.externals.has(name)) {
        // externe par défaut, déclaré en fin d'assemblage s'il reste non défini
        if (this.pass === 1) {
          const d = this.defaults.get(name) || { name, prefix: defaultPrefix, qual: ctxQual };
          if (defaultPrefix === 'X') d.prefix = 'X';
          this.defaults.set(name, d);
          const v = new Val(0n); v.undef = [name]; v.defaultExt = name; return v;
        }
      }
      const v = new Val(0n);
      v.exts = new Map([[name, 1]]);
      return v;
    }
    if (defaultPrefix === 'S') {
      if (this.pass === 1) {
        if (!this.defaults.has(name)) this.defaults.set(name, { name, prefix: 'S', qual: ctxQual });
        const v = new Val(0n); v.undef = [name]; return v;
      }
    }
    if (ctx && ctx.requireDefined) throw new AsmError('U', `symbole non défini : ${name}`);
    if (this.pass === 2) {
      if (ctx && !ctx.noUndefError) throw new AsmError('U', `symbole non défini : ${name}`);
    }
    const v = new Val(0n);
    v.undef = [name];
    return v;
  }

  reference(sym, ctx) {
    if (this.pass !== 2 || !this.listOpts.has('R') || (ctx && ctx.noRef)) return;
    const e = this.curEntry;
    if (e) {
      sym.refs.push({ entry: e, flag: ctx && ctx.refFlag ? ctx.refFlag : '' });
      this.references++;
    }
  }

  // =========================================================== compteurs

  locationValue() {
    const b = this.cur || this.nominalBlock();
    const lb = b.locBlock;
    const v = new Val(to60(b.locOffset));
    if (lb && lb.isRelocatable()) v.blocks = new Map([[lb, 1]]);
    return v;
  }

  originValue() {
    const b = this.cur || this.nominalBlock();
    const v = new Val(to60(b.origin));
    if (b.isRelocatable()) v.blocks = new Map([[b, 1]]);
    return v;
  }

  positionCounter() {
    const b = this.cur || this.nominalBlock();
    return b.pos;
  }

  /** Valeur pour un symbole défini par le champ location (compteur location). */
  locationSymbolValue() {
    return this.locationValue();
  }

  /** Définit le symbole du champ location d'une instruction (après forçage). */
  defineLocation(entry, name = entry.f.loc) {
    if (!name || name === '+' || name === '-') return;
    if (this.pass === 1) this.defineSymbol(entry, name, this.locationValue(), 'loc');
  }

  // ============================================================ émission

  /** Mot complété : avance les compteurs. */
  advanceWord(b) {
    b.origin++;
    b.locOffset++;
    b.pos = this.wordBits;
    if (b.origin > b.max) b.max = b.origin;
  }

  /**
   * Forçage en début de mot : complète le mot courant par des NO (CPU).
   * En PP : passe au mot suivant si le mot est entamé.
   */
  forceUpper(b = this.cur) {
    b.pendingForce = false;
    if (b.pos === this.wordBits) return;
    if (this.wordBits === 60) {
      // zéros jusqu'à la frontière de parcelle (fin de VFD), puis NO
      if (b.pos % 15) this.emitBits(b.pos % 15, 0n, null, { hidden: true });
      while (b.pos !== 60) {
        if (b.pos === 30) this.emitBits(30, 0o6100046000n, null, { hidden: true, nop: true });
        else this.emitBits(15, 0o46000n, null, { hidden: true, nop: true });
      }
    } else {
      this.emitBits(b.pos, 0n, null, { hidden: true });
    }
    b.vfdOpen = false;
  }

  /** Forçage différé et bourrage après VFD avant une instruction ou une donnée. */
  prepareCode(entry, { isVfdContinue = false } = {}) {
    const b = this.cur;
    const loc = entry.f ? entry.f.loc : '';
    if (b.pendingForce) {
      if (loc === '-') b.pendingForce = false;
      else this.forceUpper(b);
    }
    if (b.vfdOpen && !isVfdContinue && this.wordBits === 60 && b.pos % 15) {
      this.emitBits(b.pos % 15, 0n, null, { hidden: true });
    }
    if (!isVfdContinue) b.vfdOpen = false;
    if (this.wordBits !== 60 && b.pos !== this.wordBits && !isVfdContinue) {
      this.emitBits(b.pos, 0n, null, { hidden: true });
    }
  }

  /**
   * Émet `nbits` bits à la position courante du bloc courant.
   * @param rel relocation { kind: '+'|'-'|'C'|'X', block?, ext? } ou null
   */
  emitBits(nbits, value, rel, info = {}) {
    const b = this.cur;
    if (this.pass === 1) {
      if (b.type === 'blank' || (b.lcm && (this.type !== 'reloc' || b.type === 'blank'))) {
        if (!info.hidden) this.flagCur('R', 'donnée dans un bloc commun blanc ou ECS');
      }
      b.everData = true;
    }
    while (nbits > 0) {
      const take = Math.min(nbits, b.pos);
      const part = nbits > take ? value >> BigInt(nbits - take) : value;
      const pv = part & ((1n << BigInt(take)) - 1n);
      if (this.pass === 2) {
        const off = b.origin;
        let cell = b.mem.get(off);
        if (!cell) { cell = { w: 0n, rels: [] }; b.mem.set(off, cell); }
        const shift = b.pos - take;
        cell.w |= pv << BigInt(shift);
        if (rel && nbits === take) cell.rels.push({ ...rel, shift, bits: take });
        const e = this.curEntry;
        if (e && !info.hidden) {
          e.code.push({ block: b, word: off, loc: b.locOffset, locBlock: b.locBlock, pos: b.pos, bits: take, value: pv,
            flag: rel ? relFlag(rel) : '', lit: info.lit, detail: !!info.detail });
        }
      }
      b.pos -= take;
      nbits -= take;
      if (b.pos === 0) this.advanceWord(b);
    }
  }

  /** Réserve n mots (BSS). n peut être négatif. */
  reserveWords(n) {
    const b = this.cur;
    b.origin += n;
    b.locOffset += n;
    if (b.origin > b.max) b.max = b.origin;
    if (b.origin < 0) { b.origin = 0; this.flagCur('R', 'origine négative'); }
  }

  /**
   * Convertit une valeur en champ de `nbits` bits avec sa relocation finale.
   * @returns { w: BigInt (nbits), rel }
   */
  finalize(v, nbits, entry, { allowReloc = true, signedField = true } = {}) {
    let s = signed60(v.w);
    let rel = null;
    let localCoeff = 0;
    let commonBlock = null, commonCoeff = 0;
    if (v.blocks) {
      for (const [b, c] of v.blocks) {
        if (!c) continue;
        if (this.type === 'reloc' && (b.type === 'common' || b.type === 'blank')) {
          if (commonBlock && commonBlock !== b) throw new AsmError('A', 'termes relogeables mal annulés');
          commonBlock = b; commonCoeff += c;
        } else if (this.type === 'reloc') {
          localCoeff += c;
          s += BigInt(c) * BigInt(this.pass === 2 ? b.final : 0);
        } else {
          s += BigInt(c) * BigInt(this.pass === 2 ? b.final : 0);
        }
      }
    }
    const ext = v.extName();
    if (this.type === 'reloc') {
      if (ext) {
        if (ext.coeff !== 1 || localCoeff || commonCoeff || [...v.exts.values()].filter((c) => c).length > 1) {
          throw new AsmError('A', 'l\'expression ne se réduit pas à un seul externe');
        }
        rel = { kind: 'X', ext: ext.name };
      } else if (commonBlock && commonCoeff) {
        if (commonCoeff !== 1 || localCoeff) throw new AsmError('A', 'relocation commune incorrecte');
        rel = { kind: 'C', block: commonBlock };
      } else if (localCoeff === 1) rel = { kind: '+' };
      else if (localCoeff === -1) rel = { kind: '-' };
      else if (localCoeff) throw new AsmError('A', 'termes relogeables mal annulés');
    } else if (ext) {
      throw new AsmError('U', `externe dans un assemblage absolu : ${ext.name}`);
    }
    if (rel && !allowReloc) throw new AsmError('A', 'expression absolue exigée');
    const w = to60(s);
    if (!fitsBits(w, nbits) && signedField) this.flag(entry, '7');
    return { w: truncBits(w, nbits), rel };
  }

  /** Vérifie la validité de la relocation d'une valeur (passe 1). */
  checkReloc(v) {
    if (v.blocks) {
      const nz = [...v.blocks.entries()].filter(([, c]) => c);
      if (nz.length > 1) throw new AsmError('A', 'termes relogeables mal annulés');
      if (nz.length === 1 && Math.abs(nz[0][1]) !== 1) throw new AsmError('A', 'termes relogeables mal annulés');
      if (nz.length === 1 && (nz[0][0].type === 'common' || nz[0][0].type === 'blank') && nz[0][1] !== 1 && this.type === 'reloc') {
        throw new AsmError('A', 'relocation commune négative');
      }
    }
    if (v.exts) {
      const nz = [...v.exts.values()].filter((c) => c);
      if (nz.length > 1 || (nz.length === 1 && nz[0] !== 1)) throw new AsmError('A', 'l\'expression ne se réduit pas à un seul externe');
      if (nz.length && v.isRelocatable()) throw new AsmError('A', 'externe et relogeable');
    }
  }

  // ============================================================ expressions

  /** Contexte d'évaluation pour une entrée. */
  ctxFor(entry, extra = {}) {
    const c = entry ? entry.ctx : { qual: this.qual, base: this.base, code: this.code, other: this.other };
    return {
      asm: this, qual: c.qual, base: c.base, code: c.code, other: c.other,
      wordBits: this.wordBits, pp: this.type === 'pp', fieldBits: 60, regs: false,
      warn: (f) => this.flag(entry, f), ...extra,
    };
  }

  /** Évalue une expression contenue dans `text` (complète). */
  evalText(entry, text, extra = {}) {
    const cur = new Cursor(text, 0);
    const v = parseExpression(cur, this.ctxFor(entry, extra));
    if (!cur.atSubEnd()) throw new AsmError('A', `expression incorrecte : ${text}`);
    return v;
  }

  /** Évalue une expression absolue « évaluable » (symboles déjà définis). */
  evalAbsolute(entry, text, { allowEmpty = true, base } = {}) {
    if (text === '' || text === undefined) {
      if (allowEmpty) return null;
      throw new AsmError('8', 'sous-champ manquant');
    }
    const v = this.evalText(entry, text, { requireDefined: true, base: base || entry.ctx.base });
    if (v.undef && v.undef.length) throw new AsmError('U', `symbole non défini : ${v.undef[0]}`);
    if (!v.isAbsolute()) throw new AsmError('A', 'expression absolue exigée');
    return v.num();
  }

  /** Base pour les comptes (décimale si BASE M). */
  countBase(entry) {
    return entry.ctx.base === 'M' ? 'D' : entry.ctx.base;
  }

  literalValue(words, ctx) {
    const pool = this.literals;
    const n = words.length;
    let at = -1;
    outer: for (let i = 0; i + n <= pool.length; i++) {
      for (let k = 0; k < n; k++) if (pool[i + k] !== words[k]) continue outer;
      at = i;
      break;
    }
    if (at < 0) {
      // recouvrement du suffixe du pool avec un préfixe de la suite
      let overlap = 0;
      for (let ov = Math.min(n - 1, pool.length); ov > 0; ov--) {
        let ok = true;
        for (let k = 0; k < ov; k++) if (pool[pool.length - ov + k] !== words[k]) { ok = false; break; }
        if (ok) { overlap = ov; break; }
      }
      if (this.pass === 2) {
        // ne devrait pas arriver : le pool est complet en passe 2
        at = pool.length - overlap;
        for (let k = overlap; k < n; k++) pool.push(words[k]);
      } else {
        at = pool.length - overlap;
        for (let k = overlap; k < n; k++) pool.push(words[k]);
      }
    }
    const lb = this.literalBlock();
    const v = new Val(to60(at));
    if (lb.isRelocatable()) v.blocks = new Map([[lb, 1]]);
    return v;
  }

  // ===================================================== fin de groupe

  /**
   * Termine le groupe de blocs courant : allocation, passe 2, image.
   * @param kind 'end' | 'ident' | 'blank-ident'
   */
  finishGroup(kind, endEntry) {
    // symboles =S restés non définis : un mot à la fin du bloc zéro
    const zero = this.type === 'reloc' ? this.nominalBlock() : null;
    const defaultS = [];
    for (const d of this.defaults.values()) {
      if (this.findSymbol(d.name, null, d.qual)) continue;
      if (d.prefix === 'S') defaultS.push(d);
      else if (d.prefix === 'X' || d.prefix === 'Y') {
        if (!this.externals.has(d.name)) this.externals.set(d.name, { weak: d.prefix === 'Y', refs: 0, byDefault: true });
      }
    }
    let defBlock = null;
    if (defaultS.length) {
      defBlock = zero || this.getBlock('PROGRAM*', 'zero', 'defaults');
      for (const d of defaultS) {
        const v = new Val(to60(defBlock.max));
        v.blocks = new Map([[defBlock, 1]]);
        const savedQual = this.qual;
        this.qual = d.qual || '';
        this.defineSymbol(null, d.name, v, 'default');
        this.qual = savedQual;
        const sym = this.findSymbol(d.name, null, d.qual);
        if (sym) sym.defaultWord = defBlock.max;
        defBlock.defaultWords = (defBlock.defaultWords || []).concat([{ name: d.name, offset: defBlock.max }]);
        defBlock.max++;
      }
      this.defaults.clear();
    }
    // bloc des littéraux
    if (this.literals.length) {
      const lb = this.literalBlock();
      lb.max = Math.max(lb.max, this.literals.length);
    }
    this.allocateBlocks();
    // passe 2
    this.pass = 2;
    for (const entry of this.groupEntries) {
      if (entry.listOnly) continue;
      if (!entry.block) continue;
      this.replay(entry);
    }
    // données des littéraux et des symboles par défaut
    if (this.literals.length) {
      const lb = this.literalBlock();
      for (let i = 0; i < this.literals.length; i++) lb.mem.set(i, { w: this.literals[i], rels: [] });
    }
    if (defBlock && defBlock.defaultWords) {
      for (const d of defBlock.defaultWords) defBlock.mem.set(d.offset, { w: 0n, rels: [] });
    }
    this.pass = 1;
    this.listing.addGroup(this.groupEntries, this);
    const image = this.buildImage(kind);
    return image;
  }

  /** Attribue les origines finales des blocs. */
  allocateBlocks() {
    const blocks = this.blockOrder;
    if (this.type === 'reloc') {
      let addr = 0;
      const order = [];
      const zero = blocks.filter((b) => b.type === 'zero');
      const lit = blocks.filter((b) => b.type === 'lit');
      const locals = blocks.filter((b) => b.type === 'local' && !b.lcm);
      for (const b of [...zero, ...lit, ...locals]) { b.final = addr; addr += b.max; order.push(b); }
      this.progLength = addr;
      let lcmAddr = 0;
      for (const b of blocks.filter((b) => b.type === 'local' && b.lcm)) { b.final = lcmAddr; lcmAddr += Math.ceil(b.max / 8) * 8; }
      this.lcmLength = lcmAddr;
      for (const b of blocks) if (b.type === 'common' || b.type === 'blank') b.final = 0;
      for (const b of blocks) if (b.type === 'abs') b.final = 0;
    } else {
      // absolu / PP : bloc absolu, bloc zéro (symboles par défaut), littéraux, locaux
      const abs = blocks.filter((b) => b.type === 'abs');
      let addr = 0;
      for (const b of abs) { b.final = 0; addr = Math.max(addr, b.max); }
      if (this.groupBase !== undefined) addr = Math.max(addr, this.groupBase);
      const rest = [...blocks.filter((b) => b.type === 'zero'), ...blocks.filter((b) => b.type === 'lit'),
        ...blocks.filter((b) => b.type !== 'abs' && b.type !== 'zero' && b.type !== 'lit')];
      for (const b of rest) { b.final = addr; addr += b.max; }
      this.progLength = addr;
    }
  }

  /** Réexécute une entrée en passe 2. */
  replay(entry) {
    const b = entry.block;
    b.restore(entry.start);
    this.cur = b;
    this.curEntry = entry;
    entry.code = [];
    try {
      if (entry.kind === 'instr') {
        if (this.type === 'pp') assemblePpInstruction(this, entry, entry.def, 2);
        else assembleCpuInstruction(this, entry, entry.def, 2);
      } else if (entry.kind === 'pseudo') {
        PSEUDO_HANDLERS[entry.pseudo](this, entry, 2);
      } else if (entry.kind === 'maccall') {
        if (entry.forceAtCall) this.prepareCode(entry), this.forceUpper(this.cur);
      }
    } catch (e) {
      this.handleError(entry, e);
    }
    this.curEntry = null;
    const end = this.cur.snapshot ? (entry.endBlock || this.cur) : null;
    if (end && entry.end && this.options.checkPhases) {
      const s = (entry.endBlock || this.cur).snapshot();
      if (s.origin !== entry.end.origin || s.pos !== entry.end.pos) {
        this.flag(entry, 'A', `erreur de phase interne (${entry.op})`);
      }
    }
  }

  /** Image mémoire du groupe (absolu, PP) ou tables relogeables. */
  buildImage(kind) {
    const words = new Map();
    let lo = Infinity, hi = -Infinity;
    const relocs = [];
    for (const b of this.blockOrder) {
      for (const [off, cell] of b.mem) {
        const addr = b.final + off;
        if (this.type === 'reloc' && (b.type === 'common' || b.type === 'blank')) continue;
        words.set(addr, cell);
        if (addr < lo) lo = addr;
        if (addr > hi) hi = addr;
      }
    }
    return { words, lo, hi, kind };
  }

  // ============================================================ blocs

  /** Bascule vers un bloc (le compteur location n'est pas conservé). */
  switchTo(b) {
    this.cur = b;
    b.locBlock = b;
    b.locOffset = b.origin;
  }

  /** Bloc absolu (nominal en absolu/PP, ABSOLUTE* en relogeable). */
  absoluteBlock() {
    if (this.type === 'reloc') return this.getBlock('ABSOLUTE*', 'abs', 'absolute');
    return this.nominalBlock();
  }

  absoluteMarker() {
    return null;
  }

  /** Le type d'assemblage change (ABS, PERIPH…) : la structure de blocs repart à zéro. */
  resetBlocksForType() {
    const entries = this.groupEntries;
    this.startGroup();
    this.groupEntries = entries;
    this.cur = this.nominalBlock();
    for (const e of entries) { e.block = this.cur; e.start = this.cur.snapshot(); e.end = this.cur.snapshot(); }
  }

  /** IDENT suivant (absolu, PP) : termine l'overlay courant et en commence un autre. */
  newOverlay(entry, subs) {
    this.groupEntries.pop();
    const img = this.finishGroup(subs.length ? 'ident' : 'blank-ident', entry);
    this.saveGroup(img);
    this.convertSymbolsToAbsolute();
    const lwa = img.hi >= img.lo ? img.hi + 1 : 0;
    this.groupIndex++;
    this.startGroup();
    this.groupEntries.push(entry);
    if (!subs.length) this.groupBase = lwa;
    else {
      this.groupBase = undefined;
      this.overlayHeads.push({ name: subs[0], subs, entry, group: this.groupIndex });
    }
    this.cur = this.nominalBlock();
    entry.block = this.cur;
    entry.start = this.cur.snapshot();
  }

  /** Après la passe 2 d'un groupe : tous les symboles deviennent absolus. */
  convertSymbolsToAbsolute() {
    for (const sym of this.symbolOrder) {
      const v = sym.val;
      if (!v.blocks) continue;
      let s = signed60(v.w);
      for (const [b, c] of v.blocks) s += BigInt(c) * BigInt(b.final);
      sym.val = new Val(to60(s));
    }
  }

  saveGroup(img) {
    this.groups.push({ img, blocks: this.blockOrder.slice(), literals: this.literals.slice(), segments: this.segments.slice(),
      head: this.overlayHeads[this.overlayHeads.length - 1], length: this.progLength });
    this.segments = [];
  }

  /** END : fin du sous-programme. */
  completeProgram(endEntry) {
    const img = this.finishGroup('end', endEntry);
    this.saveGroup(img);
    if (endEntry.endLoc) {
      // symbole du champ location de END = longueur totale du sous-programme
      this.defineSymbol(endEntry, endEntry.endLoc, Val.abs(this.progLength), 'equ');
    }
    this.programResult = this.buildProgramResult(endEntry);
    if (this.options.exportDefs) this.exportDefinitions();
    this.listing.endProgram(this);
    this.collectSymbols();
    this.endProgram(endEntry);
  }

  /** Définitions exportées par un texte système. */
  exportDefinitions() {
    const symbols = new Map();
    for (const sym of this.symbolOrder) {
      if (sym.qual || sym.redef || sym.name.startsWith('!')) continue;
      if (!sym.val.isAbsolute()) continue;
      symbols.set(sym.name, { name: sym.name, qual: '', val: sym.val.clone(), kind: 'sst', redef: false, line: sym.line });
    }
    const micros = new Map();
    for (const n of this.userMicros) micros.set(n, this.micros.get(n));
    const mark = (list) => list.map((d) => ({ ...d, system: true }));
    const mnemonic = new Map();
    for (const [k, v] of this.mnemonic) mnemonic.set(k, mark(v));
    const syntactic = new Map();
    for (const [k, v] of this.syntactic) syntactic.set(k, mark(v));
    this.exported = { mnemonic, syntactic, micros, symbols };
  }

  evalLate(text, entry) {
    if (!text) return null;
    try {
      const v = this.evalText(entry, text);
      const fin = this.finalize(v, 60, entry, { signedField: false });
      return Number(signed60(fin.w));
    } catch (e) {
      this.handleError(entry, e);
      return null;
    }
  }

  buildProgramResult(endEntry) {
    const head = this.identEntry;
    const subs = this.identSubs || [];
    const prog = {
      name: this.progName, type: this.type, machine: this.machineType || '', ppFlavor: this.ppFlavor,
      wordBits: this.wordBits, overlays: [], entries: [], externals: [], comments: this.comments.slice(),
    };
    this.pass = 2;
    const mkImage = (g) => {
      const { img } = g;
      const words = [];
      if (img.hi < img.lo) return { start: 0, words: [] };
      const start = img.lo;
      for (let a = start; a <= img.hi; a++) {
        const c = img.words.get(a);
        words.push(this.wordBits === 60 ? (c ? c.w : 0n) : (c ? Number(c.w) : 0));
      }
      return { start, words };
    };
    if (this.type === 'reloc') {
      const g = this.groups[0];
      const words = [];
      const rels = [];
      for (let a = 0; a < this.progLength; a++) {
        const c = g.img.words.get(a);
        words.push(c ? c.w : 0n);
        if (c && c.rels.length) rels.push({ addr: a, rels: c.rels });
      }
      prog.image = { start: 0, words, rels };
      prog.origin = 0;
      prog.length = this.progLength;
      prog.commons = g.blocks.filter((b) => b.type === 'common' || b.type === 'blank').map((b) => {
        const cw = [];
        for (const [off, c] of b.mem) cw.push({ offset: off, w: c.w, rels: c.rels });
        return { name: b.type === 'blank' ? '' : b.name.slice(1, -1), length: b.max, lcm: b.lcm, words: cw, cond: b.cond, block: b };
      });
      const absB = g.blocks.find((b) => b.type === 'abs');
      prog.absolute = absB ? [...absB.mem.entries()].map(([off, c]) => ({ addr: off, w: c.w })) : [];
      prog.entry = this.endTrasym || null;
      for (const [name, e] of this.entryPoints) {
        const sym = this.findSymbol(name, '');
        if (!sym) { this.flag(e.entry, 'U', `point d'entrée non défini : ${name}`); continue; }
        const fin = this.finalize(sym.val, 18, e.entry, { signedField: false });
        if (fin.rel && fin.rel.kind === '-') this.flag(e.entry, 'N');
        prog.entries.push({ name, value: Number(fin.w), rel: fin.rel ? fin.rel.kind : null,
          common: fin.rel && fin.rel.block ? fin.rel.block.name : null, cond: e.cond });
      }
      for (const [name, x] of this.externals) prog.externals.push({ name, weak: x.weak });
      prog.reps = this.reps.map((r) => ({ type: r.type, S: this.finalize(r.S, 18, r.entry), D: r.D ? this.finalize(r.D, 18, r.entry) : null, C: r.C, B: r.B, I: r.I }));
      prog.ldset = this.ldset.slice();
      prog.lcc = this.lcc.slice();
    } else {
      for (let gi = 0; gi < this.groups.length; gi++) {
        const g = this.groups[gi];
        const im = mkImage(g);
        const hs = gi === 0 ? subs : (g.head ? g.head.subs : []);
        const hEntry = gi === 0 ? head : (g.head ? g.head.entry : endEntry);
        let origin = this.evalLate(hs[1], hEntry);
        if (origin === null) origin = im.words.length ? im.start : 0;
        let entryAddr = this.type === 'pp' ? origin : this.evalLate(hs[2], hEntry);
        if (entryAddr === null) entryAddr = origin;
        const lev = (k, def) => {
          const t = hs[k];
          if (!t) return def;
          const v = this.evalLate(gi === 0 && !/[BD]$/.test(t) ? t + 'D' : t, hEntry);
          return v === null ? def : v & 0o77;
        };
        // l'image commence à l'origine déclarée
        let words = im.words, start = im.start;
        if (words.length && origin < start) {
          words = new Array(start - origin).fill(this.wordBits === 60 ? 0n : 0).concat(words);
          start = origin;
        } else if (words.length && origin > start) {
          words = words.slice(origin - start);
          start = origin;
        } else if (!words.length) start = origin;
        // découpage par SEGMENT : chaque segment commence à son origine et finit à la
        // valeur du compteur origine du segment suivant (ou à la fin du groupe)
        const segs = g.segments.map((sg) => ({ sg, end: sg.block.final + sg.at }));
        const cut = (from, to) => {
          const out = [];
          for (let a = from; a < to; a++) out.push(a >= start && a - start < words.length ? words[a - start] : (this.wordBits === 60 ? 0n : 0));
          return out;
        };
        if (!segs.length) {
          prog.overlays.push({ name: hs[0] || this.progName, origin: start, entry: entryAddr,
            levels: [lev(3, gi ? 1 : 0), lev(4, 0)], words, length: words.length });
        } else {
          const hi = start + words.length;
          prog.overlays.push({ name: hs[0] || this.progName, origin: start, entry: entryAddr,
            levels: [lev(3, gi ? 1 : 0), lev(4, 0)], words: cut(start, segs[0].end), length: segs[0].end - start });
          segs.forEach(({ sg }, k) => {
            const o = this.evalLate(sg.subs[0], sg.entry) ?? segs[k].end;
            const e = this.evalLate(sg.subs[1], sg.entry) ?? o;
            const to = k + 1 < segs.length ? segs[k + 1].end : hi;
            const lvl = (t, d) => { if (!t) return d; const v = this.evalLate(t, sg.entry); return v === null ? d : v & 0o77; };
            const ws = cut(o, Math.max(o, to));
            prog.overlays.push({ name: sg.name, origin: o, entry: this.type === 'pp' ? o : e,
              levels: [lvl(sg.subs[2], 1), lvl(sg.subs[3], 0)], words: ws, length: ws.length, segment: true });
          });
        }
      }
      const main = prog.overlays[0];
      prog.image = { start: main.origin, words: main.words };
      prog.origin = main.origin;
      prog.entry = main.entry;
      prog.length = main.words.length;
      if (this.type === 'pp' && this.endTrasym) {
        const e = this.evalLate(this.endTrasym, endEntry);
        if (e !== null) prog.entry = e;
      }
      for (const [name] of this.entryPoints) {
        const sym = this.findSymbol(name, '');
        if (sym) prog.entries.push({ name, value: Number(signed60(sym.val.w)) });
      }
    }
    this.pass = 1;
    prog.nolabel = this.nolabel;
    prog.binary = buildBinary(this, prog);
    return prog;
  }

  /** Table des symboles pour l'IDE. */
  collectSymbols() {
    for (const s of this.symbolOrder) {
      if (s.name.startsWith('!')) continue;
      const v = s.val;
      const rb = v.relocBlock();
      this.symbolsOut.push({
        name: s.name, qual: s.qual, value: Number(signed60(v.w)) + (rb ? rb.coeff * rb.block.final : 0),
        kind: s.kind === 'set' ? 'set' : rb ? 'rel' : 'abs', block: rb ? rb.block.name : '',
        line: s.line, refs: s.refs.map((r) => r.entry.site.line), program: this.progName,
      });
    }
    for (const [name] of this.externals) {
      this.symbolsOut.push({ name, qual: '', value: 0, kind: 'ext', block: '', line: 0, refs: [], program: this.progName });
    }
  }

  // ============================================================ fin

  endProgram(endEntry) {
    this.inProgram = false;
    this.programs.push(this.programResult);
  }

  result() {
    const errors = this.allErrors.slice();
    for (const e of this.entries || []) {
      for (const f of e.flags) {
        const msg = e.messages.find((m) => m.flag === f);
        errors.push({ line: e.site.line, file: e.site.file, flag: f, fatal: FATAL.has(f),
          message: ERROR_TEXT[f] + (msg ? ` (${msg.message})` : ''), detail: msg ? msg.message : '' });
      }
    }
    const ok = !errors.some((e) => e.fatal);
    return {
      ok,
      errors,
      listing: this.listing.text(),
      lines: this.listing.lineMap,
      symbols: this.symbolsOut,
      programs: this.programs,
    };
  }
}

function sameValue(a, b) {
  if (a.w !== b.w) return false;
  const ka = a.relocBlock(), kb = b.relocBlock();
  if (!!ka !== !!kb) return false;
  if (ka && (ka.block !== kb.block || ka.coeff !== kb.coeff)) return false;
  return true;
}

export function relFlag(rel) {
  if (!rel) return '';
  return rel.kind;
}

export { Val, Cursor, AsmError, parseExpression, parseDataItem, readSymbolName, MARK, buildBinary };
