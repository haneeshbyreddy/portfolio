import {
  Bone,
  BufferGeometry,
  Color,
  Euler,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Sphere,
  Vector3,
} from 'three';
import { clamp, createNoise2D, damp, easeInOutSine, lerp, mulberry32, smoothstep } from '../core/math';
import { createOfficeMaterial } from '../office/builder';
import { BREEDS, bodyRig, type BodyRig, type Breed, type HeadDef, type Mark, type V3 } from './dogBreeds';
import {
  SkinBuilder,
  collarTag,
  eyeLens,
  fittedCollar,
  floppyEar,
  tailTube,
  tippedEar,
  type Influence,
  type PaintFn,
} from './dogParts';
import { Sculpt } from './dogSdf';

export type DogPose = 'lying' | 'sleeping' | 'sitting';
export type DogCoat = 'golden' | 'black' | 'collie'; // golden retriever; black lab; black-and-white border collie

export interface DogPlacement {
  /** Ground frame: origin on the ground under the dog's chest/centre, +Z = the way the dog faces. */
  matrix: Matrix4;
  pose: DogPose;
  coat: DogCoat;
  seed: number;
}

/* -------------------------------------------------------------------------- */
/*  Rig                                                                       */
/* -------------------------------------------------------------------------- */

const ROOT = 0;
const CHEST = 1;
const NECK = 2;
const HEAD = 3;
const EAR_L = 4;
const EAR_R = 5;
const EYE_L = 6;
const EYE_R = 7;
const TAIL = 8; // 8..11
const TAIL_BONES = 4;
const BONE_COUNT = TAIL + TAIL_BONES;

/**
 * The sculpts are meshed finely, then decimated to a budget: triangles go
 * where the curvature (and the coat's markings) are. ≈ 13.5k per dog.
 */
const BODY_CELL = 0.0155;
const HEAD_CELL = 0.0084;
const BODY_TRIS = 7400;
const HEAD_TRIS = 3300;

const COLLARS = ['#5c6340', '#c35a2c', '#4d6273'];
const TAG = { color: '#d4b36c', rough: 0.42, metal: 0.1 };

interface BoneSpec {
  parent: number;
  pos: Vector3;
  quat: Quaternion;
  scale: number;
}

interface Built {
  geometry: BufferGeometry;
  bones: BoneSpec[];
  inverses: Matrix4[];
  rig: BodyRig;
  breed: Breed;
  head: HeadDef;
  headRest: Quaternion;
  headLifted: Quaternion;
  earRest: [Quaternion, Quaternion];
  /** tail root's rest (= bind) rotation, then each further bone's rest relative to its parent */
  tailRoot: Quaternion;
  tailRest: Quaternion[];
  bounds: Sphere;
  triangles: number;
}

const _e = new Euler();
const qe = (v: V3) => new Quaternion().setFromEuler(_e.set(v[0], v[1], v[2]));
const v3 = (v: V3) => new Vector3(v[0], v[1], v[2]);
const mirror = (v: V3): V3 => [-v[0], v[1], v[2]];

/* ---------------- paint ---------------- */

function markAmount(m: Mark, p: Vector3) {
  const x = (p.x - m.c[0]) / m.r[0];
  const y = (p.y - m.c[1]) / m.r[1];
  const z = (p.z - m.c[2]) / m.r[2];
  const e = Math.sqrt(x * x + y * y + z * z);
  return (1 - smoothstep(1 - m.soft, 1 + m.soft, e)) * m.amount;
}

/** The markings as one scalar, so decimation keeps their edges. */
function markField(marks: Mark[]) {
  const p = new Vector3();
  return (x: number, y: number, z: number) => {
    p.set(x, y, z);
    let f = 0;
    for (const m of marks) f = Math.max(f, markAmount(m, p) * (m.key === 'light' ? 1 : 0.5));
    return f;
  };
}

const _c = new Color();
function coatPaint(breed: Breed, marks: Mark[], extra?: (p: Vector3) => number): PaintFn {
  const C = breed.colours;
  return (local, _bind, normal, out) => {
    let light = 0, dark = 0;
    for (const m of marks) {
      const a = markAmount(m, local);
      if (m.key === 'light') light = Math.max(light, a);
      else dark = Math.max(dark, a);
    }
    if (extra) light = Math.max(light, extra(local));
    _c.copy(C.base).lerp(C.dark, dark);
    // a dark coat catches the sky on its back: a cool sheen keeps the form readable
    if (C.sheen) _c.lerp(C.sheen, smoothstep(0.15, 0.95, normal.y) * 0.5);
    _c.lerp(C.light, light);
    out.r = _c.r; out.g = _c.g; out.b = _c.b;
    out.rough = lerp(C.rough, C.lightRough, light);
    out.metal = 0;
    out.fabric = C.fabric;
  };
}

