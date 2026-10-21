import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Matrix4,
  Path,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { GeoBuilder, mat, type Finish } from '../office/builder';
import { palette } from '../world/palette';
import { createNoise2D, fbm2, lerp, mulberry32, smoothstep } from '../core/math';
import {
  blob,
  circle,
  cylBetween,
  fillet,
  lathe,
  mix,
  rayExit,
  rbox,
  rrect,
  sdEllipsoid,
  shade,
  shell,
  smax,
  smin,
  sphereAt,
  surface,
  sweep,
  v3,
} from './shapes';

/**
 * The camp kit: everything a studio carried out onto the grass.
 *
 * Every builder returns one merged BufferGeometry (colour + aMat baked per
 * vertex) for createOfficeMaterial() and InstancedMesh. Conventions: metres,
 * origin on the ground (y = 0) at the centre of the footprint, +Y up, +Z is
 * the prop's front — the side you face it or sit on it from.
 */

const DEG = Math.PI / 180;

const F = {
  frame: { color: palette.campFrame, rough: 0.38, metal: 0.35 } as Finish,
  plastic: { color: '#2b2d2c', rough: 0.62 } as Finish,
  rubber: { color: '#1c1d1c', rough: 0.85 } as Finish,
  chrome: { color: palette.chrome, rough: 0.22, metal: 0.95 } as Finish,
  alu: { color: '#c3c6c7', rough: 0.3, metal: 0.85 } as Finish,
  zinc: { color: '#9da1a1', rough: 0.36, metal: 0.75 } as Finish,
  pine: { color: palette.pine, rough: 0.78 } as Finish,
  pineDark: { color: palette.pineDark, rough: 0.72 } as Finish,
  canvas: { color: palette.canvas, rough: 0.92, fabric: 0.6 } as Finish,
  canvasShade: { color: palette.canvasShade, rough: 0.95, fabric: 0.6 } as Finish,
  leather: { color: palette.leather, rough: 0.55 } as Finish,
  cord: { color: palette.cord, rough: 0.5 } as Finish,
  cordDark: { color: palette.cordDark, rough: 0.5 } as Finish,
  bone: { color: palette.bone, rough: 0.42 } as Finish,
  kraft: { color: palette.kraft, rough: 0.9 } as Finish,
};

/* ========================================================================== */
/*  1. Beanbag                                                                */
/* ========================================================================== */

/** The beanbag as a signed distance field: a sack, a back roll, a front lip
 *  and a hollow where somebody has been sitting. Meshed by shrink-wrapping a
 *  sphere onto it from a point inside. */
function beanbagField(seed: number) {
  const n = createNoise2D(seed);
  const r = mulberry32(seed);
  const lean = (r() - 0.5) * 0.05;
  // folds fan out of the hollow toward the front and sides, never up the back
  const creases = [-2.05, -1.35, -0.6, 0.15, 0.75, 1.45, 2.15].map((a) => ({
    a: a + (r() - 0.5) * 0.25,
    depth: 0.006 + r() * 0.007,
    bend: (r() - 0.5) * 1.6,
  }));
  const tilt = 0.5;
  const ca = Math.cos(tilt), sa = Math.sin(tilt);
  return (x: number, y: number, z: number) => {
    // the sack
    let d = sdEllipsoid(x, y - 0.115, z - 0.01, 0.455, 0.3, 0.46);
    // back roll, leaning back
    const by = y - 0.395, bz = z + 0.255;
    const ly = by * ca - bz * sa, lz = by * sa + bz * ca;
    d = smin(d, sdEllipsoid(x - lean, ly, lz, 0.4, 0.235, 0.18), 0.15);
    // front lip
    d = smin(d, sdEllipsoid(x, y - 0.13, z - 0.29, 0.36, 0.14, 0.16), 0.1);
    // the hollow where you sit
    d = smax(d, -sdEllipsoid(x + lean * 0.6, y - 0.5, z - 0.07, 0.25, 0.205, 0.22), 0.085);
    // creases fanning out of the hollow
    const px = x, pz = z - 0.07;
    const rho = Math.hypot(px, pz);
    const win = smoothstep(0.13, 0.24, rho) * (1 - smoothstep(0.38, 0.52, rho)) * smoothstep(0.1, 0.24, y);
    if (win > 0) {
      const th = Math.atan2(px, pz);
      let c = 0;
      for (const k of creases) {
        let dt = th - (k.a + k.bend * (rho - 0.2));
        dt = Math.atan2(Math.sin(dt), Math.cos(dt));
        const w = (rho * dt) / 0.034;
        c += k.depth * Math.exp(-w * w);
      }
      d += c * win;
    }
    // soft lumps of filling
    d += 0.006 * n(x * 4.1 + z * 1.3, y * 4.3 - z * 2.2);
    // and it sits flat on the ground
    return smax(d, -y, 0.025);
  };
}

const beanbagSDF = beanbagField(7);

/** March straight down onto the beanbag surface. */
function beanbagTop(x: number, z: number) {
  let y = 1;
  while (y > 0 && beanbagSDF(x, y, z) > 0) y -= 0.004;
  return y;
}

function beanbagFrontAt(y: number, zFrom: number) {
  let z = zFrom;
  while (z > -0.6 && beanbagSDF(0, y, z) > 0) z -= 0.004;
  return z;
}

export const BEANBAG = (() => {
  const seatZ = 0.07;
  const seatY = beanbagTop(0, seatZ);
  const backZ = -0.28;
  const backY = beanbagTop(0, backZ);
  const lipZ = 0.34;
  const lipY = beanbagTop(0, lipZ);
  // where a reclining back meets the slope
  const restY = 0.46;
  const restZ = beanbagFrontAt(restY, 0.1);
  const lowY = 0.36;
  const lowZ = beanbagFrontAt(lowY, 0.1);
  const recline = Math.atan2(restZ - lowZ, restY - lowY); // from vertical, leaning back (negative z)
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    /** Footprint. */
    width: 0.95,
    depth: 1.02,
    /** Lowest point of the seat hollow (x = 0). */
    seatY: r3(seatY),
    seatZ,
    /** Top of the back roll. */
    backY: r3(backY),
    backZ,
    /** Top of the front lip — where the knees go over. */
    lipY: r3(lipY),
    lipZ,
    /** A point on the back slope at shoulder-blade height, and the slope's lean from vertical (rad). */
    rest: { y: restY, z: r3(restZ) },
    recline: r3(Math.abs(recline)),
  };
})();

export function buildBeanbag(color: string) {
  const b = new GeoBuilder();
  const cloth: Finish = { color, rough: 0.95, fabric: 1 };
  const seam: Finish = { color: shade(color, 0.8), rough: 0.95, fabric: 1 };
  const C = v3(0, 0.1, 0.03);
  const dir = new Vector3();
  const g = surface(60, 42, (u, v, out) => {
    const az = u * Math.PI * 2;
    const pol = Math.PI * Math.pow(v, 1.3);
    dir.set(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az));
    out.copy(C).addScaledVector(dir, rayExit(beanbagSDF, C, dir, 1.2, 0.006));
  }, { weld: true, orient: { center: C } });
  b.add(g, cloth);

  // welt seam around the belly
  const o = v3(0, 0.12, 0);
  const ring: Vector3[] = [];
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    dir.set(Math.sin(a), 0, Math.cos(a));
    ring.push(o.clone().addScaledVector(dir, rayExit(beanbagSDF, o, dir, 1, 0.005) + 0.001));
  }
  b.add(sweep(ring, circle(0.0055, 5), { closed: true, samples: 64 }), seam);

  // carry loop on the back of the roll
  const top = beanbagTop(0, -0.42);
  const lp = [-0.05, -0.03, 0, 0.03, 0.05].map((x, i) => {
    const lift = [0, 0.018, 0.026, 0.018, 0][i];
    return v3(x, top - 0.012 + lift, -0.43 - lift * 0.4);
  });
  b.add(sweep(lp, rrect(0.026, 0.005, 8, 0.5), { ref: (p) => v3(0, p.y - 0.2, p.z + 0.1), caps: true, samples: 16 }), seam);
  return b.build();
}

/* ========================================================================== */
/*  2. Parasol                                                                */
/* ========================================================================== */

export const PARASOL = {
  /** Top of the finial. */
  height: 2.56,
  radius: 1.35,
  apexY: 2.45,
  rimY: 1.95,
  /** Bottom of the scalloped valance. */
  valanceY: 1.8,
  poleR: 0.038,
  ribs: 8,
};

function canopyPoint(u: number, v: number, out: Vector3) {
  const { radius: R, apexY, rimY, ribs } = PARASOL;
  const r0 = 0.06;
  const a = u * Math.PI * 2;
  const pt = (((u * ribs) % 1) + 1) % 1;
  const s = Math.sin(Math.PI * pt);
  const chord = Math.cos(Math.PI / ribs) / Math.cos((pt - 0.5) * ((2 * Math.PI) / ribs));
  const rr = (r0 + (R - r0) * v) * lerp(1, chord, 0.85) - 0.05 * s * Math.pow(v, 4);
  const f = 0.78 * v + 0.22 * v * v;
  const y = apexY - (apexY - rimY) * f - 0.034 * s * smoothstep(0, 0.5, v);
  out.set(Math.sin(a) * rr, y, Math.cos(a) * rr);
}

