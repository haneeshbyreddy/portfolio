import { Vector2, Vector3 } from 'three';
import { clamp, damp, easeInOutCubic, lerp, smoothstep } from './math';
import type { ShiftCamera } from './ShiftCamera';
import type { Desk } from '../office/Office';
import { floorBounds } from '../office/layout';
import { PHONE_SHOT } from '../office/Phones';
import type { Device } from '../data/projects';

export interface Pose {
  pos: Vector3;
  target: Vector3;
  fov: number;
  shift: Vector2;
}

const pose = (): Pose => ({ pos: new Vector3(), target: new Vector3(), fov: 35, shift: new Vector2() });
const copyPose = (a: Pose, b: Pose) => {
  a.pos.copy(b.pos);
  a.target.copy(b.target);
  a.fov = b.fov;
  a.shift.copy(b.shift);
  return a;
};

export type Mode = 'intro' | 'overview' | 'focus';

/**
 * The overview, as the visitor steers it: the camera circles a pivot on the
 * floor. Zoom carries the framing with it — far out it's the establishing
 * shot with the floor low in frame; close in the camera settles lower and the
 * pivot rises toward the middle of the picture.
 */
interface View {
  /** Pivot on the floor. */
  x: number;
  z: number;
  /** 0 = the establishing shot, 1 = as close as the overview goes. Briefly past either end while stretching. */
  zoom: number;
  /** Turn around the pivot (radians). */
  az: number;
  /** Elevation on top of what the zoom sets (radians). */
  tilt: number;
}

/** Lens and framing for the current aspect. `far` / `near` are the two ends of the zoom. */
interface Framing {
  fov: number;
  /** Camera-to-pivot distance. */
  far: number;
  near: number;
  /** Camera elevation over the pivot. */
  elFar: number;
  elNear: number;
  /** Where the pivot sits on screen, in NDC y. */
  yFar: number;
  yNear: number;
}

const FLOOR = floorBounds();
const MID = { x: (FLOOR.x0 + FLOOR.x1) / 2, z: (FLOOR.z0 + FLOOR.z1) / 2 };
const HALF = { x: (FLOOR.x1 - FLOOR.x0) / 2, z: (FLOOR.z1 - FLOOR.z0) / 2 };
const HOME: View = { x: MID.x, z: MID.z, zoom: 0, az: 0, tilt: 0 };

/** The pivot rides at desk height; zoom anchors a little higher, on desktops and screens. */
const PIVOT_Y = 0.55;
const ANCHOR_Y = 0.8;
/**
 * How far the pivot may wander from the middle of the floor when fully zoomed
 * in. At the establishing shot it can't: a drag there only stretches, and
 * springs back to the composed frame.
 */
const ROAM = { x: HALF.x - 0.5, z: HALF.z - 0.6 };
const AZ_MAX = 0.62;
const TILT = { min: -0.08, max: 0.5 };
/** How far each axis gives past its limit before it stops. */
const STRETCH = { pan: 2.4, zoom: 0.14, turn: 0.16, tilt: 0.1, look: 0.06 };
const LOOK = { x: 0.13, y: 0.07 };
const UP = new Vector3(0, 1, 0);

/** Resistance for a move of sign `delta` on an axis that may already be past [min, max]. */
const give = (value: number, min: number, max: number, stretch: number, delta: number) => {
  const over = delta > 0 ? value - max : min - value;
  return over > 0 ? Math.max(0, 1 - over / stretch) ** 2 : 1;
};

function framingFor(aspect: number): Framing {
  // 0 = phone portrait, 1 = landscape
  const w = smoothstep(0.7, 1.3, aspect);
  const fov = lerp(46, 37, w);
  const tan = Math.tan((fov * Math.PI) / 360);
  // back far enough that the front row (≈5 m nearer than the pivot) fits across
  const halfWidth = lerp(8.4, HALF.x + 0.9, w);
  const fit = halfWidth / (tan * aspect) + 5;
  return {
    fov,
    far: Math.max(26.1, fit),
    near: lerp(11, 10, w),
    elFar: lerp(0.42, 0.2915, w),
    elNear: lerp(0.44, 0.38, w),
    yFar: lerp(-0.12, -0.32, w),
    yNear: lerp(0.02, -0.04, w),
  };
}

const _a = new Vector3();
const _b = new Vector3();
const _f = new Vector3();
const _r = new Vector3();
const _u = new Vector3();
const _d = new Vector3();

