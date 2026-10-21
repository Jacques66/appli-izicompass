#!/usr/bin/env node
// Builds dist/cdc6600-ide.html: the complete IDE in a single self-contained
// HTML file (CSS, JavaScript modules and examples embedded), usable directly
// from disk (file://).
//
// Small home-made bundler for this project's own code: each ES module is
// turned into a function that returns its exports; modules are evaluated in
// dependency order. Supported forms:
//   import { a, b as c } from './x.js'      import * as ns from './x.js'
//   import x from './x.js' (default)        import './x.js' (side effect)
//   export const|let|var|function|async function|class name
//   export { a, b as c }                    import('./x.js') (string literal)

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

/** Resolves a relative specifier from a module. */
function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) throw new Error(`${rel(fromFile)}: non-relative import not supported: ${spec}`);
  return path.resolve(path.dirname(fromFile), spec);
}

/**
 * Converts an import clause into declarations. The bindings are `let`
 * variables filled in as soon as the exporting module is evaluated: at once in
 * the usual case, afterwards for a circular dependency (the uses then happen
 * when the functions are called, as with ES modules).
 */
function importDecl(clause, key) {
  const k = JSON.stringify(key);
  clause = clause.trim();
  const names = [];
  const assigns = [];
  const out = [];
  let rest = clause;
  const def = /^([A-Za-z_$][\w$]*)\s*(,|$)/.exec(rest);
  if (def && !rest.startsWith('{') && !rest.startsWith('*')) {
    names.push(def[1]);
    assigns.push(`${def[1]} = ns.default;`);
    rest = rest.slice(def[0].length).trim();
  }
  if (rest.startsWith('*')) {
    const m = /^\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(rest);
    if (!m) throw new Error(`invalid import *: ${clause}`);
    out.push(`const ${m[1]} = __m[${k}];`);
  } else if (rest.startsWith('{')) {
    const inner = rest.slice(1, rest.lastIndexOf('}'));
    for (const x of inner.split(',').map((y) => y.trim()).filter(Boolean)) {
      const m = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(x);
      if (!m) throw new Error(`invalid import list: ${clause}`);
      const local = m[2] || m[1];
      names.push(local);
      assigns.push(`${local} = ns.${m[1]};`);
    }
  } else if (rest) {
    throw new Error(`unsupported import clause: ${clause}`);
  }
  if (names.length) out.push(`let ${names.join(', ')}; __imp(${k}, (ns) => { ${assigns.join(' ')} });`);
  return out.join(' ');
}

