// Original 6000 series peripherals:
// deadstart panel, 6612 console, 405 card reader, 1612 line printer,
// 607 tape unit, real-time clock (channel 14).

import { Device, FC_ACCEPTED, FC_DECLINED, FC_PROCESSED } from './channel.js';
import { DISPLAY, displayToExtBcd, EXT_BCD, lineToCard, CARD_EOR, CARD_EOF, toDisplay } from '../common/charset.js';

const M12 = 0o7777;

// ------------------------------------------------------------ deadstart

/** Deadstart panel: sends its words (12 switches each) on channel 0. */
export class DeadstartPanel extends Device {
  constructor(words) {
    super('deadstart');
    this.words = words.slice();
    this.seq = 0;
  }
  func() { return FC_DECLINED; }
  io() {
    const ch = this.channel;
    if (ch.full) return;
    if (this.seq >= this.words.length) {
      ch.active = false;
    } else {
      ch.data = this.words[this.seq++] & M12;
      ch.full = true;
    }
  }
}

// ---------------------------------------------------------- console 6612

export const FC6612 = {
  SEL64_LEFT: 0o7000, SEL32_LEFT: 0o7001, SEL16_LEFT: 0o7002, SELDOT_LEFT: 0o7010,
  SEL64_RIGHT: 0o7100, SEL32_RIGHT: 0o7101, SEL16_RIGHT: 0o7102, SELDOT_RIGHT: 0o7110,
  KEYIN: 0o7020,
};

/**
 * 6612 dual-screen console. The PP refreshes the screens continuously:
 * words 60xx-67xx = X coordinate, 70xx-77xx = Y coordinate (9 bits),
 * otherwise two display characters. Each plotted character is kept with the
 * time it was plotted; the IDE shows only recent plots (CRT persistence).
 */
export class Console6612 extends Device {
  constructor() {
    super('console 6612');
    this.reset();
  }
  reset() {
    this.screen = 0;      // 0 left, 1 right
    this.size = 0;        // 0 small (64 char./line), 1 medium (32), 2 large (16), 3 dots
    this.x = 0;
    this.y = 0;
    this.keys = [];       // key queue (display codes)
    this.trace = [];      // { s, sz, x, y, c, t }
    this.maxTrace = 20000;
    this.fcode = 0;
    this.frameCount = 0;
  }
  increment() {
    return [8, 16, 32, 1][this.size];
  }
  func(code) {
    switch (code) {
      case FC6612.SEL64_LEFT: this.screen = 0; this.size = 0; break;
      case FC6612.SEL32_LEFT: this.screen = 0; this.size = 1; break;
      case FC6612.SEL16_LEFT: this.screen = 0; this.size = 2; break;
      case FC6612.SELDOT_LEFT: this.screen = 0; this.size = 3; break;
      case FC6612.SEL64_RIGHT: this.screen = 1; this.size = 0; break;
      case FC6612.SEL32_RIGHT: this.screen = 1; this.size = 1; break;
      case FC6612.SEL16_RIGHT: this.screen = 1; this.size = 2; break;
      case FC6612.SELDOT_RIGHT: this.screen = 1; this.size = 3; break;
      case FC6612.KEYIN: break;
      default: return FC_DECLINED;
    }
    this.fcode = code;
    return FC_ACCEPTED;
  }
  plot(c) {
    const t = this.machine ? this.machine.time : 0;
    this.trace.push({ s: this.screen, sz: this.size, x: this.x, y: this.y, c, t });
    if (this.trace.length > this.maxTrace) this.trace.splice(0, this.trace.length - this.maxTrace / 2);
    this.x = (this.x + this.increment()) & 0o777;
  }
  io() {
    const ch = this.channel;
    if (this.fcode === FC6612.KEYIN) {
      if (!ch.full) {
        ch.data = this.keys.length ? this.keys.shift() : 0;
        ch.full = true;
        this.fcode = 0;
      }
      return;
    }
    if (!ch.full) return;
    const w = ch.data;
    const hi = (w >> 6) & 0o77;
    if (hi >= 0o60) {
      if (hi >= 0o70) {
        this.y = w & 0o777;
        if (this.size === 3) this.plot(-1);
      } else {
        this.x = w & 0o777;
      }
    } else if (this.size !== 3) {
      this.plot(hi);
      this.plot(w & 0o77);
    }
    ch.full = false;
  }
  /** Keystroke (ASCII character or special code). */
  keyPress(ch) {
    let code;
    if (ch === '\n' || ch === 'Enter') code = 0o60;        // CR key
    else if (ch === '\b' || ch === 'Backspace') code = 0o61; // BKSP key
    else code = toDisplay(ch.toUpperCase());
    if (code > 0) this.keys.push(code);
  }
  /** Visible plots (persistence in simulated µs). */
  visible(now, persistence = 50000) {
    return this.trace.filter((e) => now - e.t <= persistence);
  }
}

