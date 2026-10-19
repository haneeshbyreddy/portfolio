/**
 * An adaptive pointer after iPadOS: a soft dot that becomes the control it
 * rests on. Glass controls get a highlight shaped exactly like them, with a
 * touch of parallax; prominent buttons lift towards the hand instead. Every
 * change of shape runs on a spring, never on a timed curve.
 */

type Mode = 'free' | 'desk' | 'drag' | 'highlight' | 'lift';

const DOT = 18;
const DESK = 34;
const DRAG = 12;
/** How far a highlight leans towards the hand, as a share of the offset. */
const LEAN = 0.12;
const LEAN_MAX = 7;
/** Content leans half as far as its highlight. */
const CONTENT_LEAN = 0.5;

class Spring {
  v = 0;
  constructor(public x: number) {}
  step(target: number, dt: number, k: number, zeta: number) {
    const c = 2 * Math.sqrt(k) * zeta;
    this.v += (k * (target - this.x) - c * this.v) * dt;
    this.x += this.v * dt;
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
  private sinceMode = 1;
  private target: HTMLElement | null = null;
  private targetRadius = 0;
  private lean = { x: 0, y: 0 };
  private mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  private pressed = false;
  private visible = false;
  private calm = matchMedia('(prefers-reduced-motion: reduce)');

  /** Set by the scene: the pointer is over a desk. */
  overDesk = false;

  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'pointer is-hidden';
    this.el.setAttribute('aria-hidden', 'true');
    host.appendChild(this.el);

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (!this.visible) {
        this.visible = true;
        this.x.x = e.clientX;
        this.y.x = e.clientY;
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
      this.release();
    });
  }

  private pick(): HTMLElement | null {
    const hit = document.elementFromPoint(this.mouse.x, this.mouse.y) as HTMLElement | null;
    const t = hit?.closest<HTMLElement>('[data-pointer], button, a');
    if (!t || t.dataset.pointer === 'none' || (t as HTMLButtonElement).disabled) return null;
    return t;
  }

  private release() {
    const t = this.target;
    this.target = null;
    this.lean.x = this.lean.y = 0;
    if (!t) return;
    t.classList.remove('is-lifted');
    if (t.style.translate) {
      // let the content settle back on a spring, then hand transitions back
      t.style.transition = `${getComputedStyle(t).transition}, translate 0.5s var(--spring)`;
      t.style.translate = '';
      setTimeout(() => {
        if (this.target !== t) t.style.transition = '';
      }, 520);
    }
  }

  private setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.el.classList.replace(`is-${this.mode}`, `is-${mode}`) || this.el.classList.add(`is-${mode}`);
    this.mode = mode;
    this.sinceMode = 0;
  }

  update(dt: number) {
    if (!this.visible) return;
    dt = Math.min(dt, 1 / 20);
    this.sinceMode += dt;
    const dragging = document.body.classList.contains('is-dragging');

    // what is under the hand
    const t = dragging ? null : this.pick();
    if (t !== this.target) {
      this.release();
      this.target = t;
      if (t) {
        const cs = getComputedStyle(t);
        this.targetRadius = parseFloat(cs.borderTopLeftRadius) || 10;
        if (t.dataset.pointer === 'lift') t.classList.add('is-lifted');
        t.style.transition = '';
      }
    }

    let tx = this.mouse.x, ty = this.mouse.y, tw = DOT, th = DOT, tr = DOT / 2;
    if (t) {
      const lift = t.dataset.pointer === 'lift';
      this.setMode(lift ? 'lift' : 'highlight');
      // the box as laid out, without the lean we gave it
      const b = t.getBoundingClientRect();
      const cx = b.left + b.width / 2 - this.lean.x;
      const cy = b.top + b.height / 2 - this.lean.y;
      const calm = this.calm.matches ? 0 : 1;
      const lx = Math.max(-LEAN_MAX, Math.min(LEAN_MAX, (this.mouse.x - cx) * LEAN)) * calm;
      const ly = Math.max(-LEAN_MAX * 0.6, Math.min(LEAN_MAX * 0.6, (this.mouse.y - cy) * LEAN)) * calm;
      tx = cx + lx;
      ty = cy + ly;
      tw = b.width;
      th = b.height;
      tr = Math.min(this.targetRadius, b.height / 2, b.width / 2);
      if (lift) {
        t.style.setProperty('--mx', `${this.mouse.x - b.left}px`);
        t.style.setProperty('--my', `${this.mouse.y - b.top}px`);
      } else {
        // content follows its highlight, a little behind
        this.lean.x = (this.x.x - cx) * CONTENT_LEAN;
        this.lean.y = (this.y.x - cy) * CONTENT_LEAN;
        t.style.translate = `${this.lean.x.toFixed(2)}px ${this.lean.y.toFixed(2)}px`;
      }
    } else {
      this.lean.x = this.lean.y = 0;
      if (dragging) {
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
    }

    // A free pointer must track the hand 1:1; a morph needs a spring. Ramp the
    // stiffness up after each change so the two never fight.
    const free = this.mode === 'free' || this.mode === 'desk' || this.mode === 'drag';
    const settle = Math.min(1, this.sinceMode / 0.32);
    const kPos = free ? 520 + settle * settle * 9000 : 520;
    const steps = Math.ceil(dt / (1 / 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.x.step(tx, h, kPos, 1);
      this.y.step(ty, h, kPos, 1);
      this.w.step(tw, h, 420, 0.74);
      this.h.step(th, h, 420, 0.74);
      this.r.step(tr, h, 420, 0.9);
      this.press.step(this.pressed ? (t ? 0.94 : 0.78) : 1, h, 900, 0.7);
    }

    const w = Math.max(2, this.w.x), hh = Math.max(2, this.h.x);
    const s = this.el.style;
    s.width = `${w.toFixed(2)}px`;
    s.height = `${hh.toFixed(2)}px`;
    s.borderRadius = `${Math.max(0, this.r.x).toFixed(2)}px`;
    s.transform = `translate3d(${(this.x.x - w / 2).toFixed(2)}px, ${(this.y.x - hh / 2).toFixed(2)}px, 0) scale(${this.press.x.toFixed(3)})`;
  }
}
