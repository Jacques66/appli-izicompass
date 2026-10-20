// Rendu de la console 6612 : deux écrans cathodiques côte à côte.
//
// Chaque écran a un espace de coordonnées de 512 x 512 (9 bits) ; Y croît vers
// le haut. Les caractères sont tracés avec une police vectorielle (comme le
// générateur de caractères de la console) en trois tailles : petite (8 points),
// moyenne (16) et grande (32), ou en mode points. La rémanence du luminophore
// est simulée : un tracé non rafraîchi s'estompe avec son âge.

import { DISPLAY_CDC } from '../src/common/charset.js';

// Police vectorielle : polylignes sur une grille de 4 x 6 (y vers le bas).
const G = {
  A: [[0, 6, 0, 2, 2, 0, 4, 2, 4, 6], [0, 4, 4, 4]],
  B: [[0, 6, 0, 0, 3, 0, 4, 1, 4, 2, 3, 3, 0, 3], [3, 3, 4, 4, 4, 5, 3, 6, 0, 6]],
  C: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3, 6, 4, 5]],
  D: [[0, 0, 0, 6, 3, 6, 4, 5, 4, 1, 3, 0, 0, 0]],
  E: [[4, 0, 0, 0, 0, 6, 4, 6], [0, 3, 3, 3]],
  F: [[4, 0, 0, 0, 0, 6], [0, 3, 3, 3]],
  G: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3, 6, 4, 5, 4, 3, 2, 3]],
  H: [[0, 0, 0, 6], [4, 0, 4, 6], [0, 3, 4, 3]],
  I: [[1, 0, 3, 0], [2, 0, 2, 6], [1, 6, 3, 6]],
  J: [[4, 0, 4, 5, 3, 6, 1, 6, 0, 5]],
  K: [[0, 0, 0, 6], [4, 0, 0, 4], [1, 3, 4, 6]],
  L: [[0, 0, 0, 6, 4, 6]],
  M: [[0, 6, 0, 0, 2, 3, 4, 0, 4, 6]],
  N: [[0, 6, 0, 0, 4, 6, 4, 0]],
  O: [[1, 0, 3, 0, 4, 1, 4, 5, 3, 6, 1, 6, 0, 5, 0, 1, 1, 0]],
  P: [[0, 6, 0, 0, 3, 0, 4, 1, 4, 2, 3, 3, 0, 3]],
  Q: [[1, 0, 3, 0, 4, 1, 4, 5, 3, 6, 1, 6, 0, 5, 0, 1, 1, 0], [2, 4, 4, 6]],
  R: [[0, 6, 0, 0, 3, 0, 4, 1, 4, 2, 3, 3, 0, 3], [2, 3, 4, 6]],
  S: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 2, 1, 3, 3, 3, 4, 4, 4, 5, 3, 6, 1, 6, 0, 5]],
  T: [[0, 0, 4, 0], [2, 0, 2, 6]],
  U: [[0, 0, 0, 5, 1, 6, 3, 6, 4, 5, 4, 0]],
  V: [[0, 0, 2, 6, 4, 0]],
  W: [[0, 0, 1, 6, 2, 3, 3, 6, 4, 0]],
  X: [[0, 0, 4, 6], [4, 0, 0, 6]],
  Y: [[0, 0, 2, 3, 4, 0], [2, 3, 2, 6]],
  Z: [[0, 0, 4, 0, 0, 6, 4, 6]],
  0: [[1, 0, 3, 0, 4, 1, 4, 5, 3, 6, 1, 6, 0, 5, 0, 1, 1, 0], [3.5, 0.8, 0.5, 5.2]],
  1: [[1, 1, 2, 0, 2, 6], [1, 6, 3, 6]],
  2: [[0, 1, 1, 0, 3, 0, 4, 1, 4, 2, 0, 6, 4, 6]],
  3: [[0, 1, 1, 0, 3, 0, 4, 1, 4, 2, 3, 3, 1, 3], [3, 3, 4, 4, 4, 5, 3, 6, 1, 6, 0, 5]],
  4: [[3, 6, 3, 0, 0, 4, 4, 4]],
  5: [[4, 0, 0, 0, 0, 3, 3, 3, 4, 4, 4, 5, 3, 6, 0, 6]],
  6: [[3, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3, 6, 4, 5, 4, 4, 3, 3, 0, 3]],
  7: [[0, 0, 4, 0, 1, 6]],
  8: [[1, 0, 3, 0, 4, 1, 4, 2, 3, 3, 1, 3, 0, 2, 0, 1, 1, 0], [1, 3, 0, 4, 0, 5, 1, 6, 3, 6, 4, 5, 4, 4, 3, 3]],
  9: [[4, 3, 1, 3, 0, 2, 0, 1, 1, 0, 3, 0, 4, 1, 4, 5, 3, 6, 1, 6]],
  '+': [[2, 1, 2, 5], [0, 3, 4, 3]],
  '-': [[0, 3, 4, 3]],
  '*': [[2, 1, 2, 5], [0, 2, 4, 4], [0, 4, 4, 2]],
  '/': [[4, 0, 0, 6]],
  '(': [[3, 0, 1.5, 1.5, 1.5, 4.5, 3, 6]],
  ')': [[1, 0, 2.5, 1.5, 2.5, 4.5, 1, 6]],
  $: [[4, 1, 1, 1, 0, 2, 1, 3, 3, 3, 4, 4, 3, 5, 0, 5], [2, 0, 2, 6]],
  '=': [[0, 2, 4, 2], [0, 4, 4, 4]],
  ' ': [],
  ',': [[2, 5, 2, 6, 1, 7]],
  '.': [[1.7, 5.6, 2.3, 5.6, 2.3, 6, 1.7, 6, 1.7, 5.6]],
  '≡': [[0, 1.5, 4, 1.5], [0, 3, 4, 3], [0, 4.5, 4, 4.5]],
  '[': [[3, 0, 1, 0, 1, 6, 3, 6]],
  ']': [[1, 0, 3, 0, 3, 6, 1, 6]],
  '%': [[0, 6, 4, 0], [0.5, 0.5, 1.5, 0.5, 1.5, 1.5, 0.5, 1.5, 0.5, 0.5], [2.5, 4.5, 3.5, 4.5, 3.5, 5.5, 2.5, 5.5, 2.5, 4.5]],
  '≠': [[0, 2, 4, 2], [0, 4, 4, 4], [3, 0.5, 1, 5.5]],
  '→': [[0, 3, 4, 3], [2, 1, 4, 3, 2, 5]],
  '∨': [[0, 1, 2, 5, 4, 1]],
  '∧': [[0, 5, 2, 1, 4, 5]],
  '↑': [[2, 6, 2, 0], [0, 2, 2, 0, 4, 2]],
  '↓': [[2, 0, 2, 6], [0, 4, 2, 6, 4, 4]],
  '<': [[4, 0, 0, 3, 4, 6]],
  '>': [[0, 0, 4, 3, 0, 6]],
  '≤': [[4, 0, 0, 2.5, 4, 5], [0, 6, 4, 6]],
  '≥': [[0, 0, 4, 2.5, 0, 5], [0, 6, 4, 6]],
  '¬': [[0, 2, 4, 2, 4, 4]],
  ';': [[2, 1.5, 2, 2.2], [2, 4.5, 2, 5.5, 1, 6.5]],
  ':': [[2, 1.5, 2, 2.2], [2, 4.6, 2, 5.3]],
};