/**
 * Directs the camera. Three shots:
 *  - intro: eye level in the tall grass, looking at the hills (refs 3 + 4)
 *  - overview: the floor, steered by the visitor (see `View`)
 *  - focus: over a worker's shoulder onto their monitor (ref 2), framed with
 *    a shift lens so the screen sits beside the project panel — or, when
 *    they hold their phone up to show you, leaning in on that
 */
export class CameraRig {
  mode: Mode = 'intro';
  focusDesk: Desk | null = null;
  /** What the focus shot is about: the terminal, or the phone in the worker's hand. */
  subject: Device = 'terminal';

  /** What's on screen, and where it's heading. Input moves `goal`; `view` follows. */
  private view: View = { ...HOME };
  private goal: View = { ...HOME };
  private framing = framingFor(16 / 10);
  private framedAspect = 0;

  // direct manipulation
  private grabbing = false;
  private turning = false;
  private pinching = false;
  private grabPoint = new Vector3();
  private samples: { t: number; x: number; z: number; az: number; tilt: number }[] = [];
  private vel = new Vector2();
  private spin = new Vector2();
  /** Clock time of the last wheel or key step; stretched limits hold until it goes quiet. */
  private stepped = -1;
  private tween: { from: View; to: View; t0: number; dur: number } | null = null;
  /** The world point a wheel gesture zooms toward, held for the whole gesture. */
  private anchor = { point: new Vector3(), weight: 0, t: -1 };

  // focus: a short look around the station that springs back on release
  private look = new Vector2();
  private looking = false;

  // pointer parallax (-1..1)
  readonly pointer = new Vector2();
  private parallax = new Vector2();

  // shot transitions
  private from = pose();
  private current = pose();
  private desired = pose();
  private scratch = pose();
  private clock = 0;
  private tStart = 0;
  private tDur = 0;
  private transitioning = false;
  private lift = 0;
  onArrive: (() => void) | null = null;

  /** Layout hint from the UI: where the subject should sit on screen. */
  layout: 'wide' | 'tall' = 'wide';
  reducedMotion = false;

  constructor(private camera: ShiftCamera) {
    this.introPose(this.current);
    this.apply();
  }

  /* ------------------------------------------------------------------ */
  /* Shots                                                               */
  /* ------------------------------------------------------------------ */

  private introPose(p: Pose) {
    p.pos.set(3.5, 1.15, 52);
    p.target.set(-2, 3.2, -40);
    p.fov = 40;
    p.shift.set(0, 0);
    return p;
  }

  private distance(v: View) {
    const f = this.framing;
    return f.far * Math.pow(f.near / f.far, v.zoom);
  }

  private viewPose(v: View, p: Pose, parallax = true) {
    const f = this.framing;
    const t = clamp(v.zoom);
    const d = this.distance(v);
    const az = v.az + (parallax ? this.parallax.x * 0.025 : 0);
    const el = lerp(f.elFar, f.elNear, t) + v.tilt + (parallax ? this.parallax.y * 0.012 : 0);
    // aim above the pivot so it lands at the framing's height on screen
    const sy = lerp(f.yFar, f.yNear, t);
    const aim = el - Math.atan(-sy * Math.tan((f.fov * Math.PI) / 360));
    const sa = Math.sin(az), ca = Math.cos(az);
    p.pos.set(v.x + sa * Math.cos(el) * d, PIVOT_Y + Math.sin(el) * d, v.z + ca * Math.cos(el) * d);
    p.target.set(
      p.pos.x - sa * Math.cos(aim) * d,
      p.pos.y - Math.sin(aim) * d,
      p.pos.z - ca * Math.cos(aim) * d,
    );
    p.fov = f.fov;
    p.shift.set(0, 0);
    return p;
  }

