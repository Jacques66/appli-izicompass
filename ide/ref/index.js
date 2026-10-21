// Complete COMPASS reference: chapter assembly, keyword index (F1 help)
// and full-text search. No DOM access.

import { CHAPTERS as LANGUAGE } from './language.js';
import { CHAPTERS as PSEUDO_A } from './pseudo-a.js';
import { CHAPTERS as PSEUDO_B } from './pseudo-b.js';
import { CHAPTERS as INSTRUCTIONS } from './instructions.js';
import { CHAPTERS as SYSTEXT } from './systext.js';

/** Main parts of the reference, in display order. */
export const PARTS = [
  { id: 'langage', title: 'Language', chapters: LANGUAGE },
  { id: 'pseudo', title: 'Pseudo-instructions', chapters: [...PSEUDO_A, ...PSEUDO_B] },
  { id: 'machine', title: 'Machine instructions', chapters: INSTRUCTIONS },
  { id: 'systeme', title: 'System text', chapters: SYSTEXT },
];

export const CHAPTERS = PARTS.flatMap((p) => p.chapters);

/** Comparable text: lowercase, no accents. */
export function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/** Plain text of an HTML fragment. */
export function plainText(html) {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;|&#\d+;/g, (e) => ENTITIES[e] ?? ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Builds the index of a set of parts.
 * @returns { byId, byKey, lookup(word), search(query, limit) }
 */
export function buildIndex(parts) {
  const byId = new Map();
  const byKey = new Map();
  const docs = [];
  for (const part of parts) {
    for (const chapter of part.chapters) {
      for (const entry of chapter.entries) {
        const rec = { entry, chapter, part };
        byId.set(entry.id, rec);
        for (const k of entry.keys || []) if (!byKey.has(k.toUpperCase())) byKey.set(k.toUpperCase(), entry.id);
        const body = plainText(entry.html);
        docs.push({
          rec, body, bodyF: fold(body), titleF: fold(entry.title),
          keysU: (entry.keys || []).map((k) => k.toUpperCase()),
          syntaxF: fold((entry.syntax || []).join(' ')),
        });
      }
    }
  }

  /** Page for a source word (F1): operation name, mnemonic with register… */
  function lookup(word) {
    if (!word) return null;
    const w = word.toUpperCase().replace(/^[+-]/, '');
    const tries = [w];
    if (/^[A-Z]{2}\.?[0-7]$/.test(w)) tries.push(w.replace(/\.?[0-7]$/, ''));   // SA1, BX.6
    if (/^[A-Z]{2}\.[A-Z0-9]+$/.test(w)) tries.push(w.slice(0, 2));              // SX.REG
    if (w.endsWith('.')) tries.push(w.slice(0, -1));
    for (const t of tries) if (byKey.has(t)) return byId.get(byKey.get(t));
    return null;
  }

  /** Full-text search: every term must appear in the page. */
  function search(query, limit = 80) {
    const terms = fold(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const res = [];
    for (const d of docs) {
      let score = 0;
      let all = true;
      for (const t of terms) {
        const tu = t.toUpperCase();
        let s = 0;
        if (d.keysU.includes(tu)) s += 100;
        else if (d.keysU.some((k) => k.startsWith(tu))) s += 30;
        const ti = d.titleF.indexOf(t);
        if (ti >= 0) s += 20 + (ti === 0 || /[\s,(—-]/.test(d.titleF[ti - 1]) ? 10 : 0);
        if (d.syntaxF.includes(t)) s += 8;
        let n = 0;
        for (let p = d.bodyF.indexOf(t); p >= 0 && n < 6; p = d.bodyF.indexOf(t, p + t.length)) n++;
        s += n;
        if (!s) { all = false; break; }
        score += s;
      }
      if (all) res.push({ ...d.rec, score, snippet: snippet(d, terms) });
    }
    res.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'fr'));
    return res.slice(0, limit);
  }

  function snippet(d, terms) {
    let at = -1;
    for (const t of terms) { at = d.bodyF.indexOf(t); if (at >= 0) break; }
    if (at < 0) return d.body.slice(0, 120);
    const from = Math.max(0, at - 50);
    return (from ? '… ' : '') + d.body.slice(from, at + 90).trim() + ' …';
  }

  return { byId, byKey, lookup, search, count: docs.length };
}
