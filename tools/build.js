#!/usr/bin/env node
// Construit dist/cdc6600-ide.html : l'IDE complet en un seul fichier HTML
// autonome (CSS, modules JavaScript et exemples intégrés), utilisable
// directement depuis le disque (file://).
//
// Petit empaqueteur maison pour notre propre code : chaque module ES est
// transformé en fonction qui retourne ses exportations ; les modules sont
// évalués dans l'ordre des dépendances. Formes prises en charge :
//   import { a, b as c } from './x.js'      import * as ns from './x.js'
//   import x from './x.js' (défaut)         import './x.js' (effet de bord)
//   export const|let|var|function|async function|class nom
//   export { a, b as c }                    import('./x.js') (chaîne littérale)

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

/** Résout un spécificateur relatif à partir d'un module. */
function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) throw new Error(`${rel(fromFile)} : import non relatif non pris en charge : ${spec}`);
  return path.resolve(path.dirname(fromFile), spec);
}

/**
 * Convertit la clause d'un import en déclarations. Les liaisons sont des `let`
 * renseignées dès que le module exportateur est évalué : immédiatement dans le
 * cas courant, après coup en cas de dépendance circulaire (les usages ont alors
 * lieu à l'appel des fonctions, comme avec les modules ES).
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
    if (!m) throw new Error(`import * invalide : ${clause}`);
    out.push(`const ${m[1]} = __m[${k}];`);
  } else if (rest.startsWith('{')) {
    const inner = rest.slice(1, rest.lastIndexOf('}'));
    for (const x of inner.split(',').map((y) => y.trim()).filter(Boolean)) {
      const m = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(x);
      if (!m) throw new Error(`liste d'import invalide : ${clause}`);
      const local = m[2] || m[1];
      names.push(local);
      assigns.push(`${local} = ns.${m[1]};`);
    }
  } else if (rest) {
    throw new Error(`clause d'import non prise en charge : ${clause}`);
  }
  if (names.length) out.push(`let ${names.join(', ')}; __imp(${k}, (ns) => { ${assigns.join(' ')} });`);
  return out.join(' ');
}

/** Transforme un module : { code, deps, dynamic, exports }. */
export function transformModule(source, file) {
  const deps = [];
  const dynamic = [];
  const exportsList = [];
  let code = source;
  const keyOf = (spec) => rel(resolveSpec(file, spec));
  code = code.replace(/^[ \t]*import\s+([\w$*{][\s\S]*?)\s+from\s*(['"])([^'"\n]+)\2[ \t]*;?/gm, (m, clause, q, spec) => {
    const key = keyOf(spec);
    deps.push(key);
    // conserve le nombre de lignes (messages d'erreur lisibles)
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
      if (!mm) throw new Error(`${rel(file)} : export invalide : ${x}`);
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
  if (/^\s*export\s+default\b/m.test(code)) throw new Error(`${rel(file)} : export default non pris en charge`);
  if (/^\s*export\s/m.test(code)) throw new Error(`${rel(file)} : forme d'export non reconnue`);
  if (/\bimport\.meta\b/.test(code)) throw new Error(`${rel(file)} : import.meta non pris en charge dans le paquet`);
  return { code, deps, dynamic, exports: exportsList };
}

/** Parcourt le graphe des modules depuis l'entrée ; ordre des dépendances. */
function collect(entry) {
  const mods = new Map();
  const order = [];
  const state = new Map(); // 1 = en cours, 2 = fini
  const visit = (key, chain) => {
    if (state.get(key)) return; // déjà évalué, ou en cours (dépendance circulaire)
    state.set(key, 1);
    const file = path.join(ROOT, key);
    const src = fs.readFileSync(file, 'utf8');
    const t = transformModule(src, file);
    mods.set(key, t);
    for (const d of t.deps) visit(d, [...chain, key]);
    // les imports dynamiques présents sur le disque sont aussi empaquetés
    for (const d of t.dynamic) if (fs.existsSync(path.join(ROOT, d))) visit(d, [...chain, key]);
    state.set(key, 2);
    order.push(key);
  };
  visit(entry, []);
  return { mods, order };
}

/** Code JavaScript du paquet (script classique). */
export function bundleScript(entry = 'ide/app.js') {
  const { mods, order } = collect(entry);
  // __m : objets d'exportation créés d'avance ; __imp : liaison (immédiate ou différée
  // jusqu'à l'évaluation de l'exportateur) ; __fin : publie les exportations d'un module.
  let js = '(function () {\n"use strict";\nconst __m = Object.create(null);\nconst __done = new Set();\nconst __wait = new Map();\n'
    + 'const __imp = (k, fn) => { if (__done.has(k)) fn(__m[k]); else { if (!__wait.has(k)) __wait.set(k, []); __wait.get(k).push(fn); } };\n'
    + 'const __fin = (k, e) => { Object.assign(__m[k], e); __done.add(k); for (const fn of __wait.get(k) || []) fn(__m[k]); __wait.delete(k); };\n'
    + 'const __dyn = (k) => (__done.has(k) ? Promise.resolve(__m[k]) : Promise.reject(new Error("module absent du paquet : " + k)));\n'
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

/** Exemples intégrés (index + fichiers). */
function embeddedExamples() {
  const dir = path.join(ROOT, 'ide', 'examples');
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const files = {};
  for (const ex of index) files[ex.file] = fs.readFileSync(path.join(dir, ex.file), 'utf8');
  return { index, files };
}

const safe = (s) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

/** Page HTML autonome. */
export function buildHtml() {
  const html = fs.readFileSync(path.join(ROOT, 'ide', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'ide', 'css', 'app.css'), 'utf8');
  const { js, order } = bundleScript('ide/app.js');
  new vm.Script(js, { filename: 'cdc6600-ide.js' }); // contrôle de syntaxe
  const data = `globalThis.__CDC_EMBEDDED__ = ${JSON.stringify({ examples: embeddedExamples(), built: new Date().toISOString() })};`;
  let out = html
    .replace(/<link rel="stylesheet" href="css\/app\.css">/, () => `<style>\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>`)
    .replace(/<script type="module" src="app\.js"><\/script>/, () => `<script>\n${safe(data)}\n</script>\n<script>\n${safe(js)}</script>`);
  if (out.includes('src="app.js"') || out.includes('css/app.css')) throw new Error('index.html : balises attendues introuvables');
  out = out.replace('<html lang="fr">', '<html lang="fr">\n<!-- Atelier COMPASS : fichier construit par tools/build.js, ne pas modifier. -->');
  return { html: out, js, order };
}

function main() {
  const { html, order } = buildHtml();
  const dist = path.join(ROOT, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  const out = path.join(dist, 'cdc6600-ide.html');
  fs.writeFileSync(out, html);
  console.log(`${order.length} modules empaquetés -> ${rel(out)} (${(html.length / 1024).toFixed(0)} Kio)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