/** Transforms a module: { code, deps, dynamic, exports }. */
export function transformModule(source, file) {
  const deps = [];
  const dynamic = [];
  const exportsList = [];
  let code = source;
  const keyOf = (spec) => rel(resolveSpec(file, spec));
  code = code.replace(/^[ \t]*import\s+([\w$*{][\s\S]*?)\s+from\s*(['"])([^'"\n]+)\2[ \t]*;?/gm, (m, clause, q, spec) => {
    const key = keyOf(spec);
    deps.push(key);
    // keeps the line count (readable error messages)
    return importDecl(clause, key) + '\n'.repeat((m.match(/\n/g) || []).length);
  });
  code = code.replace(/^[ \t]*import\s*(['"])([^'"\n]+)\1[ \t]*;?/gm, (m, q, spec) => {
    deps.push(keyOf(spec));
    return '';
  });
  code = code.replace(/\bimport\(\s*(['"])([^'"\n]+)\1\s*\)/g, (m, q, spec) => {
    const key = keyOf(spec);
    dynamic.push(key);
    return `__dyn(${JSON.stringify(key)})`;
  });
  code = code.replace(/^([ \t]*)export\s+(async\s+function\s*\*?|function\s*\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (m, ind, kw, name) => {
    exportsList.push([name, name]);
    return `${ind}${kw.replace(/\s+/g, ' ')} ${name}`;
  });
  code = code.replace(/^[ \t]*export\s*\{([^}]*)\}\s*(from\s*(['"])([^'"\n]+)\3)?[ \t]*;?/gm, (m, list, from, q, spec) => {
    const items = list.split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
      const mm = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(x);
      if (!mm) throw new Error(`${rel(file)}: invalid export: ${x}`);
      return [mm[2] || mm[1], mm[1]];
    });
    if (from) {
      const key = keyOf(spec);
      deps.push(key);
      return items.map(([pub, loc]) => { exportsList.push([pub, `__m[${JSON.stringify(key)}].${loc}`]); return ''; }).join('');
    }
    for (const it of items) exportsList.push(it);
    return '';
  });
  if (/^\s*export\s+default\b/m.test(code)) throw new Error(`${rel(file)}: export default not supported`);
  if (/^\s*export\s/m.test(code)) throw new Error(`${rel(file)}: unrecognized export form`);
  if (/\bimport\.meta\b/.test(code)) throw new Error(`${rel(file)}: import.meta not supported in the bundle`);
  return { code, deps, dynamic, exports: exportsList };
}

/** Walks the module graph from the entry; dependency order. */
function collect(entry) {
  const mods = new Map();
  const order = [];
  const state = new Map(); // 1 = in progress, 2 = done
  const visit = (key, chain) => {
    if (state.get(key)) return; // already evaluated, or in progress (circular dependency)
    state.set(key, 1);
    const file = path.join(ROOT, key);
    const src = fs.readFileSync(file, 'utf8');
    const t = transformModule(src, file);
    mods.set(key, t);
    for (const d of t.deps) visit(d, [...chain, key]);
    // dynamic imports present on disk are bundled too
    for (const d of t.dynamic) if (fs.existsSync(path.join(ROOT, d))) visit(d, [...chain, key]);
    state.set(key, 2);
    order.push(key);
  };
  visit(entry, []);
  return { mods, order };
}

/** JavaScript code of the bundle (classic script). */
export function bundleScript(entry = 'ide/app.js') {
  const { mods, order } = collect(entry);
  // __m: export objects created in advance; __imp: binding (immediate, or deferred
  // until the exporter is evaluated); __fin: publishes the exports of a module.
  let js = '(function () {\n"use strict";\nconst __m = Object.create(null);\nconst __done = new Set();\nconst __wait = new Map();\n'
    + 'const __imp = (k, fn) => { if (__done.has(k)) fn(__m[k]); else { if (!__wait.has(k)) __wait.set(k, []); __wait.get(k).push(fn); } };\n'
    + 'const __fin = (k, e) => { Object.assign(__m[k], e); __done.add(k); for (const fn of __wait.get(k) || []) fn(__m[k]); __wait.delete(k); };\n'
    + 'const __dyn = (k) => (__done.has(k) ? Promise.resolve(__m[k]) : Promise.reject(new Error("module missing from the bundle: " + k)));\n'
    + 'globalThis.__CDC_MODULES__ = __m;\n';
  for (const key of order) js += `__m[${JSON.stringify(key)}] = {};\n`;
  for (const key of order) {
    const t = mods.get(key);
    const exp = t.exports.map(([pub, loc]) => (pub === loc ? pub : `${pub}: ${loc}`)).join(', ');
    js += `\n// ---- ${key}\n(function () {\n"use strict";\n${t.code}\n__fin(${JSON.stringify(key)}, { ${exp} });\n})();\n`;
  }
  js += '})();\n';
  return { js, order };
}

/** Embedded examples (index + files). */
function embeddedExamples() {
  const dir = path.join(ROOT, 'ide', 'examples');
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const files = {};
  for (const ex of index) files[ex.file] = fs.readFileSync(path.join(dir, ex.file), 'utf8');
  return { index, files };
}

const safe = (s) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

/** Self-contained HTML page. */
export function buildHtml() {
  const html = fs.readFileSync(path.join(ROOT, 'ide', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'ide', 'css', 'app.css'), 'utf8');
  const { js, order } = bundleScript('ide/app.js');
  new vm.Script(js, { filename: 'cdc6600-ide.js' }); // syntax check
  const data = `globalThis.__CDC_EMBEDDED__ = ${JSON.stringify({ examples: embeddedExamples(), built: new Date().toISOString() })};`;
  let out = html
    .replace(/<link rel="stylesheet" href="css\/app\.css">/, () => `<style>\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>`)
    .replace(/<script type="module" src="app\.js"><\/script>/, () => `<script>\n${safe(data)}\n</script>\n<script>\n${safe(js)}</script>`);
  if (out.includes('src="app.js"') || out.includes('css/app.css')) throw new Error('index.html: expected tags not found');
  out = out.replace('<html lang="en">', '<html lang="en">\n<!-- COMPASS Workbench: file built by tools/build.js, do not edit. -->');
  return { html: out, js, order };
}

function main() {
  const { html, order } = buildHtml();
  const dist = path.join(ROOT, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  const out = path.join(dist, 'cdc6600-ide.html');
  fs.writeFileSync(out, html);
  console.log(`${order.length} modules bundled -> ${rel(out)} (${(html.length / 1024).toFixed(0)} KiB)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
