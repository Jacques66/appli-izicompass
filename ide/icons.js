// IDE icons: inline SVG, 16 x 16 grid, "currentColor" stroke.

const P = {
  file: '<path d="M4 1.75h5l3 3v9.5H4z"/><path d="M9 1.75v3h3"/>',
  fileText: '<path d="M4 1.75h5l3 3v9.5H4z"/><path d="M9 1.75v3h3M6 8h4M6 10.5h4"/>',
  filePlus: '<path d="M4 1.75h5l3 3v9.5H4z"/><path d="M9 1.75v3h3M8 7.5v4M6 9.5h4"/>',
  folder: '<path d="M1.75 3.75h4.5l1.5 1.5h6.5v7.5H1.75z"/>',
  upload: '<path d="M8 10.5V2.5M5 5.5l3-3 3 3M2.5 10.5v3h11v-3"/>',
  download: '<path d="M8 2.5v8M5 7.5l3 3 3-3M2.5 10.5v3h11v-3"/>',
  save: '<path d="M2.5 2.5h9l2 2v9h-11z"/><path d="M5 2.5v3.5h5V2.5M5 13.5v-4h6v4"/>',
  hammer: '<path d="M9.5 2.5l4 4-1.5 1.5-4-4z"/><path d="M8 4l-1.5-1.5L8.5 1l2.5 2.5M9 7.5l-6 6-1.5-1.5 6-6"/>',
  play: '<path d="M4.5 2.75v10.5l8.5-5.25z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M5 3v10M11 3v10" stroke-width="2.4"/>',
  stepCpu: '<path d="M2 4.5h7.5a3 3 0 010 6H6"/><path d="M8 8.5l-2 2 2 2"/><circle cx="3" cy="12.5" r="1.25" fill="currentColor" stroke="none"/>',
  stepPp: '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M5.5 6.5l2 1.5-2 1.5M9 10h2"/>',
  reset: '<path d="M3 8a5 5 0 105-5H5.5"/><path d="M6.5 1l-2 2 2 2"/>',
  stop: '<rect x="3.5" y="3.5" width="9" height="9" rx="1" fill="currentColor" stroke="none"/>',
  load: '<path d="M8 2v7.5M5 6.5l3 3 3-3"/><rect x="2" y="11" width="12" height="3" rx="1"/>',
  gear: '<circle cx="8" cy="8" r="2.25"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>',
  sun: '<circle cx="8" cy="8" r="2.75"/><path d="M8 1v1.75M8 13.25V15M1 8h1.75M13.25 8H15M3 3l1.25 1.25M11.75 11.75L13 13M3 13l1.25-1.25M11.75 4.25L13 3"/>',
  moon: '<path d="M13 9.5A5.5 5.5 0 016.5 3a5.5 5.5 0 106.5 6.5z"/>',
  help: '<circle cx="8" cy="8" r="6.25"/><path d="M6.2 6.2a1.9 1.9 0 113 1.5c-.8.5-1.2.9-1.2 1.8"/><circle cx="8" cy="11.6" r=".6" fill="currentColor"/>',
  keyboard: '<rect x="1.5" y="4" width="13" height="8.5" rx="1.25"/><path d="M4 6.75h.01M6.5 6.75h.01M9 6.75h.01M11.5 6.75h.01M4.5 9.75h7"/>',
  search: '<circle cx="7" cy="7" r="4.25"/><path d="M10.25 10.25L14 14"/>',
  replace: '<path d="M2.5 4.5h8l-2-2M13.5 11.5h-8l2 2"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  trash: '<path d="M2.75 4.25h10.5M6.25 4V2.5h3.5V4M4 4.25l.75 9.25h6.5L12 4.25"/>',
  pencil: '<path d="M10.5 2.5l3 3-8 8H2.5v-3z"/>',
  monitor: '<rect x="1.5" y="2.5" width="13" height="8.5" rx="1.25"/><path d="M5.5 14h5M8 11v3"/>',
  cpu: '<rect x="4" y="4" width="8" height="8" rx="1"/><path d="M6 1.5V4M10 1.5V4M6 12v2.5M10 12v2.5M1.5 6H4M1.5 10H4M12 6h2.5M12 10h2.5"/>',
  memory: '<rect x="1.5" y="4.5" width="13" height="7" rx="1"/><path d="M4 7h1.5v2H4zM7.25 7h1.5v2h-1.5zM10.5 7H12v2h-1.5zM3.5 11.5V13M6 11.5V13M8.5 11.5V13M11 11.5V13"/>',
  grid: '<rect x="1.75" y="1.75" width="5" height="5" rx=".75"/><rect x="9.25" y="1.75" width="5" height="5" rx=".75"/><rect x="1.75" y="9.25" width="5" height="5" rx=".75"/><rect x="9.25" y="9.25" width="5" height="5" rx=".75"/>',
  plug: '<path d="M5.5 1.5v3M10.5 1.5v3M3.5 4.5h9v2.5a4.5 4.5 0 01-9 0zM8 11.5v3"/>',
  printer: '<path d="M4 6V1.75h8V6"/><rect x="1.75" y="6" width="12.5" height="5.5" rx="1"/><path d="M4 9.5h8v4.75H4z"/>',
  cards: '<path d="M3.5 3.5h9.5l1.5 1.5v6.5h-11z"/><path d="M1.5 5.5v8h11"/><path d="M6 6v1M8 6v1M10 6v1M6 9v1M9 9v1"/>',
  tape: '<circle cx="5" cy="7" r="3.25"/><circle cx="11" cy="7" r="3.25"/><circle cx="5" cy="7" r=".75" fill="currentColor"/><circle cx="11" cy="7" r=".75" fill="currentColor"/><path d="M5 10.25h6M1.5 13.5h13"/>',
  switches: '<rect x="1.75" y="2.5" width="12.5" height="11" rx="1.25"/><path d="M4.5 5v2.5M7 5v2.5M9.5 5v2.5M12 5v2.5M4.5 9.5v2M7 9.5v2M9.5 9.5v2M12 9.5v2"/>',
  book: '<path d="M2 3c2-1 4-1 6 .5 2-1.5 4-1.5 6-.5v10c-2-1-4-1-6 .5-2-1.5-4-1.5-6-.5z"/><path d="M8 3.5v10"/>',
  list: '<path d="M5.5 4h8M5.5 8h8M5.5 12h8"/><circle cx="2.75" cy="4" r=".75" fill="currentColor"/><circle cx="2.75" cy="8" r=".75" fill="currentColor"/><circle cx="2.75" cy="12" r=".75" fill="currentColor"/>',
  tag: '<path d="M1.75 1.75h6l6.5 6.5-6 6-6.5-6.5z"/><circle cx="5" cy="5" r="1"/>',
  map: '<path d="M1.75 3.5l4-1.5 4.5 1.5 4-1.5v10.5l-4 1.5-4.5-1.5-4 1.5z"/><path d="M5.75 2v10.5M10.25 3.5V14"/>',
  log: '<rect x="1.75" y="2.25" width="12.5" height="11.5" rx="1.25"/><path d="M4.5 5.75l2 1.75-2 1.75M8 9.75h3.5"/>',
  alert: '<path d="M8 1.75l6.5 11.5h-13z"/><path d="M8 6v3.25"/><circle cx="8" cy="11.25" r=".6" fill="currentColor"/>',
  error: '<circle cx="8" cy="8" r="6.25"/><path d="M5.75 5.75l4.5 4.5M10.25 5.75l-4.5 4.5"/>',
  info: '<circle cx="8" cy="8" r="6.25"/><path d="M8 7.25v4"/><circle cx="8" cy="4.9" r=".6" fill="currentColor"/>',
  check: '<path d="M3 8.5l3 3 7-7"/>',
  chevronDown: '<path d="M4 6l4 4 4-4"/>',
  chevronRight: '<path d="M6 4l4 4-4 4"/>',
  chevronUp: '<path d="M4 10l4-4 4 4"/>',
  arrowRight: '<path d="M2.5 8h10M9 4.5L12.5 8 9 11.5"/>',
  arrowLeft: '<path d="M13.5 8h-10M7 4.5L3.5 8 7 11.5"/>',
  eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
  dot: '<circle cx="8" cy="8" r="4" fill="currentColor" stroke="none"/>',
  speed: '<path d="M2.5 11.5a5.5 5.5 0 1111 0"/><path d="M8 11.5l3-4"/>',
  sidebar: '<rect x="1.75" y="2.5" width="12.5" height="11" rx="1.25"/><path d="M5.75 2.5v11"/>',
  panelBottom: '<rect x="1.75" y="2.5" width="12.5" height="11" rx="1.25"/><path d="M1.75 9.5h12.5"/>',
  panelRight: '<rect x="1.75" y="2.5" width="12.5" height="11" rx="1.25"/><path d="M9.75 2.5v11"/>',
  maximize: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>',
  copy: '<rect x="5" y="5" width="8.5" height="8.5" rx="1"/><path d="M11 5V2.5H2.5V11H5"/>',
  sort: '<path d="M5 3v10M2.5 10.5L5 13l2.5-2.5M11 13V3M8.5 5.5L11 3l2.5 2.5"/>',
  reel: '<circle cx="8" cy="8" r="6.25"/><circle cx="8" cy="8" r="1.5"/><path d="M8 1.75v4.75M13.4 11.1L9.3 8.75M2.6 11.1l4.1-2.35"/>',
};

/** Returns the SVG markup of an icon. */
export function iconSvg(name, size = 16, cls = '') {
  const body = P[name] || P.file;
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** Application logo: a stylized "6600" chip. */
export const LOGO_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
  <rect x="1" y="1" width="22" height="22" rx="5" fill="var(--logo-bg)"/>
  <path d="M6 7.5h12M6 12h12M6 16.5h7" stroke="var(--logo-fg)" stroke-width="2" stroke-linecap="round"/>
  <circle cx="17" cy="16.5" r="1.6" fill="var(--logo-accent)"/>
</svg>`;
