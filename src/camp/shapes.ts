import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Low-level shape helpers for the camp props. Everything returns a plain
 * BufferGeometry with positions + normals, ready for GeoBuilder.add().
 */

const UP = new Vector3(0, 1, 0);
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();

export const v3 = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);

/** Colour mix done on the sRGB values (how a designer would blend swatches), as a hex string. */
export function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const c = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return '#' + ((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0');
}

/** Multiply a colour (in linear space) by k. */
export function shade(hex: string, k: number) {
  return '#' + new Color(hex).multiplyScalar(k).getHexString();
}

export const triCount = (g: BufferGeometry) =>
  (g.index ? g.index.count : g.attributes.position.count) / 3;

/** Rounded box with explicit corner segments (GeoBuilder.box always uses 2). */
export function rbox(w: number, h: number, d: number, r: number, seg = 2) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.max(1e-4, Math.min(r, w / 2, h / 2, d / 2)));
}

/** Cylinder from a to b (radius rA at a, rB at b). */
export function cylBetween(a: Vector3, b: Vector3, rA: number, rB = rA, seg = 10, open = false) {
  const d = new Vector3().subVectors(b, a);
  const len = d.length();
  const g = new CylinderGeometry(rB, rA, len, seg, 1, open);
  g.applyMatrix4(
    new Matrix4().compose(
      a.clone().add(b).multiplyScalar(0.5),
      new Quaternion().setFromUnitVectors(UP, d.divideScalar(len)),
      new Vector3(1, 1, 1),
    ),
  );
  return g;
}

export function sphereAt(p: Vector3, r: number, w = 10, h = 7) {
  return new SphereGeometry(r, w, h).translate(p.x, p.y, p.z);
}

/* -------------------------------------------------------------------------- */
/*  Parametric surfaces                                                       */
/* -------------------------------------------------------------------------- */

export type SurfFn = (u: number, v: number, out: Vector3) => void;

export interface Orient {
  /** Faces should point away from this point. */
  center?: Vector3;
  /** Faces should point along this direction. */
  dir?: Vector3;
}

function orientScore(g: BufferGeometry, o: Orient) {
  const p = g.attributes.position;
  const idx = g.index!;
  let score = 0;
  for (let i = 0; i < idx.count; i += 3) {
    _a.fromBufferAttribute(p, idx.getX(i));
    _b.fromBufferAttribute(p, idx.getX(i + 1));
    _c.fromBufferAttribute(p, idx.getX(i + 2));
    const n = new Vector3().subVectors(_b, _a).cross(new Vector3().subVectors(_c, _a));
    if (o.dir) score += n.dot(o.dir);
    else if (o.center) score += n.dot(_a.add(_b).add(_c).multiplyScalar(1 / 3).sub(o.center));
  }
  return score;
}

function flipIndex(g: BufferGeometry) {
  const idx = g.index!;
  const arr = idx.array as Uint32Array | Uint16Array;
  for (let i = 0; i < arr.length; i += 3) {
    const t = arr[i + 1];
    arr[i + 1] = arr[i + 2];
    arr[i + 2] = t;
  }
  idx.needsUpdate = true;
}

/**
 * (nu+1) × (nv+1) grid surface. Winding gives normals along dP/du × dP/dv
 * unless `flip`, or `orient` picks the side automatically. `weld` merges
 * coincident vertices (seams, poles) so a closed surface shades smoothly.
 */
export function surface(nu: number, nv: number, fn: SurfFn, opts: { flip?: boolean; weld?: boolean; orient?: Orient } = {}) {
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
  const p = new Vector3();
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      fn(i / nu, j / nv, p);
      const k = (j * (nu + 1) + i) * 3;
      pos[k] = p.x;
      pos[k + 1] = p.y;
      pos[k + 2] = p.z;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const c = a + nu + 1;
      const d = c + 1;
      if (opts.flip) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  let g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  if (opts.orient && orientScore(g, opts.orient) < 0) flipIndex(g);
  if (opts.weld) g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  return g;
}

/**
 * A thin closed sheet: `fn` is the top (outer) surface, the bottom is offset
 * along the inward normal by `thickness`, and the open boundary is stitched
 * with edge strips. Returned in three parts so each side can take its own
 * finish (canvas outside, shade underneath).
 */