export function buildParasol() {
  const b = new GeoBuilder();
  const { ribs, apexY, poleR } = PARASOL;
  const P = new Vector3();

  // canopy: one shell per panel so the ribs read as crisp ridges
  for (let k = 0; k < ribs; k++) {
    const fn = (u: number, v: number, out: Vector3) => canopyPoint((k + u) / ribs, v, out);
    const s = shell(8, 12, fn, 0.008, { orient: { dir: v3(0, 1, 0) }, edges: 'v' });
    b.add(s.top, F.canvas).add(s.bottom, F.canvasShade).add(s.edge, F.canvasShade);
    // scalloped valance hanging from the hem
    const val = shell(9, 2, (u, v, out) => {
      canopyPoint((k + u) / ribs, 1, out);
      const hl = Math.hypot(out.x, out.z);
      const lobe = Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
      const len = 0.07 + 0.042 * lobe;
      out.x += (out.x / hl) * (0.012 * v - 0.004);
      out.z += (out.z / hl) * (0.012 * v - 0.004);
      out.y -= 0.002 + len * v;
    }, 0.005, { orient: { center: v3(0, 1.9, 0) } });
    b.add(val.top, F.canvas).add(val.bottom, F.canvasShade).add(val.edge, F.canvasShade);
  }

  // ribs just under the canopy, poking out at the hem with wooden tips
  const runnerY = 1.7;
  for (let k = 0; k < ribs; k++) {
    const u = k / ribs;
    const pts: Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      canopyPoint(u, (i / 6) * 1.012, P);
      pts.push(P.clone().add(v3(0, -0.019, 0)));
    }
    b.add(sweep(pts, rrect(0.017, 0.012, 6, 0.6), { samples: 12, caps: true, ref: v3(0, 1, 0) }), F.pine);
    b.add(sphereAt(pts[6], 0.011, 6, 4), F.pineDark);
    // stretcher from the runner to the rib
    canopyPoint(u, 0.42, P);
    const a = u * Math.PI * 2;
    const foot = v3(Math.sin(a) * 0.05, runnerY + 0.02, Math.cos(a) * 0.05);
    const head = P.clone().add(v3(0, -0.03, 0));
    b.add(cylBetween(foot, head, 0.0075, 0.0075, 6), F.pine);
    b.add(sphereAt(head, 0.01, 6, 4), F.zinc);
  }

  // pole, hubs, crank
  b.add(cylBetween(v3(0, -0.25, 0), v3(0, apexY + 0.02, 0), poleR, poleR * 0.92, 16), F.pine);
  b.add(cylBetween(v3(0, runnerY - 0.035, 0), v3(0, runnerY + 0.05, 0), 0.055, 0.05, 16), F.pineDark);
  b.add(cylBetween(v3(0, runnerY - 0.06, 0), v3(0, runnerY - 0.035, 0), 0.04, 0.04, 12), F.zinc);
  b.add(cylBetween(v3(0, apexY - 0.1, 0), v3(0, apexY - 0.03, 0), 0.06, 0.055, 16), F.pineDark);
  b.add(cylBetween(v3(0, 1.0, 0), v3(0, 1.06, 0), poleR + 0.004, poleR + 0.004, 16), F.zinc);
  // crank box with a little handle
  b.add(rbox(0.06, 0.12, 0.06, 0.012, 1), F.pineDark, mat(0, 1.36, 0.032));
  b.add(rbox(0.014, 0.014, 0.07, 0.006, 1), F.zinc, mat(0.026, 1.36, 0.075));
  b.add(cylBetween(v3(0.026, 1.36, 0.105), v3(0.07, 1.36, 0.105), 0.008, 0.009, 8), F.pine);
  // canvas cap and finial
  b.add(lathe(fillet([[0.092, apexY - 0.012], [0.086, apexY - 0.004, 0.008], [0.03, apexY + 0.026, 0.02], [0, apexY + 0.03]], 3), 24), F.canvas);
  b.add(lathe(fillet([[0, apexY + 0.025], [0.014, apexY + 0.03], [0.011, apexY + 0.05, 0.005], [0.031, apexY + 0.075, 0.016], [0.02, apexY + 0.1, 0.01], [0, PARASOL.height]], 2), 14), F.pine);
  // ground socket
  b.add(lathe(fillet([[0.06, 0.0], [0.052, 0.022, 0.008], [0.041, 0.034]], 2), 16), { color: '#4a4c49', rough: 0.5, metal: 0.4 });
  return b.build();
}

/* ========================================================================== */
/*  3. Camp chair                                                             */
/* ========================================================================== */

export const CAMP_CHAIR = {
  /** Top of the seat fabric at its lowest (centre); the rails are at 0.445. */
  seatY: 0.402,
  /** Seat centre, along Z. */
  seatZ: 0.01,
  /** Back recline from vertical (rad). */
  backTilt: 12 * DEG,
  /** Top of the armrest pads. */
  armY: 0.645,
  /** Armrest centres at ±armX. */
  armX: 0.27,
  width: 0.64,
  depth: 0.58,
  height: 0.9,
};

export function buildCampChair(color: string = palette.olive) {
  const b = new GeoBuilder();
  const fab: Finish = { color, rough: 0.95, fabric: 1 };
  const fabDark: Finish = { color: shade(color, 0.72), rough: 0.95, fabric: 1 };
  const meshF: Finish = { color: shade(color, 0.45), rough: 0.95, fabric: 1 };
  const tilt = Math.tan(CAMP_CHAIR.backTilt);
  const R = 0.0105;
  const tube = (a: Vector3, c: Vector3, r = R) => b.add(cylBetween(a, c, r, r, 8), F.frame);
  const uprightZ = (y: number) => -0.205 - (y - 0.445) * tilt;

  for (const sx of [-1, 1]) {
    const FF = v3(0.285 * sx, 0.012, 0.255);
    const BF = v3(0.285 * sx, 0.012, -0.245);
    const FT = v3(0.272 * sx, 0.6, 0.235);
    const SRb = v3(0.262 * sx, 0.445, -0.205);
    const SRf = v3(0.262 * sx, 0.445, 0.22);
    const BT = v3(0.255 * sx, 0.9, uprightZ(0.9));
    tube(FF, FT);
    tube(BF, SRb);
    tube(SRb, BT);
    tube(SRb, SRf, 0.0095);
    // side X brace + pivot rivet
    const o = v3(0.012 * sx, 0, 0);
    tube(FF.clone().add(o), SRb.clone().add(o), 0.0095);
    tube(BF.clone().add(o), SRf.clone().add(o), 0.0095);
    b.add(cylBetween(v3(0.276 * sx, 0.246, 0.007), v3(0.306 * sx, 0.246, 0.007), 0.0075, 0.0075, 8), F.zinc);
    // arm tube + padded armrest
    const armBack = v3(0.262 * sx, 0.6, uprightZ(0.6));
    tube(armBack, FT);
    b.add(rbox(0.074, 0.032, 0.46, 0.015), fabDark, mat(0.272 * sx, 0.628, 0.0, 0, 0, 0));
    // plastic joints and feet
    b.add(rbox(0.04, 0.052, 0.046, 0.012, 1), F.plastic, mat(FT.x, FT.y - 0.012, FT.z));
    b.add(rbox(0.036, 0.04, 0.044, 0.01, 1), F.plastic, mat(SRb.x, SRb.y, SRb.z));
    b.add(rbox(0.036, 0.04, 0.044, 0.01, 1), F.plastic, mat(SRf.x, SRf.y, SRf.z));
    b.add(sphereAt(BT, 0.014, 8, 6), F.plastic);
    for (const foot of [FF, BF]) b.add(cylBetween(v3(foot.x, 0, foot.z), v3(foot.x, 0.03, foot.z), 0.019, 0.015, 10), F.plastic);
    // fabric sleeves over the seat rails and back uprights
    b.add(cylBetween(v3(0.262 * sx, 0.445, -0.2), v3(0.262 * sx, 0.445, 0.215), 0.017, 0.017, 10), fab);
    b.add(cylBetween(v3(0.257 * sx, 0.48, uprightZ(0.48)), v3(0.256 * sx, 0.893, uprightZ(0.893)), 0.018, 0.018, 10), fab);
  }
  // front and back X braces
  for (const [z0, z1] of [[0.258, 0.226], [-0.24, -0.205]]) {
    tube(v3(-0.283, 0.05, z0), v3(0.265, 0.43, z1), 0.009);
    tube(v3(0.283, 0.05, z0 + 0.006), v3(-0.265, 0.43, z1 + 0.006), 0.009);
  }

  // seat: sags between the rails, rolls over at the front
  const seat = shell(14, 10, (u, v, out) => {
    const sag = 0.05 * Math.pow(Math.sin(Math.PI * u), 1.1) * (0.55 + 0.45 * Math.sin(Math.PI * v));
    const roll = 0.024 * Math.pow(smoothstep(0.8, 1, v), 2);
    out.set(lerp(-0.258, 0.258, u), 0.452 - sag - roll, lerp(-0.2, 0.226, v));
  }, 0.008, { orient: { dir: v3(0, 1, 0) } });
  b.add(seat.top, fab).add(seat.bottom, fabDark).add(seat.edge, fab);
  // back: bows backwards between the uprights
  const backFn = (u: number, v: number, out: Vector3) => {
    const y = lerp(0.49, 0.886, v);
    const bow = 0.055 * Math.pow(Math.sin(Math.PI * u), 1.05) * (0.3 + 0.7 * Math.sin(Math.PI * (0.12 + v * 0.76)));
    out.set(lerp(-0.252, 0.252, u), y, uprightZ(y) - bow);
  };
  const back = shell(14, 10, backFn, 0.008, { orient: { dir: v3(0, 0, 1) } });
  b.add(back.top, fab).add(back.bottom, fabDark).add(back.edge, fab);
  // rolled hem along the top of the back
  const hem: Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const p = new Vector3();
    backFn(i / 10, 1, p);
    hem.push(p.add(v3(0, 0.004, -0.004)));
  }
  b.add(sweep(hem, circle(0.011, 8), { samples: 24, caps: true }), fab);

  // mesh cup holder off the right arm (the sitter's right is -X)
  const cx = -0.335, cz = 0.17;
  b.add(cylBetween(v3(cx, 0.5, cz), v3(cx, 0.6, cz), 0.036, 0.043, 16), meshF);
  b.add(new CylinderGeometry(0.039, 0.039, 0.002, 16), { color: '#1a1b19', rough: 1 }, mat(cx, 0.6, cz));
  b.add(new TorusGeometry(0.043, 0.0045, 6, 20), F.frame, mat(cx, 0.601, cz, Math.PI / 2, 0, 0));
  b.add(rbox(0.04, 0.012, 0.03, 0.005, 1), F.plastic, mat(-0.293, 0.6, cz));
  return b.build();
}

/* ========================================================================== */
/*  4. Crate                                                                  */
/* ========================================================================== */

export const CRATE = { w: 0.46, h: 0.32, d: 0.34 };
/** Crates stack: put the next one (or a thermos) at this height. */
export const CRATE_HEIGHT = CRATE.h;

