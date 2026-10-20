import type { Experience } from '../core/Experience';

/**
 * The opening, cut like the cold open of a short film.
 *
 * The page starts inside the meadow's own fog, not on a coloured screen: the
 * ground here is the fog colour the renderer will draw, vignette included, so
 * when the canvas takes over nothing changes. While the floor loads, three
 * sentences cut in one after another, each spread across the frame on the line
 * where the horizon is about to appear, with one word set in the serif. Then
 * the title card, then the fog thins in depth order (grass, field, desks,
 * treeline, sky) and the camera cranes up out of the grass.
 *
 * The sentences are the wait made into story, so they never hurry: each holds
 * long enough to read, and the title holds until the floor is ready. A second
 * visit in the same session goes straight to the title, a click skips ahead,
 * and nothing here waits on sound.
 */

/** When each sentence cuts in, ms after boot. */
const BEATS = [380, 1280, 2180];
/** The title card follows the last sentence. */
const TITLE = 3080;
/** How long the title holds over the fog before it lifts. */
const HOLD = 1150;
/** The fog lifts over this long; the crane starts once the field is back. */
const LIFT = 3.4;
const CRANE_AT = 1.9;
/** A return visit, or a skip, still gets a beat on the title. */
const SHORT_HOLD = 700;

const SEEN = 'fieldwork:opened';

type Phase = 'beats' | 'title' | 'lift' | 'done';

export class Opening {
  /**
   * The opening keeps its own clock from rendered frames, not the wall: while
   * the floor is being built the main thread can stall for a second or two,
   * and a sentence nobody saw shouldn't count as read.
   */
  private clock = 0;
  private phase: Phase = 'beats';
  private beat = -1;
  private readyAt = -1;
  private titleAt = -1;
  private liftAt = -1;
  private target = 0;
  private shown = 0;
  private short: boolean;
  private calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private beats: HTMLElement[];

  constructor(
    private el: HTMLElement,
    private exp: Experience,
    private onReveal: () => void,
  ) {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN) === '1';
    } catch {
      /* storage blocked: play it in full */
    }
    this.short = seen || this.calm;
    this.beats = [...el.querySelectorAll<HTMLElement>('.opening__beat')];
    // the canvas starts in the fog the ground is painted with
    exp.setVeil(1);
    this.place();
    window.addEventListener('resize', this.place);
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-act="sound"]')) return;
      this.skip();
    });
    window.addEventListener('keydown', this.onKey);
  }

  /** The sentences stand on the horizon the fog is about to give back. */
  private place = () => {
    const y = this.exp.horizonY();
    if (Number.isFinite(y)) this.el.style.setProperty('--horizon', `${y.toFixed(1)}px`);
  };

  private onKey = (e: KeyboardEvent) => {
    if (this.phase === 'done' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') this.skip();
  };

  private skip() {
    if (this.phase !== 'beats') return;
    this.short = true;
  }

  progress(p: number) {
    this.target = Math.max(this.target, Math.min(1, p));
  }

  ready() {
    this.progress(1);
    if (this.readyAt < 0) this.readyAt = this.now();
  }

  private now() {
    return this.clock * 1000;
  }

  /** Called every frame by the UI. */
  tick(dt: number) {
    if (this.phase === 'done') return;
    this.clock += Math.min(dt, 1 / 20);
    const t = this.now();
    // the rule creeps toward the real progress, never past it
    this.shown += (this.target - this.shown) * Math.min(1, dt * 6);
    this.el.style.setProperty('--p', this.shown.toFixed(4));

    if (this.phase === 'beats') {
      if (!this.short) {
        let b = -1;
        for (let i = 0; i < BEATS.length; i++) if (t >= BEATS[i]) b = i;
        if (b !== this.beat) this.cut(b);
      }
      const due = this.short ? 0 : TITLE;
      if (this.readyAt >= 0 && t >= due && this.shown > 0.985) this.title(t);
      return;
    }

    if (this.phase === 'title' && t - this.titleAt >= (this.short ? SHORT_HOLD : HOLD)) this.lift(t);

    if (this.phase === 'lift') {
      const s = (t - this.liftAt) / 1000;
      if (s >= (this.calm ? 0.3 : CRANE_AT)) this.finish();
    }
  }

  /** Sentences cut, they don't fade: one is simply replaced by the next. */
  private cut(b: number) {
    this.beat = b;
    this.beats.forEach((el, i) => el.classList.toggle('is-on', i === b));
  }

  private title(t: number) {
    this.phase = 'title';
    this.titleAt = t;
    this.cut(-1);
    this.el.classList.add('is-title');
    this.el.querySelector('.opening__status')!.textContent = 'Ready';
  }

  private lift(t: number) {
    this.phase = 'lift';
    this.liftAt = t;
    this.place();
    // the painted fog hands over to the rendered fog, then the rendered fog thins
    this.el.classList.add('is-lifting');
    this.exp.liftVeil(this.calm ? 0.8 : LIFT);
    try {
      sessionStorage.setItem(SEEN, '1');
    } catch {
      /* fine */
    }
  }

  private finish() {
    this.phase = 'done';
    this.el.classList.add('is-done');
    window.removeEventListener('resize', this.place);
    window.removeEventListener('keydown', this.onKey);
    this.onReveal();
    setTimeout(() => this.el.remove(), 2400);
  }

  /** Dev helper: jump straight to the end. */
  debugSkip() {
    this.ready();
    this.shown = 1;
    this.short = true;
    if (this.phase === 'beats') this.title(this.now() - SHORT_HOLD);
    if (this.phase === 'title') this.lift(this.now());
  }
}
