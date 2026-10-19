import type { Project } from '../../data/projects';
import { clamp, easeOut, fillRR, mix, rgba, seg, text, VH, VW, type Ctx } from '../draw';

const PAGE = 4.4;
const PAGES = 4;

/** The mark: a roasting drum seen end-on — circle, three roast bands, an ember. */
function mark(ctx: Ctx, cx: number, cy: number, r: number, ink: string, accent: string, fill = 1) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = rgba(ink, fill);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = rgba('#e9e1d2', fill);
    ctx.fillRect(cx - r, cy - r * 0.42 + i * r * 0.36, r * 2, r * 0.1);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx + r * 0.62, cy - r * 0.62, r * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = rgba(accent, fill);
  ctx.fill();
}

function pageConstruction(ctx: Ctx, k: number, p: Project) {
  const { ink, accent } = p.palette;
  const cx = VW / 2, cy = 270, r = 110;
  const g = easeOut(seg(k, 0, 0.35));
  ctx.strokeStyle = rgba(accent, 0.45);
  ctx.lineWidth = 1;
  // construction grid
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * (r / 2), cy - 190 * g);
    ctx.lineTo(cx + i * (r / 2), cy + 190 * g);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 290 * g, cy + i * (r / 2));
    ctx.lineTo(cx + 290 * g, cy + i * (r / 2));
    ctx.stroke();
  }
  // circles drawing in
  const c = easeOut(seg(k, 0.15, 0.55));
  ctx.strokeStyle = rgba(ink, 0.7);
  ctx.setLineDash([]);
  for (const [rr, ox, oy] of [[r, 0, 0], [r * 0.2, r * 0.62, -r * 0.62], [r * 1.41, 0, 0]] as const) {
    ctx.beginPath();
    ctx.arc(cx + ox, cy + oy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c);
    ctx.stroke();
  }
  const f = easeOut(seg(k, 0.55, 0.85));
  mark(ctx, cx, cy, r, ink, accent, f);
  // annotations
  text(ctx, 'r', cx + r / 2, cy + 4, { size: 12, weight: 500, color: rgba(accent, g), mono: true, align: 'center' });
  text(ctx, '0.2r', cx + r * 0.95, cy - r * 0.9, { size: 11, weight: 500, color: rgba(accent, g), mono: true });
  text(ctx, 'MOSS & EMBER', cx, 470, { size: 28, weight: 600, color: rgba(ink, f), align: 'center', tracking: 9 });
  text(ctx, 'ROASTERS  ·  EST. 2019', cx, 498, { size: 11, weight: 500, color: rgba(ink, f * 0.6), align: 'center', tracking: 4 });
}

function pagePalette(ctx: Ctx, k: number, p: Project) {
  const { ink, accent, accent2 } = p.palette;
  const sw: [string, string, string][] = [
    ['Roast', '#2b2722', '#2B2722'],
    ['Ember', accent, accent.toUpperCase()],
    ['Moss', accent2, accent2.toUpperCase()],
    ['Crema', '#d9c4a3', '#D9C4A3'],
    ['Paper', '#f4efe6', '#F4EFE6'],
  ];
  text(ctx, 'Colour', 60, 120, { size: 40, weight: 600, color: ink, tracking: -1.4 });
  text(ctx, 'Five colours, all from the roastery floor.', 60, 150, { size: 14, weight: 500, color: rgba(ink, 0.6) });
  sw.forEach(([name, c, hex], i) => {
    const x = 60 + i * 140;
    const h = 330 * easeOut(seg(k, 0.05 + i * 0.07, 0.45 + i * 0.07));
    fillRR(ctx, x, 540 - h, 124, h, 10, c);
    if (i === 4) {
      ctx.strokeStyle = rgba(ink, 0.15);
      ctx.strokeRect(x + 0.5, 540 - h + 0.5, 123, h - 1);
    }
    const a = clamp(h / 330);
    const on = i >= 3 ? '#2b2722' : '#f4efe6';
    text(ctx, name, x + 14, 540 - h + 30, { size: 15, weight: 650, color: rgba(on, a) });
    text(ctx, hex, x + 14, 526, { size: 11, weight: 500, color: rgba(on, a * 0.75), mono: true });
  });
}

