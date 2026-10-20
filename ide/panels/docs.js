// Documentation intégrée (en français) : prise en main de l'IDE, format
// COMPASS, pseudo-instructions, instructions CPU et PP, code display,
// périphériques. Les données viennent des spécifications docs/spec/*.md.

import { h, esc, o } from '../dom.js';
import { DISPLAY, DISPLAY_CDC, displayToExtBcd, EXT_BCD } from '../../src/common/charset.js';
import { PP_TIMES } from '../../src/pp/pp.js';
import { PP_MNEMONICS } from '../../src/pp/disasm.js';

const T = (rows, head, cls = '') => `<table class="grid-table doc-table ${cls}"><thead><tr>${head.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' class="mono strong"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const code = (s) => `<code>${esc(s)}</code>`;
const pre = (s) => `<pre class="doc-pre">${esc(s)}</pre>`;
const kbd = (s) => s.split('+').map((k) => `<kbd>${esc(k)}</kbd>`).join('+');

// ---------------------------------------------------------------- contenu

const IDE = `
<p>L'<b>Atelier COMPASS</b> réunit un éditeur de source COMPASS 3, l'assembleur, un émulateur complet du
CDC 6600 (CPU, 10 processeurs périphériques, 12 canaux) et ses périphériques d'origine : console 6612,
lecteur de cartes 405, imprimante 1612, dérouleurs de bande 607 et horloge temps réel.</p>
<h3>Cycle de travail</h3>
<ol>
<li><b>Écrire</b> le programme dans l'éditeur (à gauche). Les colonnes conventionnelles 11, 18 et 30 sont marquées ;
la touche ${kbd('Tab')} saute à la colonne suivante. Au-delà de la colonne 72 commence le champ de séquence, ignoré par l'assembleur.</li>
<li><b>Assembler</b> avec ${kbd('F7')} ou ${kbd('Ctrl+B')}. Les erreurs sont marquées dans la gouttière (survolez la marque pour lire le message)
et listées dans l'onglet <i>Problèmes</i> ; un clic mène à la ligne.</li>
<li><b>Exécuter</b> avec ${kbd('F5')} : le programme est assemblé si besoin, chargé selon le mode d'exécution, puis lancé.
${kbd('F6')} interrompt, ${kbd('F10')} exécute une instruction CPU, ${kbd('Maj+F10')} une instruction du PP courant.</li>
<li><b>Observer</b> : registres CPU, désassemblage, mémoire centrale, PP, canaux, console, imprimante.</li>
</ol>
<h3>Modes d'exécution</h3>
${T([
  ['Automatique', 'Choisit « PP » pour un programme PP (PERIPH), « Système » pour un programme CPU relogeable, « CPU nu » pour un programme absolu (ABS).'],
  ['Système', 'Le programme devient un travail du mini-système : chargé en RA = 2000B (+100B), moniteur MTR dans PP0, console DSD dans PP1. Il appelle le système par les macros du texte SYSTEXT (MESSAGE, ENDRUN, ABORT, READC, WRITEC, WRITER, CDD, COD, TIME, DATE…) ; le fichier OUTPUT est imprimé sur la 1612, INPUT est lu sur le lecteur 405. L’exécution s’arrête à la fin du travail ; l’onglet Journal montre le dayfile. DROP puis Entrée sur la console abandonne le travail.'],
  ['Système (deadstart sur bande)', 'Comme « Système », mais la machine démarre par un vrai deadstart : une bande système est écrite sur l’unité 0 (chargeur DSL, images de la mémoire centrale, DSD, MTR) et le panneau de deadstart du système la lit (DCN 13B ; FNC 2000B,13B ; FNC 2020B,13B ; ACN 13B ; LDC 1000B ; IAM 7000B,13B ; LJM 7000B). La bande peut être exportée au format .tap depuis l’onglet Périphériques > Bandes.'],
  ['CPU nu', 'Le programme absolu (ABS) est chargé en RA ; un programme relogeable est placé en RA+100B. Le CPU démarre à l\'adresse d\'entrée avec le mode de sortie choisi ; il s\'arrête sur PS ou sur une sortie d\'erreur. Les PP restent au repos.'],
  ['PP', 'Le programme PP est chargé dans le PP choisi (PP0 par défaut) à son origine et démarré à son point d\'entrée. Les autres PP attendent un chargement sur leur canal, comme après un deadstart.'],
  ['Deadstart', 'Séquence de démarrage réelle : les 16 mots du panneau (onglet Deadstart) sont chargés dans PP0 à partir de 1 et PP0 démarre en 1.'],
], ['Mode', 'Effet'])}
<h3>Points d'arrêt</h3>
<p>Cliquez dans la gouttière de l'éditeur (ou ${kbd('F9')} sur la ligne courante). Le point d'arrêt est placé sur le mot qui contient
la première parcelle de la ligne : le CPU s'arrête au début de ce mot. Dans les vues de désassemblage (CPU et PP), un clic
sur la colonne d'adresse pose un point d'arrêt par adresse. Dans la vue mémoire, l'œil pose un point de surveillance :
la machine s'arrête dès qu'un mot surveillé est écrit.</p>
<h3>Console 6612</h3>
<p>Cliquez sur un écran pour lui donner le clavier : les touches sont transmises à la console (lecture par le PP avec
${code('FNC 7020B')} puis ${code('IAN')}). ${kbd('Entrée')} envoie la touche CR (60B), ${kbd('Retour arrière')} la touche BKSP (61B).
Les écrans n'ont pas de mémoire : le programme doit les redessiner sans cesse ; un tracé non rafraîchi s'estompe (rémanence).</p>
<h3>Fichiers</h3>
<p>L'espace de travail est conservé dans le navigateur. Les fichiers <i>.txt</i> sont des textes utilisables par
${code('XTEXT nom')} : l'assembleur reçoit tous les fichiers de l'espace, nommés sans extension et en majuscules.
Les exemples fournis s'ouvrent par le panneau Fichiers.</p>`;

