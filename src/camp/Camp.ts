import { CatmullRomCurve3, Mesh, Object3D, TubeGeometry, Vector3 } from 'three';
import { createNoise2D } from '../core/math';
import { GeoBuilder, type Finish } from '../office/builder';
import type { Desk } from '../office/Office';
import type { Seat, Sitter } from '../office/Workers';
import { spotMatrix, type Spot } from '../office/layout';
import { palette } from '../world/palette';
import { terrainHeight } from '../world/Terrain';
import type { GroundMarks } from './Ground';
import { Butterflies } from './Butterflies';
import { Dogs } from './Dogs';
import { dress, markDressing } from './dress';
import { Kite } from './Kite';
import { CABLE_REEL, POWER_STRIP } from './props';
import { PLAN } from './plan';

const wobble = createNoise2D(404);

const F = {
  cord: { color: palette.cord, rough: 0.55 } as Finish,
  lead: { color: palette.cordDark, rough: 0.6 } as Finish,
};

const at = (s: Spot, y = 0) => spotMatrix(s.x, s.z, s.turn, y);

/** Where a desk's lead comes up behind it, in station space: along the ground, then up the back panel. */
const LEAD_FOOT = new Vector3(0.05, 0, 1.16);
const LEAD_TOP = new Vector3(0.05, 0.7, 1.05);

/**
 * A cable lying in the grass through `points` (world XZ): it never runs
 * straight, it settles in slack curves where it was dropped. `rise` carries
 * it on up off the ground at the end (up the back of a desk).
 */
function cable(points: [number, number][], radius: number, seed: number, rise: Vector3[] = []) {
  const guide = new CatmullRomCurve3(points.map(([x, z]) => new Vector3(x, 0, z)), false, 'centripetal');
  const length = guide.getLength();
  const n = Math.max(8, Math.ceil(length * 5));
  const pts: Vector3[] = [];
  const tangent = new Vector3();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = guide.getPointAt(u);
    guide.getTangentAt(u, tangent);
    // slack: a slow sideways meander, pinned at both ends
    const pin = Math.min(1, u * length * 1.5, (1 - u) * length * 1.5);
    const off = wobble(u * length * 0.32, seed) * 0.32 * pin;
    p.x += -tangent.z * off;
    p.z += tangent.x * off;
    p.y = terrainHeight(p.x, p.z) + radius * 0.9;
    pts.push(p);
  }
  pts.push(...rise);
  const curve = new CatmullRomCurve3(pts, false, 'centripetal');
  return new TubeGeometry(curve, Math.ceil(pts.length * 2.2), radius, 5, false);
}

/**
 * The camp around the desks: the cord that powers the field, and the set
 * dressing from `PLAN`.
 */
export class Camp {
  readonly root = new Object3D();
  /** The studio off duty: people settled in around the camp, posed by `Workers`. */
  readonly sitters: Sitter[] = [];
  private kite: Kite | null = null;
  private butterflies: Butterflies;
  private dogs: Dogs;

