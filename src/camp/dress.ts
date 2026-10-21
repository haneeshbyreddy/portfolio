import { BufferGeometry, InstancedMesh, Matrix4, Mesh, Object3D } from 'three';
import { GeoBuilder, mat } from '../office/builder';
import type { Desk } from '../office/Office';
import { spotMatrix, type Spot } from '../office/layout';
import { LAP, type Sitter } from '../office/Workers';
import { palette } from '../world/palette';
import { terrainHeight } from '../world/Terrain';
import type { GroundMarks } from './Ground';
import { PLAN } from './plan';
import {
  BIKE,
  buildBackpack,
  buildBeanbag,
  buildBike,
  buildBlanket,
  buildBook,
  buildCableReel,
  buildCampChair,
  buildCooler,
  buildCrate,
  buildLaptop,
  buildParasol,
  buildPizzaBox,
  buildPowerStrip,
  buildThermos,
  CRATE_HEIGHT,
} from './props';

const at = (s: Spot, y = 0) => spotMatrix(s.x, s.z, s.turn, y + terrainHeight(s.x, s.z));

/** A paperback held open in two hands, spine vertical, pages toward the reader (−Z). */
function heldBook() {
  const b = new GeoBuilder();
  const cover = { color: palette.rust, rough: 0.7 };
  const page = { color: '#f2eee2', rough: 0.9 };
  for (const side of [1, -1]) {
    const m = mat(0, 0, 0, 0, side * 0.32, 0);
    b.box(0.115, 0.18, 0.004, cover, m.clone().multiply(mat(side * 0.058, 0, 0.002)));
    b.box(0.108, 0.172, 0.012, page, m.clone().multiply(mat(side * 0.056, 0, -0.006)), 0.002);
  }
  return b.build();
}

/** A phone held in both hands, screen toward the holder (−Z). */
function heldPhone() {
  const b = new GeoBuilder();
  b.box(0.072, 0.15, 0.009, { color: '#1c1e1f', rough: 0.3, metal: 0.3 }, mat(0, 0, 0), 0.01);
  b.box(0.066, 0.14, 0.001, { color: '#2c3438', rough: 0.15 }, mat(0, 0, -0.0048), 0.005);
  return b.build();
}

/**
 * Sets the scene around the desks from `PLAN`: the lounge under the parasol,
 * the beanbags, the bikes, bags, crates, lunch, and the reel and strips the
 * cord feeds. Every kind of thing is one instanced draw call.
 */
export function dress(root: Object3D, desks: Desk[], sitters: Sitter[], material: Mesh['material'], shadows: boolean) {
  const lots = new Map<string, { geo: () => BufferGeometry; at: Matrix4[]; cast: boolean }>();
  const put = (key: string, geo: () => BufferGeometry, m: Matrix4, cast = true) => {
    let lot = lots.get(key);
    if (!lot) lots.set(key, (lot = { geo, at: [], cast }));
    lot.at.push(m);
  };

  // the power: a reel in the middle, strips where the leads split
  put('reel', buildCableReel, at(PLAN.reel));
  for (const s of PLAN.strips) put('strip', buildPowerStrip, at(s), false);

  // the lounge
  put('parasol', buildParasol, at(PLAN.parasol));
  for (const s of PLAN.campChairs) put('campChair', () => buildCampChair(palette.olive), at(s));
  put('cooler', buildCooler, at(PLAN.cooler));
  put('blanket', buildBlanket, at(PLAN.blanket, 0.004), false);
  // lunch on the blanket, a book face down
  put('pizza', () => buildPizzaBox(true), at(PLAN.blanket).multiply(mat(0.42, 0.006, -0.25, 0, 0.5, 0)));
  put('book', () => buildBook(true), at(PLAN.blanket).multiply(mat(-0.45, 0.006, 0.3, 0, 2.2, 0)));

  for (const b of PLAN.beanbags) put(`beanbag-${b.color}`, () => buildBeanbag(palette[b.color]), at(b));
  PLAN.crates.forEach((c) => put('crate', buildCrate, at(c)));
  for (const b of PLAN.backpacks) put(`backpack-${b.color}`, () => buildBackpack(palette[b.color]), at(b));

  for (const b of PLAN.bikes) {
    const frame = palette[b.color];
    // a bike on its side lies on its pedal and handlebar, tipped right over
    const m = b.lying ? at(b).multiply(mat(0, BIKE.halfWidth * 0.9, 0, 0, 0, Math.PI / 2 - 0.08)) : at(b).multiply(mat(0, 0, 0, 0, 0, -BIKE.standLean));
    put(`bike-${b.color}`, () => buildBike(frame), m);
  }

  // small things set down on desks and crates
  const small = (item: string, m: Matrix4) => {
    if (item === 'pizza') put('pizza', () => buildPizzaBox(true), m);
    else if (item === 'pizzaShut') put('pizzaShut', () => buildPizzaBox(false), m);
    else if (item === 'thermos') put('thermos', () => buildThermos(palette.slate), m);
    else if (item === 'laptop') put('laptopShut', () => buildLaptop(0), m);
    else if (item === 'book') put('bookShut', () => buildBook(false), m);
  };
  for (const d of PLAN.onDesks) {
    const desk = desks[d.desk];
    if (desk) small(d.item, desk.matrix.clone().multiply(mat(d.at[0], d.at[1], d.at[2], 0, d.turn, 0)));
  }
  PLAN.onCrates.forEach((c, i) => {
    const crate = PLAN.crates[c.crate];
    const spread = (i % 2 ? -1 : 1) * 0.1;
    small(c.item, at(crate, CRATE_HEIGHT).multiply(mat(spread, 0, 0.02, 0, c.turn, 0)));
  });

  // laptops open on the laps of whoever is working off a beanbag
  for (const [i, b] of PLAN.beanbags.entries()) {
    if (i !== 2) continue;
    const lap = LAP.beanbag.laptop;
    // on the thighs: tipped up toward the knees, screen toward the face
    put('laptopOpen', () => buildLaptop(1.75), at(b).multiply(mat(lap.x, lap.y - 0.025, lap.z, -0.45, Math.PI, 0)));
  }

  // what the people off duty have in their hands, tipped up toward their faces
  for (const s of sitters) {
    const posture = s.posture ?? 'desk';
    if (s.pastime === 'book') put('heldBook', heldBook, s.seat.matrix.clone().multiply(mat(LAP[posture].book.x, LAP[posture].book.y, LAP[posture].book.z + 0.02, -0.75, 0, 0)));
    if (s.pastime === 'phone') put('heldPhone', heldPhone, s.seat.matrix.clone().multiply(mat(LAP[posture].phone.x, LAP[posture].phone.y + 0.02, LAP[posture].phone.z + 0.01, -0.85, 0, 0)), false);
  }

  for (const [key, lot] of lots) {
    const mesh = new InstancedMesh(lot.geo(), material, lot.at.length);
    lot.at.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = shadows && lot.cast;
    mesh.receiveShadow = shadows;
    mesh.computeBoundingSphere();
    mesh.name = `camp-${key}`;
    root.add(mesh);
  }
}