export function shell(
  nu: number,
  nv: number,
  fn: SurfFn,
  thickness: number,
  opts: { closedU?: boolean; orient?: Orient; /** 'v' = only stitch the v = 0 / v = 1 borders. */ edges?: 'all' | 'v' } = {},
) {
  const W = nu + 1;
  const P: Vector3[] = [];
  const N: Vector3[] = [];
  const eps = 1e-3;
  const pu0 = new Vector3(), pu1 = new Vector3(), pv0 = new Vector3(), pv1 = new Vector3();
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      const p = new Vector3();
      fn(u, v, p);
      P.push(p);
      const ua = opts.closedU ? u - eps : Math.max(0, u - eps);
      const ub = opts.closedU ? u + eps : Math.min(1, u + eps);
      fn(ua, v, pu0);
      fn(ub, v, pu1);
      fn(u, Math.max(0, v - eps), pv0);
      fn(u, Math.min(1, v + eps), pv1);
      const n = pu1.sub(pu0).cross(pv1.sub(pv0));
      if (n.lengthSq() < 1e-20) n.set(0, 1, 0);
      N.push(n.normalize().clone());
    }
  }
  // Pick the outward side.
  let flip = false;
  if (opts.orient) {
    let s = 0;
    for (let k = 0; k < P.length; k++) {
      if (opts.orient.dir) s += N[k].dot(opts.orient.dir);
      else if (opts.orient.center) s += N[k].dot(_a.subVectors(P[k], opts.orient.center));
    }
    flip = s < 0;
  }
  if (flip) N.forEach((n) => n.negate());

  const build = (pts: Vector3[], nrm: Vector3[]) => {
    const pos = new Float32Array(pts.length * 3);
    const nor = new Float32Array(pts.length * 3);
    pts.forEach((p, k) => {
      pos.set([p.x, p.y, p.z], k * 3);
      nor.set([nrm[k].x, nrm[k].y, nrm[k].z], k * 3);
    });
    const idx: number[] = [];
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    // make the winding agree with the normals
    if (orientAgainstNormals(g) < 0) flipIndex(g);
    return g;
  };

  const top = build(P, N);
  const B = P.map((p, k) => p.clone().addScaledVector(N[k], -thickness));
  const BN = N.map((n) => n.clone().negate());
  const bottom = build(B, BN);

  // Edge strips along the open boundary.
  const strips: BufferGeometry[] = [];
  const strip = (ids: number[], outward: (k: number) => Vector3) => {
    const pos: number[] = [];
    for (let k = 0; k < ids.length - 1; k++) {
      const t0 = P[ids[k]], t1 = P[ids[k + 1]], b0 = B[ids[k]], b1 = B[ids[k + 1]];
      const n = new Vector3().subVectors(t1, t0).cross(new Vector3().subVectors(b0, t0));
      const out = outward(k);
      const quad = n.dot(out) >= 0 ? [t0, t1, b0, t1, b1, b0] : [t0, b0, t1, t1, b0, b1];
      quad.forEach((q) => pos.push(q.x, q.y, q.z));
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const m = mergeVertices(g, 1e-6);
    m.computeVertexNormals();
    strips.push(m);
  };
  const col = (i: number) => Array.from({ length: nv + 1 }, (_, j) => j * W + i);
  const row = (j: number) => Array.from({ length: nu + 1 }, (_, i) => j * W + i);
  const dirTo = (ids: number[], inner: number[]) => (k: number) => new Vector3().subVectors(P[ids[k]], P[inner[k]]);
  strip(row(0), dirTo(row(0), row(1)));
  strip(row(nv), dirTo(row(nv), row(nv - 1)));
  if (!opts.closedU && opts.edges !== 'v') {
    strip(col(0), dirTo(col(0), col(1)));
    strip(col(nu), dirTo(col(nu), col(nu - 1)));
  }
  const edge = mergeParts(strips);
  return { top, bottom, edge };
}

/** Score > 0 when triangle winding agrees with the stored vertex normals. */
function orientAgainstNormals(g: BufferGeometry) {
  const p = g.attributes.position;
  const nr = g.attributes.normal;
  const idx = g.index!;
  let s = 0;
  const n = new Vector3();
  for (let i = 0; i < idx.count; i += 3) {
    const ia = idx.getX(i), ib = idx.getX(i + 1), ic = idx.getX(i + 2);
    _a.fromBufferAttribute(p, ia);
    _b.fromBufferAttribute(p, ib);
    _c.fromBufferAttribute(p, ic);
    const fnrm = _b.sub(_a).cross(_c.sub(_a));
    n.fromBufferAttribute(nr, ia);
    s += Math.sign(fnrm.dot(n));
  }
  return s;
}

