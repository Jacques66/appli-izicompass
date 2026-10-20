// Atelier COMPASS : application principale de l'IDE.
//
// Relie l'éditeur, l'assembleur (src/asm/compass.js), le chargeur et
// l'émulateur (src/machine.js via src/runtime/runner.js) et les panneaux.

import { h, icon, iconButton, store, debounce, download, pickFiles, o, parseOctal } from './dom.js';
import { LOGO_SVG } from './icons.js';
import { initTooltips, toast, openDialog, promptDialog, confirmDialog, contextMenu, field, select, toggle, segmented, dialogIsOpen, hideTip } from './ui.js';
import { Tabs, makeSplitter } from './layout.js';
import { Editor } from './editor.js';
import { Workspace, compassName } from './storage.js';
import { ProblemsPanel, ListingPanel, SymbolsPanel, MapPanel, LogPanel } from './panels/assembly.js';
import { CpuPanel, fmtTime } from './panels/cpu.js';
import { MemoryPanel } from './panels/memory.js';
import { PpPanel, ChannelsPanel } from './panels/pp.js';
import { PeripheralsPanel } from './panels/peripherals.js';
import { ConsolePanel, DeadstartPanel } from './panels/console.js';
import { DocsPanel, SHORTCUTS } from './panels/docs.js';
import { JournalPanel } from './panels/system.js';
import { Machine } from '../src/machine.js';
import { MODELS } from '../src/cpu/cpu.js';
import { assemble } from '../src/asm/compass.js';
import { SYSTEM_TEXTS } from '../src/os/systext.js';
import { collectMacros } from './highlight.js';
import { DEADSTART_PANEL } from '../src/os/dsl.js';

import { Runner, RunController, RUN_MODES, DEMO_DEADSTART } from '../src/runtime/runner.js';

/** Macros du texte système (MESSAGE, WRITEC, ENDRUN...), colorées comme des macros. */
const SYSTEM_MACROS = (() => { try { return collectMacros(Object.values(SYSTEM_TEXTS).join('\n')); } catch { return new Set(); } })();

const SETTINGS_KEY = 'cdc6600-ide/settings/v1';

const DEFAULTS = {
  theme: 'auto', fontSize: 13, autoUpper: true, autoAssemble: false,
  model: '6600', cmWords: 0o400000, ecsWords: 0o400000,
  mode: 'auto', ra: 0, fl: 0, em: 0o070000, ppNumber: 0,
  deadstart: DEMO_DEADSTART.slice(), speed: 5,
  phosphor: 'green', persistence: 50000, consoleView: 'both',
};

/** Vitesses : µs simulées par image (environ 60 images par seconde). */
const SPEEDS = [
  { us: 1, label: '1 µs/image' }, { us: 10, label: '10 µs/image' }, { us: 100, label: '100 µs/image' },
  { us: 1000, label: '1 ms/image' }, { us: 5000, label: '5 ms/image' }, { us: 16667, label: 'Temps réel' },
  { us: 83333, label: '× 5' }, { us: 0, label: 'Vitesse max', max: true },
];

const TEMPLATES = {
  cpu: `          IDENT  PROG,100B,DEBUT
          ABS
          ORG    100B
*         NOUVEAU PROGRAMME CPU ABSOLU.
*
DEBUT     SX6    1             X6 = 1
          SA6    RESULT        RANGEMENT EN MEMOIRE
          PS                   ARRET
*
RESULT    BSS    1
          END
`,
  pp: `          IDENT  PRG,100B
          PERIPH
          ORG    100B
*         NOUVEAU PROGRAMME PP.
*
DEBUT     LDN    0
          STD    20B
BOUCLE    AOD    20B           COMPTEUR EN CELLULE DIRECTE 20B
          UJN    BOUCLE
          END
`,
  text: `*         TEXTE EXTERNE (APPEL PAR XTEXT NOM).
*
`,
};

