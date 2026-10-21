// CPU instructions: the COMPASS "syntactic" table.
//
// Each instruction is identified by a syntax key, as for OPDEF: two
// mnemonic characters (the second is A, B or X when the operation field
// carries a register, e.g. "SA" for SA1) followed by the descriptors of the
// subfields separated by commas: registers (A, B, X) joined by their
// operators, "Q" for an expression. E.g.: SA7 X3+B1 -> "SAX+B",
// EQ B1,B2,K -> "EQB,B,Q", LX1 B2,X3 -> "LXB,X".
//
// Encoding (same as CPOP): val = fm and i on 9 bits; reg = 3 digits giving
// the source of the i, j, k fields: 1 = operation field register,
// 2 = second register (or only register) of the variable field, 3 = first of
// two registers, 0 = value of val (i) or zero.

export const CPU_SYNTAX = new Map();

/**
 * @param len 15 or 30
 * @param flags 'b' force upper before, 'a' force upper after, 'j' Q in jk,
 *              'n' Q in the 9 ijk bits (NO n), '7' 7600 only, '8' 8xx
 */
function def(key, len, val, reg, flags = '') {
  CPU_SYNTAX.set(key, { key, len, val, reg, before: flags.includes('b'), after: flags.includes('a'),
    jk: flags.includes('j'), n9: flags.includes('n'), machine: flags.includes('7') ? '7' : flags.includes('8') ? '8' : null,
    builtin: true });
}

// --- 00-01: stop, return jump, ECS, exchange
def('PS', 30, 0o000, '000', 'ba');
def('PSQ', 30, 0o000, '000', 'ba');
def('RJQ', 30, 0o010, '000', 'a');
for (const [mn, v] of [['RE', 0o011], ['WE', 0o012], ['RL', 0o011], ['WL', 0o012]]) {
  def(mn + 'B', 30, v, '020', 'b');
  def(mn + 'Q', 30, v, '000', 'b');
  def(mn + 'BQ', 30, v, '020', 'b');
}
def('XJ', 30, 0o013, '000', 'ba');
def('XJB', 30, 0o013, '020', 'ba');
def('XJQ', 30, 0o013, '000', 'ba');
def('XJBQ', 30, 0o013, '020', 'ba');
def('MJ', 15, 0o013, '000', 'a7');
def('MJB', 30, 0o013, '020', 'a7');
def('MJQ', 30, 0o013, '000', 'a7');
def('MJBQ', 30, 0o013, '020', 'a7');
def('RXX', 15, 0o014, '012', '');   // RXj Xk (UEM/LCM)
def('WXX', 15, 0o015, '012', '');   // WXj Xk
def('RIB', 15, 0o016, '002', '7');
def('TB', 15, 0o016, '010', '7');
def('TBQ', 15, 0o016, '010', '7');
def('IBB', 15, 0o016, '012', '7');
def('ROB', 15, 0o017, '002', '7');
def('OBB', 15, 0o017, '012', '7');

// --- 02: JP
def('JPQ', 30, 0o020, '000', 'a');
def('JPB', 30, 0o020, '220', 'a');
def('JPBQ', 30, 0o020, '220', 'a');

// --- 03: branches on X
for (const [mn, f] of [['ZR', 0], ['NZ', 1], ['PL', 2], ['NG', 3], ['MI', 3], ['IR', 4], ['OR', 5], ['DF', 6], ['ID', 7]]) {
  def(mn + 'X,Q', 30, 0o030 | f, '020');
}

// --- 04-07: branches on B
def('EQQ', 30, 0o040, '000', 'a');
def('ZRQ', 30, 0o040, '000', 'a');
for (const mn of ['EQ', 'ZR']) def(mn + 'B,Q', 30, 0o040, '200');
def('EQB,B,Q', 30, 0o040, '320');
for (const mn of ['NE', 'NZ']) def(mn + 'B,Q', 30, 0o050, '200');
def('NEB,B,Q', 30, 0o050, '320');
for (const mn of ['GE', 'PL']) def(mn + 'B,Q', 30, 0o060, '200');
def('GEB,B,Q', 30, 0o060, '320');
def('LEB,B,Q', 30, 0o060, '230');
def('LEB,Q', 30, 0o060, '020');
for (const mn of ['LT', 'NG', 'MI']) def(mn + 'B,Q', 30, 0o070, '200');
def('LTB,B,Q', 30, 0o070, '320');
def('GTB,B,Q', 30, 0o070, '230');
def('GTB,Q', 30, 0o070, '020');