  private focusPose(p: Pose, desk: Desk) {
    const tall = this.layout === 'tall';
    const occupied = desk.occupied;
    if (this.subject === 'phone') return this.phonePose(p, desk, tall);
    // station space: chair at origin, +Z toward the monitor, +X = worker's left
    // an open desk is framed a step further back, so its sheet can be whisked off in shot
    const camLocal = occupied
      ? new Vector3(0.66, 1.58, -0.98)
      : new Vector3(0.24, 1.4, -1.12);
    const targetLocal = occupied ? new Vector3(0.0, 0.96, 0.6) : new Vector3(0.03, 0.95, 0.6);
    if (tall) {
      camLocal.set(occupied ? 0.46 : 0.1, occupied ? 1.62 : 1.48, occupied ? -1.0 : -1.2);
      targetLocal.set(0.02, occupied ? 0.93 : 0.92, 0.62);
    }
    p.pos.copy(camLocal).applyMatrix4(desk.matrix);
    p.target.copy(targetLocal).applyMatrix4(desk.matrix);
    // parallax: a breath of handheld movement
    p.pos.x += this.parallax.x * 0.025;
    p.pos.y += this.parallax.y * 0.015;
    // the visitor's look around the station
    if (this.look.x || this.look.y) {
      const dir = _d.subVectors(p.target, p.pos).applyAxisAngle(UP, this.look.x);
      dir.applyAxisAngle(_r.crossVectors(dir, UP).normalize(), this.look.y);
      p.target.copy(p.pos).add(dir);
    }
    p.fov = tall ? 44 : 31;
    p.shift.set(tall ? 0 : 0.3, tall ? 0.42 : 0.0);
    return p;
  }

  /** Leaning in over the left shoulder at the phone held up beside the head. */
  private phonePose(p: Pose, desk: Desk, tall: boolean) {
    const cam = _a.copy(PHONE_SHOT.cam);
    const aim = _b.copy(PHONE_SHOT.aim);
    // portrait: further back along the line the phone faces, so it fits above the sheet
    if (tall) cam.sub(PHONE_SHOT.hold).multiplyScalar(1.45).add(PHONE_SHOT.hold);
    p.pos.copy(cam).applyMatrix4(desk.matrix);
    p.target.copy(aim).applyMatrix4(desk.matrix);
    p.pos.x += this.parallax.x * 0.012;
    p.pos.y += this.parallax.y * 0.008;
    if (this.look.x || this.look.y) {
      const dir = _d.subVectors(p.target, p.pos).applyAxisAngle(UP, this.look.x);
      dir.applyAxisAngle(_r.crossVectors(dir, UP).normalize(), this.look.y);
      p.target.copy(p.pos).add(dir);
    }
    p.fov = tall ? 40 : 30;
    p.shift.set(tall ? 0 : 0.3, tall ? 0.46 : 0.0);
    return p;
  }

  /** Move between the terminal and the phone without leaving the desk. */
  frame(subject: Device) {
    if (subject === this.subject) return;
    this.subject = subject;
    if (this.mode !== 'focus' || !this.focusDesk) return;
    copyPose(this.from, this.current);
    this.look.set(0, 0);
    this.computeDesired();
    this.tDur = this.reducedMotion ? 0.5 : 1.45;
    this.lift = 0;
    this.tStart = this.clock;
    this.transitioning = true;
  }

  private computeDesired() {
    if (this.mode === 'intro') this.introPose(this.desired);
    else if (this.mode === 'overview') this.viewPose(this.view, this.desired);
    else if (this.focusDesk) this.focusPose(this.desired, this.focusDesk);
  }

  /** Begin a move to a new shot. */
  go(mode: Mode, desk: Desk | null = null, duration?: number) {
    const hop = this.mode === 'focus' && mode === 'focus';
    copyPose(this.from, this.current);
    this.mode = mode;
    this.focusDesk = desk;
    this.endManipulation();
    this.look.set(0, 0);
    this.computeDesired();
    const dist = this.from.pos.distanceTo(this.desired.pos);
    this.tDur = this.reducedMotion ? 0.6 : duration ?? clamp(1.25 + dist * 0.035, 1.4, 2.4);
    // desk-to-desk hops arc over the monitors; everything else gets a gentle swoop
    this.lift = hop ? clamp(dist * 0.18, 0.6, 2.4) : dist * 0.04;
    this.tStart = this.clock;
    this.transitioning = true;
  }

  isTransitioning() {
    return this.transitioning;
  }

  /* ------------------------------------------------------------------ */
  /* Steering the overview                                               */
  /* ------------------------------------------------------------------ */

  /** Ray through a point on screen (NDC) for a given pose. */
  private ray(p: Pose, ndc: Vector2, out: Vector3) {
    const fwd = _f.subVectors(p.target, p.pos).normalize();
    const right = _r.crossVectors(fwd, UP).normalize();
    const up = _u.crossVectors(right, fwd);
    const tan = Math.tan((p.fov * Math.PI) / 360);
    return out
      .copy(fwd)
      .addScaledVector(right, (ndc.x - p.shift.x) * tan * this.camera.aspect)
      .addScaledVector(up, (ndc.y - p.shift.y) * tan)
      .normalize();
  }

