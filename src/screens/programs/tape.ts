import type { FilmMedia, Project } from '../../data/projects';
import type { Frame } from '../Library';
import { VH, VW, type Ctx, MONO } from '../draw';
import { drawCard } from './card';

/** Where a 16:9 picture sits on the 4:3 tube: letterboxed, as films always were. */
const PIC = { x: 0, y: (VH - VW * (9 / 16)) / 2, w: VW, h: VW * (9 / 16) };

const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

/** On-screen display text, the way a VCR set it: blocky, white, with a hard shadow. */
function osd(ctx: Ctx, str: string, x: number, y: number, align: CanvasTextAlign = 'left') {
  ctx.save();
  ctx.font = `600 23px ${MONO}`;
  ctx.textAlign = align;
  if ('letterSpacing' in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = '1px';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(str, x + 2, y + 2);
  ctx.fillStyle = '#eaf4ff';
  ctx.fillText(str, x, y);
  ctx.restore();
}

const counter = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

/**
 * A film on the terminal, played like a tape: letterboxed, with the deck's
 * PLAY readout for the first few seconds, a running counter, and the faint
 * head-switching wobble along the bottom of the picture.
 */
export function drawTape(
  ctx: Ctx, t: number, p: Project, _m: FilmMedia, frame: Frame | null,
  time: { t: number; paused: boolean } | null,
) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VW, VH);
  if (!frame) {
    drawCard(ctx, t, p, PIC);
    return;
  }
  ctx.drawImage(frame, PIC.x, PIC.y, PIC.w, PIC.h);

  // head-switching noise: the last lines of the picture slip sideways
  const band = 7;
  const by = PIC.y + PIC.h - band;
  const seed = Math.floor(t * 30);
  for (let i = 0; i < band; i++) {
    const off = (hash(seed + i * 3.7) - 0.5) * 22;
    ctx.drawImage(ctx.canvas, 0, (by + i) * (ctx.canvas.height / VH), ctx.canvas.width, ctx.canvas.height / VH, off, by + i, VW, 1);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, by, VW, band);

  if (!time) return;
  if (time.paused) osd(ctx, 'PAUSE ▌▌', 46, 64);
  else if (time.t < 3.2) osd(ctx, 'PLAY ▶', 46, 64);
  osd(ctx, 'SP', VW - 46, 64, 'right');
  osd(ctx, counter(time.t), VW - 46, VH - 40, 'right');
}