/** Merge raw geometries that only carry position + normal. */
export function mergeParts(parts: BufferGeometry[]) {
  const nonIndexed = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let count = 0;
  nonIndexed.forEach((g) => (count += g.attributes.position.count));
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of nonIndexed) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    o += g.attributes.position.count;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  return g;
}

/* -------------------------------------------------------------------------- */
/*  Superellipsoid blobs                                                      */
/* -------------------------------------------------------------------------- */

const spow = (x: number, e: number) => Math.sign(x) * Math.pow(Math.abs(x), e);

/**
 * Rounded "pillow" solid. e1 = vertical squareness, e2 = horizontal
 * (1 = ellipsoid, 0.3 = soft box). Centred on the origin.
 */
export function blob(rx: number, ry: number, rz: number, e1 = 0.5, e2 = 0.5, nu = 28, nv = 16) {
  return surface(nu, nv, (u, v, out) => {
    const w = (u - 0.5) * Math.PI * 2;
    const h = (v - 0.5) * Math.PI;
    const ch = spow(Math.cos(h), e1);
    out.set(rx * ch * spow(Math.cos(w), e2), ry * spow(Math.sin(h), e1), rz * ch * spow(Math.sin(w), e2));
  }, { weld: true, orient: { center: new Vector3() } });
}

/* -------------------------------------------------------------------------- */
/*  Profiles, lathes and sweeps                                               */
/* -------------------------------------------------------------------------- */

/**
 * Polyline with per-corner fillets: [x, y, radius?]. Corners get a quadratic
 * Bézier with `k` samples, so profiles stay soft without hand-placing arcs.
 */
export function fillet(pts: [number, number, number?][], k = 4): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y, r = 0] = pts[i];
    if (i === 0 || i === pts.length - 1 || r <= 0) {
      out.push([x, y]);
      continue;
    }
    const [px, py] = pts[i - 1];
    const [nx, ny] = pts[i + 1];
    const la = Math.hypot(x - px, y - py), lb = Math.hypot(nx - x, ny - y);
    const ta = Math.min(r, la * 0.5), tb = Math.min(r, lb * 0.5);
    const sx = x + ((px - x) / la) * ta, sy = y + ((py - y) / la) * ta;
    const ex = x + ((nx - x) / lb) * tb, ey = y + ((ny - y) / lb) * tb;
    for (let s = 0; s <= k; s++) {
      const t = s / k;
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      out.push([a * sx + b * x + c * ex, a * sy + b * y + c * ey]);
    }
  }
  return out;
}

/** Lathe around +Y. Profile bottom → top gives outward normals. */
export function lathe(pts: [number, number][], seg = 28, phiStart = 0, phiLength = Math.PI * 2) {
  return new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), seg, phiStart, phiLength);
}

/** Closed superellipse cross-section (w across, h thick). */
export function rrect(w: number, h: number, n = 12, e = 0.4): [number, number][] {
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2 + Math.PI / n;
    return [spow(Math.cos(a), e) * w * 0.5, spow(Math.sin(a), e) * h * 0.5] as [number, number];
  });
}

export const circle = (r: number, n = 8) => rrect(r * 2, r * 2, n, 1);

export interface SweepOpts {
  /** Direction the profile's local +y should face (projected off the tangent). */
  ref?: Vector3 | ((p: Vector3, t: number) => Vector3);
  samples?: number;
  closed?: boolean;
  caps?: boolean;
  /** Per-sample profile scale. */
  scale?: (t: number) => number;
  curve?: 'centripetal' | 'catmullrom' | 'chordal';
  tension?: number;
}

/**
 * Sweep a closed 2D profile along a Catmull-Rom curve through `points`.
 * Used for straps, handles, bent tubes, fender blades and the chain.
 */
