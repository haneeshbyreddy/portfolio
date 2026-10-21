import { BufferGeometry, Euler, Float32BufferAttribute, Matrix4, Uint32BufferAttribute, Vector3 } from 'three';

/*
 * A tiny signed-distance sculpting kit for the dogs.
 *
 * Primitives (ellipsoids, round cones, rounded boxes) are smooth-unioned into
 * one soft volume, then meshed once with naive surface nets. The result has no
 * creases where a leg meets a chest or a muzzle meets a skull — the vinyl,
 * designer-toy surface the dogs want — and normals come straight from the
 * field's gradient, so the shading is perfectly smooth at any mesh density.
 */

type V3 = readonly [number, number, number];

const ELLIPSOID = 0;
const CONE = 1;
const BOX = 2;

interface Prim {
  kind: number;
  /** blend radius with everything before it */
  k: number;
  sub: boolean;
  // world -> local rotation (row-major) and centre
  i00: number; i01: number; i02: number;
  i10: number; i11: number; i12: number;
  i20: number; i21: number; i22: number;
  cx: number; cy: number; cz: number;
  // ellipsoid radii / box half extents, box rounding
  sx: number; sy: number; sz: number; round: number;
  // round cone
  ax: number; ay: number; az: number;
  bax: number; bay: number; baz: number;
  l2: number; rr: number; a2: number; il2: number; r1: number; r2: number;
  // bounds
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number;
}

const _m = new Matrix4();
const _e = new Euler();

function blank(kind: number, k: number, sub: boolean): Prim {
  return {
    kind, k, sub,
    i00: 1, i01: 0, i02: 0, i10: 0, i11: 1, i12: 0, i20: 0, i21: 0, i22: 1,
    cx: 0, cy: 0, cz: 0, sx: 1, sy: 1, sz: 1, round: 0,
    ax: 0, ay: 0, az: 0, bax: 0, bay: 0, baz: 0, l2: 1, rr: 0, a2: 1, il2: 1, r1: 0, r2: 0,
    x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0,
  };
}

/** Rotation from an XYZ euler; stores the inverse and returns the forward basis. */
function orient(p: Prim, rot?: V3) {
  _m.makeRotationFromEuler(_e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0));
  const e = _m.elements; // column-major: forward basis columns
  // forward M (local -> world): M_ij = e[j*4 + i]; inverse = transpose
  p.i00 = e[0]; p.i01 = e[1]; p.i02 = e[2];
  p.i10 = e[4]; p.i11 = e[5]; p.i12 = e[6];
  p.i20 = e[8]; p.i21 = e[9]; p.i22 = e[10];
  return e;
}

