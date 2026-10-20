import {
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, hashString, lerp, mulberry32, smoothstep } from '../core/math';
import type { Desk } from './Office';
import { KEYBOARD, MOUSE, MUG } from './parts';
import { PHONE_REST, PHONE_SHOT, type Phones } from './Phones';

/* -------------------------------------------------------------------------- */
/*  Wardrobe                                                                  */
/* -------------------------------------------------------------------------- */

const SKIN = ['#f1cba8', '#e2ae87', '#c98d64', '#a46b47', '#7c4c32', '#5e3b27'];
const HAIR = ['#1a1613', '#2a201a', '#45322a', '#6f4b30', '#a0703f', '#c9b48e'];
const SUITS = ['#33373c', '#283044', '#474d55', '#3e4535', '#2c2f33'];
const SHIRTS = ['#ecebe6', '#e3dfd3', '#48513b', '#d9d2c2'];
const PANTS = ['#202328', '#2b3039', '#37465f', '#2a2c2e'];
const TIES = ['#1d2c25', '#5b2a26', '#22293a', '#8a6a3a'];
const HAIRSTYLES = ['short', 'curly', 'bun', 'long', 'buzz'] as const;
type HairStyle = (typeof HAIRSTYLES)[number];

interface Look {
  skin: Color;
  hair: Color;
  hairStyle: HairStyle;
  top: Color;
  shirt: Color;
  pants: Color;
  tie: Color | null;
  headphones: boolean;
  headScale: Vector3;
  build: number;
}

function lookFor(seed: number): Look {
  const r = mulberry32(seed);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const suited = r() < 0.6;
  const shirt = pick(SHIRTS);
  return {
    skin: new Color(pick(SKIN)),
    hair: new Color(pick(HAIR)),
    hairStyle: pick(HAIRSTYLES),
    top: new Color(suited ? pick(SUITS) : shirt),
    shirt: new Color(suited ? '#efeee9' : shirt),
    pants: new Color(pick(PANTS)),
    tie: suited && r() < 0.75 ? new Color(pick(TIES)) : null,
    headphones: r() < 0.3,
    headScale: new Vector3(0.84 + r() * 0.05, 1.0 + r() * 0.06, 0.95),
    build: 0.94 + r() * 0.12,
  };
}

/* -------------------------------------------------------------------------- */
/*  Geometry                                                                  */
/* -------------------------------------------------------------------------- */

const UP = new Vector3(0, 1, 0);

function torsoGeometry() {
  const pts = [
    [0.0, -0.02], [0.135, 0.0], [0.15, 0.08], [0.152, 0.22], [0.172, 0.37],
    [0.176, 0.42], [0.155, 0.48], [0.09, 0.525], [0.0, 0.535],
  ].map(([x, y]) => new Vector2(x, y));
  const g = new LatheGeometry(pts, 28);
  g.scale(1, 1, 0.62);
  return g;
}

function capSphere(r: number, thetaLen: number) {
  return new SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, thetaLen);
}

function hairGeometry(style: HairStyle): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const cap = (r: number, len: number, tilt: number) =>
    capSphere(r, len).rotateX(-tilt).translate(0, 0.004, -0.004);
  switch (style) {
    case 'short':
      parts.push(cap(0.108, Math.PI * 0.52, 0.42));
      break;
    case 'buzz':
      parts.push(cap(0.103, Math.PI * 0.5, 0.5));
      break;
    case 'bun':
      parts.push(cap(0.108, Math.PI * 0.55, 0.45));
      parts.push(new SphereGeometry(0.048, 16, 12).translate(0, 0.08, -0.085));
      break;
    case 'long':
      parts.push(cap(0.11, Math.PI * 0.56, 0.4));
      parts.push(new RoundedBoxGeometry(0.2, 0.2, 0.06, 2, 0.028).translate(0, -0.04, -0.07));
      break;
    case 'curly': {
      const rand = mulberry32(7);
      parts.push(cap(0.104, Math.PI * 0.5, 0.42));
      for (let i = 0; i < 22; i++) {
        const th = rand() * Math.PI * 0.5;
        const ph = rand() * Math.PI * 2;
        const dir = new Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
        dir.applyAxisAngle(new Vector3(1, 0, 0), -0.45);
        if (dir.z > 0.55 && dir.y < 0.6) continue; // keep the face clear
        parts.push(new SphereGeometry(0.036 + rand() * 0.014, 10, 8).translate(dir.x * 0.105, dir.y * 0.105, dir.z * 0.105));
      }
      break;
    }
  }
  const clean = parts.map((p) => {
    const q = p.index ? p.toNonIndexed() : p;
    q.deleteAttribute('uv');
    return q;
  });
  return mergeGeometries(clean)!;
}