export function buildCrate(seed = 11) {
  const b = new GeoBuilder();
  const r = mulberry32(seed);
  const tones = [
    palette.pine,
    mix(palette.pine, palette.pineDark, 0.22),
    mix(palette.pine, '#e8d3ae', 0.25),
    mix(palette.pine, palette.pineDark, 0.45),
  ];
  const wood = (): Finish => {
    const t = r();
    return { color: t < 0.5 ? tones[0] : t < 0.75 ? tones[1] : t < 0.9 ? tones[2] : tones[3], rough: 0.82 };
  };
  const { w: W, h: H, d: D } = CRATE;
  const st = 0.012;
  const nail: Finish = { color: '#55524c', rough: 0.4, metal: 0.6 };

  // end boards with hand-holds (extruded so the cut-out is a real hole)
  const bevel = 0.0025;
  const ew = D - 2 * st - 2 * bevel, eh = H - st - 2 * bevel;
  const shape = new Shape();
  const rc = 0.008;
  shape.moveTo(-ew / 2 + rc, 0);
  shape.lineTo(ew / 2 - rc, 0);
  shape.quadraticCurveTo(ew / 2, 0, ew / 2, rc);
  shape.lineTo(ew / 2, eh - rc);
  shape.quadraticCurveTo(ew / 2, eh, ew / 2 - rc, eh);
  shape.lineTo(-ew / 2 + rc, eh);
  shape.quadraticCurveTo(-ew / 2, eh, -ew / 2, eh - rc);
  shape.lineTo(-ew / 2, rc);
  shape.quadraticCurveTo(-ew / 2, 0, -ew / 2 + rc, 0);
  const hole = new Path();
  const hy = eh - 0.052, hl = 0.046, hr = 0.017;
  hole.absarc(hl, hy, hr, -Math.PI / 2, Math.PI / 2, false);
  hole.absarc(-hl, hy, hr, Math.PI / 2, (3 * Math.PI) / 2, false);
  shape.holes.push(hole);
  const et = 0.018;
  for (const sx of [-1, 1]) {
    const g = new ExtrudeGeometry(shape, {
      depth: et - 2 * bevel,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 10,
    });
    g.translate(0, bevel, -(et - 2 * bevel) / 2);
    g.rotateY(Math.PI / 2);
    b.add(g, wood(), mat(sx * (W / 2 - et / 2 - 0.001), st, 0));
  }
  // a stencilled grower's stamp on the +X end, below the hand-hold
  const inkF: Finish = { color: mix(palette.pine, palette.pineDark, 0.8), rough: 0.85 };
  const sxw = W / 2 - 0.001 + 0.0005;
  b.add(new TorusGeometry(0.05, 0.003, 4, 32).rotateY(Math.PI / 2), inkF, mat(sxw, 0.16, 0, 0, 0, 0, 0.3, 0.62, 1));
  b.add(new BoxGeometry(0.001, 0.008, 0.07), inkF, mat(sxw, 0.165, 0));
  b.add(new BoxGeometry(0.001, 0.006, 0.045), inkF, mat(sxw, 0.148, 0));
  // side slats (front and back), nailed onto the end boards
  const slatH = 0.075;
  const slatY = [0.015 + slatH / 2, 0.13 + slatH / 2, H - slatH / 2];
  for (const sz of [-1, 1]) {
    for (const y of slatY) {
      b.add(rbox(W, slatH, st, 0.003, 1), wood(), mat((r() - 0.5) * 0.004, y, sz * (D / 2 - st / 2)));
      for (const sx of [-1, 1]) {
        for (const dy of [-0.022, 0.022]) {
          b.add(cylBetween(v3(sx * (W / 2 - 0.009), y + dy, sz * (D / 2 - 0.001)), v3(sx * (W / 2 - 0.009), y + dy, sz * (D / 2 + 0.0008)), 0.0026, 0.0026, 5), nail);
        }
      }
    }
  }
  // bottom slats
  for (const z of [-0.11, 0, 0.11]) b.add(rbox(W - 0.004, st, 0.088, 0.003, 1), wood(), mat(0, st / 2, z));
  // corner battens inside
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.add(rbox(0.024, H - st - 0.006, 0.024, 0.003, 1), wood(), mat(sx * (W / 2 - et - 0.013), st + (H - st - 0.006) / 2, sz * (D / 2 - st - 0.013)));
    }
  }
  return b.build();
}

/* ========================================================================== */
/*  5. Cooler                                                                 */
/* ========================================================================== */

export const COOLER = { w: 0.62, h: 0.39, d: 0.4, handleY: 0.43 };

/** Pull the bottom of a rounded box in (keeps normals, fine for small tapers). */
function taperBottom(g: BufferGeometry, h: number, k: number) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + h / 2) / h;
    const s = lerp(k, 1, Math.min(1, t * 1.3));
    p.setX(i, p.getX(i) * s);
    p.setZ(i, p.getZ(i) * s);
  }
  return g;
}

export function buildCooler() {
  const b = new GeoBuilder();
  const blue: Finish = { color: palette.cooler, rough: 0.42 };
  const blueDark: Finish = { color: shade(palette.cooler, 0.62), rough: 0.5 };
  const lid: Finish = { color: palette.bone, rough: 0.38 };
  const grey: Finish = { color: '#8f9392', rough: 0.42, metal: 0.1 };
  const greyDark: Finish = { color: '#5f6362', rough: 0.55 };

  b.add(taperBottom(rbox(0.59, 0.3, 0.37, 0.05, 3), 0.3, 0.95), blue, mat(0, 0.168, 0));
  b.add(rbox(0.6, 0.072, 0.38, 0.03, 3), lid, mat(0, 0.347, 0));
  b.add(rbox(0.5, 0.014, 0.27, 0.007, 2), lid, mat(0, 0.383, 0));
  // feet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(rbox(0.07, 0.02, 0.05, 0.008, 1), greyDark, mat(sx * 0.22, 0.01, sz * 0.13));
  // latch, hinges, drain plug
  b.add(rbox(0.075, 0.056, 0.016, 0.006), lid, mat(0, 0.312, 0.19));
  b.add(rbox(0.05, 0.016, 0.012, 0.004), blueDark, mat(0, 0.276, 0.184));
  for (const sx of [-1, 1]) b.add(cylBetween(v3(sx * 0.12, 0.316, -0.192), v3(sx * 0.19, 0.316, -0.192), 0.011, 0.011, 10), lid);
  b.add(cylBetween(v3(0.285, 0.05, 0.11), v3(0.305, 0.05, 0.11), 0.016, 0.014, 12), grey);
  // swing handle, resting a little back from upright
  const pivot = v3(0, 0.25, 0);
  const th = -0.28;
  const rot = new Matrix4().makeRotationX(th);
  const tilt = (p: Vector3) => p.clone().sub(pivot).applyMatrix4(rot).add(pivot);
  const hp = [
    [-0.313, 0.25], [-0.318, 0.33], [-0.31, 0.4], [-0.27, 0.432], [-0.16, 0.441], [0, 0.442],
    [0.16, 0.441], [0.27, 0.432], [0.31, 0.4], [0.318, 0.33], [0.313, 0.25],
  ].map(([x, y]) => tilt(v3(x, y, 0)));
  const centre = tilt(v3(0, 0.31, 0));
  b.add(sweep(hp, rrect(0.026, 0.009, 10, 0.4), { samples: 48, caps: true, ref: (p) => p.clone().sub(centre).setZ(0) }), grey);
  const gc = tilt(v3(0, 0.442, 0));
  b.add(cylBetween(gc.clone().add(v3(-0.1, 0, 0)), gc.clone().add(v3(0.1, 0, 0)), 0.016, 0.016, 14), greyDark);
  b.add(sphereAt(gc.clone().add(v3(-0.1, 0, 0)), 0.016, 12, 8), greyDark);
  b.add(sphereAt(gc.clone().add(v3(0.1, 0, 0)), 0.016, 12, 8), greyDark);
  for (const sx of [-1, 1]) b.add(cylBetween(v3(sx * 0.288, 0.25, 0), v3(sx * 0.322, 0.25, 0), 0.022, 0.022, 14), greyDark);
  return b.build();
}

/* ========================================================================== */
/*  6. Bike                                                                   */
/* ========================================================================== */

export const BIKE = {
  wheelR: 0.34,
  /** Half the handlebar width — lay the bike on its side with y = halfWidth. */
  halfWidth: 0.3,
  /** Overall length, rear mudguard to front tyre. */
  length: 1.75,
  wheelbase: 1.05,
  saddleY: 0.95,
  height: 1.0,
  /**
   * The kickstand is set for this lean: rotate the bike by -standLean about
   * Z (top toward +X) and both tyres and the stand foot touch the ground.
   */
  standLean: 0.14,
};