  /** Where the ray through `ndc` meets the horizontal plane at height `h`. */
  private hitPlane(p: Pose, ndc: Vector2, h: number, out: Vector3) {
    const dir = this.ray(p, ndc, _d);
    if (dir.y > -1e-3) return false;
    const t = (h - p.pos.y) / dir.y;
    if (t <= 0) return false;
    out.copy(p.pos).addScaledVector(dir, t);
    return true;
  }

  /**
   * How far the pivot may roam at a zoom. It opens up exactly as fast as
   * zooming toward any desk needs, so the establishing shot stays composed
   * and zooming back out brings the floor home.
   */
  private roam(zoom: number) {
    const f = this.framing;
    const open = (1 - Math.pow(f.near / f.far, clamp(zoom))) / (1 - f.near / f.far);
    // fully open, any desk can be brought to the middle, and no further
    const rx = ROAM.x * open, rz = ROAM.z * open;
    return { x0: MID.x - rx, x1: MID.x + rx, z0: MID.z - rz, z1: MID.z + rz };
  }

  private stopMomentum() {
    this.tween = null;
    this.vel.set(0, 0);
    this.spin.set(0, 0);
  }

  private endManipulation() {
    this.grabbing = this.turning = this.pinching = this.looking = false;
    this.stopMomentum();
    this.goal = { ...this.view };
  }

  /**
   * Zoom toward the point under `ndc`, which stays put on screen. `scale`
   * multiplies the camera distance (below 1 = closer). Aimed past the edge of
   * the floor, the zoom heads for the pivot instead, so the floor stays in
   * frame however the cursor happens to sit. A `sticky` zoom (wheel, trackpad)
   * keeps the point it started with until the gesture pauses, so the framing
   * sliding under a resting cursor doesn't drag the zoom somewhere else.
   */
  zoomAt(scale: number, ndc?: Vector2, sticky = false) {
    if (this.mode !== 'overview' || !(scale > 0)) return;
    this.tween = null;
    const g = this.goal;
    const f = this.framing;
    let du = -Math.log(scale) / Math.log(f.far / f.near);
    du *= give(g.zoom, 0, 1, STRETCH.zoom, du);
    this.stepped = this.clock;

    const a = this.anchor;
    if (!sticky || this.clock - a.t > 0.25) {
      a.weight = 0;
      if (ndc && this.hitPlane(this.viewPose(g, this.scratch, false), ndc, ANCHOR_Y, a.point)) {
        const ox = Math.max(FLOOR.x0 - a.point.x, 0, a.point.x - FLOOR.x1);
        const oz = Math.max(FLOOR.z0 - a.point.z, 0, a.point.z - FLOOR.z1);
        a.weight = 1 - smoothstep(0.5, 4, Math.hypot(ox, oz));
      }
    }
    a.t = this.clock;
    g.zoom += du;
    if (a.weight > 0 && this.hitPlane(this.viewPose(g, this.scratch, false), ndc!, ANCHOR_Y, _b)) {
      g.x += (a.point.x - _b.x) * a.weight;
      g.z += (a.point.z - _b.z) * a.weight;
    }
    // zooming out draws the pivot back in with the shrinking roam
    const r = this.roam(g.zoom);
    if (!this.grabbing) {
      g.x = clamp(g.x, r.x0, r.x1);
      g.z = clamp(g.z, r.z0, r.z1);
    }
  }

  /** True while the zoom is pressed against its closest limit. */
  atNearLimit() {
    return this.mode === 'overview' && !this.tween && this.goal.zoom >= 0.995;
  }

  /** Start dragging the floor from the point under `ndc`. */
  grabStart(ndc: Vector2) {
    if (this.mode !== 'overview') return;
    this.stopMomentum();
    this.goal.x = this.view.x;
    this.goal.z = this.view.z;
    const p = this.current;
    const d = this.distance(this.view);
    if (!this.hitPlane(p, ndc, PIVOT_Y, this.grabPoint)) this.grabPoint.set(this.view.x, PIVOT_Y, this.view.z);
    // a grab out in the far field handles like a grab at the pivot
    _a.subVectors(this.grabPoint, p.pos).setY(0);
    const reach = d * 1.6;
    if (_a.length() > reach) this.grabPoint.copy(p.pos).addScaledVector(_a.normalize(), reach).setY(PIVOT_Y);
    this.grabbing = true;
    this.samples.length = 0;
    this.sample();
  }

