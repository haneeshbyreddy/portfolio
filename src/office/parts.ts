import { CylinderGeometry, ConeGeometry, PlaneGeometry } from 'three';
import { GeoBuilder, frustumBox, mat, type Finish } from './builder';
import { ARM, PARTITION_H } from './layout';
import { palette } from '../world/palette';

const F = {
  desk: { color: palette.deskWhite, rough: 0.42 } as Finish,
  deskShade: { color: palette.deskShade, rough: 0.5 } as Finish,
  groove: { color: '#bdbab2', rough: 0.7 } as Finish,
  handle: { color: '#a4a5a1', rough: 0.3, metal: 0.7 } as Finish,
  crt: { color: palette.crt, rough: 0.5 } as Finish,
  crtShade: { color: '#cdc5b3', rough: 0.55 } as Finish,
  crtDark: { color: palette.crtDark, rough: 0.6 } as Finish,
  key: { color: palette.keyCap, rough: 0.55 } as Finish,
  keyDark: { color: palette.keyDark, rough: 0.6 } as Finish,
  pad: { color: '#2a302c', rough: 0.95, fabric: 0.6 } as Finish,
  partition: { color: palette.partition, rough: 0.95, fabric: 1 } as Finish,
  alu: { color: palette.aluminium, rough: 0.32, metal: 0.75 } as Finish,
  chairFabric: { color: palette.chairFabric, rough: 0.95, fabric: 1 } as Finish,
  chairBase: { color: palette.chairBase, rough: 0.45 } as Finish,
  chrome: { color: palette.chrome, rough: 0.22, metal: 0.95 } as Finish,
};

/**
 * Screen geometry/placement in station space. The CRT faces the worker (-Z).
 */
export const SCREEN = {
  width: 0.345,
  height: 0.259,
  center: { x: 0.04, y: 1.015, z: 0.676 },
};

export const KEYBOARD = { x: 0, y: 0.768, z: 0.47 };
export const MOUSE = { x: -0.36, y: 0.756, z: 0.5 };
export const MUG = { x: 0.34, y: 0.74, z: 0.5 };

/** Desk + CRT + keyboard + mouse, merged. Station space: chair at origin, +Z toward the monitor. */
export function buildStationGeometry() {
  const b = new GeoBuilder();

  // desk
  b.box(1.5, 0.035, 0.75, F.desk, mat(0.13, 0.7225, 0.695), 0.008);
  b.box(0.4, 0.7, 0.68, F.deskShade, mat(0.67, 0.35, 0.7), 0.01);
  for (const y of [0.235, 0.47]) b.box(0.38, 0.005, 0.004, F.groove, mat(0.67, y, 0.359));
  for (const y of [0.13, 0.36, 0.6]) b.box(0.12, 0.012, 0.014, F.handle, mat(0.67, y, 0.354), 0.004);
  b.box(0.035, 0.705, 0.68, F.deskShade, mat(-0.6, 0.3525, 0.7), 0.006);
  b.box(1.06, 0.42, 0.02, F.deskShade, mat(-0.07, 0.49, 1.02));

  // CRT terminal (cream, deep back — the Severance machine)
  b.box(0.25, 0.025, 0.23, F.crtShade, mat(0.04, 0.7525, 0.86), 0.008);
  b.cyl(0.05, 0.065, 0.05, F.crtShade, mat(0.04, 0.79, 0.86));
  b.box(0.44, 0.37, 0.09, F.crt, mat(0.04, 1.005, 0.73), 0.024);
  b.add(frustumBox(0.42, 0.34, 0.3, 0.62), F.crtShade, mat(0.04, 1.0, 0.92));
  b.box(0.37, 0.285, 0.012, F.crtDark, mat(SCREEN.center.x, SCREEN.center.y, 0.682), 0.01);
  b.box(0.05, 0.012, 0.004, F.crtShade, mat(0.04, 0.845, 0.684));
  b.box(0.026, 0.012, 0.006, F.keyDark, mat(0.175, 0.845, 0.684), 0.003);
  // vents on the back
  for (let i = 0; i < 5; i++) b.box(0.18, 0.006, 0.004, F.crtDark, mat(0.04, 0.96 + i * 0.022, 1.071));

  // keyboard
  b.box(0.44, 0.022, 0.16, F.crt, mat(KEYBOARD.x, 0.752, KEYBOARD.z), 0.007);
  const cols = 13;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -0.18 + c * 0.03 + (r % 2) * 0.008;
      const z = 0.425 + r * 0.03;
      const dark = c === 0 || c === cols - 1;
      if (r === 0 && c > 3 && c < 9) continue; // space bar row
      b.box(0.025, 0.012, 0.024, dark ? F.keyDark : F.key, mat(x, KEYBOARD.y, z), 0.004);
    }
  }
  b.box(0.15, 0.012, 0.024, F.key, mat(0.0, KEYBOARD.y, 0.425), 0.004);

  // mouse + pad
  b.box(0.22, 0.003, 0.19, F.pad, mat(MOUSE.x, 0.7415, MOUSE.z));
  b.box(0.058, 0.03, 0.1, F.crt, mat(MOUSE.x, MOUSE.y, MOUSE.z), 0.014);

  return b.build();
}