export function buildBike(frameColor: string) {
  const b = new GeoBuilder();
  const paint: Finish = { color: frameColor, rough: 0.3, metal: 0.15 };
  const steel: Finish = { color: '#3a3b3b', rough: 0.4, metal: 0.6 };
  const R = BIKE.wheelR, WB = BIKE.wheelbase;
  const RA = v3(0, R, -WB / 2), FA = v3(0, R, WB / 2);

  // --- wheels
  for (const A of [RA, FA]) {
    b.add(new TorusGeometry(R - 0.0175, 0.0175, 8, 64).rotateY(Math.PI / 2), F.rubber, mat(A.x, A.y, A.z));
    b.add(new TorusGeometry(R - 0.037, 0.0085, 5, 48).rotateY(Math.PI / 2), F.alu, mat(A.x, A.y, A.z, 0, 0, 0, 1.25, 1, 1));
    const hw = A === RA ? 0.06 : 0.05;
    b.add(cylBetween(v3(-hw, A.y, A.z), v3(hw, A.y, A.z), 0.016, 0.016, 12), F.alu);
    for (const sx of [-1, 1]) b.add(cylBetween(v3(sx * 0.026, A.y, A.z), v3(sx * 0.032, A.y, A.z), 0.03, 0.03, 14), F.alu);
    for (let i = 0; i < 16; i++) {
      const side = i % 2 ? 1 : -1;
      const a = (i / 16) * Math.PI * 2;
      const a2 = a + side * 0.16;
      const hub = v3(side * 0.029, A.y + Math.cos(a) * 0.027, A.z + Math.sin(a) * 0.027);
      const rim = v3(side * 0.003, A.y + Math.cos(a2) * (R - 0.043), A.z + Math.sin(a2) * (R - 0.043));
      b.add(cylBetween(hub, rim, 0.0012, 0.0012, 4, true), F.chrome);
    }
  }

  // --- frame geometry (side view, x = 0)
  const BB = v3(0, 0.27, -0.1);
  const stDir = v3(0, Math.sin(73 * DEG), -Math.cos(73 * DEG));
  const axis = v3(0, Math.sin(72 * DEG), -Math.cos(72 * DEG));
  const perp = v3(0, Math.cos(72 * DEG), Math.sin(72 * DEG));
  const S0 = FA.clone().addScaledVector(perp, -0.045);
  const CR = S0.clone().addScaledVector(axis, 0.37);
  const HB = CR.clone().addScaledVector(axis, 0.012);
  const HT = HB.clone().addScaledVector(axis, 0.14);
  const ST = BB.clone().addScaledVector(stDir, 0.52);
  const SC = BB.clone().addScaledVector(stDir, 0.49);
  const X = (p: Vector3, x: number) => p.clone().setX(x);
  const tube = (a: Vector3, c: Vector3, r: number, rB = r) => b.add(cylBetween(a, c, r, rB, 12), paint);

  tube(BB, ST, 0.0145);
  tube(BB, HB.clone().addScaledVector(axis, 0.03), 0.0155, 0.0145);
  tube(SC, HT.clone().addScaledVector(axis, -0.028), 0.0135);
  tube(HB, HT, 0.019);
  b.add(cylBetween(HT, HT.clone().addScaledVector(axis, 0.012), 0.02, 0.02, 14), F.chrome);
  b.add(cylBetween(HB.clone().addScaledVector(axis, -0.012), HB, 0.02, 0.02, 14), F.chrome);
  for (const sx of [-1, 1]) {
    tube(X(SC, sx * 0.018).addScaledVector(stDir, -0.01), X(RA, sx * 0.058), 0.0085, 0.007);
    tube(X(BB, sx * 0.03), X(RA, sx * 0.058), 0.0095, 0.0075);
    b.add(rbox(0.008, 0.04, 0.03, 0.006, 1), paint, mat(sx * 0.058, RA.y, RA.z));
  }
  b.add(sphereAt(SC, 0.016, 10, 8), paint);
  b.add(cylBetween(v3(-0.04, BB.y, BB.z), v3(0.04, BB.y, BB.z), 0.021, 0.021, 14), paint);

  // fork + crown
  b.add(rbox(0.1, 0.024, 0.042, 0.01, 1), paint, mat(CR.x, CR.y, CR.z, -18 * DEG));
  for (const sx of [-1, 1]) {
    const pts = [
      X(CR, sx * 0.036).addScaledVector(axis, -0.005),
      X(S0, sx * 0.042).addScaledVector(axis, 0.2),
      X(S0, sx * 0.047).addScaledVector(axis, 0.07).addScaledVector(perp, 0.016),
      X(FA, sx * 0.05),
    ];
    b.add(sweep(pts, circle(0.011, 8), { samples: 14, caps: true, scale: (t) => 1 - 0.3 * t }), paint);
  }

  // stem, swept-back bars, leather grips, bell
  const Q = HT.clone().addScaledVector(axis, 0.075);
  b.add(cylBetween(HT, Q, 0.0125, 0.0125, 10), F.chrome);
  const Ch = Q.clone().add(v3(0, 0.012, 0.055));
  b.add(cylBetween(Q, Ch, 0.012, 0.012, 10), F.chrome);
  b.add(sphereAt(Q, 0.013, 10, 8), F.chrome);
  const bar = [
    [-0.285, 0.024, -0.17], [-0.282, 0.022, -0.06], [-0.24, 0.016, 0.0], [-0.13, 0.006, 0.02], [0, 0, 0.022],
    [0.13, 0.006, 0.02], [0.24, 0.016, 0.0], [0.282, 0.022, -0.06], [0.285, 0.024, -0.17],
  ].map(([x, y, z]) => Ch.clone().add(v3(x, y, z)));
  b.add(sweep(bar, circle(0.011, 8), { samples: 44, caps: true }), F.chrome);
  for (const sx of [-1, 1]) {
    const g0 = Ch.clone().add(v3(sx * 0.2835, 0.023, -0.075));
    const g1 = Ch.clone().add(v3(sx * 0.2855, 0.024, -0.178));
    b.add(cylBetween(g0, g1, 0.0155, 0.0155, 12), F.leather);
    b.add(sphereAt(g1, 0.0155, 10, 6), F.leather);
    // brake lever
    b.add(sweep([g0.clone().add(v3(-sx * 0.01, -0.01, 0.01)), g0.clone().add(v3(sx * 0.0, -0.03, 0.04)), g0.clone().add(v3(sx * 0.01, -0.035, -0.04))], rrect(0.012, 0.006, 6, 0.5), { samples: 8, caps: true }), F.alu);
  }
  const bell = Ch.clone().add(v3(0.12, 0.02, 0.02));
  b.add(lathe(fillet([[0, 0], [0.021, 0, 0.004], [0.019, 0.012, 0.008], [0, 0.02]], 3), 16), F.chrome, mat(bell.x, bell.y, bell.z));

  // headlamp on the head tube
  const lamp = HB.clone().addScaledVector(axis, 0.06).add(v3(0, 0, 0.045));
  b.add(cylBetween(lamp.clone().add(v3(0, 0, -0.03)), lamp.clone().add(v3(0, 0, 0.02)), 0.02, 0.026, 16), F.chrome);
  b.add(cylBetween(lamp.clone().add(v3(0, 0, 0.02)), lamp.clone().add(v3(0, 0, 0.024)), 0.023, 0.023, 16), { color: palette.bone, rough: 0.15 });
  b.add(rbox(0.012, 0.03, 0.03, 0.004, 1), F.chrome, mat(0, lamp.y, lamp.z - 0.04));

  // seat post + leather saddle
  const SP = BB.clone().addScaledVector(stDir, 0.64);
  b.add(cylBetween(ST, SP, 0.0125, 0.0125, 10), F.chrome);
  b.add(rbox(0.03, 0.02, 0.04, 0.006, 1), steel, mat(SP.x, SP.y + 0.008, SP.z));
  const sc = SP.clone().add(v3(0, 0.045, 0.02));
  const saddle = surface(26, 14, (u, v, out) => {
    const w = (u - 0.5) * Math.PI * 2;
    const h = (v - 0.5) * Math.PI;
    const Z = Math.sin(w) * Math.cos(h); // -1 rear .. 1 nose
    const Xs = Math.cos(w) * Math.cos(h);
    const Y = Math.sin(h);
    const t = (Z + 1) / 2;
    const hw = 0.024 + 0.062 * (1 - smoothstep(0.3, 0.86, t));
    const top = 0.024 + 0.01 * (1 - t);
    const y = Y > 0 ? Y * top + 0.006 * (1 - Xs * Xs) * Y : Y * (0.03 - 0.012 * t);
    const pinch = Y < 0 ? 1 + 0.1 * Y : 1;
    out.set(Xs * hw * pinch, y, Z * 0.14);
  }, { weld: true, orient: { center: new Vector3() } });
  b.add(saddle, F.leather, mat(sc.x, sc.y, sc.z, -3 * DEG));
  for (const sx of [-1, 1]) {
    b.add(cylBetween(sc.clone().add(v3(sx * 0.012, -0.016, 0.11)), sc.clone().add(v3(sx * 0.03, -0.03, -0.06)), 0.0035, 0.0035, 6), F.chrome);
    b.add(cylBetween(sc.clone().add(v3(sx * 0.03, -0.03, -0.06)), sc.clone().add(v3(sx * 0.05, -0.016, -0.1)), 0.0035, 0.0035, 6), F.chrome);
    // little coil springs at the back
    for (let k = 0; k < 3; k++) b.add(new TorusGeometry(0.011, 0.0028, 4, 10), F.chrome, mat(sx * 0.045, sc.y - 0.05 + k * 0.009, sc.z - 0.085, Math.PI / 2, 0, 0));
  }
  for (let k = -2; k <= 2; k++) b.add(sphereAt(sc.clone().add(v3(k * 0.03, -0.006 - Math.abs(k) * 0.004, -0.138 + Math.abs(k) * 0.009)), 0.0035, 5, 3), F.chrome);

  // --- drivetrain on the right (-X)
  const dsx = -0.055;
  {
    const teeth = 34;
    const shape = new Shape();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const rr = i % 2 ? 0.0935 : 0.1;
      if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const inner = new Path();
    inner.absarc(0, 0, 0.079, 0, Math.PI * 2, true);
    shape.holes.push(inner);
    const ring = new ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false, curveSegments: 20 });
    b.add(ring.translate(0, 0, -0.002).rotateY(Math.PI / 2), F.alu, mat(dsx, BB.y, BB.z));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3;
      b.add(rbox(0.006, 0.013, 0.07, 0.003, 1), F.alu, mat(dsx + 0.001, BB.y - Math.sin(a) * 0.044, BB.z + Math.cos(a) * 0.044, a));
    }
  }
  b.add(cylBetween(v3(dsx - 0.006, BB.y, BB.z), v3(-dsx + 0.006, BB.y, BB.z), 0.016, 0.016, 12), F.alu);
  const crankA = 32 * DEG;
  const cd = v3(0, -Math.sin(crankA), Math.cos(crankA));
  for (const sx of [-1, 1]) {
    const s = sx < 0 ? 1 : -1; // drive arm forward-down, the other back-up
    const x = sx * 0.068;
    const end = BB.clone().addScaledVector(cd, 0.17 * s).setX(x);
    b.add(rbox(0.012, 0.024, 0.205, 0.0055, 1), F.alu, mat(x, (BB.y + end.y) / 2, (BB.z + end.z) / 2, crankA));
    b.add(cylBetween(end, end.clone().setX(x + sx * 0.03), 0.006, 0.006, 8), F.chrome);
    b.add(rbox(0.09, 0.022, 0.06, 0.008, 1), F.rubber, mat(x + sx * 0.075, end.y, end.z));
  }
  const cog = new CylinderGeometry(0.036, 0.036, 0.005, 24, 1).rotateZ(Math.PI / 2);
  b.add(cog, steel, mat(dsx, RA.y, RA.z));
  // chain: outer tangents around chainring and cog
  {
    const c1 = BB, r1 = 0.097, c2 = RA, r2 = 0.034;
    const dz = c2.z - c1.z, dy = c2.y - c1.y;
    const d = Math.hypot(dz, dy);
    const al = Math.atan2(dy, dz);
    const be = Math.acos((r1 - r2) / d);
    const pt = (c: Vector3, r: number, a: number) => v3(dsx, c.y + Math.sin(a) * r, c.z + Math.cos(a) * r);
    const pts: Vector3[] = [];
    const n1 = 16;
    for (let i = 0; i <= n1; i++) pts.push(pt(c1, r1, al + be + ((Math.PI * 2 - 2 * be) * i) / n1));
    const a0 = pts[pts.length - 1], b0 = pt(c2, r2, al - be);
    for (let i = 1; i < 6; i++) pts.push(a0.clone().lerp(b0, i / 6));
    for (let i = 0; i <= 6; i++) pts.push(pt(c2, r2, al - be + (2 * be * i) / 6));
    const a1 = pts[pts.length - 1], b1 = pt(c1, r1, al + be);
    for (let i = 1; i < 6; i++) pts.push(a1.clone().lerp(b1, i / 6));
    b.add(sweep(pts, rrect(0.0075, 0.006, 4, 0.5), { closed: true, samples: 72, ref: v3(1, 0, 0) }), steel);
  }

  // mudguards in the frame colour, with stays
  const guard = (A: Vector3, from: number, to: number, stayAt: number) => {
    const rf = R + 0.018;
    const pts: Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = lerp(from, to, i / 12) * DEG;
      pts.push(v3(0, A.y + Math.cos(a) * rf, A.z + Math.sin(a) * rf));
    }
    const prof: [number, number][] = [];
    for (let i = 0; i <= 4; i++) {
      const q = lerp(-58, 58, i / 4) * DEG;
      prof.push([Math.sin(q) * 0.034, (Math.cos(q) - 1) * 0.034]);
    }
    for (let i = 4; i >= 0; i--) {
      const q = lerp(-58, 58, i / 4) * DEG;
      prof.push([Math.sin(q) * 0.031, (Math.cos(q) - 1) * 0.031 - 0.0028]);
    }
    b.add(sweep(pts, prof, { samples: 30, caps: true, ref: (p) => p.clone().sub(A).setX(0) }), paint);
    const sa = stayAt * DEG;
    for (const sx of [-1, 1]) {
      const top = v3(sx * 0.026, A.y + Math.cos(sa) * (rf - 0.012), A.z + Math.sin(sa) * (rf - 0.012));
      b.add(cylBetween(top, v3(sx * 0.052, A.y, A.z), 0.0022, 0.0022, 5), F.chrome);
    }
  };
  guard(FA, -110, 58, 70);
  guard(RA, -122, 60, -100);

  // brakes
  b.add(rbox(0.06, 0.03, 0.02, 0.007, 1), F.alu, mat(0, CR.y - 0.012, CR.z + 0.032, -18 * DEG));
  const bridge = SC.clone().lerp(RA, 0.42);
  b.add(cylBetween(v3(-0.03, bridge.y, bridge.z), v3(0.03, bridge.y, bridge.z), 0.005, 0.005, 6), paint);
  b.add(rbox(0.055, 0.028, 0.02, 0.007, 1), F.alu, mat(0, bridge.y - 0.004, bridge.z - 0.02, 0.6));

  // kickstand on the left (+X), set for BIKE.standLean
  const k0 = v3(0.034, 0.262, -0.17);
  const xf = 0.19;
  const k1 = v3(xf, xf * Math.tan(BIKE.standLean), -0.27);
  b.add(cylBetween(k0, k1, 0.0085, 0.007, 8), F.alu);
  b.add(rbox(0.03, 0.008, 0.036, 0.003, 1), F.alu, mat(k1.x, k1.y + 0.0045, k1.z, 0, 0, -BIKE.standLean));
  b.add(rbox(0.022, 0.03, 0.05, 0.006, 1), F.alu, mat(0.028, 0.262, -0.17));
  return b.build();
}