  /**
   * Slide the floor by a screen-space drag, keeping the grabbed point under
   * the finger (within limits: grabs near the horizon don't fling the camera).
   */
  grabMove(dx: number, dy: number, viewHeight: number) {
    if (!this.grabbing) return;
    const p = this.current;
    const g = this.goal;
    const d = this.distance(this.view);
    const fwd = _f.subVectors(p.target, p.pos).normalize();
    const toGrab = _a.subVectors(this.grabPoint, p.pos);
    const depth = clamp(toGrab.dot(fwd), 0.35 * d, 1.5 * d);
    const graze = clamp((p.pos.y - this.grabPoint.y) / toGrab.length(), 0.3, 1);
    const unit = (2 * depth * Math.tan((p.fov * Math.PI) / 360)) / viewHeight;
    const fl = Math.hypot(fwd.x, fwd.z) || 1;
    const fx = fwd.x / fl, fz = fwd.z / fl;
    // right on the ground is (-fz, fx)
    const side = -dx * unit, ahead = (dy * unit) / graze;
    const mx = -fz * side + fx * ahead;
    const mz = fx * side + fz * ahead;
    const r = this.roam(g.zoom);
    g.x += mx * give(g.x, r.x0, r.x1, STRETCH.pan, mx);
    g.z += mz * give(g.z, r.z0, r.z1, STRETCH.pan, mz);
    // the floor stays glued to the hand: no smoothing while held
    this.view.x = g.x;
    this.view.z = g.z;
    this.sample();
  }

  grabEnd() {
    if (!this.grabbing) return;
    this.grabbing = false;
    const v = this.release();
    if (v) this.vel.set(v.x, v.z).clampLength(0, 60);
  }

  /** Start turning around the pivot. */
  turnStart() {
    if (this.mode !== 'overview') return;
    this.stopMomentum();
    this.turning = true;
    this.samples.length = 0;
    this.sample();
  }

  /** Turn around the pivot (radians) and tilt the camera up or down. */
  turn(daz: number, dtilt: number) {
    if (this.mode !== 'overview') return;
    if (!this.turning) this.tween = null;
    const g = this.goal;
    g.az += daz * give(g.az, -AZ_MAX, AZ_MAX, STRETCH.turn, daz);
    g.tilt += dtilt * give(g.tilt, TILT.min, TILT.max, STRETCH.tilt, dtilt);
    if (this.turning) this.sample();
    else this.stepped = this.clock; // hold the stretch a beat, like the wheel
  }

  turnEnd() {
    if (!this.turning) return;
    this.turning = false;
    const v = this.release();
    if (v) this.spin.set(v.az, v.tilt).clampLength(0, 4);
  }

  /** Two-finger gestures move, zoom and turn at once, all held directly. */
  pinchStart(ndc: Vector2) {
    this.grabStart(ndc);
    this.turning = true;
    this.pinching = true;
  }

  /**
   * One step of a two-finger gesture: spread to zoom, twist to turn, move to
   * slide, all about the point between the fingers, which stays under them.
   */
  pinchMove(from: Vector2, to: Vector2, scale: number, twist: number, dx: number, dy: number, viewHeight: number) {
    if (this.mode !== 'overview' || !this.pinching) return;
    const g = this.goal, f = this.framing;
    const pose0 = this.viewPose(g, this.scratch, false);
    // between the fingers is floor (not far field): hold that exact spot
    const held = this.hitPlane(pose0, from, ANCHOR_Y, _a) && _a.distanceTo(pose0.pos) < this.distance(g) * 2.5;
    const du = -Math.log(scale) / Math.log(f.far / f.near);
    g.zoom += du * give(g.zoom, 0, 1, STRETCH.zoom, du);
    g.az += twist * give(g.az, -AZ_MAX, AZ_MAX, STRETCH.turn, twist);
    if (held && this.hitPlane(this.viewPose(g, this.scratch, false), to, ANCHOR_Y, _b)) {
      const mx = _a.x - _b.x, mz = _a.z - _b.z;
      const r = this.roam(g.zoom);
      g.x += mx * give(g.x, r.x0, r.x1, STRETCH.pan, mx);
      g.z += mz * give(g.z, r.z0, r.z1, STRETCH.pan, mz);
      this.view.x = g.x;
      this.view.z = g.z;
      this.sample();
    } else {
      this.grabMove(dx, dy, viewHeight);
    }
  }

