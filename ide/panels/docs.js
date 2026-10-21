// Integrated documentation: the Workbench itself (getting started,
// shortcuts, display code, peripherals) and the complete COMPASS reference
// (ide/ref/) with full-text search, cross-references, history and F1 help.

import { h, esc, o, icon, iconButton, clear } from '../dom.js';
import { DISPLAY, DISPLAY_CDC, displayToExtBcd, EXT_BCD } from '../../src/common/charset.js';
import { highlightLine, collectMacros } from '../highlight.js';
import { SYSTEM_TEXTS } from '../../src/os/systext.js';
import { PARTS, buildIndex, fold } from '../ref/index.js';
import { T, c } from '../ref/fmt.js';

const pre = (s) => `<pre class="doc-pre">${esc(s)}</pre>`;
const kbd = (s) => s.split('+').map((k) => `<kbd>${esc(k)}</kbd>`).join('+');

// ------------------------------------------------------ "Workbench" part

const IDE = `
<p>The <b>COMPASS Workbench</b> combines a COMPASS 3 source editor, the assembler, a complete emulator of the
CDC 6600 (CPU, 10 peripheral processors, 12 channels) and its original peripherals: 6612 console, 405 card reader,
1612 line printer, 607 tape units, 6603 disk and real-time clock.</p>
<h4>Work cycle</h4>
<ol>
<li><b>Write</b> the program in the editor (on the left). The conventional columns 11, 18 and 30 are marked;
${kbd('Tab')} moves to the next one. Beyond column 72 is the sequence field, ignored by the assembler.</li>
<li><b>Assemble</b> with ${kbd('F7')} or ${kbd('Ctrl+B')}. Errors are marked in the gutter (hover the mark to read the message)
and listed in the <i>Problems</i> tab; a click goes to the line.</li>
<li><b>Run</b> with ${kbd('F5')}: the program is assembled if needed, loaded according to the run mode, then started.
${kbd('F6')} pauses, ${kbd('F10')} executes one CPU instruction, ${kbd('Shift+F10')} one instruction of the current PP.</li>
<li><b>Observe</b>: CPU registers, disassembly, central memory, PPs, channels, console, printer.</li>
</ol>
<h4>Help on the language</h4>
<p>${kbd('F1')} in the editor opens the page of the operation under the cursor (machine instruction, pseudo instruction,
system text macro); otherwise, a search for that word is started. The search box of this panel scans the whole
reference (ignoring case and accents); every word typed must appear in a page. The ${c('⤢')} button enlarges the panel,
${kbd('Alt+←')} and ${kbd('Alt+→')} walk through the history. The examples that show a <i>Try it</i> button assemble
without errors (the project tests check them); the button copies the example into a new file.</p>
<h4>Run modes</h4>
${T([
  ['Automatic', 'Chooses "PP" for a PP program (PERIPH), "System" for a relocatable CPU program, "Bare CPU" for an absolute program (ABS).'],
  ['System', 'The program becomes a job of the mini system: loaded at RA = 2000B (+100B), monitor MTR in PP0, console display DSD in PP1. It calls the system through the SYSTEXT macros (MESSAGE, ENDRUN, ABORT, READC, WRITEC, WRITER, CDD, COD, TIME, DATE…); file OUTPUT is printed on the 1612, INPUT is read from the 405 card reader. Execution stops at the end of the job; the Dayfile tab shows the dayfile. DROP then Enter on the console aborts the job.'],
  ['System (tape deadstart)', 'As "System", but the machine starts with a real deadstart: a system tape is written on unit 0 (DSL loader, central memory images, DSD, MTR) and the system deadstart panel reads it (DCN 13B; FNC 2000B,13B; FNC 2020B,13B; ACN 13B; LDC 1000B; IAM 7000B,13B; LJM 7000B). The tape can be exported in .tap format from Peripherals > Tapes.'],
  ['Bare CPU', 'The absolute program (ABS) is loaded at RA; a relocatable program is placed at RA+100B. The CPU starts at the entry address with the selected exit mode; it stops on PS or on an error exit. The PPs stay idle.'],
  ['PP', 'The PP program is loaded into the selected PP (PP0 by default) at its origin and started at its entry point. The other PPs wait for a load on their channel, as after a deadstart.'],
  ['Deadstart', 'Real startup sequence: the 16 words of the panel (Deadstart tab) are loaded into PP0 from address 1 and PP0 starts at 1.'],
], ['Mode', 'Effect'])}
<h4>Breakpoints</h4>
<p>Click in the editor gutter (or press ${kbd('F9')} on the current line). The breakpoint is set on the word holding the
first parcel of the line: the CPU stops at the start of that word. In the disassembly views (CPU and PP), a click on the
address column sets a breakpoint by address. In the memory view, the eye sets a watchpoint: the machine stops as soon
as a watched word is written.</p>
<h4>6612 console</h4>
<p>Click on a screen to give it the keyboard: keys are passed to the console (read by the PP with ${c('FNC 7020B')}
then ${c('IAN')}). ${kbd('Enter')} sends the CR key (60B), ${kbd('Backspace')} the BKSP key (61B). The screens have no
memory: the program must redraw them continuously; a trace that is not refreshed fades away (persistence).</p>
<h4>Files</h4>
<p>The workspace is kept in the browser. <i>.txt</i> files are texts usable by ${c('XTEXT name')}: the assembler receives
every workspace file, named without extension and in uppercase. The supplied examples open from the Files panel.</p>`;

