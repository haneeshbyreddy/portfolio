import { Matrix4, Vector3 } from 'three';

/**
 * The camp plan. The studio carried its desks out onto the grass and set them
 * up the way people do on a picnic: nobody in rows, everyone facing the view.
 * The projects sit in one loose line across the front, in roster order from
 * left to right, each desk at its owner's own angle; the empty desks stand
 * behind them, set up and plugged in, waiting. Everything else in the field
 * (the lounge under the parasol, the beanbags, the bikes, the cord that
 * powers it all) is in `src/camp/plan.ts`.
 *
 * A spot is the centre of a desk + chair footprint on the ground. `turn` is
 * how far the desk is turned off facing straight up the valley, in radians,
 * positive to the right as the establishing shot sees it.
 */
export interface Spot {
  x: number;
  z: number;
  turn: number;
}

/** The front line: one desk per project, left to right. Ends angled in, toward the valley. */
export const LINE: Spot[] = [
  { x: -5.0, z: 0.85, turn: 0.42 },
  { x: -2.5, z: -0.55, turn: 0.12 },
  { x: 0.1, z: 0.5, turn: -0.18 },
  { x: 2.6, z: -0.6, turn: 0.22 },
  { x: 5.05, z: 0.7, turn: -0.45 },
];

/**
 * The empty desks, behind the line. They were carried out and set up with
 * the rest, at whatever angle their owner will want; nobody has worn the
 * grass down around them yet.
 */
export const OPEN: Spot[] = [
  { x: -4.05, z: -4.45, turn: -0.75 },
  { x: -0.95, z: -5.45, turn: 0.35 },
  { x: 2.65, z: -4.35, turn: -1.1 },
  { x: -2.75, z: -9.4, turn: 0.9 },
  { x: 3.25, z: -9.8, turn: -0.4 },
];

/** Desk + chair footprint in station space (x0, z0, x1, z1). */
export const FOOTPRINT = { x0: -0.66, z0: -0.5, x1: 0.92, z1: 1.08 };

const SPOTS = [...LINE, ...OPEN];

/**
 * Desk indices in hiring order, covering every desk in the field, for `hired`
 * projects. The projects take the front line, centred and in roster order from
 * left to right; past five they carry on into the open desks behind. The
 * empty desks follow, front first.
 */
export function fillOrder(hired: number): number[] {
  const n = Math.min(hired, LINE.length);
  const start = Math.floor((LINE.length - n) / 2);
  const lined: number[] = [];
  for (let i = start; i < start + n; i++) lined.push(i);
  for (let i = LINE.length; i < SPOTS.length && lined.length < hired; i++) lined.push(i);
  const rest = SPOTS.map((_, i) => i).filter((i) => !lined.includes(i));
  return [...lined, ...rest];
}

export interface Station {
  /** Desk number, 1-based, as shown in the UI: the front line left to right, then the open desks. */
  number: number;
  /** Station frame: origin on the ground under the chair, +Z toward the monitor. */
  matrix: Matrix4;
  position: Vector3;
  yaw: number;
  forward: Vector3;
  /** Local +X is the worker's left. */
  left: Vector3;
}

/** A frame on the ground at (x, z), facing up the valley (−Z) turned by `turn`. */
export function spotMatrix(x: number, z: number, turn: number, y = 0) {
  return new Matrix4().makeRotationY(Math.PI - turn).setPosition(x, y, z);
}

export function buildStations(): Station[] {
  // the station origin is the chair; shift it so the whole footprint sits on the spot
  const fx = (FOOTPRINT.x0 + FOOTPRINT.x1) / 2;
  const fz = (FOOTPRINT.z0 + FOOTPRINT.z1) / 2;
  return SPOTS.map((s, i) => {
    const m = spotMatrix(s.x, s.z, s.turn).multiply(new Matrix4().makeTranslation(-fx, 0, -fz));
    return {
      number: i + 1,
      matrix: m,
      position: new Vector3().setFromMatrixPosition(m),
      yaw: Math.PI - s.turn,
      forward: new Vector3(0, 0, 1).transformDirection(m),
      left: new Vector3(1, 0, 0).transformDirection(m),
    };
  });
}

const RADIUS = Math.hypot(FOOTPRINT.x1 - FOOTPRINT.x0, FOOTPRINT.z1 - FOOTPRINT.z0) / 2;

function boundsOf(spots: Spot[]) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const s of spots) {
    x0 = Math.min(x0, s.x - RADIUS);
    x1 = Math.max(x1, s.x + RADIUS);
    z0 = Math.min(z0, s.z - RADIUS);
    z1 = Math.max(z1, s.z + RADIUS);
  }
  return { x0, z0, x1, z1 };
}

/** Bounds of every desk (x0, z0, x1, z1): what the lens keeps sharp. */
export function floorBounds() {
  return boundsOf(SPOTS);
}

/** Bounds of the front line alone: the working desks the establishing shot is built around. */
export function lineBounds() {
  return boundsOf(LINE);
}

/**
 * The camp: the desks and everything set up around them (x0, z0, x1, z1).
 * The grass, the marks on the ground and the break in the cloud fit to it.
 */
export function campBounds(margin = 3.2) {
  const f = floorBounds();
  // the lounge and the beanbags sit out past the desks on either side
  return { x0: f.x0 - 2.8 - margin, z0: f.z0 - margin, x1: f.x1 + 2.8 + margin, z1: f.z1 + 2.4 + margin };
}
