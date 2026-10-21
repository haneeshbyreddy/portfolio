import { Matrix4, Vector3 } from 'three';

/**
 * The floor plan: one even grid of single desks, every one facing away from
 * the establishing shot so each screen glows back at the camera over its
 * worker's shoulder. No partitions — just furniture on the lawn, and far more
 * desks than people. The people sit in a line along the front.
 *
 * Change the grid here and the field, lawn, shadows and slots all follow.
 */
export const GRID = {
  cols: 5,
  rows: 4,
  /** Desk-to-desk pitch across a row (x) and between rows (z), in metres. */
  pitchX: 2.55,
  pitchZ: 3.0,
  /** Floor centre on the ground. */
  x: 0,
  z: -0.9,
};

/** Desk + chair footprint in station space (x0, z0, x1, z1). */
export const FOOTPRINT = { x0: -0.66, z0: -0.5, x1: 0.92, z1: 1.08 };

const deskIndex = (row: number, col: number) => row * GRID.cols + col;

/**
 * Desk indices in hiring order, covering every desk on the floor, for `hired`
 * projects. The projects line up side by side along the front row, centred,
 * in roster order from left to right as the establishing shot sees them; a
 * full row carries on, centred again, one row back. The empty desks follow,
 * row by row from the front, middle first.
 */
export function fillOrder(hired: number): number[] {
  const lined: number[] = [];
  for (let r = 0; r < GRID.rows && lined.length < hired; r++) {
    const n = Math.min(GRID.cols, hired - lined.length);
    const start = Math.floor((GRID.cols - n) / 2);
    for (let c = start; c < start + n; c++) lined.push(deskIndex(r, c));
  }
  const mid = (GRID.cols - 1) / 2;
  const rest: number[] = [];
  for (let r = 0; r < GRID.rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < GRID.cols; c++) if (!lined.includes(deskIndex(r, c))) row.push(c);
    row.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    rest.push(...row.map((c) => deskIndex(r, c)));
  }
  return [...lined, ...rest];
}

export interface Station {
  /** Global desk number, 1-based, as shown in the UI (front-left first). */
  number: number;
  row: number;
  col: number;
  /** Station frame: origin on the floor under the chair, +Z toward the monitor. */
  matrix: Matrix4;
  position: Vector3;
  yaw: number;
  forward: Vector3;
  /** Local +X is the worker's left. */
  left: Vector3;
}

/** Ground position of a grid cell: the centre of its desk + chair footprint. */
function cellCenter(row: number, col: number) {
  return {
    x: GRID.x + (col - (GRID.cols - 1) / 2) * GRID.pitchX,
    z: GRID.z + ((GRID.rows - 1) / 2 - row) * GRID.pitchZ,
  };
}

export function buildStations(): Station[] {
  const stations: Station[] = [];
  const yaw = Math.PI;
  // the station origin is the chair; shift it so the whole footprint sits on the cell
  const fx = (FOOTPRINT.x0 + FOOTPRINT.x1) / 2;
  const fz = (FOOTPRINT.z0 + FOOTPRINT.z1) / 2;
  for (let row = 0; row < GRID.rows; row++) {
    for (let col = 0; col < GRID.cols; col++) {
      const c = cellCenter(row, col);
      const m = new Matrix4().makeRotationY(yaw).setPosition(c.x + fx, 0, c.z + fz);
      stations.push({
        number: deskIndex(row, col) + 1,
        row,
        col,
        matrix: m,
        position: new Vector3().setFromMatrixPosition(m),
        yaw,
        forward: new Vector3(0, 0, 1).transformDirection(m),
        left: new Vector3(1, 0, 0).transformDirection(m),
      });
    }
  }
  return stations;
}

/** Ground x of the stations in column `col`: where each of its workers sits. */
export function columnX(col: number) {
  return cellCenter(0, col).x + (FOOTPRINT.x0 + FOOTPRINT.x1) / 2;
}

/** Axis-aligned bounds of the furnished floor (x0, z0, x1, z1), no margin. */
export function floorBounds() {
  const hx = (FOOTPRINT.x1 - FOOTPRINT.x0) / 2;
  const hz = (FOOTPRINT.z1 - FOOTPRINT.z0) / 2;
  const a = cellCenter(GRID.rows - 1, 0);
  const b = cellCenter(0, GRID.cols - 1);
  return { x0: a.x - hx, z0: a.z - hz, x1: b.x + hx, z1: b.z + hz };
}

/** Axis-aligned bounds of the mown lawn around the office (x0, z0, x1, z1). */
export function lawnBounds(margin = 3.2) {
  const f = floorBounds();
  return { x0: f.x0 - margin, z0: f.z0 - margin, x1: f.x1 + margin, z1: f.z1 + margin };
}