/* ---------------- heads (shared per breed) ---------------- */

interface HeadBuilt {
  def: HeadDef;
  geo: BufferGeometry;
  nose: BufferGeometry;
  noseMatrix: Matrix4;
  eye: { pos: Vector3; quat: Quaternion };
  ear: { pos: Vector3; normal: Vector3 };
}
const heads = new Map<DogCoat, HeadBuilt>();
let noseGeo: BufferGeometry | null = null;

function nose() {
  if (noseGeo) return noseGeo;
  const s = new Sculpt();
  s.ellipsoid([0, 0, 0], [0.0225, 0.0155, 0.0165], 0);
  s.ellipsoid([0, 0.0065, -0.006], [0.0205, 0.0105, 0.0145], 0.01);
  // nostrils + the little groove under them
  s.ellipsoid([0.0088, -0.0015, 0.0155], [0.0045, 0.0034, 0.0045], 0.004, [0, 0, -0.5], true);
  s.ellipsoid([-0.0088, -0.0015, 0.0155], [0.0045, 0.0034, 0.0045], 0.004, [0, 0, 0.5], true);
  s.box([0, -0.0115, 0.013], [0.0012, 0.006, 0.006], 0.001, 0.003, undefined, true);
  noseGeo = s.mesh(0.0034, { target: 380 });
  return noseGeo;
}

function basisFrom(normal: Vector3) {
  const z = normal.clone().normalize();
  const y = new Vector3(0, 1, 0).addScaledVector(z, -z.y).normalize();
  const x = new Vector3().crossVectors(y, z).normalize();
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
}

function headFor(coat: DogCoat): HeadBuilt {
  const cached = heads.get(coat);
  if (cached) return cached;
  const def = BREEDS[coat].sculptHead();
  const s = def.sculpt;
  const geo = s.mesh(HEAD_CELL, { target: HEAD_TRIS, feature: markField(def.marks), featureWeight: 3 });

  const eyeHit = s.surface(def.eye.from, def.eye.dir);
  const eye = {
    pos: eyeHit.point.clone().addScaledVector(eyeHit.normal, -def.eye.sink),
    quat: basisFrom(eyeHit.normal),
  };
  const noseHit = s.surface(def.nose.from, def.nose.dir);
  const noseMatrix = new Matrix4().compose(
    noseHit.point.clone().addScaledVector(noseHit.normal, -0.008 * def.nose.scale),
    basisFrom(noseHit.normal),
    new Vector3(1, 1, 1).multiplyScalar(def.nose.scale),
  );
  const earHit = s.surface(def.ear.from, def.ear.dir);
  const ear = { pos: earHit.point.clone().addScaledVector(earHit.normal, -def.ear.sink), normal: earHit.normal };
  const built = { def, geo, nose: nose(), noseMatrix, eye, ear };
  heads.set(coat, built);
  return built;
}

/* ---------------- whole dog (cached per coat × pose × side) ---------------- */

const builds = new Map<string, Built>();