  pinchEnd() {
    this.pinching = false;
    this.grabEnd();
    this.turnEnd();
    this.stopMomentum();
  }

  private sample() {
    const t = performance.now() / 1000;
    const g = this.goal;
    this.samples.push({ t, x: g.x, z: g.z, az: g.az, tilt: g.tilt });
    while (this.samples.length > 2 && t - this.samples[0].t > 0.1) this.samples.shift();
  }

  /** Release velocity over the last ~100 ms of the drag, or null if the hand had stopped. */
  private release() {
    const s = this.samples;
    if (this.reducedMotion || s.length < 2) return null;
    const a = s[0], b = s[s.length - 1];
    const now = performance.now() / 1000;
    const dt = b.t - a.t;
    if (now - b.t > 0.06 || dt < 0.012) return null;
    return { x: (b.x - a.x) / dt, z: (b.z - a.z) / dt, az: (b.az - a.az) / dt, tilt: (b.tilt - a.tilt) / dt };
  }

  /** Keyboard flight: x/y in -1..1 slide the floor, `turn` rotates. Called every frame. */
  nudge(x: number, y: number, turn: number, dt: number) {
    if (this.mode !== 'overview' || (!x && !y && !turn)) return;
    this.tween = null;
    const g = this.goal;
    const speed = this.distance(g) * 0.55 * dt;
    const s = Math.sin(g.az), c = Math.cos(g.az);
    // camera right on the ground is (cos az, -sin az); ahead is (-sin az, -cos az)
    const mx = c * x * speed - s * y * speed;
    const mz = -s * x * speed - c * y * speed;
    const r = this.roam(g.zoom);
    g.x += mx * give(g.x, r.x0, r.x1, STRETCH.pan * 0.25, mx);
    g.z += mz * give(g.z, r.z0, r.z1, STRETCH.pan * 0.25, mz);
    if (turn) this.turn(turn * 1.1 * dt, 0);
  }

  /** Glide back to the establishing shot. */
  home() {
    if (this.mode !== 'overview') {
      this.view = { ...HOME };
      this.goal = { ...HOME };
      return;
    }
    this.stopMomentum();
    this.grabbing = this.turning = this.pinching = false;
    const v = this.view;
    const far = Math.hypot(v.x - HOME.x, v.z - HOME.z) / 10 + Math.abs(v.zoom) + Math.abs(v.az) + Math.abs(v.tilt);
    this.tween = { from: { ...v }, to: { ...HOME }, t0: this.clock, dur: this.reducedMotion ? 0.4 : clamp(0.9 + far * 0.5, 0.9, 1.8) };
  }

  /** True when the overview is (about) at the establishing shot. */
  isHome() {
    const g = this.tween ? this.tween.to : this.goal;
    return (
      Math.abs(g.x - HOME.x) < 0.3 &&
      Math.abs(g.z - HOME.z) < 0.3 &&
      g.zoom < 0.04 &&
      Math.abs(g.az) < 0.04 &&
      Math.abs(g.tilt) < 0.03
    );
  }

  /* ------------------------------------------------------------------ */
  /* Looking around a desk                                               */
  /* ------------------------------------------------------------------ */

  lookStart() {
    if (this.mode === 'focus') this.looking = true;
  }

  lookBy(dx: number, dy: number) {
    if (this.mode !== 'focus' || !this.looking) return;
    const lx = dx * 0.0016, ly = dy * 0.0012;
    this.look.x += lx * give(this.look.x, -LOOK.x, LOOK.x, STRETCH.look, lx);
    this.look.y += ly * give(this.look.y, -LOOK.y, LOOK.y, STRETCH.look, ly);
  }

  lookEnd() {
    this.looking = false;
  }

  /* ------------------------------------------------------------------ */

