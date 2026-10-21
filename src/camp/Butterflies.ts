import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { mulberry32 } from '../core/math';
import { shared } from '../world/shared';

/** One wing, root on the body axis (z), tip out along +x: a forewing and a rounder hindwing. */
function wingGeometry() {
  const pts: number[] = [];
  const fan = (cx: number, cz: number, rx: number, rz: number, a0: number, a1: number, n = 7) => {
    for (let i = 0; i < n; i++) {
      const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
      pts.push(0, 0, cz * 0.4, cx + Math.cos(t0) * rx, 0, cz + Math.sin(t0) * rz, cx + Math.cos(t1) * rx, 0, cz + Math.sin(t1) * rz);
    }
  };
  fan(0.016, 0.006, 0.017, 0.014, -1.6, 1.4);
  fan(0.012, -0.012, 0.013, 0.011, -1.9, 0.9);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
  g.computeVertexNormals();
  return g;
}

interface Flyer {
  home: Vector3;
  r: number;
  seed: number;
  speed: number;
  flap: number;
  pos: Vector3;
  last: Vector3;
}

/**
 * Cabbage whites and the odd brimstone working the camp: low, erratic, never
 * going anywhere in particular. Too small to see from the establishing shot
 * except as a flicker; at a desk they cross behind the worker now and then.
 */
export class Butterflies {
  private mesh: InstancedMesh;
  private flyers: Flyer[] = [];

  constructor(parent: Object3D, homes: Vector3[]) {
    const rand = mulberry32(2718);
    const material = new MeshLambertMaterial({ side: DoubleSide, color: '#ffffff' });
    this.mesh = new InstancedMesh(wingGeometry(), material, homes.length * 2);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'butterflies';
    const white = new Color('#f4f0e2'), brimstone = new Color('#efe39a');
    homes.forEach((home, i) => {
      const c = rand() < 0.25 ? brimstone : white;
      this.mesh.setColorAt(i * 2, c);
      this.mesh.setColorAt(i * 2 + 1, c);
      this.flyers.push({ home, r: 1.5 + rand() * 2.5, seed: rand() * 100, speed: 0.5 + rand() * 0.4, flap: 10 + rand() * 4, pos: home.clone(), last: home.clone() });
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    parent.add(this.mesh);
  }

  private m = new Matrix4();
  private q = new Quaternion();
  private qw = new Quaternion();
  private dir = new Vector3();
  private s = new Vector3(1.6, 1.6, 1.6);
  private static Z = new Vector3(0, 0, 1);

  update(time: number) {
    const hide = shared.uVeil.value > 0.5;
    this.flyers.forEach((f, i) => {
      const t = time * f.speed + f.seed;
      f.last.copy(f.pos);
      // a wander made of a few slow loops, with the jinks butterflies make
      f.pos.set(
        f.home.x + Math.sin(t * 0.9) * f.r + Math.sin(t * 3.7) * 0.25,
        f.home.y + 0.45 + Math.sin(t * 1.3) * 0.3 + Math.abs(Math.sin(t * 5.1)) * 0.18,
        f.home.z + Math.sin(t * 0.6 + 1.3) * f.r * 0.7 + Math.cos(t * 4.3) * 0.2,
      );
      this.dir.subVectors(f.pos, f.last).setY(0);
      if (this.dir.lengthSq() > 1e-8) this.q.setFromUnitVectors(Butterflies.Z, this.dir.normalize());
      const beat = Math.sin(time * f.flap + f.seed);
      const open = 0.15 + (beat * 0.5 + 0.5) * 1.15;
      for (const side of [1, -1]) {
        this.qw.setFromAxisAngle(Butterflies.Z, side > 0 ? open : Math.PI - open);
        this.m.compose(f.pos, this.qw.premultiply(this.q), hide ? this.s.clone().setScalar(0) : this.s);
        this.mesh.setMatrixAt(i * 2 + (side > 0 ? 0 : 1), this.m);
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
