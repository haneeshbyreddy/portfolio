import { Vector2, Vector3 } from 'three';
import { clamp, damp, easeInOutCubic, lerp } from './math';
import type { ShiftCamera } from './ShiftCamera';
import type { Desk } from '../office/Office';

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
 * Directs the camera. Three shots:
 *  - intro: eye level in the tall grass, looking at the hills (refs 3 + 4)
 *  - overview: the establishing shot of the floor, gently orbitable
 *  - focus: over a worker's shoulder onto their monitor (ref 2), framed with
 *    a shift lens so the screen sits beside the project panel
 */
export class CameraRig {
  mode: Mode = 'intro';
  focusDesk: Desk | null = null;

  // overview orbit state
  azimuth = 0;
  elevation = 0.185;
  radius = 27;
  private azTarget = 0;
  private elTarget = 0.185;
  private radTarget = 27;
  readonly center = new Vector3(0, 3.1, -2.4);

  // pointer parallax (-1..1)
  readonly pointer = new Vector2();
  private parallax = new Vector2();

  // transition
  private from = pose();
  private current = pose();
  private desired = pose();
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

  private aspect() {
    return this.camera.aspect;
  }

  private introPose(p: Pose) {
    p.pos.set(3.5, 1.15, 52);
    p.target.set(-2, 3.2, -40);
    p.fov = 40;
    p.shift.set(0, 0);
    return p;
  }

  private overviewPose(p: Pose) {
    const a = this.aspect();
    const portrait = a < 1;
    const r = this.radius * (portrait ? 1.6 : a < 1.4 ? 1.12 : 1);
    const az = this.azimuth + this.parallax.x * 0.025;
    const el = this.elevation + this.parallax.y * 0.012;
    p.target.copy(this.center);
    p.pos.set(
      this.center.x + Math.sin(az) * Math.cos(el) * r,
      this.center.y + Math.sin(el) * r,
      this.center.z + Math.cos(az) * Math.cos(el) * r,
    );
    p.fov = portrait ? 46 : 37;
    p.shift.set(0, portrait ? -0.05 : 0);
    return p;
  }

  private focusPose(p: Pose, desk: Desk) {
    const tall = this.layout === 'tall';
    const occupied = desk.occupied;
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
    p.fov = tall ? 44 : 31;
    p.shift.set(tall ? 0 : 0.3, tall ? 0.42 : 0.0);
    return p;
  }

  private computeDesired() {
    if (this.mode === 'intro') this.introPose(this.desired);
    else if (this.mode === 'overview') this.overviewPose(this.desired);
    else if (this.focusDesk) this.focusPose(this.desired, this.focusDesk);
  }

  /** Begin a move to a new shot. */
  go(mode: Mode, desk: Desk | null = null, duration?: number) {
    copyPose(this.from, this.current);
    this.mode = mode;
    this.focusDesk = desk;
    this.computeDesired();
    const dist = this.from.pos.distanceTo(this.desired.pos);
    this.tDur = this.reducedMotion ? 0.6 : duration ?? clamp(1.25 + dist * 0.035, 1.4, 2.4);
    // desk-to-desk hops arc over the monitors; big moves get a gentle swoop
    this.lift = mode === 'focus' && this.from.pos.y < 3 ? clamp(dist * 0.18, 0.6, 2.4) : dist * 0.04;
    this.tStart = this.clock;
    this.transitioning = true;
  }

  orbit(dx: number, dy: number) {
    if (this.mode !== 'overview') return;
    this.azTarget = clamp(this.azTarget - dx * 0.0035, -0.62, 0.62);
    this.elTarget = clamp(this.elTarget + dy * 0.0022, 0.1, 0.55);
  }

  zoom(delta: number) {
    if (this.mode !== 'overview') return;
    this.radTarget = clamp(this.radTarget * (1 + delta * 0.0011), 16, 40);
  }

  isTransitioning() {
    return this.transitioning;
  }

  update(dt: number) {
    this.clock += dt;
    const now = this.clock;
    const lam = this.reducedMotion ? 0 : 3;
    this.parallax.x = damp(this.parallax.x, this.pointer.x, lam, dt);
    this.parallax.y = damp(this.parallax.y, this.pointer.y, lam, dt);
    this.azimuth = damp(this.azimuth, this.azTarget, 5, dt);
    this.elevation = damp(this.elevation, this.elTarget, 5, dt);
    this.radius = damp(this.radius, this.radTarget, 5, dt);

    this.computeDesired();
    if (this.transitioning) {
      const k = clamp((now - this.tStart) / this.tDur);
      const e = easeInOutCubic(k);
      const c = this.current;
      // quadratic bezier through a lifted midpoint
      const mid = new Vector3().addVectors(this.from.pos, this.desired.pos).multiplyScalar(0.5);
      mid.y += this.lift;
      const a = new Vector3().lerpVectors(this.from.pos, mid, e);
      const b = new Vector3().lerpVectors(mid, this.desired.pos, e);
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