/* ========================================================================== */
/*  7. Backpack                                                               */
/* ========================================================================== */

export const BACKPACK = { w: 0.3, h: 0.445, d: 0.2 };

const BP = { a: 0.15, b: 0.205, yc: 0.21, cf: 0.07, cb: 0.06, e1t: 0.62, e1b: 0.4, e2f: 0.5, e2b: 0.28 };
const spw = (x: number, e: number) => Math.sign(x) * Math.pow(Math.abs(x), e);

function bpTaper(y: number) {
  return 1 - 0.1 * Math.max(0, (y - BP.yc) / BP.b);
}

/** Body of the pack as a superellipsoid — flat back, round top, fuller front. */
function bpBody(u: number, v: number, out: Vector3) {
  const w = (u - 0.5) * Math.PI * 2;
  const h = (v - 0.5) * Math.PI;
  const e1 = h > 0 ? BP.e1t : BP.e1b;
  const front = Math.sin(w) > 0;
  const e2 = front ? BP.e2f : BP.e2b;
  const ch = spw(Math.cos(h), e1);
  const y = BP.yc + BP.b * spw(Math.sin(h), e1);
  out.set(BP.a * bpTaper(y) * ch * spw(Math.cos(w), e2), y, (front ? BP.cf : BP.cb) * ch * spw(Math.sin(w), e2));
}

/** Inside/outside test for the same body (> 0 outside). */
function bpF(x: number, y: number, z: number) {
  const yy = (y - BP.yc) / BP.b;
  const e1 = yy > 0 ? BP.e1t : BP.e1b;
  const front = z > 0;
  const e2 = front ? BP.e2f : BP.e2b;
  const t = Math.pow(Math.abs(x / (BP.a * bpTaper(y))), 2 / e2) + Math.pow(Math.abs(z / (front ? BP.cf : BP.cb)), 2 / e2);
  return Math.pow(t, e2 / e1) + Math.pow(Math.abs(yy), 2 / e1) - 1;
}

function bpNormal(p: Vector3) {
  const e = 1e-4;
  return v3(
    bpF(p.x + e, p.y, p.z) - bpF(p.x - e, p.y, p.z),
    bpF(p.x, p.y + e, p.z) - bpF(p.x, p.y - e, p.z),
    bpF(p.x, p.y, p.z + e) - bpF(p.x, p.y, p.z - e),
  ).normalize();
}

/** Point on the pack surface seen from (x, oy, 0) along angle psi in the YZ plane (0 = up, π/2 = front). */
function bpHit(x: number, oy: number, psi: number, offset: number) {
  const o = v3(x, oy, 0);
  const d = v3(0, Math.cos(psi), Math.sin(psi));
  const p = o.clone().addScaledVector(d, rayExit(bpF, o, d, 0.5, 0.004));
  return p.addScaledVector(bpNormal(p), offset);
}

export function buildBackpack(color: string) {
  const b = new GeoBuilder();
  const body: Finish = { color, rough: 0.9, fabric: 0.85 };
  const dark: Finish = { color: shade(color, 0.7), rough: 0.92, fabric: 0.9 };
  const zip: Finish = { color: '#262624', rough: 0.6 };

  b.add(surface(30, 20, bpBody, { weld: true, orient: { center: v3(0, BP.yc, 0) } }), body);

  // top flap with rounded front corners
  const flapFn = (u: number, v: number, out: Vector3) => {
    const cr = 0.032;
    const tail = Math.max(0, (v - 0.86) / 0.14);
    const head = Math.max(0, (0.12 - v) / 0.12) * 0.7;
    const k = Math.max(tail, head);
    const hw = 0.122 - cr * (1 - Math.sqrt(Math.max(0, 1 - k * k)));
    out.copy(bpHit((u - 0.5) * 2 * hw, 0.3, lerp(-0.42, 2.02, v), 0.013));
  };
  const flap = shell(12, 16, flapFn, 0.008, { orient: { center: v3(0, BP.yc, 0) } });
  b.add(flap.top, body).add(flap.bottom, dark).add(flap.edge, dark);

  // leather buckle straps
  for (const sx of [-1, 1]) {
    const x = sx * 0.066;
    const pts: Vector3[] = [];
    for (let i = 0; i <= 14; i++) {
      const psi = lerp(0.95, 2.6, i / 14);
      const off = lerp(0.0235, 0.0035, smoothstep(2.0, 2.14, psi));
      pts.push(bpHit(x, 0.3, psi, off));
    }
    b.add(sweep(pts, rrect(0.024, 0.0035, 6, 0.4), { samples: 24, caps: true, ref: (p) => bpNormal(p) }), F.leather);
    const bk = bpHit(x, 0.3, 2.22, 0.008);
    const n = bpNormal(bk);
    const ang = Math.atan2(n.y, n.z);
    b.add(rbox(0.032, 0.024, 0.006, 0.003, 1), F.chrome, mat(bk.x, bk.y, bk.z, -ang));
    b.add(rbox(0.02, 0.012, 0.007, 0.002, 1), F.leather, mat(bk.x, bk.y, bk.z + 0.0015, -ang));
  }

  // front zip pocket
  const pz = bpHit(0, 0.125, Math.PI / 2, 0).z;
  const pocket = v3(0, 0.125, pz - 0.006);
  b.add(blob(0.105, 0.066, 0.028, 0.48, 0.34, 24, 12), body, mat(pocket.x, pocket.y, pocket.z));
  const zp: Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const w = lerp(0.22, Math.PI - 0.22, i / 12);
    const hh = 0.62;
    const ch = spw(Math.cos(hh), 0.48);
    zp.push(v3(-0.105 * ch * spw(Math.cos(w), 0.34), 0.066 * spw(Math.sin(hh), 0.48), 0.028 * ch * spw(Math.sin(w), 0.34) + 0.0012).add(pocket));
  }
  b.add(sweep(zp, circle(0.0026, 5), { samples: 22, caps: true }), zip);
  b.add(rbox(0.012, 0.03, 0.004, 0.002, 1), F.leather, mat(zp[2].x, zp[2].y - 0.016, zp[2].z + 0.003, -0.25));

  // back panel padding and shoulder straps
  const bz = rayBack;
  b.add(blob(0.115, 0.15, 0.012, 0.4, 0.3, 16, 10), dark, mat(0, 0.23, bz(0, 0.23) + 0.006));
  for (const sx of [-1, 1]) {
    const ys = [0.39, 0.34, 0.25, 0.15, 0.075, 0.045];
    const xs = [0.05, 0.062, 0.078, 0.094, 0.108, 0.115];
    const off = [0.004, 0.022, 0.034, 0.032, 0.02, 0.006];
    const pts = ys.map((y, i) => v3(sx * xs[i], y, bz(sx * xs[i], y) - off[i]));
    b.add(sweep(pts, rrect(0.054, 0.014, 10, 0.45), { samples: 22, caps: true, ref: v3(0, 0, -1) }), dark);
  }
  // grab loop
  const topY = bpHit(0, 0.3, 0, 0).y;
  const lc = v3(0, topY - 0.01, -0.035);
  const loop = [[-0.03, -0.004], [-0.022, 0.016], [0, 0.026], [0.022, 0.016], [0.03, -0.004]].map(([x, y]) => lc.clone().add(v3(x, y, 0)));
  b.add(sweep(loop, rrect(0.018, 0.004, 6, 0.4), { samples: 12, caps: true, ref: (p) => p.clone().sub(lc).setZ(0) }), F.leather);
  return b.build();
}

function rayBack(x: number, y: number) {
  const o = v3(x, y, 0);
  const d = v3(0, 0, -1);
  return -rayExit(bpF, o, d, 0.3, 0.003);
}

/* ========================================================================== */
/*  8. Pizza box                                                              */
/* ========================================================================== */

export const PIZZA_BOX = { w: 0.36, h: 0.045, d: 0.36, openAngle: 115 * DEG };

