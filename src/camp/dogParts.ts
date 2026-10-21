import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix3,
  Matrix4,
  SphereGeometry,
  TorusGeometry,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
  Vector3,
} from 'three';
import { smoothstep } from '../core/math';
import type { Sculpt } from './dogSdf';

/* -------------------------------------------------------------------------- */
/*  Skinned assembly                                                          */
/* -------------------------------------------------------------------------- */

/** Per-vertex surface: linear colour + the office material's (rough, metal, fabric). */
export interface Paint {
  r: number; g: number; b: number;
  rough: number; metal: number; fabric: number;
}

export interface Finish {
  color: string | Color;
  rough?: number;
  metal?: number;
  fabric?: number;
}

/** `local` is the part's own space, `bind` the dog's bind-pose space, `normal` in bind space. */
export type PaintFn = (local: Vector3, bind: Vector3, normal: Vector3, out: Paint) => void;

/** Up to four (bone, weight) influences; weights are normalised afterwards. */
export interface Influence { i: number[]; w: number[] }
export type WeightFn = (local: Vector3, bind: Vector3, out: Influence) => void;

const _p = new Vector3();
const _l = new Vector3();
const _n = new Vector3();
const _nm = new Matrix3();

export function finishPaint(f: Finish): PaintFn {
  const c = f.color instanceof Color ? f.color : new Color(f.color);
  return (_a, _b, _n, out) => {
    out.r = c.r; out.g = c.g; out.b = c.b;
    out.rough = f.rough ?? 0.6; out.metal = f.metal ?? 0; out.fabric = f.fabric ?? 0;
  };
}

/**
 * Like the office's GeoBuilder — colour and finish baked per vertex for
 * `createOfficeMaterial()` — but indexed, and with skin weights, so a whole dog
 * is one skinned draw call.
 */