/** Shade and flattened grass under the set dressing, and no grass at all under what lies on it. */
export function markDressing(marks: GroundMarks) {
  marks.cover(at(PLAN.blanket), (ctx) => ctx.fillRect(-0.8, -0.65, 1.6, 1.3));
  for (const s of PLAN.beanbags) {
    marks.cover(at(s), (ctx) => {
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.42, 0.46, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  marks.cover(at(PLAN.cooler), (ctx) => ctx.fillRect(-0.3, -0.19, 0.6, 0.38));
  for (const s of PLAN.crates) marks.cover(at(s), (ctx) => ctx.fillRect(-0.22, -0.16, 0.44, 0.32));
  for (const s of PLAN.strips) marks.cover(at(s), (ctx) => ctx.fillRect(-0.18, -0.05, 0.36, 0.1));
  for (const s of PLAN.backpacks) marks.cover(at(s), (ctx) => ctx.fillRect(-0.13, -0.08, 0.26, 0.16));
  marks.cover(at(PLAN.reel), (ctx) => ctx.fillRect(-0.15, -0.2, 0.3, 0.4));
  for (const s of PLAN.campChairs) {
    marks.shadow(at(s), 0.4, 0.3, (ctx) => ctx.fillRect(-0.3, -0.3, 0.6, 0.6));
    marks.tread(at(s), 0.85, 0.35, (ctx) => {
      ctx.beginPath();
      ctx.ellipse(0, 0.25, 0.55, 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  marks.shadow(at(PLAN.cooler), 0.5, 0.2, (ctx) => ctx.fillRect(-0.3, -0.19, 0.6, 0.38));
  for (const s of PLAN.crates) marks.shadow(at(s), 0.5, 0.18, (ctx) => ctx.fillRect(-0.23, -0.17, 0.46, 0.34));
  for (const s of PLAN.beanbags) {
    marks.shadow(at(s), 0.45, 0.35, (ctx) => {
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.45, 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  for (const s of PLAN.backpacks) marks.shadow(at(s), 0.4, 0.15, (ctx) => ctx.fillRect(-0.15, -0.09, 0.3, 0.18));
  for (const s of PLAN.bikes) {
    if (s.lying) marks.shadow(at(s), 0.35, 0.25, (ctx) => ctx.fillRect(-0.1, -0.6, 0.2, 1.2));
    else marks.shadow(at(s), 0.3, 0.2, (ctx) => ctx.fillRect(-0.04, -0.55, 0.08, 1.1));
  }
  marks.shadow(at(PLAN.reel), 0.45, 0.25, (ctx) => {
    ctx.beginPath();
    ctx.arc(0, 0, 0.2, 0, Math.PI * 2);
    ctx.fill();
  });
}

