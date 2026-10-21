// Entry point of the COMPASS assembler (see docs/API.md).

import { Assembler } from './assembler.js';
import { SYSTEM_TEXTS } from '../os/systext.js';

const systemCache = new Map();

/**
 * Prepares the definitions of a system text (equivalent of STEXT + the S= parameter).
 * The system text is a COMPASS program whose macros, opdefs, micros and
 * absolute symbols become available at the start of each assembly.
 */
export function systemDefinitions(name, text) {
  const key = name + '\u0000' + text;
  if (systemCache.has(key)) return systemCache.get(key);
  const asm = new Assembler({ exportDefs: true, systemName: name });
  asm.definingSystem = true;
  asm.assemble(text, name);
  const defs = asm.exported || { mnemonic: new Map(), syntactic: new Map(), micros: new Map(), symbols: new Map() };
  defs.errors = asm.result().errors;
  systemCache.set(key, defs);
  return defs;
}

/**
 * Assembles a COMPASS source.
 * @param source program text
 * @param options { fileName, texts, systemText, list, date, debug }
 */
export function assemble(source, options = {}) {
  options = { ...options, texts: { ...SYSTEM_TEXTS, ...(options.texts || {}) } };
  // default system text: SYSTEXT (like S=SYSTEXT under NOS); null for none
  if (options.systemText === undefined) options.systemText = 'SYSTEXT';
  let systemDefs = null;
  if (options.systemText) {
    const names = Array.isArray(options.systemText) ? options.systemText : [options.systemText];
    for (const n of names) {
      const text = (options.texts && options.texts[n]) ?? options.systemTexts?.[n];
      if (text === undefined) continue;
      const d = systemDefinitions(n, text);
      systemDefs = mergeDefs(systemDefs, d);
    }
  }
  const asm = new Assembler({ ...options, systemDefs });
  return asm.assemble(source, options.fileName || 'PROG');
}

function mergeDefs(a, b) {
  if (!a) return b;
  const out = { mnemonic: new Map(a.mnemonic), syntactic: new Map(a.syntactic), micros: new Map(a.micros), symbols: new Map(a.symbols) };
  for (const [k, v] of b.mnemonic) out.mnemonic.set(k, (out.mnemonic.get(k) || []).concat(v));
  for (const [k, v] of b.syntactic) out.syntactic.set(k, (out.syntactic.get(k) || []).concat(v));
  for (const [k, v] of b.micros) out.micros.set(k, v);
  for (const [k, v] of b.symbols) out.symbols.set(k, v);
  return out;
}

export { Assembler };
