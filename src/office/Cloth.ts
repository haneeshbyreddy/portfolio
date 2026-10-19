import { mulberry32 } from '../core/math';

/** A rounded box obstacle in station space: centre, half extents, corner radius. */
export interface Collider {
  c: [number, number, number];
  h: [number, number, number];
  r: number;
}

export interface ClothOptions {
  /** Particles across (x) and deep (z). */
  nx: number;
  nz: number;
  width: number;
  depth: number;
  /** Where the flat sheet starts, and its rotation about Y. */
  center: [number, number, number];
  yaw: number;
  seed: number;
  /**
   * Compliance (inverse stiffness) of the shear and bend links. Soft shear and
   * bend let it fold like linen instead of standing up like paper.
   */
  shear?: number;
  bend?: number;
}

/**
 * A small XPBD cloth: Verlet particles on a grid held together by stretch,
 * shear and bend links, pushed out of rounded boxes and the ground. Compliance
 * keeps the stiffness independent of the step size. Good for one sheet thrown
 * over one desk — not a general solver.
 */
export class Cloth {
  readonly nx: number;
  readonly nz: number;
  readonly count: number;
  pos: Float32Array;
  prev: Float32Array;
  /** Inverse mass; 0 pins a particle in place (move it yourself). */
  readonly inv: Float32Array;
  readonly contact: Uint8Array;

  colliders: Collider[] = [];
  gravity = -9.8;
  /** Velocity kept per step. */
  damping = 0.994;
  /** Share of velocity lost by a particle touching something. */
  friction = 0.5;
  /** How far the cloth stands off every surface. */
  margin = 0.012;
  /** Extra compliance when a link is squeezed rather than stretched: linen buckles. */
  compression = 1e-6;

  private ca: Uint16Array;
  private cb: Uint16Array;
  private rest: Float32Array;
  private compliance: Float32Array;
  private lambda: Float32Array;

  constructor(o: ClothOptions) {
    this.nx = o.nx;
    this.nz = o.nz;
    const n = (this.count = o.nx * o.nz);
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.inv = new Float32Array(n).fill(1);
    this.contact = new Uint8Array(n);

    const rand = mulberry32(o.seed);
    const cos = Math.cos(o.yaw), sin = Math.sin(o.yaw);
    for (let j = 0; j < o.nz; j++) {
      for (let i = 0; i < o.nx; i++) {
        const lx = (i / (o.nx - 1) - 0.5) * o.width;
        const lz = (j / (o.nz - 1) - 0.5) * o.depth;
        const k = (j * o.nx + i) * 3;
        this.pos[k] = o.center[0] + lx * cos + lz * sin;
        this.pos[k + 1] = o.center[1] + (rand() - 0.5) * 0.004;
        this.pos[k + 2] = o.center[2] - lx * sin + lz * cos;
      }
    }
    this.prev.set(this.pos);

    // stretch, shear, then bend (skip-one) — Gauss-Seidel in that order
    const a: number[] = [], b: number[] = [], s: number[] = [];
    const link = (i0: number, j0: number, i1: number, j1: number, k: number) => {
      if (Math.max(i0, i1) >= o.nx || Math.max(j0, j1) >= o.nz) return;
      a.push(j0 * o.nx + i0);
      b.push(j1 * o.nx + i1);
      s.push(k);
    };
    for (let j = 0; j < o.nz; j++) for (let i = 0; i < o.nx; i++) { link(i, j, i + 1, j, 0); link(i, j, i, j + 1, 0); }
    const shear = o.shear ?? 1e-6, bend = o.bend ?? 1e-4;
    for (let j = 0; j < o.nz; j++) for (let i = 0; i < o.nx; i++) { link(i, j, i + 1, j + 1, shear); link(i + 1, j, i, j + 1, shear); }
    for (let j = 0; j < o.nz; j++) for (let i = 0; i < o.nx; i++) { link(i, j, i + 2, j, bend); link(i, j, i, j + 2, bend); }
    this.ca = Uint16Array.from(a);
    this.cb = Uint16Array.from(b);
    this.compliance = Float32Array.from(s);
    this.lambda = new Float32Array(a.length);
    this.rest = new Float32Array(a.length);
    const p = this.pos;
    for (let c = 0; c < a.length; c++) {
      const i = a[c] * 3, k = b[c] * 3;
      this.rest[c] = Math.hypot(p[k] - p[i], p[k + 1] - p[i + 1], p[k + 2] - p[i + 2]);
    }
  }