export class SkinBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private mat: number[] = [];
  private si: number[] = [];
  private sw: number[] = [];
  private idx: number[] = [];

  add(geo: BufferGeometry, matrix: Matrix4 | null, paint: PaintFn | Finish, weights: WeightFn | number) {
    const paintFn = typeof paint === 'function' ? paint : finishPaint(paint);
    const P = geo.attributes.position;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const N = geo.attributes.normal;
    const base = this.pos.length / 3;
    const m = matrix ?? new Matrix4();
    _nm.getNormalMatrix(m);
    const flip = m.determinant() < 0;
    const out: Paint = { r: 1, g: 1, b: 1, rough: 0.6, metal: 0, fabric: 0 };
    const inf: Influence = { i: [0, 0, 0, 0], w: [1, 0, 0, 0] };
    for (let v = 0; v < P.count; v++) {
      _l.fromBufferAttribute(P, v);
      _p.copy(_l).applyMatrix4(m);
      _n.fromBufferAttribute(N, v).applyMatrix3(_nm).normalize();
      this.pos.push(_p.x, _p.y, _p.z);
      this.nor.push(_n.x, _n.y, _n.z);
      paintFn(_l, _p, _n, out);
      this.col.push(out.r, out.g, out.b);
      this.mat.push(out.rough, out.metal, out.fabric);
      if (typeof weights === 'number') {
        this.si.push(weights, 0, 0, 0);
        this.sw.push(1, 0, 0, 0);
      } else {
        inf.i.fill(0);
        inf.w.fill(0);
        weights(_l, _p, inf);
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += inf.w[k];
        if (sum <= 1e-6) { inf.w[0] = 1; sum = 1; }
        for (let k = 0; k < 4; k++) {
          this.si.push(inf.i[k]);
          this.sw.push(inf.w[k] / sum);
        }
      }
    }
    const index = geo.index;
    const tri = index ? index.count : P.count;
    for (let t = 0; t < tri; t += 3) {
      const a = index ? index.getX(t) : t;
      const b = index ? index.getX(t + 1) : t + 1;
      const c = index ? index.getX(t + 2) : t + 2;
      if (flip) this.idx.push(base + a, base + c, base + b);
      else this.idx.push(base + a, base + b, base + c);
    }
    return this;
  }

  get triangles() {
    return this.idx.length / 3;
  }

  build() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('aMat', new Float32BufferAttribute(this.mat, 3));
    g.setAttribute('skinIndex', new Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(this.sw, 4));
    g.setIndex(new Uint32BufferAttribute(this.idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/* -------------------------------------------------------------------------- */
/*  Parametric parts                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A soft, hanging ear flap (retriever / lab). Bone space: hinge at the origin,
 * the flap hangs down -Y, +X is away from the skull (mirrored by `side`), +Z
 * is the way the dog faces.
 */
export function floppyEar(len: number, width: number, thick: number, side: number) {
  const g = new SphereGeometry(1, 16, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = (1 - y) / 2; // 0 at the hinge, 1 at the hem
    const W = (width / 2) * (0.7 + 0.42 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5));
    const T = (thick / 2) * (1 - 0.4 * t);
    const zz = z * W;
    const u = zz / (width / 2);
    // edges curl in towards the cheek; the hem swings a touch forward
    let xx = x * T + (thick * 0.9) * (1 - u * u) * smoothstep(0.1, 0.6, t);
    xx -= thick * 0.6 * t * t;
    const yy = -(t * 1.12 - 0.12) * len;
    p.setXYZ(i, xx * side, yy, zz + len * 0.1 * t * t);
  }
  g.deleteAttribute('uv');
  if (side < 0) flipWinding(g);
  g.computeVertexNormals();
  return g;
}

/**
 * Semi-pricked collie ear: stands up from the skull, its top third tipped
 * forward. Bone space: base at the origin, +Y up the ear, +Z forward.
 */
export function tippedEar(len: number, width: number, thick: number, fold: number, side: number) {
  const g = new SphereGeometry(1, 16, 14);
  const p = g.attributes.position;
  const tf = 0.56;
  const yf = (tf * 1.15 - 0.15) * len;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = (y + 1) / 2; // 0 at the base, 1 at the tip
    const W = (width / 2) * (1.25 - 0.85 * Math.pow(t, 1.1));
    const T = (thick / 2) * (1 - 0.45 * t);
    const xx = x * W;
    const u = xx / (width / 2);
    let zz = z * T - thick * 0.8 * (1 - u * u) * smoothstep(0.15, 0.5, t);
    let yy = (t * 1.15 - 0.15) * len;
    // fold the tip forward around a soft crease
    if (yy > yf) {
      const a = fold * smoothstep(tf - 0.08, tf + 0.14, t);
      const dy = yy - yf, dz = zz;
      const c = Math.cos(a), s = Math.sin(a);
      yy = yf + dy * c - dz * s;
      zz = dy * s + dz * c;
    }
    p.setXYZ(i, (xx + width * 0.06 * t) * side, yy, zz);
  }
  g.deleteAttribute('uv');
  if (side < 0) flipWinding(g);
  g.computeVertexNormals();
  return g;
}

export interface TailProfile {
  len: number;
  /** half-width, half-height above and below the spine, at t ∈ [0, 1] */
  at: (t: number) => { w: number; up: number; down: number };
}

/**
 * A tail as a smooth tube along -Z from the origin (its root inside the rump).
 * Rings are wrapped (no seam) and the tip closes to a point.
 */
