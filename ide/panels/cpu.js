// CPU panel: registers, disassembly around P, exchange package.

import { h, esc, o, o60, parseOctal } from '../dom.js';
import { section, toolbar, tbtn, tinput, inlineEdit } from './common.js';
import { segmented, toast } from '../ui.js';
import { disasmWord, wordParcels, instructionOctal } from '../../src/cpu/disasm.js';
import { iconSvg } from '../icons.js';
import { toNumber, fromNumber } from '../../src/cpu/float.js';
import { signed60 } from '../../src/common/word.js';
import { wordToDisplay } from '../../src/common/charset.js';

const M18 = 0o777777;

/** Interpretation of a 60-bit word. */
export function interpret(w, mode) {
  w = BigInt.asUintN(60, w);
  if (mode === 'auto') {
    // Exponent 0000 or 7777: integer (or unnormalized float); otherwise float.
    const e = Number(w >> 48n);
    mode = e === 0 || e === 0o7777 ? 'int' : 'float';
  }
  if (mode === 'int') return signed60(w).toString();
  if (mode === 'float') {
    const e = Number(w >> 48n);
    if (e === 0o3777 || e === 0o4000) return w >> 59n ? '−∞ (infinite)' : '+∞ (infinite)';
    if (e === 0o1777 || e === 0o6000) return 'indefinite';
    const v = toNumber(w);
    if (v === 0) return w === 0n ? '0.0' : '−0.0';
    const a = Math.abs(v);
    return a >= 1e-4 && a < 1e15 ? String(Number(v.toPrecision(15))) : v.toExponential(12);
  }
  if (mode === 'text') return wordToDisplay(w);
  return '';
}

/** Word input: octal, decimal integer with a D suffix, or floating-point (with a point). */
export function parseWord(text) {
  const t = text.trim();
  if (/^[-+]?\d+(\.\d*)?([eE][-+]?\d+)?$/.test(t) && t.includes('.')) return fromNumber(Number(t));
  if (/^[-+]?\d+D$/i.test(t)) {
    const n = BigInt(t.slice(0, -1));
    return n < 0n ? BigInt.asUintN(60, ~(-n)) : n;
  }
  if (/^-[0-7 ]+B?$/i.test(t)) {
    const v = parseOctal(t.slice(1));
    return v === null ? null : BigInt.asUintN(60, ~v);
  }
  const v = parseOctal(t);
  return v === null || v >= 1n << 60n ? null : v;
}