const FORMAT = `
<p>Une ligne source correspond à une carte : seules les colonnes 1 à 72 sont interprétées ; les colonnes 73 à 90 forment le champ de séquence.</p>
${T([
  ['1', 'blanc, <b>*</b> (ligne de commentaire) ou <b>,</b> (continuation de la ligne précédente, à partir de la colonne 2)'],
  ['1–9', 'champ <b>location</b> : étiquette (symbole), ou + / − pour forcer le début de mot'],
  ['11–16', 'champ <b>opération</b> : instruction machine, pseudo-instruction ou macro'],
  ['18–29', 'champ <b>variable</b> : sous-champs séparés par des virgules, terminé par un blanc'],
  ['30–72', 'champ <b>commentaire</b> (un commentaire peut commencer après le premier blanc qui suit le champ variable)'],
  ['73–90', 'séquence (ignorée)'],
], ['Colonnes', 'Contenu'])}
<p>Le format est libre : la convention ci-dessus n'est pas obligatoire, mais tous les exemples du manuel la suivent.
L'opération est vide si rien ne la précède avant la colonne 30 ; un symbole seul en location équivaut à ${code('BSSZ 1')}.</p>
<h3>Données et constantes</h3>
${T([
  [code('77B'), 'octal (suffixe B)'], [code('100D'), 'décimal (suffixe D) ; base par défaut : décimale'],
  [code('1.5E3'), 'flottant (point décimal), DATA uniquement'], [code('10HTEXTE'), 'caractères cadrés à gauche, complétés par des blancs (n caractères exactement)'],
  [code('3LABC'), 'cadrés à gauche, complétés par des zéros'], [code('1R*'), 'cadrés à droite, complétés par des zéros'],
  [code('H*A B*'), 'chaîne délimitée (DATA, LIT, littéraux)'], [code('=10HMESSAGE'), 'littéral : le mot est créé dans le bloc des littéraux'],
  [code('*'), 'compteur d\'emplacement courant'], [code('"NOM"'), 'référence de micro (≠NOM≠ dans le jeu CDC), substituée avant l\'analyse'],
], ['Notation', 'Signification'])}
<h3>Registres (CPU)</h3>
<p>${code('X0')}–${code('X7')} : 60 bits ; ${code('A0')}–${code('A7')} : 18 bits d'adresse (charger A1–A5 lit la mémoire dans X1–X5,
charger A6–A7 écrit X6–X7) ; ${code('B0')}–${code('B7')} : 18 bits d'index (B0 vaut toujours 0).
L'arithmétique est en complément à un.</p>`;