function buildDog(coat: DogCoat, pose: DogPose, side: number): Built {
  const key = `${coat}:${pose}:${side}`;
  const hit = builds.get(key);
  if (hit) return hit;

  const breed = BREEDS[coat];
  const rig = bodyRig(breed, pose, side);
  const head = headFor(coat);
  const C = breed.colours;
  const headScale = breed.s * breed.head;

  /* bones (bind pose = rest pose) */
  const bones: BoneSpec[] = new Array(BONE_COUNT);
  const B = (i: number, parent: number, pos: Vector3, quat = new Quaternion(), scale = 1) => {
    bones[i] = { parent, pos, quat, scale };
  };
  const neckBase = v3(rig.neckBase);
  const atlas = v3(rig.atlas);
  const headRest = qe(rig.headRot);
  B(ROOT, -1, new Vector3());
  B(CHEST, ROOT, v3(rig.chest.pivot), qe(rig.chest.rot));
  B(NECK, ROOT, neckBase.clone());
  B(HEAD, NECK, atlas.clone().sub(neckBase), headRest.clone(), headScale);
  const earRot = head.def.ear.rot;
  const earRest: [Quaternion, Quaternion] = [qe(earRot), qe([earRot[0], -earRot[1], -earRot[2]])];
  B(EAR_L, HEAD, head.ear.pos.clone(), earRest[0].clone());
  B(EAR_R, HEAD, head.ear.pos.clone().setX(-head.ear.pos.x), earRest[1].clone());
  const eyeR = head.eye.quat.clone();
  {
    // mirror the left eye's basis across the YZ plane
    const m = new Matrix4().makeRotationFromQuaternion(head.eye.quat);
    const flip = new Matrix4().makeScale(-1, 1, 1);
    m.premultiply(flip).multiply(flip);
    eyeR.setFromRotationMatrix(m);
  }
  B(EYE_L, HEAD, head.eye.pos.clone(), head.eye.quat.clone());
  B(EYE_R, HEAD, head.eye.pos.clone().setX(-head.eye.pos.x), eyeR);
  // tail: bone directions given in body space -> local rest rotations
  const tailWorld = rig.tailPath.map(([pitch, yaw]) =>
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -yaw).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch)));
  const tailRoot = tailWorld[0].clone();
  const tailRest = tailWorld.map((q, i) => (i === 0 ? new Quaternion() : tailWorld[i - 1].clone().invert().multiply(q)));
  B(TAIL, ROOT, v3(rig.tailBase), tailRoot.clone());
  const seg = breed.tail.len * breed.s / TAIL_BONES;
  for (let i = 1; i < TAIL_BONES; i++) B(TAIL + i, TAIL + i - 1, new Vector3(0, 0, -seg));

  const world: Matrix4[] = [];
  for (let i = 0; i < BONE_COUNT; i++) {
    const b = bones[i];
    const local = new Matrix4().compose(b.pos, b.quat, new Vector3(b.scale, b.scale, b.scale));
    world[i] = b.parent < 0 ? local : world[b.parent].clone().multiply(local);
  }
  const inverses = world.map((m) => m.clone().invert());

  /* skin weights for the body */
  const chestC = v3(rig.chest.c);
  const chestQ = qe(rig.chest.rot).invert();
  const chestR = v3(rig.chest.r);
  const neckAxis = atlas.clone().sub(neckBase);
  const neckLen = neckAxis.length();
  neckAxis.normalize();
  const _d = new Vector3();
  const bodyWeights = (_l: Vector3, p: Vector3, out: Influence) => {
    _d.copy(p).sub(chestC).applyQuaternion(chestQ).divide(chestR);
    const wc = 1 - smoothstep(0.55, 1.1, _d.length());
    _d.copy(p).sub(neckBase);
    const t = _d.dot(neckAxis) / neckLen;
    const radial = _d.addScaledVector(neckAxis, -t * neckLen).length();
    const wn = smoothstep(0.02, 0.7, t) * (1 - smoothstep(rig.neckR * 1.5, rig.neckR * 2.6, radial));
    let wcc = wc * (1 - wn);
    const wr = Math.max(0, 1 - wcc - wn);
    if (wcc + wn > 1) wcc = 1 - wn;
    out.i[0] = ROOT; out.w[0] = wr;
    out.i[1] = CHEST; out.w[1] = wcc;
    out.i[2] = NECK; out.w[2] = wn;
  };

  const sb = new SkinBuilder();

  // body
  const bodyGeo = rig.sculpt.mesh(BODY_CELL * breed.s, { target: BODY_TRIS, feature: markField(rig.marks), featureWeight: 3 });
  sb.add(bodyGeo, null, coatPaint(breed, rig.marks), bodyWeights);

  // head, nose, eyes
  sb.add(head.geo, world[HEAD], coatPaint(breed, head.def.marks), HEAD);
  sb.add(head.nose, world[HEAD].clone().multiply(head.noseMatrix), { color: C.nose, rough: 0.34 }, HEAD);
  const eye = eyeLens(head.def.eye.r);
  sb.add(eye, world[EYE_L], { color: C.eye, rough: 0.12 }, EYE_L);
  sb.add(eye, world[EYE_R], { color: C.eye, rough: 0.12 }, EYE_R);

  // ears
  const E = head.def.ear;
  const earPaint: PaintFn = (_l, _b, n, out) => {
    _c.copy(C.ear);
    if (C.sheen) _c.lerp(C.sheen, smoothstep(0.15, 0.95, n.y) * 0.5);
    out.r = _c.r; out.g = _c.g; out.b = _c.b;
    out.rough = C.rough; out.metal = 0; out.fabric = C.fabric;
  };
  for (const [i, sideSign] of [[EAR_L, 1], [EAR_R, -1]] as const) {
    const g = E.kind === 'floppy'
      ? floppyEar(E.len, E.width, E.thick, sideSign)
      : tippedEar(E.len, E.width, E.thick, E.fold, sideSign);
    sb.add(g, world[i], earPaint, i);
  }

  // tail
  const tailLen = breed.tail.len * breed.s;
  const tail = tailTube({ len: tailLen, at: (t) => {
    const r = breed.tail.at(t);
    return { w: r.w * breed.s, up: r.up * breed.s, down: r.down * breed.s };
  } });
  const tailPaint = coatPaint(breed, [], (p) => {
    const t = clamp(-p.z / tailLen);
    if (coat === 'golden') return smoothstep(-0.004, -0.03, p.y) * smoothstep(0.02, 0.2, t) * 0.85 + smoothstep(0.75, 1, t) * 0.3;
    if (coat === 'collie') return smoothstep(0.76, 0.84, t);
    return 0;
  });
  const tailWeights = (l: Vector3, _p: Vector3, out: Influence) => {
    const t = clamp(-l.z / tailLen);
    const f = clamp(t * TAIL_BONES - 0.5, 0, TAIL_BONES - 1);
    const i = Math.min(TAIL_BONES - 2, Math.floor(f));
    const fr = f - i;
    out.i[0] = TAIL + i; out.w[0] = 1 - fr;
    out.i[1] = TAIL + i + 1; out.w[1] = fr;
  };
  sb.add(tail, world[TAIL], tailPaint, tailWeights);

  // collar + tag (the strap is recoloured per dog, see withCollar). A dog
  // asleep with its chin on its paws has no neck to speak of: no collar.
  let collarRange: [number, number] | null = null;
  if (pose !== 'sleeping') {
    const centre = neckBase.clone().lerp(atlas, rig.collarT);
    const collar = fittedCollar(rig.sculpt, centre, neckAxis, 0.0105 * breed.s, 0.0058 * breed.s, rig.neckR * (coat === 'collie' ? 1.9 : 1.35));
    collarRange = [sb.triangles, collar.geo.index!.count / 3];
    sb.add(collar.geo, null, { color: '#ffffff', rough: 0.55, fabric: 0.25 }, bodyWeights);
    const tagM = new Matrix4().compose(
      collar.lowest.clone().addScaledVector(collar.lowestDir, 0.002),
      new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(0, -0.25, 1).normalize()),
      new Vector3(1, 1, 1),
    );
    for (const g of collarTag(0.0125 * breed.s)) sb.add(g, tagM, TAG, bodyWeights);
  }

  const geometry = sb.build();
  // remember which triangles are the strap so each dog can recolour it
  geometry.userData.collarRange = collarRange;

  const bs = geometry.boundingSphere!.clone();
  bs.radius += 0.3 * breed.s;

  const built: Built = {
    geometry,
    bones,
    inverses,
    rig,
    breed,
    head: head.def,
    headRest,
    headLifted: qe([0.02, 0, 0]),
    earRest,
    tailRoot,
    tailRest,
    bounds: bs,
    triangles: geometry.index!.count / 3,
  };
  builds.set(key, built);
  return built;
}

