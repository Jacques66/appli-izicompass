// "Dayfile" panel: job status and dayfile of the mini-system.

import { h, esc, o, download } from '../dom.js';
import { toolbar, tbtn, emptyState } from './common.js';

const STATUS = {
  run: ['pill-ok', 'Job running'],
  end: ['pill-dim', 'Normal end'],
  abort: ['pill-error', 'Job aborted'],
  none: ['pill-dim', 'No job'],
};

export class DayfilePanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.head = h('div', { class: 'job-head' });
    this.list = h('div', { class: 'dayfile mono' });
    this.last = '';
    this.el = h('div', { class: 'panel panel-dayfile' },
      toolbar(this.head, h('div', { class: 'grow' }), tbtn('Download', () => this.save(), { icon: 'download', tip: 'Save the dayfile as .txt' })),
      this.list,
      h('div', { class: 'note' }, 'In System mode, the MTR monitor (PP00) processes the program requests (MESSAGE, WRITEC, READC, ENDRUN…) and records the events in the dayfile; the DSD console (PP01) shows it on the left screen. Type DROP then Enter on the console to abort the job.'));
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
      this.list.append(emptyState('log', 'No job running', 'Select System mode (or Automatic for a relocatable program), then run, for example, the "Hello (mini-system)" example.'));
      return;
    }
    if (!lines.length) {
      this.list.append(h('div', { class: 'dim pad' }, 'Dayfile empty.'));
      return;
    }
    lines.forEach((l, i) => this.list.append(h('div', { class: `day-row ${/ABORT|DROPPED|ILLEGAL|ERROR/.test(l) ? 'bad' : ''}` }, h('span', { class: 'day-n' }, String(i + 1).padStart(2, '0')), h('span', null, l))));
  }

  save() {
    download('dayfile.txt', this.ctx.runner.dayfile().join('\n') + '\n');
  }
}
