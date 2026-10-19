// Canvas-2D helpers for the monitor programs. Everything is authored in a
// virtual 800×600 space and scaled to whatever resolution the screen needs.

export const VW = 800;
export const VH = 600;

export const SANS = '"Inter Tight Variable", "Inter Tight", system-ui, sans-serif';
export const MONO = '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace';

export type Ctx = CanvasRenderingContext2D;

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => {
  t = clamp(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

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

export function strokeRR(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, stroke: string, lw = 1) {
  rr(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.stroke();
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

/** A grey placeholder line of copy. */
export function line(ctx: Ctx, x: number, y: number, w: number, color: string, h = 7) {
  fillRR(ctx, x, y, w, h, h / 2, color);
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

export function mix(a: string, b: string, t: number) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(lerp(v, B[i], t)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Luminance check so programs can pick readable overlays. */
export function isDark(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

export function cursor(ctx: Ctx, x: number, y: number, pressed = 0) {
  ctx.save();
  ctx.translate(x, y);
  const s = 1 - pressed * 0.12;
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 19);
  ctx.lineTo(4.6, 14.6);
  ctx.lineTo(8, 22);
  ctx.lineTo(11, 20.6);
  ctx.lineTo(7.8, 13.6);
  ctx.lineTo(14, 13.6);
  ctx.closePath();
  ctx.fillStyle = '#111';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

/** Smooth keyframed path for fake cursors: [time, x, y][] looped over `period`. */
export function track(keys: [number, number, number][], t: number, period: number) {
  const tt = ((t % period) + period) % period;
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i];
    const b = keys[(i + 1) % keys.length];
    const tb = i + 1 < keys.length ? b[0] : period + keys[0][0];
    if (tt >= a[0] && tt < tb) {
      const k = ease((tt - a[0]) / (tb - a[0]));
      return { x: lerp(a[1], b[1], k), y: lerp(a[2], b[2], k), seg: i, local: tt - a[0], span: tb - a[0] };
    }
  }
  return { x: keys[0][1], y: keys[0][2], seg: 0, local: 0, span: 1 };
}

export function grain(ctx: Ctx, amount: number, t: number) {
  ctx.save();
  ctx.globalAlpha = amount;
  const seed = Math.floor(t * 24);
  for (let i = 0; i < 260; i++) {
    const r = Math.abs(Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453) % 1;
    const r2 = Math.abs(Math.sin((i + 7) * 4.1414 + seed * 1.733) * 24634.6345) % 1;
    ctx.fillStyle = r > 0.5 ? '#fff' : '#000';
    ctx.fillRect(r * VW, r2 * VH, 1.6, 1.6);
  }
  ctx.restore();
}
