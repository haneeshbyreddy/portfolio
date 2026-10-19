import { Vector2 } from 'three';
import { clamp } from './math';
import type { CameraRig } from './CameraRig';

export interface ControlHandlers {
  /** A click or tap that didn't become a drag. */
  tap(x: number, y: number): void;
  doubleTap(x: number, y: number): void;
  /** The pointer moved over the scene; `dragging` while a drag is under way. */
  move(x: number, y: number, dragging: boolean): void;
  leave(): void;
  /** The visitor zoomed out of a desk. */
  back(): void;
  /** The visitor kept zooming in past the closest overview: enter the desk under (x, y), if there is one. */
  dive(x: number, y: number): boolean;
}

type Gesture = 'none' | 'press' | 'pan' | 'turn' | 'look' | 'pinch' | 'spent';

/** Pixels a press may travel and still count as a click. */
const SLOP = 5;
const TAP_MS = 600;
/** Wheel pixels → log of the camera distance. Trackpad pinches arrive as ctrl-wheel with small deltas. */
const WHEEL_ZOOM = 0.0016;
const PINCH_ZOOM = 0.011;
/** Pixels → radians. */
const WHEEL_TURN = 0.0024;
const DRAG_TURN = { az: 0.0034, tilt: 0.0026 };
/** Wheel travel (px) that leaves a desk. */
const BACK_WHEEL = 100;
/** How long to keep zooming in against the limit, over a desk, before entering it. */
const DIVE_MS = 320;
const FLY_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'q', 'e']);

interface SafariGestureEvent extends UIEvent {
  scale: number;
  rotation: number;
  clientX: number;
  clientY: number;
}

/**
 * Turns pointer, wheel, trackpad and keyboard input into camera moves.
 *
 * Overview: drag slides the floor, scroll or pinch zooms toward the cursor,
 * right-drag (or a modifier, a two-finger twist, a sideways swipe, Q / E)
 * turns. Focus: drag looks around the station; zooming out leaves the desk.
 */
export class Controls {
  /** Off while an overlay (index, case study) has the stage. */
  enabled = true;

  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: Gesture = 'none';
  private press = { x: 0, y: 0, t: 0, turn: false };
  private pinch = { dist: 0, angle: 0, x: 0, y: 0, start: 0 };
  private safari = { active: false, scale: 1, rotation: 0 };
  private keys = new Set<string>();
  private backWheel = { sum: 0, t: 0 };
  private push = { start: 0, last: 0 };
  /** When the current focus shot came to rest. */
  private settled = 0;
  private _ndc = new Vector2();
  private _ndc2 = new Vector2();

  constructor(private el: HTMLElement, private rig: CameraRig, private on: ControlHandlers) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('pointerleave', () => {
      if (!this.pointers.size) on.leave();
    });
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('dblclick', (e) => {
      if (this.enabled) on.doubleTap(e.clientX, e.clientY);
    });
    // Safari reports trackpad pinch and rotate as gesture events, not ctrl-wheel
    el.addEventListener('gesturestart', this.gestureStart as EventListener);
    el.addEventListener('gesturechange', this.gestureChange as EventListener);
    el.addEventListener('gestureend', this.gestureEnd as EventListener);
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private ndc(x: number, y: number, out = this._ndc) {
    const r = this.el.getBoundingClientRect();
    return out.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  }

  /* ------------------------------------------------------------------ */
  /* Pointers                                                            */
  /* ------------------------------------------------------------------ */