class App {
  constructor() {
    this.settings = { ...DEFAULTS, ...store.get(SETTINGS_KEY, {}) };
    this.workspace = new Workspace();
    this.editors = new Map();     // id -> { editor, file, saved }
    this.activeId = null;
    this.result = null;           // dernier assemblage
    this.assembled = null;        // { id, text } source du dernier assemblage
    this.loaded = null;           // { id, text, mode } programme chargé
    this.examples = [];
    this.exampleTexts = {};
    this.lastPanelUpdate = 0;
    this.symCache = null;

    this.machine = this.createMachine();
    this.runner = new Runner(this.machine, this.runnerOptions());
    this.controller = new RunController(this.runner, {
      onFrame: (info) => this.onFrame(info),
      onStop: (stop, text) => this.onStop(stop, text),
      onState: (s) => this.onState(s),
      keepRunningAfterJob: true,
    });
    this.applySpeed();

    this.ctx = this.makeContext();
    this.buildLayout();
    this.applyTheme();
    initTooltips();
    this.bindKeys();
    this.restoreFiles();
    this.loadExamples();
    this.updateStatus();
    this.updateToolbar();
    window.addEventListener('beforeunload', (e) => {
      if ([...this.editors.values()].some((x) => x.editor.getValue() !== x.file.content)) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    this.log('Atelier COMPASS prêt. F7 assemble, F5 exécute, F1 affiche les raccourcis.');
  }

  // ------------------------------------------------------------ machine

  createMachine(prev = null) {
    const s = this.settings;
    const m = new Machine({ model: MODELS[s.model] ? s.model : '6600', cmWords: s.cmWords, ecsWords: s.ecsWords });
    if (prev) {
      // Les périphériques gardent leur contenu (papier, paquet de cartes, bandes).
      m.printer.output = prev.printer.output;
      m.printer.pages = prev.printer.pages;
      m.cardReader.hopper = prev.cardReader.hopper;
      m.cardReader.cardsRead = prev.cardReader.cardsRead;
      for (let u = 0; u < m.tapes.units.length; u++) m.tapes.units[u] = prev.tapes.units[u];
    }
    return m;
  }

  rebuildMachine() {
    this.controller.halt();
    this.machine = this.createMachine(this.machine);
    this.runner.setMachine(this.machine);
    this.loaded = null;
    this.controller.setState('idle');
    this.setExecLine(null);
    this.refresh(true);
  }

  runnerOptions() {
    const s = this.settings;
    return { mode: s.mode, ra: s.ra, fl: s.fl, em: s.em, ppNumber: s.ppNumber, deadstart: s.deadstart };
  }

  applySpeed() {
    const sp = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, this.settings.speed))];
    this.controller.setSpeed(sp.us || 1, !!sp.max);
  }

  saveSettings() {
    store.set(SETTINGS_KEY, this.settings);
  }

  makeContext() {
    const app = this;
    return {
      get machine() { return app.machine; },
      get runner() { return app.runner; },
      get controller() { return app.controller; },
      get settings() { return app.settings; },
      saveSettings: () => this.saveSettings(),
      log: (m, k) => this.log(m, k),
      revealSource: (line, file) => this.revealSource(line, file),
      symbolMap: () => this.symbolMap(),
      refresh: (f) => this.refresh(f),
      stepPP: (n) => this.stepPP(n),
      deadstart: (words) => this.runDeadstart(words),
      download: (n, t) => download(n, t),
      currentName: () => (this.activeFile() ? compassName(this.activeFile().name) : 'PROG'),
      modelName: () => (MODELS[this.machine.cpu.model] || {}).name || '',
    };
  }

  symbolMap() {
    if (!this.symCache || this.symCache.result !== this.runner.result || this.symCache.base !== this.runner.base) {
      this.symCache = { result: this.runner.result, base: this.runner.base, map: this.runner.symbolTable() };
    }
    return this.symCache.map;
  }

  // ------------------------------------------------------------- mise en page

  buildLayout() {
    document.getElementById('brand').innerHTML = `${LOGO_SVG}<div class="brand-text"><span class="brand-main">CDC 6600</span><span class="brand-sub">Atelier COMPASS</span></div>`;
    this.buildToolbar();

    // Barre latérale : fichiers et exemples.
    this.sidebar = document.getElementById('sidebar');
    this.fileList = h('div', { class: 'file-list' });
    this.exampleList = h('div', { class: 'file-list examples' });
    this.sidebar.append(
      h('div', { class: 'side-head' }, h('span', { class: 'side-title' }, 'Fichiers'),
        h('div', { class: 'side-actions' },
          iconButton('filePlus', 'Nouveau fichier (Ctrl+N)', () => this.newFileDialog()),
          iconButton('upload', 'Importer depuis le disque (Ctrl+O)', () => this.importFiles()))),
      this.fileList,
      h('div', { class: 'side-head' }, h('span', { class: 'side-title' }, 'Exemples')),
      this.exampleList);
    this.workspace.onChange(() => this.renderFiles());

    // Éditeur.
    this.editorTabs = document.getElementById('editor-tabs');
    this.editorHost = document.getElementById('editor-host');

    // Panneau bas : résultats d'assemblage.
    this.problems = new ProblemsPanel(this.ctx);
    this.listing = new ListingPanel(this.ctx);
    this.symbols = new SymbolsPanel(this.ctx);
    this.map = new MapPanel(this.ctx);
    this.logPanel = new LogPanel();
    this.bottomTabs = new Tabs(document.getElementById('bottom-panel'), { key: 'bottom', cls: 'tabs-bottom' });
    this.bottomTabs.add({ id: 'problems', label: 'Problèmes', icon: 'alert', panel: this.problems, badge: true })
      .add({ id: 'listing', label: 'Listing', icon: 'list', panel: this.listing })
      .add({ id: 'symbols', label: 'Symboles', icon: 'tag', panel: this.symbols })
      .add({ id: 'map', label: 'Carte du chargeur', icon: 'map', panel: this.map })
      .add({ id: 'log', label: 'Messages', icon: 'log', panel: this.logPanel });

    // Panneau droit : machine.
    this.consolePanel = new ConsolePanel(this.ctx);
    this.cpuPanel = new CpuPanel(this.ctx);
    this.memPanel = new MemoryPanel(this.ctx);
    this.ppPanel = new PpPanel(this.ctx);
    this.chPanel = new ChannelsPanel(this.ctx);
    this.periph = new PeripheralsPanel(this.ctx);
    this.dsPanel = new DeadstartPanel(this.ctx);
    this.docs = new DocsPanel(this.ctx);
    this.journal = new JournalPanel(this.ctx);
    this.rightTabs = new Tabs(document.getElementById('right-panel'), { key: 'right', cls: 'tabs-right' });
    this.rightTabs.add({ id: 'console', label: 'Console', icon: 'monitor', panel: this.consolePanel })
      .add({ id: 'journal', label: 'Journal', icon: 'log', panel: this.journal })
      .add({ id: 'cpu', label: 'CPU', icon: 'cpu', panel: this.cpuPanel })
      .add({ id: 'memory', label: 'Mémoire', icon: 'memory', panel: this.memPanel })
      .add({ id: 'pp', label: 'PP', icon: 'grid', panel: this.ppPanel })
      .add({ id: 'channels', label: 'Canaux', icon: 'plug', panel: this.chPanel })
      .add({ id: 'periph', label: 'Périphériques', icon: 'printer', panel: this.periph })
      .add({ id: 'deadstart', label: 'Deadstart', icon: 'switches', panel: this.dsPanel })
      .add({ id: 'docs', label: 'Documentation', icon: 'book', panel: this.docs });
    this.rightPanels = [this.consolePanel, this.journal, this.cpuPanel, this.memPanel, this.ppPanel, this.chPanel, this.periph];

    // Séparateurs.
    const ws = document.getElementById('workspace');
    makeSplitter(document.querySelector('[data-split="sidebar"]'), this.sidebar, { axis: 'x', min: 150, max: 420, key: 'sidebar' });
    makeSplitter(document.querySelector('[data-split="right"]'), document.getElementById('right-panel'), {
      axis: 'x', invert: true, min: 340, max: () => ws.clientWidth - 420, key: 'right', onResize: () => this.consolePanel.onShow(),
    });
    makeSplitter(document.querySelector('[data-split="bottom"]'), document.getElementById('bottom-panel'), {
      axis: 'y', invert: true, min: 90, max: () => document.getElementById('center').clientHeight - 160, key: 'bottom',
    });

    this.statusbar = document.getElementById('statusbar');
    this.buildStatusbar();
  }

  buildToolbar() {
    const tb = document.getElementById('toolbar');
    const sep = () => h('div', { class: 'tb-sep' });
    this.btn = {
      new: iconButton('filePlus', 'Nouveau fichier (Ctrl+N)', () => this.newFileDialog()),
      open: iconButton('upload', 'Importer un fichier (Ctrl+O)', () => this.importFiles()),
      save: iconButton('save', 'Enregistrer (Ctrl+S)', () => this.save()),
      export: iconButton('download', 'Exporter le fichier courant', () => this.exportFile()),
      asm: iconButton('hammer', 'Assembler (F7 ou Ctrl+B)', () => this.assembleCurrent(true), { label: 'Assembler', cls: 'with-label' }),
      run: iconButton('play', 'Exécuter / continuer (F5)', () => this.run(), { label: 'Exécuter', cls: 'with-label run' }),
      pause: iconButton('pause', 'Pause (F6)', () => this.controller.pause()),
      stepCpu: iconButton('stepCpu', 'Pas à pas CPU : une instruction (F10)', () => this.stepCPU()),
      stepPp: iconButton('stepPp', 'Pas à pas PP : une instruction du PP courant (Maj+F10)', () => this.stepPP()),
      reset: iconButton('reset', 'Recharger et réinitialiser (Ctrl+Maj+F5)', () => this.reload()),
      settings: iconButton('gear', 'Paramètres', () => this.settingsDialog()),
      theme: iconButton('moon', 'Thème clair / sombre', () => this.toggleTheme()),
      help: iconButton('help', 'Raccourcis clavier (F1)', () => this.shortcutsDialog()),
    };
    this.modeSel = select(Object.entries(RUN_MODES), this.settings.mode, (v) => { this.settings.mode = v; this.runner.options.mode = v; this.saveSettings(); this.loaded = null; this.updateToolbar(); }, 'tb-select');
    this.modeSel.setAttribute('data-tip', 'Mode d\'exécution');
    this.speed = h('input', { type: 'range', class: 'range', min: 0, max: SPEEDS.length - 1, step: 1, value: this.settings.speed });
    this.speedLabel = h('span', { class: 'tb-speed-label' });
    this.speed.addEventListener('input', () => {
      this.settings.speed = Number(this.speed.value);
      this.applySpeed();
      this.speedLabel.textContent = SPEEDS[this.settings.speed].label;
      this.saveSettings();
    });
    this.speedLabel.textContent = SPEEDS[this.settings.speed].label;
    tb.append(
      h('div', { class: 'tb-group' }, this.btn.new, this.btn.open, this.btn.save, this.btn.export), sep(),
      h('div', { class: 'tb-group' }, this.btn.asm), sep(),
      h('div', { class: 'tb-group' }, this.btn.run, this.btn.pause, this.btn.stepCpu, this.btn.stepPp, this.btn.reset), sep(),
      h('div', { class: 'tb-group' }, this.modeSel,
        h('div', { class: 'tb-speed', 'data-tip': 'Vitesse de simulation (µs simulées par image)' }, icon('speed', 15), this.speed, this.speedLabel)),
      h('div', { class: 'grow' }),
      h('div', { class: 'tb-group' }, this.btn.theme, this.btn.settings, this.btn.help));
  }

  buildStatusbar() {
    this.st = {
      state: h('span', { class: 'sb-item sb-state' }),
      mode: h('span', { class: 'sb-item' }),
      time: h('span', { class: 'sb-item mono', 'data-tip': 'Temps simulé' }),
      mips: h('span', { class: 'sb-item mono', 'data-tip': 'Instructions CPU par seconde réelle · rapport au temps réel' }),
      asm: h('span', { class: 'sb-item' }),
      cursor: h('span', { class: 'sb-item mono' }),
      upper: h('button', { class: 'sb-item sb-btn', type: 'button', 'data-tip': 'Majuscules automatiques (COMPASS est en majuscules)', onclick: () => this.setAutoUpper(!this.settings.autoUpper) }),
      store: h('span', { class: 'sb-item' }),
    };
    const S = this.st;
    this.statusbar.append(S.state, S.mode, S.time, S.mips, h('div', { class: 'grow' }), S.asm, S.store, S.upper, S.cursor);
  }

  // -------------------------------------------------------------- thème

  applyTheme() {
    const t = this.settings.theme;
    const root = document.documentElement;
    if (t === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', t);
    const dark = t === 'dark' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    this.btn.theme.innerHTML = '';
    this.btn.theme.append(icon(dark ? 'sun' : 'moon', 16));
    this.btn.theme.dataset.tip = dark ? 'Passer au thème clair' : 'Passer au thème sombre';
  }

  toggleTheme() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark'
      || (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    this.settings.theme = dark ? 'light' : 'dark';
    this.saveSettings();
    this.applyTheme();
  }

  // ------------------------------------------------------------ fichiers

  restoreFiles() {
    const ws = this.workspace;
    for (const id of ws.openIds) this.openFile(id, { activate: false });
    const active = ws.activeId && this.editors.has(ws.activeId) ? ws.activeId : ws.openIds[0];
    if (active) this.activate(active);
    this.renderFiles();
  }

  activeFile() {
    return this.activeId ? this.workspace.get(this.activeId) : null;
  }

  activeEditor() {
    const e = this.editors.get(this.activeId);
    return e ? e.editor : null;
  }

  openFile(id, { activate = true } = {}) {
    const f = this.workspace.get(id);
    if (!f) return null;
    if (!this.editors.has(id)) {
      const editor = new Editor({
        extraMacros: SYSTEM_MACROS,
        fontSize: this.settings.fontSize,
        autoUpper: this.settings.autoUpper,
        onChange: () => this.onEdit(id),
        onCursor: (ed) => { if (id === this.activeId) this.updateCursor(ed); },
        onBreakpoints: (set) => this.onBreakpoints(id, set),
        onCommand: (cmd, n) => {
          if (cmd === 'gotoLine') this.gotoLineDialog();
          else if (cmd === 'replacedAll') toast(`${n} remplacement${n > 1 ? 's' : ''}`, 'ok');
        },
      });
      editor.el.classList.add('hidden');
      this.editorHost.append(editor.el);
      editor.setValue(f.draft ?? f.content);
      editor.setBreakpoints(f.breakpoints || []);
      this.editors.set(id, { editor, file: f });
      if (!this.workspace.openIds.includes(id)) this.workspace.openIds.push(id);
    }
    if (activate) this.activate(id);
    this.renderEditorTabs();
    return this.editors.get(id).editor;
  }

  activate(id) {
    if (!this.editors.has(id)) { this.openFile(id); return; }
    this.activeId = id;
    for (const [k, v] of this.editors) v.editor.el.classList.toggle('hidden', k !== id);
    const ed = this.editors.get(id).editor;
    requestAnimationFrame(() => { ed.updateSize(); ed.render(); ed.focus(); this.updateCursor(ed); });
    this.workspace.setOpen(this.workspace.openIds, id);
    this.renderEditorTabs();
    this.renderFiles();
    this.updateStatus();
    this.showEmptyEditor(false);
  }

  async closeFile(id) {
    const e = this.editors.get(id);
    if (!e) return;
    if (e.editor.getValue() !== e.file.content) {
      const r = await openDialog({
        title: 'Fichier modifié', body: `Enregistrer les modifications de « ${e.file.name} » ?`, width: 440,
        buttons: [{ label: 'Annuler', value: 'cancel' }, { label: 'Ne pas enregistrer', value: 'discard', kind: 'danger' }, { label: 'Enregistrer', value: 'save', kind: 'primary' }],
      });
      if (!r || r === 'cancel') return;
      if (r === 'save') this.workspace.save(id, e.editor.getValue());
      else this.workspace.setDraft(id, e.file.content);
    }
    e.editor.dispose();
    this.editors.delete(id);
    const open = this.workspace.openIds.filter((x) => x !== id);
    let next = this.activeId;
    if (this.activeId === id) next = open[open.length - 1] || null;
    this.workspace.setOpen(open, next);
    if (next) this.activate(next);
    else { this.activeId = null; this.showEmptyEditor(true); }
    this.renderEditorTabs();
    this.renderFiles();
  }

  showEmptyEditor(on) {
    let el = this.editorHost.querySelector('.editor-empty');
    if (on && !el) {
      el = h('div', { class: 'editor-empty' },
        h('div', { class: 'ee-logo', html: LOGO_SVG }),
        h('div', { class: 'ee-title' }, 'Atelier COMPASS'),
        h('div', { class: 'ee-text' }, 'Ouvrez un fichier ou un exemple dans le panneau de gauche, ou créez un nouveau programme.'),
        h('div', { class: 'ee-actions' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => this.newFileDialog() }, 'Nouveau programme'),
          h('button', { class: 'btn', type: 'button', onclick: () => this.openExample(this.examples.find((x) => x.file === 'pp-console.cmp')) }, 'Exemple : console 6612'),
          h('button', { class: 'btn', type: 'button', onclick: () => this.runDeadstart(this.settings.deadstart) }, 'Deadstart de démonstration')));
      this.editorHost.append(el);
    } else if (!on && el) el.remove();
  }

  isModified(id) {
    const e = this.editors.get(id);
    const f = this.workspace.get(id);
    if (!f) return false;
    return e ? e.editor.getValue() !== f.content : f.draft !== null && f.draft !== f.content;
  }

  renderEditorTabs() {
    const T = this.editorTabs;
    T.textContent = '';
    for (const id of this.workspace.openIds) {
      const f = this.workspace.get(id);
      if (!f) continue;
      const mod = this.isModified(id);
      const tab = h('div', {
        class: `etab ${id === this.activeId ? 'active' : ''} ${mod ? 'modified' : ''}`, role: 'tab',
        onmousedown: (e) => { if (e.button === 1) { e.preventDefault(); this.closeFile(id); } },
        onclick: () => this.activate(id),
      },
      icon(f.kind === 'text' ? 'fileText' : 'file', 14),
      h('span', { class: 'etab-name' }, f.name),
      h('button', { class: 'etab-close', type: 'button', 'aria-label': 'Fermer', 'data-tip': 'Fermer', onclick: (e) => { e.stopPropagation(); this.closeFile(id); } }, h('span', { class: 'etab-dot' }), icon('close', 12)));
      T.append(tab);
    }
  }

  renderFiles() {
    const L = this.fileList;
    L.textContent = '';
    const files = this.workspace.files;
    if (!files.length) L.append(h('div', { class: 'side-empty' }, 'Aucun fichier. Créez-en un ou ouvrez un exemple.'));
    for (const f of files) {
      const loaded = this.loaded && this.loaded.id === f.id;
      L.append(h('div', {
        class: `file ${f.id === this.activeId ? 'active' : ''}`, role: 'button', tabindex: '0',
        onclick: () => this.openFile(f.id),
        onkeydown: (e) => { if (e.key === 'Enter') this.openFile(f.id); },
        oncontextmenu: (e) => { e.preventDefault(); this.fileMenu(f, e.clientX, e.clientY); },
      },
      icon(f.kind === 'text' ? 'fileText' : 'file', 15),
      h('span', { class: 'file-name' }, f.name),
      loaded ? h('span', { class: 'file-badge', 'data-tip': 'Programme chargé dans la machine' }, icon('cpu', 12)) : null,
      this.isModified(f.id) ? h('span', { class: 'file-mod', 'data-tip': 'Modifié, non enregistré' }) : null,
      h('button', { class: 'file-more', type: 'button', 'aria-label': 'Actions', onclick: (e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); this.fileMenu(f, r.left, r.bottom + 2); } }, icon('chevronDown', 13))));
    }
    if (!this.workspace.persistent) L.append(h('div', { class: 'side-warn' }, icon('alert', 13), 'Stockage du navigateur indisponible : les fichiers ne seront pas conservés.'));
  }

  fileMenu(f, x, y) {
    contextMenu([
      { label: 'Ouvrir', icon: 'file', action: () => this.openFile(f.id) },
      { label: 'Renommer…', icon: 'pencil', action: () => this.renameFile(f) },
      { label: 'Dupliquer', icon: 'copy', action: () => { const n = this.workspace.create({ name: f.name, content: this.textOf(f.id), kind: f.kind }); this.openFile(n.id); } },
      { label: 'Exporter', icon: 'download', action: () => download(f.name, this.textOf(f.id)) },
      { separator: true },
      { label: 'Supprimer…', icon: 'trash', danger: true, action: () => this.deleteFile(f) },
    ], x, y);
  }

  textOf(id) {
    const e = this.editors.get(id);
    const f = this.workspace.get(id);
    return e ? e.editor.getValue() : f ? f.draft ?? f.content : '';
  }

  validName(v, except = null) {
    if (!v) return 'Nom requis.';
    if (/[\\/:*?"<>|]/.test(v)) return 'Caractères interdits : \\ / : * ? " < > |';
    const other = this.workspace.byName(v);
    if (other && other.id !== except) return 'Un fichier porte déjà ce nom.';
    return null;
  }

  async renameFile(f) {
    const v = await promptDialog('Renommer', 'Nouveau nom', f.name, { validate: (x) => this.validName(x, f.id) });
    if (!v) return;
    this.workspace.rename(f.id, v);
    this.renderEditorTabs();
  }

  async deleteFile(f) {
    if (!(await confirmDialog('Supprimer le fichier', `Supprimer définitivement « ${f.name} » de l'espace de travail ?`, { okLabel: 'Supprimer', danger: true }))) return;
    const e = this.editors.get(f.id);
    if (e) { e.editor.dispose(); this.editors.delete(f.id); }
    if (this.loaded && this.loaded.id === f.id) this.loaded = null;
    this.workspace.remove(f.id);
    if (this.activeId === f.id) {
      this.activeId = null;
      const next = this.workspace.openIds[0];
      if (next) this.activate(next); else this.showEmptyEditor(true);
    }
    this.renderEditorTabs();
  }

  async newFileDialog() {
    let kind = 'cpu';
    const name = h('input', { class: 'input', type: 'text', value: this.workspace.uniqueName('programme.cmp'), spellcheck: 'false', autofocus: true });
    const err = h('div', { class: 'field-error' });
    const kinds = segmented([['cpu', 'Programme CPU'], ['pp', 'Programme PP'], ['text', 'Texte XTEXT']], kind, (v) => {
      kind = v;
      const base = name.value.replace(/\.[^.]*$/, '');
      name.value = this.workspace.uniqueName(`${base}${v === 'text' ? '.txt' : '.cmp'}`);
    });
    const ok = await openDialog({
      title: 'Nouveau fichier', width: 460,
      body: h('div', { class: 'form' }, field('Type', kinds), field('Nom', name, 'Extension .cmp pour un programme, .txt pour un texte appelé par XTEXT.'), err),
      buttons: [{ label: 'Annuler', value: false }, {
        label: 'Créer', kind: 'primary',
        action: () => { const m = this.validName(name.value.trim()); if (m) { err.textContent = m; return false; } return true; },
      }],
      onOpen: () => { name.focus(); name.setSelectionRange(0, name.value.lastIndexOf('.') >>> 0); },
    });
    if (!ok) return;
    const f = this.workspace.create({ name: name.value.trim(), content: TEMPLATES[kind] });
    this.openFile(f.id);
  }

  async importFiles() {
    const files = await pickFiles({ accept: '.cmp,.txt,.cmps,.asm,.src,.text', multiple: true });
    for (const x of files) {
      const f = this.workspace.create({ name: x.name, content: x.text.replace(/\r\n?/g, '\n') });
      this.openFile(f.id);
      this.log(`Fichier importé : ${f.name}`);
    }
  }

  exportFile() {
    const f = this.activeFile();
    if (!f) return;
    download(f.name, this.textOf(f.id));
  }

  save() {
    const f = this.activeFile();
    const ed = this.activeEditor();
    if (!f || !ed) return;
    const ok = this.workspace.save(f.id, ed.getValue());
    this.renderEditorTabs();
    this.renderFiles();
    toast(ok ? `« ${f.name} » enregistré` : 'Enregistré en mémoire seulement (stockage indisponible)', ok ? 'ok' : 'warn', 1800);
  }

  onEdit(id) {
    const e = this.editors.get(id);
    if (!e) return;
    if (!this.draftSavers) this.draftSavers = new Map();
    let saver = this.draftSavers.get(id);
    if (!saver) {
      saver = debounce(() => { const x = this.editors.get(id); if (x) this.workspace.setDraft(id, x.editor.getValue()); this.renderFiles(); }, 800);
      this.draftSavers.set(id, saver);
    }
    saver();
    const wasMod = this.editorTabs.querySelector('.etab.active.modified');
    if (!wasMod) this.renderEditorTabs();
    if (this.settings.autoAssemble && id === this.activeId) {
      if (!this.autoAsm) this.autoAsm = debounce(() => this.assembleCurrent(false), 700);
      this.autoAsm();
    }
    this.updateStatus();
  }

  onBreakpoints(id, set) {
    this.workspace.setBreakpoints(id, set);
    if (this.loaded && this.loaded.id === id) {
      const r = this.runner.setSourceBreakpoints(set);
      if (r.unresolved.length) this.log(`Points d'arrêt sans code généré (ignorés) : lignes ${r.unresolved.join(', ')}.`, 'warn');
    }
  }

  // ------------------------------------------------------------ exemples

  async loadExamples() {
    const emb = globalThis.__CDC_EMBEDDED__ && globalThis.__CDC_EMBEDDED__.examples;
    try {
      if (emb) this.examples = emb.index;
      else {
        const r = await fetch('examples/index.json', { cache: 'no-cache' });
        this.examples = await r.json();
      }
    } catch {
      this.examples = [];
    }
    this.renderExamples();
    for (const ex of this.examples.filter((x) => x.kind === 'text')) {
      const t = await this.exampleText(ex.file);
      if (t !== null) this.exampleTexts[compassName(ex.file)] = t;
    }
    if (!this.workspace.files.length && this.examples.length) {
      // Premier lancement : l'exemple de la console est ouvert.
      await this.openExample(this.examples.find((x) => x.file === 'pp-console.cmp') || this.examples[0], { quiet: true });
    } else if (!this.activeId) this.showEmptyEditor(true);
  }

  async exampleText(file) {
    const emb = globalThis.__CDC_EMBEDDED__ && globalThis.__CDC_EMBEDDED__.examples;
    if (emb) return emb.files[file] ?? null;
    try {
      const r = await fetch(`examples/${file}`, { cache: 'no-cache' });
      return r.ok ? await r.text() : null;
    } catch {
      return null;
    }
  }

  renderExamples() {
    const L = this.exampleList;
    L.textContent = '';
    if (!this.examples.length) L.append(h('div', { class: 'side-empty' }, 'Exemples indisponibles.'));
    for (const ex of this.examples) {
      L.append(h('div', { class: 'file example', role: 'button', tabindex: '0', 'data-tip': ex.description, onclick: () => this.openExample(ex), onkeydown: (e) => { if (e.key === 'Enter') this.openExample(ex); } },
        icon(ex.kind === 'text' ? 'fileText' : 'file', 15),
        h('span', { class: 'file-name' }, ex.title),
        h('span', { class: `file-tag tag-${String(ex.mode).toLowerCase()}` }, ex.mode)));
    }
  }

  async openExample(ex, { quiet = false } = {}) {
    if (!ex) return;
    const existing = this.workspace.files.find((f) => f.example === ex.file);
    if (existing) { this.openFile(existing.id); return; }
    const text = await this.exampleText(ex.file);
    if (text === null) { toast(`Exemple introuvable : ${ex.file}`, 'error'); return; }
    const f = this.workspace.create({ name: ex.file, content: text, example: ex.file });
    this.openFile(f.id);
    if (!quiet) this.log(`Exemple ouvert : ${ex.title} (${ex.file}).`);
    if (ex.cards) this.loadExampleCards(ex);
  }

  /** Place le paquet de cartes d'un exemple dans le panneau et dans le lecteur. */
  loadExampleCards(ex) {
    this.settings.cardDeck = ex.cards.replace(/\n$/, '');
    this.saveSettings();
    this.periph.cards.deck.value = this.settings.cardDeck;
    const r = this.machine.cardReader;
    r.hopper.length = 0;
    r.card = null;
    r.loadDeck(ex.cards, this.settings.cardCode || '029');
    this.log(`Paquet de l'exemple chargé dans le lecteur 405 (${r.hopper.length} cartes).`, 'ok');
    this.periph.update(true);
  }

  // ---------------------------------------------------------- assemblage

  /** Assemble le fichier actif. Retourne le résultat (ou null). */
  assembleCurrent(showPanel = true) {
    const f = this.activeFile();
    const ed = this.activeEditor();
    if (!f || !ed) { toast('Aucun fichier ouvert.', 'warn'); return null; }
    const text = ed.getValue();
    const name = compassName(f.name);
    const texts = { ...this.exampleTexts, ...this.workspace.texts(f.id) };
    for (const [id, e] of this.editors) if (id !== f.id) texts[compassName(e.file.name)] = e.editor.getValue();
    const t0 = performance.now();
    let r;
    try {
      r = assemble(text, { fileName: name, texts, date: new Date() });
    } catch (e) {
      r = { ok: false, errors: [{ line: 0, file: name, flag: '!', fatal: true, message: `Erreur interne de l'assembleur : ${e.message}` }], listing: '', lines: [], symbols: [], programs: [] };
      console.error(e);
    }
    const ms = performance.now() - t0;
    r.fileName = name;
    this.result = r;
    this.assembled = { id: f.id, text };
    const mine = (r.errors || []).filter((e) => !e.file || e.file === name);
    ed.setMarkers(mine);
    const fatal = (r.errors || []).filter((e) => e.fatal).length;
    const warn = (r.errors || []).length - fatal;
    const lines = text.split('\n').length;
    const info = `${lines} lignes en ${ms.toFixed(0)} ms`;
    this.problems.show(r, info);
    this.listing.show(r);
    this.symbols.show(r);
    this.map.show(r, this.loaded ? this.runner : null);
    this.bottomTabs.setBadge('problems', fatal ? String(fatal) : warn ? String(warn) : '', fatal ? 'error' : 'warn');
    const msg = fatal ? `${fatal} erreur${fatal > 1 ? 's' : ''}, ${warn} avertissement${warn > 1 ? 's' : ''}` : `assemblage réussi${warn ? `, ${warn} avertissement${warn > 1 ? 's' : ''}` : ''}`;
    this.log(`${f.name} : ${msg} (${info}).`, fatal ? 'error' : warn ? 'warn' : 'ok');
    if (showPanel) {
      if (fatal || warn) this.bottomTabs.select('problems');
      toast(`${f.name} : ${msg}`, fatal ? 'error' : warn ? 'warn' : 'ok', 2200);
    }
    this.updateStatus();
    return r;
  }

  // ------------------------------------------------------------ exécution

  isStale() {
    if (!this.loaded) return true;
    if (this.loaded.mode === 'deadstart') return this.settings.mode !== 'deadstart';
    if (this.settings.mode === 'deadstart') return true;
    return this.loaded.text !== this.textOf(this.loaded.id);
  }

  /** Assemble si nécessaire puis charge dans la machine. */
  async load() {
    this.controller.halt();
    const mode = this.settings.mode;
    if (mode === 'deadstart') return this.runDeadstart(this.settings.deadstart, false);
    const f = this.activeFile();
    if (!f) { toast('Ouvrez d\'abord un programme.', 'warn'); return false; }
    let r = this.result;
    if (!r || !this.assembled || this.assembled.id !== f.id || this.assembled.text !== this.textOf(f.id)) r = this.assembleCurrent(false);
    if (!r) return false;
    const fatal = (r.errors || []).filter((e) => e.fatal);
    if (fatal.length || !r.ok) {
      this.bottomTabs.select('problems');
      toast(`Chargement impossible : ${fatal.length} erreur${fatal.length > 1 ? 's' : ''} d'assemblage`, 'error');
      if (fatal[0] && fatal[0].line) this.revealSource(fatal[0].line, fatal[0].file);
      return false;
    }
    this.runner.options = { ...this.runner.options, ...this.runnerOptions() };
    const ex = f.example && this.examples.find((x) => x.file === f.example);
    if (ex && ex.cards && !this.machine.cardReader.hopper.length && !this.machine.cardReader.card) this.loadExampleCards(ex);
    let res;
    try {
      res = await this.runner.load(r, { ...this.runnerOptions(), fileName: r.fileName });
    } catch (e) {
      console.error(e);
      res = { ok: false, message: `Erreur au chargement : ${e.message}` };
    }
    if (!res.ok) {
      toast(res.message, 'error');
      this.log(res.message, 'error');
      return false;
    }
    this.loaded = { id: f.id, text: this.assembled.text, mode: res.mode };
    const bps = this.editors.get(f.id) ? this.editors.get(f.id).editor.breakpoints : new Set(f.breakpoints);
    const b = this.runner.setSourceBreakpoints(bps);
    this.controller.ready();
    this.cpuPanel.mark();
    this.log(res.message, 'ok');
    for (const w of res.warnings || []) this.log(`Chargeur : ${w}`, 'warn');
    if (b.unresolved.length) this.log(`Points d'arrêt sans code généré (ignorés) : lignes ${b.unresolved.join(', ')}.`, 'warn');
    this.map.show(r, this.runner);
    this.memPanel.resize();
    if (res.mode === 'pp' && this.rightTabs.active === 'cpu') this.rightTabs.select('pp');
    if (res.mode === 'systape') this.log('La bande système est montée sur l’unité 0 (exportable depuis Périphériques > Bandes).');
    if ((res.mode === 'system' || res.mode === 'systape') && !['console', 'journal', 'cpu', 'periph'].includes(this.rightTabs.active)) this.rightTabs.select('console');
    this.renderFiles();
    this.showExecLine();
    this.refresh(true);
    return true;
  }

  async run() {
    const c = this.controller;
    if (c.state === 'running') return;
    if ((c.state === 'paused' || c.state === 'ready') && this.loaded && !(c.state === 'ready' && this.isStale())) {
      this.cpuPanel.mark();
      this.setExecLine(null);
      c.run();
      return;
    }
    if (await this.load()) {
      this.cpuPanel.mark();
      this.setExecLine(null);
      c.run();
    }
  }

  async reload() {
    if (await this.load()) toast('Programme rechargé', 'info', 1500);
  }

  async ensureLoaded() {
    if (this.loaded && this.controller.state !== 'idle') return true;
    return this.load();
  }

  async stepCPU() {
    if (!(await this.ensureLoaded())) return;
    this.cpuPanel.mark();
    this.controller.stepCPU();
    this.showExecLine();
    this.refresh(true);
  }

  async stepPP(n = null) {
    if (!(await this.ensureLoaded())) return;
    const pp = n ?? (this.rightTabs.active === 'pp' ? this.ppPanel.sel : this.runner.ppNumber);
    this.controller.stepPP(pp);
    this.showExecLine();
    this.refresh(true);
  }

  /** Deadstart avec les mots du panneau, puis marche. */
  async runDeadstart(words, start = true) {
    this.controller.halt();
    const res = await this.runner.load(null, { mode: 'deadstart', deadstart: words });
    this.loaded = { id: null, text: null, mode: 'deadstart' };
    this.controller.ready();
    this.cpuPanel.mark();
    this.log(res.message, 'ok');
    this.map.show(this.result, this.runner);
    this.setExecLine(null);
    this.renderFiles();
    if (start) {
      if (this.rightTabs.active !== 'console' && this.rightTabs.active !== 'deadstart') this.rightTabs.select('console');
      this.controller.run();
    }
    this.refresh(true);
    return true;
  }

  onFrame(info) {
    const now = performance.now();
    const running = info.state === 'running';
    // la console est redessinée à chaque image ; les autres panneaux ~8 fois par seconde
    if (this.rightTabs.active === 'console') this.consolePanel.update();
    if (!running || now - this.lastPanelUpdate > 120) {
      this.lastPanelUpdate = now;
      for (const p of this.rightPanels) if (p !== this.consolePanel) p.update();
    }
    if (!running || now - (this.lastStatus || 0) > 200) {
      this.lastStatus = now;
      this.updateStatus();
    }
  }

  onStop(stop, text) {
    const err = stop.reason === 'cpustop' && stop.error || stop.reason === 'error';
    const kind = err || (stop.reason === 'jobend' && stop.status === 'abort') ? 'error' : stop.reason === 'cpustop' || stop.reason === 'jobend' ? 'ok' : 'warn';
    this.log(text, kind);
    toast(text, kind, 3000);
    this.showExecLine(err);
    this.refresh(true);
  }

  onState() {
    this.updateToolbar();
    this.updateStatus();
  }

  /** Surligne la ligne source de l'emplacement courant d'exécution. */
  showExecLine(isError = false) {
    if (!this.loaded || !this.loaded.id) { this.setExecLine(null); return; }
    let loc = this.runner.currentLocation();
    if (isError) loc = this.runner.lastCpuLocation() || loc;
    const line = loc && loc.line;
    const e = this.editors.get(this.loaded.id);
    for (const [id, x] of this.editors) if (id !== this.loaded.id) x.editor.setExecLine(null);
    if (!e) return;
    if (line && this.activeId !== this.loaded.id) this.activate(this.loaded.id);
    e.editor.setExecLine(line || null, { kind: isError ? 'error' : 'exec' });
  }

  setExecLine(line) {
    for (const x of this.editors.values()) x.editor.setExecLine(line);
  }

  refresh(force = false) {
    for (const p of this.rightPanels) p.update(false);
    if (force) {
      const a = this.rightTabs.activePanel();
      if (a && a.update) a.update(true);
    }
    this.updateStatus();
  }

  // ---------------------------------------------------------- navigation

  revealSource(line, file = null) {
    let id = this.activeId;
    if (file) {
      const cur = this.activeFile();
      if (!cur || compassName(cur.name) !== file) {
        const f = this.workspace.files.find((x) => compassName(x.name) === file);
        if (f) id = f.id;
        else if (this.loaded && this.loaded.id) id = this.loaded.id;
      }
    }
    if (!id) return;
    if (id !== this.activeId) this.activate(id);
    const ed = this.editors.get(id).editor;
    ed.revealLine(line, { select: true });
  }

  async gotoLineDialog() {
    const ed = this.activeEditor();
    if (!ed) return;
    const v = await promptDialog('Aller à la ligne', `Numéro de ligne (1 à ${ed.lineCount})`, String(ed.cursor().line), {
      validate: (x) => (/^\d+$/.test(x) && +x >= 1 && +x <= ed.lineCount ? null : 'Numéro de ligne invalide.'),
    });
    if (v) ed.revealLine(Number(v));
  }

  setAutoUpper(on) {
    this.settings.autoUpper = on;
    this.saveSettings();
    for (const x of this.editors.values()) x.editor.setAutoUpper(on);
    this.updateStatus();
    toast(on ? 'Majuscules automatiques activées' : 'Majuscules automatiques désactivées', 'info', 1500);
  }

  // -------------------------------------------------------- état et barres

  updateToolbar() {
    const s = this.controller.state;
    const running = s === 'running';
    this.btn.run.classList.toggle('active', running);
    this.btn.run.disabled = running;
    this.btn.pause.disabled = !running;
    const label = this.btn.run.querySelector('.btn-label');
    if (label) label.textContent = s === 'paused' ? 'Continuer' : 'Exécuter';
    this.btn.run.dataset.tip = s === 'paused' ? 'Continuer (F5)' : 'Assembler, charger et exécuter (F5)';
  }

  updateCursor(ed) {
    const c = ed.cursor();
    const field = c.col <= 10 ? 'location' : c.col <= 17 ? 'opération' : c.col <= 29 ? 'variable' : c.col <= 72 ? 'commentaire' : 'séquence';
    this.st.cursor.textContent = `Lg ${c.line}, Col ${c.col}${c.selection ? ` (${c.selection} sél.)` : ''} · ${field}`;
    this.st.cursor.classList.toggle('beyond', c.col > 72);
  }

  updateStatus() {
    const S = this.st;
    if (!S) return;
    const c = this.controller;
    const m = this.machine;
    const labels = { idle: 'Aucun programme', ready: 'Prêt', running: 'En marche', paused: 'En pause', stopped: 'Arrêté' };
    let label = labels[c.state] || c.state;
    let cls = c.state;
    if (c.state === 'stopped' && c.lastStop && (c.lastStop.error || c.lastStop.reason === 'error')) { label = 'Sortie d\'erreur'; cls = 'error'; }
    S.state.className = `sb-item sb-state st-${cls}`;
    S.state.innerHTML = '';
    S.state.append(h('span', { class: 'sb-dot' }), label);
    const mode = this.loaded ? RUN_MODES[this.loaded.mode] || this.loaded.mode : RUN_MODES[this.settings.mode];
    S.mode.textContent = `${(MODELS[m.cpu.model] || {}).name || ''} · ${mode}${this.runner.kind === 'pp' ? ` · PP${o(this.runner.ppNumber, 2)}` : ''}`;
    S.time.textContent = fmtTime(m.time);
    const st = c.stats;
    S.mips.textContent = c.state === 'running'
      ? `${st.mips >= 0.01 ? `${st.mips.toFixed(2).replace('.', ',')} MIPS CPU` : `${(st.ppMips).toFixed(2).replace('.', ',')} MIPS PP`} · × ${st.ratio.toFixed(st.ratio < 1 ? 3 : 2).replace('.', ',')}`
      : `${m.cpu.instructions.toLocaleString('fr-FR')} instr. CPU`;
    const f = this.activeFile();
    if (this.result && this.assembled && f && this.assembled.id === f.id) {
      const fatal = (this.result.errors || []).filter((e) => e.fatal).length;
      const stale = this.assembled.text !== this.textOf(f.id);
      S.asm.className = `sb-item ${fatal ? 'sb-err' : ''}`;
      S.asm.textContent = fatal ? `${fatal} erreur${fatal > 1 ? 's' : ''}` : stale ? 'Assemblage à refaire' : 'Assemblé';
    } else {
      S.asm.className = 'sb-item dim';
      S.asm.textContent = f ? 'Non assemblé' : '';
    }
    S.store.textContent = f ? (f.kind === 'text' ? 'Texte XTEXT' : 'COMPASS') : '';
    S.upper.textContent = this.settings.autoUpper ? 'MAJ' : 'maj';
    S.upper.classList.toggle('on', this.settings.autoUpper);
    const ed = this.activeEditor();
    if (ed) this.updateCursor(ed); else S.cursor.textContent = '';
  }

  log(message, kind = 'info') {
    if (this.logPanel) this.logPanel.add(message, kind);
  }

  // ------------------------------------------------------------- dialogues

  async settingsDialog() {
    const s = { ...this.settings };
    const octIn = (v, w = 110) => h('input', { class: 'input mono', type: 'text', value: o(v), spellcheck: 'false', style: { width: `${w}px` } });
    const ra = octIn(s.ra), fl = octIn(s.fl), em = octIn(s.em);
    const ds = h('textarea', { class: 'input mono ds-text', rows: 3, spellcheck: 'false' });
    ds.value = (s.deadstart || []).map((w) => o(w, 4)).join(' ');
    const err = h('div', { class: 'field-error' });
    const cm = select([[String(0o100000), '32 768 mots (100000B)'], [String(0o200000), '65 536 mots (200000B)'], [String(0o400000), '131 072 mots (400000B)'], [String(0o1000000), '262 144 mots (1000000B)']], String(s.cmWords), (v) => { s.cmWords = Number(v); });
    const ecs = select([['0', 'Sans ECS'], [String(0o200000), '65 536 mots'], [String(0o400000), '131 072 mots'], [String(0o2000000), '524 288 mots']], String(s.ecsWords), (v) => { s.ecsWords = Number(v); });
    const model = select(Object.entries(MODELS).map(([k, v]) => [k, v.name]), s.model, (v) => { s.model = v; });
    const mode = select(Object.entries(RUN_MODES), s.mode, (v) => { s.mode = v; });
    const ppn = select([...Array(10).keys()].map((n) => [String(n), `PP${o(n, 2)}`]), String(s.ppNumber), (v) => { s.ppNumber = Number(v); });
    const theme = segmented([['auto', 'Système'], ['light', 'Clair'], ['dark', 'Sombre']], s.theme, (v) => { s.theme = v; });
    const font = select([11, 12, 13, 14, 15, 16, 18, 20].map((n) => [String(n), `${n} px`]), String(s.fontSize), (v) => { s.fontSize = Number(v); });
    const upper = toggle(s.autoUpper, (v) => { s.autoUpper = v; }, 'Majuscules automatiques');
    const auto = toggle(s.autoAssemble, (v) => { s.autoAssemble = v; }, 'Assembler pendant la frappe');
    const body = h('div', { class: 'form settings' },
      h('div', { class: 'form-sec' }, 'Machine'),
      h('div', { class: 'form-grid' },
        field('Modèle', model), field('Mémoire centrale', cm), field('ECS (mémoire étendue)', ecs)),
      h('div', { class: 'form-sec' }, 'Exécution'),
      h('div', { class: 'form-grid' },
        field('Mode', mode), field('PP du mode PP', ppn),
        field('RA (octal)', ra, 'Base du programme CPU'), field('FL (octal)', fl, '0 = jusqu\'à la fin de la mémoire'),
        field('EM (octal)', em, '70000B : sorties d\'erreur sur adresse, opérande infini et indéfini')),
      field('Panneau de deadstart (mots octaux, 16 au plus)', ds, `Panneau du mode « Système (deadstart sur bande) » : ${DEADSTART_PANEL.map((w) => o(w, 4)).join(' ')}`),
      h('div', { class: 'form-sec' }, 'Interface'),
      h('div', { class: 'form-grid' }, field('Thème', theme), field('Taille de police de l\'éditeur', font)),
      h('div', { class: 'form-row' }, upper, auto),
      err);
    const ok = await openDialog({
      title: 'Paramètres', body, width: 620,
      buttons: [{ label: 'Annuler', value: false }, {
        label: 'Appliquer', kind: 'primary',
        action: () => {
          const pr = parseOctal(ra.value), pf = parseOctal(fl.value), pe = parseOctal(em.value);
          if (pr === null || pf === null || pe === null) { err.textContent = 'RA, FL et EM doivent être des nombres octaux.'; return false; }
          const words = ds.value.trim() ? ds.value.trim().split(/[\s,]+/).map((x) => parseOctal(x)) : [];
          if (words.some((w) => w === null || w > 0o7777n) || words.length > 16) { err.textContent = 'Panneau : 16 mots octaux de 12 bits au plus.'; return false; }
          if (Number(pr) >= s.cmWords) { err.textContent = 'RA dépasse la taille de la mémoire.'; return false; }
          s.ra = Number(pr); s.fl = Number(pf); s.em = Number(pe);
          s.deadstart = words.map(Number);
          return true;
        },
      }],
    });
    if (!ok) return;
    const machineChanged = s.model !== this.settings.model || s.cmWords !== this.settings.cmWords || s.ecsWords !== this.settings.ecsWords;
    this.settings = s;
    this.saveSettings();
    this.applyTheme();
    this.modeSel.value = s.mode;
    this.runner.options = { ...this.runner.options, ...this.runnerOptions() };
    for (const x of this.editors.values()) { x.editor.setFontSize(s.fontSize); x.editor.setAutoUpper(s.autoUpper); }
    this.dsPanel.words = s.deadstart.slice();
    while (this.dsPanel.words.length < 16) this.dsPanel.words.push(0);
    this.dsPanel.render();
    if (machineChanged) {
      this.rebuildMachine();
      this.log(`Machine reconfigurée : ${MODELS[s.model].name}, ${s.cmWords} mots de mémoire centrale.`);
    } else this.loaded = this.loaded && { ...this.loaded, text: null };
    this.updateStatus();
    toast('Paramètres appliqués', 'ok', 1500);
  }

  shortcutsDialog() {
    const rows = SHORTCUTS.map(([k, d]) => h('tr', null, h('td', null, ...k.split(' / ').flatMap((part, i) => [i ? ' / ' : null, ...part.split('+').flatMap((x, j) => [j ? '+' : null, h('kbd', null, x)])]).filter(Boolean)), h('td', null, d)));
    openDialog({
      title: 'Raccourcis clavier', width: 560,
      body: h('div', null, h('table', { class: 'grid-table keys' }, h('tbody', null, ...rows)),
        h('p', { class: 'dim small' }, 'La documentation complète (instructions CPU et PP, pseudo-instructions, code display, périphériques) est dans l\'onglet Documentation.')),
      buttons: [{ label: 'Documentation', value: 'doc' }, { label: 'Fermer', kind: 'primary', value: true }],
    }).then((v) => { if (v === 'doc') this.rightTabs.select('docs'); });
  }

  // ------------------------------------------------------------- clavier

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (dialogIsOpen()) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      const run = (fn) => { e.preventDefault(); e.stopPropagation(); hideTip(); fn(); };
      if (k === 'F1') return run(() => this.shortcutsDialog());
      if (k === 'F5' && ctrl && e.shiftKey) return run(() => this.reload());
      if (k === 'F5') return run(() => this.run());
      if (k === 'F6') return run(() => this.controller.pause());
      if (k === 'F7' || (ctrl && !e.shiftKey && k.toLowerCase() === 'b')) return run(() => this.assembleCurrent(true));
      if (k === 'F9') return run(() => { const ed = this.activeEditor(); if (ed) ed.toggleBreakpoint(ed.cursor().line); });
      if (k === 'F10' && e.shiftKey) return run(() => this.stepPP());
      if (k === 'F10') return run(() => this.stepCPU());
      if (k === 'F11') return run(() => this.stepPP());
      if (ctrl && k.toLowerCase() === 's') return run(() => this.save());
      if (ctrl && !e.shiftKey && k.toLowerCase() === 'o') return run(() => this.importFiles());
      if (ctrl && e.altKey && k.toLowerCase() === 'n') return run(() => this.newFileDialog());
      if (ctrl && !e.shiftKey && k.toLowerCase() === 'n' && document.activeElement && document.activeElement.classList.contains('ed-input')) return run(() => this.newFileDialog());
      if (ctrl && k.toLowerCase() === 'g' && !document.activeElement.classList.contains('ed-input')) return run(() => this.gotoLineDialog());
      return undefined;
    }, true);
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme());
  }
}

/** Démarrage (le module ne touche au DOM qu'ici). */
export function start() {
  const app = new App();
  globalThis.__atelier = app;
  return app;
}

if (typeof document !== 'undefined' && document.getElementById('toolbar')) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}

