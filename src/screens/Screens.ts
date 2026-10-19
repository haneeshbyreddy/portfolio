import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';
import type { Project } from '../data/projects';
import type { Desk } from '../office/Office';
import { damp } from '../core/math';
import { VH, VW, type Ctx } from './draw';
import { drawLanding } from './programs/landing';
import { drawSaas } from './programs/saas';
import { drawFilm } from './programs/film';
import { drawBrand } from './programs/brand';
import { drawApp } from './programs/app';
import { drawVacant } from './programs/vacant';

type Program = (ctx: Ctx, t: number, p: Project) => void;
const PROGRAMS: Record<Project['discipline'], Program> = {
  landing: drawLanding,
  saas: drawSaas,
  film: drawFilm,
  brand: drawBrand,
  app: drawApp,
};

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

interface Screen {
  desk: Desk;
  project: Project | null;
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

/**
 * Drives every monitor on the floor. Far screens redraw a few times a second
 * at low resolution; the one you're looking over a shoulder at gets a crisp
 * 1024×768 surface at full frame rate. Vacant desks stay dark until visited.
 */
export class Screens {
  private screens: Screen[] = [];
  private hi = surface(1024, 768);
  private focused: Screen | null = null;
  private lowRes: [number, number];

  constructor(desks: Desk[], assignment: Map<number, Project>, lowRes: [number, number] = [512, 384]) {
    this.lowRes = lowRes;
    desks.forEach((desk, i) => {
      const project = assignment.get(desk.index) ?? null;
      const s: Screen = {
        desk,
        project,
        low: project ? surface(...this.lowRes) : null,
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
      this.screens.push(s);
    });
  }

  /** The live hi-res surface of the focused screen (shown in the case study). */
  get hiCanvas() {
    return this.hi.canvas;
  }

  setHover(desk: Desk | null) {
    for (const s of this.screens) s.hoverTarget = s.desk === desk ? 1 : 0;
  }

  /** Show a desk's screen hi-res. A held vacant terminal waits for wake(). */
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
    }
    this.focused = null;
    if (!desk) return;
    const s = this.screens.find((x) => x.desk === desk)!;
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
    this.draw(s, this.hi);
  }

  /** The sheet is off: let the vacant terminal boot. */
  wake(desk: Desk) {
    const s = this.screens.find((x) => x.desk === desk);
    if (!s || !s.held) return;
    s.held = false;
    s.t = 0;
  }

  private draw(s: Screen, surf: Surface) {
    const { ctx } = surf;
    ctx.setTransform(surf.w / VW, 0, 0, surf.h / VH, 0, 0);
    if (s.project) PROGRAMS[s.project.discipline](ctx, s.t, s.project);
    else drawVacant(ctx, s.t, s.desk.number);
    surf.tex.needsUpdate = true;
  }

  update(dt: number, time: number) {
    for (const s of this.screens) {
      const u = s.desk.screenMaterial.uniforms;
      u.uTime.value = time;
      s.t += dt;
      s.hover = damp(s.hover, s.hoverTarget, 8, dt);
      u.uHover.value = s.hover;

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
        this.draw(s, this.hi);
        continue;
      }
      if (!s.low) continue;
      s.acc += dt * s.fps;
      if (s.acc >= 1) {
        s.acc %= 1;
        this.draw(s, s.low);
      }
    }
  }
}