const DEVICES = `
<h4>6612 console (channel 10B)</h4>
${T([
  ['7000B / 7001B / 7002B', 'Left screen, small (64 per line), medium (32) or large (16) characters'],
  ['7010B', 'Left screen, dot mode'],
  ['7100B / 7101B / 7102B / 7110B', 'Same choices for the right screen'],
  ['7020B', 'Keyboard input: IAN returns the display code of the key (0 if none)'],
], ['Function', 'Effect'])}
<p>After ${c('FNC')} and ${c('ACN')}, the words sent by ${c('OAM')} are interpreted as follows: ${c('60xx')}–${c('67xx')}
= X coordinate (9 bits), ${c('70xx')}–${c('77xx')} = Y coordinate (9 bits, Y grows upward), otherwise two display
characters; X advances by one character width after each character.</p>
${pre(`          FNC    7001B,10B     LEFT SCREEN, MEDIUM CHARACTERS
          ACN    10B
          LDN    N             WORD COUNT
          OAM    TEXT,10B
          DCN    10B
TEXT      CON    6000B+100B,7000B+400B
          DIS    4,HELLO`)}
<h4>405 card reader (channel 12B)</h4>
<p>${c('FNC 702B,12B')} starts reading a card, then ${c('ACN 12B')} and ${c('IAM buffer,12B')} with A = 80: each column
arrives as 12-bit Hollerith code (bit 11 = row 12, bit 10 = row 11, bit 9 = row 0, bits 8–0 = rows 1–9). The channel
disconnects by itself at the end of the card. If the hopper is empty, the IAM ends with A nonzero. ${c('704B')}
requests the status (0 = ready).</p>
<h4>1612 line printer (channel 12B)</h4>
${T([
  ['600B', 'Select the printer'], ['601B / 602B', 'Single / double space'], ['604B', 'Page eject'],
  ['605B', 'Print the line received'], ['606B', 'Suppress paper advance'], ['607B', 'Status request'],
], ['Function', 'Effect'])}
<p>Characters are sent one per word, in external BCD (low 6 bits), 136 at most per line.</p>
<h4>607 tape (channel 13B)</h4>
${T([
  ['2000B+u', 'Select unit u'], ['2010B / 2020B', 'Write / read one binary record'], ['2030B', 'Backspace one record'],
  ['2060B', 'Rewind'], ['2070B', 'Unload'], ['2100B', 'Status request'], ['2610B', 'Write a file mark'],
], ['Function', 'Effect'])}
<h4>6603 disk (channel 13B)</h4>
${T([
  ['1000B+s', 'Read sector s'], ['1200B+s', 'Write sector s'], ['1400B+t', 'Select track t'],
  ['1600B+h', 'Select head h'], ['1700B', 'Status: sector under the head'],
], ['Function', 'Effect'])}
<p>128 tracks, 8 heads, 128 or 100 sectors of 322 12-bit words.</p>
<h4>Real-time clock (channel 14B)</h4>
<p>Always active and full: ${c('IAN 14B')} returns the simulated time in microseconds, modulo 4096.</p>
<h4>Deadstart panel (channel 0)</h4>
<p>16 words of 12 switches, loaded into PP0 from address 1 at deadstart; PP0 starts at 1.</p>`;