/** Polylignes du glyphe d'un code display (0-63). */
const GLYPHS = [];
for (let i = 0; i < 64; i++) GLYPHS.push(G[DISPLAY_CDC[i]] || []);

const PHOSPHORS = {
  green: { core: '#c8ffd9', glow: 'rgba(60, 255, 140, 0.95)', tint: '#0b1a12', dim: 'rgba(80, 255, 150, ', label: 'Vert (P31)' },
  blue: { core: '#e4f1ff', glow: 'rgba(110, 180, 255, 0.95)', tint: '#0a1220', dim: 'rgba(130, 190, 255, ', label: 'Bleu' },
  amber: { core: '#ffeccc', glow: 'rgba(255, 176, 64, 0.95)', tint: '#1c1408', dim: 'rgba(255, 180, 80, ', label: 'Ambre' },
};
export const PHOSPHOR_NAMES = Object.fromEntries(Object.entries(PHOSPHORS).map(([k, v]) => [k, v.label]));

const INCREMENT = [8, 16, 32, 1];

export class CrtConsole {
  constructor(canvas, { phosphor = 'green', persistence = 50000 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.phosphor = PHOSPHORS[phosphor] ? phosphor : 'green';
    this.persistence = persistence;
    this.view = 'both';         // both | left | right
    this.off = document.createElement('canvas');
    this.offCtx = this.off.getContext('2d');
    this.layout = null;
    this.filterOk = typeof this.ctx.filter === 'string';
  }

  setPhosphor(name) {
    if (PHOSPHORS[name]) this.phosphor = name;
  }

  setView(v) {
    this.view = v;
    this.layout = null;
  }

  /** Calcule les rectangles des écrans selon la taille du canevas. */
  computeLayout() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const W = Math.max(200, Math.round(rect.width));
    const screens = this.view === 'both' ? [0, 1] : [this.view === 'left' ? 0 : 1];
    const gap = 18, pad = 14;
    const S = Math.floor((W - pad * 2 - gap * (screens.length - 1)) / screens.length);
    const H = S + pad * 2 + 18;
    if (this.canvas.width !== W * dpr || this.canvas.height !== H * dpr) {
      this.canvas.width = W * dpr;
      this.canvas.height = H * dpr;
      this.canvas.style.height = `${H}px`;
    }
    this.off.width = this.canvas.width;
    this.off.height = this.canvas.height;
    this.layout = { W, H, S, dpr, screens: screens.map((s, i) => ({ id: s, x: pad + i * (S + gap), y: pad, size: S })) };
    return this.layout;
  }