const PSEUDO = [
  ['IDENT', 'IDENT nom[,origine,entrée]', 'Début de sous-programme. Absolu : origine et adresse de lancement. PP : IDENT nom,origine.'],
  ['END', 'END [symbole]', 'Fin de sous-programme (adresse de transfert en relogeable).'],
  ['ABS', 'ABS', 'Programme CPU absolu.'],
  ['PERIPH', 'PERIPH [J]', 'Programme PP 12 bits de la série 6000.'],
  ['ORG', 'ORG expression', 'Fixe le compteur d\'origine (adresse d\'assemblage).'],
  ['BSS', 'BSS n', 'Réserve n mots (non initialisés).'],
  ['BSSZ', 'BSSZ n', 'Réserve n mots à zéro.'],
  ['CON', 'CON e1,e2,…', 'Un mot par expression.'],
  ['DATA', 'DATA d1,d2,…', 'Données : nombres, flottants, caractères.'],
  ['DIS', 'DIS n,texte | DIS ,*texte*', 'Texte en code display ; le format délimité garantit 12 bits nuls en fin.'],
  ['VFD', 'VFD n1/e1,n2/e2,…', 'Champs de tailles quelconques (en bits) placés bout à bout.'],
  ['LIT', 'LIT d1,d2,…', 'Littéraux consécutifs.'],
  ['EQU (=)', 'sym EQU expression', 'Définit un symbole (une seule fois).'],
  ['SET', 'sym SET expression', 'Définit un symbole redéfinissable.'],
  ['MICRO', 'nom MICRO n1,n2,*chaîne*', 'Définit un micro (sous-chaîne de n2 caractères à partir de n1).'],
  ['BASE', 'BASE D|O|M', 'Base par défaut des nombres (décimal, octal, mixte).'],
  ['USE', 'USE bloc', 'Change de bloc de mémoire.'],
  ['ENTRY / EXT', 'ENTRY s1,… / EXT s1,…', 'Points d\'entrée et symboles externes (relogeable).'],
  ['MACRO … ENDM', 'nom MACRO p1,p2,…', 'Définition de macro ; LOCAL déclare des symboles propres à chaque appel.'],
  ['DUP … ENDD', 'DUP n[,compte]', 'Répète n fois une suite d\'instructions.'],
  ['ECHO … ENDD', 'ECHO [compte],P=(a,b,…)', 'Répète en substituant P par chaque élément.'],
  ['IFxx … ELSE … ENDIF', 'IFEQ e1,e2[,n]', 'Assemblage conditionnel (IFEQ, IFNE, IFGT, IFGE, IFLT, IFLE, IFPL, IFMI, IFC, IFCP, IFPP…).'],
  ['XTEXT', 'XTEXT nom', 'Insère un texte externe (fichier de l\'espace de travail).'],
  ['LIST / TITLE / EJECT / SPACE', '', 'Contrôle du listing.'],
  ['ERR / ERRNZ / ERRMI…', 'ERRNZ expression', 'Erreur d\'assemblage conditionnelle.'],
];