function headphonesGeometry() {
  // arc over the top, ear to ear (in x)
  const b2 = new TorusGeometry(0.118, 0.011, 8, 28, Math.PI);
  const cupL = new CylinderGeometry(0.042, 0.042, 0.034, 20).rotateZ(Math.PI / 2).translate(0.112, -0.005, 0);
  const cupR = new CylinderGeometry(0.042, 0.042, 0.034, 20).rotateZ(Math.PI / 2).translate(-0.112, -0.005, 0);
  const parts = [b2, cupL, cupR].map((g) => {
    const q = g.index ? g.toNonIndexed() : g;
    q.deleteAttribute('uv');
    return q;
  });
  return mergeGeometries(parts)!;
}

/* -------------------------------------------------------------------------- */
/*  Behaviour                                                                 */
/* -------------------------------------------------------------------------- */

type State = 'type' | 'mouse' | 'think' | 'stretch' | 'sip' | 'look' | 'swivel' | 'relax' | 'watch';

const STATES: { s: State; w: number; d: [number, number] }[] = [
  { s: 'type', w: 6, d: [4, 10] },
  { s: 'mouse', w: 2.5, d: [3, 6] },
  { s: 'think', w: 1.1, d: [3, 5] },
  { s: 'stretch', w: 0.6, d: [3.2, 3.8] },
  { s: 'sip', w: 0.9, d: [4.2, 4.6] },
  { s: 'look', w: 1, d: [2, 3.5] },
  { s: 'swivel', w: 0.7, d: [3, 5] },
  { s: 'relax', w: 0.6, d: [4, 6] },
  // only while a film is on (see `watching`)
  { s: 'watch', w: 0, d: [6, 10] },
];

interface Pose {
  lean: number;
  twist: number;
  side: number;
  headYaw: number;
  headPitch: number;
  headRoll: number;
  swivel: number;
  rollBack: number;
  handL: Vector3;
  handR: Vector3;
  /** elbow flare: 0 = tucked, 1 = wide (hands behind head) */
  flare: number;
}

const newPose = (): Pose => ({
  lean: 0.14, twist: 0, side: 0, headYaw: 0, headPitch: 0.15, headRoll: 0,
  swivel: 0, rollBack: 0, handL: new Vector3(0.085, 0.79, 0.4), handR: new Vector3(-0.085, 0.79, 0.4), flare: 0,
});

const ARM_A = 0.27;
const ARM_B = 0.25;

/* -------------------------------------------------------------------------- */

interface Worker {
  desk: Desk;
  look: Look;
  rand: () => number;
  state: State;
  stateTime: number;
  stateDur: number;
  speed: number;
  phase: number;
  legs: number;
  pose: Pose;
  target: Pose;
  /** Live joint positions in station space (for mug hand-off). */
  wristL: Vector3;
  mugAttached: boolean;
  bob: number;
  /** "looking at camera" override when focused */
  focused: number;
  /** 0..1 — the visitor is hovering their desk; they glance over */
  notice: number;
  noticeTarget: number;
  /** 0..1 along "pick up the phone and hold it up for the visitor"; runs back down to put it away. */
  show: number;
  showTarget: number;
  /** A film is playing on their terminal: they lean back and watch. */
  watching: boolean;
}

/**
 * Showing the phone, in station space. The hand grips it in its stand, then
 * holds it up beside the head, screen turned to the camera over the shoulder.
 */
const SHOW = (() => {
  const hold = PHONE_SHOT.hold.clone();
  const z = PHONE_SHOT.cam.clone().sub(hold).normalize();
  const x = new Vector3().crossVectors(new Vector3(0, 1, 0), z).normalize();
  const y = new Vector3().crossVectors(z, x);
  const holdQ = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
  // a hand isn't a tripod: the phone leans a little in it
  holdQ.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -0.07));
  const wristHold = hold.clone().addScaledVector(z, -0.024).addScaledVector(y, -0.074);
  const wristGrab = PHONE_REST.center.clone().add(new Vector3(-0.012, -0.05, -0.055));
  return {
    holdQ,
    wristHold,
    wristGrab,
    /** Phone centre relative to the wrist, gripping in the stand and holding up. */
    offGrab: PHONE_REST.center.clone().sub(wristGrab),
    offHold: hold.clone().sub(wristHold),
  };
})();
const SHOW_UP = 1.5;
const SHOW_DOWN = 1.15;

