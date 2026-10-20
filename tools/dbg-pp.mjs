import { assemble } from '../src/asm/compass.js';
import { Machine } from '../src/machine.js';
import { loadPP } from '../src/loader/loader.js';
import { disasmPP } from '../src/pp/disasm.js';
const src = `
          IDENT  CON,100B
          PERIPH
 CH       EQU    10B
          ORG    100B
 START    FNC    7000B,CH
          ACN    CH
          LDN    MSGL
          OAM    MSG,CH
          DCN    CH
          UJN    START
 MSG      CON    6100B,7600B
          DIS    ,*OK*
 MSGL     EQU    *-MSG
          END`;
const r = assemble(src);
console.log(r.programs[0].overlays[0], r.programs[0].entry);
const m = new Machine({ ecsWords: 0 });
loadPP(m, r.programs[0], 0);
m.startPP(0, r.programs[0].entry);
for (let i = 0; i < 30; i++) { const pp = m.pps[0]; console.log(pp.P.toString(8), disasmPP(pp.mem, pp.P).text, pp.A.toString(8), pp.busy, pp.hungOn); m.run(1); }
console.log(m.console.trace.slice(0,10));
const m2 = new Machine({ ecsWords: 0 });
for (let n = 1; n < 10; n++) m2.idlePP(n);
loadPP(m2, r.programs[0], 0);
m2.startPP(0, r.programs[0].entry);
m2.run(2000);
console.log('trace', m2.console.trace.length, m2.pps[8].P.toString(8), m2.pps[8].hungOn, m2.channels[8].active, m2.pps[0].hungOn, m2.pps[0].P.toString(8));