export function buildPizzaBox(open: boolean) {
  const b = new GeoBuilder();
  const { w: S, h: H } = PIZZA_BOX;
  const t = 0.003;
  const kraftIn: Finish = { color: mix(palette.kraft, palette.bone, 0.5), rough: 0.92 };
  const ink: Finish = { color: mix(palette.kraft, palette.pineDark, 0.6), rough: 0.9 };
  // tray
  const card = (w: number, h: number, d: number) => rbox(w, h, d, 0.0012, 1);
  b.add(card(S, t, S), F.kraft, mat(0, t / 2, 0));
  b.add(new BoxGeometry(S - 2 * t, 0.0008, S - 2 * t), kraftIn, mat(0, t + 0.0004, 0));
  const wh = H - t;
  for (const sz of [-1, 1]) b.add(card(S, wh, t), F.kraft, mat(0, wh / 2, sz * (S / 2 - t / 2)));
  for (const sx of [-1, 1]) b.add(card(t, wh, S - 2 * t), F.kraft, mat(sx * (S / 2 - t / 2), wh / 2, 0));

  const angle = open ? PIZZA_BOX.openAngle : 0;
  const lid = new Matrix4().makeTranslation(0, H, -S / 2).multiply(new Matrix4().makeRotationX(-angle));
  const L = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => lid.clone().multiply(mat(x, y, z, rx, ry, rz));
  b.add(card(S + 0.002, t, S + 0.002), F.kraft, L(0, -t / 2, S / 2));
  b.add(new BoxGeometry(S - 0.012, 0.0008, S - 0.012), kraftIn, L(0, -t - 0.0004, S / 2));
  b.add(card(S + 0.002, H - 0.008, t), F.kraft, L(0, -(H - 0.008) / 2, S + 0.0025));

  if (!open) {
    // printed roundel and a couple of lines of type
    const yTop = H + 0.0002;
    b.add(new CylinderGeometry(0.072, 0.072, 0.0006, 40), ink, mat(0, yTop, -0.01));
    b.add(new CylinderGeometry(0.063, 0.063, 0.0008, 40), F.kraft, mat(0, yTop + 0.0001, -0.01));
    b.add(new CylinderGeometry(0.046, 0.046, 0.001, 40), ink, mat(0, yTop + 0.0002, -0.01));
    b.add(new BoxGeometry(0.1, 0.0006, 0.009), ink, mat(0, yTop, 0.09));
    b.add(new BoxGeometry(0.064, 0.0006, 0.006), ink, mat(0, yTop, 0.108));
    b.add(new BoxGeometry(S - 0.02, 0.0006, 0.0018), ink, mat(0, yTop, S / 2 - 0.022));
    return b.build();
  }

  // the pizza, one slice gone (the gap faces +Z)
  const gap = (Math.PI * 2) / 8;
  const a0 = -Math.PI / 2 + gap / 2, a1 = a0 + Math.PI * 2 - gap;
  const sector = (r: number, depth: number, bev: number) => {
    const s = new Shape();
    s.moveTo(0, 0);
    s.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
    s.absarc(0, 0, r, a0, a1, false);
    s.lineTo(0, 0);
    const g = new ExtrudeGeometry(s, { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 32 });
    return g.rotateX(-Math.PI / 2);
  };
  const base = t + 0.0008;
  const sauce: Finish = { color: '#a9452b', rough: 0.55 };
  const cheese: Finish = { color: '#e6c27c', rough: 0.6 };
  const crust: Finish = { color: '#cf9455', rough: 0.85 };
  const pep: Finish = { color: '#8f3625', rough: 0.5 };
  b.add(sector(0.142, 0.004, 0.001), crust, mat(0, base + 0.001, 0));
  b.add(sector(0.136, 0.003, 0.001), sauce, mat(0, base + 0.004, 0));
  b.add(sector(0.124, 0.003, 0.0012), cheese, mat(0, base + 0.0055, 0));
  const ring = new TorusGeometry(0.143, 0.0125, 7, 42, a1 - a0).rotateZ(a0).rotateX(-Math.PI / 2);
  b.add(ring, crust, mat(0, base + 0.009, 0, 0, 0, 0, 1, 0.85, 1));
  for (const a of [a0, a1]) b.add(new SphereGeometry(0.0125, 8, 6), crust, mat(Math.cos(a) * 0.143, base + 0.009, -Math.sin(a) * 0.143, 0, 0, 0, 1, 0.85, 1));
  const r = mulberry32(5);
  const cy = base + 0.011;
  const placed: [number, number][] = [];
  for (let tries = 0; tries < 200 && placed.length < 10; tries++) {
    const rr = 0.02 + Math.sqrt(r()) * 0.088;
    const a = a0 + 0.12 + r() * (a1 - a0 - 0.24);
    const x = Math.cos(a) * rr, z = -Math.sin(a) * rr;
    if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 0.042)) continue;
    placed.push([x, z]);
    b.add(new CylinderGeometry(0.0175, 0.0175, 0.003, 12), pep, mat(x, cy, z, (r() - 0.5) * 0.1, 0, (r() - 0.5) * 0.1));
  }
  for (let i = 0; i < 6; i++) {
    const a = a0 + 0.3 + r() * (a1 - a0 - 0.6), rr = 0.03 + r() * 0.08;
    b.add(new BoxGeometry(0.011, 0.0012, 0.007), { color: '#4b6a35', rough: 0.6 }, mat(Math.cos(a) * rr, cy - 0.0004, -Math.sin(a) * rr, 0, r() * 3, 0));
  }
  // knife cuts between the slices
  for (let k = 1; k < 7; k++) {
    const a = a0 + k * gap;
    b.add(new BoxGeometry(0.122, 0.0008, 0.0016), { color: shade('#e6c27c', 0.72), rough: 0.7 }, mat(Math.cos(a) * 0.062, base + 0.0091, -Math.sin(a) * 0.062, 0, a, 0));
  }
  // a faint grease shadow on the inside of the lid
  const grease = new CylinderGeometry(0.034, 0.034, 0.0004, 11);
  {
    const p = grease.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const k = 1 + 0.22 * Math.sin(Math.atan2(z, x) * 3 + 1.3) + 0.12 * Math.sin(Math.atan2(z, x) * 5);
      p.setX(i, x * k * 1.3);
      p.setZ(i, z * k);
    }
  }
  b.add(grease, { color: mix(kraftIn.color, palette.kraft, 0.55), rough: 0.6 }, L(0.06, -t - 0.001, S * 0.6, 0, 0.5, 0));
  return b.build();
}

/* ========================================================================== */
/*  9. Cable reel                                                             */
/* ========================================================================== */

export const CABLE_REEL = {
  radius: 0.17,
  axleY: 0.2,
  height: 0.445,
  width: 0.24,
  /** Where the reel's own cord leaves it, on the ground in front. */
  outlet: { x: 0, y: 0.0068, z: 0.32 },
  outletDir: { x: 0, y: 0, z: 1 },
  /** The 4-socket face (on +X) and its sockets, for plugging cables in. */
  socketFace: { x: 0.096, y: 0.2, z: 0 },
  socketNormal: { x: 1, y: 0, z: 0 },
  sockets: [45, 135, 225, 315].map((a) => ({
    x: 0.098,
    y: 0.2 + Math.sin(a * DEG) * 0.047,
    z: Math.cos(a * DEG) * 0.047,
  })),
};

export function buildCableReel() {
  const b = new GeoBuilder();
  const { axleY: Y } = CABLE_REEL;
  const flange: Finish = { color: palette.cordDark, rough: 0.5 };
  const cord: Finish = { color: palette.cord, rough: 0.5 };
  const socketDark: Finish = { color: '#3c3d3a', rough: 0.7 };
  const hole: Finish = { color: '#111211', rough: 1 };
  // flanges with rolled rims
  for (const sx of [-1, 1]) {
    const x = sx * 0.069;
    b.add(new CylinderGeometry(0.165, 0.165, 0.01, 40).rotateZ(Math.PI / 2), flange, mat(x, Y, 0));
    b.add(new TorusGeometry(0.165, 0.0072, 5, 40).rotateY(Math.PI / 2), flange, mat(x, Y, 0));
  }
  // molded ribs on the outside of the left flange
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    b.add(new BoxGeometry(0.008, 0.012, 0.1), flange, mat(-0.077, Y + Math.sin(a) * 0.1, Math.cos(a) * 0.1, -a + Math.PI / 2));
  }
  // drum and the wound cord
  b.add(new CylinderGeometry(0.112, 0.112, 0.128, 24, 1, true).rotateZ(Math.PI / 2), cord, mat(0, Y, 0));
  for (let k = 0; k < 9; k++) {
    b.add(new TorusGeometry(0.114, 0.0068, 5, 26).rotateY(Math.PI / 2), cord, mat(-0.0576 + k * 0.0144, Y, 0, k * 0.21, 0, 0));
  }
  // cord paying out at the front and running off along the grass
  const out = CABLE_REEL.outlet;
  const pts = [
    v3(0.02, Y, 0.121),
    v3(0.02, Y - 0.08, 0.124),
    v3(0.016, 0.05, 0.16),
    v3(0.008, 0.012, 0.23),
    v3(out.x, out.y, out.z),
  ];
  b.add(sweep(pts, circle(0.0068, 7), { samples: 20, caps: true }), cord);

  // socket face on +X
  const face = lathe(fillet([[0, 0], [0.084, 0, 0.005], [0.09, 0.008, 0.005], [0.09, 0.016, 0.005], [0.084, 0.022, 0.004], [0, 0.022]], 2), 28);
  b.add(face.rotateZ(-Math.PI / 2), F.bone, mat(0.074, Y, 0));
  for (const s of CABLE_REEL.sockets) {
    b.add(new CylinderGeometry(0.019, 0.019, 0.002, 18).rotateZ(Math.PI / 2), socketDark, mat(0.0962, s.y, s.z));
    b.add(new TorusGeometry(0.0195, 0.0018, 4, 18).rotateY(Math.PI / 2), F.bone, mat(0.0962, s.y, s.z));
    for (const dz of [-0.0095, 0.0095]) b.add(new CylinderGeometry(0.0028, 0.0028, 0.0024, 8).rotateZ(Math.PI / 2), hole, mat(0.0964, s.y, s.z + dz));
  }
  b.add(new CylinderGeometry(0.016, 0.016, 0.006, 16).rotateZ(Math.PI / 2), F.zinc, mat(0.098, Y, 0));
  // winding crank on the left flange
  b.add(rbox(0.008, 0.11, 0.022, 0.004, 1), flange, mat(-0.079, Y + 0.075, 0.0));
  b.add(cylBetween(v3(-0.08, Y + 0.13, 0), v3(-0.115, Y + 0.13, 0), 0.011, 0.012, 10), F.bone);

  // tube frame: a rounded triangle each side, a handle across the top
  const fr: Finish = F.zinc;
  for (const sx of [-1, 1]) {
    const x = sx * 0.106;
    const tri = fillet([[0, 0.009], [0.17, 0.009, 0.03], [0.012, 0.435, 0.04], [-0.012, 0.435, 0.04], [-0.17, 0.009, 0.03], [0, 0.009]], 4);
    const path = tri.map(([z, y]) => v3(x, y, z));
    b.add(sweep(path, circle(0.0085, 7), { samples: 38, caps: true, curve: 'catmullrom', tension: 0 }), fr);
    for (const z of [-0.165, 0.165]) b.add(rbox(0.03, 0.012, 0.04, 0.005, 1), F.rubber, mat(x, 0.006, z));
  }
  b.add(cylBetween(v3(-0.106, 0.437, 0), v3(0.106, 0.437, 0), 0.0085, 0.0085, 8), fr);
  b.add(cylBetween(v3(-0.08, 0.437, 0), v3(0.08, 0.437, 0), 0.016, 0.016, 14), F.rubber);
  for (const sx of [-1, 1]) b.add(sphereAt(v3(sx * 0.08, 0.437, 0), 0.016, 10, 6), F.rubber);
  // axle and its bracket on the left
  b.add(cylBetween(v3(-0.112, Y, 0), v3(0.076, Y, 0), 0.009, 0.009, 10), fr);
  b.add(cylBetween(v3(-0.106, Y, -0.088), v3(-0.106, Y, 0.088), 0.007, 0.007, 8), fr);
  b.add(cylBetween(v3(-0.1, Y, 0), v3(-0.116, Y, 0), 0.018, 0.018, 14), F.rubber);
  return b.build();
}