function displayTable() {
  let html = '<table class="grid-table doc-table display-table"><thead><tr><th></th>';
  for (let col = 0; col < 8; col++) html += `<th>${col}</th>`;
  html += '</tr></thead><tbody>';
  for (let r = 0; r < 8; r++) {
    html += `<tr><th>${r}x</th>`;
    for (let col = 0; col < 8; col++) {
      const code = r * 8 + col;
      const a = DISPLAY[code], g = DISPLAY_CDC[code];
      const bcd = displayToExtBcd(code);
      html += `<td data-tip="${o(code, 2)}B: ${esc(g)}${g !== a ? ` (ASCII ${esc(a)})` : ''} · external BCD ${o(bcd, 2)}B"><span class="dc-g">${esc(g === ' ' ? '␣' : g)}</span><span class="dc-a mono">${esc(a === ' ' ? '' : g !== a ? a : '')}</span></td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

const SHORTCUTS = [
  ['F7 / Ctrl+B', 'Assemble the current file'], ['F5', 'Run (assembles and loads if needed)'], ['F6', 'Pause'],
  ['F10', 'Step: one CPU instruction'], ['Shift+F10', 'Step: one instruction of the current PP'], ['Ctrl+Shift+F5', 'Reload the program (reset)'],
  ['F9', 'Toggle the breakpoint on the current line'], ['Ctrl+S', 'Save the file'], ['Ctrl+F / Ctrl+H', 'Find / replace'],
  ['F3 / Shift+F3', 'Next / previous match'], ['Ctrl+G', 'Go to line'], ['Tab / Shift+Tab', 'Next / previous conventional column (11, 18, 30)'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Ctrl+N', 'New file'],
  ['F1', 'COMPASS reference: page of the operation under the cursor'], ['Shift+F1', 'List of shortcuts'],
  ['Alt+← / Alt+→', 'Documentation: previous / next page in the history'],
];
export { SHORTCUTS };

const WORKBENCH = {
  id: 'workbench', title: 'Workbench',
  chapters: [{
    id: 'ide-ch', title: 'COMPASS Workbench',
    entries: [
      { id: 'ide-start', title: 'Getting started', keys: [], html: IDE },
      { id: 'ide-shortcuts', title: 'Keyboard shortcuts', keys: [], html: T(SHORTCUTS.map(([k, d]) => [k.split(' / ').map(kbd).join(' / '), esc(d)]), ['Keys', 'Action']) },
      { id: 'ide-display', title: 'Display code', keys: [], html: `<p>Set of 64 6-bit characters. Row = high-order octal digit, column = low-order digit. The original CDC glyphs are shown; their ASCII equivalent, used in source files, is shown in small type. See also <a class="ref-link" href="#ref-lang-charsets" data-ref="lang-charsets">Character sets</a>.</p>${displayTable()}` },
      { id: 'ide-periph', title: 'Peripherals and channels', keys: [], html: DEVICES },
    ],
  }],
};

const ALL_PARTS = [WORKBENCH, ...PARTS];
const SYSTEM_MACROS = collectMacros(Object.values(SYSTEM_TEXTS).join('\n'));
const INDEX = buildIndex(ALL_PARTS);

// ------------------------------------------------------------------ panel

export class DocsPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.index = INDEX;
    this.history = [];
    this.histPos = -1;
    this.chapter = null;
    this.terms = [];

    this.search = h('input', { class: 'tinput doc-search', type: 'search', placeholder: `Search (${INDEX.count} pages)`, spellcheck: 'false' });
    this.search.addEventListener('input', () => this.onSearch());
    this.search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const first = this.results.querySelector('.ref-hit'); if (first) first.click(); }
      if (e.key === 'Escape') { this.search.value = ''; this.onSearch(); }
    });
    this.backBtn = iconButton('arrowLeft', 'Previous page (Alt+←)', () => this.back(), { size: 14 });
    this.fwdBtn = iconButton('arrowRight', 'Next page (Alt+→)', () => this.forward(), { size: 14 });
    this.wideBtn = iconButton('maximize', 'Enlarge / restore the panel', () => this.toggleWide(), { size: 14 });
    this.toc = h('nav', { class: 'doc-toc' });
    this.results = h('div', { class: 'ref-results hidden' });
    this.content = h('div', { class: 'doc-content' });
    this.buildToc();
    this.content.addEventListener('click', (e) => this.onContentClick(e));
    this.content.addEventListener('scroll', () => this.spy());
    this.el = h('div', { class: 'panel panel-docs' },
      h('div', { class: 'doc-side' },
        h('div', { class: 'doc-searchrow' }, this.search),
        h('div', { class: 'doc-navrow' }, this.backBtn, this.fwdBtn, h('span', { class: 'grow' }), this.wideBtn),
        this.results, this.toc),
      this.content);
    this.el.addEventListener('keydown', (e) => {
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); this.back(); }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); this.forward(); }
      if (e.key === 'Escape' && this.el.classList.contains('wide')) this.toggleWide(false);
    });
    this.go('ide-start', { record: true });
  }

  // ------------------------------------------------------------ contents

  buildToc() {
    clear(this.toc);
    this.tocChapters = new Map();
    for (const part of ALL_PARTS) {
      this.toc.append(h('div', { class: 'toc-part' }, part.title));
      for (const ch of part.chapters) {
        const btn = h('button', { class: 'toc-item', type: 'button', onclick: () => this.go(ch.entries[0].id, { top: true }) }, ch.title);
        const subs = h('div', { class: 'toc-subs hidden' });
        for (const e of ch.entries) {
          subs.append(h('button', { class: 'toc-sub', type: 'button', dataset: { id: e.id }, onclick: () => this.go(e.id) }, e.title));
        }
        this.tocChapters.set(ch.id, { btn, subs });
        this.toc.append(btn, subs);
      }
    }
  }

  // ---------------------------------------------------------- navigation

  /** Shows a page (whole chapter, scrolled to the page). */
  go(id, { record = true, top = false, terms = null } = {}) {
    const rec = this.index.byId.get(id);
    if (!rec) return false;
    this.terms = terms || [];
    if (this.chapter !== rec.chapter || terms) this.renderChapter(rec.chapter);
    const el = this.content.querySelector(`#ref-${CSS.escape(id)}`);
    if (top) this.content.scrollTop = 0;
    else if (el) this.content.scrollTop = el.offsetTop - 6;
    if (el && !top) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    if (record) {
      this.history = this.history.slice(0, this.histPos + 1);
      if (this.history[this.histPos] !== id) this.history.push(id);
      this.histPos = this.history.length - 1;
    }
    this.updateNav();
    this.spy();
    return true;
  }

  back() { if (this.histPos > 0) this.go(this.history[--this.histPos], { record: false }); }
  forward() { if (this.histPos < this.history.length - 1) this.go(this.history[++this.histPos], { record: false }); }

  updateNav() {
    this.backBtn.disabled = this.histPos <= 0;
    this.fwdBtn.disabled = this.histPos >= this.history.length - 1;
  }

  toggleWide(on = !this.el.classList.contains('wide')) {
    this.el.classList.toggle('wide', on);
    if (on) this.search.focus();
  }

  renderChapter(ch) {
    this.chapter = ch;
    const parts = [`<h2 class="ref-chapter">${esc(ch.title)}</h2>`];
    if (ch.intro) parts.push(`<div class="ref-intro">${ch.intro}</div>`);
    for (const e of ch.entries) {
      const syn = (e.syntax || []).length
        ? `<div class="ref-syntax">${e.syntax.map((s) => `<div>${esc(s)}</div>`).join('')}</div>` : '';
      parts.push(`<article class="ref-entry" id="ref-${esc(e.id)}"><h3>${esc(e.title)}</h3>${syn}${e.html}</article>`);
    }
    this.content.innerHTML = parts.join('');
    // verified examples: syntax coloring and "Try it" button
    const pp = /PP|PERIPH/.test(ch.id) || ch.id.startsWith('pp-');
    for (const preEl of this.content.querySelectorAll('pre.doc-ex')) {
      const text = preEl.textContent;
      const isPP = pp || /^\s+PERIPH\b/m.test(text);
      preEl.innerHTML = text.split('\n').map((l) => highlightLine(l, { macros: SYSTEM_MACROS, pp: isPP })).join('\n');
      const wrap = h('div', { class: 'ref-ex' });
      preEl.replaceWith(wrap);
      wrap.append(preEl, h('button', { class: 'tbtn ref-try', type: 'button', 'data-tip': 'Copy the example into a new file', onclick: () => this.tryExample(text, isPP) }, 'Try it'));
    }
    if (this.terms.length) this.markTerms();
    for (const [id, t] of this.tocChapters) {
      t.btn.classList.toggle('active', id === ch.id);
      t.subs.classList.toggle('hidden', id !== ch.id);
    }
    const t = this.tocChapters.get(ch.id);
    if (t) t.btn.scrollIntoView({ block: 'nearest' });
  }

  spy() {
    if (!this.chapter) return;
    const top = this.content.scrollTop + 40;
    let cur = null;
    for (const a of this.content.querySelectorAll('.ref-entry')) { if (a.offsetTop <= top) cur = a.id.slice(4); else break; }
    const t = this.tocChapters.get(this.chapter.id);
    if (!t) return;
    for (const b of t.subs.children) b.classList.toggle('active', b.dataset.id === cur);
  }

  onContentClick(e) {
    const a = e.target.closest('a.ref-link');
    if (!a) return;
    e.preventDefault();
    if (!this.go(a.dataset.ref)) this.ctx.log?.(`Page missing from the reference: ${a.dataset.ref}`, 'warn');
  }

  tryExample(text, pp) {
    const body = /^\S*\s+IDENT\b/m.test(text) ? text
      : pp ? `          IDENT  EXAMPLE,100B\n          PERIPH\n          ORG    100B\n${text}\n          END\n`
        : `          IDENT  EXAMPLE\n${text}\n          END\n`;
    if (this.ctx.openExample) this.ctx.openExample(body, pp ? 'example-pp.cmp' : 'example.cmp');
  }

  // -------------------------------------------------------------- search

  onSearch() {
    const q = this.search.value.trim();
    clear(this.results);
    if (!q) {
      this.results.classList.add('hidden');
      this.toc.classList.remove('hidden');
      if (this.terms.length) { this.terms = []; if (this.chapter) { const st = this.content.scrollTop; this.renderChapter(this.chapter); this.content.scrollTop = st; } }
      return;
    }
    const hits = this.index.search(q);
    const terms = fold(q).split(/\s+/).filter(Boolean);
    this.results.classList.remove('hidden');
    this.toc.classList.add('hidden');
    this.results.append(h('div', { class: 'ref-count' }, hits.length ? `${hits.length}${hits.length >= 80 ? '+' : ''} page${hits.length > 1 ? 's' : ''}` : 'No page found'));
    for (const r of hits) {
      this.results.append(h('button', { class: 'ref-hit', type: 'button', onclick: () => this.go(r.entry.id, { terms }) },
        h('span', { class: 'ref-hit-title' }, r.entry.title),
        h('span', { class: 'ref-hit-ch' }, r.chapter.title),
        h('span', { class: 'ref-hit-snip', html: markText(r.snippet, terms) })));
    }
  }

  markTerms() {
    const walker = document.createTreeWalker(this.content, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const s = n.nodeValue;
      const f = foldSameLength(s);
      const ranges = [];
      for (const t of this.terms) for (let p = f.indexOf(t); p >= 0; p = f.indexOf(t, p + t.length)) ranges.push([p, p + t.length]);
      if (!ranges.length) continue;
      ranges.sort((a, b) => a[0] - b[0]);
      const frag = document.createDocumentFragment();
      let at = 0;
      for (const [a, b] of ranges) {
        if (a < at) continue;
        frag.append(s.slice(at, a), h('mark', null, s.slice(a, b)));
        at = b;
      }
      frag.append(s.slice(at));
      n.replaceWith(frag);
    }
  }

  // ------------------------------------------------------------ help (F1)

  /** Opens the page of one of the words (the first known one); otherwise searches for the first word. */
  help(words) {
    for (const w of words) {
      const rec = this.index.lookup(w);
      if (rec) {
        this.search.value = '';
        this.onSearch();
        this.go(rec.entry.id);
        return true;
      }
    }
    if (words.length) {
      this.search.value = words[0];
      this.onSearch();
    }
    this.search.focus();
    return false;
  }

  onShow() {}

  update() {}
}

/** Case and accent folding that keeps the length (to place the marks). */
function foldSameLength(s) {
  let out = '';
  for (const ch of s) {
    const f = fold(ch);
    out += f.length === ch.length ? f : ch.toLowerCase().padEnd(ch.length).slice(0, ch.length);
  }
  return out;
}

/** Plain text to HTML, with the search terms marked. */
function markText(text, terms) {
  const f = foldSameLength(text);
  const ranges = [];
  for (const t of terms) for (let p = f.indexOf(t); p >= 0; p = f.indexOf(t, p + t.length)) ranges.push([p, p + t.length]);
  ranges.sort((a, b) => a[0] - b[0]);
  let out = '';
  let at = 0;
  for (const [a, b] of ranges) {
    if (a < at) continue;
    out += esc(text.slice(at, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>';
    at = b;
  }
  return out + esc(text.slice(at));
}

export { EXT_BCD, INDEX, icon };
