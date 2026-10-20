/**
 * The soundtrack: a score, and under it the meadow (wind moving through the
 * long grass and, now and then, a lark somewhere far off, both made for this
 * floor with ElevenLabs sound effects). Films and reels play at their own
 * level (see Library) and the score steps back for them.
 *
 * The score is an original boom-bap instrumental, cut on bar lines so it comes
 * round again without a seam. It streams through an <audio> element rather than
 * being decoded whole: three and a half minutes of PCM is too much to hold on a
 * phone. It is heard through the opening's fog, muffled, and opens up as the fog
 * lifts.
 *
 * Sound is on unless the visitor turned it off on an earlier visit. A browser
 * keeps a page silent until it is touched, so the room is built at load and
 * starts on the first click, tap or key, whichever comes first.
 */
const SCORE = '/audio/score.m4a';
/** A seamless loop with WIND_PAD seconds of overlap at each end, so the codec's padding never lands inside it. */
const WIND = '/audio/wind.m4a';
const WIND_PAD = 0.5;
const LARKS = ['/audio/lark-1.m4a', '/audio/lark-2.m4a', '/audio/lark-3.m4a'];

/**
 * Levels, set from measured loudness. The score (−12 LUFS as mastered) lands
 * near −22 LUFS, where the films sit too. The wind and the larks are mastered
 * to −24 LUFS and play about 13 dB under the score (the wind a little more in
 * the fog, less at a desk): a bed you only notice when it stops.
 */
const MASTER = 0.55;
const SCORE_LEVEL = 0.56;
const WIND_LEVEL = 0.55;
const LARK_LEVEL = 0.45;

const PREF = 'fieldwork:sound';
/** The events a browser accepts as the visitor's go-ahead to play sound. */
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

function wanted() {
  try {
    return localStorage.getItem(PREF) !== 'off';
  } catch {
    return true;
  }
}

export class Ambience {
  /** Sound is on but the browser is still holding it back (or has just let go). */
  onLock: (locked: boolean) => void = () => {};

  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private musicTone!: BiquadFilterNode;
  private wind!: GainNode;
  private windTone!: BiquadFilterNode;
  private larks!: GainNode;
  private score: HTMLAudioElement | null = null;
  /** The browser refused the score until the visitor touches the page (the room itself may already be running). */
  private scoreBlocked = false;
  private larkBuffers: AudioBuffer[] = [];
  private meadow = false;
  private nextLark = 0;
  private on = wanted();
  private wasLocked = true;
  private veil = 1;
  private ducked = false;
  private focused = false;
  private sleep = 0;

  constructor() {
    try {
      this.init();
    } catch {
      this.ctx = null; // no Web Audio: a silent floor
      return;
    }
    this.settle();
    // a browser that already trusts the site lets it start without a touch
    void this.ctx!.resume().catch(() => undefined);
    window.setInterval(this.tick, 250);
  }

  get enabled() {
    return this.on;
  }

  /** On, but not heard yet. */
  get locked() {
    return this.on && (!this.running || this.scoreBlocked);
  }

  private get running() {
    return this.ctx?.state === 'running';
  }

  private init() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    this.musicTone = ctx.createBiquadFilter();
    this.musicTone.type = 'lowpass';
    this.musicTone.Q.value = 0.5;
    this.musicTone.frequency.value = this.toneFor(this.veil);
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.musicTone.connect(this.music).connect(this.master);

    // the wind's highs open and close with the gusts
    this.windTone = ctx.createBiquadFilter();
    this.windTone.type = 'lowpass';
    this.windTone.Q.value = 0.4;
    this.windTone.frequency.value = 9000;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    this.windTone.connect(this.wind).connect(this.master);

    this.larks = ctx.createGain();
    this.larks.gain.value = LARK_LEVEL;
    this.larks.connect(this.master);

    ctx.addEventListener('statechange', () => this.settle());