/* ========================================================================== */
/*  10. Power strip                                                           */
/* ========================================================================== */

export const POWER_STRIP = {
  length: 0.32,
  height: 0.04,
  depth: 0.065,
  /** Socket centres on the top face. */
  sockets: [-0.105, -0.045, 0.015, 0.075].map((x) => ({ x, y: 0.0405, z: 0 })),
  /** End of the strip's own cord stub (-X end). */
  cordOut: { x: -0.19, y: 0.012, z: 0 },
};

export function buildPowerStrip() {
  const b = new GeoBuilder();
  const { length: Lx, height: H, depth: D } = POWER_STRIP;
  const bone: Finish = { color: palette.bone, rough: 0.38 };
  const recess: Finish = { color: '#4b4c49', rough: 0.7 };
  const hole: Finish = { color: '#141514', rough: 1 };
  b.add(rbox(Lx, H, D, 0.014, 3), bone, mat(0, H / 2, 0));
  for (const s of POWER_STRIP.sockets) {
    b.add(new CylinderGeometry(0.0185, 0.0185, 0.002, 20), recess, mat(s.x, H - 0.0006, 0));
    b.add(new TorusGeometry(0.0195, 0.0019, 4, 20), bone, mat(s.x, H + 0.0002, 0, Math.PI / 2, 0, 0));
    for (const dx of [-0.0095, 0.0095]) b.add(new CylinderGeometry(0.0029, 0.0029, 0.0024, 8), hole, mat(s.x + dx, H - 0.0001, 0));
  }
  // orange rocker switch at +X
  b.add(rbox(0.026, 0.004, 0.036, 0.003, 1), recess, mat(0.132, H + 0.0004, 0));
  b.add(rbox(0.019, 0.01, 0.028, 0.0035, 1), { color: palette.cord, rough: 0.35 }, mat(0.132, H + 0.003, 0, 0.2, 0, 0));
  // strain relief and cord stub at -X
  b.add(cylBetween(v3(-Lx / 2 + 0.004, 0.012, 0), v3(-Lx / 2 - 0.018, 0.012, 0), 0.0085, 0.0062, 12), bone);
  b.add(cylBetween(v3(-Lx / 2 - 0.016, 0.012, 0), v3(POWER_STRIP.cordOut.x, 0.012, 0), 0.0055, 0.0055, 10), F.cord);
  return b.build();
}

/* ========================================================================== */
/*  11. Thermos                                                               */
/* ========================================================================== */

export const THERMOS = { r: 0.07, h: 0.287 };

export function buildThermos(color: string) {
  const b = new GeoBuilder();
  const paint: Finish = { color, rough: 0.5, metal: 0.1 };
  const cup: Finish = { color: shade(color, 0.8), rough: 0.42, metal: 0.1 };
  const steel: Finish = { color: '#c4c7c7', rough: 0.28, metal: 0.9 };
  b.add(lathe(fillet([[0, 0], [0.062, 0, 0.006], [0.0698, 0.012, 0.008], [0.066, 0.192, 0.004], [0.06, 0.2], [0, 0.2]], 3), 28), paint);
  b.add(lathe(fillet([[0.0664, 0.18], [0.069, 0.183, 0.002], [0.069, 0.199, 0.002], [0.0664, 0.202]], 2), 28), steel);
  b.add(lathe(fillet([[0, 0.199], [0.067, 0.199], [0.0688, 0.205, 0.003], [0.0675, 0.27, 0.012], [0.058, 0.284, 0.008], [0.02, 0.287], [0, 0.287]], 3), 28), cup);
  // ribbed grip on the cup
  for (let k = 0; k < 3; k++) b.add(new TorusGeometry(0.0682 - k * 0.0002, 0.0016, 4, 28), cup, mat(0, 0.236 + k * 0.007, 0, Math.PI / 2, 0, 0));
  // fold-out handle with its mounting bands
  for (const y of [0.07, 0.172]) b.add(new TorusGeometry(0.0688 - (y - 0.07) * 0.02, 0.0028, 4, 28), steel, mat(0, y, 0, Math.PI / 2, 0, 0));
  const hp = [[0.07, 0.07], [0.087, 0.083], [0.093, 0.122], [0.087, 0.16], [0.069, 0.172]].map(([x, y]) => v3(x, y, 0));
  b.add(sweep(hp, rrect(0.015, 0.0075, 8, 0.45), { samples: 18, caps: true, ref: v3(1, 0, 0) }), paint);
  return b.build();
}

/* ========================================================================== */
/*  12. Laptop                                                                */
/* ========================================================================== */

export const LAPTOP = {
  w: 0.31,
  d: 0.215,
  /** Base thickness. */
  h: 0.014,
  lid: 0.006,
  /** Hinge line (back edge, top of the base). */
  hinge: { y: 0.014, z: -0.1075 },
  /** Lit area on the inside of the lid. */
  screen: { w: 0.27, h: 0.168, offset: 0.111 },
};

/** Lid transform for an opening angle (0 = closed). Lid space: hinge at the origin, +Z toward the free edge, inner face at y = 0 facing -Y. */
export function laptopLidMatrix(openAngle = 1.85) {
  return new Matrix4()
    .makeTranslation(0, LAPTOP.hinge.y, LAPTOP.hinge.z)
    .multiply(new Matrix4().makeRotationX(-openAngle));
}

/** Screen centre, facing normal and up vector (laptop space) for a given opening angle. */
export function laptopScreen(openAngle = 1.85) {
  const m = laptopLidMatrix(openAngle);
  return {
    center: new Vector3(0, -0.0009, LAPTOP.screen.offset).applyMatrix4(m),
    normal: new Vector3(0, -1, 0).transformDirection(m),
    up: new Vector3(0, 0, 1).transformDirection(m),
    w: LAPTOP.screen.w,
    h: LAPTOP.screen.h,
  };
}

export function buildLaptop(openAngle = 1.85) {
  const b = new GeoBuilder();
  const { w: W, d: D, h: H, lid: LT } = LAPTOP;
  const alu: Finish = { color: '#c9ccce', rough: 0.35, metal: 0.6 };
  const aluDark: Finish = { color: '#b2b6b8', rough: 0.32, metal: 0.6 };
  const key: Finish = { color: '#2b2d30', rough: 0.6 };
  const glass: Finish = { color: '#141518', rough: 0.18, metal: 0.1 };
  b.add(rbox(W, H, D, 0.0055, 3), alu, mat(0, H / 2, 0));
  // keys
  const pitch = 0.0198;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 13; c++) {
      if (r === 4 && c >= 4 && c <= 8) continue;
      b.add(new BoxGeometry(0.0168, 0.0012, 0.0158), key, mat((c - 6) * pitch, H + 0.0004, -0.083 + r * pitch));
    }
  }
  b.add(new BoxGeometry(0.0168 + 4 * pitch, 0.0012, 0.0158), key, mat(0, H + 0.0004, -0.083 + 4 * pitch));
  b.add(rbox(0.105, 0.0008, 0.066, 0.004, 1), aluDark, mat(0, H + 0.0001, 0.06));
  b.add(cylBetween(v3(-0.125, H - 0.002, -D / 2 + 0.002), v3(0.125, H - 0.002, -D / 2 + 0.002), 0.0042, 0.0042, 10), aluDark);
  // lid
  const lid = laptopLidMatrix(openAngle);
  const L = (x: number, y: number, z: number) => lid.clone().multiply(mat(x, y, z));
  b.add(rbox(W, LT, D, 0.0028, 2), alu, L(0, LT / 2, D / 2));
  b.add(rbox(W - 0.008, 0.0008, D - 0.008, 0.0035, 1), glass, L(0, -0.0003, D / 2));
  b.add(new CylinderGeometry(0.0016, 0.0016, 0.0004, 8), { color: '#2e3134', rough: 0.3 }, L(0, -0.0008, D - 0.01));
  return b.build();
}

/* ========================================================================== */
/*  13. Blanket                                                               */
/* ========================================================================== */

export const BLANKET = {
  w: 1.6,
  d: 1.3,
  squares: { x: 14, z: 12 },
  /** The +X/+Z corner is folded back over along this line (x, z endpoints). */
  fold: { a: { x: 0.42, z: 0.65 }, b: { x: 0.8, z: 0.27 } },
};