export function tailTube(profile: TailProfile, rings = 26, seg = 14) {
  const pos: number[] = [];
  const index: number[] = [];
  const t0 = -0.06;
  // root cap centre
  pos.push(0, 0, -t0 * profile.len);
  for (let r = 0; r < rings; r++) {
    const t = t0 + (1 - t0) * (r / (rings - 1));
    const tc = Math.max(0, t);
    const { w, up, down } = profile.at(tc);
    // round the root and tip
    let k = 1;
    if (t < 0.02) k = Math.sqrt(Math.max(0, 1 - ((0.02 - t) / (0.02 - t0)) ** 2)) * 0.9 + 0.1;
    if (t > 0.9) k = Math.sqrt(Math.max(0, 1 - ((t - 0.9) / 0.1) ** 2));
    if (r === rings - 1) k = 0;
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      pos.push(c * w * k, sn * (sn > 0 ? up : down) * k, -t * profile.len);
    }
  }
  const ring = (r: number, s: number) => 1 + r * seg + (s % seg);
  for (let s = 0; s < seg; s++) index.push(0, ring(0, s), ring(0, s + 1));
  for (let r = 0; r < rings - 1; r++) {
    for (let s = 0; s < seg; s++) {
      const a = ring(r, s), b = ring(r, s + 1), c = ring(r + 1, s), d = ring(r + 1, s + 1);
      index.push(a, d, b, a, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Flattened lens for an eye; its local +Z looks out of the face. */
export function eyeLens(r: number) {
  const g = new SphereGeometry(r, 14, 9);
  g.scale(1, 0.86, 0.55);
  g.deleteAttribute('uv');
  return g;
}

/**
 * A thin collar that hugs whatever neck the sculpt has: rays from the neck
 * axis find the surface all the way round. Returns the ring and where its
 * lowest point is (for the tag).
 */
export function fittedCollar(body: Sculpt, centre: Vector3, axis: Vector3, band: number, thick: number, maxR: number) {
  const a = axis.clone().normalize();
  const ref = Math.abs(a.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const u = new Vector3().crossVectors(ref, a).normalize();
  const v = new Vector3().crossVectors(a, u).normalize();
  const major = 36;
  const minor = 8;
  const pos: number[] = [];
  const index: number[] = [];
  let lowest = new Vector3(0, Infinity, 0);
  let lowestDir = new Vector3();
  for (let i = 0; i < major; i++) {
    const phi = (i / major) * Math.PI * 2;
    const d = u.clone().multiplyScalar(Math.cos(phi)).addScaledVector(v, Math.sin(phi));
    const hit = body.surface([centre.x, centre.y, centre.z], [d.x, d.y, d.z], maxR);
    const radius = Math.min(maxR, hit.point.distanceTo(centre)) - thick * 0.45;
    const c = centre.clone().addScaledVector(d, radius);
    if (c.y < lowest.y) { lowest = c.clone().addScaledVector(d, thick); lowestDir = d.clone(); }
    for (let j = 0; j < minor; j++) {
      const th = (j / minor) * Math.PI * 2;
      // a flat strap: rounded rectangle-ish section
      const cs = Math.cos(th), sn = Math.sin(th);
      const rx = Math.sign(cs) * Math.pow(Math.abs(cs), 0.6) * thick;
      const ry = Math.sign(sn) * Math.pow(Math.abs(sn), 0.6) * band;
      pos.push(c.x + d.x * rx + a.x * ry, c.y + d.y * rx + a.y * ry, c.z + d.z * rx + a.z * ry);
    }
  }
  const at = (i: number, j: number) => (i % major) * minor + (j % minor);
  for (let i = 0; i < major; i++) {
    for (let j = 0; j < minor; j++) {
      const p0 = at(i, j), p1 = at(i + 1, j), p2 = at(i, j + 1), p3 = at(i + 1, j + 1);
      index.push(p0, p1, p3, p0, p3, p2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  // winding check: normals should point away from the axis
  const n0 = new Vector3().fromBufferAttribute(g.attributes.normal, 0);
  const p0 = new Vector3().fromBufferAttribute(g.attributes.position, 0).sub(centre);
  if (n0.dot(p0) < 0) {
    flipWinding(g);
    g.computeVertexNormals();
  }
  return { geo: g, lowest, lowestDir };
}

/** The little round tag: a disc on a split ring. */
export function collarTag(r: number) {
  const disc = new CylinderGeometry(r, r, r * 0.22, 16, 1).rotateX(Math.PI / 2).translate(0, -r * 1.25, 0);
  const ring = new TorusGeometry(r * 0.38, r * 0.09, 5, 10).rotateY(Math.PI / 2).translate(0, -r * 0.05, 0);
  return [disc, ring].map((g) => {
    g.deleteAttribute('uv');
    return g;
  });
}

export function flipWinding(g: BufferGeometry) {
  const idx = g.index;
  if (!idx) return;
  const a = idx.array as ArrayLike<number> & { [i: number]: number };
  for (let i = 0; i < a.length; i += 3) {
    const t = a[i + 1];
    a[i + 1] = a[i + 2];
    a[i + 2] = t;
  }
  idx.needsUpdate = true;
}
