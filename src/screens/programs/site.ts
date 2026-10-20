import { domainOf, type Project, type SiteMedia } from '../../data/projects';
import type { Frame } from '../Library';
import { fillRR, isDark, text, VH, VW, type Ctx } from '../draw';
import { drawCard } from './card';

const CHROME = 34;

/** A browser window around the screen recording of a live site. */
export function drawSite(ctx: Ctx, t: number, p: Project, m: SiteMedia, frame: Frame | null) {
  const page = { x: 0, y: CHROME, w: VW, h: VH - CHROME };
  if (frame) {
    // the recording is made at the page's exact aspect; cover anyway in case it isn't
    const fw = frame instanceof HTMLVideoElement ? frame.videoWidth : frame.naturalWidth;
    const fh = frame instanceof HTMLVideoElement ? frame.videoHeight : frame.naturalHeight;
    const s = Math.max(page.w / fw, page.h / fh);
    ctx.fillStyle = p.palette.bg;
    ctx.fillRect(page.x, page.y, page.w, page.h);
    ctx.drawImage(frame, page.x + (page.w - fw * s) / 2, page.y, fw * s, fh * s);
  } else {
    drawCard(ctx, t, p, page);
  }

  // chrome
  const dark = isDark(p.palette.bg);
  ctx.fillStyle = dark ? '#1c1e22' : '#e9e7e2';
  ctx.fillRect(0, 0, VW, CHROME);
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, CHROME - 1, VW, 1);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(18 + i * 16, 17, 5, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  });
  fillRR(ctx, 250, 8, 300, 19, 9.5, dark ? '#2b2e33' : '#ffffff');
  const domain = domainOf(m.url);
  ctx.font = `500 10.5px "Inter Tight Variable", system-ui, sans-serif`;
  const w = ctx.measureText(domain).width;
  // padlock
  const lx = 400 - w / 2 - 11, ly = 13.5;
  ctx.strokeStyle = dark ? '#9ea3aa' : '#7b7d82';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(lx + 3, ly + 2.2, 2.2, Math.PI, 0);
  ctx.stroke();
  fillRR(ctx, lx, ly + 2.2, 6, 5, 1, dark ? '#9ea3aa' : '#7b7d82');
  text(ctx, domain, 400 + 5, 21.5, { size: 10.5, weight: 500, color: dark ? '#c9ccd1' : '#55575c', align: 'center' });
}