// -------------------------------------------------- card reader 405

export const FC405 = { DESELECT: 0o700, GATE_SECONDARY: 0o701, READ: 0o702, STATUS: 0o704 };
export const ST405 = { READY: 0, NOT_READY: 1, EOF: 2, COMPARE_ERROR: 4 };

/** 405 card reader: each card = 80 columns of 12 bits (Hollerith). */
export class CardReader405 extends Device {
  constructor() {
    super('card reader 405');
    this.hopper = [];   // cards waiting (Uint16Array(80))
    this.card = null;
    this.col = 0;
    this.cardsRead = 0;
    this.delay = 0;
    this.code = '029';
  }
  /** Loads a card deck from text. Lines "7/8/9" and "6/7/8/9" = control cards. */
  loadDeck(text, code = this.code) {
    for (const raw of text.replace(/\r/g, '').split('\n')) {
      const line = raw.trimEnd();
      if (line === '7/8/9' || line === '~EOR') {
        const c = new Uint16Array(80); c[0] = CARD_EOR; this.hopper.push(c);
      } else if (line === '6/7/8/9' || line === '~EOF') {
        const c = new Uint16Array(80); c[0] = CARD_EOF; this.hopper.push(c);
      } else {
        this.hopper.push(lineToCard(line, code));
      }
    }
    if (this.hopper.length && this.hopper[this.hopper.length - 1].every((v) => v === 0)) this.hopper.pop();
  }
  loadCards(cards) {
    for (const c of cards) this.hopper.push(Uint16Array.from(c));
  }
  nextCard() {
    this.card = this.hopper.length ? this.hopper.shift() : null;
    this.col = 0;
    if (this.card) this.cardsRead++;
  }
  func(code) {
    switch (code) {
      case FC405.DESELECT:
      case FC405.GATE_SECONDARY:
        this.fcode = 0;
        return FC_PROCESSED;
      case FC405.READ:
        if (!this.card) this.nextCard();
        this.fcode = code;
        this.delay = 20;
        return FC_ACCEPTED;
      case FC405.STATUS:
        this.fcode = code;
        return FC_ACCEPTED;
      default:
        return FC_DECLINED;
    }
  }
  io() {
    const ch = this.channel;
    if (this.fcode === FC405.STATUS) {
      if (!ch.full) {
        ch.data = this.card || this.hopper.length ? ST405.READY : ST405.NOT_READY;
        ch.full = true;
      }
      return;
    }
    if (this.fcode === FC405.READ) {
      if (this.delay > 0) { this.delay--; return; }
      if (ch.full) return;
      if (!this.card) { ch.active = false; return; }
      ch.data = this.card[this.col++] & M12;
      ch.full = true;
      if (this.col >= 80) {
        this.card = null;
        this.col = 0;
        ch.discAfterInput = true; // end of card: the channel disconnects
      }
    }
  }
}

// ------------------------------------------------- line printer 1612

