// Canvas-2D helpers for the screen programs. Everything is authored in a
// virtual 800×600 space and scaled to whatever resolution the screen needs.

export const VW = 800;
export const VH = 600;

export const SANS = '"Inter Tight Variable", "Inter Tight", system-ui, sans-serif';
export const MONO = '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace';

export type Ctx = CanvasRenderingContext2D;

export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function fillRR(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

interface TextOpts {
  size?: number;
  weight?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  mono?: boolean;
  tracking?: number;
  alpha?: number;
}

export function text(ctx: Ctx, str: string, x: number, y: number, o: TextOpts = {}) {
  ctx.save();
  ctx.font = `${o.weight ?? 500} ${o.size ?? 14}px ${o.mono ? MONO : SANS}`;
  ctx.fillStyle = o.color ?? '#000';
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.baseline ?? 'alphabetic';
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  if ('letterSpacing' in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${o.tracking ?? 0}px`;
  ctx.fillText(str, x, y);
  ctx.restore();
}

export function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Luminance check so programs can pick readable overlays. */
export function isDark(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}