export function buildBlanket(seed = 5) {
  const { w: W, d: D } = BLANKET;
  const NX = BLANKET.squares.x, NZ = BLANKET.squares.z;
  const T = 0.004, R = 0.012;
  const noise = createNoise2D(seed);
  const height = (x: number, z: number) => {
    const lump = smoothstep(-0.3, 0.9, fbm2(noise, x * 1.25 + 4.1, z * 1.25 - 2.7, 3));
    return 0.0012 + T / 2 + 0.014 * lump;
  };
  // fold geometry
  const fa = BLANKET.fold.a, fb = BLANKET.fold.b;
  let lx = fb.x - fa.x, lz = fb.z - fa.z;
  const ll = Math.hypot(lx, lz);
  lx /= ll;
  lz /= ll;
  const nx = -lz, nz = lx; // into the corner
  const arc = Math.PI * R;
  const map = (x: number, z: number, layer: number, out: Vector3) => {
    const qx = x - fa.x, qz = z - fa.z;
    const s = qx * nx + qz * nz;
    if (s <= 0) return out.set(x, height(x, z) + (layer * T) / 2, z);
    const a = qx * lx + qz * lz;
    const fx = fa.x + lx * a, fz = fa.z + lz * a;
    if (s <= arc) {
      const h0 = height(fx, fz);
      const phi = s / R;
      const r = R - (layer * T) / 2;
      const off = r * Math.sin(phi);
      return out.set(fx + nx * off, h0 + R - r * Math.cos(phi), fz + nz * off);
    }
    const back = s - arc;
    const px = fx - nx * back, pz = fz - nz * back;
    const settle = Math.exp(-back / 0.045);
    const mid = height(px, pz) + T + (2 * R - T) * settle + 0.007 * smoothstep(0.13, 0.24, back);
    return out.set(px, mid - (layer * T) / 2, pz);
  };
  const e = 1e-4;
  const A = new Vector3(), B = new Vector3(), C = new Vector3(), Dv = new Vector3();
  const normalAt = (x: number, z: number, layer: number) => {
    map(x, z + e, layer, A);
    map(x, z - e, layer, B);
    map(x + e, z, layer, C);
    map(x - e, z, layer, Dv);
    const n = A.sub(B).cross(C.sub(Dv)).normalize();
    return layer > 0 ? n : n.negate();
  };

  // cuts across the fold so the curl and the settle are resolved
  const cuts = [0];
  for (let k = 1; k <= 10; k++) cuts.push((arc * k) / 10);
  for (const d of [0.008, 0.02, 0.036, 0.056, 0.08, 0.11, 0.15, 0.2]) cuts.push(arc + d);

  type Poly = [number, number][];
  const sOf = (p: [number, number]) => (p[0] - fa.x) * nx + (p[1] - fa.z) * nz;
  const clip = (poly: Poly, c: number, keepAbove: boolean): Poly => {
    const out: Poly = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const sp = sOf(p) - c, sq = sOf(q) - c;
      const pin = keepAbove ? sp >= 0 : sp <= 0;
      const qin = keepAbove ? sq >= 0 : sq <= 0;
      if (pin) out.push(p);
      if (pin !== qin) {
        const t = sp / (sp - sq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    return out;
  };

  const bone = palette.bone, rust = palette.rust;
  const tones = [bone, mix(bone, rust, 0.48), rust];
  const groups = new Map<string, number[][]>(); // colour -> [pos, nor]
  const emit = (color: string, tri: Vector3[], nrm: Vector3[]) => {
    if (!groups.has(color)) groups.set(color, [[], []]);
    const [pos, nor] = groups.get(color)!;
    const g = new Vector3().subVectors(tri[1], tri[0]).cross(new Vector3().subVectors(tri[2], tri[0]));
    const avg = nrm[0].clone().add(nrm[1]).add(nrm[2]);
    const order = g.dot(avg) >= 0 ? [0, 1, 2] : [0, 2, 1];
    for (const k of order) {
      pos.push(tri[k].x, tri[k].y, tri[k].z);
      nor.push(nrm[k].x, nrm[k].y, nrm[k].z);
    }
  };
  const onEdge = (p: [number, number], q: [number, number]) => {
    const ex = 1e-7;
    for (const [i, v] of [[0, W / 2], [0, -W / 2], [1, D / 2], [1, -D / 2]] as [number, number][]) {
      if (Math.abs(p[i] - v) < ex && Math.abs(q[i] - v) < ex) return [i === 0 ? Math.sign(v) : 0, i === 1 ? Math.sign(v) : 0];
    }
    return null;
  };

  const sub = 2;
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const tone = (i % 2 === 0 ? 1 : 0) + (j % 2 === 0 ? 1 : 0);
      const top = tones[tone];
      const under = shade(top, 0.86);
      for (let si = 0; si < sub; si++) {
        for (let sj = 0; sj < sub; sj++) {
          const x0 = -W / 2 + ((i + si / sub) * W) / NX, x1 = -W / 2 + ((i + (si + 1) / sub) * W) / NX;
          const z0 = -D / 2 + ((j + sj / sub) * D) / NZ, z1 = -D / 2 + ((j + (sj + 1) / sub) * D) / NZ;
          const quad: Poly = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
          const pieces: Poly[] = [clip(quad, 0, false)];
          let rest = clip(quad, 0, true);
          for (let k = 1; k < cuts.length && rest.length >= 3; k++) {
            pieces.push(clip(rest, cuts[k], false));
            rest = clip(rest, cuts[k], true);
          }
          pieces.push(rest);
          pieces.forEach((poly, pi) => {
            if (poly.length < 3) return;
            const folded = pi > 0;
            const layers = folded ? [1, -1] : [1];
            for (const layer of layers) {
              const P = poly.map(([x, z]) => map(x, z, layer, new Vector3()));
              const N = poly.map(([x, z]) => normalAt(x, z, layer).clone());
              const col = layer > 0 ? top : under;
              for (let k = 1; k < poly.length - 1; k++) emit(col, [P[0], P[k], P[k + 1]], [N[0], N[k], N[k + 1]]);
            }
            // hem: stitch top to bottom along the outer border
            for (let k = 0; k < poly.length; k++) {
              const p = poly[k], q = poly[(k + 1) % poly.length];
              const o = onEdge(p, q);
              if (!o) continue;
              const pt = map(p[0], p[1], 1, new Vector3()), qt = map(q[0], q[1], 1, new Vector3());
              const pb = map(p[0], p[1], -1, new Vector3()), qb = map(q[0], q[1], -1, new Vector3());
              if (!folded) {
                pb.y = Math.min(pb.y, 0.0005);
                qb.y = Math.min(qb.y, 0.0005);
              }
              const mid = p.map((v, ii) => (v + q[ii]) / 2) as [number, number];
              const a0 = map(mid[0], mid[1], 0, new Vector3());
              const a1 = map(mid[0] + o[0] * 1e-3, mid[1] + o[1] * 1e-3, 0, new Vector3());
              const out = a1.sub(a0).normalize();
              const nn = [out, out, out];
              emit(shade(top, 0.8), [pt, qt, qb], nn);
              emit(shade(top, 0.8), [pt, qb, pb], nn);
            }
          });
        }
      }
    }
  }

  const b = new GeoBuilder();
  for (const [color, [pos, nor]] of groups) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    b.add(g, { color, rough: 0.95, fabric: 0.8 });
  }
  return b.build();
}

/* ========================================================================== */
/*  14. Book                                                                  */
/* ========================================================================== */

export const BOOK = {
  /** Closed: cover width (X), height (Z) and thickness. */
  w: 0.13,
  h: 0.2,
  t: 0.02,
  /** Open and tented face-down: half-angle of each cover from the ground, and the spine height. */
  tent: 0.3,
  spineY: 0.13 * Math.sin(0.3) + 0.0084 * Math.cos(0.3) + 0.0016,
};

export function buildBook(open: boolean, color: string = palette.slate) {
  const b = new GeoBuilder();
  const { w: W, h: Hh, t: T } = BOOK;
  const ct = 0.0016;
  const cover: Finish = { color, rough: 0.68 };
  const pages: Finish = { color: '#efe8d5', rough: 0.92 };
  const band: Finish = { color: mix(color, palette.bone, 0.5), rough: 0.66 };
  if (!open) {
    b.box(W, ct, Hh, cover, mat(0, ct / 2, 0), 0.0007);
    b.box(W - 0.004, T - 2 * ct, Hh - 0.005, pages, mat(0.001, T / 2, 0), 0.0012);
    b.box(W, ct, Hh, cover, mat(0, T - ct / 2, 0), 0.0007);
    b.box(0.006, T, Hh, cover, mat(-W / 2 + 0.003, T / 2, 0), 0.0026);
    b.box(0.088, 0.0004, 0.03, band, mat(0.006, T + 0.0001, -0.045));
    b.box(0.05, 0.0004, 0.006, band, mat(0.006, T + 0.0001, -0.01));
    return b.build();
  }
  const a = BOOK.tent;
  const pt = (T - 2 * ct) / 2;
  const Hs = BOOK.spineY;
  for (const sx of [-1, 1]) {
    const m = new Matrix4().makeTranslation(0, Hs, 0).multiply(new Matrix4().makeRotationZ(-sx * a));
    const at = (x: number, y: number, z: number) => m.clone().multiply(mat(sx * x, y, z));
    b.box(W, ct, Hh, cover, at(W / 2, -ct / 2, 0), 0.0007);
    b.box(W - 0.006, pt, Hh - 0.005, pages, at(W / 2 - 0.001, -ct - pt / 2 + 0.0004, 0), 0.0012);
    if (sx > 0) b.box(0.07, 0.0004, 0.022, band, at(W * 0.55, 0.0001, 0.05));
  }
  b.add(cylBetween(v3(0, Hs - 0.004, -Hh / 2), v3(0, Hs - 0.004, Hh / 2), 0.0055, 0.0055, 12), cover);
  return b.build();
}

/* ========================================================================== */

/** Rough bounding sizes (w × h × d, metres) for layout. */
export const CAMP_PROP_DIMENSIONS = {
  beanbag: { w: BEANBAG.width, h: 0.62, d: BEANBAG.depth },
  parasol: { w: PARASOL.radius * 2, h: PARASOL.height, d: PARASOL.radius * 2 },
  campChair: { w: CAMP_CHAIR.width, h: CAMP_CHAIR.height, d: CAMP_CHAIR.depth },
  crate: { w: CRATE.w, h: CRATE.h, d: CRATE.d },
  cooler: { w: COOLER.w, h: COOLER.handleY, d: COOLER.d },
  bike: { w: BIKE.halfWidth * 2, h: BIKE.height, d: BIKE.length },
  backpack: { w: BACKPACK.w, h: BACKPACK.h, d: BACKPACK.d },
  pizzaBox: { w: PIZZA_BOX.w, h: PIZZA_BOX.h, d: PIZZA_BOX.d },
  cableReel: { w: CABLE_REEL.width, h: CABLE_REEL.height, d: 0.36 },
  powerStrip: { w: POWER_STRIP.length, h: POWER_STRIP.height, d: POWER_STRIP.depth },
  thermos: { w: 0.16, h: THERMOS.h, d: 0.14 },
  laptop: { w: LAPTOP.w, h: 0.22, d: LAPTOP.d },
  blanket: { w: BLANKET.w, h: 0.03, d: BLANKET.d },
  book: { w: BOOK.w, h: BOOK.t, d: BOOK.h },
};
