import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';
import { deviceFor, type Media, type Project, type ReelMedia } from '../data/projects';
import type { Desk } from '../office/Office';
import type { Phone, Phones } from '../office/Phones';
import { damp } from '../core/math';
import { VH, VW, type Ctx } from './draw';
import type { Library } from './Library';
import { drawCard } from './programs/card';
import { drawReel, PH, PW } from './programs/reel';
import { drawSite } from './programs/site';
import { drawTape } from './programs/tape';
import { drawVacant } from './programs/vacant';

/** Seconds a channel change takes; the new picture arrives halfway. */
const SWITCH = 0.6;

interface Surface {
  canvas: HTMLCanvasElement;
  ctx: Ctx;
  tex: CanvasTexture;
  w: number;
  h: number;
}

function surface(w: number, h: number): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 4;
  return { canvas, ctx, tex, w, h };
}

interface Monitor {
  desk: Desk;
  project: Project | null;
  /** What the terminal is showing. */
  media: Media | null;
  /** A channel change in progress: what comes next, and how far along (0..1). */
  next: Media | null;
  sw: number;
  low: Surface | null;
  t: number;
  acc: number;
  fps: number;
  on: number;
  onTarget: number;
  boot: number;
  hover: number;
  hoverTarget: number;
  /** A vacant terminal still under its sheet: don't boot yet. */
  held: boolean;
}

interface Handset {
  phone: Phone;
  project: Project;
  media: ReelMedia;
  low: Surface;
  acc: number;
  t: number;
  /** Playing the full reel in someone's hand. */
  live: boolean;
}

/**
 * Drives every screen on the floor. Far terminals and phones redraw a few
 * times a second at low resolution from small silent loops; the desk you're
 * leaning over gets crisp surfaces at full frame rate, fed by the full files.
 * Vacant desks stay dark until visited.
 */
export class Screens {
  private monitors: Monitor[] = [];
  private handsets: Handset[] = [];
  private hi = surface(1024, 768);
  private hiPhone = surface(432, 768);
  private focused: Monitor | null = null;

  constructor(
    desks: Desk[],
    assignment: Map<number, Project>,
    private library: Library,
    phones: Phones,
    lowRes: [number, number] = [512, 384],
  ) {
    desks.forEach((desk, i) => {
      const project = assignment.get(desk.index) ?? null;
      project?.media.forEach((m) => library.add(m));
      const s: Monitor = {
        desk,
        project,
        media: project?.media.find((m) => deviceFor(m) === 'terminal') ?? null,
        next: null,
        sw: 1,
        low: project ? surface(...lowRes) : null,
        t: (i * 7.31) % 13,
        acc: Math.random(),
        fps: 10,
        on: project ? 1 : 0,
        onTarget: project ? 1 : 0,
        boot: 1,
        hover: 0,
        hoverTarget: 0,
        held: false,
      };
      const u = desk.screenMaterial.uniforms;
      if (s.low) {
        u.uMap.value = s.low.tex;
        u.uHasMap.value = 1;
        u.uRes.value.set(s.low.w, s.low.h);
      }
      u.uOn.value = s.on;
      this.monitors.push(s);

      const reel = project?.media.find((m): m is ReelMedia => m.kind === 'reel');
      const phone = phones.get(desk);
      if (project && reel && phone) {
        const low = surface(96, 170);
        phone.material.uniforms.uMap.value = low.tex;
        phone.material.uniforms.uHasMap.value = 1;
        this.handsets.push({ phone, project, media: reel, low, acc: Math.random(), t: 0, live: false });
      }
    });
  }

  private monitor(desk: Desk) {
    return this.monitors.find((x) => x.desk === desk)!;
  }

  private handset(desk: Desk) {
    return this.handsets.find((h) => h.phone.desk === desk) ?? null;
  }

  /** What a desk's terminal is showing (or about to). */
  terminalMedia(desk: Desk) {
    const s = this.monitor(desk);
    return s.next ?? s.media;
  }

  setHover(desk: Desk | null) {
    for (const s of this.monitors) s.hoverTarget = s.desk === desk ? 1 : 0;
  }

