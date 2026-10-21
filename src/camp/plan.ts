import type { Spot } from '../office/layout';

/**
 * Everything in the field that isn't a desk, in world metres, using the same
 * `Spot` convention as the desks (`turn` positive = turned to the right as the
 * establishing shot sees it; a turn of π faces the camera).
 *
 * The rule the set is dressed by: everything here was carried out by someone,
 * and everything electric runs off one orange cord. It comes in from the farm
 * behind the camera along the path everyone walked in on, reaches a reel in
 * the middle of the camp, and splits at power strips to every desk.
 */
export const PLAN = {
  /** The way in: a footpath through the long grass from behind the camera, with the cord along it. */
  wayIn: [
    [3.6, 66], [2.1, 52], [3.1, 40], [1.5, 28], [2.4, 17], [1.2, 9], [1.45, 4.0], [1.2, 1.3], [0.85, -0.7], [0.5, -1.85],
  ] as [number, number][],

  /** The reel the cord ends in, and the strips it feeds. */
  reel: { x: 0.45, z: -2.25, turn: 0.55 } as Spot,
  strips: [
    { x: -3.15, z: -1.6, turn: 0.3 },
    { x: 3.55, z: -1.5, turn: -0.35 },
    { x: -0.15, z: -7.6, turn: 0.1 },
  ] as Spot[],
  /**
   * Which desk each lead runs to, from which source: the reel (-1) or a strip
   * (its index). Desks by index in `layout.ts` (the line, then the open desks).
   */
  leads: [
    { from: 0, desk: 0 },
    { from: 0, desk: 1 },
    { from: 0, desk: 5 },
    { from: -1, desk: 2 },
    { from: 1, desk: 3 },
    { from: 1, desk: 4 },
    { from: 1, desk: 7 },
    { from: 2, desk: 6 },
    { from: 2, desk: 8 },
    { from: 2, desk: 9 },
  ],

  /** The lounge: a parasol over two camp chairs, a cooler, a blanket with lunch on it. */
  parasol: { x: -6.7, z: -6.5, turn: 0.2 } as Spot,
  campChairs: [
    { x: -7.4, z: -6.1, turn: Math.PI - 0.95 },
    { x: -5.95, z: -7.0, turn: Math.PI + 0.25 },
  ] as Spot[],
  cooler: { x: -6.85, z: -7.45, turn: 0.4 } as Spot,
  blanket: { x: -6.0, z: -3.9, turn: 0.18 } as Spot,

  /**
   * The beanbags: two off to the right, somewhere to think lying down, and one
   * dragged out front by someone who works best away from a desk.
   */
  beanbags: [
    { x: 6.3, z: -5.9, turn: Math.PI + 0.9, color: 'slate' },
    { x: 7.45, z: -7.35, turn: Math.PI + 0.3, color: 'rust' },
    { x: -3.55, z: 2.35, turn: Math.PI - 0.6, color: 'rust' },
  ] as (Spot & { color: 'rust' | 'slate' })[],
  crates: [
    { x: 7.3, z: -6.0, turn: 0.3 },
    // a side table at the far end of the line
    { x: 6.15, z: 0.0, turn: -0.2 },
    // and one beside the beanbag out front
    { x: -2.75, z: 2.75, turn: 0.45 },
  ] as Spot[],
  /** Small things set down on desks and crates, in that desk's own space (desks) or on a crate's lid (crates). */
  onDesks: [
    { desk: 0, item: 'pizza', at: [-0.4, 0.74, 0.84], turn: 0.25 },
    { desk: 1, item: 'thermos', at: [0.8, 0.74, 0.46], turn: 0 },
    { desk: 3, item: 'laptop', at: [0.6, 0.74, 0.62], turn: -0.35 },
    { desk: 7, item: 'pizzaShut', at: [0.5, 0.74, 0.68], turn: 0.3 },
  ] as { desk: number; item: 'pizza' | 'pizzaShut' | 'thermos' | 'laptop' | 'book'; at: [number, number, number]; turn: number }[],
  onCrates: [
    { crate: 1, item: 'thermos', turn: 0.4 },
    { crate: 1, item: 'book', turn: -0.3 },
    { crate: 2, item: 'thermos', turn: 1.1 },
    { crate: 0, item: 'pizzaShut', turn: 0.2 },
  ] as { crate: number; item: 'pizzaShut' | 'thermos' | 'book'; turn: number }[],

  /** How everyone got here. */
  bikes: [
    { x: 5.75, z: 2.2, turn: 2.75, lying: false, color: 'bikeMint' },
    { x: -6.75, z: 0.35, turn: 1.25, lying: true, color: 'bikeRed' },
  ] as (Spot & { lying: boolean; color: 'bikeMint' | 'bikeRed' })[],
  backpacks: [
    { x: -1.55, z: 0.75, turn: 2.6, color: 'slate' },
    { x: 3.45, z: 0.9, turn: -2.9, color: 'olive' },
    { x: -5.95, z: 1.55, turn: 3.6, color: 'rust' },
  ] as (Spot & { color: 'slate' | 'olive' | 'rust' })[],

  /** Where the kite rides on an average breeze: downwind of the beanbags and up. */
  kite: { x: 12.6, y: 5.4, z: -17.5 },

  /** Where the butterflies loop around: the gaps in the line, the lounge, the long grass at the edges. */
  butterflies: [
    [-3.6, 1.6], [-1.1, 2.4], [1.3, 0.2], [3.7, 2.0], [-6.2, -2.8], [5.2, -3.4], [-1.6, -6.4], [8.4, 0.8], [-8.6, 1.2], [0.6, 4.8],
  ] as [number, number][],

  /** Dogs, and who they came with. */
  dogs: [
    { x: 3.35, z: 2.05, turn: Math.PI + 1.05, pose: 'lying', coat: 'golden' },
    { x: -5.2, z: -5.4, turn: Math.PI - 0.5, pose: 'sitting', coat: 'collie' },
    { x: 5.4, z: -4.9, turn: 1.1, pose: 'sleeping', coat: 'black' },
  ] as (Spot & { pose: 'lying' | 'sitting' | 'sleeping'; coat: 'golden' | 'collie' | 'black' })[],

};
