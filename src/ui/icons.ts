import type { Discipline } from '../data/projects';

export const emblem = (cls = 'emblem') => /* html */ `
<svg class="${cls}" viewBox="0 0 120 64" fill="none" aria-hidden="true">
  <rect x="1" y="1" width="118" height="62" rx="31" stroke="currentColor" stroke-width="1.5"/>
  <path d="M12 43h96" stroke="currentColor" stroke-width="1.3"/>
  <path d="M45 43a15 15 0 0 1 30 0" stroke="currentColor" stroke-width="1.3"/>
  <g class="rays" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
    <path d="M60 15v6"/><path d="M45.5 20.5l3.4 4.4"/><path d="M74.5 20.5l-3.4 4.4"/><path d="M36.5 31l5 1.8"/><path d="M83.5 31l-5 1.8"/>
  </g>
  <g stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
    <path d="M21 43c.6-4.5 1.8-8 4.2-11"/><path d="M26 43c-.2-4 .1-7.5 1.3-10.5"/><path d="M30.5 43c.4-3 1.4-5.6 3.2-7.6"/>
    <path d="M90 43c.5-3.6 1.6-6.4 3.6-8.6"/><path d="M95 43c0-3.4.6-6 1.8-8"/>
  </g>
</svg>`;

/** The emblem reduced to an app-icon mark: sun over the horizon. */
export const mark = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 15.5h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M8 15.5a4 4 0 0 1 8 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M12 6.5v1.6M7.4 8.6l1 1.1M16.6 8.6l-1 1.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

/*
 * Glyphs drawn on a 24-unit grid at one stroke weight, after SF Symbols'
 * regular weight: round caps, round joins, optical centring.
 */
const g = (body: string, cls = '') =>
  `<svg class="glyph${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const chevronLeft = g('<path d="M14.5 5.5 8 12l6.5 6.5"/>');
export const chevronRight = g('<path d="M9.5 5.5 16 12l-6.5 6.5"/>');
export const xmark = g('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>');
export const arrowUpRight = g('<path d="M7 17 17 7M8.75 7H17v8.25"/>');
export const expand = g('<path d="M14 4.5h5.5V10M10 19.5H4.5V14M19.5 4.5l-6 6M4.5 19.5l6-6"/>');
export const reset = g('<path d="M4.75 12A7.25 7.25 0 1 0 7 6.75"/><path d="M7 3.25v3.5h3.5"/>');
export const move = g('<path d="M12 3.5v17M3.5 12h17M9.75 5.75 12 3.5l2.25 2.25M9.75 18.25 12 20.5l2.25-2.25M5.75 9.75 3.5 12l2.25 2.25M18.25 9.75 20.5 12l-2.25 2.25"/>');
export const plus = g('<path d="M12 5.5v13M5.5 12h13"/>');
export const speaker = g(
  '<path d="M4.5 9.75h2.75L11.5 6v12l-4.25-3.75H4.5z"/><path class="wave wave--1" d="M14.75 9.6a3.4 3.4 0 0 1 0 4.8"/><path class="wave wave--2" d="M17.4 7.1a7 7 0 0 1 0 9.8"/><path class="mute" d="m15 9.5 5 5M20 9.5l-5 5"/>',
  'speaker',
);

/** One mark per department — the white glyph on each project's icon. */
export const disciplineGlyph: Record<Discipline | 'vacant', string> = {
  landing: g('<circle cx="12" cy="12" r="8.25"/><path d="M3.75 12h16.5"/><path d="M12 3.75c2.2 2.25 3.3 5 3.3 8.25s-1.1 6-3.3 8.25C9.8 18 8.7 15.25 8.7 12S9.8 6 12 3.75z"/>'),
  saas: g('<path d="M6.5 19.5v-6M12 19.5v-15M17.5 19.5v-10"/>', 'glyph--bold'),
  brand: g('<path d="M12 3.75 6.75 11l1.75 7.25h7L17.25 11z"/><path d="M12 3.75v6.6"/><circle cx="12" cy="12" r="1.35"/><path d="M8.5 20.75h7"/>'),
  film: g('<rect x="3.5" y="5.5" width="17" height="13" rx="3.25"/><path d="M10.25 9.4v5.2l4.4-2.6z" fill="currentColor"/>'),
  app: g('<rect x="6.75" y="3" width="10.5" height="18" rx="3"/><path d="M10.5 5.75h3"/>'),
  vacant: plus,
};