/**
 * The collar colour lives in the vertex colours, so each colour is its own
 * geometry variant (the first one recolours the cached build in place).
 */
const tinted = new Map<string, BufferGeometry>();
function withCollar(built: Built, key: string, hex: string) {
  const range = built.geometry.userData.collarRange as [number, number] | null;
  if (!range) return built.geometry;
  const k = `${key}:${hex}`;
  const hit = tinted.get(k);
  if (hit) return hit;
  const first = !built.geometry.userData.tinted;
  built.geometry.userData.tinted = true;
  const g = first ? built.geometry : built.geometry.clone();
  const [startTri, triCount] = range;
  const col = g.attributes.color;
  const idx = g.index!;
  const c = new Color(hex);
  for (let t = startTri * 3; t < (startTri + triCount) * 3; t++) {
    const v = idx.getX(t);
    col.setXYZ(v, c.r, c.g, c.b);
  }
  tinted.set(k, g);
  return g;
}

/* -------------------------------------------------------------------------- */
/*  Behaviour                                                                 */
/* -------------------------------------------------------------------------- */

interface Spring { x: number; v: number }
const spring = (x = 0): Spring => ({ x, v: 0 });

/** Critically damped follow (frame-rate independent). */
function follow(s: Spring, target: number, smoothTime: number, dt: number) {
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = s.x - target;
  const temp = (s.v + omega * change) * dt;
  s.v = (s.v - omega * temp) * exp;
  s.x = target + (change + temp) * exp;
}

