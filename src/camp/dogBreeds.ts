import { Color } from 'three';
import { Sculpt } from './dogSdf';
import type { TailProfile } from './dogParts';
import type { DogCoat, DogPose } from './Dogs';

export type V3 = [number, number, number];

/**
 * A soft region of colour, sculpt-style: an ellipsoid with a feathered edge.
 * `amount` is how far toward the accent colour it goes.
 */
export interface Mark {
  c: V3;
  r: V3;
  /** edge softness, as a fraction of the radius */
  soft: number;
  amount: number;
  /** which accent: the coat's light feathering / white, or a darker shade */
  key: 'light' | 'dark';
}

export interface Coat {
  base: Color;
  light: Color;
  dark: Color;
  ear: Color;
  /** painted onto up-facing fur: the lab's blue-grey sheen */
  sheen: Color | null;
  rough: number;
  lightRough: number;
  fabric: number;
  eye: Color;
  nose: Color;
}

export interface HeadDef {
  sculpt: Sculpt;
  /** left eye: march from `from` along `dir` to the surface */
  eye: { from: V3; dir: V3; r: number; sink: number };
  nose: { from: V3; dir: V3; scale: number };
  ear: {
    kind: 'floppy' | 'tipped';
    /** left ear: march from `from` (inside the skull) along `dir` to find the root */
    from: V3; dir: V3; sink: number;
    /** rest rotation of the left ear (euler XYZ); the right one is mirrored */
    rot: V3;
    len: number; width: number; thick: number; fold: number;
  };
  marks: Mark[];
}

export interface BodyRig {
  sculpt: Sculpt;
  /** breathing: the ribcage ellipsoid (weights) and the bone at its floor */
  chest: { c: V3; r: V3; rot: V3; pivot: V3 };
  neckBase: V3;
  atlas: V3;
  /** head rest rotation relative to the body (euler XYZ) */
  headRot: V3;
  neckR: number;
  /** collar position along the neck (0 = base, 1 = atlas) */
  collarT: number;
  tailBase: V3;
  /**
   * The tail at rest, bone by bone, as body-space directions: [pitch, yaw]
   * (pitch > 0 lifts it, yaw > 0 swings it toward +X). Level bones keep the
   * wag sweeping along the ground.
   */
  tailPath: [number, number][];
  marks: Mark[];
}

export interface Breed {
  coat: DogCoat;
  /** overall size */
  s: number;
  /** head size relative to the body (a little big is the charm) */
  head: number;
  /** body width */
  w: number;
  /** chest depth */
  d: number;
  /** limb girth */
  leg: number;
  /** neck girth */
  neck: number;
  /** fur volume (ruff, bib, trousers) */
  fluff: number;
  sculptHead: () => HeadDef;
  tail: TailProfile;
  colours: Coat;
}

const c = (hex: string) => new Color(hex);

/* -------------------------------------------------------------------------- */
/*  Heads (head space: origin at the atlas, +Z the way the dog looks)         */
/* -------------------------------------------------------------------------- */

