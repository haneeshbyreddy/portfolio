import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { palette } from '../world/palette';
import { shared } from '../world/shared';

/** Kite size: a paper patang, about as tall as a forearm is long… doubled, so it reads from the camp. */
const S = 0.8;
const SEGMENTS = 48;

function paint(g: BufferGeometry, hex: string) {
  const c = new Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(a, 3));
  return g;
}

function tri(a: number[], b: number[], c: number[]) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([...a, ...b, ...c], 3));
  g.computeVertexNormals();
  return g;
}

/**
 * A paper fighter kite, facing +Z, its spine along Y: a square on its corner,
 * two-tone (bone above the spar, rust below), a bamboo spine and bowed spar,
 * a small tail flap at the bottom corner.
 */
function kiteGeometry() {
  const t = [0, S / 2, 0], b = [0, -S / 2, 0], l = [-S / 2, 0.04, 0], r = [S / 2, 0.04, 0];
  // the bowed spar pushes the face into a shallow curve
  const bow = 0.05;
  const lc = [-S / 2, 0.04, -bow], rc = [S / 2, 0.04, -bow];
  const upper = [tri(l, r, t)].map((g) => paint(g, palette.bone));
  const lower = [tri(lc, b, rc)].map((g) => paint(g, palette.rust));
  const flap = paint(tri([-0.07, -S / 2 - 0.12, 0], [0.07, -S / 2 - 0.12, 0], b), palette.rust);
  const stick = (from: number[], to: number[], w = 0.008) => {
    const a = new Vector3(...from), c = new Vector3(...to);
    const mid = a.clone().add(c).multiplyScalar(0.5);
    const len = a.distanceTo(c);
    const g = new BufferGeometry();
    // a flat strip is plenty at kite distance
    g.setAttribute('position', new Float32BufferAttribute([
      -w, -len / 2, 0.004, w, -len / 2, 0.004, w, len / 2, 0.004,
      -w, -len / 2, 0.004, w, len / 2, 0.004, -w, len / 2, 0.004,
    ], 3));
    g.computeVertexNormals();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), c.clone().sub(a).normalize());
    g.applyMatrix4(new Matrix4().compose(mid, q, new Vector3(1, 1, 1)));
    return paint(g, palette.pineDark);
  };
  return mergeGeometries([...upper, ...lower, flap, stick(t, b), stick(l, [0, 0.04 + bow * 0.4, 0.002]), stick([0, 0.04 + bow * 0.4, 0.002], r)])!;
}

/**
 * A paper kite over the camp, flown by someone lying back in a beanbag. It
 * rides the same wind as the grass: it drifts and climbs on the gusts, dives
 * a little when they drop, and the string sags in a long curve down to the
 * hand that holds it.
 */
export class Kite {
  readonly root = new Object3D();
  private kite: Mesh;
  private string: Line;
  private positions: Float32Array;
  private pos = new Vector3();
  private vel = new Vector3();
  private roll = 0;

  /** `home`: where the kite rides on an average breeze, in world space. */
  constructor(parent: Object3D, private home: Vector3, private hand: () => Vector3) {
    this.root.name = 'kite';
    parent.add(this.root);
    const material = new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.85, metalness: 0 });
    // paper lit from behind glows a little
    material.emissive = new Color('#2a221a');
    this.kite = new Mesh(kiteGeometry(), material);
    this.kite.matrixAutoUpdate = false;
    this.root.add(this.kite);

    this.positions = new Float32Array((SEGMENTS + 1) * 3);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.string = new Line(g, new LineBasicMaterial({ color: new Color('#e9e4d6'), transparent: true, opacity: 0.75 }));
    this.string.frustumCulled = false;
    this.root.add(this.string);
    this.pos.copy(home);
  }

  update(dt: number, time: number) {
    const w = shared.uWindDir.value;
    // gusts: the same rhythm the meadow breathes to, slowed for height
    const gust = 0.5 + 0.5 * Math.sin(time * 0.37) * Math.sin(time * 0.13 + 1.7);
    const target = new Vector3(
      this.home.x + w.x * (gust - 0.5) * 2.4 + Math.sin(time * 0.29) * 1.6,
      this.home.y + (gust - 0.5) * 2.2 + Math.sin(time * 0.61) * 0.35,
      this.home.z + w.y * (gust - 0.5) * 2.4 + Math.cos(time * 0.23) * 0.9,
    );
    // a spring, so it swoops rather than slides
    const k = 1.6, c = 1.2;
    this.vel.addScaledVector(target.sub(this.pos), k * dt).multiplyScalar(Math.exp(-c * dt));
    this.pos.addScaledVector(this.vel, dt);

    const hand = this.hand();
    // the kite faces back down its string, leaning into the wind, rolling as it swings
    const toHand = hand.clone().sub(this.pos).normalize();
    const face = toHand.clone().add(new Vector3(0, 0.55, 0)).normalize();
    this.roll += (-this.vel.x * 0.35 + Math.sin(time * 1.9) * 0.12 - this.roll) * Math.min(1, dt * 3);
    const m = new Matrix4().lookAt(new Vector3(), face.clone().negate(), new Vector3(0, 1, 0));
    const q = new Quaternion().setFromRotationMatrix(m).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), this.roll));
    // kites dip their nose into the wind: tilt the spine back
    q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.35));
    this.kite.matrix.compose(this.pos, q, new Vector3(1, 1, 1));
    this.kite.matrixWorldNeedsUpdate = true;

    // the string: a catenary-ish sag from the bridle to the hand, more when the wind drops
    const bridle = new Vector3(0, 0.02, -0.08).applyQuaternion(q).add(this.pos);
    const sag = 1.1 + (1 - gust) * 1.4;
    const len = bridle.distanceTo(hand);
    for (let i = 0; i <= SEGMENTS; i++) {
      const u = i / SEGMENTS;
      const p = new Vector3().lerpVectors(hand, bridle, u);
      p.y -= Math.sin(Math.PI * u) * sag * (len / 25);
      // a breath of wind along it
      p.x += Math.sin(u * 9 + time * 2.1) * 0.04 * Math.sin(Math.PI * u);
      this.positions.set([p.x, p.y, p.z], i * 3);
    }
    (this.string.geometry.attributes.position as BufferAttribute).needsUpdate = true;
  }
}
