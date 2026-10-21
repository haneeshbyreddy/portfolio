import { DataTexture, LinearFilter, Matrix4, RGBAFormat } from 'three';
import { shared } from '../world/shared';

type Draw = (ctx: CanvasRenderingContext2D) => void;
export type Bounds = { x0: number; z0: number; x1: number; z1: number };

/** Far enough to throw a shape off the canvas and keep only its blurred shadow. */
const OFF = 20000;

/**
 * The marks the camp leaves on the ground, painted once into a single texture
 * that the grass and the terrain read (`groundMarks` in `shared.ts`):
 *  - r: soft overcast shade under everything that stands on the grass;
 *  - g: how trodden the grass is — flattened under the chairs, worn along the
 *    paths people walk between the desks, the lounge and the way in;
 *  - b: covered — under a blanket, a beanbag, a crate — where no grass shows;
 *  - a: mown — one floor cut out of the meadow under the whole camp, and the
 *    path in to it; short fresh lawn, a band of rough, then the long grass.
 *
 * Shapes are drawn in metres, in the frame of whatever left the mark (a desk's
 * station, a prop on the ground) or in world XZ when no frame is given.
 */
export class GroundMarks {
  private shade: CanvasRenderingContext2D;
  private trod: CanvasRenderingContext2D;
  private covered: CanvasRenderingContext2D;
  private mown: CanvasRenderingContext2D;
  private W: number;
  private H: number;