function goldenHead(): HeadDef {
  const s = new Sculpt();
  // skull
  s.ellipsoid([0, 0.042, 0.052], [0.079, 0.074, 0.086], 0);
  // forehead, stop and soft brows
  s.ellipsoid([0, 0.05, 0.108], [0.058, 0.047, 0.05], 0.035);
  s.ellipsoid([0.03, 0.062, 0.118], [0.026, 0.017, 0.024], 0.02);
  s.ellipsoid([-0.03, 0.062, 0.118], [0.026, 0.017, 0.024], 0.02);
  // cheeks
  s.ellipsoid([0.044, -0.01, 0.094], [0.041, 0.046, 0.056], 0.04);
  s.ellipsoid([-0.044, -0.01, 0.094], [0.041, 0.046, 0.056], 0.04);
  // muzzle, nose a touch lower than the stop
  s.box([0, -0.006, 0.166], [0.037, 0.032, 0.06], 0.03, 0.035, [0.07, 0, 0]);
  // flews and chin
  s.ellipsoid([0.021, -0.034, 0.183], [0.03, 0.026, 0.045], 0.02);
  s.ellipsoid([-0.021, -0.034, 0.183], [0.03, 0.026, 0.045], 0.02);
  s.ellipsoid([0, -0.047, 0.153], [0.027, 0.018, 0.042], 0.025);
  // jaw + throat
  s.ellipsoid([0, -0.032, 0.066], [0.052, 0.044, 0.06], 0.045);
  return {
    sculpt: s,
    eye: { from: [0.028, 0.036, 0.1], dir: [0.42, 0.1, 1], r: 0.0125, sink: 0.0046 },
    nose: { from: [0, 0.0, 0.19], dir: [0, 0.2, 1], scale: 1 },
    ear: {
      kind: 'floppy', from: [0, 0.042, 0.052], dir: [0.86, 0.42, 0.1], sink: 0.018,
      rot: [-0.1, 0.06, 0.26], len: 0.152, width: 0.102, thick: 0.018, fold: 0,
    },
    marks: [
      // a paler muzzle and throat
      { c: [0, -0.03, 0.19], r: [0.05, 0.045, 0.07], soft: 0.45, amount: 0.42, key: 'light' },
      { c: [0, -0.06, 0.07], r: [0.06, 0.04, 0.09], soft: 0.5, amount: 0.5, key: 'light' },
    ],
  };
}

function labHead(): HeadDef {
  const s = new Sculpt();
  // broad, flat-topped skull with a clear stop
  s.ellipsoid([0, 0.04, 0.05], [0.087, 0.072, 0.086], 0);
  s.ellipsoid([0, 0.053, 0.104], [0.064, 0.046, 0.048], 0.03);
  s.ellipsoid([0.033, 0.064, 0.114], [0.028, 0.018, 0.024], 0.018);
  s.ellipsoid([-0.033, 0.064, 0.114], [0.028, 0.018, 0.024], 0.018);
  s.ellipsoid([0.05, -0.012, 0.09], [0.046, 0.048, 0.058], 0.04);
  s.ellipsoid([-0.05, -0.012, 0.09], [0.046, 0.048, 0.058], 0.04);
  // shorter, broader, squarer muzzle
  s.box([0, -0.008, 0.162], [0.043, 0.035, 0.056], 0.03, 0.03, [0.05, 0, 0]);
  s.ellipsoid([0.025, -0.036, 0.176], [0.033, 0.028, 0.044], 0.02);
  s.ellipsoid([-0.025, -0.036, 0.176], [0.033, 0.028, 0.044], 0.02);
  s.ellipsoid([0, -0.05, 0.148], [0.03, 0.019, 0.04], 0.025);
  s.ellipsoid([0, -0.032, 0.064], [0.058, 0.048, 0.062], 0.045);
  return {
    sculpt: s,
    eye: { from: [0.03, 0.036, 0.1], dir: [0.45, 0.08, 1], r: 0.012, sink: 0.0045 },
    nose: { from: [0, -0.004, 0.18], dir: [0, 0.18, 1], scale: 1.1 },
    ear: {
      kind: 'floppy', from: [0, 0.04, 0.05], dir: [0.86, 0.48, 0.02], sink: 0.016,
      rot: [-0.06, 0.05, 0.3], len: 0.118, width: 0.09, thick: 0.017, fold: 0,
    },
    marks: [],
  };
}

