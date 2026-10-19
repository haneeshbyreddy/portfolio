import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  Object3D,
} from 'three';
import { smoothstep } from '../core/math';
import { shared } from '../world/shared';
import { palette } from '../world/palette';
import { createOfficeMaterial } from './builder';
import { bakeSheet, SHEET_FPS, SHEET_GRID, SHEET_VARIANTS, type SheetBake } from './sheetBake';
import type { Desk } from './Office';

/** Render grid: the simulated grid upsampled 2× so folds read smooth up close. */
const NX = SHEET_GRID.nx * 2 - 1;
const NZ = SHEET_GRID.nz * 2 - 1;

/** Catmull-Rom midpoint of four samples (with mirrored ends). */
const mid = (a: number, b: number, c: number, d: number) => (-a + 9 * b + 9 * c - d) / 16;

/** Upsamples an nx × nz grid of xyz to (2nx−1) × (2nz−1). */
function refine(src: Float32Array, out: Float32Array) {
  const sx = SHEET_GRID.nx, sz = SHEET_GRID.nz;
  const at = (i: number, j: number, e: number) => {
    // reflect past the edges so the hem stays straight
    const ii = i < 0 ? -i : i >= sx ? 2 * sx - 2 - i : i;
    const jj = j < 0 ? -j : j >= sz ? 2 * sz - 2 - j : j;
    const v = src[(jj * sx + ii) * 3 + e];
    if (ii === i && jj === j) return v;
    // mirrored samples become a linear extrapolation
    const ci = Math.min(Math.max(i, 0), sx - 1), cj = Math.min(Math.max(j, 0), sz - 1);
    return 2 * src[(cj * sx + ci) * 3 + e] - v;
  };
  for (let J = 0; J < NZ; J++) {
    const j = J >> 1, oddZ = J & 1;
    for (let I = 0; I < NX; I++) {
      const i = I >> 1, oddX = I & 1;
      const o = (J * NX + I) * 3;
      for (let e = 0; e < 3; e++) {
        const row = (jj: number) => (oddX ? mid(at(i - 1, jj, e), at(i, jj, e), at(i + 1, jj, e), at(i + 2, jj, e)) : at(i, jj, e));
        out[o + e] = oddZ ? mid(row(j - 1), row(j), row(j + 1), row(j + 2)) : row(j);
      }
    }
  }
  return out;
}

function gridIndices() {
  const out: number[] = [];
  for (let j = 0; j < NZ - 1; j++) {
    for (let i = 0; i < NX - 1; i++) {
      const k = j * NX + i;
      // alternate the diagonal so folds don't all lean one way
      if ((i + j) % 2) out.push(k, k + NX, k + 1, k + 1, k + NX, k + NX + 1);
      else out.push(k, k + NX, k + NX + 1, k, k + NX + 1, k + 1);
    }
  }
  return out;
}

