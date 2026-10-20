import type { Media } from '../data/projects';

/*
 * Glyphs drawn on a 24-unit grid at one hairline-leaning weight: round caps,
 * round joins, optical centring. They sit beside type, never instead of it.
 */
const g = (body: string, cls = '') =>
  `<svg class="glyph${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const chevronLeft = g('<path d="M14.5 5.5 8 12l6.5 6.5"/>');
export const chevronRight = g('<path d="M9.5 5.5 16 12l-6.5 6.5"/>');
export const arrowRight = g('<path d="M4 12h15.5M13.5 6l6 6-6 6"/>');
export const arrowUpRight = g('<path d="M7 17 17 7M8.75 7H17v8.25"/>');
export const expand = g('<path d="M14 4.5h5.5V10M10 19.5H4.5V14M19.5 4.5l-6 6M4.5 19.5l6-6"/>');
export const reset = g('<path d="M4.75 12A7.25 7.25 0 1 0 7 6.75"/><path d="M7 3.25v3.5h3.5"/>');
export const move = g('<path d="M12 3.5v17M3.5 12h17M9.75 5.75 12 3.5l2.25 2.25M9.75 18.25 12 20.5l2.25-2.25M5.75 9.75 3.5 12l2.25 2.25M18.25 9.75 20.5 12l-2.25 2.25"/>');

export const play = g('<path d="M8.25 5.6v12.8L18.5 12z" fill="currentColor"/>');
export const pause = g('<path d="M8.75 5.75v12.5M15.25 5.75v12.5"/>', 'glyph--bold');

const film = g('<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="M10.25 9.4v5.2l4.4-2.6z" fill="currentColor"/>');
const handset = g('<rect x="6.75" y="3" width="10.5" height="18" rx="2.5"/><path d="M10.5 5.75h3"/>');

/** What each kind of media plays on. */
export const mediaGlyph: Record<Media['kind'], string> = {
  site: g('<rect x="3.25" y="4.75" width="17.5" height="14.5" rx="1.5"/><path d="M3.25 8.75h17.5"/>'),
  film,
  reel: handset,
};