  /** Show a desk's screens hi-res. A held vacant terminal waits for wake(). */
  focus(desk: Desk | null, hold = false) {
    const prev = this.focused;
    if (prev && prev.desk === desk) return;
    if (prev) {
      const u = prev.desk.screenMaterial.uniforms;
      u.uFocus.value = 0;
      if (prev.low) {
        u.uMap.value = prev.low.tex;
        u.uRes.value.set(prev.low.w, prev.low.h);
      } else {
        prev.onTarget = 0; // vacant terminal powers down
        prev.held = false;
      }
      if (prev.media) this.library.stop(prev.media);
      const h = this.handset(prev.desk);
      if (h) {
        this.raise(prev.desk, false);
        h.phone.material.uniforms.uMap.value = h.low.tex;
      }
    }
    this.focused = null;
    if (!desk) return;
    const s = this.monitor(desk);
    this.focused = s;
    const u = desk.screenMaterial.uniforms;
    u.uMap.value = this.hi.tex;
    u.uHasMap.value = 1;
    u.uFocus.value = 1;
    u.uRes.value.set(this.hi.w, this.hi.h);
    if (!s.project) {
      s.t = 0;
      s.boot = 0;
      s.onTarget = 1;
      s.on = 1;
      s.held = hold;
    }
    if (s.media) this.library.play(s.media);
    const h = this.handset(desk);
    if (h) h.phone.material.uniforms.uMap.value = this.hiPhone.tex;
    this.drawMonitor(s, this.hi, true);
  }

  /** The sheet is off: let the vacant terminal boot. */
  wake(desk: Desk) {
    const s = this.monitors.find((x) => x.desk === desk);
    if (!s || !s.held) return;
    s.held = false;
    s.t = 0;
  }

  /** Change the terminal's channel to another piece of media. */
  tune(desk: Desk, media: Media) {
    const s = this.monitor(desk);
    if (deviceFor(media) !== 'terminal' || media === (s.next ?? s.media)) return;
    s.next = media;
    s.sw = 0;
  }

  /** Someone picks the phone up to show you the reel (or puts it down). */
  raise(desk: Desk, live: boolean) {
    const h = this.handset(desk);
    if (!h || h.live === live) return;
    h.live = live;
    if (live) this.library.play(h.media);
    else this.library.stop(h.media);
  }

  private drawMonitor(s: Monitor, surf: Surface, full: boolean) {
    const { ctx } = surf;
    ctx.setTransform(surf.w / VW, 0, 0, surf.h / VH, 0, 0);
    const p = s.project;
    const m = s.media;
    if (!p) drawVacant(ctx, s.t, s.desk.number);
    else if (!m) drawCard(ctx, s.t, p);
    else if (m.kind === 'site') drawSite(ctx, s.t, p, m, this.library.frame(m, full));
    else if (m.kind === 'film') drawTape(ctx, s.t, p, m, this.library.frame(m, full), full ? this.library.time(m) : null);
    surf.tex.needsUpdate = true;
  }

  private drawHandset(h: Handset, surf: Surface, full: boolean) {
    const { ctx } = surf;
    ctx.setTransform(surf.w / PW, 0, 0, surf.h / PH, 0, 0);
    const live = full && h.live;
    drawReel(ctx, h.t, h.project, h.media, this.library.frame(h.media, live), live ? this.library.time(h.media) : null);
    surf.tex.needsUpdate = true;
  }

  update(dt: number, time: number) {
    for (const s of this.monitors) {
      const u = s.desk.screenMaterial.uniforms;
      u.uTime.value = time;
      s.t += dt;
      s.hover = damp(s.hover, s.hoverTarget, 8, dt);
      u.uHover.value = s.hover;

      // channel change: the new picture comes up through the snow
      if (s.next) {
        const was = s.sw;
        s.sw = Math.min(1, s.sw + dt / SWITCH);
        if (was < 0.5 && s.sw >= 0.5) {
          if (s === this.focused) {
            if (s.media) this.library.stop(s.media);
            this.library.play(s.next);
          }
          s.media = s.next;
        }
        if (s.sw >= 1) s.next = null;
      }
      u.uSwitch.value = s.next ? Math.sin(Math.PI * s.sw) : 0;

      if (!s.project) {
        // vacant: boot sequence on focus, power-down on leave
        if (s.held) {
          s.t = 0;
        } else if (s.onTarget > 0) {
          s.boot = Math.min(1, s.boot + dt / 1.1);
        } else {
          s.boot = Math.max(0, s.boot - dt / 0.35);
          if (s.boot === 0) {
            s.on = 0;
            u.uHasMap.value = 0;
          }
        }
        u.uBoot.value = s.boot;
        u.uOn.value = s.on;
      }

      if (s === this.focused) {
        this.drawMonitor(s, this.hi, true);
        continue;
      }
      if (!s.low) continue;
      // a far terminal changing channel redraws every frame, so the snow reads
      s.acc += dt * (s.next ? 30 : s.fps);
      if (s.acc >= 1) {
        s.acc %= 1;
        this.drawMonitor(s, s.low, false);
      }
    }

    for (const h of this.handsets) {
      h.t += dt;
      const mon = this.monitor(h.phone.desk);
      h.phone.material.uniforms.uHover.value = mon.hover;
      if (mon === this.focused) {
        this.drawHandset(h, this.hiPhone, true);
        continue;
      }
      h.acc += dt * 10;
      if (h.acc >= 1) {
        h.acc %= 1;
        this.drawHandset(h, h.low, false);
      }
    }
  }
}
