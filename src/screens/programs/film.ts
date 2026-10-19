import type { Project } from '../../data/projects';
import { clamp, easeOut, fillRR, grain, mix, rgba, seg, text, VH, VW, type Ctx } from '../draw';

const SHOT = 4.2;
const SHOTS = 4;

function ridge(ctx: Ctx, x0: number, y0: number, w: number, base: number, amp: number, freq: number, seed: number, drift: number, color: string, bottom: number) {
  ctx.beginPath();
  ctx.moveTo(x0, bottom);
  for (let i = 0; i <= 80; i++) {
    const u = i / 80;
    const x = x0 + u * w;
    const s = (u + drift) * freq + seed;
    const y = y0 + base
      - amp * (Math.sin(s) * 0.5 + Math.sin(s * 2.3 + 1.7) * 0.28 + Math.sin(s * 5.1 + 0.4) * 0.12 + Math.abs(Math.sin(s * 0.7)) * 0.5);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(x0 + w, bottom);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function shotRidges(ctx: Ctx, x: number, y: number, w: number, h: number, k: number, p: Project) {
  const { accent, accent2 } = p.palette;
  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, '#1a2a3d');
  sky.addColorStop(0.55, mix('#e2a35f', accent, 0.5));
  sky.addColorStop(1, '#f6d7a8');
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  const sunY = y + h * (0.78 - easeOut(k) * 0.22);
  const sg = ctx.createRadialGradient(x + w * 0.62, sunY, 0, x + w * 0.62, sunY, h * 0.6);
  sg.addColorStop(0, 'rgba(255,240,210,0.95)');
  sg.addColorStop(0.08, 'rgba(255,225,170,0.85)');
  sg.addColorStop(0.3, 'rgba(255,190,120,0.25)');
  sg.addColorStop(1, 'rgba(255,190,120,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(x, y, w, h);
  const layers = [
    { c: mix('#6f8fa6', accent2, 0.3), b: 0.55, a: 0.18, f: 5, d: 0.02 },
    { c: '#4c6378', b: 0.66, a: 0.16, f: 7, d: 0.04 },
    { c: '#2f4052', b: 0.78, a: 0.14, f: 9, d: 0.07 },
    { c: '#1a2531', b: 0.92, a: 0.12, f: 12, d: 0.12 },
  ];
  layers.forEach((l, i) => ridge(ctx, x, y, w, h * l.b, h * l.a, l.f, i * 3.1, k * l.d, l.c, y + h + 2));
  // mist band
  const mg = ctx.createLinearGradient(0, y + h * 0.6, 0, y + h * 0.82);
  mg.addColorStop(0, 'rgba(246,215,168,0)');
  mg.addColorStop(0.5, 'rgba(246,215,168,0.22)');
  mg.addColorStop(1, 'rgba(246,215,168,0)');
  ctx.fillStyle = mg;
  ctx.fillRect(x, y, w, h);
}

function shotCompass(ctx: Ctx, x: number, y: number, w: number, h: number, k: number, p: Project) {
  const { accent } = p.palette;
  ctx.fillStyle = '#0e1013';
  ctx.fillRect(x, y, w, h);
  const cx = x + w / 2, cy = y + h / 2, r = h * 0.36 * (1 + k * 0.08);
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, 0, cx, cy, r * 1.3);
  g.addColorStop(0, rgba(accent, 0.35));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = rgba('#f1ede4', 0.5);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const L = i % 18 === 0 ? 14 : i % 6 === 0 ? 8 : 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r - L), Math.sin(a) * (r - L));
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }
  ['N', 'E', 'S', 'W'].forEach((d, i) => {
    const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
    text(ctx, d, Math.cos(a) * (r - 28), Math.sin(a) * (r - 28) + 5, { size: 14, weight: 600, color: d === 'N' ? accent : '#f1ede4', align: 'center' });
  });
  const settle = Math.sin(k * 14) * Math.exp(-k * 3.5) * 0.9;
  ctx.rotate(settle);
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.72);
  ctx.lineTo(9, 0);
  ctx.lineTo(0, r * 0.72);
  ctx.lineTo(-9, 0);
  ctx.closePath();
  const ng = ctx.createLinearGradient(0, -r, 0, r);
  ng.addColorStop(0, accent);
  ng.addColorStop(0.5, accent);
  ng.addColorStop(0.5, '#d9d4c8');
  ng.addColorStop(1, '#d9d4c8');
  ctx.fillStyle = ng;
  ctx.fill();
  ctx.restore();
  // light sweep
  const sx = x + w * (k * 1.6 - 0.3);
  const sw = ctx.createLinearGradient(sx - 60, 0, sx + 60, 0);
  sw.addColorStop(0, 'rgba(255,255,255,0)');
  sw.addColorStop(0.5, 'rgba(255,240,220,0.12)');
  sw.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sw;
  ctx.fillRect(x, y, w, h);
}