export function sweep(points: Vector3[], profile: [number, number][], opts: SweepOpts = {}) {
  const curve = new CatmullRomCurve3(points, !!opts.closed, opts.curve ?? 'centripetal', opts.tension ?? 0.5);
  const n = opts.samples ?? Math.max(8, points.length * 6);
  const M = profile.length;
  const pos: number[] = [];
  const rings: Vector3[][] = [];
  let prevN: Vector3 | null = null;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const c = curve.getPointAt(opts.closed ? t % 1 : t);
    const T = curve.getTangentAt(opts.closed ? t % 1 : t).normalize();
    let R: Vector3;
    if (typeof opts.ref === 'function') R = opts.ref(c, t).clone();
    else if (opts.ref) R = opts.ref.clone();
    else if (prevN) R = prevN.clone();
    else R = Math.abs(T.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    const Nn = R.addScaledVector(T, -R.dot(T));
    if (Nn.lengthSq() < 1e-10) Nn.copy(prevN ?? new Vector3(1, 0, 0));
    Nn.normalize();
    prevN = Nn.clone();
    const Bn = new Vector3().crossVectors(T, Nn).normalize();
    const s = opts.scale ? opts.scale(t) : 1;
    const ring: Vector3[] = [];
    for (let m = 0; m <= M; m++) {
      const [px, py] = profile[m % M];
      ring.push(c.clone().addScaledVector(Bn, px * s).addScaledVector(Nn, py * s));
    }
    rings.push(ring);
  }
  // grid: u = profile, v = along curve
  const flat: number[] = [];
  rings.forEach((ring) => ring.forEach((p) => flat.push(p.x, p.y, p.z)));
  const idx: number[] = [];
  const W = M + 1;
  for (let k = 0; k < n; k++) {
    for (let m = 0; m < M; m++) {
      const a = k * W + m, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  let g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(flat, 3));
  g.setIndex(idx);
  // outward = away from the curve centre of each ring
  {
    const p = g.attributes.position;
    let s = 0;
    for (let i = 0; i < idx.length; i += 3) {
      _a.fromBufferAttribute(p, idx[i]);
      _b.fromBufferAttribute(p, idx[i + 1]);
      _c.fromBufferAttribute(p, idx[i + 2]);
      const ringK = Math.floor(idx[i] / W);
      const centre = rings[ringK].reduce((acc, q) => acc.add(q), new Vector3()).multiplyScalar(1 / rings[ringK].length);
      const nn = new Vector3().subVectors(_b, _a).cross(new Vector3().subVectors(_c, _a));
      s += Math.sign(nn.dot(_a.clone().sub(centre)));
    }
    if (s < 0) flipIndex(g);
  }
  g = mergeVertices(g, 1e-6);
  g.computeVertexNormals();
  if (!opts.caps || opts.closed) return g;

  const caps: BufferGeometry[] = [];
  for (const [ring, sign] of [[rings[0], -1], [rings[n], 1]] as [Vector3[], number][]) {
    const centre = ring.slice(0, M).reduce((acc, q) => acc.add(q), new Vector3()).multiplyScalar(1 / M);
    const T = curve.getTangentAt(sign < 0 ? 0 : 1).multiplyScalar(sign);
    const tri: number[] = [];
    for (let m = 0; m < M; m++) {
      const p0 = ring[m], p1 = ring[m + 1];
      const nn = new Vector3().subVectors(p0, centre).cross(new Vector3().subVectors(p1, centre));
      const order = nn.dot(T) >= 0 ? [centre, p0, p1] : [centre, p1, p0];
      order.forEach((q) => tri.push(q.x, q.y, q.z));
    }
    const cg = new BufferGeometry();
    cg.setAttribute('position', new Float32BufferAttribute(tri, 3));
    cg.computeVertexNormals();
    caps.push(cg);
  }
  return mergeParts([g, ...caps]);
}

/* -------------------------------------------------------------------------- */
/*  SDF helpers (beanbag)                                                     */
/* -------------------------------------------------------------------------- */

export function sdEllipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number) {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

export function smin(a: number, b: number, k: number) {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
}

export const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

/** First exit of a ray from inside an SDF (negative inside). */
export function rayExit(sdf: (x: number, y: number, z: number) => number, o: Vector3, d: Vector3, tMax = 2, step = 0.008) {
  let t = 0;
  while (t < tMax) {
    const x = o.x + d.x * (t + step), y = o.y + d.y * (t + step), z = o.z + d.z * (t + step);
    if (sdf(x, y, z) > 0) break;
    t += step;
  }
  let lo = t, hi = t + step;
  for (let i = 0; i < 26; i++) {
    const m = (lo + hi) / 2;
    if (sdf(o.x + d.x * m, o.y + d.y * m, o.z + d.z * m) > 0) hi = m;
    else lo = m;
  }
  return (lo + hi) / 2;
}