  /** Dessine les tracés visibles. items : [{ s, sz, x, y, c, t }] ; now : temps simulé (µs). */
  draw(items, now) {
    const L = this.layout && this.layout.W === Math.round(this.canvas.getBoundingClientRect().width) ? this.layout : this.computeLayout();
    const { dpr } = L;
    const ph = PHOSPHORS[this.phosphor];
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.W, L.H);

    // Dédoublonnage : un caractère redessiné à la même place ne compte qu'une fois (le plus récent).
    const latest = new Map();
    for (const e of items) {
      const key = `${e.s}|${e.x}|${e.y}|${e.c}|${e.sz}`;
      const p = latest.get(key);
      if (!p || p.t < e.t) latest.set(key, e);
    }

    // Tracés nets sur le canevas hors écran, regroupés par niveau de luminosité.
    const off = this.offCtx;
    off.setTransform(dpr, 0, 0, dpr, 0, 0);
    off.clearRect(0, 0, L.W, L.H);
    const buckets = new Array(8).fill(null).map(() => []);
    const per = Math.max(1, this.persistence);
    for (const e of latest.values()) {
      const age = Math.max(0, now - e.t);
      const a = 1 - Math.min(1, age / per);
      const b = Math.min(7, Math.floor(a * 8));
      buckets[b].push(e);
    }
    for (const sc of L.screens) {
      off.save();
      off.beginPath();
      roundRect(off, sc.x, sc.y, sc.size, sc.size, sc.size * 0.07);
      off.clip();
      const k = sc.size / 512;
      for (let b = 0; b < 8; b++) {
        const list = buckets[b];
        if (!list.length) continue;
        off.globalAlpha = Math.pow((b + 1) / 8, 1.6);
        off.strokeStyle = ph.core;
        off.fillStyle = ph.core;
        off.lineCap = 'round';
        off.lineJoin = 'round';
        const dots = [];
        off.beginPath();
        let lw = 1;
        for (const e of list) {
          if (e.s !== sc.id) continue;
          if (e.c < 0 || e.sz === 3) { dots.push(e); continue; }
          const inc = INCREMENT[e.sz] * k;
          const gw = inc * 0.62, gh = inc * 0.82;
          const sx = gw / 4, sy = gh / 6;
          const ox = sc.x + e.x * k + inc * 0.16;
          const oy = sc.y + (511 - e.y) * k + inc * 0.06;
          lw = Math.max(0.7, inc * 0.085);
          for (const pl of GLYPHS[e.c & 0o77]) {
            off.moveTo(ox + pl[0] * sx, oy + pl[1] * sy);
            for (let i = 2; i < pl.length; i += 2) off.lineTo(ox + pl[i] * sx, oy + pl[i + 1] * sy);
          }
        }
        off.lineWidth = lw;
        off.stroke();
        for (const e of dots) {
          off.fillRect(sc.x + e.x * k - 0.6, sc.y + (511 - e.y) * k - 0.6, 1.4, 1.4);
        }
      }
      off.restore();
    }
    off.globalAlpha = 1;