export const FC1612 = {
  SELECT: 0o600, SINGLE: 0o601, DOUBLE: 0o602, CHANNEL7: 0o603, EJECT: 0o604, PRINT: 0o605,
  NOSPACE: 0o606, STATUS: 0o607, CLEAR_FORMAT: 0o610,
};

/** 1612 line printer (120 columns, external BCD). */
export class LinePrinter1612 extends Device {
  constructor() {
    super('line printer 1612');
    this.line = [];
    this.output = [];     // printed lines
    this.pending = '';    // paper advance before the next print
    this.suppress = false;
    this.pages = 1;
    this.onLine = null;
  }
  emit(text) {
    this.output.push(text);
    if (this.output.length > 50000) this.output.splice(0, 10000);
    if (this.onLine) this.onLine(text);
  }
  func(code) {
    switch (code) {
      case FC1612.SELECT: break;
      case FC1612.PRINT: {
        const text = this.line.map((b) => EXT_BCD[b & 0o77]).join('').replace(/\s+$/, '');
        this.emit(text);
        this.line = [];
        if (this.suppress) { this.suppress = false; this.pending = 'nospace'; }
        break;
      }
      case FC1612.SINGLE: break;
      case FC1612.DOUBLE: this.emit(''); break;
      case FC1612.CHANNEL7:
      case FC1612.EJECT: this.emit('\f'); this.pages++; break;
      case FC1612.NOSPACE: this.suppress = true; break;
      case FC1612.STATUS: break;
      case FC1612.CLEAR_FORMAT: this.suppress = false; break;
      default:
        if (code >= 0o611 && code <= 0o616) break;
        return FC_DECLINED;
    }
    this.fcode = code;
    return FC_ACCEPTED;
  }
  io() {
    const ch = this.channel;
    if (this.fcode === FC1612.STATUS) {
      if (!ch.full) { ch.data = 0o4000; ch.full = true; this.fcode = 0; }
    } else if (ch.full) {
      if (this.line.length < 136) this.line.push(ch.data & 0o77);
      ch.full = false;
    }
  }
  text() {
    return this.output.join('\n');
  }
}

// ---------------------------------------------------- tape unit 607

export const FC607 = {
  SELECT: 0o2000, WRITE_BINARY: 0o2010, READ_BINARY: 0o2020, BACKSPACE: 0o2030,
  REWIND: 0o2060, UNLOAD: 0o2070, STATUS: 0o2100, WRITE_BCD: 0o2210, READ_BCD: 0o2220,
  FILE_MARK: 0o2610,
};
export const ST607 = { READY: 0, NOT_READY: 1, PARITY: 2, LOAD_POINT: 4, EOT: 0o10, FILE_MARK: 0o20, WRITE_LOCK: 0o40 };

/** Magnetic tape: sequence of records (arrays of 12-bit words) or file marks (null). */
export class Tape {
  constructor(records = []) {
    this.records = records;
    this.pos = 0;
    this.writeLock = false;
  }
  /** Reads a .tap image (32-bit LE length, 2 12-bit words per 3 bytes). */
  static fromTap(bytes) {
    const recs = [];
    let i = 0;
    const len = () => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24);
    while (i + 4 <= bytes.length) {
      const n = len() >>> 0;
      i += 4;
      if (n === 0) { recs.push(null); continue; }
      if (n === 0xffffffff) break;
      const words = [];
      const count = Math.floor((n * 2) / 3);
      for (let k = 0; words.length < count; k += 3) {
        const c1 = bytes[i + k], c2 = bytes[i + k + 1] ?? 0, c3 = bytes[i + k + 2] ?? 0;
        words.push(((c1 << 4) | (c2 >> 4)) & M12);
        if (words.length < count) words.push(((c2 << 8) | c3) & M12);
      }
      recs.push(Uint16Array.from(words));
      i += n;
      i += 4;
    }
    return new Tape(recs);
  }
  /** Image .tap. */
  toTap() {
    const out = [];
    const put32 = (n) => out.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255);
    for (const r of this.records) {
      if (r === null) { put32(0); continue; }
      const bytes = [];
      for (let k = 0; k < r.length; k += 2) {
        const a = r[k], b = k + 1 < r.length ? r[k + 1] : 0;
        bytes.push((a >> 4) & 255, ((a & 15) << 4) | ((b >> 8) & 15), b & 255);
      }
      const n = r.length % 2 ? bytes.length - 1 : bytes.length;
      put32(n);
      for (let k = 0; k < n; k++) out.push(bytes[k]);
      put32(n);
    }
    return Uint8Array.from(out);
  }
}