export class CpuPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.interp = 'auto';
    this.prev = null;
    this.follow = true;
    this.disasmBase = 0;
    this.xpSource = 'cpu';
    this.xpAddr = 0;

    this.regs = h('div', { class: 'regs' });
    this.interpSel = segmented([['auto', 'Auto', 'Integer if the exponent is zero, otherwise float'], ['int', 'Integer'], ['float', 'Float'], ['text', 'Display']], this.interp, (v) => { this.interp = v; this.update(true); });
    this.secRegs = section('Registers', this.regs, { key: 'cpu-regs', actions: [this.interpSel] });

    this.dis = h('div', { class: 'disasm mono' });
    this.disGoto = tinput({ placeholder: 'address', width: 80, onenter: (v) => this.gotoAddr(v) });
    this.followBtn = tbtn('Follow P', () => { this.follow = !this.follow; this.followBtn.classList.toggle('on', this.follow); this.update(true); }, { cls: 'on', tip: 'Recenter the disassembly on P' });
    this.secDis = section('Disassembly', this.dis, { key: 'cpu-dis', actions: [this.disGoto, this.followBtn] });
    this.dis.addEventListener('click', (e) => {
      const r = e.target.closest('[data-abs]');
      if (!r) return;
      if (e.target.closest('.d-bp') || e.target.closest('.d-addr')) {
        const on = this.ctx.runner.toggleCpuAddressBreakpoint(Number(r.dataset.abs));
        this.ctx.log(`CPU breakpoint ${on ? 'set' : 'removed'} at ${o(Number(r.dataset.abs), 6)}B (absolute).`);
        this.update(true);
      } else if (r.dataset.line) {
        this.ctx.revealSource(Number(r.dataset.line));
      }
    });
    this.dis.addEventListener('wheel', (e) => {
      if (!this.ctx.runner.kind) return;
      e.preventDefault();
      this.follow = false;
      this.followBtn.classList.remove('on');
      this.disasmBase = Math.max(0, this.disasmBase + (e.deltaY > 0 ? 2 : -2));
      this.update(true);
    }, { passive: false });

    this.xp = h('div', { class: 'xp mono' });
    this.xpAddrInput = tinput({ placeholder: 'address', width: 80, onenter: (v) => { const a = parseOctal(v); if (a !== null) { this.xpSource = 'cm'; this.xpAddr = Number(a) & M18; this.xpSel.setValue('cm'); this.update(true); } } });
    this.xpSel = segmented([['cpu', 'Registers', 'Package matching the current CPU state'], ['cm', 'Memory', 'Package read from central memory at the given address']], this.xpSource, (v) => { this.xpSource = v; this.update(true); });
    this.secXp = section('Exchange package', this.xp, { key: 'cpu-xp', open: false, actions: [this.xpSel, this.xpAddrInput] });

    this.el = h('div', { class: 'panel panel-cpu scroll' }, this.secRegs, this.secDis, this.secXp);
    this.regs.addEventListener('dblclick', (e) => this.editReg(e));
  }

  onShow() {
    this.update(true);
  }

  /** Saves the register state to flag the changes at the next stop. */
  snapshot() {
    const c = this.ctx.machine.cpu;
    return { X: c.X.slice(), A: c.A.slice(), B: c.B.slice(), P: c.P };
  }

  update(force = false) {
    if (!force && !this.el.offsetParent) return;
    const m = this.ctx.machine;
    const cpu = m.cpu;
    const running = this.ctx.controller.state === 'running';
    const prev = running ? null : this.prev;
    const chg = (kind, i) => prev && (kind === 'X' ? prev.X[i] !== cpu.X[i] : prev[kind][i] !== cpu[kind][i]);

    // --- registers
    const parcel = cpu.wordValid ? cpu.parcel : 0;
    const parcels = [0, 1, 2, 3].map((p) => `<span class="parcel ${p === parcel ? 'on' : ''}" data-tip="Parcel ${p}">${p}</span>`).join('');
    const ratio = cpu.stackHits + cpu.stackMisses ? (100 * cpu.stackHits / (cpu.stackHits + cpu.stackMisses)).toFixed(1) + '%' : '—';
    const stateTxt = cpu.stopped ? (cpu.lastError ? 'error exit' : 'stopped') : 'running';
    const ec = cpu.exitCondition;
    const ecTxt = ec ? [ec & 1 ? 'address' : '', ec & 2 ? 'operand' : '', ec & 4 ? 'indefinite' : ''].filter(Boolean).join(', ') : 'none';
    const em = cpu.EM;
    const emTxt = [em & 0o010000 ? 'A' : '', em & 0o020000 ? 'O' : '', em & 0o040000 ? 'I' : ''].filter(Boolean).join('') || '—';
    const cell = (name, val, edit, tip = null, cls = '') => `<div class="reg ${cls}" ${tip ? `data-tip="${esc(tip)}"` : ''}><span class="reg-n">${name}</span><span class="reg-v mono" ${edit ? `data-edit="${edit}"` : ''}>${val}</span></div>`;
    let html = '<div class="reg-top">';
    html += `<div class="reg reg-p ${prev && prev.P !== cpu.P ? 'chg' : ''}"><span class="reg-n">P</span><span class="reg-v mono" data-edit="P">${o(cpu.P, 6)}</span><span class="parcels">${parcels}</span></div>`;
    html += cell('RA', o(cpu.RA, 8), 'RA', 'Reference address (base) in central memory');
    html += cell('FL', o(cpu.FL, 8), 'FL', 'Field length (limit) in central memory');
    html += cell('EM', `${o(cpu.EM, 8)} <small>${emTxt}</small>`, 'EM', 'Exit mode: A = address, O = operand, I = indefinite');
    html += cell('RAE', o(cpu.RAE, 8), 'RAE', 'Reference address in ECS');
    html += cell('FLE', o(cpu.FLE, 8), 'FLE', 'Field length in ECS');
    html += cell('MA', o(cpu.MA, 6), 'MA', 'Monitor exchange package address');
    html += '</div><div class="reg-status">';
    html += `<span class="pill ${cpu.stopped ? (cpu.lastError ? 'pill-error' : 'pill-dim') : 'pill-ok'}">${stateTxt}</span>`;
    html += `<span class="pill pill-dim">${cpu.monitorMode ? 'monitor' : 'program'} mode</span>`;
    html += `<span class="pill ${ec ? 'pill-warn' : 'pill-dim'}" data-tip="Exit condition">cond.: ${ecTxt}</span>`;
    html += `<span class="pill pill-dim">${esc(m.cpu.features ? this.ctx.modelName() : '')}</span>`;
    html += '</div>';
    if (cpu.lastError) html += `<div class="reg-error">${iconSvg('error', 14)} ${esc(cpu.lastError)}</div>`;

    html += '<table class="xregs"><tbody>';
    for (let i = 0; i < 8; i++) {
      const w = cpu.X[i];
      const it = this.interp === 'none' ? '' : esc(interpret(w, this.interp));
      html += `<tr class="${chg('X', i) ? 'chg' : ''}"><td class="reg-n">X${i}</td><td class="mono x-oct" data-edit="X${i}">${o60(w)}</td><td class="mono x-int">${it}</td></tr>`;
    }
    html += '</tbody></table><div class="abregs">';
    for (let i = 0; i < 8; i++) {
      html += `<div class="ab ${chg('A', i) ? 'chg' : ''}"><span class="reg-n">A${i}</span><span class="mono" data-edit="A${i}">${o(cpu.A[i], 6)}</span></div>`;
      html += `<div class="ab ${chg('B', i) ? 'chg' : ''}"><span class="reg-n">B${i}</span><span class="mono" ${i ? `data-edit="B${i}"` : ''}>${o(cpu.B[i], 6)}</span></div>`;
    }
    html += '</div><div class="reg-stats">';
    html += `<div><span>Instructions</span><b class="mono">${cpu.instructions.toLocaleString('en-US')}</b></div>`;
    html += `<div><span>Minor cycles</span><b class="mono">${Math.round(cpu.cycles).toLocaleString('en-US')}</b></div>`;
    html += `<div data-tip="Instruction stack hit rate (8 words on the 6600)"><span>Instruction stack</span><b class="mono">${ratio}</b></div>`;
    html += `<div><span>Simulated time</span><b class="mono">${fmtTime(m.time)}</b></div>`;
    html += '</div>';
    this.regs.innerHTML = html;

    if (!this.secDis.classList.contains('closed')) this.renderDisasm();
    if (!this.secXp.classList.contains('closed')) this.renderXp();
  }

  /** Saves the current state as the reference (before a run or a step). */
  mark() {
    this.prev = this.snapshot();
  }

  editReg(e) {
    const t = e.target.closest('[data-edit]');
    if (!t) return;
    const key = t.dataset.edit;
    const cpu = this.ctx.machine.cpu;
    let initial;
    if (key[0] === 'X') initial = o60(cpu.X[Number(key[1])]);
    else if (key.length === 2 && 'AB'.includes(key[0])) initial = o(cpu[key[0]][Number(key[1])], 6);
    else initial = o(cpu[key]);
    inlineEdit(t, initial, (v) => {
      if (key[0] === 'X') {
        const w = parseWord(v);
        if (w === null) { toast('Invalid value: octal, integer with a D suffix, or floating-point.', 'warn'); return false; }
        cpu.X[Number(key[1])] = w;
      } else {
        const n = parseOctal(v);
        if (n === null) { toast('Invalid octal value.', 'warn'); return false; }
        const num = Number(n);
        if (key.length === 2 && 'AB'.includes(key[0])) cpu[key[0]][Number(key[1])] = num & M18;
        else if (key === 'P') { cpu.P = num & M18; cpu.wordValid = false; cpu.parcel = 0; }
        else cpu[key] = num;
      }
      this.ctx.log(`Register ${key} modified.`);
      setTimeout(() => this.ctx.refresh(true));
      return true;
    });
  }

  gotoAddr(v) {
    const a = parseOctal(v);
    if (a === null) return;
    this.follow = false;
    this.followBtn.classList.remove('on');
    this.disasmBase = Math.max(0, Number(a) - 4);
    this.update(true);
  }

  renderDisasm() {
    const m = this.ctx.machine;
    const cpu = m.cpu;
    const runner = this.ctx.runner;
    if (!runner.kind && !cpu.instructions) {
      this.dis.innerHTML = '<div class="dim pad">No program loaded.</div>';
      return;
    }
    const P = cpu.P;
    const curParcel = cpu.wordValid ? cpu.parcel : 0;
    if (this.follow) {
      if (P < this.disasmBase + 2 || P > this.disasmBase + 18) this.disasmBase = Math.max(0, P - 4);
    }
    const syms = this.ctx.symbolMap();
    const symbol = (a) => syms.get(a) || null;
    const last = cpu.lastInstr;
    let html = '';
    for (let rel = this.disasmBase; rel < this.disasmBase + 24 && rel <= M18; rel++) {
      const abs = cpu.absolute(rel);
      const w = m.cm[abs] ?? 0n;
      const parcels = wordParcels(w);
      const oob = rel >= cpu.FL;
      const label = syms.get(rel);
      if (label) html += `<div class="d-label">${esc(label)}</div>`;
      if (w === 0n && rel !== P) {
        const bp0 = runner.hasCpuBreakpoint(abs);
        html += `<div class="d-row w0 zero ${oob ? 'oob' : ''}" data-abs="${abs}"><span class="d-bp ${bp0 ? 'on' : ''}"></span>`
          + `<span class="d-addr">${o(rel, 6)}</span><span class="d-par"></span><span class="d-oct">00000 00000 …</span><span class="d-txt dim">zero word</span><span class="d-src"></span></div>`;
        continue;
      }
      const ins = disasmWord(w, { symbol, cmu: cpu.features.cmu });
      const bp = runner.hasCpuBreakpoint(abs);
      ins.forEach((d, k) => {
        const cur = rel === P && d.parcel <= curParcel && (k === ins.length - 1 || ins[k + 1].parcel > curParcel);
        const isLast = last && last.P === rel && last.parcel === d.parcel && !cur;
        const line = runner.kind === 'cpu' ? runner.lineOfAddress((rel - runner.base) & M18, d.parcel) : null;
        const raw = instructionOctal(parcels, d.parcel, d.length === 30 && d.parcel < 3 ? 30 : 15);
        const oc = raw.length > 5 ? `${raw.slice(0, 5)} ${raw.slice(5)}` : raw;
        html += `<div class="d-row ${cur ? 'cur' : ''} ${isLast ? 'last' : ''} ${k === 0 ? 'w0' : ''} ${oob ? 'oob' : ''}" data-abs="${abs}" ${line ? `data-line="${line}"` : ''}>`
          + `<span class="d-bp ${bp && k === 0 ? 'on' : ''}"></span>`
          + `<span class="d-addr">${k === 0 ? o(rel, 6) : ''}</span>`
          + `<span class="d-par">${'ABCD'[d.parcel] || ''}</span>`
          + `<span class="d-oct">${oc}</span>`
          + `<span class="d-txt">${esc(d.text)}</span>`
          + `<span class="d-src">${line ? `l.${line}` : ''}</span></div>`;
      });
    }
    this.dis.innerHTML = html;
  }

  renderXp() {
    const m = this.ctx.machine;
    let words;
    let title;
    if (this.xpSource === 'cm') {
      words = [];
      for (let i = 0; i < 16; i++) words.push(m.cm[(this.xpAddr + i) % m.cmSize]);
      title = `Package read at ${o(this.xpAddr, 6)}B`;
    } else {
      words = m.cpu.packageWords();
      title = 'Current CPU state';
    }
    const f = (w, s, bits) => Number((w >> BigInt(s)) & ((1n << BigInt(bits)) - 1n));
    const names0 = ['P', 'RA', 'FL', 'EM', 'RAE', 'FLE', 'MA', 'spare'];
    let html = `<div class="xp-title">${title}</div><table class="grid-table xp-table"><thead><tr><th>Word</th><th>Contents</th><th>Fields</th></tr></thead><tbody>`;
    for (let i = 0; i < 16; i++) {
      const w = words[i];
      let fields;
      if (i === 0) fields = `P=${o(f(w, 36, 18), 6)} A0=${o(f(w, 18, 18), 6)}`;
      else if (i < 8) {
        const hiBits = i === 3 || i === 5 || i === 7 ? 24 : i === 6 ? 18 : 24;
        fields = `${names0[i]}=${o(f(w, 36, hiBits))} A${i}=${o(f(w, 18, 18), 6)} B${i}=${o(f(w, 0, 18), 6)}`;
      } else fields = `X${i - 8}`;
      html += `<tr><td class="num">${o(i, 2)}</td><td>${o60(w)}</td><td class="dim">${fields}</td></tr>`;
    }
    html += '</tbody></table>';
    this.xp.innerHTML = html;
  }
}

export function fmtTime(us) {
  if (us < 1000) return `${us} µs`;
  if (us < 1e6) return `${(us / 1000).toFixed(3)} ms`;
  return `${(us / 1e6).toFixed(4)} s`;
}

