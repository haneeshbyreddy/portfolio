import { Matrix4, Vector3 } from 'three';

/**
 * The floor plan. A pod is the Severance "plus": two crossing partitions with
 * four desks arranged pinwheel-style around them. Rows are staggered so that
 * from the establishing shot no pod hides another — every desk can be seen.
 *
 * Add a pod here and the field, lawn, shadows and slots all follow.
 */
export const PODS: { x: number; z: number }[] = [
  { x: -7.4, z: 3.2 },
  { x: 0, z: 3.2 },
  { x: 7.4, z: 3.2 },
  { x: -3.7, z: -5.0 },
  { x: 3.7, z: -5.0 },
];

/** Half-length of each partition arm. */
export const ARM = 1.65;
export const PARTITION_H = 1.36;

/**
 * Which desk gets the next project. Front-facing desks (screen toward the
 * camera) fill first so the floor reads as alive even with few projects.
 * Entries are [podIndex, quadrant].
 */
export const FILL_ORDER: [number, number][] = [
  [1, 0], [0, 3], [2, 0], [3, 0], [1, 3], [4, 3], [0, 0], [2, 3], [4, 0], [3, 3],
  [1, 1], [0, 1], [2, 1], [3, 1], [4, 1], [1, 2], [0, 2], [2, 2], [3, 2], [4, 2],
];

export interface Station {
  /** Global desk number, 1-based, as shown in the UI. */
  number: number;
  pod: number;
  quadrant: number;
  /** Station frame: origin on the floor under the chair, +Z toward the monitor. */
  matrix: Matrix4;
  position: Vector3;
  yaw: number;
  forward: Vector3;
  /** Local +X is the worker's left. */
  left: Vector3;
}

export function buildStations(): Station[] {
  const stations: Station[] = [];
  const tmp = new Matrix4();
  PODS.forEach((pod, p) => {
    for (let k = 0; k < 4; k++) {
      const yaw = k * (Math.PI / 2) + Math.PI;
      const m = new Matrix4()
        .makeTranslation(pod.x, 0, pod.z)
        .multiply(tmp.makeRotationY(k * (Math.PI / 2)))
        .multiply(tmp.makeTranslation(0.95, 0, 1.1))
        .multiply(tmp.makeRotationY(Math.PI));
      const position = new Vector3().setFromMatrixPosition(m);
      const forward = new Vector3(0, 0, 1).transformDirection(m);
      const left = new Vector3(1, 0, 0).transformDirection(m);
      stations.push({
        number: p * 4 + k + 1,
        pod: p,
        quadrant: k,
        matrix: m,
        position,
        yaw,
        forward,
        left,
      });
    }
  });
  return stations;
}

/** Axis-aligned bounds of the mown lawn around the office (x0, z0, x1, z1). */
export function lawnBounds(margin = 3.2) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of PODS) {
    x0 = Math.min(x0, p.x - ARM);
    x1 = Math.max(x1, p.x + ARM);
    z0 = Math.min(z0, p.z - ARM);
    z1 = Math.max(z1, p.z + ARM);
  }
  return { x0: x0 - margin, z0: z0 - margin, x1: x1 + margin, z1: z1 + margin };
}