function pageType(ctx: Ctx, k: number, p: Project) {
  const { ink, accent } = p.palette;
  const a = easeOut(seg(k, 0, 0.3));
  text(ctx, 'Aa', 60, 360, { size: 260, weight: 500, color: rgba(ink, a), tracking: -14 });
  const b = easeOut(seg(k, 0.2, 0.5));
  text(ctx, 'Display', 470, 150, { size: 12, weight: 600, color: rgba(accent, b), tracking: 3 });
  text(ctx, 'Inter Tight', 470, 192, { size: 36, weight: 600, color: rgba(ink, b), tracking: -1.2 });
  text(ctx, 'Body', 470, 252, { size: 12, weight: 600, color: rgba(accent, b), tracking: 3 });
  text(ctx, 'Geist Mono', 470, 286, { size: 26, weight: 400, color: rgba(ink, b), mono: true });
  const c = easeOut(seg(k, 0.35, 0.7));
  text(ctx, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 60, 450, { size: 22, weight: 500, color: rgba(ink, c * 0.85), tracking: 4 });
  text(ctx, 'abcdefghijklmnopqrstuvwxyz  0123456789', 60, 484, { size: 22, weight: 400, color: rgba(ink, c * 0.6), tracking: 2 });
  text(ctx, '“Slow coffee from small farms.”', 60, 540, { size: 18, weight: 500, color: rgba(accent, c) });
}

function pageApplication(ctx: Ctx, k: number, p: Project, t: number) {
  const { ink, accent, accent2 } = p.palette;
  fillRR(ctx, 40, 80, 720, 470, 18, mix(accent2, '#000000', 0.15));
  // bag
  const bob = Math.sin(t * 1.2) * 3;
  const a = easeOut(seg(k, 0, 0.35));
  ctx.save();
  ctx.translate(250, 320 + (1 - a) * 40 + bob);
  ctx.globalAlpha = a;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 20;
  ctx.beginPath();
  ctx.moveTo(-100, -170);
  ctx.lineTo(100, -170);
  ctx.lineTo(112, 170);
  ctx.lineTo(-112, 170);
  ctx.closePath();
  ctx.fillStyle = '#e9e1d2';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = rgba('#000000', 0.06);
  ctx.fillRect(-100, -170, 200, 22);
  mark(ctx, 0, -50, 46, ink, accent);
  text(ctx, 'MOSS & EMBER', 0, 32, { size: 15, weight: 600, color: ink, align: 'center', tracking: 4 });
  text(ctx, 'ETHIOPIA  ·  GUJI', 0, 60, { size: 10, weight: 600, color: rgba(ink, 0.6), align: 'center', tracking: 3 });
  fillRR(ctx, -60, 90, 120, 26, 13, accent);
  text(ctx, 'LIGHT ROAST', 0, 107, { size: 9.5, weight: 700, color: '#fff', align: 'center', tracking: 2 });
  ctx.restore();
  // cup
  const b = easeOut(seg(k, 0.15, 0.5));
  ctx.save();
  ctx.translate(530, 360 + (1 - b) * 40 - bob);
  ctx.globalAlpha = b;
  ctx.beginPath();
  ctx.moveTo(-70, -110);
  ctx.lineTo(70, -110);
  ctx.lineTo(55, 110);
  ctx.lineTo(-55, 110);
  ctx.closePath();
  ctx.fillStyle = '#f4efe6';
  ctx.fill();
  fillRR(ctx, -78, -126, 156, 22, 8, ink);
  ctx.fillStyle = accent;
  ctx.fillRect(-66, -20, 132, 64);
  mark(ctx, 0, 12, 22, '#2b2722', '#f4efe6');
  ctx.restore();
  text(ctx, 'Packaging system', 64, 116, { size: 13, weight: 600, color: rgba('#f4efe6', 0.8), tracking: 1 });
}

export function drawBrand(ctx: Ctx, t: number, p: Project) {
  const { bg, ink } = p.palette;
  const tt = t % (PAGE * PAGES);
  const idx = Math.floor(tt / PAGE);
  const k = (tt % PAGE) / PAGE;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, VW, VH);
  // slide transition: the page wipes up
  const out = easeOut(seg(k, 0.9, 1));
  ctx.save();
  ctx.translate(0, -out * 30);
  ctx.globalAlpha = 1 - out;
  if (idx === 0) pageConstruction(ctx, k, p);
  else if (idx === 1) pagePalette(ctx, k, p);
  else if (idx === 2) pageType(ctx, k, p);
  else pageApplication(ctx, k, p, t);
  ctx.restore();

  // book chrome
  text(ctx, `${p.title} — Brand Guidelines`, 30, 40, { size: 12, weight: 600, color: rgba(ink, 0.7) });
  text(ctx, `0${idx + 1} / 0${PAGES}`, 770, 40, { size: 12, weight: 500, color: rgba(ink, 0.5), mono: true, align: 'right' });
  ctx.fillStyle = rgba(ink, 0.1);
  ctx.fillRect(30, 56, 740, 1);
  ctx.fillStyle = rgba(ink, 0.6);
  ctx.fillRect(30, VH - 24, 740 * ((idx + k) / PAGES), 2);
  text(ctx, ['Mark', 'Colour', 'Type', 'Applications'][idx], 30, VH - 36, { size: 11, weight: 600, color: rgba(ink, 0.5), tracking: 2 });
}
