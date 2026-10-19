import type { Project } from '../../data/projects';
import { cursor, ease, easeOut, fillRR, lerp, rgba, seg, strokeRR, text, track, VH, VW, type Ctx } from '../draw';

const series = (i: number, t: number, seed: number) =>
  0.45 + Math.sin(i * 0.38 + seed) * 0.12 + Math.sin(i * 0.11 + seed * 2) * 0.16 + Math.sin(i * 1.3 + t * 0.6) * 0.035 + i * 0.006;

function fmt(n: number, d = 1) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function sidebar(ctx: Ctx, p: Project, items: string[], active: number) {
  const { bg, ink, accent } = p.palette;
  ctx.fillStyle = rgba('#000000', 0.22);
  ctx.fillRect(0, 0, 168, VH);
  ctx.fillStyle = rgba(ink, 0.06);
  ctx.fillRect(167, 0, 1, VH);
  fillRR(ctx, 20, 22, 26, 26, 8, accent);
  ctx.beginPath();
  ctx.arc(33, 35, 6, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  text(ctx, p.title, 56, 40, { size: 15, weight: 650, color: ink, tracking: -0.3 });
  items.forEach((it, i) => {
    const y = 84 + i * 34;
    if (i === active) fillRR(ctx, 12, y - 4, 144, 30, 8, rgba(ink, 0.08));
    fillRR(ctx, 24, y + 4, 14, 14, 4, i === active ? accent : rgba(ink, 0.3));
    text(ctx, it, 48, y + 16, { size: 12.5, weight: i === active ? 600 : 500, color: i === active ? ink : rgba(ink, 0.55) });
  });
  fillRR(ctx, 12, VH - 62, 144, 46, 10, rgba(ink, 0.05));
  ctx.beginPath();
  ctx.arc(36, VH - 39, 12, 0, Math.PI * 2);
  ctx.fillStyle = rgba(accent, 0.7);
  ctx.fill();
  text(ctx, 'Maya Chen', 56, VH - 42, { size: 11.5, weight: 600, color: ink });
  text(ctx, 'Finance lead', 56, VH - 28, { size: 10, weight: 500, color: rgba(ink, 0.45) });
}

function topbar(ctx: Ctx, p: Project, title: string) {
  const { ink } = p.palette;
  text(ctx, title, 192, 46, { size: 22, weight: 650, color: ink, tracking: -0.6 });
  fillRR(ctx, 470, 26, 150, 30, 8, rgba(ink, 0.06));
  text(ctx, '⌘K   Search…', 484, 45, { size: 11.5, weight: 500, color: rgba(ink, 0.45) });
  strokeRR(ctx, 632, 26, 112, 30, 8, rgba(ink, 0.14));
  text(ctx, 'Last 30 days  ▾', 688, 45, { size: 11.5, weight: 600, color: rgba(ink, 0.75), align: 'center' });
  ctx.beginPath();
  ctx.arc(768, 41, 13, 0, Math.PI * 2);
  ctx.fillStyle = rgba(ink, 0.18);
  ctx.fill();
}

function analytics(ctx: Ctx, t: number, p: Project) {
  const { ink, accent, accent2 } = p.palette;
  const P = 18;
  const tt = t % P;
  const intro = ease(seg(tt, 0, 1.6));
  sidebar(ctx, p, ['Overview', 'Revenue', 'Customers', 'Cohorts', 'Forecast', 'Reports'], 0);
  topbar(ctx, p, 'Overview');

  // KPI cards
  const kpis: [string, number, string, number][] = [
    ['MRR', 482.3, '$', 12.4],
    ['Net retention', 118.2, '', 3.1],
    ['Churn', 1.84, '', -0.4],
    ['Active accounts', 2384, '', 8.9],
  ];
  kpis.forEach(([label, val, pre, d], i) => {
    const x = 192 + i * 148;
    fillRR(ctx, x, 76, 136, 86, 12, rgba(ink, 0.05));
    strokeRR(ctx, x, 76, 136, 86, 12, rgba(ink, 0.07));
    text(ctx, label, x + 14, 98, { size: 11, weight: 500, color: rgba(ink, 0.5) });
    const live = val * intro + Math.sin(t * 0.7 + i) * val * 0.002;
    const str = i === 0 ? `${pre}${fmt(live)}K` : i === 1 ? `${fmt(live)}%` : i === 2 ? `${fmt(live, 2)}%` : fmt(live, 0);
    text(ctx, str, x + 14, 132, { size: 24, weight: 600, color: ink, tracking: -0.8 });
    const good = (d > 0) !== (i === 2);
    fillRR(ctx, x + 14, 141, 52, 15, 7.5, rgba(good ? accent : '#ff6b6b', 0.16));
    text(ctx, `${d > 0 ? '↑' : '↓'} ${Math.abs(d)}%`, x + 40, 152, { size: 9.5, weight: 650, color: good ? accent : '#ff8a8a', align: 'center' });
  });

  // main area chart
  const cx = 192, cy = 178, cw = 400, ch = 240;
  fillRR(ctx, cx, cy, cw, ch, 12, rgba(ink, 0.04));
  strokeRR(ctx, cx, cy, cw, ch, 12, rgba(ink, 0.07));
  text(ctx, 'Revenue', cx + 16, cy + 26, { size: 12.5, weight: 600, color: ink });
  text(ctx, '$5.82M  ARR', cx + 16, cy + 50, { size: 20, weight: 600, color: ink, tracking: -0.6 });
  for (let g = 0; g < 4; g++) {
    ctx.fillStyle = rgba(ink, 0.06);
    ctx.fillRect(cx + 16, cy + 82 + g * 38, cw - 32, 1);
  }
  const N = 48;
  const draw = easeOut(seg(tt, 0.3, 2.6));
  const px = (i: number) => cx + 16 + (i / (N - 1)) * (cw - 32);
  const py = (v: number) => cy + ch - 18 - v * (ch - 110);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx, cy, 16 + (cw - 32) * draw, ch);
  ctx.clip();
  const grad = ctx.createLinearGradient(0, cy + 80, 0, cy + ch);
  grad.addColorStop(0, rgba(accent, 0.32));
  grad.addColorStop(1, rgba(accent, 0));
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const x = px(i), y = py(series(i, t, 1.7));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.lineTo(px(N - 1), cy + ch - 18);
  ctx.lineTo(px(0), cy + ch - 18);
  ctx.fillStyle = grad;
  ctx.fill();
  // comparison series
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const x = px(i), y = py(series(i, t, 4.2) * 0.72);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = rgba(accent2, 0.7);
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // hover crosshair + tooltip
  const hi = Math.floor(lerp(8, 44, Math.sin(t * 0.35) * 0.5 + 0.5));
  if (draw > 0.98) {
    const hx = px(hi), hy = py(series(hi, t, 1.7));
    ctx.fillStyle = rgba(ink, 0.18);
    ctx.fillRect(hx, cy + 70, 1, ch - 88);
    ctx.beginPath();
    ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.strokeStyle = p.palette.bg;
    ctx.lineWidth = 2;
    ctx.stroke();
    const tx = Math.min(hx + 10, cx + cw - 120);
    fillRR(ctx, tx, hy - 52, 108, 42, 8, rgba('#000000', 0.55));
    text(ctx, `Mar ${hi - 4}`, tx + 10, hy - 34, { size: 10, weight: 500, color: rgba('#ffffff', 0.6) });
    text(ctx, `$${fmt(400 + series(hi, t, 1.7) * 140)}K`, tx + 10, hy - 18, { size: 13, weight: 650, color: '#fff' });
  }

  // right column: bar chart
  const bx = 604, by = 178, bw = 172, bh = 240;
  fillRR(ctx, bx, by, bw, bh, 12, rgba(ink, 0.04));
  strokeRR(ctx, bx, by, bw, bh, 12, rgba(ink, 0.07));
  text(ctx, 'Plans', bx + 16, by + 26, { size: 12.5, weight: 600, color: ink });
  const plans: [string, number][] = [['Enterprise', 0.82], ['Growth', 0.64], ['Team', 0.46], ['Starter', 0.28]];
  plans.forEach(([name, v], i) => {
    const y = by + 52 + i * 44;
    text(ctx, name, bx + 16, y + 10, { size: 10.5, weight: 500, color: rgba(ink, 0.6) });
    fillRR(ctx, bx + 16, y + 18, bw - 32, 8, 4, rgba(ink, 0.07));
    const k = easeOut(seg(tt, 0.6 + i * 0.15, 2 + i * 0.15)) * (v + Math.sin(t * 0.5 + i) * 0.03);
    fillRR(ctx, bx + 16, y + 18, (bw - 32) * k, 8, 4, i === 0 ? accent : rgba(accent, 0.45 + 0.15 * (3 - i)));
  });

  // table
  const tx = 192, ty = 430;
  fillRR(ctx, tx, ty, 584, 154, 12, rgba(ink, 0.04));
  strokeRR(ctx, tx, ty, 584, 154, 12, rgba(ink, 0.07));
  ['Account', 'Plan', 'MRR', 'Status'].forEach((h, i) => {
    text(ctx, h, tx + 16 + [0, 220, 340, 460][i], ty + 24, { size: 10, weight: 600, color: rgba(ink, 0.45), tracking: 0.5 });
  });
  const rows: [string, string, string, string][] = [
    ['Northwind Labs', 'Enterprise', '$24,800', 'Active'],
    ['Lumière Studio', 'Growth', '$6,240', 'Expanding'],
    ['Fathom & Co', 'Team', '$1,980', 'Active'],
    ['Quarry Health', 'Growth', '$7,410', 'At risk'],
  ];
  const shift = Math.floor(t / 4.5) % rows.length;
  for (let r = 0; r < 4; r++) {
    const row = rows[(r + shift) % rows.length];
    const y = ty + 48 + r * 26;
    const a = r === 0 ? easeOut(seg(t % 4.5, 0, 0.6)) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = rgba(ink, 0.05);
    ctx.fillRect(tx + 16, y - 16, 552, 1);
    text(ctx, row[0], tx + 16, y, { size: 11.5, weight: 600, color: ink });
    text(ctx, row[1], tx + 236, y, { size: 11, weight: 500, color: rgba(ink, 0.6) });
    text(ctx, row[2], tx + 356, y, { size: 11, weight: 600, color: ink, mono: true });
    const col = row[3] === 'At risk' ? '#ff8a6b' : row[3] === 'Expanding' ? accent2 : accent;
    fillRR(ctx, tx + 476, y - 12, 70, 17, 8.5, rgba(col, 0.15));
    text(ctx, row[3], tx + 511, y, { size: 9.5, weight: 650, color: col, align: 'center' });
    ctx.restore();
  }

  const c = track([[0, 700, 520], [2.5, 400, 300], [6, 520, 270], [9, 690, 260], [12, 330, 500], [15, 640, 120]], t, P);
  cursor(ctx, c.x, c.y);
}

