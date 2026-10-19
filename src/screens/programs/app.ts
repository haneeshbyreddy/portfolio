import type { Project } from '../../data/projects';
import { easeOut, fillRR, rgba, seg, strokeRR, text, track, VH, VW, type Ctx, line } from '../draw';

/** A design tool canvas with a live phone prototype and a collaborator's cursor. */
export function drawApp(ctx: Ctx, t: number, p: Project) {
  const { bg, ink, accent, accent2 } = p.palette;

  // canvas
  ctx.fillStyle = '#e7e7ea';
  ctx.fillRect(0, 0, VW, VH);
  for (let x = 150; x < 650; x += 18) for (let y = 40; y < VH; y += 18) {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x, y, 1.2, 1.2);
  }

  // toolbar
  ctx.fillStyle = '#1e1e21';
  ctx.fillRect(0, 0, VW, 36);
  ['▸', '#', '□', '○', 'T', '✎'].forEach((g, i) => {
    if (i === 0) fillRR(ctx, 10 + i * 30, 6, 24, 24, 5, accent);
    text(ctx, g, 22 + i * 30, 23, { size: 12, weight: 600, color: '#fff', align: 'center' });
  });
  text(ctx, `${p.title} — Tracking v3`, VW / 2, 23, { size: 11.5, weight: 600, color: 'rgba(255,255,255,0.85)', align: 'center' });
  fillRR(ctx, 712, 7, 76, 22, 6, accent);
  text(ctx, 'Share', 750, 22, { size: 11, weight: 600, color: '#fff', align: 'center' });
  ['#f59e0b', '#22c55e'].forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(670 + i * 18, 18, 9, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.strokeStyle = '#1e1e21';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // layers panel
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 36, 150, VH - 36);
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(149, 36, 1, VH - 36);
  text(ctx, 'Layers', 14, 60, { size: 11, weight: 650, color: '#111' });
  ['Tracking — Live', 'Header', 'Map', 'Route', 'Courier card', 'ETA chip', 'Steps', 'Tab bar'].forEach((n, i) => {
    const y = 82 + i * 24;
    if (i === 4) fillRR(ctx, 6, y - 14, 138, 22, 5, rgba(accent, 0.14));
    fillRR(ctx, 16 + (i ? 10 : 0), y - 7, 9, 9, 2, i === 4 ? accent : 'rgba(0,0,0,0.3)');
    text(ctx, n, 32 + (i ? 10 : 0), y + 1, { size: 10.5, weight: i === 4 ? 600 : 500, color: i === 4 ? accent : '#333' });
  });

  // inspector
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(650, 36, 150, VH - 36);
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(650, 36, 1, VH - 36);
  text(ctx, 'Design', 664, 60, { size: 11, weight: 650, color: '#111' });
  [['X', '24'], ['Y', '512'], ['W', '342'], ['H', '148']].forEach(([k, v], i) => {
    const x = 664 + (i % 2) * 66, y = 84 + Math.floor(i / 2) * 30;
    fillRR(ctx, x, y - 14, 58, 22, 5, '#efefef');
    text(ctx, k, x + 7, y + 1, { size: 10, weight: 500, color: '#999' });
    text(ctx, v, x + 20, y + 1, { size: 10, weight: 600, color: '#222', mono: true });
  });
  text(ctx, 'Fill', 664, 168, { size: 10.5, weight: 650, color: '#111' });
  fillRR(ctx, 664, 178, 16, 16, 4, bg);
  strokeRR(ctx, 664, 178, 16, 16, 4, 'rgba(0,0,0,0.15)');
  text(ctx, bg.toUpperCase().replace('#', ''), 688, 190, { size: 10, weight: 500, color: '#333', mono: true });
  text(ctx, 'Corner radius', 664, 224, { size: 10.5, weight: 650, color: '#111' });
  fillRR(ctx, 664, 234, 120, 22, 5, '#efefef');
  text(ctx, '24', 676, 249, { size: 10, weight: 600, color: '#222', mono: true });
  text(ctx, 'Effects', 664, 284, { size: 10.5, weight: 650, color: '#111' });
  text(ctx, 'Drop shadow  0 12 32 / 12%', 664, 302, { size: 9.5, weight: 500, color: '#555' });
  text(ctx, 'Prototype', 664, 340, { size: 10.5, weight: 650, color: '#111' });
  text(ctx, 'Smart animate · 420ms', 664, 358, { size: 9.5, weight: 500, color: '#555' });
  text(ctx, 'Spring  · 0.8 / 0.2', 664, 374, { size: 9.5, weight: 500, color: '#555' });

  // phone
  const px = 300, py = 58, pw = 200, ph = 420;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 14;
  fillRR(ctx, px - 8, py - 8, pw + 16, ph + 16, 34, '#111');
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect?.(px, py, pw, ph, 27);
  ctx.clip();
  ctx.fillStyle = bg;
  ctx.fillRect(px, py, pw, ph);

  // map
  const mapH = 250;
  ctx.fillStyle = '#e4e8ef';
  ctx.fillRect(px, py, pw, mapH);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(px - 20, py + 20 + i * 48);
    ctx.lineTo(px + pw + 20, py + 60 + i * 38);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px + 10 + i * 42, py - 10);
    ctx.lineTo(px + 30 + i * 30, py + mapH + 10);
    ctx.stroke();
  }
  fillRR(ctx, px + 120, py + 40, 60, 46, 8, '#d3ead8');
  // route
  const route: [number, number][] = [[px + 30, py + 210], [px + 60, py + 168], [px + 112, py + 150], [px + 128, py + 98], [px + 170, py + 70]];
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  route.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  const u = (t * 0.08) % 1;
  const f = u * (route.length - 1);
  const i0 = Math.floor(f);
  const a = route[i0], b = route[Math.min(i0 + 1, route.length - 1)];
  const cx = a[0] + (b[0] - a[0]) * (f - i0), cy = a[1] + (b[1] - a[1]) * (f - i0);
  const pulse = (t * 1.2) % 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 6 + pulse * 14, 0, Math.PI * 2);
  ctx.fillStyle = rgba(accent, 0.3 * (1 - pulse));
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  fillRR(ctx, px + 158, py + 56, 26, 26, 13, ink);
  text(ctx, '⌂', px + 171, py + 74, { size: 13, weight: 600, color: '#fff', align: 'center' });

  // status bar + header
  text(ctx, '9:41', px + 22, py + 22, { size: 11, weight: 650, color: ink });
  fillRR(ctx, px + 70, py + 8, 60, 18, 9, '#111');
  fillRR(ctx, px + 14, py + 34, pw - 28, 34, 17, '#ffffff');
  text(ctx, 'Arriving today · 2:40 pm', px + pw / 2, py + 55, { size: 10.5, weight: 650, color: ink, align: 'center' });

  // bottom sheet (springs up on loop)
  const sheet = easeOut(seg(t % 9, 0.2, 1.1));
  const sy = py + mapH - 26 + (1 - sheet) * 60;
  fillRR(ctx, px, sy, pw, ph - (sy - py) + 30, 22, bg);
  fillRR(ctx, px + pw / 2 - 18, sy + 8, 36, 4, 2, rgba(ink, 0.15));
  const eta = Math.max(1, 14 - Math.floor((t % 9) * 1.4));
  text(ctx, `${eta} min`, px + 18, sy + 44, { size: 26, weight: 650, color: ink, tracking: -1 });
  text(ctx, 'Your parcel is 3 stops away', px + 18, sy + 64, { size: 10.5, weight: 500, color: rgba(ink, 0.55) });
  // steps
  for (let s = 0; s < 4; s++) {
    const x = px + 18 + s * 50;
    const done = s < 2 || (s === 2 && (t % 9) > 5);
    fillRR(ctx, x, sy + 82, 42, 5, 2.5, done ? accent : rgba(ink, 0.12));
  }
  // courier card
  fillRR(ctx, px + 14, sy + 102, pw - 28, 54, 14, rgba(ink, 0.05));
  ctx.beginPath();
  ctx.arc(px + 40, sy + 129, 14, 0, Math.PI * 2);
  ctx.fillStyle = rgba(accent2, 0.85);
  ctx.fill();
  text(ctx, 'Sam · Courier', px + 62, sy + 125, { size: 11, weight: 650, color: ink });
  text(ctx, '★ 4.9  ·  Blue e-van', px + 62, sy + 141, { size: 9.5, weight: 500, color: rgba(ink, 0.55) });
  fillRR(ctx, px + pw - 52, sy + 116, 26, 26, 13, accent);
  fillRR(ctx, px + 14, sy + 166, pw - 28, 36, 12, ink);
  text(ctx, 'Leave at door', px + pw / 2, sy + 189, { size: 11.5, weight: 650, color: bg, align: 'center' });
  line(ctx, px + pw / 2 - 40, py + ph - 10, 80, rgba(ink, 0.35), 4);
  ctx.restore();

  // selection on courier card
  const selA = Math.sin(t * 0.6) > -0.3 ? 1 : 0;
  if (selA) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(px + 14, sy + 102, pw - 28, 54);
    [[px + 14, sy + 102], [px + pw - 14, sy + 102], [px + 14, sy + 156], [px + pw - 14, sy + 156]].forEach(([x, y]) => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.strokeRect(x - 3, y - 3, 6, 6);
    });
    fillRR(ctx, px + pw / 2 - 28, sy + 162, 56, 16, 4, accent);
    text(ctx, '342 × 148', px + pw / 2, sy + 174, { size: 9, weight: 600, color: '#fff', align: 'center', mono: true });
  }

  // collaborator cursor
  const c = track([[0, 560, 420], [2.5, 470, 300], [5, 380, 360], [7.5, 560, 200], [10, 600, 470]], t, 12);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 16);
  ctx.lineTo(4.5, 12);
  ctx.lineTo(11, 12);
  ctx.closePath();
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  fillRR(ctx, 10, 14, 54, 18, 9, '#f59e0b');
  text(ctx, 'Haneesh', 37, 27, { size: 10, weight: 650, color: '#fff', align: 'center' });
  ctx.restore();
}