/** Under-damped spring for floppy things (ears). Sub-stepped, so stable at any dt. */
function wobble(s: Spring, target: number, hz: number, zeta: number, dt: number) {
  const w = hz * Math.PI * 2;
  const n = Math.max(1, Math.ceil(dt * 240));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = -w * w * (s.x - target) - 2 * zeta * w * s.v;
    s.v += a * h;
    s.x += s.v * h;
  }
}

const UP = new Vector3(0, 1, 0);
const AX_X = new Vector3(1, 0, 0);
const AX_Z = new Vector3(0, 0, 1);
const _q = new Quaternion();
const _q2 = new Quaternion();
const _inv = new Matrix4();
const _local = new Vector3();
const TAIL_GAIN = [0.55, 0.8, 1.0, 1.12];

class Dog {
  readonly mesh: SkinnedMesh;
  readonly bones: Bone[];
  private readonly sleeper: boolean;
  private readonly r: () => number;
  private readonly noise: (x: number, y: number) => number;
  private clock = 0;

  // breathing
  private breath = 0;
  private breathRate: number;
  private sigh = 1;
  private nextSigh: number;
  private cycle = 0;
  // head
  private yaw = spring();
  private pitch = spring();
  private roll = spring();
  private gYaw = 0;
  private gPitch = 0;
  private gRoll = 0;
  private gTime = 0.4;
  private nextGaze: number;
  private rollUntil = 0;
  // attention
  private want = false;
  private engaged = false;
  private react = 0;
  private still = 0;
  private patience: number;
  private lastAttn = new Vector3(1e9, 0, 0);
  private engagedFor = 0;
  private tilted = false;
  private aYaw = 0;
  private aPitch = 0;
  // tail
  private wag = 0;
  private wagAmp = 0;
  private wagPhase = 0;
  private wagFreq = 2;
  private wagUntil = 0;
  private nextWag: number;
  // ears
  private earLift = [spring(), spring()];
  private earFlap = [spring(), spring()];
  private perk = 0;
  private nextFlick: number;
  private lastTwitch = -10;
  // eyes
  private open: number;
  private blink = 0;
  private nextBlink: number;
  private drowsy = 0;
  private drowsyUntil = 0;
  private nextDrowsy: number;
  // sleeping dogs: the odd look around
  private lift = spring();
  private lifting = false;
  private liftUntil = 0;
  private nextLift: number;

  constructor(
    readonly built: Built,
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
    readonly placement: DogPlacement,
    readonly side: number,
    shadows: boolean,
  ) {
    const r = mulberry32(placement.seed ^ 0x51ed270b);
    this.r = r;
    this.noise = createNoise2D(placement.seed + 17);
    this.sleeper = placement.pose === 'sleeping';

    this.breathRate = 0.92 + r() * 0.16;
    this.breath = r();
    this.nextSigh = 8 + r() * 25;
    this.nextGaze = r() * 2;
    this.patience = 3.5 + r() * 3.5;
    this.nextWag = 1.5 + r() * 8;
    this.nextFlick = 1 + r() * 6;
    this.open = this.sleeper ? 0 : 1;
    this.nextBlink = r() * 4;
    this.nextDrowsy = 10 + r() * 30;
    this.nextLift = 12 + r() * 50;

    const mesh = new SkinnedMesh(geometry, material);
    mesh.name = `dog-${placement.coat}-${placement.pose}`;
    const bones: Bone[] = [];
    for (let i = 0; i < BONE_COUNT; i++) {
      const spec = built.bones[i];
      const b = new Bone();
      b.position.copy(spec.pos);
      b.quaternion.copy(spec.quat);
      b.scale.setScalar(spec.scale);
      bones.push(b);
      if (spec.parent < 0) mesh.add(b);
      else bones[spec.parent].add(b);
    }
    mesh.bind(new Skeleton(bones, built.inverses.map((m) => m.clone())), new Matrix4());
    mesh.boundingSphere = built.bounds.clone();
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    placement.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    this.mesh = mesh;
    this.bones = bones;
    this.apply(0);
  }