    // Écrans : cadre, verre, puis luminophore (halo flou + tracé net).
    for (const sc of L.screens) this.drawBezel(ctx, sc, ph);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.filterOk) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = `blur(${3 * dpr}px)`;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(this.off, 0, 0);
      ctx.filter = `blur(${1 * dpr}px)`;
      ctx.globalAlpha = 0.8;
      ctx.drawImage(this.off, 0, 0);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.off, 0, 0);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    for (const sc of L.screens) this.drawGlass(ctx, sc);
  }

  drawBezel(ctx, sc, ph) {
    const r = sc.size * 0.07;
    // cadre extérieur
    ctx.save();
    const m = 7;
    const grad = ctx.createLinearGradient(0, sc.y - m, 0, sc.y + sc.size + m);
    grad.addColorStop(0, '#3a3d42');
    grad.addColorStop(1, '#202226');
    ctx.fillStyle = grad;
    ctx.beginPath();
    roundRect(ctx, sc.x - m, sc.y - m, sc.size + m * 2, sc.size + m * 2, r + m);
    ctx.fill();
    // verre
    const g = ctx.createRadialGradient(sc.x + sc.size / 2, sc.y + sc.size / 2, sc.size * 0.1, sc.x + sc.size / 2, sc.y + sc.size / 2, sc.size * 0.75);
    g.addColorStop(0, ph.tint);
    g.addColorStop(1, '#030504');
    ctx.fillStyle = g;
    ctx.beginPath();
    roundRect(ctx, sc.x, sc.y, sc.size, sc.size, r);
    ctx.fill();
    ctx.restore();
    // étiquette
    ctx.save();
    ctx.fillStyle = 'rgba(160, 168, 180, 0.75)';
    ctx.font = '600 10px system-ui, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(sc.id === 0 ? 'ÉCRAN GAUCHE' : 'ÉCRAN DROIT', sc.x + sc.size / 2, sc.y + sc.size + 20);
    ctx.restore();
  }

  drawGlass(ctx, sc) {
    const r = sc.size * 0.07;
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, sc.x, sc.y, sc.size, sc.size, r);
    ctx.clip();
    // reflet
    const g = ctx.createLinearGradient(sc.x, sc.y, sc.x + sc.size * 0.6, sc.y + sc.size * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0.07)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(sc.x, sc.y, sc.size, sc.size);
    // vignettage
    const v = ctx.createRadialGradient(sc.x + sc.size / 2, sc.y + sc.size / 2, sc.size * 0.35, sc.x + sc.size / 2, sc.y + sc.size / 2, sc.size * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(sc.x, sc.y, sc.size, sc.size);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    roundRect(ctx, sc.x, sc.y, sc.size, sc.size, r);
    ctx.stroke();
    ctx.restore();
  }

  /** Écran (0/1) et coordonnées 6612 sous un point du canevas, ou null. */
  hitTest(clientX, clientY) {
    const L = this.layout;
    if (!L) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    for (const sc of L.screens) {
      if (x >= sc.x && x < sc.x + sc.size && y >= sc.y && y < sc.y + sc.size) {
        const k = 512 / sc.size;
        return { screen: sc.id, x: Math.floor((x - sc.x) * k), y: 511 - Math.floor((y - sc.y) * k) };
      }
    }
    return null;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