// Instructions CPU : [octal, syntaxe, opération, unité, temps (cycles mineurs de 100 ns)]
const CPU = [
  ['00', 'PS', 'Arrêt du programme', 'branch', '—'],
  ['0100', 'RJ K', 'Saut avec retour : écrit EQ P+1 en K, continue en K+1', 'branch', '14'],
  ['011 / 012', 'RE Bj+K / WE Bj+K', 'Lecture / écriture de blocs en ECS (X0 = adresse ECS, A0 = adresse CM)', 'branch', 'selon ECS'],
  ['013', 'XJ Bj+K', 'Exchange jump (CEJ/MEJ)', 'branch', '≈ 26'],
  ['02', 'JP Bi+K', 'Saut à Bi+K (vide la pile)', 'branch', '14'],
  ['030–037', 'ZR NZ PL NG IR OR DF ID Xj,K', 'Sauts sur Xj : nul, non nul, positif, négatif, dans/hors limites, défini/indéfini', 'branch', '9 / 14'],
  ['04–07', 'EQ NE GE LT Bi,Bj,K', 'Sauts sur comparaison de Bi et Bj (EQ K : saut inconditionnel)', 'branch', '8 / 14'],
  ['10–17', 'BXi Xj, Xj*Xk, Xj+Xk, Xj-Xk, -Xk…', 'Transfert, ET, OU, OU exclusif, complément', 'boolean', '3'],
  ['20 / 21', 'LXi jk / AXi jk', 'Décalage circulaire à gauche / arithmétique à droite', 'shift', '3'],
  ['22 / 23', 'LXi Bj,Xk / AXi Bj,Xk', 'Décalage de Xk de (Bj) positions', 'shift', '3'],
  ['24 / 25', 'NXi Bj,Xk / ZXi Bj,Xk', 'Normalisation (arrondie pour ZX), nombre de décalages dans Bj', 'shift', '4'],
  ['26 / 27', 'UXi Bj,Xk / PXi Bj,Xk', 'Décomposition / composition (coefficient, exposant)', 'shift', '3'],
  ['30 / 31', 'FXi Xj+Xk / FXi Xj-Xk', 'Addition / soustraction flottante', 'add', '4'],
  ['32 / 33', 'DXi Xj+Xk / DXi Xj-Xk', 'Idem, partie basse (double précision)', 'add', '4'],
  ['34 / 35', 'RXi Xj+Xk / RXi Xj-Xk', 'Idem, arrondie', 'add', '4'],
  ['36 / 37', 'IXi Xj+Xk / IXi Xj-Xk', 'Addition / soustraction entière 60 bits', 'long add', '3'],
  ['40 / 41 / 42', 'FX / RX / DXi Xj*Xk', 'Multiplication flottante (DX : partie basse, produit entier)', 'multiply', '10'],
  ['43', 'MXi jk', 'Masque de jk bits à gauche', 'shift', '3'],
  ['44 / 45', 'FXi Xj/Xk / RXi Xj/Xk', 'Division flottante (RX : arrondie)', 'divide', '29'],
  ['46', 'NO', 'Pas d\'opération (bourrage)', '—', '—'],
  ['47', 'CXi Xk', 'Nombre de bits à 1 de Xk', 'divide', '8'],
  ['50–57', 'SAi Aj+K, Bj+K, Xj+K, Xj+Bk, Aj±Bk, Bj±Bk', 'Positionne Ai (lecture de Xi pour i=1–5, écriture pour 6–7)', 'increment', '3 (+5 mémoire)'],
  ['60–67', 'SBi …', 'Positionne Bi (mêmes formes)', 'increment', '3'],
  ['70–77', 'SXi …', 'Positionne Xi (18 bits étendus en signe)', 'increment', '3'],
];

const PP_DESC = {
  PSN: 'Pas d\'opération', LJM: 'Saut à m+(d)', RJM: 'Saut avec retour : [m+(d)] = P+2, P = m+(d)+1', UJN: 'Saut relatif inconditionnel',
  ZJN: 'Saut relatif si A = 0', NJN: 'Saut relatif si A ≠ 0', PJN: 'Saut relatif si A ≥ 0', MJN: 'Saut relatif si A < 0',
  SHN: 'Décalage de A (circulaire à gauche, à droite sans signe)', LMN: 'A = A ⊕ d', LPN: 'A = A ∧ d', SCN: 'Efface dans A les bits de d',
  LDN: 'A = d', LCN: 'A = ¬d', ADN: 'A = A + d', SBN: 'A = A − d', LDC: 'A = c (18 bits)', ADC: 'A = A + c', LPC: 'A = A ∧ c', LMC: 'A = A ⊕ c',
  EXN: 'Exchange jump du CPU vers (A)', RPN: 'A = P du CPU', LDD: 'A = (d)', ADD: 'A = A + (d)', SBD: 'A = A − (d)', LMD: 'A = A ⊕ (d)',
  STD: '(d) = A', RAD: 'A = A + (d), (d) = A', AOD: 'A = (d) + 1, (d) = A', SOD: 'A = (d) − 1, (d) = A',
  LDI: 'A = ((d))', ADI: 'A = A + ((d))', SBI: 'A = A − ((d))', LMI: 'A = A ⊕ ((d))', STI: '((d)) = A', RAI: 'A = A + ((d)), ((d)) = A',
  AOI: 'A = ((d)) + 1, ((d)) = A', SOI: 'A = ((d)) − 1, ((d)) = A', LDM: 'A = (m+(d))', ADM: 'A = A + (m+(d))', SBM: 'A = A − (m+(d))',
  LMM: 'A = A ⊕ (m+(d))', STM: '(m+(d)) = A', RAM: 'A = A + (m+(d)), (m+(d)) = A', AOM: 'A = (m+(d)) + 1, rangé', SOM: 'A = (m+(d)) − 1, rangé',
  CRD: 'Lit le mot CM d\'adresse (A) dans d…d+4', CRM: 'Lit (d) mots CM à partir de (A) dans m…', CWD: 'Écrit d…d+4 en CM à (A)',
  CWM: 'Écrit (d) mots de m… en CM à partir de (A)', AJM: 'Saut à m si le canal c est actif', IJM: 'Saut à m si le canal c est inactif',
  FJM: 'Saut à m si le canal c est plein', EJM: 'Saut à m si le canal c est vide', IAN: 'A = mot lu sur le canal c', IAM: 'Lit (A) mots du canal c dans m…',
  OAN: 'Écrit A sur le canal c', OAM: 'Écrit (A) mots de m… sur le canal c', ACN: 'Active le canal c', DCN: 'Désactive le canal c',
  FAN: 'Envoie la fonction A au canal c', FNC: 'Envoie la fonction m au canal c',
};
const PP_SYNTAX = (mn, f) => {
  if (['LJM', 'RJM', 'LDM', 'ADM', 'SBM', 'LMM', 'STM', 'RAM', 'AOM', 'SOM'].includes(mn)) return `${mn} m,d`;
  if (['CRM', 'CWM'].includes(mn)) return `${mn} m,d`;
  if (['AJM', 'IJM', 'FJM', 'EJM', 'IAM', 'OAM', 'FNC'].includes(mn)) return `${mn} m,c`;
  if (['IAN', 'OAN', 'ACN', 'DCN', 'FAN'].includes(mn)) return `${mn} c`;
  if (f >= 0o03 && f <= 0o07) return `${mn} r (±31)`;
  if (f === 0o10) return 'SHN ±r';
  if (f >= 0o20 && f <= 0o23) return `${mn} c`;
  if (mn === 'PSN' || mn === 'RPN') return mn;
  if (mn === 'EXN') return 'EXN';
  return `${mn} d`;
};

