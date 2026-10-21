// Formatting helpers for the COMPASS reference. No DOM access: pages are
// plain HTML strings, also usable under Node (tests assemble every example
// marked as verified).
//
// A page: { id, title, keys: [...], syntax: [...], html }
//   id     : unique identifier (ps-ident, lang-literals, cpu-sa…)
//   title  : displayed title
//   keys   : words that F1 in the editor maps to the page (operation names, uppercase)
//   syntax : general forms (plain text, displayed as a block)
//   html   : page body
// A chapter: { id, title, intro?, entries: [page…] }

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Inline code. */
export const c = (s) => `<code>${esc(s)}</code>`;

/** Block of COMPASS source (plain text, columns preserved). */
export const src = (s) => `<pre class="doc-pre">${esc(s.replace(/^\n/, '').replace(/\n\s*$/, ''))}</pre>`;

/**
 * Verified example: the text is assembled by the tests (test/ref.test.js).
 * opts.errors : expected error flags (e.g. ['U']); none by default.
 * opts.pp : PP program fragment (wrapped in IDENT/PERIPH/ORG 100B/END).
 */
export function ex(s, opts = {}) {
  const text = s.replace(/^\n/, '').replace(/\n\s*$/, '');
  EXAMPLES.push({ text, errors: opts.errors || [], pp: !!opts.pp });
  return `<pre class="doc-pre doc-ex">${esc(text)}</pre>`;
}
export const EXAMPLES = [];

/** Table: cells are raw HTML. */
export const T = (rows, head) => `<table class="grid-table doc-table"><thead><tr>${head.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v, i) => `<td${i === 0 ? ' class="mono strong"' : ''}>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

/** Cross-reference to another page: see('ps-ident', 'IDENT'). */
export const see = (id, label) => `<a class="ref-link" href="#ref-${id}" data-ref="${id}">${esc(label)}</a>`;

/** Note box. */
export const note = (html) => `<div class="ref-note">${html}</div>`;

/** Bulleted list (items are raw HTML). */
export const ul = (items) => `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;

/** Subheading inside a page. */
export const h4 = (s) => `<h4>${esc(s)}</h4>`;