/** The office material, double-sided, with a breath of wind in the hem. */
function createSheetMaterial() {
  const m = createOfficeMaterial();
  m.side = DoubleSide;
  const base = m.onBeforeCompile.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uWindDir = shared.uWindDir;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aFlutter;
         uniform float uTime;
         uniform vec2 uWindDir;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           vec3 w = position;
           #ifdef USE_INSTANCING
             w = (instanceMatrix * vec4(position, 1.0)).xyz;
           #endif
           // a slow wave rolls across the floor with the wind; the hems answer it
           float ph = dot(w.xz, uWindDir) * 1.6 - uTime * 2.1;
           float gust = 0.55 + 0.45 * sin(uTime * 0.41 + dot(w.xz, vec2(0.13, 0.07)));
           transformed += objectNormal * aFlutter * gust * (sin(ph) * 0.0045 + sin(ph * 2.3 + 1.7) * 0.002);
         }`,
      );
  };
  m.customProgramCacheKey = () => 'sheet';
  return m;
}

/** Bakes in a worker when possible so the loader never stutters. */
function bakeAll(): Promise<SheetBake[]> {
  const local = () => SHEET_VARIANTS.map(bakeSheet);
  try {
    const worker = new Worker(new URL('./sheetBake.worker.ts', import.meta.url), { type: 'module' });
    return new Promise<SheetBake[]>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<SheetBake[]>) => resolve(e.data);
      worker.onerror = reject;
      worker.postMessage(null);
    })
      .catch(local)
      .finally(() => worker.terminate());
  } catch {
    return Promise.resolve().then(local);
  }
}

interface Cover {
  desk: Desk;
  variant: number;
  slot: number;
  /** Seconds into the reveal recording. */
  t: number;
  /** +1 uncovering, −1 covering, 0 resting. */
  dir: number;
  delay: number;
  cleared: boolean;
  mesh: InstancedMesh | null;
}

const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/**
 * Dust sheets over every vacant desk. At rest each one is an instance of a
 * baked variant; visiting a desk swaps in a live mesh that plays the reveal,
 * and leaving plays it backward until the sheet lands on its rest pose again.
 */
export class Sheets {
  readonly ready: Promise<void>;
  /** The desk is (or stops being) visible under its sheet: swap its furniture. */
  onExpose: (desk: Desk, exposed: boolean) => void = () => {};
  /** The screen is clear of cloth. */
  onClear: (desk: Desk) => void = () => {};

  private covers = new Map<number, Cover>();
  private bakes: SheetBake[] = [];
  private meshes: InstancedMesh[] = [];
  private geometries: BufferGeometry[] = [];
  private material = createSheetMaterial();
  private index = gridIndices();

  constructor(private root: Object3D, desks: Desk[], private shadows: boolean) {
    const slots = SHEET_VARIANTS.map(() => 0);
    desks.forEach((desk, n) => {
      const variant = (n * 2 + desk.row) % SHEET_VARIANTS.length;
      this.covers.set(desk.index, { desk, variant, slot: slots[variant]++, t: 0, dir: 0, delay: 0, cleared: false, mesh: null });
    });
    this.ready = bakeAll().then((bakes) => this.build(bakes, slots));
  }

  private build(bakes: SheetBake[], counts: number[]) {
    this.bakes = bakes;
    const linen = new Color(palette.sheet);
    bakes.forEach((bake, v) => {
      const g = new BufferGeometry();
      const pos = refine(bake.rest, new Float32Array(NX * NZ * 3));
      const n = NX * NZ;
      const color = new Float32Array(n * 3);
      const aMat = new Float32Array(n * 3);
      const flutter = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const y = pos[k * 3 + 1];
        // the hem has picked up a little dust from the lawn
        const dust = 0.84 + 0.16 * smoothstep(0.04, 0.4, y);
        color[k * 3] = linen.r * dust;
        color[k * 3 + 1] = linen.g * dust;
        color[k * 3 + 2] = linen.b * dust * 0.985;
        aMat[k * 3] = 0.94;
        aMat[k * 3 + 2] = 0.7;
        flutter[k] = smoothstep(0.68, 0.18, y);
      }
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new Float32BufferAttribute(color, 3));
      g.setAttribute('aMat', new Float32BufferAttribute(aMat, 3));
      g.setAttribute('aFlutter', new Float32BufferAttribute(flutter, 1));
      g.setIndex(this.index);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      this.geometries.push(g);

      const mesh = new InstancedMesh(g, this.material, Math.max(1, counts[v]));
      mesh.count = counts[v];
      mesh.castShadow = this.shadows;
      mesh.receiveShadow = this.shadows;
      mesh.name = `sheets-${v}`;
      this.meshes.push(mesh);
      this.root.add(mesh);
    });
    for (const c of this.covers.values()) this.meshes[c.variant].setMatrixAt(c.slot, c.desk.matrix);
    for (const m of this.meshes) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }

  /** Whisk the sheet off (after a short beat). */
  uncover(desk: Desk, delay = 0.2) {
    const c = this.covers.get(desk.index);
    if (!c || !this.bakes.length || c.dir === 1) return;
    if (c.mesh && c.t >= this.bakes[c.variant].goneAt) return; // already off
    if (c.dir === 0 && c.t === 0) c.delay = delay;
    c.dir = 1;
    c.cleared = false;
    this.goLive(c);
  }

  /** Lay it back down. */
  cover(desk: Desk) {
    const c = this.covers.get(desk.index);
    if (!c || !c.mesh) return;
    c.dir = -1;
    c.delay = 0;
    c.t = Math.min(c.t, this.bakes[c.variant].goneAt);
    c.mesh.visible = true;
  }

  private goLive(c: Cover) {
    if (c.mesh) return;
    const src = this.geometries[c.variant];
    const g = new BufferGeometry();
    const pos = new Float32BufferAttribute(src.attributes.position.array.slice(), 3);
    pos.setUsage(DynamicDrawUsage);
    g.setAttribute('position', pos);
    g.setAttribute('normal', (src.attributes.normal as BufferAttribute).clone().setUsage(DynamicDrawUsage));
    // own copies: disposing this geometry later must not free the resting sheets' buffers
    for (const name of ['color', 'aMat', 'aFlutter']) g.setAttribute(name, (src.attributes[name] as BufferAttribute).clone());
    g.setIndex(src.index!.clone());
    // a one-instance mesh shares the resting sheets' program: no compile on first reveal
    const mesh = new InstancedMesh(g, this.material, 1);
    mesh.setMatrixAt(0, c.desk.matrix);
    mesh.frustumCulled = false;
    mesh.castShadow = this.shadows;
    mesh.receiveShadow = this.shadows;
    this.root.add(mesh);
    c.mesh = mesh;
    c.cleared = false;
    this.meshes[c.variant].setMatrixAt(c.slot, HIDDEN);
    this.meshes[c.variant].instanceMatrix.needsUpdate = true;
    this.onExpose(c.desk, true);
  }

  private rest(c: Cover) {
    if (!c.mesh) return;
    this.root.remove(c.mesh);
    c.mesh.geometry.dispose();
    c.mesh = null;
    c.t = 0;
    c.dir = 0;
    this.meshes[c.variant].setMatrixAt(c.slot, c.desk.matrix);
    this.meshes[c.variant].instanceMatrix.needsUpdate = true;
    this.onExpose(c.desk, false);
  }

  private pose(c: Cover) {
    const bake = this.bakes[c.variant];
    const f = Math.min(c.t * SHEET_FPS, bake.frames.length - 1);
    const i = Math.floor(f);
    const k = f - i;
    const a = bake.frames[i];
    const b = bake.frames[Math.min(i + 1, bake.frames.length - 1)];
    const mix = this.scratch;
    for (let n = 0; n < a.length; n++) mix[n] = a[n] + (b[n] - a[n]) * k;
    const g = c.mesh!.geometry;
    refine(mix, g.attributes.position.array as Float32Array);
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
  }

  private scratch = new Float32Array(SHEET_GRID.nx * SHEET_GRID.nz * 3);

  update(dt: number) {
    for (const c of this.covers.values()) {
      if (!c.mesh || c.dir === 0) continue;
      const bake = this.bakes[c.variant];
      if (c.dir > 0) {
        if (c.delay > 0) {
          c.delay -= dt;
          continue;
        }
        c.t = Math.min(bake.goneAt, c.t + dt);
        if (!c.cleared && c.t >= bake.clearAt) {
          c.cleared = true;
          this.onClear(c.desk);
        }
        if (c.t >= bake.goneAt) {
          c.mesh.visible = false;
          c.dir = 0;
          continue;
        }
      } else {
        // laying it back is a touch quicker than taking it off
        c.t = Math.max(0, c.t - dt * 1.15);
        if (c.t === 0) {
          this.rest(c);
          continue;
        }
      }
      this.pose(c);
    }
  }
}