  private stepView(dt: number) {
    const g = this.goal, v = this.view;
    const now = this.clock;

    if (this.tween) {
      const tw = this.tween;
      const e = easeInOutCubic(clamp((now - tw.t0) / tw.dur));
      for (const k of ['x', 'z', 'zoom', 'az', 'tilt'] as const) v[k] = lerp(tw.from[k], tw.to[k], e);
      this.goal = { ...v };
      if (e >= 1) this.tween = null;
      return;
    }

    // momentum
    const r = this.roam(g.zoom);
    if (!this.grabbing && (this.vel.x || this.vel.y)) {
      g.x += this.vel.x * dt;
      g.z += this.vel.y * dt;
      // a glide that runs past the edge is caught quickly, then springs back
      const outside = g.x < r.x0 || g.x > r.x1 || g.z < r.z0 || g.z > r.z1;
      this.vel.multiplyScalar(Math.exp(-(outside ? 16 : 4.2) * dt));
      if (this.vel.lengthSq() < 1e-4) this.vel.set(0, 0);
    }
    if (!this.turning && (this.spin.x || this.spin.y)) {
      g.az += this.spin.x * dt;
      g.tilt += this.spin.y * dt;
      const outside = Math.abs(g.az) > AZ_MAX || g.tilt < TILT.min || g.tilt > TILT.max;
      this.spin.multiplyScalar(Math.exp(-(outside ? 16 : 5) * dt));
      if (this.spin.lengthSq() < 1e-6) this.spin.set(0, 0);
    }

    // settle anything left stretched past its limits
    const k = 9;
    if (!this.grabbing) {
      g.x = damp(g.x, clamp(g.x, r.x0, r.x1), k, dt);
      g.z = damp(g.z, clamp(g.z, r.z0, r.z1), k, dt);
    }
    if (now - this.stepped > 0.18 && !this.pinching) g.zoom = damp(g.zoom, clamp(g.zoom), k, dt);
    if (!this.turning && now - this.stepped > 0.18) {
      g.az = damp(g.az, clamp(g.az, -AZ_MAX, AZ_MAX), k, dt);
      g.tilt = damp(g.tilt, clamp(g.tilt, TILT.min, TILT.max), k, dt);
    }

    // follow
    const follow = this.reducedMotion ? 30 : 8;
    const held = this.turning ? 18 : follow;
    if (this.pinching) {
      // fingers on glass: no lag
      v.zoom = g.zoom;
      v.az = g.az;
    }
    v.zoom = damp(v.zoom, g.zoom, follow, dt);
    if (this.grabbing) {
      v.x = g.x;
      v.z = g.z;
    } else {
      v.x = damp(v.x, g.x, follow, dt);
      v.z = damp(v.z, g.z, follow, dt);
    }
    v.az = damp(v.az, g.az, held, dt);
    v.tilt = damp(v.tilt, g.tilt, held, dt);
  }

  update(dt: number) {
    this.clock += dt;
    const now = this.clock;
    if (this.camera.aspect !== this.framedAspect) {
      this.framedAspect = this.camera.aspect;
      this.framing = framingFor(this.camera.aspect);
    }
    const lam = this.reducedMotion ? 0 : 3;
    this.parallax.x = damp(this.parallax.x, this.pointer.x, lam, dt);
    this.parallax.y = damp(this.parallax.y, this.pointer.y, lam, dt);
    this.stepView(dt);
    if (!this.looking) {
      this.look.x = damp(this.look.x, 0, 6, dt);
      this.look.y = damp(this.look.y, 0, 6, dt);
    }

    this.computeDesired();
    if (this.transitioning) {
      const k = clamp((now - this.tStart) / this.tDur);
      const e = easeInOutCubic(k);
      const c = this.current;
      // quadratic bezier through a lifted midpoint
      const mid = _a.addVectors(this.from.pos, this.desired.pos).multiplyScalar(0.5);
      mid.y += this.lift;
      const a = _b.lerpVectors(this.from.pos, mid, e);
      const b = _u.lerpVectors(mid, this.desired.pos, e);
      c.pos.lerpVectors(a, b, e);
      c.target.lerpVectors(this.from.target, this.desired.target, easeInOutCubic(clamp(k * 1.08)));
      c.fov = lerp(this.from.fov, this.desired.fov, e);
      c.shift.lerpVectors(this.from.shift, this.desired.shift, e);
      if (k >= 1) {
        this.transitioning = false;
        this.onArrive?.();
      }
    } else {
      copyPose(this.current, this.desired);
    }
    this.apply();
  }

  private apply() {
    const c = this.current;
    this.camera.position.copy(c.pos);
    this.camera.lookAt(c.target);
    if (this.camera.fov !== c.fov || !this.camera.shift.equals(c.shift)) {
      this.camera.fov = c.fov;
      this.camera.shift.copy(c.shift);
      this.camera.updateProjectionMatrix();
    }
  }
}