type PartName =
  | 'head' | 'ear' | 'neck' | 'torso' | 'collar' | 'tie' | 'pelvis'
  | 'thigh' | 'shin' | 'shoe' | 'upperArm' | 'forearm' | 'cuff' | 'hand' | 'headphones'
  | `hair-${HairStyle}`;

const _m = new Matrix4();
const _m2 = new Matrix4();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _v = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _s = new Vector3();
const _base = new Matrix4();
const _torso = new Matrix4();
const _head = new Matrix4();
const ZERO = new Matrix4().makeScale(0, 0, 0);

export class Workers {
  readonly workers: Worker[] = [];
  /** Handsets the workers pick up; placed from their hands every frame. */
  phones: Phones | null = null;
  private parts = new Map<PartName, InstancedMesh>();
  private readonly skinMat = new MeshStandardMaterial({ roughness: 0.62, metalness: 0 });
  private readonly clothMat = new MeshStandardMaterial({ roughness: 0.88, metalness: 0 });
  private readonly gearMat = new MeshStandardMaterial({ roughness: 0.35, metalness: 0.4 });
  private readonly hairMat = new MeshStandardMaterial({ roughness: 0.78, metalness: 0 });

  constructor(root: Object3D, desks: { desk: Desk; seed: string }[], shadows: boolean) {
    const n = desks.length;
    desks.forEach(({ desk, seed }, i) => {
      const s = hashString(seed);
      const rand = mulberry32(s ^ 0x9e3779b9);
      const w: Worker = {
        desk,
        look: lookFor(s),
        rand,
        state: 'type',
        stateTime: rand() * 4,
        stateDur: 5 + rand() * 5,
        speed: 0.85 + rand() * 0.4,
        phase: rand() * 100,
        legs: Math.floor(rand() * 3),
        pose: newPose(),
        target: newPose(),
        wristL: new Vector3(),
        mugAttached: false,
        bob: 0,
        focused: 0,
        notice: 0,
        noticeTarget: 0,
        show: 0,
        showTarget: 0,
        watching: false,
      };
      if (i % 3 === 1) w.state = 'mouse';
      this.workers.push(w);
    });

    const add = (name: PartName, geo: BufferGeometry, mat: MeshStandardMaterial, count: number) => {
      const m = new InstancedMesh(geo, mat, count);
      m.castShadow = shadows;
      m.receiveShadow = shadows;
      m.frustumCulled = false;
      m.name = `worker-${name}`;
      root.add(m);
      this.parts.set(name, m);
      return m;
    };

    add('head', new SphereGeometry(0.1, 28, 20), this.skinMat, n);
    add('ear', new SphereGeometry(0.022, 10, 8).scale(0.6, 1, 0.8), this.skinMat, n * 2);
    add('neck', new CylinderGeometry(0.043, 0.05, 0.11, 14), this.skinMat, n);
    add('torso', torsoGeometry(), this.clothMat, n);
    add('collar', new RoundedBoxGeometry(0.1, 0.1, 0.03, 2, 0.008).rotateZ(Math.PI / 4), this.clothMat, n);
    add('tie', new RoundedBoxGeometry(0.034, 0.17, 0.012, 2, 0.005), this.clothMat, n);
    add('pelvis', new RoundedBoxGeometry(0.3, 0.14, 0.3, 3, 0.06), this.clothMat, n);
    add('thigh', new CapsuleGeometry(0.068, 0.32, 6, 14), this.clothMat, n * 2);
    add('shin', new CapsuleGeometry(0.052, 0.34, 6, 12), this.clothMat, n * 2);
    add('shoe', new RoundedBoxGeometry(0.09, 0.07, 0.25, 3, 0.03), this.gearMat, n * 2);
    add('upperArm', new CapsuleGeometry(0.05, ARM_A - 0.04, 6, 12), this.clothMat, n * 2);
    add('forearm', new CapsuleGeometry(0.043, ARM_B - 0.05, 6, 12), this.clothMat, n * 2);
    add('cuff', new CylinderGeometry(0.046, 0.046, 0.024, 14), this.clothMat, n * 2);
    add('hand', new RoundedBoxGeometry(0.064, 0.026, 0.086, 3, 0.012), this.skinMat, n * 2);
    add('headphones', headphonesGeometry(), this.gearMat, n);
    for (const style of HAIRSTYLES) add(`hair-${style}`, hairGeometry(style), this.hairMat, n);

    // colours
    this.workers.forEach((w, i) => {
      const L = w.look;
      this.color('head', i, L.skin);
      this.color('ear', i * 2, L.skin);
      this.color('ear', i * 2 + 1, L.skin);
      this.color('neck', i, L.skin);
      this.color('torso', i, L.top);
      this.color('collar', i, L.shirt);
      this.color('tie', i, L.tie ?? L.shirt);
      this.color('pelvis', i, L.pants);
      for (const k of [0, 1]) {
        this.color('thigh', i * 2 + k, L.pants);
        this.color('shin', i * 2 + k, L.pants);
        this.color('shoe', i * 2 + k, new Color('#17181a'));
        this.color('upperArm', i * 2 + k, L.top);
        this.color('forearm', i * 2 + k, L.top);
        this.color('cuff', i * 2 + k, L.shirt);
        this.color('hand', i * 2 + k, L.skin);
      }
      this.color('headphones', i, new Color(i % 2 ? '#c9cccd' : '#232526'));
      for (const style of HAIRSTYLES) this.color(`hair-${style}`, i, L.hair);
    });
    for (const m of this.parts.values()) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  private color(name: PartName, i: number, c: Color) {
    this.parts.get(name)!.setColorAt(i, c);
  }

  /** The hovered desk's worker glances up at the visitor. */
  setHover(desk: Desk | null) {
    for (const w of this.workers) w.noticeTarget = w.desk === desk ? 1 : 0;
  }

  /** Mark one worker as being looked at (camera over their shoulder). */
  setFocus(desk: Desk | null) {
    for (const w of this.workers) w.focused = w.desk === desk ? 1 : 0;
  }

  /** The worker at `desk` holds their phone up for the visitor (or puts it back). */
  setShowing(desk: Desk | null, on: boolean) {
    for (const w of this.workers) if (w.desk === desk) w.showTarget = on ? 1 : 0;
  }

  /** A film is on at `desk`: its worker sits back to watch. */
  setWatching(desk: Desk | null, on: boolean) {
    for (const w of this.workers) {
      if (w.desk !== desk || w.watching === on) continue;
      w.watching = on;
      w.state = on ? 'watch' : 'type';
      w.stateTime = 0;
      w.stateDur = on ? 7 + w.rand() * 4 : 4 + w.rand() * 4;
    }
  }

  private eye = new Vector3();

  update(dt: number, time: number, cameraPos?: Vector3) {
    if (cameraPos) this.eye.copy(cameraPos);
    this.workers.forEach((w, i) => {
      this.think(w, dt);
      this.solve(w, dt, time);
      this.write(w, i, time);
    });
    for (const m of this.parts.values()) m.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- state machine ---------------- */

  private think(w: Worker, dt: number) {
    w.stateTime += dt;
    if (w.stateTime < w.stateDur) return;
    // pick the next activity; typing is the default rhythm of the floor
    let total = 0;
    for (const s of STATES) total += s.s === w.state ? 0 : s.w;
    let r = w.rand() * total;
    let next: (typeof STATES)[number] = STATES[0];
    for (const s of STATES) {
      if (s.s === w.state) continue;
      r -= s.w;
      if (r <= 0) { next = s; break; }
    }
    if (next.s === 'sip' && !w.desk.hasMug) next = STATES[0];
    // when the camera is over their shoulder, keep them mostly working
    if (w.focused && !['type', 'mouse', 'sip', 'think'].includes(next.s)) next = STATES[0];
    // a film on: sit back, the odd sip, the odd thought
    if (w.watching) {
      const r = w.rand();
      next = STATES.find((x) => x.s === (r < 0.62 || (r < 0.8 && !w.desk.hasMug) ? 'watch' : r < 0.8 ? 'sip' : 'think'))!;
    }
    // holding the phone up: the rest of the body keeps still
    if (w.showTarget || w.show > 0) next = STATES[0];
    w.state = next.s;
    w.stateTime = 0;
    w.stateDur = next.d[0] + w.rand() * (next.d[1] - next.d[0]);
  }

  /* ---------------- pose targets + damping ---------------- */

  private solve(w: Worker, dt: number, time: number) {
    const T = w.target;
    const t = w.stateTime;
    const u = clamp(t / w.stateDur);
    const k = time * w.speed + w.phase;
    const kb = KEYBOARD;

    // defaults: hands on the keyboard, gaze on the screen
    T.lean = 0.15;
    T.twist = 0;
    T.side = Math.sin(k * 0.31) * 0.02;
    T.headYaw = Math.sin(k * 0.23) * 0.06;
    T.headPitch = 0.17;
    T.headRoll = Math.sin(k * 0.17) * 0.03;
    T.swivel = Math.sin(k * 0.11) * 0.04;
    T.rollBack = 0;
    T.flare = 0;
    T.handL.set(kb.x + 0.088, 0.79, kb.z - 0.07);
    T.handR.set(kb.x - 0.088, 0.79, kb.z - 0.07);
    let lambda = 6;

    switch (w.state) {
      case 'type': {
        // bursts of typing with little pauses
        const burst = smoothstep(0.1, 0.4, Math.sin(k * 0.9) * 0.5 + 0.5 + Math.sin(k * 2.3) * 0.2);
        const tapL = Math.pow(Math.max(0, Math.sin(k * 15.0)), 6) * 0.014 * burst;
        const tapR = Math.pow(Math.max(0, Math.sin(k * 15.0 + 2.1)), 6) * 0.014 * burst;
        T.handL.y += tapL;
        T.handR.y += tapR;
        T.handL.x += Math.sin(k * 1.7) * 0.012 * burst;
        T.handR.x += Math.sin(k * 1.3 + 1) * 0.012 * burst;
        T.headPitch = 0.17 + Math.sin(k * 0.7) * 0.03;
        lambda = 14;
        break;
      }
      case 'mouse': {
        T.twist = -0.07;
        T.handR.set(MOUSE.x + Math.sin(k * 2.1) * 0.025, 0.778, MOUSE.z - 0.05 + Math.cos(k * 1.6) * 0.02);
        T.handL.set(0.14, 0.768, 0.36);
        T.headYaw = -0.05 + Math.sin(k * 0.5) * 0.05;
        lambda = 9;
        break;
      }
      case 'think': {
        T.lean = -0.06;
        T.headPitch = -0.1;
        T.headYaw = 0.22 * Math.sign(Math.sin(w.phase));
        T.flare = 0.2;
        // right hand to the chin, left arm across the lap
        T.handR.set(-0.03, 1.02, 0.12);
        T.handL.set(0.06, 0.66, 0.24);
        T.swivel = 0.08 * Math.sin(k * 0.4);
        lambda = 4;
        break;
      }
      case 'stretch': {
        const up = smoothstep(0.0, 0.25, u) * (1 - smoothstep(0.7, 0.95, u));
        T.lean = 0.15 - up * 0.38;
        T.headPitch = 0.17 - up * 0.45;
        T.headRoll = Math.sin(t * 1.4) * 0.08 * up;
        T.rollBack = -0.06 * up;
        T.flare = up * 0.6;
        _v.set(0.085, 1.45, -0.05);
        T.handL.lerp(_v, up);
        _v.set(-0.085, 1.45, -0.05);
        T.handR.lerp(_v, up);
        lambda = 4.5;
        break;
      }
      case 'relax': {
        const r = smoothstep(0.0, 0.2, u) * (1 - smoothstep(0.82, 1, u));
        T.lean = 0.15 - r * 0.38;
        T.headPitch = 0.17 - r * 0.32;
        T.rollBack = -0.1 * r;
        T.flare = r;
        T.swivel = Math.sin(k * 0.35) * 0.1 * r;
        _v.set(0.07, 1.27, -0.22);
        T.handL.lerp(_v, r);
        _v.set(-0.07, 1.27, -0.22);
        T.handR.lerp(_v, r);
        lambda = 3.5;
        break;
      }
      case 'sip': {
        // reach → lift → drink → return
        const reach = smoothstep(0.0, 0.18, u) * (1 - smoothstep(0.86, 0.98, u));
        const lift = smoothstep(0.22, 0.42, u) * (1 - smoothstep(0.66, 0.84, u));
        const mug = _v.set(MUG.x - 0.045, MUG.y + 0.06, MUG.z - 0.05);
        const mouth = _v2.set(0.05, 1.12, 0.07);
        T.handL.lerp(mug, reach).lerp(mouth, lift);
        T.headPitch = 0.17 - lift * 0.3;
        T.lean = 0.15 - lift * 0.1;
        T.twist = 0.06 * reach;
        w.mugAttached = u > 0.18 && u < 0.86;
        lambda = 7;
        break;
      }
      case 'look': {
        const dir = Math.sin(w.phase * 3.1) > 0 ? 1 : -1;
        const l = smoothstep(0, 0.2, u) * (1 - smoothstep(0.8, 1, u));
        T.headYaw = 0.85 * dir * l;
        T.twist = 0.22 * dir * l;
        T.headPitch = 0.17 - 0.2 * l;
        T.lean = 0.15 - 0.12 * l;
        lambda = 4;
        break;
      }
      case 'watch': {
        // sat back, hands in the lap, eyes on the tube
        T.lean = -0.1;
        T.rollBack = -0.05;
        T.headPitch = 0.08 + Math.sin(k * 0.19) * 0.02;
        T.headYaw = Math.sin(k * 0.13) * 0.04;
        T.swivel = Math.sin(k * 0.09) * 0.05;
        T.handL.set(0.085, 0.655, 0.27);
        T.handR.set(-0.065, 0.65, 0.29);
        lambda = 3.5;
        break;
      }
      case 'swivel': {
        const l = smoothstep(0, 0.15, u) * (1 - smoothstep(0.85, 1, u));
        T.swivel = Math.sin(t * 1.25) * 0.26 * l;
        T.rollBack = -0.07 * l;
        T.lean = 0.15 - 0.2 * l;
        T.headPitch = 0.17 - 0.15 * l;
        _v.set(0.12, 0.64, 0.24);
        T.handL.lerp(_v, l);
        _v.set(-0.12, 0.64, 0.24);
        T.handR.lerp(_v, l);
        lambda = 3.5;
        break;
      }
    }
    if (w.state !== 'sip') w.mugAttached = false;

    // showing the phone: reach into the stand, then hold it up beside the head
    const up = w.showTarget > w.show;
    w.show = clamp(w.show + (up ? dt / SHOW_UP : -dt / SHOW_DOWN) * (w.show === w.showTarget ? 0 : 1));
    if (w.show > 0) {
      const sh = w.show;
      const reach = smoothstep(0.0, 0.3, sh);
      const lift = smoothstep(0.32, 1.0, sh);
      T.handL.lerp(SHOW.wristGrab, reach).lerp(SHOW.wristHold, lift);
      _v.set(-0.12, 0.775, 0.33);
      T.handR.lerp(_v, reach);
      T.lean = lerp(T.lean, 0.32, reach * (1 - lift));
      T.lean = lerp(T.lean, 0.02, lift);
      T.twist = lerp(T.twist, 0.14, lift);
      T.headYaw = lerp(T.headYaw, 0.42, lift);
      T.headPitch = lerp(T.headPitch, 0.04, lift);
      T.headRoll = lerp(T.headRoll, 0.06, lift);
      T.swivel = lerp(T.swivel, 0.06, lift);
      T.rollBack = 0;
      T.flare = lerp(T.flare, 0.2, lift);
      lambda = 8;
    }

    // noticing the visitor: turn toward the camera, hold a beat
    w.notice = damp(w.notice, w.noticeTarget, 3.5, dt);
    if (w.notice > 0.01) {
      const local = _v3.copy(this.eye).applyMatrix4(_m.copy(w.desk.matrix).invert());
      const yaw = Math.atan2(local.x, local.z);
      const pitch = -Math.atan2(local.y - 1.2, Math.hypot(local.x, local.z));
      const n = w.notice;
      T.headYaw = T.headYaw * (1 - n) + clamp(yaw, -1.25, 1.25) * 0.85 * n;
      T.twist = T.twist * (1 - n) + clamp(yaw, -1, 1) * 0.25 * n;
      T.headPitch = T.headPitch * (1 - n) + clamp(pitch, -0.5, 0.3) * n;
      T.lean = T.lean * (1 - n) + 0.04 * n;
    }

    // headphones: a small groove in everything
    if (w.look.headphones) {
      const beat = Math.sin(time * Math.PI * 2 * 1.85 + w.phase);
      T.headPitch += beat * 0.045;
      T.headRoll += Math.sin(time * Math.PI * 1.85 + w.phase) * 0.03;
    }
    // breathing
    T.lean += Math.sin(time * 1.6 + w.phase) * 0.008;

    const P = w.pose;
    const lp = 5;
    P.lean = damp(P.lean, T.lean, lp, dt);
    P.twist = damp(P.twist, T.twist, lp, dt);
    P.side = damp(P.side, T.side, lp, dt);
    P.headYaw = damp(P.headYaw, T.headYaw, lp * 1.2, dt);
    P.headPitch = damp(P.headPitch, T.headPitch, w.look.headphones ? 12 : lp * 1.2, dt);
    P.headRoll = damp(P.headRoll, T.headRoll, lp, dt);
    P.swivel = damp(P.swivel, T.swivel, 4, dt);
    P.rollBack = damp(P.rollBack, T.rollBack, 3, dt);
    P.flare = damp(P.flare, T.flare, 4, dt);
    const a = 1 - Math.exp(-lambda * dt);
    P.handL.lerp(T.handL, a);
    P.handR.lerp(T.handR, a);
  }

  /* ---------------- rig → instance matrices ---------------- */

  private write(w: Worker, i: number, _time: number) {
    const P = w.pose;
    const L = w.look;
    const desk = w.desk;
    const S = desk.matrix;

    // chair frame: the worker sits on it, so it swivels and rolls with them
    desk.chair.x = 0;
    desk.chair.z = P.rollBack;
    desk.chair.yaw = P.swivel;
    _base.makeRotationY(P.swivel).setPosition(0, 0, P.rollBack);

    const set = (name: PartName, idx: number, local: Matrix4) => {
      _m.multiplyMatrices(S, local);
      this.parts.get(name)!.setMatrixAt(idx, _m);
    };
    const toStation = (v: Vector3) => v.applyMatrix4(_base);

    // pelvis + torso
    const pelvis = _v.set(0, 0.5, -0.02);
    _q.setFromAxisAngle(UP, P.twist);
    _q2.setFromAxisAngle(_v2.set(1, 0, 0), P.lean);
    _q.multiply(_q2);
    _q2.setFromAxisAngle(_v2.set(0, 0, 1), P.side);
    _q.multiply(_q2);
    _torso.compose(pelvis.clone(), _q, _s.set(L.build, 1, L.build)).premultiply(_base);

    _m2.compose(_v2.set(0, 0.52, -0.02), _q2.identity(), _s.set(L.build, 1, 1)).premultiply(_base);
    set('pelvis', i, _m2);
    set('torso', i, _torso);

    // shirt V + tie on the chest
    set('collar', i, _m2.copy(_torso).multiply(_m.compose(_v2.set(0, 0.47, 0.098), _q2.setFromAxisAngle(_v3.set(1, 0, 0), -0.35), _s.set(1, 1, 1))));
    if (L.tie) set('tie', i, _m2.copy(_torso).multiply(_m.compose(_v2.set(0, 0.36, 0.11), _q2.setFromAxisAngle(_v3.set(1, 0, 0), -0.12), _s.set(1, 1, 1))));
    else this.parts.get('tie')!.setMatrixAt(i, ZERO);

    // neck + head
    const neckBase = new Vector3(0, 0.5, 0).applyMatrix4(_torso);
    _m2.copy(_torso).multiply(_m.makeTranslation(0, 0.55, 0.005));
    set('neck', i, _m2);

    const headQ = new Quaternion().setFromRotationMatrix(_torso);
    headQ.multiply(_q2.setFromAxisAngle(UP, P.headYaw));
    headQ.multiply(_q2.setFromAxisAngle(_v3.set(1, 0, 0), P.headPitch));
    headQ.multiply(_q2.setFromAxisAngle(_v3.set(0, 0, 1), P.headRoll));
    const headPos = new Vector3(0, 0.14, 0.012).applyQuaternion(headQ).add(neckBase).add(_v3.set(0, 0.04, 0).applyQuaternion(headQ));
    _head.compose(headPos, headQ, _s.set(1, 1, 1));
    set('head', i, _m2.copy(_head).multiply(_m.makeScale(L.headScale.x, L.headScale.y, L.headScale.z)));
    const ex = 0.1 * L.headScale.x - 0.006;
    set('ear', i * 2, _m2.copy(_head).multiply(_m.makeTranslation(ex, -0.008, -0.004)));
    set('ear', i * 2 + 1, _m2.copy(_head).multiply(_m.makeTranslation(-ex, -0.008, -0.004)));
    for (const style of HAIRSTYLES) {
      if (style === L.hairStyle) set(`hair-${style}`, i, _m2.copy(_head).multiply(_m.makeScale(L.headScale.x * 1.03, L.headScale.y * 1.01, L.headScale.z * 1.03)));
      else this.parts.get(`hair-${style}`)!.setMatrixAt(i, ZERO);
    }
    if (L.headphones) set('headphones', i, _m2.copy(_head).multiply(_m.makeScale(L.headScale.x * 1.06, L.headScale.y, L.headScale.z)));
    else this.parts.get('headphones')!.setMatrixAt(i, ZERO);

    // arms (2-bone IK, station space)
    for (const side of [1, -1]) {
      const idx = i * 2 + (side > 0 ? 0 : 1);
      const shoulder = new Vector3(0.172 * side * L.build, 0.43, 0.0).applyMatrix4(_torso);
      const target = (side > 0 ? P.handL : P.handR).clone();
      const pole = new Vector3(side * (0.45 + P.flare * 1.2), -0.7 + P.flare * 0.8, -0.55 + P.flare * 0.2)
        .applyQuaternion(_q.setFromRotationMatrix(_torso));
      const { elbow, wrist } = solveIK(shoulder, target, pole, ARM_A, ARM_B);
      if (side > 0) w.wristL.copy(wrist);

      setSegment(this.parts.get('upperArm')!, idx, shoulder, elbow, S);
      setSegment(this.parts.get('forearm')!, idx, elbow, wrist, S);

      const dirF = _v3.subVectors(wrist, elbow).normalize();
      _q.setFromUnitVectors(UP, dirF);
      _m2.compose(_v2.copy(wrist).addScaledVector(dirF, -0.012), _q, _s.set(1, 1, 1));
      set('cuff', idx, _m2);

      // hand: forward along the forearm, palm facing down where possible
      const fwd = dirF.clone();
      const refUp = Math.abs(fwd.y) > 0.85 ? new Vector3(0, 0, 1) : UP;
      const xAxis = new Vector3().crossVectors(refUp, fwd).normalize();
      const yAxis = new Vector3().crossVectors(fwd, xAxis).normalize();
      _m2.makeBasis(xAxis, yAxis, fwd).setPosition(_v2.copy(wrist).addScaledVector(fwd, 0.044));
      set('hand', idx, _m2);
    }

    // legs (fixed seated pose, three variants)
    for (const side of [1, -1]) {
      const idx = i * 2 + (side > 0 ? 0 : 1);
      const crossed = w.legs === 1;
      const stretched = w.legs === 2 && side < 0;
      const hip = toStation(new Vector3(0.092 * side, 0.5, 0.0));
      const knee = toStation(new Vector3(0.1 * side, 0.49, stretched ? 0.44 : 0.4));
      const ankle = toStation(new Vector3(
        crossed ? -0.02 * side : 0.11 * side,
        stretched ? 0.08 : 0.1 + (crossed && side > 0 ? 0.03 : 0),
        stretched ? 0.62 : crossed ? 0.36 : 0.44,
      ));
      setSegment(this.parts.get('thigh')!, idx, hip, knee, S);
      setSegment(this.parts.get('shin')!, idx, knee, ankle, S);
      _q.setFromAxisAngle(UP, P.swivel + (crossed ? -0.25 * side : 0));
      _m2.compose(_v2.copy(ankle).add(_v3.set(0, -0.06, 0.06)), _q, _s.set(1, 1, 1));
      set('shoe', idx, _m2);
    }

    // the phone: in its stand, or in the left hand
    if (this.phones?.get(desk)) {
      const sh = w.show;
      const grip = smoothstep(0.26, 0.34, sh);
      const lift = smoothstep(0.32, 1.0, sh);
      _v2.copy(SHOW.offGrab).lerp(SHOW.offHold, lift).add(w.wristL);
      _v2.lerpVectors(PHONE_REST.center, _v2, grip);
      _q.copy(PHONE_REST.quat).slerp(SHOW.holdQ, lift);
      this.phones.place(desk, _m2.compose(_v2, _q, _s.set(1, 1, 1)).premultiply(S));
    }

    // mug in hand
    if (w.mugAttached && desk.hasMug) {
      const m = desk.mugOverride ?? new Matrix4();
      _q.setFromAxisAngle(UP, P.swivel);
      m.compose(_v2.copy(w.wristL).add(_v3.set(0.02, -0.035, 0.06)), _q, _s.set(1, 1, 1));
      m.premultiply(S);
      desk.mugOverride = m;
    } else {
      desk.mugOverride = null;
    }
  }
}

/* -------------------------------------------------------------------------- */

function solveIK(shoulder: Vector3, target: Vector3, pole: Vector3, a: number, b: number) {
  const d = new Vector3().subVectors(target, shoulder);
  let dist = d.length();
  const u = d.normalize();
  dist = clamp(dist, Math.abs(a - b) + 0.01, a + b - 0.002);
  const cosA = clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const v = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u)));
  if (v.lengthSq() < 1e-6) v.set(0, -1, 0);
  v.normalize();
  const elbow = shoulder.clone().addScaledVector(u, a * cosA).addScaledVector(v, a * sinA);
  const wrist = shoulder.clone().addScaledVector(u, dist);
  return { elbow, wrist };
}

const _seg = new Matrix4();
const _segQ = new Quaternion();
const _segP = new Vector3();
const _segD = new Vector3();
function setSegment(mesh: InstancedMesh, idx: number, a: Vector3, b: Vector3, station: Matrix4) {
  _segD.subVectors(b, a);
  _segQ.setFromUnitVectors(UP, _segD.normalize());
  _segP.addVectors(a, b).multiplyScalar(0.5);
  _seg.compose(_segP, _segQ, _s.set(1, 1, 1)).premultiply(station);
  mesh.setMatrixAt(idx, _seg);
}
