// Périphériques : imprimante 1612, lecteur de cartes 405, dérouleurs de bande 607.

import { h, esc, download, pickFiles } from '../dom.js';
import { toolbar, tbtn, emptyState } from './common.js';
import { segmented, select, toggle, toast, confirmDialog } from '../ui.js';
import { Tape } from '../../src/io/devices.js';
import { columnToChar } from '../../src/common/charset.js';

const SAMPLE_DECK = `CDC 6600 - LECTEUR DE CARTES 405
CHAQUE LIGNE DE TEXTE DEVIENT UNE CARTE DE 80 COLONNES.
LES LETTRES, LES CHIFFRES ET LES SIGNES + - * / ( ) = . , $
SONT PERFORES EN CODE HOLLERITH 029.
7/8/9
6/7/8/9`;

export class PeripheralsPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.printer = new PrinterView(ctx);
    this.cards = new CardsView(ctx);
    this.tapes = new TapesView(ctx);
    this.views = { printer: this.printer, cards: this.cards, tapes: this.tapes };
    this.current = 'printer';
    this.switcher = segmented([['printer', 'Imprimante 1612'], ['cards', 'Lecteur de cartes 405'], ['tapes', 'Bandes 607']], this.current, (v) => this.show(v));
    this.host = h('div', { class: 'periph-host' }, this.printer.el, this.cards.el, this.tapes.el);
    this.el = h('div', { class: 'panel panel-periph' }, h('div', { class: 'ptool ptool-tabs' }, this.switcher), this.host);
    this.show(this.current);
  }

  show(v) {
    this.current = v;
    this.switcher.setValue(v);
    for (const [k, view] of Object.entries(this.views)) view.el.classList.toggle('hidden', k !== v);
    this.views[v].update(true);
  }

  onShow() {
    this.views[this.current].update(true);
  }

  update(force = false) {
    if (!force && !this.el.offsetParent) return;
    this.views[this.current].update(force);
  }
}

// -------------------------------------------------------------- imprimante

class PrinterView {
  constructor(ctx) {
    this.ctx = ctx;
    this.rendered = 0;
    this.source = null;
    this.follow = true;
    this.paper = h('div', { class: 'paper mono' });
    this.wrap = h('div', { class: 'paper-wrap' }, this.paper);
    this.stats = h('span', { class: 'ptool-dim' });
    this.el = h('div', { class: 'periph-view printer' },
      toolbar(this.stats, h('div', { class: 'grow' }),
        tbtn('Télécharger .txt', () => this.save(), { icon: 'download' }),
        tbtn('Effacer', () => this.clearOut(), { icon: 'trash' })),
      this.wrap);
    this.wrap.addEventListener('scroll', () => {
      this.follow = this.wrap.scrollTop + this.wrap.clientHeight >= this.wrap.scrollHeight - 30;
    });
  }

  printerDev() {
    return this.ctx.machine.printer;
  }

  update(force = false) {
    const pr = this.printerDev();
    const out = pr.output;
    if (this.source !== out || out.length < this.rendered) {
      this.source = out;
      this.rendered = 0;
      this.paper.textContent = '';
      this.newPage();
    }
    if (out.length > this.rendered) {
      const frag = document.createDocumentFragment();
      for (let i = this.rendered; i < out.length; i++) {
        const line = out[i];
        if (line === '\f') {
          this.flushTo(frag);
          this.newPage();
          continue;
        }
        frag.append(h('div', { class: 'pl' }, line || ' '));
      }
      this.flushTo(frag);
      this.rendered = out.length;
      if (this.follow) this.wrap.scrollTop = this.wrap.scrollHeight;
    }
    if (!out.length && !this.paper.querySelector('.pl')) {
      if (!this.paper.querySelector('.empty')) this.page.append(emptyState('printer', 'Aucune ligne imprimée', 'Lancez l\'exemple « Imprimante 1612 » : le PP envoie les lignes sur le canal 12B.'));
    } else {
      const e = this.paper.querySelector('.empty');
      if (e) e.remove();
    }
    const lines = out.filter((l) => l !== '\f').length;
    this.stats.textContent = `${lines} ligne${lines > 1 ? 's' : ''} · ${pr.pages} page${pr.pages > 1 ? 's' : ''} · 136 colonnes`;
  }

  newPage() {
    this.page = h('div', { class: 'page' });
    this.paper.append(this.page);
  }

  flushTo(frag) {
    this.page.append(frag);
  }

  save() {
    const text = this.printerDev().output.join('\n').replace(/\n?\f\n?/g, '\n\f\n');
    download('imprimante-1612.txt', text);
  }