function shotForest(ctx: Ctx, x: number, y: number, w: number, h: number, k: number) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#9fb3b0');
  g.addColorStop(1, '#4e6360');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  const rows = [
    { n: 26, c: 'rgba(60,80,76,0.5)', s: 0.6, d: 0.08 },
    { n: 18, c: 'rgba(36,52,48,0.75)', s: 0.85, d: 0.18 },
    { n: 11, c: '#151f1c', s: 1.2, d: 0.4 },
  ];
  rows.forEach((r, ri) => {
    for (let i = 0; i < r.n; i++) {
      const u = ((i / r.n + k * r.d + ri * 0.13) % 1.1) - 0.05;
      const tx = x + u * w;
      const th = h * (0.55 + ((i * 37) % 10) / 30) * r.s;
      const tw = 10 * r.s + ((i * 13) % 5);
      ctx.fillStyle = r.c;
      ctx.beginPath();
      ctx.moveTo(tx, y + h - th);
      ctx.lineTo(tx + tw * 2.2, y + h);
      ctx.lineTo(tx - tw * 2.2, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(tx - tw * 0.15, y + h - th * 0.4, tw * 0.3, th * 0.4);
    }
  });
  // god rays
  for (let i = 0; i < 4; i++) {
    const rx = x + w * (0.2 + i * 0.2) + Math.sin(k * 2 + i) * 10;
    const rg = ctx.createLinearGradient(rx, y, rx + 90, y + h);
    rg.addColorStop(0, 'rgba(255,245,220,0.16)');
    rg.addColorStop(1, 'rgba(255,245,220,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(rx, y);
    ctx.lineTo(rx + 26, y);
    ctx.lineTo(rx + 140, y + h);
    ctx.lineTo(rx + 70, y + h);
    ctx.closePath();
    ctx.fill();
  }
}

function shotTitle(ctx: Ctx, x: number, y: number, w: number, h: number, k: number, p: Project) {
  const { ink, accent } = p.palette;
  ctx.fillStyle = '#0b0c0e';
  ctx.fillRect(x, y, w, h);
  const a = easeOut(seg(k, 0.05, 0.4));
  const b = easeOut(seg(k, 0.35, 0.7));
  text(ctx, p.title.toUpperCase(), x + w / 2, y + h / 2 - 2, { size: 44, weight: 600, color: rgba(ink, a), align: 'center', tracking: 6 + (1 - a) * 14 });
  ctx.fillStyle = rgba(accent, b);
  ctx.fillRect(x + w / 2 - 70 * b, y + h / 2 + 16, 140 * b, 1.5);
  text(ctx, p.tagline, x + w / 2, y + h / 2 + 44, { size: 15, weight: 500, color: rgba(ink, b * 0.8), align: 'center', tracking: 1 });
}

export function drawFilm(ctx: Ctx, t: number, p: Project) {
  const { ink, accent } = p.palette;
  ctx.fillStyle = '#060708';
  ctx.fillRect(0, 0, VW, VH);

  // 2.39:1 frame
  const fw = 760, fh = Math.round(fw / 2.39);
  const fx = 20, fy = 70;
  const total = SHOT * SHOTS;
  const tt = t % total;
  const idx = Math.floor(tt / SHOT);
  const k = (tt % SHOT) / SHOT;

  ctx.save();
  ctx.beginPath();
  ctx.rect(fx, fy, fw, fh);
  ctx.clip();
  const drawShot = (i: number, kk: number) => {
    if (i === 0) shotRidges(ctx, fx, fy, fw, fh, kk, p);
    else if (i === 1) shotCompass(ctx, fx, fy, fw, fh, kk, p);
    else if (i === 2) shotForest(ctx, fx, fy, fw, fh, kk);
    else shotTitle(ctx, fx, fy, fw, fh, kk, p);
  };
  drawShot(idx, k);
  // dip-to-black between shots
  const dip = Math.max(1 - k / 0.06, (k - 0.94) / 0.06, 0);
  ctx.fillStyle = `rgba(0,0,0,${clamp(dip)})`;
  ctx.fillRect(fx, fy, fw, fh);
  // vignette
  const vg = ctx.createRadialGradient(fx + fw / 2, fy + fh / 2, fh * 0.3, fx + fw / 2, fy + fh / 2, fw * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(fx, fy, fw, fh);
  grain(ctx, 0.12, t);
  ctx.restore();

  // header
  text(ctx, `${p.title.toUpperCase()}  —  BRAND FILM`, 20, 40, { size: 12, weight: 600, color: rgba(ink, 0.85), tracking: 3 });
  text(ctx, '4K  ·  2.39:1  ·  24 FPS', 780, 40, { size: 11, weight: 500, color: rgba(ink, 0.45), align: 'right', mono: true, tracking: 1 });

  // subtitles
  const subs = ['There is a place past the last road.', 'Where the map ends,', 'the trail begins.', ''];
  const sa = Math.min(easeOut(seg(k, 0.15, 0.3)), 1 - easeOut(seg(k, 0.8, 0.92)));
  if (subs[idx]) text(ctx, subs[idx], fx + fw / 2, fy + fh + 40, { size: 15, weight: 500, color: rgba('#f1ede4', sa * 0.9), align: 'center' });

  // transport bar
  const by = 470;
  const progress = (t % 90) / 90;
  ctx.beginPath();
  ctx.moveTo(34, by - 8);
  ctx.lineTo(34, by + 8);
  ctx.lineTo(47, by);
  ctx.closePath();
  ctx.fillStyle = '#f1ede4';
  ctx.fill();
  fillRR(ctx, 70, by - 2, 560, 4, 2, rgba(ink, 0.15));
  fillRR(ctx, 70, by - 2, 560 * progress, 4, 2, accent);
  ctx.beginPath();
  ctx.arc(70 + 560 * progress, by, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#f1ede4';
  ctx.fill();
  const sec = Math.floor(progress * 90);
  text(ctx, `00:${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')} / 00:01:30`, 650, by + 4, { size: 11, weight: 500, color: rgba(ink, 0.7), mono: true });

  // chapter thumbnails
  for (let i = 0; i < SHOTS; i++) {
    const x = 34 + i * 186;
    const y = 506;
    fillRR(ctx, x, y, 172, 64, 6, i === idx ? rgba(accent, 0.18) : rgba(ink, 0.05));
    if (i === idx) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x + 0.5, y + 0.5, 171, 63);
    }
    text(ctx, `0${i + 1}`, x + 12, y + 24, { size: 11, weight: 600, color: i === idx ? accent : rgba(ink, 0.5), mono: true });
    text(ctx, ['Ridgeline', 'True north', 'Old growth', 'Title'][i], x + 12, y + 46, { size: 13, weight: 600, color: rgba(ink, i === idx ? 0.95 : 0.6) });
  }
}