  constructor(parent: Object3D, private desks: Desk[], shadows: boolean, material: Mesh['material']) {
    this.root.name = 'camp';
    parent.add(this.root);

    const b = new GeoBuilder();
    const reelM = at(PLAN.reel);
    const ground = (v: Vector3): [number, number] => [v.x, v.z];
    // the feed: in along the path from behind the camera, into the back of the reel
    const reelIn = new Vector3(CABLE_REEL.outlet.x, 0, CABLE_REEL.outlet.z + 0.05).applyMatrix4(reelM);
    b.add(cable([...PLAN.wayIn.slice(0, -1), ground(reelIn)], 0.0115, 1, [new Vector3(CABLE_REEL.outlet.x, CABLE_REEL.outlet.y + 0.01, CABLE_REEL.outlet.z).applyMatrix4(reelM)]), F.cord);
    // reel sockets → strips, each plug pushed into the socket face
    const socket = (i: number) => {
      const p = CABLE_REEL.sockets[i % CABLE_REEL.sockets.length];
      return new Vector3(p.x, p.y, p.z);
    };
    PLAN.strips.forEach((s, i) => {
      const strip = at(s);
      const into = socket(i).applyMatrix4(reelM);
      const out = socket(i).add(new Vector3(0.14, -0.1, 0)).applyMatrix4(reelM);
      const start = new Vector3(POWER_STRIP.cordOut.x - 0.06, 0, POWER_STRIP.cordOut.z).applyMatrix4(strip);
      const lip = new Vector3(POWER_STRIP.cordOut.x, POWER_STRIP.cordOut.y, POWER_STRIP.cordOut.z).applyMatrix4(strip);
      const mid: [number, number] = [(out.x + start.x) / 2 + (i - 1) * 0.6, (out.z + start.z) / 2 + 0.5];
      // laid from the strip back to the reel, so the cable climbs into the socket at the end
      b.add(cable([[lip.x, lip.z], ground(start), mid, ground(out)], 0.0105, 10 + i, [out.clone().setY(0.09), into]), F.cord);
    });
    // each desk's own lead, from a strip or straight from the reel
    PLAN.leads.forEach(({ from, desk }, i) => {
      const d = this.desks[desk];
      if (!d) return;
      const src = from < 0 ? PLAN.reel : PLAN.strips[from];
      const foot = LEAD_FOOT.clone().applyMatrix4(d.matrix);
      const behind = new Vector3(0.05, 0, 1.6).applyMatrix4(d.matrix);
      const top = LEAD_TOP.clone().applyMatrix4(d.matrix);
      const up = new Vector3(LEAD_FOOT.x, 0.12, LEAD_FOOT.z).applyMatrix4(d.matrix);
      const mid: [number, number] = [(src.x + behind.x) / 2 + Math.sin(i * 2.1) * 0.5, (src.z + behind.z) / 2 + Math.cos(i * 1.7) * 0.4];
      b.add(
        cable([[src.x, src.z], mid, [behind.x, behind.z], [foot.x, foot.z]], from < 0 ? 0.0105 : 0.0075, 20 + i, [up, top]),
        from < 0 ? F.cord : F.lead,
      );
    });
    const cords = new Mesh(b.build(), material);
    cords.name = 'cords';
    cords.receiveShadow = shadows;
    this.root.add(cords);

    this.seatPeople();
    dress(this.root, desks, this.sitters, material, shadows);
    this.butterflies = new Butterflies(this.root, PLAN.butterflies.map(([x, z]) => new Vector3(x, 0, z)));
    this.dogs = new Dogs(this.root, PLAN.dogs.map((d, i) => ({ matrix: at(d), pose: d.pose, coat: d.coat, seed: 31 + i * 17 })), shadows);
  }

  /**
   * Who's around, and how they've made themselves comfortable: two under the
   * parasol talking over a book, one sunk in a beanbag on their phone, one in
   * the next flying a kite, one cross-legged on the blanket, and one who
   * dragged a beanbag out front and works best on a laptop on their knees.
   */
  private seatPeople() {
    const seat = (s: Spot): Seat => ({ matrix: at(s), chair: { x: 0, z: 0, yaw: 0 }, hasMug: false, mugOverride: null });
    const head = (s: Spot) => new Vector3(0, 1.0, 0).applyMatrix4(at(s));
    const [a, b] = PLAN.campChairs;
    this.sitters.push(
      { seat: seat(a), seed: 'lounge-a', posture: 'campchair', pastime: 'book', company: head(b) },
      { seat: seat(b), seed: 'lounge-b', posture: 'campchair', pastime: 'talk', company: head(a) },
      { seat: seat(PLAN.beanbags[0]), seed: 'beanbag-a', posture: 'beanbag', pastime: 'phone' },
      { seat: seat(PLAN.beanbags[1]), seed: 'beanbag-b', posture: 'beanbag', pastime: 'kite' },
      { seat: seat(PLAN.beanbags[2]), seed: 'nook', posture: 'beanbag', pastime: 'laptop' },
      { seat: seat({ ...PLAN.blanket, turn: PLAN.blanket.turn + 2.6 }), seed: 'blanket', posture: 'ground', pastime: 'book' },
    );
  }

