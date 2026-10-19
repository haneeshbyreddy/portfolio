import { smoothstep } from '../core/math';
import { Cloth, type Collider } from './Cloth';

/**
 * Dust sheets for the vacant desks, simulated once at load (in a worker):
 * each variant is dropped onto a desk until it settles, then whisked off by
 * its back hem while every frame is recorded. Playing the recording forward
 * is the reveal; playing it backward lays the sheet down again, landing
 * exactly on the rest pose.
 */

export const SHEET_GRID = { nx: 32, nz: 30 };
const SIZE = { width: 2.1, depth: 2.0 };
const HZ = 420;
export const SHEET_FPS = 60;

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number): Collider => ({
  c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  h: [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2],
  r,
});

/**
 * The station furniture as the cloth feels it (station space, see parts.ts).
 * Each box is a little larger and rounder than the real part, so the straight
 * segments between particles never cut a corner while the sheet slides off.
 */
const COLLIDERS: Collider[] = [
  box(-0.635, 0, 0.305, 0.895, 0.755, 1.085, 0.04), // desk, solid to the floor
  box(-0.195, 0.74, 0.655, 0.275, 1.205, 1.085, 0.05), // CRT
  box(-0.235, 0.74, 0.375, 0.235, 0.788, 0.565, 0.016), // keyboard
  box(-0.405, 0.74, 0.435, -0.315, 0.782, 0.565, 0.018), // mouse
];

/** How each sheet was thrown on: a nudge and a twist so no two hems match. */
export const SHEET_VARIANTS = [
  { seed: 3, dx: 0.0, dz: 0.0, yaw: 0.035 },
  { seed: 11, dx: 0.05, dz: -0.04, yaw: -0.055 },
  { seed: 23, dx: -0.06, dz: 0.035, yaw: 0.075 },
];
export type SheetVariant = (typeof SHEET_VARIANTS)[number];

export interface SheetBake {
  /** Settled particle positions (nx × nz × 3, station space). */
  rest: Float32Array;
  /** The reveal at SHEET_FPS; frames[0] is the rest pose. */
  frames: Float32Array[];
  /** Seconds into the reveal when the screen is no longer hidden. */
  clearAt: number;
  /** Seconds into the reveal when the sheet has left the close-up. */
  goneAt: number;
}

/** The air in front of the CRT that the close-up looks through. */
function screenHidden(p: Float32Array) {
  for (let k = 0; k < p.length; k += 3) {
    const x = p[k], y = p[k + 1], z = p[k + 2];
    if (x > -0.3 && x < 0.4 && y > 0.8 && y < 1.32 && z > -0.6 && z < 0.75) return true;
  }
  return false;
}

function lowest(p: Float32Array) {
  let y = Infinity;
  for (let k = 1; k < p.length; k += 3) y = Math.min(y, p[k]);
  return y;
}

export function bakeSheet(v: SheetVariant): SheetBake {
  const { nx, nz } = SHEET_GRID;
  const c = new Cloth({
    nx,
    nz,
    ...SIZE,
    center: [0.13 + v.dx, 1.27, 0.72 + v.dz],
    yaw: v.yaw,
    seed: v.seed,
    shear: 1e-5,
    bend: 1e-3,
  });
  c.colliders = COLLIDERS;
  c.compression = 1e-5;
  const dt = 1 / HZ;

  // drop it, then let it go still
  c.friction = 0.5;
  for (let s = 0; s < 1.7 * HZ; s++) {
    c.damping = s < 1.05 * HZ ? 0.994 : 0.95;
    c.step(dt, 2);
  }
  const rest = c.pos.slice();

  // the reveal: two unseen hands take the back hem and whisk it up and away
  c.still();
  c.damping = 0.997;
  c.friction = 0.04;
  const hands = [0.3, 0.7].map((f) => (nz - 1) * nx + Math.round(f * (nx - 1)));
  const start = hands.map((h) => [c.pos[h * 3], c.pos[h * 3 + 1], c.pos[h * 3 + 2]]);
  const midX = (start[0][0] + start[1][0]) / 2;
  for (const h of hands) c.inv[h] = 0;

  const frames = [rest.slice()];
  const per = HZ / SHEET_FPS;
  let clearAt = -1;
  let goneAt = -1;
  for (let f = 1; f <= 2.4 * SHEET_FPS && goneAt < 0; f++) {
    for (let s = 1; s <= per; s++) {
      const t = ((f - 1) * per + s) * dt;
      const a = smoothstep(0, 0.12, t);
      const u = Math.max(0, t - 0.12);
      const dy = -0.03 * a + 0.35 * u + 2.0 * u * u;
      const dz = 0.05 * a + 0.5 * u + 1.5 * u * u;
      const gather = Math.min(1, u * 1.5) * 0.35;
      hands.forEach((h, n) => {
        c.pos[h * 3] = start[n][0] + (midX - start[n][0]) * gather;
        c.pos[h * 3 + 1] = start[n][1] + dy;
        c.pos[h * 3 + 2] = start[n][2] + dz;
      });
      c.step(dt, 2);
    }
    const frame = c.pos.slice();
    frames.push(frame);
    if (clearAt < 0 && !screenHidden(frame)) clearAt = f / SHEET_FPS;
    if (lowest(frame) > 1.6) goneAt = f / SHEET_FPS;
  }
  if (goneAt < 0) goneAt = (frames.length - 1) / SHEET_FPS;
  if (clearAt < 0) clearAt = goneAt;
  return { rest, frames, clearAt, goneAt };
}