const DEVICES = `
<h3>Console 6612 (canal 10B)</h3>
${T([
  ['7000B / 7001B / 7002B', 'Écran gauche, caractères petits (64 par ligne), moyens (32), grands (16)'],
  ['7010B', 'Écran gauche, mode points'],
  ['7100B / 7101B / 7102B / 7110B', 'Mêmes choix pour l\'écran droit'],
  ['7020B', 'Lecture du clavier : IAN rend le code display de la touche (0 si aucune)'],
], ['Fonction', 'Effet'])}
<p>Après ${code('FNC')} et ${code('ACN')}, les mots envoyés par ${code('OAM')} sont interprétés ainsi :
${code('60xx')}–${code('67xx')} = coordonnée X (9 bits), ${code('70xx')}–${code('77xx')} = coordonnée Y (9 bits, Y croît vers le haut),
sinon deux caractères display ; X avance de la largeur d'un caractère après chaque caractère.</p>
${pre(`          FNC    7001B,10B     ECRAN GAUCHE, CARACTERES MOYENS
          ACN    10B
          LDN    N             NOMBRE DE MOTS
          OAM    TEXTE,10B
          DCN    10B
TEXTE     CON    6000B+100B,7000B+400B
          DIS    4,BONJOUR`)}
<h3>Lecteur de cartes 405 (canal 12B)</h3>
<p>${code('FNC 702B,12B')} lance la lecture d'une carte, puis ${code('ACN 12B')} et ${code('IAM tampon,12B')} avec A = 80 :
chaque colonne arrive en code Hollerith sur 12 bits (bit 11 = ligne 12, bit 10 = ligne 11, bit 9 = ligne 0, bits 8–0 = lignes 1–9).
Le canal se déconnecte seul à la fin de la carte. Si le magasin est vide, l'IAM se termine avec A non nul.
${code('704B')} demande l'état (0 = prêt).</p>
<h3>Imprimante 1612 (canal 12B)</h3>
${T([
  ['600B', 'Sélection de l\'imprimante'], ['601B / 602B', 'Simple / double interligne'], ['604B', 'Saut de page'],
  ['605B', 'Impression de la ligne reçue'], ['606B', 'Supprime l\'avance du papier'], ['607B', 'Demande d\'état'],
], ['Fonction', 'Effet'])}
<p>Les caractères sont envoyés un par mot, en BCD externe (6 bits bas), 136 au plus par ligne.</p>
<h3>Bande 607 (canal 13B)</h3>
${T([
  ['2000B+u', 'Sélection de l\'unité u'], ['2010B / 2020B', 'Écriture / lecture binaire d\'un enregistrement'], ['2030B', 'Retour d\'un enregistrement'],
  ['2060B', 'Rembobinage'], ['2070B', 'Déchargement'], ['2100B', 'Demande d\'état'], ['2610B', 'Écriture d\'une marque de fichier'],
], ['Fonction', 'Effet'])}
<h3>Horloge temps réel (canal 14B)</h3>
<p>Canal toujours actif et plein : ${code('IAN 14B')} rend le temps simulé en microsecondes, modulo 4096.</p>
<h3>Panneau de deadstart (canal 0)</h3>
<p>16 mots de 12 interrupteurs, chargés dans PP0 à partir de l'adresse 1 au deadstart ; PP0 démarre en 1.</p>`;