/** The cross of dark fabric partitions with aluminium caps. Pod space. */
export function buildPartitionGeometry() {
  const b = new GeoBuilder();
  const H = PARTITION_H;
  const y0 = 0.035;
  const h = H - y0;
  const L = ARM * 2;
  b.box(L, h, 0.05, F.partition, mat(0, y0 + h / 2, 0), 0.012);
  b.box(0.05, h, L, F.partition, mat(0, y0 + h / 2, 0), 0.012);
  b.box(L + 0.02, 0.018, 0.064, F.alu, mat(0, H + 0.009, 0), 0.006);
  b.box(0.064, 0.018, L + 0.02, F.alu, mat(0, H + 0.009, 0), 0.006);
  b.box(0.078, H + 0.024, 0.078, F.alu, mat(0, (H + 0.024) / 2, 0), 0.01);
  for (const [x, z] of [[ARM, 0], [-ARM, 0], [0, ARM], [0, -ARM]]) {
    b.box(0.064, H + 0.012, 0.064, F.alu, mat(x, (H + 0.012) / 2, z), 0.01);
    b.box(0.09, 0.03, 0.34, F.chairBase, mat(x, 0.015, z, 0, x !== 0 ? 0 : Math.PI / 2, 0), 0.008);
  }
  return b.build();
}

/** Task chair. Chair space: floor under the seat, facing +Z. */
export function buildChairGeometry() {
  const b = new GeoBuilder();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.box(0.032, 0.026, 0.29, F.chairBase, mat(Math.sin(a) * 0.145, 0.075, Math.cos(a) * 0.145, 0, a, 0), 0.008);
    b.sphere(0.027, F.chairBase, mat(Math.sin(a) * 0.29, 0.028, Math.cos(a) * 0.29));
  }
  b.cyl(0.045, 0.05, 0.05, F.chairBase, mat(0, 0.08, 0));
  b.cyl(0.022, 0.022, 0.32, F.chrome, mat(0, 0.25, 0));
  b.box(0.2, 0.04, 0.2, F.chairBase, mat(0, 0.405, 0), 0.01);
  b.box(0.48, 0.075, 0.46, F.chairFabric, mat(0, 0.455, 0), 0.032);
  b.box(0.05, 0.34, 0.026, F.chairBase, mat(0, 0.56, -0.225, -0.12, 0, 0), 0.008);
  b.box(0.45, 0.46, 0.065, F.chairFabric, mat(0, 0.86, -0.27, -0.12, 0, 0), 0.03);
  return b.build();
}

export function buildMugGeometry() {
  const b = new GeoBuilder();
  const f = { color: '#ffffff', rough: 0.35 };
  b.cyl(0.037, 0.034, 0.095, f, mat(0, 0.0475, 0), 20);
  b.cyl(0.031, 0.031, 0.004, { color: '#3b2a20', rough: 0.2 }, mat(0, 0.088, 0), 16);
  b.torus(0.026, 0.0075, f, mat(-0.04, 0.05, 0, 0, 0, Math.PI / 2), Math.PI * 2);
  return b.build();
}

export function buildPlantGeometry() {
  const b = new GeoBuilder();
  b.cyl(0.06, 0.048, 0.11, { color: '#b9653f', rough: 0.85 }, mat(0, 0.055, 0), 18);
  b.cyl(0.054, 0.054, 0.006, { color: '#3a2a1e', rough: 1 }, mat(0, 0.105, 0), 18);
  const leaf = { color: '#4f7a3a', rough: 0.7 };
  const leafDark = { color: '#3c6230', rough: 0.7 };
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + i * 0.4;
    const tilt = 0.35 + (i % 3) * 0.18;
    b.add(new ConeGeometry(0.018, 0.2 + (i % 4) * 0.04, 5), i % 2 ? leaf : leafDark,
      mat(Math.sin(a) * 0.03, 0.2, Math.cos(a) * 0.03, Math.cos(a) * tilt, 0, -Math.sin(a) * tilt));
  }
  return b.build();
}

export function buildPapersGeometry() {
  const b = new GeoBuilder();
  b.box(0.215, 0.012, 0.3, { color: '#f4f2ec', rough: 0.85 }, mat(0, 0.006, 0));
  b.box(0.21, 0.002, 0.297, { color: '#ffffff', rough: 0.85 }, mat(0.01, 0.013, 0.006, 0, 0.08, 0));
  return b.build();
}

export function buildBooksGeometry() {
  const b = new GeoBuilder();
  const colors = ['#2f3d35', '#c9b48a', '#8a3b2a', '#e3ded2', '#3c4a63'];
  let y = 0;
  for (let i = 0; i < 4; i++) {
    const h = 0.025 + (i % 2) * 0.012;
    b.box(0.17 - i * 0.008, h, 0.24 - (i % 3) * 0.012, { color: colors[i], rough: 0.8 }, mat(0, y + h / 2, 0, 0, (i - 1.5) * 0.06, 0), 0.003);
    y += h;
  }
  return b.build();
}

/** Curved CRT face. Faces -Z in station space after placement. */
export function buildScreenGeometry() {
  const g = new PlaneGeometry(SCREEN.width, SCREEN.height, 16, 12);
  const p = g.attributes.position;
  const hw = SCREEN.width / 2, hh = SCREEN.height / 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / hw, y = p.getY(i) / hh;
    p.setZ(i, (1 - x * x) * (1 - y * y) * 0.009);
  }
  g.computeVertexNormals();
  g.rotateY(Math.PI);
  g.translate(SCREEN.center.x, SCREEN.center.y, SCREEN.center.z);
  return g;
}

/** Small power LED on the bezel. */
export const LED = { x: 0.215, y: 0.845, z: 0.6835 };
export const ledGeometry = () => new CylinderGeometry(0.0045, 0.0045, 0.004, 10).rotateX(Math.PI / 2);
