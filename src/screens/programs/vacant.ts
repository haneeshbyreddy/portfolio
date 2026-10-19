import { fillRR, rgba, text, VH, VW, type Ctx } from '../draw';

const PHOS = '#9dffc8';

/** Unassigned desk: a terminal that wakes up when you sit down. */
export function drawVacant(ctx: Ctx, t: number, deskNo: number) {
  ctx.fillStyle = '#04100b';
  ctx.fillRect(0, 0, VW, VH);
  const g = ctx.createRadialGradient(VW / 2, VH / 2, 50, VW / 2, VH / 2, VW * 0.7);
  g.addColorStop(0, 'rgba(60,160,110,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);

  const no = String(deskNo).padStart(2, '0');
  const lines: [string, number][] = [
    [`FIELDWORK OS  2.6    ·    DESK ${no}`, 0.2],
    ['──────────────────────────────────────', 0.5],
    ['> whoami', 1.0],
    ['  nobody yet', 1.6],
    ['> status', 2.4],
    ['  UNASSIGNED', 2.9],
    ['> awaiting_next_project', 3.7],
    ['  ......................... listening', 4.3],
    ['', 5.2],
    ['> hint', 5.6],
    ['  this desk is reserved for a project', 6.1],
    ['  that has not happened yet.', 6.6],
    ['  maybe yours.', 7.3],
  ];
  const cps = 38;
  let lastY = 0;
  let lastW = 0;
  lines.forEach(([str, start], i) => {
    const local = t - start;
    if (local < 0) return;
    const n = Math.min(str.length, Math.floor(local * cps));
    const shown = str.slice(0, n);
    const y = 70 + i * 34;
    const isCmd = str.startsWith('>');
    const strong = str.includes('UNASSIGNED') || str.includes('maybe yours');
    text(ctx, shown, 48, y, { size: 19, weight: strong ? 700 : 500, color: isCmd ? rgba(PHOS, 0.65) : PHOS, mono: true });
    lastY = y;
    ctx.font = `${strong ? 700 : 500} 19px "Geist Mono Variable", monospace`;
    lastW = ctx.measureText(shown).width;
  });
  if (Math.floor(t * 2.2) % 2 === 0) fillRR(ctx, 50 + lastW, lastY - 17, 11, 21, 1, PHOS);

  // prompt at the bottom
  if (t > 8.2) {
    const a = Math.min(1, (t - 8.2) * 1.5);
    ctx.save();
    ctx.globalAlpha = a;
    fillRR(ctx, 48, VH - 88, 300, 44, 4, 'rgba(157,255,200,0.12)');
    ctx.strokeStyle = rgba(PHOS, 0.6);
    ctx.strokeRect(48.5, VH - 87.5, 299, 43);
    text(ctx, '[ ENTER ]  start a project', 64, VH - 60, { size: 17, weight: 600, color: PHOS, mono: true });
    ctx.restore();
  }
}