/** 607 tape unit (up to 8 units). */
export class TapeDrive607 extends Device {
  constructor() {
    super('tape unit 607');
    this.units = new Array(8).fill(null);
    this.unit = 0;
    this.status = ST607.READY;
    this.buffer = null;
    this.bufPos = 0;
    this.writing = null;
  }
  mount(unit, tape) {
    this.units[unit] = tape;
  }
  tape() {
    return this.units[this.unit];
  }
  computeStatus() {
    const t = this.tape();
    if (!t) return ST607.NOT_READY;
    let s = this.status;
    if (t.pos === 0) s |= ST607.LOAD_POINT;
    if (t.pos >= t.records.length) s |= ST607.EOT;
    if (t.writeLock) s |= ST607.WRITE_LOCK;
    return s;
  }
  func(code) {
    const t = this.tape();
    const op = code & 0o7770;
    switch (op) {
      case FC607.SELECT:
        this.unit = code & 7;
        this.fcode = 0;
        return FC_PROCESSED;
      case FC607.REWIND:
        if (t) t.pos = 0;
        this.status = ST607.READY;
        return FC_PROCESSED;
      case FC607.UNLOAD:
        if (t) t.pos = 0;
        this.units[this.unit] = null;
        return FC_PROCESSED;
      case FC607.BACKSPACE:
        if (t && t.pos > 0) t.pos--;
        this.status = ST607.READY;
        return FC_PROCESSED;
      case FC607.FILE_MARK:
        if (t && !t.writeLock) { t.records.splice(t.pos); t.records.push(null); t.pos++; }
        return FC_PROCESSED;
      case FC607.STATUS:
        this.fcode = op;
        return FC_ACCEPTED;
      case FC607.READ_BINARY:
      case FC607.READ_BCD:
        this.fcode = op;
        this.status = ST607.READY;
        this.buffer = null;
        if (!t) { this.status = ST607.NOT_READY; return FC_ACCEPTED; }
        if (t.pos >= t.records.length) { this.status = ST607.EOT; this.buffer = new Uint16Array(0); return FC_ACCEPTED; }
        {
          const r = t.records[t.pos++];
          if (r === null) { this.status = ST607.FILE_MARK; this.buffer = new Uint16Array(0); }
          else this.buffer = r;
        }
        this.bufPos = 0;
        return FC_ACCEPTED;
      case FC607.WRITE_BINARY:
      case FC607.WRITE_BCD:
        this.fcode = op;
        this.writing = [];
        if (!t || t.writeLock) this.status = ST607.NOT_READY | (t ? ST607.WRITE_LOCK : 0);
        return FC_ACCEPTED;
      default:
        return FC_DECLINED;
    }
  }
  io() {
    const ch = this.channel;
    switch (this.fcode) {
      case FC607.STATUS:
        if (!ch.full) { ch.data = this.computeStatus(); ch.full = true; }
        break;
      case FC607.READ_BINARY:
      case FC607.READ_BCD:
        if (ch.full) break;
        if (!this.buffer || this.bufPos >= this.buffer.length) { ch.active = false; break; }
        ch.data = this.buffer[this.bufPos++];
        ch.full = true;
        break;
      case FC607.WRITE_BINARY:
      case FC607.WRITE_BCD:
        if (ch.full) { this.writing.push(ch.data & M12); ch.full = false; }
        break;
    }
  }
  disconnect() {
    if ((this.fcode === FC607.WRITE_BINARY || this.fcode === FC607.WRITE_BCD) && this.writing) {
      const t = this.tape();
      if (t && !t.writeLock && this.writing.length) {
        t.records.splice(t.pos);
        t.records.push(Uint16Array.from(this.writing));
        t.pos++;
      }
      this.writing = null;
    }
    this.fcode = 0;
  }
}