  private down = (e: PointerEvent) => {
    if (!this.enabled || (e.pointerType === 'mouse' && e.button > 2)) return;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // the pointer is already gone (or synthetic); the drag still works without capture
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.gesture = 'press';
      const mod = e.shiftKey || e.altKey || e.ctrlKey || e.metaKey;
      this.press = { x: e.clientX, y: e.clientY, t: performance.now(), turn: e.button === 2 || mod };
    } else if (this.pointers.size === 2) {
      this.endDrag();
      this.startPinch();
    }
  };

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (!this.pointers.size) this.on.move(e.clientX, e.clientY, false);
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.gesture === 'press') {
      if (Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) < SLOP) {
        this.on.move(e.clientX, e.clientY, false);
        return;
      }
      // a drag now: start it from the press so no travel is lost
      this.startDrag();
      this.drag(e.clientX - this.press.x, e.clientY - this.press.y);
    } else if (this.gesture === 'pinch') {
      this.updatePinch();
    } else {
      this.drag(dx, dy);
    }
    this.on.move(e.clientX, e.clientY, true);
  };

  private up = (e: PointerEvent) => {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    if (this.gesture === 'pinch') {
      // the rest of a two-finger gesture is spent until every finger lifts
      this.rig.pinchEnd();
      this.gesture = this.pointers.size ? 'spent' : 'none';
      return;
    }
    if (this.pointers.size) return;
    if (this.gesture === 'press') {
      this.gesture = 'none';
      if (e.type === 'pointerup' && performance.now() - this.press.t < TAP_MS) this.on.tap(e.clientX, e.clientY);
      return;
    }
    this.endDrag();
    this.gesture = 'none';
  };

  private startDrag() {
    const mode = this.rig.mode;
    if (mode === 'overview') {
      this.gesture = this.press.turn ? 'turn' : 'pan';
      if (this.press.turn) this.rig.turnStart();
      else this.rig.grabStart(this.ndc(this.press.x, this.press.y));
    } else if (mode === 'focus') {
      this.gesture = 'look';
      this.rig.lookStart();
    } else {
      this.gesture = 'spent';
      return;
    }
    document.body.classList.add('is-dragging');
  }

  private drag(dx: number, dy: number) {
    if (this.gesture === 'pan') this.rig.grabMove(dx, dy, this.el.clientHeight);
    else if (this.gesture === 'turn') this.rig.turn(-dx * DRAG_TURN.az, dy * DRAG_TURN.tilt);
    else if (this.gesture === 'look') this.rig.lookBy(dx, dy);
  }

  private endDrag() {
    if (this.gesture === 'pan') this.rig.grabEnd();
    else if (this.gesture === 'turn') this.rig.turnEnd();
    else if (this.gesture === 'look') this.rig.lookEnd();
    document.body.classList.remove('is-dragging');
  }

  private twoFingers() {
    const [a, b] = [...this.pointers.values()];
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  }

  private startPinch() {
    const t = this.twoFingers();
    this.pinch = { ...t, start: t.dist };
    this.gesture = 'pinch';
    if (this.rig.mode === 'overview') this.rig.pinchStart(this.ndc(t.x, t.y));
  }

  private updatePinch() {
    const t = this.twoFingers();
    const p = this.pinch;
    if (this.rig.mode === 'overview') {
      let twist = t.angle - p.angle;
      if (twist > Math.PI) twist -= Math.PI * 2;
      if (twist < -Math.PI) twist += Math.PI * 2;
      const scale = t.dist > 1 && p.dist > 1 ? p.dist / t.dist : 1;
      this.rig.pinchMove(this.ndc(p.x, p.y), this.ndc(t.x, t.y, this._ndc2), scale, twist, t.x - p.x, t.y - p.y, this.el.clientHeight);
    } else if (this.rig.mode === 'focus' && this.isSettled() && t.dist < p.start * 0.72) {
      this.rig.pinchEnd();
      this.gesture = 'spent';
      this.on.back();
      return;
    }
    Object.assign(p, t);
  }

  /* ------------------------------------------------------------------ */
  /* Wheel and trackpad                                                  */
  /* ------------------------------------------------------------------ */

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!this.enabled) return;
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? this.el.clientHeight : 1;
    let dx = e.deltaX * unit, dy = e.deltaY * unit;
    if (e.shiftKey && !dx) [dx, dy] = [dy, 0];
    if (this.rig.mode === 'focus') {
      this.wheelBack(e.ctrlKey ? dy * 10 : dy);
      return;
    }
    if (this.rig.mode !== 'overview' || this.safari.active) return;
    if (dy < 0 && this.pushPast(e.clientX, e.clientY)) return;
    if (dy) {
      const k = e.ctrlKey ? PINCH_ZOOM : WHEEL_ZOOM;
      this.rig.zoomAt(Math.exp(clamp(dy, -150, 150) * k), this.ndc(e.clientX, e.clientY), true);
    }
    if (dx && !e.ctrlKey) this.rig.turn(clamp(dx, -150, 150) * WHEEL_TURN, 0);
  };

  /** Zooming in past the closest overview, over a desk, carries on into it. */
  private pushPast(x: number, y: number) {
    const now = performance.now();
    const p = this.push;
    if (!this.rig.atNearLimit() || now - p.last > 250) p.start = now;
    p.last = now;
    if (now - p.start < DIVE_MS || !this.on.dive(x, y)) return false;
    p.start = now;
    return true;
  }

  /** Zooming out of a desk walks back to the floor, once the shot has settled. */
  private wheelBack(dy: number) {
    const now = performance.now();
    if (!this.isSettled() || dy <= 0) {
      this.backWheel.sum = 0;
      return;
    }
    if (now - this.backWheel.t > 300) this.backWheel.sum = 0;
    this.backWheel.t = now;
    this.backWheel.sum += dy;
    if (this.backWheel.sum > BACK_WHEEL) {
      this.backWheel.sum = 0;
      this.on.back();
    }
  }

  private isSettled() {
    return this.rig.mode === 'focus' && performance.now() - this.settled > 450;
  }

  private gestureStart = (e: SafariGestureEvent) => {
    e.preventDefault();
    // iOS sends these alongside the touch pointers, which already handle it
    if (this.pointers.size > 1 || !this.enabled) return;
    this.safari = { active: true, scale: 1, rotation: 0 };
  };

  private gestureChange = (e: SafariGestureEvent) => {
    e.preventDefault();
    const s = this.safari;
    if (!s.active) return;
    if (this.rig.mode === 'overview') {
      this.rig.zoomAt(s.scale / e.scale, this.ndc(e.clientX, e.clientY), true);
      this.rig.turn(((e.rotation - s.rotation) * Math.PI) / 180, 0);
    } else if (this.rig.mode === 'focus' && this.isSettled() && e.scale < 0.75) {
      s.active = false;
      this.on.back();
    }
    s.scale = e.scale;
    s.rotation = e.rotation;
  };

  private gestureEnd = (e: SafariGestureEvent) => {
    e.preventDefault();
    this.safari.active = false;
  };

  /* ------------------------------------------------------------------ */
  /* Keyboard                                                            */
  /* ------------------------------------------------------------------ */

  private keydown = (e: KeyboardEvent) => {
    if (!this.enabled || e.metaKey || e.ctrlKey || e.altKey || this.rig.mode !== 'overview') return;
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    if (FLY_KEYS.has(k)) {
      this.keys.add(k);
      e.preventDefault();
    } else if (k === '+' || k === '=') this.rig.zoomAt(0.7);
    else if (k === '-' || k === '_') this.rig.zoomAt(1 / 0.7);
  };

  /** Called every frame. */
  update(dt: number) {
    if (this.rig.mode !== 'focus' || this.rig.isTransitioning()) this.settled = performance.now();
    if (!this.keys.size) return;
    if (!this.enabled || this.rig.mode !== 'overview') {
      this.keys.clear();
      return;
    }
    const held = (...k: string[]) => (k.some((x) => this.keys.has(x)) ? 1 : 0);
    const x = held('arrowright', 'd') - held('arrowleft', 'a');
    const y = held('arrowup', 'w') - held('arrowdown', 's');
    const turn = held('e') - held('q');
    this.rig.nudge(x, y, turn, dt);
  }
}