function collieHead(): HeadDef {
  const s = new Sculpt();
  // narrower, flatter skull and a long tapering wedge of a muzzle
  s.ellipsoid([0, 0.04, 0.05], [0.068, 0.064, 0.082], 0);
  s.ellipsoid([0, 0.045, 0.105], [0.05, 0.04, 0.05], 0.035);
  s.ellipsoid([0.026, 0.056, 0.116], [0.022, 0.014, 0.022], 0.018);
  s.ellipsoid([-0.026, 0.056, 0.116], [0.022, 0.014, 0.022], 0.018);
  s.ellipsoid([0.038, -0.006, 0.09], [0.036, 0.04, 0.054], 0.04);
  s.ellipsoid([-0.038, -0.006, 0.09], [0.036, 0.04, 0.054], 0.04);
  s.cone([0, 0.008, 0.11], [0, -0.012, 0.234], 0.048, 0.024, 0.04);
  s.ellipsoid([0.015, -0.03, 0.178], [0.022, 0.02, 0.05], 0.02);
  s.ellipsoid([-0.015, -0.03, 0.178], [0.022, 0.02, 0.05], 0.02);
  s.ellipsoid([0, -0.04, 0.15], [0.022, 0.016, 0.045], 0.025);
  s.ellipsoid([0, -0.028, 0.064], [0.046, 0.04, 0.058], 0.045);
  return {
    sculpt: s,
    eye: { from: [0.024, 0.036, 0.1], dir: [0.5, 0.16, 1], r: 0.0108, sink: 0.004 },
    nose: { from: [0, -0.006, 0.21], dir: [0, 0.12, 1], scale: 0.86 },
    ear: {
      kind: 'tipped', from: [0, 0.04, 0.04], dir: [0.52, 0.85, -0.02], sink: 0.012,
      rot: [0.12, -0.5, -0.32], len: 0.096, width: 0.078, thick: 0.019, fold: 1.5,
    },
    marks: [
      // white blaze up the face, white muzzle, chin and throat
      { c: [0, 0.07, 0.115], r: [0.012, 0.075, 0.07], soft: 0.18, amount: 1, key: 'light' },
      { c: [0, 0.02, 0.165], r: [0.017, 0.045, 0.06], soft: 0.16, amount: 1, key: 'light' },
      { c: [0, -0.015, 0.215], r: [0.042, 0.034, 0.06], soft: 0.16, amount: 1, key: 'light' },
      { c: [0, -0.05, 0.13], r: [0.046, 0.032, 0.12], soft: 0.16, amount: 1, key: 'light' },
      { c: [0, -0.07, 0.04], r: [0.062, 0.05, 0.08], soft: 0.16, amount: 1, key: 'light' },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Breeds                                                                    */
/* -------------------------------------------------------------------------- */

export const BREEDS: Record<DogCoat, Breed> = {
  golden: {
    coat: 'golden', s: 1, head: 1.08, w: 1, d: 1, leg: 1, neck: 1, fluff: 1,
    sculptHead: goldenHead,
    tail: {
      len: 0.42,
      // a feathered plume, fullest a third of the way down
      at: (t) => {
        const w = 0.03 * (1 - 0.62 * t) + 0.005;
        const plume = 0.04 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.95)), 0.75) * (1 - 0.2 * t);
        return { w: w + plume * 0.55, up: w + plume * 0.25, down: w + plume * 0.85 };
      },
    },
    colours: {
      base: c('#c8914f'), light: c('#e2c393'), dark: c('#a8733a'), ear: c('#b47b40'), sheen: null,
      rough: 0.76, lightRough: 0.82, fabric: 0.42, eye: c('#170f0a'), nose: c('#1b1513'),
    },
  },
  black: {
    coat: 'black', s: 1.0, head: 1.1, w: 1.1, d: 1.06, leg: 1.1, neck: 1.12, fluff: 0,
    sculptHead: labHead,
    tail: {
      len: 0.37,
      // the otter tail: thick at the root, tapering, no feathering
      at: (t) => {
        const w = 0.04 * Math.pow(1 - t, 0.8) + 0.014;
        return { w, up: w * 0.96, down: w * 0.96 };
      },
    },
    colours: {
      base: c('#232322'), light: c('#2c2c2b'), dark: c('#1a1a19'), ear: c('#202020'), sheen: c('#3d434a'),
      rough: 0.5, lightRough: 0.5, fabric: 0.3, eye: c('#140d09'), nose: c('#121212'),
    },
  },
  collie: {
    coat: 'collie', s: 0.92, head: 1.04, w: 0.9, d: 0.98, leg: 0.88, neck: 0.95, fluff: 1.5,
    sculptHead: collieHead,
    tail: {
      len: 0.4,
      // long and brushy, fullest in the middle
      at: (t) => {
        const w = 0.026 + 0.026 * Math.sin(Math.PI * Math.min(1, t * 0.95)) - 0.01 * t;
        return { w, up: w * 0.95, down: w * 1.2 };
      },
    },
    colours: {
      base: c('#1e1e1e'), light: c('#ece8de'), dark: c('#161616'), ear: c('#1c1c1c'), sheen: c('#2e3236'),
      rough: 0.66, lightRough: 0.84, fabric: 0.45, eye: c('#160e09'), nose: c('#141414'),
    },
  },
};