  tick(dt: number, time: number, attention: Vector3 | null) {
    this.clock += dt;
    const T = this.clock;
    const r = this.r;
    const pose = this.placement.pose;
    const sleeper = this.sleeper;

    /* -------- asleep / lifting the head for a look -------- */
    if (sleeper) {
      if (!this.lifting && T > this.nextLift) {
        this.lifting = true;
        this.liftUntil = T + 3.5 + r() * 3;
        this.nextGaze = T + 0.9;
      }
      if (this.lifting && T > this.liftUntil) {
        this.lifting = false;
        this.nextLift = T + 40 + r() * 50;
      }
      follow(this.lift, this.lifting ? 1 : 0, this.lifting ? 0.55 : 0.85, dt);
    }
    const awake = sleeper ? clamp(this.lift.x) : 1;
    const alert = awake > 0.6;

    /* -------- attention -------- */
    let want = false;
    let near = Infinity;
    if (attention) {
      _inv.copy(this.mesh.matrixWorld).invert();
      _local.copy(attention).applyMatrix4(_inv);
      const atlas = this.built.rig.atlas;
      const dx = _local.x - atlas[0];
      const dz = _local.z - atlas[2];
      const dy = _local.y - (atlas[1] + 0.06);
      const horiz = Math.hypot(dx, dz);
      near = horiz;
      const moved = this.lastAttn.distanceToSquared(attention) > 0.08 * 0.08;
      if (moved) {
        this.lastAttn.copy(attention);
        this.still = 0;
        // a sleeping dog hears you: one ear swivels
        if (sleeper && !alert && horiz < 4 && T - this.lastTwitch > 3 && r() < 0.5) {
          this.lastTwitch = T;
          this.earFlap[r() < 0.5 ? 0 : 1].v += 3.5;
        }
      } else {
        this.still += dt;
      }
      const rawYaw = Math.atan2(dx, dz);
      this.aYaw = clamp(rawYaw, -1, 1);
      this.aPitch = clamp(Math.atan2(-dy, Math.max(0.2, horiz)) * 0.85, -0.3, 0.42);
      want = horiz < 7 && horiz > 0.12 && Math.abs(rawYaw) < 2.3 && this.still < this.patience && alert;
    } else {
      this.still += dt;
    }
    if (want !== this.want) {
      this.want = want;
      this.react = want ? 0.15 + r() * 0.35 : 0.5 + r() * 0.7;
    }
    if (this.engaged !== this.want) {
      this.react -= dt;
      if (this.react <= 0) {
        this.engaged = this.want;
        this.engagedFor = 0;
        this.tilted = false;
        if (this.engaged) {
          this.drowsyUntil = 0;
          // a hello from the tail, more often than not
          if (r() < 0.75) this.startWag(T, 1.4 + r() * 1.6, near < 2.5 ? 1.15 : 1);
        } else {
          this.nextGaze = T + 0.4 + r() * 0.8;
          this.patience = 3.5 + r() * 3.5;
        }
      }
    }

    /* -------- gaze -------- */
    if (this.engaged) {
      this.engagedFor += dt;
      this.gYaw = this.aYaw;
      this.gPitch = this.aPitch;
      this.gTime = 0.26;
      // a quizzical tilt, once in a while, when the point holds still
      if (!this.tilted && this.engagedFor > 1.2 && this.still > 0.5) {
        this.tilted = true;
        if (r() < 0.55) {
          this.gRoll = (r() < 0.5 ? -1 : 1) * (0.16 + r() * 0.1);
          this.rollUntil = T + 1.2 + r() * 0.8;
        }
      }
    } else if (awake > 0.3) {
      if (T > this.nextGaze) this.pickGaze(T, pose);
    } else {
      this.gYaw = 0;
      this.gPitch = 0;
    }
    if (T > this.rollUntil) this.gRoll = 0;
    // drowsy: eyes half shut, head a little lower (lying, awake, nobody about)
    if (pose === 'lying' && !this.engaged) {
      if (T > this.nextDrowsy && this.drowsyUntil < T) {
        this.drowsyUntil = T + 4 + r() * 5;
        this.nextDrowsy = this.drowsyUntil + 15 + r() * 30;
      }
    }
    this.drowsy = damp(this.drowsy, T < this.drowsyUntil ? 1 : 0, 1.6, dt);

    const life = this.noise(time * 0.21, 3.1) * 0.035;
    follow(this.yaw, this.gYaw + life, this.gTime, dt);
    follow(this.pitch, this.gPitch + this.drowsy * 0.1 + this.noise(time * 0.17, 8.7) * 0.02, this.gTime * 1.15, dt);
    follow(this.roll, this.gRoll, 0.45, dt);

    /* -------- breathing -------- */
    const deep = sleeper ? 1 - awake : 0;
    const hz = lerp(0.45, 0.25, deep) * this.breathRate * (1 + 0.12 * this.noise(time * 0.07, 1.3)) * (this.sigh > 1 ? 0.7 : 1);
    this.breath += dt * hz;
    const cyc = Math.floor(this.breath);
    if (cyc !== this.cycle) {
      this.cycle = cyc;
      this.sigh = 1;
      if (T > this.nextSigh) {
        this.sigh = 1.5;
        this.nextSigh = T + (sleeper ? 18 : 30) + r() * 25;
      }
    }

    /* -------- tail -------- */
    if (!sleeper || alert) {
      if (T > this.nextWag && T > this.wagUntil) {
        this.startWag(T, 1.2 + r() * 2.4, 1);
      }
    } else if (T > this.nextWag) {
      // asleep: the very occasional twitch
      this.wagUntil = T + 0.5;
      this.wagAmp = 0.07;
      this.wagFreq = 1.1;
      this.nextWag = T + 20 + r() * 30;
    }
    const wagOn = T < this.wagUntil;
    this.wag = damp(this.wag, wagOn ? this.wagAmp : 0, wagOn ? 5 : 2.2, dt);
    this.wagPhase += dt * Math.PI * 2 * this.wagFreq;

    /* -------- ears -------- */
    this.perk = damp(this.perk, this.engaged ? 1 : 0, 3, dt);
    if (T > this.nextFlick) {
      this.nextFlick = T + (sleeper && !alert ? 7 + r() * 12 : 2.5 + r() * 6);
      const both = r() < 0.25;
      const which = r() < 0.5 ? 0 : 1;
      const k = sleeper && !alert ? 0.45 : 1;
      for (const e of both ? [0, 1] : [which]) {
        if (this.built.head.ear.kind === 'floppy') this.earFlap[e].v += (6 + r() * 5) * k;
        else this.earLift[e].v -= (6 + r() * 4) * k;
      }
    }
    const floppy = this.built.head.ear.kind === 'floppy';
    const relaxed = sleeper ? (1 - awake) : 0;
    for (const e of [0, 1]) {
      const liftTarget = floppy ? this.perk * 0.2 - relaxed * 0.08 : this.perk * 0.12 - relaxed * 0.25;
      wobble(this.earLift[e], liftTarget, floppy ? 3.2 : 4.5, floppy ? 0.32 : 0.4, dt);
      wobble(this.earFlap[e], floppy ? this.perk * -0.04 : 0, floppy ? 3.6 : 5, floppy ? 0.3 : 0.45, dt);
    }

    /* -------- eyes -------- */
    if (T > this.nextBlink) {
      this.blink = 0.17;
      this.nextBlink = T + (r() < 0.15 ? 0.32 : 2.2 + r() * 4.5);
    }
    this.blink = Math.max(0, this.blink - dt);
    const openTarget = sleeper ? (awake > 0.55 ? 1 : 0) : 1 - this.drowsy * 0.45;
    this.open = damp(this.open, openTarget, sleeper ? 5 : 4, dt);

    this.apply(time);
  }

