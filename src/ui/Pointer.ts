/**
 * An adaptive pointer after iPadOS: a soft dot that becomes the control it
 * rests on. Glass controls get a highlight shaped exactly like them, leaning
 * a touch towards the hand; prominent buttons lift towards the hand instead.
 *
 * Steadiness rules, each one learned the hard way:
 * - A free pointer is the hand. It tracks 1:1 and never springs, whatever its
 *   shape is doing; only leaving a control lets it catch up on a spring.
 * - A control keeps the pointer while the hand is within a few pixels of it,
 *   so the hairline gaps inside a toolbar never drop it back to a dot.
 * - Only the pointer moves. The control under it stays put — moving text by
 *   fractions of a pixel every frame reads as shimmer, not as life.
 */

type Mode = 'free' | 'desk' | 'drag' | 'highlight' | 'lift';

const DOT = 18;
const DESK = 34;
const DRAG = 12;
/** How far a highlight leans towards the hand: share of the offset, and limits. */
const LEAN = 0.08;
const LEAN_X = 4;
const LEAN_Y = 2;
/** A control holds the pointer until the hand is this far outside it. */
const HOLD = 10;
/** After leaving a control, how long the dot takes to rejoin the hand. */
const CATCH_UP = 0.22;

export class Spring {
  v = 0;
  constructor(public x: number) {}
  step(target: number, dt: number, k: number, zeta: number) {
    const c = 2 * Math.sqrt(k) * zeta;
    this.v += (k * (target - this.x) - c * this.v) * dt;
    this.x += this.v * dt;
  }
  set(x: number) {
    this.x = x;
    this.v = 0;
  }
}

export class Pointer {
  readonly el: HTMLElement;
  private x = new Spring(innerWidth / 2);
  private y = new Spring(innerHeight / 2);
  private w = new Spring(DOT);
  private h = new Spring(DOT);
  private r = new Spring(DOT / 2);
  private press = new Spring(1);
  private mode: Mode = 'free';
  /** Seconds since the pointer let go of a control; Infinity once caught up. */
  private released = Infinity;
  private target: HTMLElement | null = null;
  private targetRadius = 0;
  private mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  private pressed = false;
  private visible = false;
  private calm = matchMedia('(prefers-reduced-motion: reduce)');

  /** Set by the scene: the pointer is over a desk. */
  overDesk = false;

  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'pointer is-free is-hidden';
    this.el.setAttribute('aria-hidden', 'true');
    host.appendChild(this.el);

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (!this.visible) {
        this.visible = true;
        this.x.set(e.clientX);
        this.y.set(e.clientY);
        this.el.classList.remove('is-hidden');
      }
    });
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') this.pressed = true;
    });
    window.addEventListener('pointerup', () => (this.pressed = false));
    window.addEventListener('blur', () => (this.pressed = false));
    document.documentElement.addEventListener('pointerleave', () => {
      this.visible = false;
      this.el.classList.add('is-hidden');
      this.setTarget(null);
    });
  }

  private pick(): HTMLElement | null {
    const hit = document.elementFromPoint(this.mouse.x, this.mouse.y) as HTMLElement | null;
    const t = hit?.closest<HTMLElement>('[data-pointer], button, a') ?? null;
    if (t && t.dataset.pointer !== 'none' && !(t as HTMLButtonElement).disabled) return t;
    // magnetism: the current control keeps the hand through hairline gaps
    const cur = this.target;
    if (cur?.isConnected) {
      const b = cur.getBoundingClientRect();
      const { x, y } = this.mouse;
      if (x > b.left - HOLD && x < b.right + HOLD && y > b.top - HOLD && y < b.bottom + HOLD && b.width > 0) return cur;
    }
    return null;
  }

  private setTarget(t: HTMLElement | null) {
    if (t === this.target) return;
    const prev = this.target;
    prev?.classList.remove('is-lifted');
    this.target = t;
    if (t) {
      this.targetRadius = parseFloat(getComputedStyle(t).borderTopLeftRadius) || 10;
      if (t.dataset.pointer === 'lift') t.classList.add('is-lifted');
    } else if (prev) {
      if (this.mode === 'lift') {
        // the pointer was hidden inside the button: reappear at the hand, as a dot
        this.x.set(this.mouse.x);
        this.y.set(this.mouse.y);
        this.w.set(DOT);
        this.h.set(DOT);
        this.r.set(DOT / 2);
        this.released = Infinity;
      } else {
        this.released = 0;
      }
    }
  }

  private setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.el.classList.replace(`is-${this.mode}`, `is-${mode}`);
    this.mode = mode;
  }

  update(dt: number) {
    if (!this.visible) return;
    dt = Math.min(dt, 1 / 20);
    const dragging = document.body.classList.contains('is-dragging');
    this.setTarget(dragging ? null : this.pick());
    const t = this.target;

    let tx = this.mouse.x, ty = this.mouse.y, tw = DOT, th = DOT, tr = DOT / 2;
    if (t) {
      const lift = t.dataset.pointer === 'lift';
      this.setMode(lift ? 'lift' : 'highlight');
      const b = t.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      const calm = this.calm.matches ? 0 : 1;
      tx = cx + Math.max(-LEAN_X, Math.min(LEAN_X, (this.mouse.x - cx) * LEAN)) * calm;
      ty = cy + Math.max(-LEAN_Y, Math.min(LEAN_Y, (this.mouse.y - cy) * LEAN)) * calm;
      tw = b.width;
      th = b.height;
      tr = Math.min(this.targetRadius, b.height / 2, b.width / 2);
      if (lift) {
        t.style.setProperty('--mx', `${this.mouse.x - b.left}px`);
        t.style.setProperty('--my', `${this.mouse.y - b.top}px`);
      }
    } else if (dragging) {
      this.setMode('drag');
      tw = th = DRAG;
      tr = DRAG / 2;
    } else if (this.overDesk) {
      this.setMode('desk');
      tw = th = DESK;
      tr = DESK / 2;
    } else {
      this.setMode('free');
    }

    // Snapped to a control: glide on a spring. Free: be the hand, except for a
    // moment after letting go of a control, when the dot catches up.
    const snapped = !!t;
    if (!snapped) this.released += dt;
    const catching = !snapped && this.released < CATCH_UP;
    const kPos = snapped ? 560 : catching ? 700 + (this.released / CATCH_UP) ** 2 * 14000 : 0;
    // shape changes on a control may overshoot a hair; the dot and lens never do
    const zShape = snapped ? 0.8 : 0.95;

    const steps = Math.ceil(dt / (1 / 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (kPos) {
        this.x.step(tx, h, kPos, 1);
        this.y.step(ty, h, kPos, 1);
      }
      this.w.step(tw, h, 460, zShape);
      this.h.step(th, h, 460, zShape);
      this.r.step(tr, h, 460, 1);
      this.press.step(this.pressed ? (t ? 0.95 : 0.8) : 1, h, 900, 0.75);
    }
    if (!kPos) {
      this.x.set(tx);
      this.y.set(ty);
      this.released = Infinity;
    }

    const w = Math.max(2, this.w.x), hh = Math.max(2, this.h.x);
    const s = this.el.style;
    s.width = `${w.toFixed(2)}px`;
    s.height = `${hh.toFixed(2)}px`;
    s.borderRadius = `${Math.max(0, this.r.x).toFixed(2)}px`;
    s.transform = `translate3d(${(this.x.x - w / 2).toFixed(2)}px, ${(this.y.x - hh / 2).toFixed(2)}px, 0) scale(${this.press.x.toFixed(3)})`;
  }
}