function graph(ctx: Ctx, t: number, p: Project) {
  const { ink, accent, accent2 } = p.palette;
  sidebar(ctx, p, ['Topology', 'Deploys', 'Services', 'Costs', 'Logs', 'Settings'], 0);
  topbar(ctx, p, 'Topology');

  const ox = 192, oy = 76, ow = 584, oh = 400;
  fillRR(ctx, ox, oy, ow, oh, 12, rgba(ink, 0.035));
  strokeRR(ctx, ox, oy, ow, oh, 12, rgba(ink, 0.07));
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, ow, oh);
  ctx.clip();
  for (let x = ox + 12; x < ox + ow; x += 22) {
    for (let y = oy + 12; y < oy + oh; y += 22) {
      ctx.fillStyle = rgba(ink, 0.08);
      ctx.fillRect(x, y, 1.4, 1.4);
    }
  }
  const nodes: [string, number, number, number][] = [
    ['edge-gateway', 0.12, 0.5, 0], ['auth', 0.36, 0.22, 1], ['api', 0.38, 0.62, 0], ['search', 0.62, 0.18, 1],
    ['billing', 0.64, 0.5, 2], ['events', 0.62, 0.82, 0], ['postgres', 0.88, 0.36, 3], ['redis', 0.88, 0.7, 3],
  ];
  const edges = [[0, 1], [0, 2], [1, 3], [2, 4], [2, 5], [4, 6], [3, 6], [5, 7], [2, 7]];
  const P = (i: number) => ({ x: ox + nodes[i][1] * ow, y: oy + nodes[i][2] * oh });
  edges.forEach(([a, b], ei) => {
    const A = P(a), B = P(b);
    const mx = (A.x + B.x) / 2;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.bezierCurveTo(mx, A.y, mx, B.y, B.x, B.y);
    ctx.strokeStyle = rgba(ink, 0.18);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // packets flowing
    for (let k = 0; k < 2; k++) {
      const u = ((t * 0.32 + ei * 0.17 + k * 0.5) % 1);
      const x = Math.pow(1 - u, 3) * A.x + 3 * Math.pow(1 - u, 2) * u * mx + 3 * (1 - u) * u * u * mx + u * u * u * B.x;
      const y = Math.pow(1 - u, 3) * A.y + 3 * Math.pow(1 - u, 2) * u * A.y + 3 * (1 - u) * u * u * B.y + u * u * u * B.y;
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = ei % 3 === 0 ? accent2 : accent;
      ctx.fill();
    }
  });
  nodes.forEach(([name, , , kind], i) => {
    const { x, y } = P(i);
    const sel = Math.floor(t / 3) % nodes.length === i;
    const w = 108;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 12;
    fillRR(ctx, x - w / 2, y - 18, w, 36, 9, p.palette.bg);
    ctx.restore();
    strokeRR(ctx, x - w / 2, y - 18, w, 36, 9, sel ? accent : rgba(ink, 0.16), sel ? 1.6 : 1);
    ctx.beginPath();
    ctx.arc(x - w / 2 + 16, y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = kind === 3 ? accent2 : kind === 2 && Math.sin(t * 3) > 0 ? '#ffb86b' : '#5be49b';
    ctx.fill();
    text(ctx, name, x - w / 2 + 28, y + 4, { size: 11, weight: 600, color: ink, mono: true });
  });
  ctx.restore();

  // deploy log strip
  const ly = 488;
  fillRR(ctx, ox, ly, ow, 96, 12, rgba('#000000', 0.28));
  const logs = [
    ['12:04:21', 'deploy', 'api@a91f2c  →  production'],
    ['12:04:27', 'health', 'api  4/4 instances healthy'],
    ['12:04:30', 'cost', 'billing  −$412/mo after resize'],
    ['12:04:41', 'deploy', 'search@77de10  →  canary 10%'],
    ['12:04:52', 'alert', 'events  p95 latency 182ms'],
  ];
  const off = Math.floor(t / 1.6);
  for (let r = 0; r < 4; r++) {
    const l = logs[(r + off) % logs.length];
    const y = ly + 24 + r * 20;
    text(ctx, l[0], ox + 16, y, { size: 10.5, weight: 500, color: rgba(ink, 0.4), mono: true });
    text(ctx, l[1].padEnd(7, ' '), ox + 90, y, { size: 10.5, weight: 600, color: l[1] === 'alert' ? '#ffb86b' : accent, mono: true });
    text(ctx, l[2], ox + 160, y, { size: 10.5, weight: 500, color: rgba(ink, 0.8), mono: true });
  }
  if (Math.sin(t * 6) > 0) {
    ctx.fillStyle = accent;
    ctx.fillRect(ox + 16, ly + 84, 7, 2);
  }
  const c = track([[0, 520, 300], [3, 300, 160], [6, 680, 260], [9, 560, 420], [12, 430, 520]], t, 15);
  cursor(ctx, c.x, c.y);
}

export function drawSaas(ctx: Ctx, t: number, p: Project) {
  ctx.fillStyle = p.palette.bg;
  ctx.fillRect(0, 0, VW, VH);
  if (p.id === 'atlas') graph(ctx, t, p);
  else analytics(ctx, t, p);
}