  constructor(readonly bounds: Bounds, readonly scale = 28) {
    this.W = Math.ceil((bounds.x1 - bounds.x0) * scale);
    this.H = Math.ceil((bounds.z1 - bounds.z0) * scale);
    const canvas = (fill: string) => {
      const c = document.createElement('canvas');
      c.width = this.W;
      c.height = this.H;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, this.W, this.H);
      return ctx;
    };
    this.shade = canvas('#fff');
    this.trod = canvas('#000');
    this.covered = canvas('#000');
    this.mown = canvas('#000');
  }

  /**
   * Put the canvas in a frame on the ground: station or prop space if `m` is
   * given (x right, z forward, in metres), world XZ otherwise. `dx` shifts the
   * result in device pixels (to throw a shape off-canvas for its shadow alone).
   */
  private frame(ctx: CanvasRenderingContext2D, m: Matrix4 | null, dx = 0) {
    const S = this.scale, b = this.bounds;
    if (!m) {
      ctx.setTransform(S, 0, 0, S, -b.x0 * S + dx, -b.z0 * S);
      return;
    }
    const e = m.elements;
    // local (x, z) → canvas: X = a x + c z + e, Y = b x + d z + f
    ctx.setTransform(S * e[0], S * e[2], S * e[8], S * e[10], (e[12] - b.x0) * S + dx, (e[14] - b.z0) * S);
  }

  /** A blurred blot of `value` (0..255 grey) drawn with `draw`, `blur` metres soft. */
  private blot(ctx: CanvasRenderingContext2D, m: Matrix4 | null, grey: number, alpha: number, blur: number, draw: Draw) {
    ctx.save();
    this.frame(ctx, m, -OFF);
    ctx.shadowColor = `rgba(${grey},${grey},${grey},${alpha})`;
    ctx.shadowBlur = blur * this.scale;
    ctx.shadowOffsetX = OFF;
    ctx.fillStyle = '#808080';
    ctx.strokeStyle = '#808080';
    draw(ctx);
    ctx.restore();
  }

  /** Overcast contact shade: soft, with no direction, darkest right under the thing. */
  shadow(m: Matrix4 | null, alpha: number, blur: number, draw: Draw) {
    this.blot(this.shade, m, 0, alpha, blur, draw);
    return this;
  }

  /** Grass pressed down by `amount` (0..1). */
  tread(m: Matrix4 | null, amount: number, blur: number, draw: Draw) {
    this.blot(this.trod, m, 255, amount, blur, draw);
    return this;
  }

  /** Ground covered by something lying on it: no grass comes through. */
  cover(m: Matrix4 | null, draw: Draw) {
    const ctx = this.covered;
    ctx.save();
    this.frame(ctx, m);
    ctx.fillStyle = '#fff';
    draw(ctx);
    ctx.restore();
    return this;
  }

  /** Cut the grass short wherever `draw` fills, with a mower's edge `soft` metres wide. */
  mow(m: Matrix4 | null, draw: Draw, soft = 0.06) {
    this.blot(this.mown, m, 255, 1, soft, draw);
    return this;
  }

  /**
   * Mow one clearing round everything listed (world circles), the way you'd
   * push a mower round a camp by eye: the circles melt into a single floor
   * with a loose, rounded outline. The edge is left as a gradient `soft`
   * metres wide, which the grass reads as a band of rough between the lawn
   * and the long meadow.
   */
  mowAround(spots: { x: number; z: number; r: number }[], soft: number) {
    const { W, H } = this;
    const field = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    field.canvas.width = W;
    field.canvas.height = H;
    field.fillStyle = '#000';
    field.fillRect(0, 0, W, H);
    // the space between is part of the floor too: fill the hull of it all,
    // then let the circles bulge the outline out round whatever's at the edge
    const hull = convexHull(spots.map((s) => [s.x, s.z] as [number, number]));
    this.blot(field, null, 255, 1, soft, (ctx) => {
      ctx.beginPath();
      hull.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
      ctx.closePath();
      ctx.fill();
      for (const s of spots) {
        ctx.beginPath();
        ctx.arc(s.x, s.z, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    // keep whichever is more mown, the clearing or what's already cut
    const add = field.getImageData(0, 0, W, H);
    const cur = this.mown.getImageData(0, 0, W, H);
    for (let i = 0; i < cur.data.length; i += 4) {
      const v = Math.max(cur.data[i], add.data[i]);
      cur.data[i] = cur.data[i + 1] = cur.data[i + 2] = v;
    }
    this.mown.putImageData(cur, 0, 0);
    return this;
  }

  /** A line through world points, smoothed through the midpoints so it bends like one walked, not drawn. */
  private stroke(ctx: CanvasRenderingContext2D, points: [number, number][]) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length - 1; i++) {
      const [x, z] = points[i];
      const [nx, nz] = points[i + 1];
      ctx.quadraticCurveTo(x, z, (x + nx) / 2, (z + nz) / 2);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last[0], last[1]);
  }

  /** A mown path along world points, `width` metres across, its edge `soft` metres of rough. */
  mowPath(points: [number, number][], width: number, soft = 0.06) {
    return this.mow(null, (ctx) => {
      this.stroke(ctx, points);
      ctx.lineWidth = width;
      ctx.stroke();
    }, soft);
  }

  /**
   * Feet along world points: a soft band with a more trodden line down the
   * middle, where the steps actually land.
   */
  path(points: [number, number][], width: number, amount: number) {
    this.tread(null, amount * 0.55, width * 0.6, (ctx) => {
      this.stroke(ctx, points);
      ctx.lineWidth = width;
      ctx.stroke();
    });
    this.tread(null, amount, width * 0.25, (ctx) => {
      this.stroke(ctx, points);
      ctx.lineWidth = width * 0.38;
      ctx.stroke();
    });
    return this;
  }

  /**
   * Upload every layer as one texture and hand it to every ground material.
   * Raw bytes, not a canvas: a canvas would premultiply the mown layer in
   * alpha into the other three. Row 0 is the near edge of the bounds (z0).
   */
  bake() {
    const { W, H } = this;
    const shade = this.shade.getImageData(0, 0, W, H).data;
    const trod = this.trod.getImageData(0, 0, W, H).data;
    const covered = this.covered.getImageData(0, 0, W, H).data;
    const mown = this.mown.getImageData(0, 0, W, H).data;
    const o = new Uint8Array(W * H * 4);
    for (let i = 0; i < o.length; i += 4) {
      o[i] = shade[i];
      o[i + 1] = trod[i];
      o[i + 2] = covered[i];
      o[i + 3] = mown[i];
    }
    const tex = new DataTexture(o, W, H, RGBAFormat);
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    const b = this.bounds;
    shared.uGround.value = tex;
    shared.uGroundBounds.value.set(b.x0, b.z0, b.x1, b.z1);
    return tex;
  }
}

/** Convex hull of points in the plane (Andrew's monotone chain), counter-clockwise. */
function convexHull(points: [number, number][]) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