// ---------------------------------------------------- real-time clock

/** Real-time clock: channel always active and full, 12-bit counter in µs. */
export class RealTimeClock extends Device {
  constructor(machine) {
    super('clock');
    this.machine = machine;
  }
  attachTo(ch) {
    ch.attach(this);
    ch.ioDevice = this;
    ch.hardwired = true;
    ch.alwaysActive = true;
    ch.alwaysFull = true;
    ch.active = true;
  }
  io() {
    this.channel.data = this.machine.time & M12;
    this.channel.full = true;
  }
}

export { DISPLAY, displayToExtBcd };

// --------------------------------------------------------- disk 6603

export const FC6603 = { READ: 0o1000, WRITE: 0o1200, TRACK: 0o1400, HEAD: 0o1600, STATUS: 0o1700 };

/**
 * 6603 disk: 128 tracks, 8 heads, 128 sectors (outer tracks) or 100
 * (inner tracks) of 322 12-bit words. Functions: 1000B+s read sector s,
 * 1200B+s write, 1400B+t select track, 1600B+h select head,
 * 1700B status (sector passing under the head).
 */
export class Disk6603 extends Device {
  constructor() {
    super('disk 6603');
    this.sectors = new Map();
    this.track = 0;
    this.head = 0;
    this.sector = 0;
    this.pos = 0;
    this.buf = null;
  }
  static SECTOR_WORDS = 322;
  sectorsOnTrack(t) {
    return t < 0o100 ? 128 : 100;
  }
  key(t, h, s) {
    return (t << 10) | (h << 7) | s;
  }
  func(code) {
    const op = code & 0o7600;
    switch (op) {
      case FC6603.READ:
      case FC6603.WRITE: {
        const s = code & 0o177;
        if (s >= this.sectorsOnTrack(this.track)) return FC_DECLINED;
        this.sector = s;
        const k = this.key(this.track, this.head, s);
        if (!this.sectors.has(k)) this.sectors.set(k, new Uint16Array(Disk6603.SECTOR_WORDS));
        this.buf = this.sectors.get(k);
        this.pos = 0;
        this.fcode = op;
        return FC_ACCEPTED;
      }
      case FC6603.TRACK:
        this.track = code & 0o177;
        return FC_PROCESSED;
      case FC6603.HEAD:
        if (code === FC6603.STATUS) {
          this.fcode = FC6603.STATUS;
          this.status = this.sector;
          this.sector = (this.sector + 1) % this.sectorsOnTrack(this.track);
          return FC_ACCEPTED;
        }
        this.head = code & 7;
        return FC_PROCESSED;
      default:
        return FC_DECLINED;
    }
  }
  io() {
    const ch = this.channel;
    switch (this.fcode) {
      case FC6603.READ:
        if (ch.full) break;
        if (this.pos >= this.buf.length) { ch.active = false; break; }
        ch.data = this.buf[this.pos++];
        ch.full = true;
        break;
      case FC6603.WRITE:
        if (ch.full) {
          if (this.pos < this.buf.length) this.buf[this.pos++] = ch.data & M12;
          ch.full = false;
        }
        break;
      case FC6603.STATUS:
        if (!ch.full) { ch.data = this.status & 0o177; ch.full = true; this.fcode = 0; }
        break;
    }
  }
  disconnect() {
    this.fcode = 0;
  }
}