/* -------------------------------------------------------------------------- */
/*  Bodies (ground frame: origin under the chest, +Z the way the dog faces)   */
/* -------------------------------------------------------------------------- */

/**
 * `side` is where the hind legs fall when lying (+1 = the dog's left, +X), and
 * which way the tail curls.
 */
export function bodyRig(b: Breed, pose: DogPose, side: number): BodyRig {
  const S = b.s;
  const W = b.w;
  const P = (x: number, y: number, z: number): V3 => [x * W * S, y * S, z * S];
  const R = (x: number, y: number, z: number): V3 => [x * W * S, y * S, z * S];
  const L = (r: number) => r * b.leg * S;
  const N = (r: number) => r * b.neck * S;
  const sc = new Sculpt();
  const marks: Mark[] = [];
  const fl = b.fluff;
  const collie = b.coat === 'collie';
  const golden = b.coat === 'golden';
  const paw = (c: V3, k = 0.03, yaw = 0) => sc.ellipsoid(c, [L(0.047), L(0.033), L(0.062)], k, [0, yaw, 0]);

  if (pose === 'sitting') {
    // haunches on the ground, chest up, front legs straight
    sc.ellipsoid(P(0, 0.135, -0.15), R(0.135, 0.135, 0.13), 0);
    sc.ellipsoid(P(0, 0.29, -0.045), R(0.128, 0.19 * b.d, 0.135), 0.08, [0.55, 0, 0]);
    sc.ellipsoid(P(0, 0.36, 0.035), R(0.138, 0.165 * b.d, 0.14), 0.07, [0.35, 0, 0]);
    sc.ellipsoid(P(0, 0.37, 0.125), R(0.1, 0.11, 0.06), 0.06);
    sc.ellipsoid(P(0, 0.45, 0.01), R(0.11, 0.08, 0.1), 0.06);
    for (const sx of [1, -1]) {
      sc.ellipsoid(P(0.088 * sx, 0.33, 0.085), [L(0.055), 0.11 * S, L(0.075)], 0.05, [0.2, 0, 0]);
      sc.cone(P(0.084 * sx, 0.24, 0.11), P(0.075 * sx, 0.06, 0.142), L(0.042), L(0.036), 0.035);
      paw(P(0.075 * sx, 0.031, 0.18));
      // haunch: a big soft oval on each side
      sc.ellipsoid(P(0.098 * sx, 0.13, -0.085), [0.072 * S, 0.118 * S, 0.152 * S], 0.05, [-0.45, 0, 0.12 * sx]);
      sc.cone(P(0.11 * sx, 0.052, -0.185), P(0.104 * sx, 0.036, 0.045), L(0.039), L(0.033), 0.04);
      paw(P(0.104 * sx, 0.03, 0.072), 0.025, 0.1 * sx);
    }
    // neck
    sc.cone(P(0, 0.43, 0.05), P(0, 0.6, 0.115), N(0.092), N(0.072), 0.05);
    if (fl > 0) {
      // chest feathering
      sc.ellipsoid(P(0, 0.33, 0.13), R(0.095, 0.13, 0.055 + 0.02 * fl), 0.05);
      // trousers
      for (const sx of [1, -1]) sc.ellipsoid(P(0.09 * sx, 0.1, -0.2), R(0.06, 0.07, 0.05 * fl), 0.05);
    }
    if (collie) {
      // the ruff: a soft mane round the neck, white in front
      sc.ellipsoid(P(0, 0.5, 0.07), R(0.135, 0.12, 0.12), 0.06, [0.5, 0, 0]);
      sc.ellipsoid(P(0, 0.42, 0.12), R(0.12, 0.13, 0.08), 0.06, [0.3, 0, 0]);
    }
    if (golden) {
      marks.push(
        { c: P(0, 0.33, 0.17), r: R(0.12, 0.18, 0.1), soft: 0.5, amount: 0.85, key: 'light' },
        { c: P(0, 0.0, 0.05), r: R(0.4, 0.075, 0.4), soft: 0.5, amount: 0.5, key: 'light' },
        { c: P(0, 0.11, -0.24), r: R(0.2, 0.09, 0.08), soft: 0.5, amount: 0.65, key: 'light' },
      );
    }
    if (collie) {
      marks.push(
        { c: P(0, 0.5, 0.08), r: R(0.17, 0.09, 0.17), soft: 0.16, amount: 1, key: 'light' },
        { c: P(0, 0.38, 0.15), r: R(0.11, 0.17, 0.08), soft: 0.16, amount: 1, key: 'light' },
      );
      // white socks
      for (const sx of [1, -1]) {
        marks.push(
          { c: P(0.075 * sx, 0.06, 0.17), r: R(0.06, 0.1, 0.09), soft: 0.16, amount: 1, key: 'light' },
          { c: P(0.104 * sx, 0.035, 0.07), r: R(0.06, 0.05, 0.08), soft: 0.16, amount: 1, key: 'light' },
        );
      }
    }
    return {
      sculpt: sc,
      chest: { c: P(0, 0.33, 0.0), r: R(0.15, 0.24, 0.17), rot: [0.45, 0, 0], pivot: P(0, 0.3, -0.02) },
      neckBase: P(0, 0.45, 0.05),
      atlas: P(0, 0.605, 0.12),
      headRot: [0.12, 0, 0],
      neckR: N(0.085),
      collarT: 0.42,
      tailBase: P(0, 0.085, -0.255),
      // out behind on the grass, curling round to one side
      tailPath: [[-0.4, 0.35 * side], [-0.06, 0.9 * side], [0, 1.45 * side], [0.02, 1.9 * side]],
      marks,
    };
  }

  const sleeping = pose === 'sleeping';
  const roll = sleeping ? 0.38 : 0.22;
  const curl = sleeping ? 0.035 : 0;

  // ribcage, withers, sternum
  sc.ellipsoid(P(0, 0.162, 0.055), R(0.148, 0.152 * b.d, 0.205), 0);
  sc.ellipsoid(P(0, 0.205, 0.11), R(0.122, 0.105, 0.12), 0.07);
  sc.ellipsoid(P(0, 0.145, 0.2), R(0.108, 0.105, 0.07), 0.06);
  // front legs stretched forward (sleeping: a touch closer, for the chin)
  const fx = sleeping ? 0.068 : 0.08;
  for (const sx of [1, -1]) {
    sc.ellipsoid(P(0.092 * sx, 0.14, 0.15), [L(0.058), 0.095 * S, L(0.085)], 0.05, [-0.5, 0, 0]);
    sc.cone(P(0.088 * sx, 0.058, 0.16), P(fx * sx, 0.04, 0.37), L(0.043), L(0.036), 0.035);
    paw(P(fx * sx, 0.032, 0.405));
  }
  // loin + rump, the hips rolled onto one side
  sc.cone(P(0, 0.168, -0.08), P((0.012 + curl) * side, 0.158, -0.26), 0.122 * S * W, 0.122 * S * W, 0.08);
  sc.ellipsoid(P((0.014 + curl * 1.6) * side, 0.158, -0.335), R(0.138, 0.138, 0.13), 0.07, [0, 0, roll * side]);
  // the upper thigh, lying on top
  sc.ellipsoid(P((0.088 + curl) * side, 0.158, -0.29), [0.07 * S, 0.125 * S, 0.155 * S], 0.05, [0.3, -0.25 * side, -0.85 * side]);
  // the folded lower leg along the ground, hock tucked under the thigh, paw forward
  sc.cone(P((0.115 + curl) * side, 0.05, -0.4), P((0.19 + curl * 0.5) * side, 0.037, -0.2), L(0.043), L(0.035), 0.055);
  paw(P((0.196 + curl * 0.5) * side, 0.031, -0.165), 0.025, 0.15 * side);
  // the lower hind paw peeking out ahead of it
  sc.cone(P(0.06 * side, 0.045, -0.22), P(0.15 * side, 0.033, -0.105), L(0.036), L(0.031), 0.05);
  paw(P(0.158 * side, 0.029, -0.082), 0.025, 0.35 * side);
  if (fl > 0) {
    // chest bib + trousers
    sc.ellipsoid(P(0, 0.12, 0.225), R(0.09, 0.085, 0.045 + 0.015 * fl), 0.05);
    sc.ellipsoid(P((0.05 + curl) * side, 0.15, -0.43), R(0.08, 0.08, 0.035 * fl), 0.05);
  }

  let neckBase: V3, atlas: V3, headRot: V3;
  if (sleeping) {
    sc.cone(P(0, 0.21, 0.12), P(0.012 * side, 0.15, 0.255), N(0.095), N(0.078), 0.05);
    neckBase = P(0, 0.225, 0.12);
    atlas = P(0.016 * side, 0.142, 0.262);
    headRot = [0.16, -0.12 * side, 0.1 * side];
  } else {
    sc.cone(P(0, 0.225, 0.12), P(0, 0.372, 0.245), N(0.096), N(0.074), 0.05);
    neckBase = P(0, 0.265, 0.14);
    atlas = P(0, 0.392, 0.248);
    headRot = [0.1, 0, 0];
  }
  if (collie) {
    // the ruff
    const top = sleeping ? P(0, 0.22, 0.18) : P(0, 0.3, 0.19);
    sc.ellipsoid(top, R(0.14, 0.13, 0.11), 0.06, [sleeping ? -0.2 : 0.55, 0, 0]);
    sc.ellipsoid(P(0, 0.16, 0.24), R(0.12, 0.1, 0.07), 0.06);
  }

  if (golden) {
    marks.push(
      { c: P(0, 0.13, 0.235), r: R(0.12, 0.12, 0.1), soft: 0.5, amount: 0.9, key: 'light' },
      { c: P(0, -0.01, 0.05), r: R(0.45, 0.075, 0.6), soft: 0.5, amount: 0.5, key: 'light' },
      { c: P(0.06 * side, 0.15, -0.46), r: R(0.13, 0.11, 0.07), soft: 0.5, amount: 0.65, key: 'light' },
      { c: P(0, 0.33, -0.05), r: R(0.08, 0.06, 0.3), soft: 0.8, amount: 0.25, key: 'dark' },
    );
  }
  if (collie) {
    const ruff: V3 = sleeping ? P(0, 0.2, 0.19) : P(0, 0.29, 0.2);
    marks.push(
      { c: ruff, r: R(0.17, 0.12, 0.1), soft: 0.16, amount: 1, key: 'light' },
      { c: P(0, 0.11, 0.25), r: R(0.13, 0.13, 0.09), soft: 0.16, amount: 1, key: 'light' },
      { c: P(fx, 0.04, 0.39), r: R(0.06, 0.06, 0.1), soft: 0.16, amount: 1, key: 'light' },
      { c: P(-fx, 0.04, 0.39), r: R(0.06, 0.06, 0.1), soft: 0.16, amount: 1, key: 'light' },
      { c: P((0.196 + curl * 0.5) * side, 0.03, -0.165), r: R(0.06, 0.05, 0.075), soft: 0.16, amount: 1, key: 'light' },
      { c: P(0.158 * side, 0.03, -0.08), r: R(0.05, 0.05, 0.065), soft: 0.16, amount: 1, key: 'light' },
    );
  }

  return {
    sculpt: sc,
    chest: { c: P(0, 0.16, 0.06), r: R(0.17, 0.2, 0.24), rot: [0, 0, 0], pivot: P(0, 0.03, 0.04) },
    neckBase,
    atlas,
    headRot,
    neckR: N(0.085),
    collarT: sleeping ? 0.86 : 0.4,
    tailBase: P((0.012 + curl * 1.6) * side, 0.185, -0.435),
    tailPath: sleeping
      // wrapped round toward the nose, along the side the legs fall to
      ? [[-0.95, 0.55 * side], [-0.3, 1.15 * side], [-0.02, 1.75 * side], [0.02, 2.25 * side]]
      // down off the rump, then lying out on the grass with a lazy curve
      : [[-0.98, -0.12 * side], [-0.38, -0.3 * side], [-0.06, -0.5 * side], [0.02, -0.72 * side]],
    marks,
  };
}
