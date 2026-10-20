import type { Media } from '../data/projects';

/** A piece of media's playable sources. */
interface Clip {
  media: Media;
  poster: HTMLImageElement;
  /** Silent, low-res loop for distant monitors. */
  floor: HTMLVideoElement | null;
  /** Full quality, made the first time someone sits down at the desk. */
  full: HTMLVideoElement | null;
}

export type Frame = HTMLVideoElement | HTMLImageElement;

const ready = (v: HTMLVideoElement | null): v is HTMLVideoElement => !!v && v.readyState >= 2 && v.videoWidth > 0;

/**
 * Every video on the floor. Out on the lawn each monitor plays a tiny silent
 * loop (or just its poster on the lowest tier); the desk you sit at swaps to
 * the full file. Exactly one piece of media may make sound — the one the
 * visitor picked — and only while sound is on.
 */
export class Library {
  private clips = new Map<Media, Clip>();
  /** Videos must live in the document for some browsers to decode them. */
  private tray: HTMLElement;
  private sound = false;
  private audible: Media | null = null;
  /** The case study sets its own volume, whatever the floor's sound is doing. */
  private forced = new Map<Media, boolean>();

  constructor(private lite: boolean) {
    this.tray = document.createElement('div');
    this.tray.className = 'video-tray';
    this.tray.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.tray);
  }

  private clip(m: Media): Clip {
    let c = this.clips.get(m);
    if (!c) {
      const poster = new Image();
      poster.decoding = 'async';
      poster.src = m.poster;
      c = { media: m, poster, floor: null, full: null };
      this.clips.set(m, c);
    }
    return c;
  }

  /** Register media so its poster starts loading now. */
  add(m: Media) {
    this.clip(m);
  }

  private video(src: string, loop: boolean, poster?: string) {
    const v = document.createElement('video');
    if (poster) v.poster = poster;
    v.muted = true;
    v.defaultMuted = true;
    v.loop = loop;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.src = src;
    this.tray.appendChild(v);
    return v;
  }

  /** Start every floor loop. Called once the loader has gone, so they don't slow the first frame. */
  startFloor() {
    if (this.lite) return;
    for (const c of this.clips.values()) {
      if (!c.media.floor || c.floor) continue;
      c.floor = this.video(c.media.floor, true);
      c.floor.autoplay = true;
      c.floor.play().catch(() => undefined);
    }
  }

  /** Full-quality playback, from the top unless `resume`. Returns the element (the case study shows it). */
  play(m: Media, resume = false) {
    const c = this.clip(m);
    if (!c.full) c.full = this.video(m.src, true, m.poster);
    const v = c.full;
    if (!resume && v.currentTime > 0.05) v.currentTime = 0;
    this.applyVolume(c);
    v.play().catch(() => {
      // a browser that refuses unmuted playback still plays muted
      v.muted = true;
      v.play().catch(() => undefined);
    });
    return v;
  }

  /** Stop decoding the full file; the floor loop takes over again. */
  stop(m: Media) {
    const v = this.clips.get(m)?.full;
    if (v && !v.paused) v.pause();
  }

  element(m: Media) {
    return this.clips.get(m)?.full ?? null;
  }

  /** Put a video lent to the page (the case study) back where it decodes out of sight. */
  home(m: Media) {
    const v = this.clips.get(m)?.full;
    if (v && v.parentElement !== this.tray) this.tray.appendChild(v);
  }

  /** The best picture available right now. */
  frame(m: Media, full: boolean): Frame | null {
    const c = this.clip(m);
    if (full && ready(c.full)) return c.full;
    if (ready(c.floor)) return c.floor;
    return c.poster.complete && c.poster.naturalWidth ? c.poster : null;
  }

  /** Playback position of the full file, for on-screen counters. */
  time(m: Media) {
    const v = this.clips.get(m)?.full;
    return v ? { t: v.currentTime, paused: v.paused || v.readyState < 3 } : null;
  }

  setSound(on: boolean) {
    this.sound = on;
    this.refresh();
  }

  /** The one piece of media allowed to make sound (null: none). */
  setAudible(m: Media | null) {
    this.audible = m;
    this.refresh();
  }

  /** Turn one piece up or down regardless of the floor's sound (null hands control back). */
  force(m: Media, on: boolean | null) {
    if (on === null) this.forced.delete(m);
    else this.forced.set(m, on);
    this.refresh();
  }

  clearForced() {
    this.forced.clear();
    this.refresh();
  }

  get hasSound() {
    return this.sound;
  }

  /** Is a film or reel playing out loud right now? The score gets out of its way. */
  get speaking() {
    for (const c of this.clips.values()) {
      if (c.media.kind === 'site' || !c.full || c.full.paused) continue;
      if (this.forced.get(c.media) ?? (this.sound && c.media === this.audible)) return true;
    }
    return false;
  }

  private applyVolume(c: Clip) {
    if (!c.full) return;
    const on = this.forced.get(c.media) ?? (this.sound && c.media === this.audible);
    c.full.muted = !on;
    c.full.volume = 0.9;
  }

  private refresh() {
    for (const c of this.clips.values()) this.applyVolume(c);
  }
}