// --- 10-17: Boolean
def('BXX', 15, 0o100, '122');
def('BXX*X', 15, 0o110, '132');
def('BXX+X', 15, 0o120, '132');
def('BXX-X', 15, 0o130, '132');
def('BX-X', 15, 0o140, '122');
def('BX-X*X', 15, 0o150, '123');
def('BX-X+X', 15, 0o160, '123');
def('BX-X-X', 15, 0o170, '123');

// --- 20-27: shifts, normalize, pack
def('LXQ', 15, 0o200, '100', 'j');
def('AXQ', 15, 0o210, '100', 'j');
for (const [mn, pos, neg] of [['LX', 0o220, 0o230], ['AX', 0o230, 0o220]]) {
  def(mn + 'B,X', 15, pos, '132');
  def(mn + 'X,B', 15, pos, '123');
  def(mn + 'X', 15, pos, '102');
  def(mn + 'B', 15, pos, '121');
  def(mn + '-B,X', 15, neg, '132');
  def(mn + 'X,-B', 15, neg, '123');
  def(mn + '-B', 15, neg, '121');
}
for (const [mn, v] of [['NX', 0o240], ['ZX', 0o250], ['UX', 0o260], ['PX', 0o270]]) {
  def(mn + 'B,X', 15, v, '132');
  def(mn + 'X,B', 15, v, '123');
  def(mn + 'X', 15, v, '102');
  def(mn, 15, v, '101');
  def(mn + 'B', 15, v, '121');
}

// --- 30-47: arithmetic
for (const [key, v] of [
  ['FXX+X', 0o300], ['FXX-X', 0o310], ['DXX+X', 0o320], ['DXX-X', 0o330], ['RXX+X', 0o340],
  ['RXX-X', 0o350], ['IXX+X', 0o360], ['IXX-X', 0o370], ['FXX*X', 0o400], ['RXX*X', 0o410],
  ['DXX*X', 0o420], ['IXX*X', 0o420], ['FXX/X', 0o440], ['RXX/X', 0o450],
]) def(key, 15, v, '132');
def('MXQ', 15, 0o430, '100', 'j');
def('NO', 15, 0o460, '000');
def('NOQ', 15, 0o460, '000', 'n');
def('CXX', 15, 0o470, '122');
def('IMQ', 30, 0o464, '000', 'ba');
def('IMB', 30, 0o464, '020', 'ba');
def('IMBQ', 30, 0o464, '020', 'ba');

// --- 50-77: increment (SA, SB, SX)
for (const [mn, base] of [['SA', 0o500], ['SB', 0o600], ['SX', 0o700]]) {
  def(mn + 'Q', 30, base | 0o10, '100');
  def(mn + 'AQ', 30, base, '120');
  def(mn + 'BQ', 30, base | 0o10, '120');
  def(mn + 'XQ', 30, base | 0o20, '120');
  def(mn + 'X', 15, base | 0o30, '120');
  def(mn + 'X+B', 15, base | 0o30, '132');
  def(mn + 'B+X', 15, base | 0o30, '123');
  def(mn + 'A', 15, base | 0o40, '120');
  def(mn + 'A+B', 15, base | 0o40, '132');
  def(mn + 'B+A', 15, base | 0o40, '123');
  def(mn + 'A-B', 15, base | 0o50, '132');
  def(mn + '-B+A', 15, base | 0o50, '123');
  def(mn + 'B', 15, base | 0o60, '120');
  def(mn + 'B+B', 15, base | 0o60, '132');
  def(mn + '-B', 15, base | 0o70, '102');
  def(mn + 'B-B', 15, base | 0o70, '132');
  def(mn + '-B+B', 15, base | 0o70, '123');
}
def('CRX,X', 15, 0o660, '032', '8');
def('CWX,X', 15, 0o670, '032', '8');

/** Two-letter mnemonics recognized syntactically (for IF MAC, highlighting). */
export const CPU_MNEMONICS = new Set([...CPU_SYNTAX.keys()].map((k) => k.slice(0, 2)));

/**
 * Builds the syntax key from the parsed subfields.
 * @param mnem two characters; opReg true if the 2nd character designates a register
 * @param subs [{ regs: [{type, n, op}], hasQ }]
 */
export function syntaxKey(mnem, subs) {
  const parts = subs.map((s) => {
    let d = '';
    s.regs.forEach((r, idx) => {
      if (idx === 0) d += (r.op === '-' ? '-' : '') + r.type;
      else d += r.op + r.type;
    });
    if (s.hasQ) d += 'Q';
    return d;
  });
  // the form "EQ K" is keyed EQQ (Q appended to the mnemonic when there is only one descriptor)
  if (parts.length === 0) return mnem;
  if (parts.length === 1) return mnem + parts[0];
  return mnem + parts[0] + (parts.length > 1 ? ',' + parts.slice(1).join(',') : '');
}