  clearOut() {
    const pr = this.printerDev();
    pr.output.length = 0;
    pr.pages = 1;
    this.update(true);
  }
}

// ------------------------------------------------------ lecteur de cartes

class CardsView {
  constructor(ctx) {
    this.ctx = ctx;
    this.deck = h('textarea', { class: 'deck mono', spellcheck: 'false', wrap: 'off' });
    this.deck.value = ctx.settings.cardDeck ?? SAMPLE_DECK;
    this.deck.addEventListener('input', () => { ctx.settings.cardDeck = this.deck.value; ctx.saveSettings(); });
    this.code = select([['029', 'Code 029 (IBM)'], ['026', 'Code 026 (CDC)']], ctx.settings.cardCode || '029', (v) => { ctx.settings.cardCode = v; ctx.saveSettings(); });
    this.stats = h('div', { class: 'card-stats' });
    this.cardView = h('div', { class: 'card-view' });
    this.el = h('div', { class: 'periph-view cards' },
      toolbar(tbtn('Charger dans le lecteur', () => this.load(), { icon: 'upload', cls: 'primary' }),
        tbtn('Vider le magasin', () => this.empty(), { icon: 'trash' }),
        tbtn('Importer…', () => this.importDeck(), { icon: 'folder' }),
        h('div', { class: 'grow' }), this.code),
      h('div', { class: 'cards-body' },
        h('div', { class: 'deck-col' }, h('div', { class: 'deck-head' }, 'Paquet à charger (une ligne = une carte ; « 7/8/9 » = fin d\'enregistrement, « 6/7/8/9 » = fin de fichier)'), this.deck),
        h('div', { class: 'reader-col' }, this.stats, this.cardView)));
  }

  load() {
    const r = this.ctx.machine.cardReader;
    const before = r.hopper.length;
    r.loadDeck(this.deck.value, this.code.value);
    const n = r.hopper.length - before;
    this.ctx.log(`${n} carte(s) chargée(s) dans le lecteur 405.`);
    toast(`${n} carte${n > 1 ? 's' : ''} dans le magasin`, 'ok');
    this.update(true);
  }

  empty() {
    const r = this.ctx.machine.cardReader;
    r.hopper.length = 0;
    r.card = null;
    this.update(true);
  }

  async importDeck() {
    const files = await pickFiles({ accept: '.txt,.cards,.dat,.cmp' });
    if (!files.length) return;
    this.deck.value = files[0].text.replace(/\r/g, '');
    this.ctx.settings.cardDeck = this.deck.value;
    this.ctx.saveSettings();
  }

  update() {
    const r = this.ctx.machine.cardReader;
    const remaining = r.hopper.length + (r.card ? 1 : 0);
    this.stats.innerHTML = `<div class="stat"><b>${remaining}</b><span>carte${remaining > 1 ? 's' : ''} dans le magasin</span></div>`
      + `<div class="stat"><b>${r.cardsRead}</b><span>carte${r.cardsRead > 1 ? 's' : ''} lue${r.cardsRead > 1 ? 's' : ''}</span></div>`
      + `<div class="stat"><b>${r.card ? r.col : '—'}</b><span>colonne en cours</span></div>`;
    const next = r.card || r.hopper[0] || null;
    const key = next ? `${r.hopper.length}|${r.card ? r.col : -1}` : 'none';
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.cardView.innerHTML = next ? cardSvg(next, r.card ? r.col : 0, this.code.value) : '<div class="card-empty">Magasin vide</div>';
    }
  }
}