  /** What the camp leaves on the ground: the paths, and the grass pressed flat where things stand and people sit. */
  mark(marks: GroundMarks) {
    markDressing(marks);

    // the whole camp stands on one floor mown out of the meadow: round everything
    // that was carried out, with room to walk, and in from the path
    const spot = (s: { x: number; z: number }, r: number) => ({ x: s.x, z: s.z, r });
    marks.mowAround(
      [
        ...this.desks.map((d) => {
          const c = new Vector3(0.13, 0, 0.29).applyMatrix4(d.matrix);
          return { x: c.x, z: c.z, r: 1.7 };
        }),
        spot(PLAN.parasol, 2.1),
        spot(PLAN.blanket, 1.6),
        spot(PLAN.cooler, 1.0),
        ...PLAN.campChairs.map((s) => spot(s, 1.2)),
        ...PLAN.beanbags.map((s) => spot(s, 1.45)),
        ...PLAN.crates.map((s) => spot(s, 0.9)),
        ...PLAN.bikes.map((s) => spot(s, 1.2)),
        ...PLAN.dogs.map((s) => spot(s, 1.1)),
        ...PLAN.backpacks.map((s) => spot(s, 0.8)),
        spot(PLAN.reel, 1.0),
      ],
      1.3,
    );
    // the way in from the farm, along the cord, mown to a footpath's width
    marks.mowPath(PLAN.wayIn, 1.15, 0.35);
    // and the wear down the middle of it, where every walk in and out has gone
    marks.path(PLAN.wayIn, 0.9, 0.45);

    // lounge: a big soft shade under the parasol, flattened grass round the chairs and blanket
    marks.shadow(at(PLAN.parasol), 0.32, 0.9, (ctx) => {
      ctx.beginPath();
      ctx.arc(0, 0, 1.25, 0, Math.PI * 2);
      ctx.fill();
    });
    marks.tread(at(PLAN.parasol), 0.75, 0.6, (ctx) => {
      ctx.beginPath();
      ctx.ellipse(0, 0, 1.5, 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    marks.tread(at(PLAN.blanket), 0.9, 0.35, (ctx) => ctx.fillRect(-0.95, -0.8, 1.9, 1.6));
    for (const s of PLAN.beanbags) {
      marks.tread(at(s), 0.9, 0.4, (ctx) => {
        ctx.beginPath();
        ctx.ellipse(0, 0.2, 0.75, 0.95, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    for (const s of PLAN.dogs) {
      marks.tread(at(s), 0.8, 0.25, (ctx) => {
        ctx.beginPath();
        ctx.ellipse(0, 0, 0.42, 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    for (const s of PLAN.bikes) {
      if (s.lying) marks.tread(at(s), 0.7, 0.3, (ctx) => ctx.fillRect(-0.2, -0.65, 0.4, 1.3));
    }
    marks.tread(at(PLAN.reel), 0.7, 0.35, (ctx) => {
      ctx.beginPath();
      ctx.arc(0, 0, 0.55, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /** Hand the kite to whoever's flying it; `hand` reports where their hand is each frame. */
  fly(hand: (seat: Seat) => Vector3) {
    const flyer = this.sitters.find((s) => s.pastime === 'kite');
    if (!flyer) return;
    this.kite = new Kite(this.root, new Vector3(PLAN.kite.x, PLAN.kite.y, PLAN.kite.z), () => hand(flyer.seat));
  }

  /** The visitor's cursor on the ground, or null: dogs that are awake look over at it. */
  attention: Vector3 | null = null;

  update(dt: number, time: number) {
    this.dogs.update(dt, time, this.attention);
    this.kite?.update(dt, time);
    this.butterflies.update(time);
  }
}