const XPKG = `
<p>Le paquet d'échange occupe 16 mots. L'instruction ${code('XJ')} (CPU) ou ${code('EXN')} (PP) échange tous les registres avec lui.</p>
${T([
  ['0', 'P (bits 53–36), A0 (bits 35–18)'], ['1', 'RA (bits 59–36), A1, B1'], ['2', 'FL, A2, B2'], ['3', 'EM (mode de sortie), A3, B3'],
  ['4', 'RAE (ECS), A4, B4'], ['5', 'FLE (ECS), A5, B5'], ['6', 'MA (adresse du moniteur), A6, B6'], ['7', 'réservé, A7, B7'],
  ['10–17', 'X0 à X7'],
], ['Mot', 'Contenu'])}
<p>Mode de sortie (EM) : ${code('010000B')} adresse hors limites, ${code('020000B')} opérande infini, ${code('040000B')} opérande indéfini.
Lors d'une sortie d'erreur, le CPU s'arrête et écrit en RA la condition (bits 59–48) et P+1 (bits 47–30).</p>
<p>Un mot de 60 bits contient quatre parcelles de 15 bits ; une instruction fait 15 ou 30 bits et une instruction de
30 bits ne peut pas commencer en parcelle 3. Un saut reprend toujours en parcelle 0 (début de mot).</p>`;