  /** Triangle indices for rendering the grid. */
  indices() {
    const out: number[] = [];
    const { nx, nz } = this;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const k = j * nx + i;
        // alternate the diagonal so folds don't all lean one way
        if ((i + j) % 2) out.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
        else out.push(k, k + nx, k + nx + 1, k, k + nx + 1, k + 1);
      }
    }
    return out;
  }

  /** Forget velocity (e.g. before changing the time step). */
  still() {
    this.prev.set(this.pos);
  }

  step(dt: number, iterations: number) {
    const { pos, prev, inv, count } = this;
    const g = this.gravity * dt * dt;
    const damp = this.damping;
    for (let n = 0; n < count; n++) {
      if (inv[n] === 0) continue;
      const k = n * 3;
      for (let e = 0; e < 3; e++) {
        const v = (pos[k + e] - prev[k + e]) * damp;
        prev[k + e] = pos[k + e];
        pos[k + e] += v;
      }
      pos[k + 1] += g;
    }

    const { ca, cb, rest, compliance, lambda } = this;
    const m = ca.length;
    const idt2 = 1 / (dt * dt);
    const squeeze = this.compression * idt2;
    lambda.fill(0);
    this.contact.fill(0);
    for (let it = 0; it < iterations; it++) {
      for (let c = 0; c < m; c++) {
        const ia = ca[c], ib = cb[c];
        const wa = inv[ia], wb = inv[ib];
        const w = wa + wb;
        if (w === 0) continue;
        const i = ia * 3, k = ib * 3;
        const dx = pos[k] - pos[i], dy = pos[k + 1] - pos[i + 1], dz = pos[k + 2] - pos[i + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-9) continue;
        const C = len - rest[c];
        // linen fights stretching but gives way to compression, so it folds instead of arching
        const a = compliance[c] * idt2 + (C < 0 ? squeeze : 0);
        const dl = (-C - a * lambda[c]) / (w + a);
        lambda[c] += dl;
        const f = -dl / len;
        pos[i] += dx * f * wa; pos[i + 1] += dy * f * wa; pos[i + 2] += dz * f * wa;
        pos[k] -= dx * f * wb; pos[k + 1] -= dy * f * wb; pos[k + 2] -= dz * f * wb;
      }
      this.collide();
    }

    // contact friction: touching particles lose most of their slide
    const fr = this.friction;
    for (let n = 0; n < count; n++) {
      if (!this.contact[n] || inv[n] === 0) continue;
      const k = n * 3;
      for (let e = 0; e < 3; e++) prev[k + e] += (pos[k + e] - prev[k + e]) * fr;
    }
  }

  private collide() {
    const { pos, inv, count, colliders, margin } = this;
    for (let n = 0; n < count; n++) {
      if (inv[n] === 0) continue;
      const k = n * 3;
      if (pos[k + 1] < margin) {
        pos[k + 1] = margin;
        this.contact[n] = 1;
      }
      for (let c = 0; c < colliders.length; c++) {
        const col = colliders[c];
        const px = pos[k] - col.c[0], py = pos[k + 1] - col.c[1], pz = pos[k + 2] - col.c[2];
        const qx = Math.abs(px) - (col.h[0] - col.r);
        const qy = Math.abs(py) - (col.h[1] - col.r);
        const qz = Math.abs(pz) - (col.h[2] - col.r);
        const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
        const len = Math.sqrt(mx * mx + my * my + mz * mz);
        const d = len + Math.min(Math.max(qx, qy, qz), 0) - col.r;
        if (d >= margin) continue;
        let nx = 0, ny = 0, nz = 0;
        if (len > 1e-9) {
          nx = (mx / len) * Math.sign(px);
          ny = (my / len) * Math.sign(py);
          nz = (mz / len) * Math.sign(pz);
        } else if (qy >= qx && qy >= qz) ny = Math.sign(py) || 1;
        else if (qx >= qz) nx = Math.sign(px) || 1;
        else nz = Math.sign(pz) || 1;
        const push = margin - d;
        pos[k] += nx * push;
        pos[k + 1] += ny * push;
        pos[k + 2] += nz * push;
        this.contact[n] = 1;
      }
    }
  }
}