  private startWag(T: number, dur: number, gain: number) {
    const sitting = this.placement.pose === 'sitting';
    this.wagUntil = T + dur;
    this.wagAmp = (sitting ? 0.42 : 0.3) * gain * (0.85 + this.r() * 0.3);
    this.wagFreq = sitting ? 2.5 + this.r() * 0.7 : 1.3 + this.r() * 0.6;
    this.nextWag = this.wagUntil + 4 + this.r() * 10;
  }

  private pickGaze(T: number, pose: DogPose) {
    const r = this.r;
    const k = r();
    const wide = pose === 'sitting' ? 1.1 : 1;
    if (k < 0.3) {
      this.gYaw = (r() - 0.5) * 0.35;
      this.gPitch = (r() - 0.3) * 0.12;
    } else if (k < 0.82) {
      const s = r() < 0.5 ? -1 : 1;
      this.gYaw = s * (0.32 + r() * 0.55) * wide;
      this.gPitch = (r() - 0.45) * 0.24;
    } else {
      // a glance down at the grass
      this.gYaw = (r() - 0.5) * 0.5;
      this.gPitch = 0.2 + r() * 0.15;
    }
    this.gTime = 0.28 + r() * 0.26;
    this.nextGaze = T + 1.4 + r() * 3.8;
  }