    // nobody listens to a background tab
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.score?.pause();
        void ctx.suspend();
      } else {
        void ctx.resume().catch(() => undefined);
        if (this.on) this.playScore();
      }
    });
  }

  /** The visitor's first touch of the page lets the sound out. The sound button handles its own press. */
  private unlock = (e: Event) => {
    if ((e.target as Element | null)?.closest?.('[data-act="sound"]')) return;
    this.wake();
  };

  /** Runs inside the visitor's gesture: some browsers only listen then. */
  private wake() {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    if (this.on) this.playScore();
  }

  /** Keep the controls and the mix in step with what the browser actually allows. */
  private settle() {
    if (this.running && this.on) {
      this.playScore();
      this.loadMeadow();
    }
    // listen for a touch for as long as something is held back (adding twice is a no-op)
    const locked = this.locked;
    for (const type of GESTURES) {
      if (locked || !this.running) window.addEventListener(type, this.unlock, { capture: true, passive: true });
      else window.removeEventListener(type, this.unlock, { capture: true });
    }
    if (locked !== this.wasLocked) {
      this.wasLocked = locked;
      this.onLock(locked);
    }
    this.fade(1.2);
  }

  private playScore() {
    if (!this.score) {
      const el = new Audio();
      el.src = SCORE;
      el.loop = true;
      el.preload = 'auto';
      this.ctx!.createMediaElementSource(el).connect(this.musicTone);
      el.addEventListener('playing', () => {
        if (!this.scoreBlocked) return;
        this.scoreBlocked = false;
        this.settle();
      });
      this.score = el;
    }
    if (this.score.paused) {
      this.score.play().catch((e: DOMException) => {
        // not allowed yet: the next touch tries again (a missing file just leaves the meadow)
        if (e.name !== 'NotAllowedError' || this.scoreBlocked) return;
        this.scoreBlocked = true;
        this.settle();
      });
    }
  }

  /** The wind and the larks load once sound is actually going (never, for a visitor who keeps it off). */
  private loadMeadow() {
    if (this.meadow) return;
    this.meadow = true;
    const ctx = this.ctx!;
    const load = (url: string) =>
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b));
    load(WIND)
      .then((buf) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        // any window exactly one loop long is seamless, wherever the decoder's padding put it
        src.loopStart = WIND_PAD;
        src.loopEnd = buf.duration - WIND_PAD;
        src.connect(this.windTone);
        src.start(0, WIND_PAD);
      })
      .catch(() => {
        /* the score carries on alone */
      });
    this.nextLark = ctx.currentTime + 9 + Math.random() * 8;
    for (const url of LARKS) {
      load(url)
        .then((buf) => void this.larkBuffers.push(buf))
        .catch(() => undefined);
    }
  }

  /** In the fog the score is a room away; as it clears, the highs come back. */
  private toneFor(veil: number) {
    return 520 * Math.pow(18000 / 520, 1 - veil);
  }

  setVeil(veil: number) {
    if (Math.abs(veil - this.veil) < 0.002) return;
    this.veil = veil;
    if (this.ctx) this.musicTone.frequency.setTargetAtTime(this.toneFor(veil), this.ctx.currentTime, 0.12);
  }

  /** Step back while a film or a reel is speaking. */
  duck(on: boolean) {
    if (on === this.ducked) return;
    this.ducked = on;
    this.fade(on ? 0.35 : 1.6);
  }

  /** At a desk the field recedes a little. */
  setFocus(focused: boolean) {
    this.focused = focused;
  }

  /**
   * Where a video's volume can't be set (iOS keeps it at the hardware's), its
   * sound comes through here instead. Returns the gain to set it with.
   */
  route(el: HTMLMediaElement): AudioParam | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    try {
      const g = ctx.createGain();
      ctx.createMediaElementSource(el).connect(g).connect(ctx.destination);
      return g.gain;
    } catch {
      return null;
    }
  }

  private fade(seconds: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.master.gain.setTargetAtTime(this.on ? MASTER : 0, t, 0.6);
    this.music.gain.setTargetAtTime(!this.on ? 0 : this.ducked ? 0.06 : SCORE_LEVEL, t, seconds / 3);
  }

  /** Turn sound on or off. While the browser is still holding sound back, a press only lets it out. */
  toggle() {
    if (!this.ctx) return this.on;
    if (this.locked) {
      this.wake();
      return this.on;
    }
    this.on = !this.on;
    try {
      if (this.on) localStorage.removeItem(PREF);
      else localStorage.setItem(PREF, 'off');
    } catch {
      /* storage blocked: the choice lasts this visit */
    }
    clearTimeout(this.sleep);
    if (this.on) {
      this.wake();
    } else {
      // let the fade finish, then stop the tape
      this.sleep = window.setTimeout(() => {
        if (!this.on) this.score?.pause();
      }, 2400);
    }
    this.settle();
    return this.on;
  }

  private lark(t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.larkBuffers[Math.floor(Math.random() * this.larkBuffers.length)];
    // never quite the same bird twice
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    const g = ctx.createGain();
    g.gain.value = 0.6 + Math.random() * 0.4;
    src.connect(g).connect(pan).connect(this.larks);
    src.start(t);
  }

  /** Four times a second: the gusts, and whether a lark is due. */
  private tick = () => {
    const ctx = this.ctx;
    if (!ctx || !this.on || !this.running) return;
    const t = ctx.currentTime;
    // two slow swells that never line up with the 30 s loop
    const gust = 0.5 + Math.sin(t * 0.13) * 0.3 + Math.sin(t * 0.31 + 1.3) * 0.2;
    const level =
      WIND_LEVEL *
      (0.82 + gust * 0.3) *
      (1 + this.veil * 0.3) * // the fog is weather: a touch more wind in it
      (this.focused ? 0.72 : 1) *
      (this.ducked ? 0.45 : 1);
    this.wind.gain.setTargetAtTime(level, t, 1.2);
    this.windTone.frequency.setTargetAtTime(5000 + gust * 9000, t, 1.5);

    if (this.larkBuffers.length && t > this.nextLark) {
      if (!this.ducked) this.lark(t);
      this.nextLark = t + 20 + Math.random() * 28;
    }
  };
}