function displayTable() {
  let html = '<table class="grid-table doc-table display-table"><thead><tr><th></th>';
  for (let c = 0; c < 8; c++) html += `<th>${c}</th>`;
  html += '</tr></thead><tbody>';
  for (let r = 0; r < 8; r++) {
    html += `<tr><th>${r}x</th>`;
    for (let c = 0; c < 8; c++) {
      const code = r * 8 + c;
      const a = DISPLAY[code], g = DISPLAY_CDC[code];
      const bcd = displayToExtBcd(code);
      html += `<td data-tip="${o(code, 2)}B : ${esc(g)}${g !== a ? ` (ASCII ${esc(a)})` : ''} · BCD externe ${o(bcd, 2)}B"><span class="dc-g">${esc(g === ' ' ? '␣' : g)}</span><span class="dc-a mono">${esc(a === ' ' ? '' : g !== a ? a : '')}</span></td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

const SHORTCUTS = [
  ['F7 / Ctrl+B', 'Assembler le fichier courant'], ['F5', 'Exécuter (assemble et charge si nécessaire)'], ['F6', 'Pause'],
  ['F10', 'Pas à pas : une instruction CPU'], ['Maj+F10', 'Pas à pas : une instruction du PP courant'], ['Ctrl+Maj+F5', 'Recharger le programme (réinitialisation)'],
  ['F9', 'Basculer le point d\'arrêt de la ligne courante'], ['Ctrl+S', 'Enregistrer le fichier'], ['Ctrl+F / Ctrl+H', 'Rechercher / remplacer'],
  ['F3 / Maj+F3', 'Occurrence suivante / précédente'], ['Ctrl+G', 'Aller à la ligne'], ['Tab / Maj+Tab', 'Colonne conventionnelle suivante / précédente (11, 18, 30)'],
  ['Ctrl+Z / Ctrl+Y', 'Annuler / rétablir'], ['Ctrl+N', 'Nouveau fichier'], ['F1', 'Aide des raccourcis'],
];
export { SHORTCUTS };

// ------------------------------------------------------------------ panneau

export class DocsPanel {
  constructor(ctx) {
    this.ctx = ctx;
    const ppRows = PP_MNEMONICS.map((mn, f) => [f, mn]).filter(([f, mn]) => !(mn === 'PSN' && f !== 0))
      .map(([f, mn]) => [`${o(f, 2)}`, code(PP_SYNTAX(mn, f)), esc(PP_DESC[mn] || ''), `${PP_TIMES[f]}`]);
    this.sections = [
      { id: 'ide', title: 'Prise en main', html: IDE },
      { id: 'raccourcis', title: 'Raccourcis clavier', html: T(SHORTCUTS.map(([k, d]) => [kbd(k), esc(d)]), ['Touches', 'Action'], 'keys') },
      { id: 'format', title: 'Format COMPASS', html: FORMAT },
      { id: 'pseudo', title: 'Pseudo-instructions', html: T(PSEUDO.map(([a, b, c]) => [esc(a), b ? code(b) : '', esc(c)]), ['Nom', 'Forme', 'Rôle']) },
      { id: 'cpu', title: 'Instructions CPU', html: `<p>Temps du 6600 en cycles mineurs (100 ns) ; le CPU émet au plus une instruction par cycle vers dix unités fonctionnelles indépendantes (tableau de marque). Sauts : temps court si la cible est dans la pile d'instructions (8 mots).</p>${T(CPU.map(([a, b, c, d, e]) => [a, code(b), esc(c), esc(d), e]), ['Code', 'Syntaxe', 'Opération', 'Unité', 'Temps'])}` },
      { id: 'pp', title: 'Instructions PP', html: `<p>Instructions de 12 bits (f d) ou 24 bits (f d m). d : adresse directe (0–77B) ou opérande ; m : adresse ou constante de 12 bits ; c : canal. Temps en cycles majeurs (1 µs) ; les instructions de bloc durent en plus un cycle par mot.</p>${T(ppRows, ['Code', 'Syntaxe', 'Opération', 'µs'])}` },
      { id: 'display', title: 'Code display', html: `<p>Jeu de 64 caractères de 6 bits. Ligne = chiffre octal de poids fort, colonne = chiffre de poids faible. Les graphies CDC d'origine sont affichées ; leur équivalent ASCII, utilisé dans les sources, est indiqué en petit.</p>${displayTable()}` },
      { id: 'periph', title: 'Périphériques et canaux', html: DEVICES },
      { id: 'echange', title: 'Paquet d\'échange', html: XPKG },
    ];
    this.toc = h('nav', { class: 'doc-toc' });
    this.content = h('div', { class: 'doc-content' });
    this.search = h('input', { class: 'tinput doc-search', type: 'search', placeholder: 'Rechercher dans l\'aide', spellcheck: 'false' });
    this.search.addEventListener('input', () => this.filter(this.search.value));
    for (const s of this.sections) {
      const a = h('button', { class: 'toc-item', type: 'button', onclick: () => this.go(s.id) }, s.title);
      s.toc = a;
      this.toc.append(a);
      s.el = h('section', { class: 'doc-sec', id: `doc-${s.id}` }, h('h2', null, s.title), h('div', { html: s.html }));
      this.content.append(s.el);
    }
    this.content.addEventListener('scroll', () => this.spy());
    this.el = h('div', { class: 'panel panel-docs' }, h('div', { class: 'doc-side' }, this.search, this.toc), this.content);
    this.spy();
  }

  go(id) {
    const s = this.sections.find((x) => x.id === id);
    if (s) this.content.scrollTop = s.el.offsetTop - 8;
  }

  spy() {
    const top = this.content.scrollTop + 30;
    let cur = this.sections[0];
    for (const s of this.sections) if (s.el.offsetTop <= top && !s.el.classList.contains('hidden')) cur = s;
    for (const s of this.sections) s.toc.classList.toggle('active', s === cur);
  }

  filter(q) {
    const t = q.trim().toLowerCase();
    for (const s of this.sections) {
      const hit = !t || s.el.textContent.toLowerCase().includes(t);
      s.el.classList.toggle('hidden', !hit);
      s.toc.classList.toggle('hidden', !hit);
      for (const tr of s.el.querySelectorAll('tbody tr')) tr.classList.toggle('hidden', !!t && !tr.textContent.toLowerCase().includes(t) && !s.title.toLowerCase().includes(t));
    }
    this.spy();
  }

  onShow() {}

  update() {}
}

export { EXT_BCD };
