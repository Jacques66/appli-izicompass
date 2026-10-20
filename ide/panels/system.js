// Panneau « Journal » : état du travail et journal (dayfile) du mini-système.

import { h, esc, o, download } from '../dom.js';
import { toolbar, tbtn, emptyState } from './common.js';

const STATUS = {
  run: ['pill-ok', 'Travail en cours'],
  end: ['pill-dim', 'Fin normale'],
  abort: ['pill-error', 'Travail abandonné'],
  none: ['pill-dim', 'Aucun travail'],
};

export class JournalPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.head = h('div', { class: 'job-head' });
    this.list = h('div', { class: 'dayfile mono' });
    this.last = '';
    this.el = h('div', { class: 'panel panel-journal' },
      toolbar(this.head, h('div', { class: 'grow' }), tbtn('Télécharger', () => this.save(), { icon: 'download', tip: 'Enregistrer le journal en .txt' })),
      this.list,
      h('div', { class: 'note' }, 'En mode Système, le moniteur MTR (PP00) traite les demandes du programme (MESSAGE, WRITEC, READC, ENDRUN…) et note les événements dans le journal ; la console DSD (PP01) l\'affiche sur l\'écran gauche. Tapez DROP puis Entrée sur la console pour abandonner le travail.'));
  }

  onShow() {
    this.update(true);
  }

  update(force = false) {
    if (!force && !this.el.offsetParent) return;
    const r = this.ctx.runner;
    const st = r.jobStatus() || 'none';
    const lines = r.dayfile();
    const key = `${st}|${lines.join('\n')}|${r.kind}`;
    if (key === this.last && !force) return;
    this.last = key;
    const [cls, label] = STATUS[st] || STATUS.none;
    this.head.innerHTML = `<span class="pill ${cls}">${esc(label)}</span>`
      + (r.kind === 'system' && r.program ? `<span class="ptool-dim">${esc(r.program.name || '')} · RA ${o(r.ra, 6)}B · FL ${o(r.fl, 6)}B</span>` : '');
    this.list.textContent = '';
    if (r.kind !== 'system') {
      this.list.append(emptyState('log', 'Pas de travail en cours', 'Choisissez le mode Système (ou Automatique pour un programme relogeable) puis exécutez, par exemple, l\'exemple « Bonjour (mini-système) ».'));
      return;
    }
    if (!lines.length) {
      this.list.append(h('div', { class: 'dim pad' }, 'Journal vide.'));
      return;
    }
    lines.forEach((l, i) => this.list.append(h('div', { class: `day-row ${/ABANDON|ILLEGAL|ERREUR/.test(l) ? 'bad' : ''}` }, h('span', { class: 'day-n' }, String(i + 1).padStart(2, '0')), h('span', null, l))));
  }

  save() {
    download('journal.txt', this.ctx.runner.dayfile().join('\n') + '\n');
  }
}