/** Carte perforée de 80 colonnes en SVG (lignes 12, 11, 0 à 9). */
function cardSvg(cols, readCol, code) {
  const W = 80 * 7 + 24, H = 12 * 14 + 40;
  const rows = [0o4000, 0o2000, 0o1000, 0o400, 0o200, 0o100, 0o40, 0o20, 0o10, 4, 2, 1];
  const rowLabel = ['12', '11', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  let s = `<svg class="card-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  s += `<path d="M10 2 H${W - 2} V${H - 2} H2 V10 Z" class="card-bg"/>`;
  let text = '';
  for (let c = 0; c < 80; c++) text += columnToChar(cols[c], code) === '?' && cols[c] ? '?' : columnToChar(cols[c], code);
  s += `<text x="12" y="14" class="card-print">${esc(text.replace(/ +$/, ''))}</text>`;
  for (let r = 0; r < 12; r++) {
    const y = 24 + r * 14;
    for (let c = 0; c < 80; c++) {
      const x = 12 + c * 7;
      if (cols[c] & rows[r]) s += `<rect x="${x}" y="${y}" width="4" height="9" class="card-hole ${c < readCol ? 'read' : ''}"/>`;
      else if (r >= 2) s += `<text x="${x + 2}" y="${y + 8}" class="card-digit">${rowLabel[r]}</text>`;
    }
  }
  if (readCol > 0) s += `<rect x="${12 + readCol * 7 - 2}" y="20" width="1.5" height="${12 * 14 + 4}" class="card-cursor"/>`;
  s += '</svg>';
  return s;
}

// ------------------------------------------------------------------ bandes

class TapesView {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = h('div', { class: 'tapes' });
    this.el = h('div', { class: 'periph-view tapes-view' },
      h('div', { class: 'note' }, 'Dérouleurs 607 sur le canal 13B. Une bande est une suite d\'enregistrements de mots de 12 bits et de marques de fichier ; le format .tap (SIMH) est accepté.'),
      this.list);
  }

  update() {
    const drive = this.ctx.machine.tapes;
    const n = this.ctx.machine.config.tapeUnits || 4;
    const L = this.list;
    L.textContent = '';
    for (let u = 0; u < n; u++) {
      const t = drive.units[u];
      const selected = drive.unit === u;
      const recs = t ? t.records.filter((r) => r !== null).length : 0;
      const marks = t ? t.records.filter((r) => r === null).length : 0;
      const words = t ? t.records.reduce((s, r) => s + (r ? r.length : 0), 0) : 0;
      const info = t ? `${recs} enregistrement${recs > 1 ? 's' : ''} · ${marks} marque${marks > 1 ? 's' : ''} · ${words} mots · position ${t.pos}/${t.records.length}` : 'aucune bande montée';
      L.append(h('div', { class: `tape ${selected ? 'selected' : ''} ${t ? '' : 'empty'}` },
        h('div', { class: 'reels' }, reel(), reel()),
        h('div', { class: 'tape-main' },
          h('div', { class: 'tape-title' }, `Unité ${u}`, selected ? h('span', { class: 'pill pill-dim' }, 'sélectionnée') : null, t && t.pos === 0 ? h('span', { class: 'pill pill-dim' }, 'point de chargement') : null),
          h('div', { class: 'tape-info mono' }, info),
          h('div', { class: 'tape-actions' },
            tbtn('Nouvelle', () => this.mount(u), { icon: 'plus', tip: 'Monter une bande vierge' }),
            tbtn('Importer .tap', () => this.importTap(u), { icon: 'upload' }),
            t ? tbtn('Exporter .tap', () => this.exportTap(u), { icon: 'download' }) : null,
            t ? tbtn('Rembobiner', () => { t.pos = 0; this.update(); }, { icon: 'reset' }) : null,
            t ? tbtn('Démonter', () => this.unmount(u), { icon: 'close' }) : null,
            t ? toggle(t.writeLock, (v) => { t.writeLock = v; this.update(); }, 'Protégée') : null))));
    }
  }

  mount(u) {
    this.ctx.machine.tapes.mount(u, new Tape());
    this.ctx.log(`Bande vierge montée sur l'unité ${u}.`);
    this.update();
  }

  async unmount(u) {
    const t = this.ctx.machine.tapes.units[u];
    if (t && t.records.length && !(await confirmDialog('Démonter la bande', `La bande de l'unité ${u} contient ${t.records.length} enregistrement(s). Les exporter d'abord si nécessaire.`, { okLabel: 'Démonter', danger: true }))) return;
    this.ctx.machine.tapes.units[u] = null;
    this.update();
  }

  async importTap(u) {
    const files = await pickFiles({ accept: '.tap,.bin', binary: true });
    if (!files.length) return;
    try {
      const tape = Tape.fromTap(files[0].bytes);
      this.ctx.machine.tapes.mount(u, tape);
      this.ctx.log(`Bande ${files[0].name} montée sur l'unité ${u} (${tape.records.length} enregistrements).`);
      toast(`${files[0].name} montée sur l'unité ${u}`, 'ok');
    } catch (e) {
      toast(`Image .tap illisible : ${e.message}`, 'error');
    }
    this.update();
  }

  exportTap(u) {
    const t = this.ctx.machine.tapes.units[u];
    if (!t) return;
    download(`bande-${u}.tap`, t.toTap(), 'application/octet-stream');
  }
}

function reel() {
  return h('div', { class: 'reel', html: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="14.5" class="reel-outer"/><circle cx="16" cy="16" r="4" class="reel-hub"/><path d="M16 3.5v8M27 22.5l-7-4M5 22.5l7-4" class="reel-spoke"/></svg>' });
}
