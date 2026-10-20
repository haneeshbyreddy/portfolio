import type { Project } from '../../data/projects';
import { rgba, text, VH, VW, type Ctx } from '../draw';

/** The project's title card: shown while its footage loads, or if it can't. */
export function drawCard(ctx: Ctx, t: number, p: Project, r = { x: 0, y: 0, w: VW, h: VH }) {
  const { bg, ink, accent } = p.palette;
  ctx.fillStyle = bg;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  text(ctx, p.title, cx, cy + 6, { size: Math.min(56, r.w / 9), weight: 650, color: ink, align: 'center', tracking: -1.5 });
  // a slow breathing dot: something is on its way
  const a = 0.35 + 0.35 * (Math.sin(t * 2.4) * 0.5 + 0.5);
  ctx.beginPath();
  ctx.arc(cx, cy + 44, 4, 0, Math.PI * 2);
  ctx.fillStyle = rgba(accent, a);
  ctx.fill();
}
