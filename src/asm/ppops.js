// PP instructions (6000 series, Cyber 70/170): mnemonic entries.
//
// Formats (as in PPOP):
//   none   no operand (PSN, MXN...) - d optional for EXN/MXN/MAN/RPN
//   d      6-bit operand (LDN, LDD, LDI, CRD, IAN, ACN...)
//   rel    6-bit relative jump (UJN, ZJN, NJN, PJN, MJN)
//   shift  6-bit signed shift (SHN)
//   c18    18-bit constant in d||m (LDC, ADC, LPC, LMC)
//   md     m,d with d optional (LJM, RJM, LDM...SOM)
//   mdr    m,d with d required (CRM, CWM, AJM...EJM, IAM, OAM, FNC)

export const PP_OPS = new Map();

function def(name, code, fmt, extra = {}) {
  PP_OPS.set(name, { name, code, fmt, builtin: true, ...extra });
}

def('PSN', 0o24, 'none', { fixed: 0o2400 });
def('LJM', 0o01, 'md');
def('RJM', 0o02, 'md');
def('UJN', 0o03, 'rel');
def('ZJN', 0o04, 'rel');
def('NJN', 0o05, 'rel');
def('PJN', 0o06, 'rel');
def('MJN', 0o07, 'rel');
def('SHN', 0o10, 'shift');
['LMN', 'LPN', 'SCN', 'LDN', 'LCN', 'ADN', 'SBN'].forEach((n, k) => def(n, 0o11 + k, 'd'));
['LDC', 'ADC', 'LPC', 'LMC'].forEach((n, k) => def(n, 0o20 + k, 'c18'));
def('LRD', 0o24, 'd', { machine: '8' });
def('SRD', 0o25, 'd', { machine: '8' });
def('EXN', 0o26, 'optd', { base: 0o00 });
def('MXN', 0o26, 'optd', { base: 0o10 });
def('MAN', 0o26, 'optd', { base: 0o20 });
def('RPN', 0o27, 'optd', { base: 0o00 });
['LDD', 'ADD', 'SBD', 'LMD', 'STD', 'RAD', 'AOD', 'SOD'].forEach((n, k) => def(n, 0o30 + k, 'd'));
['LDI', 'ADI', 'SBI', 'LMI', 'STI', 'RAI', 'AOI', 'SOI'].forEach((n, k) => def(n, 0o40 + k, 'd'));
['LDM', 'ADM', 'SBM', 'LMM', 'STM', 'RAM', 'AOM', 'SOM'].forEach((n, k) => def(n, 0o50 + k, 'md'));
def('CRD', 0o60, 'd');
def('CRM', 0o61, 'mdr');
def('CWD', 0o62, 'd');
def('CWM', 0o63, 'mdr');
def('AJM', 0o64, 'mdr');
def('IJM', 0o65, 'mdr');
def('FJM', 0o66, 'mdr');
def('EJM', 0o67, 'mdr');
// Cyber 170 channel flags: 5-bit channel, bit 40B of d set.
def('SCF', 0o64, 'mdr', { flag: 0o40 });
def('CCF', 0o65, 'mdr', { flag: 0o40 });
def('SFM', 0o66, 'mdr', { flag: 0o40 });
def('CFM', 0o67, 'mdr', { flag: 0o40 });
def('IAN', 0o70, 'd');
def('IAM', 0o71, 'mdr');
def('OAN', 0o72, 'd');
def('OAM', 0o73, 'mdr');
def('ACN', 0o74, 'd');
def('DCN', 0o75, 'd');
def('FAN', 0o76, 'd');
def('FNC', 0o77, 'mdr');
// 7600 (PPU)
def('ESN', 0o77, 'none', { fixed: 0o7700, machine: '7' });
def('RFN', 0o74, 'd', { machine: '7' });

/** Length in words of a PP instruction for its format. */
export function ppLength(fmt) {
  return fmt === 'c18' || fmt === 'md' || fmt === 'mdr' ? 2 : 1;
}