  /** Pose → bones. */
  private apply(time: number) {
    const B = this.bones;
    const built = this.built;
    const sleeper = this.sleeper;
    const awake = sleeper ? clamp(this.lift.x) : 1;

    // breathing: in quicker, out slower; the back rises off the chest floor
    const s = this.breath - Math.floor(this.breath);
    const b = s < 0.42 ? easeInOutSine(s / 0.42) : 1 - easeInOutSine((s - 0.42) / 0.58);
    const amp = (sleeper ? lerp(1.4, 1, awake) : 1) * this.sigh * (1 + 0.15 * this.noise(time * 0.11, 4.2));
    B[CHEST].scale.set(1 + b * 0.016 * amp, 1 + b * 0.02 * amp, 1 + b * 0.006 * amp);

    // neck + head
    const yaw = this.yaw.x * (sleeper ? awake : 1);
    const pitch = this.pitch.x * (sleeper ? awake : 1);
    const liftNeck = sleeper ? -0.55 * awake : 0;
    // the neck lifts the head; the head tips back down to look level
    const liftHead = sleeper ? 0.5 * awake : 0;
    B[NECK].quaternion.setFromAxisAngle(UP, yaw * 0.35).multiply(_q.setFromAxisAngle(AX_X, pitch * 0.3 + liftNeck));
    const rest = _q2.copy(built.headRest);
    if (sleeper) rest.slerp(built.headLifted, awake);
    B[HEAD].quaternion
      .setFromAxisAngle(UP, yaw * 0.65)
      .multiply(rest)
      .multiply(_q.setFromAxisAngle(AX_X, pitch * 0.7 + liftHead))
      .multiply(_q.setFromAxisAngle(AX_Z, this.roll.x));
    B[HEAD].position.copy(built.bones[HEAD].pos).y += b * 0.0018 * amp;

    // ears
    for (const e of [0, 1]) {
      const bone = B[EAR_L + e];
      const sign = e === 0 ? 1 : -1;
      bone.quaternion
        .copy(built.earRest[e])
        .multiply(_q.setFromAxisAngle(AX_X, this.earLift[e].x))
        .multiply(_q2.setFromAxisAngle(AX_Z, this.earFlap[e].x * sign));
    }

    // eyes: a blink is a squash; closed is a thin dark line
    const blink = this.blink > 0 ? Math.sin(Math.PI * (1 - this.blink / 0.17)) : 0;
    const open = Math.max(0.1, this.open * (1 - blink * 0.9));
    B[EYE_L].scale.set(1, open, 1);
    B[EYE_R].scale.set(1, open, 1);

    // tail
    const pose = this.placement.pose;
    const sway = this.noise(time * 0.13, 6.6) * (sleeper ? 0.015 : 0.05);
    const wagN = this.wagAmp > 0 ? clamp(this.wag / this.wagAmp) : 0;
    for (let i = 0; i < TAIL_BONES; i++) {
      const a = this.wag * TAIL_GAIN[i] * Math.sin(this.wagPhase - i * 0.7) + sway * (0.4 + i * 0.3);
      const bone = B[TAIL + i];
      if (i === 0) {
        // the root sweeps about the body's up axis (along the ground when lying)
        bone.quaternion.setFromAxisAngle(UP, a).multiply(built.tailRoot);
        if (pose === 'sitting') bone.quaternion.multiply(_q.setFromAxisAngle(AX_X, 0.28 * wagN));
        else bone.quaternion.multiply(_q.setFromAxisAngle(AX_X, 0.05 * wagN));
      } else {
        bone.quaternion.copy(built.tailRest[i]).multiply(_q.setFromAxisAngle(UP, a));
      }
    }
  }
}

/* -------------------------------------------------------------------------- */

export class Dogs {
  readonly dogs: Dog[] = [];
  readonly material: MeshStandardMaterial;

  constructor(root: Object3D, placements: DogPlacement[], shadows: boolean) {
    this.material = createOfficeMaterial();
    for (const p of placements) {
      const r = mulberry32(p.seed ^ 0x2c1b3c6d);
      const side = r() < 0.5 ? -1 : 1;
      const collar = COLLARS[Math.floor(r() * COLLARS.length)];
      const key = `${p.coat}:${p.pose}:${side}`;
      const built = buildDog(p.coat, p.pose, side);
      const dog = new Dog(built, withCollar(built, key, collar), this.material, p, side, shadows);
      root.add(dog.mesh);
      dog.mesh.updateWorldMatrix(true, true);
      this.dogs.push(dog);
    }
  }

  /** Triangles in each dog's mesh (one skinned draw call per dog). */
  get triangles() {
    return this.dogs.map((d) => d.built.triangles);
  }

  /** `attention`: a world point the dogs may look at (the visitor's cursor on the ground, or null). */
  update(dt: number, time: number, attention: Vector3 | null) {
    const step = Math.min(Math.max(dt, 0), 0.1);
    for (const d of this.dogs) d.tick(step, time, attention);
  }

  dispose() {
    for (const d of this.dogs) {
      d.mesh.removeFromParent();
      d.mesh.skeleton.dispose();
    }
    this.material.dispose();
  }
}