const smin = (a: number, b: number, k: number) => {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

function primDist(p: Prim, x: number, y: number, z: number) {
  if (p.kind === CONE) {
    const pax = x - p.ax, pay = y - p.ay, paz = z - p.az;
    const yy = pax * p.bax + pay * p.bay + paz * p.baz;
    const zz = yy - p.l2;
    const qx = pax * p.l2 - p.bax * yy, qy = pay * p.l2 - p.bay * yy, qz = paz * p.l2 - p.baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * p.l2;
    const z2 = zz * zz * p.l2;
    const kk = Math.sign(p.rr) * p.rr * p.rr * x2;
    if (Math.sign(zz) * p.a2 * z2 > kk) return Math.sqrt(x2 + z2) * p.il2 - p.r2;
    if (Math.sign(yy) * p.a2 * y2 < kk) return Math.sqrt(x2 + y2) * p.il2 - p.r1;
    return (Math.sqrt(x2 * p.a2 * p.il2) + yy * p.rr) * p.il2 - p.r1;
  }
  const dx = x - p.cx, dy = y - p.cy, dz = z - p.cz;
  const lx = p.i00 * dx + p.i01 * dy + p.i02 * dz;
  const ly = p.i10 * dx + p.i11 * dy + p.i12 * dz;
  const lz = p.i20 * dx + p.i21 * dy + p.i22 * dz;
  if (p.kind === ELLIPSOID) {
    const ux = lx / p.sx, uy = ly / p.sy, uz = lz / p.sz;
    const k0 = Math.sqrt(ux * ux + uy * uy + uz * uz);
    const vx = ux / p.sx, vy = uy / p.sy, vz = uz / p.sz;
    const k1 = Math.sqrt(vx * vx + vy * vy + vz * vz);
    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(p.sx, p.sy, p.sz);
  }
  // rounded box
  const qx = Math.abs(lx) - p.sx + p.round;
  const qy = Math.abs(ly) - p.sy + p.round;
  const qz = Math.abs(lz) - p.sz + p.round;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - p.round;
}

export class Sculpt {
  readonly prims: Prim[] = [];
  /** Largest blend radius in use — the culling margin depends on it. */
  private kMax = 0;

  /** Ellipsoid, optionally rotated (XYZ euler, radians). */
  ellipsoid(c: V3, r: V3, k = 0.03, rot?: V3, sub = false) {
    const p = blank(ELLIPSOID, k, sub);
    const e = orient(p, rot);
    p.cx = c[0]; p.cy = c[1]; p.cz = c[2];
    p.sx = r[0]; p.sy = r[1]; p.sz = r[2];
    for (let i = 0; i < 3; i++) {
      const ext = Math.hypot(e[i] * r[0], e[4 + i] * r[1], e[8 + i] * r[2]);
      this.bound(p, i, c[i] - ext, c[i] + ext);
    }
    return this.push(p);
  }

  sphere(c: V3, r: number, k = 0.03) {
    return this.ellipsoid(c, [r, r, r], k);
  }

  /** Capsule whose radius runs from `r1` at `a` to `r2` at `b`. */
  cone(a: V3, b: V3, r1: number, r2: number, k = 0.03, sub = false) {
    const p = blank(CONE, k, sub);
    p.ax = a[0]; p.ay = a[1]; p.az = a[2];
    p.bax = b[0] - a[0]; p.bay = b[1] - a[1]; p.baz = b[2] - a[2];
    p.l2 = p.bax * p.bax + p.bay * p.bay + p.baz * p.baz;
    p.rr = r1 - r2;
    p.a2 = p.l2 - p.rr * p.rr;
    p.il2 = 1 / p.l2;
    p.r1 = r1; p.r2 = r2;
    for (let i = 0; i < 3; i++) {
      this.bound(p, i, Math.min(a[i] - r1, b[i] - r2), Math.max(a[i] + r1, b[i] + r2));
    }
    return this.push(p);
  }

  /** Rounded box: `half` extents, `round` corner radius. */
  box(c: V3, half: V3, round: number, k = 0.03, rot?: V3, sub = false) {
    const p = blank(BOX, k, sub);
    const e = orient(p, rot);
    p.cx = c[0]; p.cy = c[1]; p.cz = c[2];
    p.sx = half[0]; p.sy = half[1]; p.sz = half[2];
    p.round = Math.min(round, half[0], half[1], half[2]);
    for (let i = 0; i < 3; i++) {
      const ext = Math.abs(e[i] * half[0]) + Math.abs(e[4 + i] * half[1]) + Math.abs(e[8 + i] * half[2]);
      this.bound(p, i, c[i] - ext, c[i] + ext);
    }
    return this.push(p);
  }

  private bound(p: Prim, axis: number, lo: number, hi: number) {
    if (axis === 0) { p.x0 = lo; p.x1 = hi; }
    else if (axis === 1) { p.y0 = lo; p.y1 = hi; }
    else { p.z0 = lo; p.z1 = hi; }
  }

  private push(p: Prim) {
    this.prims.push(p);
    this.kMax = Math.max(this.kMax, p.k);
    return this;
  }

  /** Signed distance (negative inside). Exact enough within `band` of the surface. */
  dist(x: number, y: number, z: number, band = 0.03) {
    const m = band + this.kMax;
    let d = m;
    const prims = this.prims;
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i];
      if (x < p.x0 - m || x > p.x1 + m || y < p.y0 - m || y > p.y1 + m || z < p.z0 - m || z > p.z1 + m) continue;
      const e = primDist(p, x, y, z);
      d = p.sub ? smax(d, -e, p.k) : smin(d, e, p.k);
    }
    return d;
  }

  bounds() {
    const lo = new Vector3(Infinity, Infinity, Infinity);
    const hi = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const p of this.prims) {
      if (p.sub) continue;
      lo.min(new Vector3(p.x0, p.y0, p.z0));
      hi.max(new Vector3(p.x1, p.y1, p.z1));
    }
    return { lo, hi };
  }

  /** Gradient (unnormalised) by central differences. */
  grad(x: number, y: number, z: number, eps: number, out: Vector3, band = 0.03) {
    return out.set(
      this.dist(x + eps, y, z, band) - this.dist(x - eps, y, z, band),
      this.dist(x, y + eps, z, band) - this.dist(x, y - eps, z, band),
      this.dist(x, y, z + eps, band) - this.dist(x, y, z - eps, band),
    ).multiplyScalar(1 / (2 * eps));
  }

  /** March from an inside point `from` along `dir` to the surface. */
  surface(from: V3, dir: V3, maxDist = 0.5) {
    const d = new Vector3(dir[0], dir[1], dir[2]).normalize();
    const p = new Vector3(from[0], from[1], from[2]);
    let t0 = 0, t1 = maxDist;
    const step = 0.002;
    for (let t = 0; t < maxDist; t += step) {
      if (this.dist(p.x + d.x * t, p.y + d.y * t, p.z + d.z * t) > 0) { t1 = t; break; }
      t0 = t;
    }
    for (let i = 0; i < 20; i++) {
      const tm = (t0 + t1) / 2;
      if (this.dist(p.x + d.x * tm, p.y + d.y * tm, p.z + d.z * tm) > 0) t1 = tm;
      else t0 = tm;
    }
    const point = p.addScaledVector(d, (t0 + t1) / 2);
    const normal = this.grad(point.x, point.y, point.z, 0.002, new Vector3()).normalize();
    return { point, normal };
  }

  /** Mesh the zero set with naive surface nets at cell size `h`. */
  mesh(h: number, opts: MeshOptions = {}) {
    const { lo, hi } = this.bounds();
    const pad = 2;
    const ox = lo.x - pad * h, oy = lo.y - pad * h, oz = lo.z - pad * h;
    const nx = Math.ceil((hi.x - lo.x) / h) + pad * 2 + 1;
    const ny = Math.ceil((hi.y - lo.y) / h) + pad * 2 + 1;
    const nz = Math.ceil((hi.z - lo.z) / h) + pad * 2 + 1;
    const band = h * 3;

    const vals = new Float32Array(nx * ny * nz);
    for (let k = 0, n = 0; k < nz; k++) {
      const z = oz + k * h;
      for (let j = 0; j < ny; j++) {
        const y = oy + j * h;
        for (let i = 0; i < nx; i++, n++) vals[n] = this.dist(ox + i * h, y, z, band);
      }
    }

    const cx = nx - 1, cy = ny - 1, cz = nz - 1;
    const cellVert = new Int32Array(cx * cy * cz).fill(-1);
    const pos: number[] = [];
    const quads: number[] = [];
    const g = new Float64Array(8);
    const off = [0, 1, nx, nx + 1, nx * ny, nx * ny + 1, nx * ny + nx, nx * ny + nx + 1];
    const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
    const strides = [1, cx, cx * cy];

    for (let k = 0; k < cz; k++) {
      for (let j = 0; j < cy; j++) {
        for (let i = 0; i < cx; i++) {
          const base = i + nx * (j + ny * k);
          let mask = 0;
          for (let c = 0; c < 8; c++) {
            g[c] = vals[base + off[c]];
            if (g[c] < 0) mask |= 1 << c;
          }
          if (mask === 0 || mask === 255) continue;
          let sx = 0, sy = 0, sz = 0, cnt = 0;
          for (let e = 0; e < 24; e += 2) {
            const a = EDGES[e], b = EDGES[e + 1];
            const ga = g[a], gb = g[b];
            if ((ga < 0) === (gb < 0)) continue;
            const t = ga / (ga - gb);
            const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1;
            const bx = b & 1, by = (b >> 1) & 1, bz = (b >> 2) & 1;
            sx += ax + t * (bx - ax);
            sy += ay + t * (by - ay);
            sz += az + t * (bz - az);
            cnt++;
          }
          const vi = pos.length / 3;
          pos.push(ox + (i + sx / cnt) * h, oy + (j + sy / cnt) * h, oz + (k + sz / cnt) * h);
          const ci = i + cx * (j + cy * k);
          cellVert[ci] = vi;

          const coord = [i, j, k];
          for (let d = 0; d < 3; d++) {
            const in0 = (mask & 1) !== 0;
            const in1 = (mask & (1 << (1 << d))) !== 0;
            if (in0 === in1) continue;
            const u = (d + 1) % 3, v = (d + 2) % 3;
            if (coord[u] === 0 || coord[v] === 0) continue;
            const a = vi;
            const b = cellVert[ci - strides[u]];
            const c = cellVert[ci - strides[u] - strides[v]];
            const dd = cellVert[ci - strides[v]];
            if (b < 0 || c < 0 || dd < 0) continue;
            // (a, b, c, dd) winds counter-clockwise about +d; outward is +d when corner 0 is inside
            if (in0) quads.push(a, b, c, dd);
            else quads.push(a, dd, c, b);
          }
        }
      }
    }

    // pull every vertex onto the true surface
    this.project(pos, h, band, 1);

    // quads -> triangles, split along the shorter diagonal
    let index: number[] = [];
    const d2 = (a: number, b: number) => {
      const dx = pos[a * 3] - pos[b * 3], dy = pos[a * 3 + 1] - pos[b * 3 + 1], dz = pos[a * 3 + 2] - pos[b * 3 + 2];
      return dx * dx + dy * dy + dz * dz;
    };
    for (let q = 0; q < quads.length; q += 4) {
      const a = quads[q], b = quads[q + 1], c = quads[q + 2], d = quads[q + 3];
      if (d2(a, c) <= d2(b, d)) index.push(a, b, c, a, c, d);
      else index.push(a, b, d, b, c, d);
    }

    // spend the triangles where the curvature (and the paint) is
    let verts: number[] = pos;
    if (opts.target && index.length / 3 > opts.target) {
      const r = simplify(pos, index, opts.target, opts.feature, opts.featureWeight ?? 0.5);
      verts = r.pos;
      index = r.index;
      this.project(verts, h, band, 2);
    }

    // shading straight from the field's gradient
    const nVerts = verts.length / 3;
    const normals = new Float32Array(nVerts * 3);
    const gv = new Vector3();
    for (let v = 0; v < nVerts; v++) {
      this.grad(verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2], h * 0.6, gv, band).normalize();
      normals[v * 3] = gv.x; normals[v * 3 + 1] = gv.y; normals[v * 3 + 2] = gv.z;
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(verts, 3));
    geo.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geo.setIndex(new Uint32BufferAttribute(index, 1));
    return geo;
  }

  /** Newton steps onto the zero set. */
  private project(pos: number[], h: number, band: number, iterations: number) {
    const gv = new Vector3();
    for (let v = 0; v < pos.length; v += 3) {
      let x = pos[v], y = pos[v + 1], z = pos[v + 2];
      for (let it = 0; it < iterations; it++) {
        const d = this.dist(x, y, z, band);
        this.grad(x, y, z, h * 0.5, gv, band);
        const l2 = gv.lengthSq();
        if (l2 < 1e-8) break;
        const s = Math.max(-h, Math.min(h, d)) / l2;
        x -= gv.x * s; y -= gv.y * s; z -= gv.z * s;
      }
      pos[v] = x; pos[v + 1] = y; pos[v + 2] = z;
    }
  }
}

