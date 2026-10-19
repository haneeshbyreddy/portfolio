import { Matrix4, Vector3 } from 'three';

/**
 * The floor plan: one even grid of single desks, every one facing away from
 * the establishing shot so each screen glows back at the camera over its
 * worker's shoulder. No partitions — just furniture on the lawn, and far more
 * desks than people.
 *
 * Change the grid here and the field, lawn, shadows and slots all follow.
 */
export const GRID = {
  cols: 7,
  rows: 4,
  /** Desk-to-desk pitch across a row (x) and between rows (z), in metres. */
  pitchX: 2.9,
  pitchZ: 3.3,
  /** Floor centre on the ground. */
  x: 0,
  z: -0.9,
};

/** Desk + chair footprint in station space (x0, z0, x1, z1). */
export const FOOTPRINT = { x0: -0.66, z0: -0.5, x1: 0.92, z1: 1.08 };

/**
 * Which desk gets the next project, as [row, col] with row 0 nearest the
 * camera. The first seven take one desk per column, so from the overview no
 * worker hides behind another; later hires fill in front to back.
 */
const HIRING: [number, number][] = [
  [0, 2], [1, 4], [0, 6], [1, 0], [2, 3], [3, 1], [3, 5],
  [0, 4], [1, 2], [2, 5], [2, 1], [0, 0], [1, 6], [3, 3],
];

const deskIndex = (row: number, col: number) => row * GRID.cols + col;

/** Desk indices in hiring order, covering every desk on the floor. */
export const FILL_ORDER: number[] = (() => {
  const order = HIRING.map(([r, c]) => deskIndex(r, c));
  const mid = (GRID.cols - 1) / 2;
  const rest: number[] = [];
  for (let r = 0; r < GRID.rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < GRID.cols; c++) if (!order.includes(deskIndex(r, c))) row.push(c);
    row.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    rest.push(...row.map((c) => deskIndex(r, c)));
  }
  return [...order, ...rest];
})();

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
