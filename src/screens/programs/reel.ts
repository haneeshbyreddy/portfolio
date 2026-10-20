import type { Project, ReelMedia } from '../../data/projects';
import type { Frame } from '../Library';
import { fillRR, text, type Ctx } from '../draw';

/** The phone's virtual screen, like VW × VH for the terminal. */
export const PW = 360;
export const PH = 640;

/** A vertical reel on the worker's phone: full bleed, status bar, a hairline of progress. */
export function drawReel(
  ctx: Ctx, t: number, p: Project, m: ReelMedia, frame: Frame | null,
  time: { t: number; paused: boolean } | null,
) {
  if (frame) {
    const fw = frame instanceof HTMLVideoElement ? frame.videoWidth : frame.naturalWidth;
    const fh = frame instanceof HTMLVideoElement ? frame.videoHeight : frame.naturalHeight;
    const s = Math.max(PW / fw, PH / fh);
    ctx.drawImage(frame, (PW - fw * s) / 2, (PH - fh * s) / 2, fw * s, fh * s);
  } else {
    ctx.fillStyle = p.palette.bg;
    ctx.fillRect(0, 0, PW, PH);
    const a = 0.4 + 0.3 * Math.sin(t * 2.4);
    ctx.beginPath();
    ctx.arc(PW / 2, PH / 2, 5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fill();
  }
  if (!time) return;

  // status bar over a soft scrim
  const g = ctx.createLinearGradient(0, 0, 0, 70);
  g.addColorStop(0, 'rgba(0,0,0,0.32)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PW, 70);
  const now = new Date();
  const clock = `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`;
  text(ctx, clock, 42, 30, { size: 15, weight: 650, color: '#fff', align: 'center' });
  // battery
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(PW - 46.5, 20.5, 22, 11);
  fillRR(ctx, PW - 23, 24, 2, 4, 1, 'rgba(255,255,255,0.9)');
  fillRR(ctx, PW - 45, 22, 15, 8, 1.5, '#fff');

  // progress
  const k = Math.min(1, time.t / m.duration);
  fillRR(ctx, 16, PH - 14, PW - 32, 3, 1.5, 'rgba(255,255,255,0.28)');
  fillRR(ctx, 16, PH - 14, (PW - 32) * k, 3, 1.5, '#fff');
}
