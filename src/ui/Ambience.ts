/**
 * The soundtrack. A score, and a procedural meadow under it: wind through tall
 * grass (filtered noise breathing with the gusts), a distant lark now and then,
 * and the soft clatter of keyboards that grows when you lean over a desk.
 *
 * The score is an original boom-bap instrumental, cut on bar lines so it comes
 * round again without a seam. It streams through an <audio> element rather than
 * being decoded whole: three and a half minutes of PCM is too much to hold on a
 * phone. It is heard through the opening's fog, muffled, and opens up as the fog
 * lifts; when a film or a reel speaks, it steps back.
 */
const SCORE = '/audio/score.m4a';
/** Its level under the meadow: present, never in the way. */
const SCORE_LEVEL = 0.56;

export class Ambience {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private keysGain!: GainNode;
  private music!: GainNode;
  private musicTone!: BiquadFilterNode;
  private score: HTMLAudioElement | null = null;
  private timer = 0;
  private sleep = 0;
  private on = false;
  private keyRate = 0.18;
  private veil = 1;
  private ducked = false;

  get enabled() {
    return this.on;
  }

  private init() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // wind: brown-ish noise → band-pass, slowly modulated
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.5;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();

    this.keysGain = ctx.createGain();
    this.keysGain.gain.value = 0.25;
    this.keysGain.connect(this.master);

    this.musicTone = ctx.createBiquadFilter();
    this.musicTone.type = 'lowpass';
    this.musicTone.Q.value = 0.5;
    this.musicTone.frequency.value = this.toneFor(this.veil);
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.musicTone.connect(this.music).connect(this.master);

    // nobody listens to a background tab
    document.addEventListener('visibilitychange', () => {
      if (!this.on) return;
      if (document.hidden) {
        this.score?.pause();
        void ctx.suspend();
      } else {
        void ctx.resume();
        this.playScore();
      }
    });
  }

  /** Called inside the click that turned sound on, so every browser lets it play. */
  private playScore() {
    const ctx = this.ctx!;
    if (!this.score) {
      const el = new Audio();
      el.src = SCORE;
      el.loop = true;
      el.preload = 'auto';
      ctx.createMediaElementSource(el).connect(this.musicTone);
      this.score = el;
    }
    this.score.play().catch(() => {
      /* no score: the meadow still has its wind */
    });
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

  /** Step back while something else on screen has the floor. */
  duck(on: boolean) {
    if (on === this.ducked) return;
    this.ducked = on;
    this.mix(on ? 0.35 : 1.6);
  }

  private mix(seconds: number) {
    if (!this.ctx) return;
    const level = !this.on ? 0 : this.ducked ? 0.06 : SCORE_LEVEL;
    this.music.gain.setTargetAtTime(level, this.ctx.currentTime, seconds / 3);
  }

  setFocus(focused: boolean) {
    this.keyRate = focused ? 0.75 : 0.18;
    if (this.ctx) this.keysGain.gain.setTargetAtTime(focused ? 0.55 : 0.22, this.ctx.currentTime, 0.4);
  }

  toggle() {
    if (!this.ctx) this.init();
    const ctx = this.ctx!;
    this.on = !this.on;
    clearTimeout(this.sleep);
    if (this.on) {
      if (ctx.state === 'suspended') void ctx.resume();
      this.playScore();
      this.loop();
    } else {
      cancelAnimationFrame(this.timer);
      // let the fade finish, then stop the tape and the clock
      this.sleep = window.setTimeout(() => {
        if (this.on) return;
        this.score?.pause();
        void ctx.suspend();
      }, 2400);
    }
    this.master.gain.setTargetAtTime(this.on ? 0.55 : 0, ctx.currentTime, 0.6);
    this.mix(1.2);
    return this.on;
  }

  private click() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    const b = ctx.createBuffer(1, 600, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 70);
    n.buffer = b;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1800 + Math.random() * 1600;
    const g = ctx.createGain();
    g.gain.value = 0.25 + Math.random() * 0.25;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.2 - 0.6;
    n.connect(f).connect(g).connect(pan).connect(this.keysGain);
    n.start(t);
  }

  private chirp() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 4);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.master);
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const s = t + i * 0.11;
      const f0 = 2600 + Math.random() * 1400;
      o.frequency.setValueAtTime(f0, s);
      o.frequency.exponentialRampToValueAtTime(f0 * (0.7 + Math.random() * 0.6), s + 0.08);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.025, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09);
      o.connect(g).connect(pan);
      o.start(s);
      o.stop(s + 0.1);
    }
  }

  private loop = () => {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    // gusts
    const gust = 0.5 + Math.sin(t * 0.21) * 0.25 + Math.sin(t * 0.53 + 1) * 0.15;
    this.windGain.gain.setTargetAtTime(0.25 + gust * 0.5, t, 0.5);
    this.windFilter.frequency.setTargetAtTime(280 + gust * 520, t, 0.6);
    if (Math.random() < this.keyRate * 0.3) {
      this.click();
      if (Math.random() < 0.5) setTimeout(() => this.on && this.click(), 60 + Math.random() * 90);
    }
    if (Math.random() < 0.0016) this.chirp();
    this.timer = requestAnimationFrame(this.loop);
  };
}
