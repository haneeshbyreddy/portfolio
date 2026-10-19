import type { Project } from '../../data/projects';
import {
  cursor, ease, easeOut, fillRR, isDark, lerp, line, rgba, rr, seg, SANS, strokeRR, text, track, VH, VW, type Ctx,
} from '../draw';

const CHROME = 34;

function wrap(ctx: Ctx, str: string, maxW: number, size: number, weight: number) {
  ctx.font = `${weight} ${size}px ${SANS}`;
  const words = str.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Scripted scroll: hold, glide, hold… then a long smooth glide home. */
function scrollAt(t: number) {
  const keys: [number, number][] = [
    [0, 0], [3.2, 0], [4.4, 560], [7.0, 560], [8.2, 1080], [10.8, 1080], [12.0, 1460], [14.2, 1460], [15.8, 0],
  ];
  const P = 16.6;
  const tt = t % P;
  for (let i = 0; i < keys.length - 1; i++) {
    const [ta, ya] = keys[i];
    const [tb, yb] = keys[i + 1];
    if (tt >= ta && tt < tb) return lerp(ya, yb, ease((tt - ta) / (tb - ta)));
  }
  return 0;
}

function heroVisual(ctx: Ctx, p: Project, x: number, y: number, w: number, h: number, t: number) {
  const { ink, accent, accent2 } = p.palette;
  if (p.id === 'kiln') {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#d9c7b2');
    g.addColorStop(1, '#bfa48a');
    fillRR(ctx, x, y, w, h, 18, g);
    // shelf
    ctx.fillStyle = 'rgba(60,40,28,0.18)';
    ctx.fillRect(x, y + h * 0.78, w, 3);
    const pots = [
      { cx: x + w * 0.26, s: 1.0, c: '#efe7dc', glaze: '#d8cdbf' },
      { cx: x + w * 0.55, s: 1.35, c: accent, glaze: '#a65530' },
      { cx: x + w * 0.8, s: 0.8, c: '#5e6b52', glaze: '#4b5741' },
    ];
    pots.forEach((pt, i) => {
      const base = y + h * 0.78;
      const H = 120 * pt.s, W = 52 * pt.s;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(pt.cx, base + 2, W * 0.9, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(40,25,15,0.18)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(pt.cx - W * 0.42, base);
      ctx.bezierCurveTo(pt.cx - W * 1.05, base - H * 0.35, pt.cx - W * 0.55, base - H * 0.8, pt.cx - W * 0.28, base - H);
      ctx.lineTo(pt.cx + W * 0.28, base - H);
      ctx.bezierCurveTo(pt.cx + W * 0.55, base - H * 0.8, pt.cx + W * 1.05, base - H * 0.35, pt.cx + W * 0.42, base);
      ctx.closePath();
      const lg = ctx.createLinearGradient(pt.cx - W, 0, pt.cx + W, 0);
      const k = (Math.sin(t * 0.8 + i * 2) * 0.5 + 0.5) * 0.6 + 0.2; // the wheel turns
      lg.addColorStop(0, pt.glaze);
      lg.addColorStop(Math.max(0, k - 0.18), pt.c);
      lg.addColorStop(k, '#fff8ef');
      lg.addColorStop(Math.min(1, k + 0.18), pt.c);
      lg.addColorStop(1, pt.glaze);
      ctx.fillStyle = lg;
      ctx.fill();
      ctx.restore();
    });
    text(ctx, 'Autumn collection', x + 20, y + 32, { size: 13, weight: 600, color: '#3a2a20' });
    text(ctx, '24 pieces · wood-fired', x + 20, y + 50, { size: 11, weight: 500, color: 'rgba(58,42,32,0.6)' });
    return;
  }

  // fintech: a gradient stage with a card tilting in space and live chips
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, accent);
  g.addColorStop(1, accent2);
  fillRR(ctx, x, y, w, h, 20, g);
  ctx.save();
  rr(ctx, x, y, w, h, 20);
  ctx.clip();
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(x + w * 0.5, y + h * 1.1, 80 + i * 55 + (t * 18) % 55, Math.PI, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();

  const cw = 250, ch = 158;
  const cx = x + w / 2, cy = y + h / 2 - 6;
  const tilt = Math.sin(t * 0.9) * 0.22;
  const bob = Math.sin(t * 1.3) * 6;
  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.transform(Math.cos(tilt), Math.sin(tilt) * 0.18, -Math.sin(tilt) * 0.3, 1, 0, 0);
  ctx.rotate(-0.12);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 18;
  fillRR(ctx, -cw / 2, -ch / 2, cw, ch, 16, ink);
  ctx.shadowColor = 'transparent';
  const sheen = ctx.createLinearGradient(-cw / 2, -ch / 2, cw / 2, ch / 2);
  const s = (Math.sin(t * 0.9) * 0.5 + 0.5);
  sheen.addColorStop(Math.max(0, s - 0.2), 'rgba(255,255,255,0)');
  sheen.addColorStop(s, 'rgba(255,255,255,0.16)');
  sheen.addColorStop(Math.min(1, s + 0.2), 'rgba(255,255,255,0)');
  fillRR(ctx, -cw / 2, -ch / 2, cw, ch, 16, sheen);
  fillRR(ctx, -cw / 2 + 22, -ch / 2 + 50, 36, 27, 6, '#d8b46a');
  ctx.beginPath();
  ctx.arc(-cw / 2 + 30, -ch / 2 + 28, 9, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  text(ctx, p.title.toUpperCase(), -cw / 2 + 46, -ch / 2 + 33, { size: 13, weight: 700, color: '#fff', tracking: 2 });
  text(ctx, '••••  ••••  ••••  4821', -cw / 2 + 22, ch / 2 - 40, { size: 15, weight: 500, color: 'rgba(255,255,255,0.86)', mono: true });
  text(ctx, 'A. RIVERA', -cw / 2 + 22, ch / 2 - 18, { size: 10, weight: 600, color: 'rgba(255,255,255,0.55)', tracking: 1.5 });
  ctx.restore();

  // floating confirmation chips
  const chips: [string, number, number, number][] = [
    ['+ €1,240.00  received', x + 18, y + 36, 0],
    ['Sent to Lisbon  ✓', x + w - 168, y + h - 58, 1.7],
  ];
  chips.forEach(([label, px, py, ph]) => {
    const a = (Math.sin(t * 0.7 + ph) * 0.5 + 0.5);
    ctx.save();
    ctx.globalAlpha = 0.65 + a * 0.35;
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 14;
    fillRR(ctx, px, py + Math.sin(t * 1.1 + ph) * 4, 150, 34, 17, '#ffffff');
    ctx.restore();
    ctx.beginPath();
    ctx.arc(px + 17, py + 17 + Math.sin(t * 1.1 + ph) * 4, 6, 0, Math.PI * 2);
    ctx.fillStyle = ph ? accent2 : '#22c55e';
    ctx.fill();
    text(ctx, label, px + 30, py + 21 + Math.sin(t * 1.1 + ph) * 4, { size: 11.5, weight: 600, color: '#141414' });
  });
}

export function drawLanding(ctx: Ctx, t: number, p: Project) {
  const { bg, ink, accent } = p.palette;
  const dark = isDark(bg);
  const sub = rgba(ink, 0.55);
  const faint = rgba(ink, 0.1);
  const scroll = scrollAt(t);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, VW, VH);

  ctx.save();
  ctx.translate(0, CHROME + 56 - scroll);

  // ---------------- hero
  const pill = `New  —  ${p.discipline === 'landing' && p.id === 'kiln' ? 'Wheel classes open for spring' : 'Instant FX in 40 countries'}`;
  ctx.font = `600 11px ${SANS}`;
  const pw = ctx.measureText(pill).width + 34;
  fillRR(ctx, 40, 34, pw, 26, 13, rgba(ink, 0.06));
  ctx.beginPath();
  ctx.arc(54, 47, 4, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  text(ctx, pill, 64, 51, { size: 11, weight: 600, color: rgba(ink, 0.75) });

  const head = wrap(ctx, p.tagline, 360, 46, 650);
  head.forEach((l, i) => {
    const reveal = easeOut(seg(t % 16.6, 0.1 + i * 0.12, 0.9 + i * 0.12));
    ctx.save();
    ctx.globalAlpha = reveal;
    text(ctx, l, 40, 118 + i * 50 + (1 - reveal) * 16, { size: 46, weight: 650, color: i === head.length - 1 ? accent : ink, tracking: -1.6 });
    ctx.restore();
  });
  const yb = 118 + head.length * 50;
  line(ctx, 40, yb - 8, 330, rgba(ink, 0.16));
  line(ctx, 40, yb + 8, 270, rgba(ink, 0.16));
  fillRR(ctx, 40, yb + 34, 150, 42, 21, ink);
  text(ctx, p.id === 'kiln' ? 'Shop the collection' : 'Open an account', 115, yb + 60, { size: 13, weight: 600, color: bg, align: 'center' });
  strokeRR(ctx, 202, yb + 34, 150, 42, 21, rgba(ink, 0.25), 1.2);
  text(ctx, 'See how it works  →', 277, yb + 60, { size: 13, weight: 600, color: ink, align: 'center' });

  heroVisual(ctx, p, 410, 24, 350, 400, t);

  // ---------------- logos
  text(ctx, 'TRUSTED BY TEAMS AT', 400, 500, { size: 10, weight: 600, color: sub, align: 'center', tracking: 2 });
  ['Northwind', 'Lumière', 'Fathom', 'Quarry', 'Halden'].forEach((n, i) => {
    text(ctx, n, 104 + i * 148, 538, { size: 19, weight: i % 2 ? 700 : 500, color: rgba(ink, 0.32), align: 'center', tracking: i % 2 ? -0.5 : 0.5 });
  });

  // ---------------- features
  text(ctx, p.id === 'kiln' ? 'Slow by design.' : 'Everything you need to move money.', 40, 650, { size: 34, weight: 650, color: ink, tracking: -1 });
  line(ctx, 40, 672, 380, rgba(ink, 0.14));
  const feats = p.id === 'kiln'
    ? ['Hand-thrown', 'Wood-fired', 'Made to last']
    : ['Multi-currency', 'Instant transfers', 'Bank-grade security'];
  feats.forEach((f, i) => {
    const x = 40 + i * 245;
    fillRR(ctx, x, 712, 230, 250, 16, dark ? rgba('#ffffff', 0.05) : rgba(ink, 0.04));
    fillRR(ctx, x + 20, 732, 40, 40, 12, i === 1 ? accent : rgba(ink, 0.9));
    ctx.beginPath();
    ctx.arc(x + 40, 752, 8, 0, Math.PI * 2);
    ctx.strokeStyle = i === 1 ? '#fff' : bg;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, f, x + 20, 812, { size: 18, weight: 650, color: ink, tracking: -0.4 });
    line(ctx, x + 20, 830, 180, faint);
    line(ctx, x + 20, 846, 150, faint);
    line(ctx, x + 20, 862, 165, faint);
    // mini UI inside the card
    fillRR(ctx, x + 20, 888, 190, 52, 10, dark ? rgba('#ffffff', 0.06) : '#ffffff');
    line(ctx, x + 32, 902, 70, rgba(ink, 0.2), 6);
    fillRR(ctx, x + 32, 918, 120 * (0.4 + 0.6 * (Math.sin(t * 0.8 + i) * 0.5 + 0.5)), 8, 4, i === 1 ? accent : rgba(ink, 0.5));
  });

  // ---------------- stats
  const stats = p.id === 'kiln'
    ? [['1,200°', 'firing temp'], ['48h', 'in the kiln'], ['3', 'potters']]
    : [['40+', 'countries'], ['$2.4B', 'moved in 2025'], ['0.3%', 'flat FX fee']];
  fillRR(ctx, 24, 1010, 752, 330, 22, ink);
  text(ctx, p.id === 'kiln' ? 'By the numbers' : 'Built for scale', 60, 1066, { size: 13, weight: 600, color: rgba(bg, 0.55), tracking: 1 });
  stats.forEach(([n, l], i) => {
    const x = 60 + i * 240;
    text(ctx, n, x, 1190, { size: 72, weight: 600, color: i === 0 ? accent : bg, tracking: -3 });
    text(ctx, l, x + 4, 1222, { size: 14, weight: 500, color: rgba(bg, 0.6) });
  });
  ctx.strokeStyle = rgba(bg, 0.12);
  ctx.beginPath();
  ctx.moveTo(60, 1270);
  ctx.lineTo(740, 1270);
  ctx.stroke();
  text(ctx, '“The calmest product launch we have ever shipped.”', 60, 1305, { size: 15, weight: 500, color: rgba(bg, 0.8) });

  // ---------------- CTA + footer
  text(ctx, p.id === 'kiln' ? 'Come throw with us.' : 'Start in minutes.', 400, 1460, { size: 52, weight: 650, color: ink, align: 'center', tracking: -2 });
  fillRR(ctx, 320, 1490, 160, 46, 23, accent);
  text(ctx, 'Get started', 400, 1519, { size: 14, weight: 650, color: '#fff', align: 'center' });
  ctx.fillStyle = faint;
  ctx.fillRect(40, 1600, 720, 1);
  for (let c = 0; c < 4; c++) {
    text(ctx, ['Product', 'Company', 'Resources', 'Legal'][c], 40 + c * 180, 1640, { size: 12, weight: 650, color: ink });
    for (let r = 0; r < 3; r++) line(ctx, 40 + c * 180, 1656 + r * 18, 60 + ((c + r) % 3) * 18, faint, 6);
  }
  ctx.restore();

  // ---------------- sticky nav
  ctx.fillStyle = rgba(bg, 0.92);
  ctx.fillRect(0, CHROME, VW, 56);
  ctx.fillStyle = faint;
  ctx.fillRect(0, CHROME + 55, VW, 1);
  ctx.beginPath();
  ctx.arc(52, CHROME + 28, 9, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  text(ctx, p.title.toLowerCase(), 68, CHROME + 33, { size: 17, weight: 700, color: ink, tracking: -0.6 });
  ['Product', 'Pricing', 'Company', 'Journal'].forEach((n, i) => {
    text(ctx, n, 300 + i * 82, CHROME + 32, { size: 12, weight: 500, color: rgba(ink, 0.6) });
  });
  fillRR(ctx, 664, CHROME + 13, 104, 30, 15, ink);
  text(ctx, 'Get started', 716, CHROME + 32, { size: 11.5, weight: 600, color: bg, align: 'center' });

  // ---------------- browser chrome
  ctx.fillStyle = dark ? '#1b1d20' : '#e8e6e1';
  ctx.fillRect(0, 0, VW, CHROME);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(18 + i * 16, 17, 5, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  });
  fillRR(ctx, 250, 8, 300, 19, 9.5, dark ? '#2a2d31' : '#ffffff');
  text(ctx, `${p.title.toLowerCase().replace(/\s|&/g, '')}.${p.id === 'kiln' ? 'studio' : 'money'}`, 400, 21.5, { size: 10.5, weight: 500, color: dark ? '#c9ccd1' : '#55575c', align: 'center' });

  // ---------------- cursor
  const c = track([[0, 520, 420], [1.6, 135, CHROME + 56 + yb + 55], [3.0, 140, CHROME + 56 + yb + 58], [5.5, 610, 330], [8.5, 300, 470], [11, 400, 380], [14, 450, 300]], t, 16.6);
  const pressed = c.seg === 1 && c.local > 0.6 && c.local < 0.9 ? 1 : 0;
  cursor(ctx, c.x, c.y, pressed);
}