export interface MeshOptions {
  /** decimate to about this many triangles */
  target?: number;
  /** a scalar painted on the surface (0..1) whose edges should keep their vertices */
  feature?: (x: number, y: number, z: number) => number;
  featureWeight?: number;
}

/* -------------------------------------------------------------------------- */
/*  Quadric-error edge collapse (Garland & Heckbert), for a closed mesh       */
/* -------------------------------------------------------------------------- */

interface HeapItem { c: number; a: number; b: number; va: number; vb: number; x: number; y: number; z: number }

class Heap {
  private items: HeapItem[] = [];
  get size() { return this.items.length; }
  push(it: HeapItem) {
    const a = this.items;
    a.push(it);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].c <= it.c) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = it;
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        let mc = last.c;
        if (l < n && a[l].c < mc) { m = l; mc = a[l].c; }
        if (r < n && a[r].c < mc) { m = r; }
        if (m === i) break;
        a[i] = a[m];
        i = m;
      }
      a[i] = last;
    }
    return top;
  }
}

export function simplify(
  P: number[],
  I: number[],
  target: number,
  feature?: (x: number, y: number, z: number) => number,
  featureWeight = 0.5,
) {
  const nv = P.length / 3;
  const nt = I.length / 3;
  const pos = Float64Array.from(P);
  const tri = Int32Array.from(I);
  const tAlive = new Uint8Array(nt).fill(1);
  const vAlive = new Uint8Array(nv).fill(1);
  const ver = new Int32Array(nv);
  const Q = new Float64Array(nv * 10);
  const vt: number[][] = Array.from({ length: nv }, () => []);
  const feat = new Float64Array(nv);
  if (feature) for (let v = 0; v < nv; v++) feat[v] = feature(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);

  const normal = (a: number, b: number, c: number, out: number[]) => {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
    const vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
    out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx;
    return Math.hypot(out[0], out[1], out[2]);
  };
  const n = [0, 0, 0];
  for (let t = 0; t < nt; t++) {
    const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
    const l = normal(a, b, c, n);
    vt[a].push(t); vt[b].push(t); vt[c].push(t);
    if (l < 1e-12) continue;
    const nx = n[0] / l, ny = n[1] / l, nz = n[2] / l;
    const d = -(nx * pos[a * 3] + ny * pos[a * 3 + 1] + nz * pos[a * 3 + 2]);
    const q = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d];
    for (const v of [a, b, c]) for (let k = 0; k < 10; k++) Q[v * 10 + k] += q[k];
  }

  const qerr = (a: number, b: number, x: number, y: number, z: number) => {
    const A = a * 10, B = b * 10;
    const q = (k: number) => Q[A + k] + Q[B + k];
    return q(0) * x * x + 2 * q(1) * x * y + 2 * q(2) * x * z + 2 * q(3) * x
      + q(4) * y * y + 2 * q(5) * y * z + 2 * q(6) * y + q(7) * z * z + 2 * q(8) * z + q(9);
  };
  const heap = new Heap();
  const pushEdge = (a: number, b: number) => {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
    const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
    let c = qerr(a, b, mx, my, mz), x = mx, y = my, z = mz;
    const ca = qerr(a, b, ax, ay, az);
    if (ca < c) { c = ca; x = ax; y = ay; z = az; }
    const cb = qerr(a, b, bx, by, bz);
    if (cb < c) { c = cb; x = bx; y = by; z = bz; }
    const df = feat[a] - feat[b];
    const l2 = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
    c = Math.max(0, c) + featureWeight * df * df * l2;
    heap.push({ c, a, b, va: ver[a], vb: ver[b], x, y, z });
  };
  for (let t = 0; t < nt; t++) {
    for (let e = 0; e < 3; e++) {
      const a = tri[t * 3 + e], b = tri[t * 3 + ((e + 1) % 3)];
      if (a < b) pushEdge(a, b); // each interior edge once (closed mesh)
    }
  }

  // neighbour sets as stamped marks (no allocation in the loop)
  const mark = new Int32Array(nv);
  let stamp = 0;
  const ring: number[] = [];
  /** Fills `ring` with v's neighbours and stamps them; returns the stamp. */
  const neighbours = (v: number) => {
    stamp++;
    ring.length = 0;
    mark[v] = stamp;
    for (const t of vt[v]) {
      if (!tAlive[t]) continue;
      for (let k = 0; k < 3; k++) {
        const u = tri[t * 3 + k];
        if (mark[u] !== stamp) { mark[u] = stamp; ring.push(u); }
      }
    }
    return stamp;
  };
  const n0 = [0, 0, 0];
  const n1 = [0, 0, 0];
  let alive = nt;
  const save = [0, 0, 0, 0, 0, 0];

  while (alive > target && heap.size) {
    const e = heap.pop();
    const { a, b } = e;
    if (!vAlive[a] || !vAlive[b] || ver[a] !== e.va || ver[b] !== e.vb) continue;
    // link condition: exactly the two shared triangles' apexes in common
    const sa = neighbours(a);
    if (mark[b] !== sa) continue;
    let common = 0;
    for (const t of vt[b]) {
      if (!tAlive[t]) continue;
      for (let k = 0; k < 3; k++) {
        const u = tri[t * 3 + k];
        if (u !== a && u !== b && mark[u] === sa) { mark[u] = -1; common++; }
      }
    }
    if (common !== 2) continue;
    // no fold-overs
    save[0] = pos[a * 3]; save[1] = pos[a * 3 + 1]; save[2] = pos[a * 3 + 2];
    save[3] = pos[b * 3]; save[4] = pos[b * 3 + 1]; save[5] = pos[b * 3 + 2];
    let ok = true;
    for (const v of [a, b]) {
      for (const t of vt[v]) {
        if (!tAlive[t]) continue;
        const i0 = tri[t * 3], i1 = tri[t * 3 + 1], i2 = tri[t * 3 + 2];
        if ((i0 === a || i1 === a || i2 === a) && (i0 === b || i1 === b || i2 === b)) continue;
        const l0 = normal(i0, i1, i2, n0);
        pos[v * 3] = e.x; pos[v * 3 + 1] = e.y; pos[v * 3 + 2] = e.z;
        const l1 = normal(i0, i1, i2, n1);
        pos[v * 3] = save[v === a ? 0 : 3]; pos[v * 3 + 1] = save[v === a ? 1 : 4]; pos[v * 3 + 2] = save[v === a ? 2 : 5];
        if (l1 < 1e-12 || (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]) / (l0 * l1 + 1e-30) < 0.35) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (!ok) continue;

    // collapse a -> b
    pos[b * 3] = e.x; pos[b * 3 + 1] = e.y; pos[b * 3 + 2] = e.z;
    for (let k = 0; k < 10; k++) Q[b * 10 + k] += Q[a * 10 + k];
    if (e.x === save[0] && e.y === save[1] && e.z === save[2]) feat[b] = feat[a];
    else if (!(e.x === save[3] && e.y === save[4] && e.z === save[5])) feat[b] = (feat[a] + feat[b]) / 2;
    for (const t of vt[a]) {
      if (!tAlive[t]) continue;
      const i0 = tri[t * 3], i1 = tri[t * 3 + 1], i2 = tri[t * 3 + 2];
      if (i0 === b || i1 === b || i2 === b) {
        tAlive[t] = 0;
        alive--;
        continue;
      }
      for (let k = 0; k < 3; k++) if (tri[t * 3 + k] === a) tri[t * 3 + k] = b;
      vt[b].push(t);
    }
    vAlive[a] = 0;
    vt[a].length = 0;
    vt[b] = vt[b].filter((t) => tAlive[t]);
    ver[b]++;
    neighbours(b);
    for (const v of ring) if (v !== b) pushEdge(Math.min(b, v), Math.max(b, v));
  }

  // compact
  const remap = new Int32Array(nv).fill(-1);
  const outPos: number[] = [];
  const outIdx: number[] = [];
  for (let t = 0; t < nt; t++) {
    if (!tAlive[t]) continue;
    for (let k = 0; k < 3; k++) {
      const v = tri[t * 3 + k];
      if (remap[v] < 0) {
        remap[v] = outPos.length / 3;
        outPos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      }
      outIdx.push(remap[v]);
    }
  }
  return { pos: outPos, index: outIdx };
}
