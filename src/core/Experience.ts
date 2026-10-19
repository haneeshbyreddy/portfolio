import {
  HalfFloatType,
  NoToneMapping,
  PCFShadowMap,
  Plane,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  BloomEffect,
  BrightnessContrastEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  KernelSize,
  NoiseEffect,
  RenderPass,
  TiltShiftEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  BlendFunction,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { applyShaderPatches } from './shaderPatches';
import { detectQuality, type Quality } from './quality';
import { ShiftCamera } from './ShiftCamera';
import { CameraRig } from './CameraRig';
import { damp } from './math';
import { createWorld } from '../world/World';
import { shared } from '../world/shared';
import { Office, type Desk } from '../office/Office';
import { Workers } from '../office/Workers';
import { FILL_ORDER } from '../office/layout';
import { SCREEN } from '../office/parts';
import { Screens } from '../screens/Screens';
import { projects, type Project } from '../data/projects';

export interface ExperienceEvents {
  hover: (desk: Desk | null, project: Project | null) => void;
  focus: (desk: Desk | null, project: Project | null) => void;
  arrive: (mode: string) => void;
  progress: (p: number) => void;
}

type Listener<K extends keyof ExperienceEvents> = ExperienceEvents[K];

export class Experience {
  readonly quality: Quality;
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: ShiftCamera;
  readonly rig: CameraRig;
  readonly office: Office;
  readonly workers: Workers;
  readonly screens: Screens;
  /** desk.index → project */
  readonly assignment = new Map<number, Project>();
  /** projects in floor order with their desks */
  readonly roster: { project: Project; desk: Desk }[] = [];

  private composer: EffectComposer;
  private tilt: TiltShiftEffect | null = null;
  private world: ReturnType<typeof createWorld>;
  private raycaster = new Raycaster();
  private ndc = new Vector2();
  private ground = new Plane(new Vector3(0, 1, 0), 0);
  private hovered: Desk | null = null;
  private cursorStrength = 0;
  private cursorTarget = 0;
  private listeners: { [K in keyof ExperienceEvents]?: Listener<K>[] } = {};
  private last = performance.now();
  private clock = 0;
  private pointerInside = false;
  private drag = { active: false, x: 0, y: 0, moved: 0, t: 0, id: -1 };
  private running = false;
  readonly focusedDesk: { current: Desk | null } = { current: null };

  constructor(private host: HTMLElement) {
    applyShaderPatches();
    this.quality = detectQuality();
    const q = this.quality;

    this.renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    this.renderer.setPixelRatio(q.dpr);
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.className = 'gl';
    host.appendChild(this.renderer.domElement);

    this.camera = new ShiftCamera(35, host.clientWidth / host.clientHeight, 0.08, 9000);
    this.rig = new CameraRig(this.camera);
    this.rig.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.world = createWorld(this.scene, this.renderer, q);

    // assign projects to desks in hiring order
    const occupied = new Set<number>();
    projects.forEach((p, i) => {
      const slot = FILL_ORDER[i];
      if (!slot) return;
      const idx = slot[0] * 4 + slot[1];
      occupied.add(idx);
    });
    this.office = new Office(this.scene, occupied, q.shadows);
    projects.forEach((p, i) => {
      const slot = FILL_ORDER[i];
      if (!slot) return;
      const desk = this.office.desks[slot[0] * 4 + slot[1]];
      this.assignment.set(desk.index, p);
      this.roster.push({ project: p, desk });
    });
    this.workers = new Workers(this.office.root, this.roster.map(({ desk, project }) => ({ desk, seed: project.id })), q.shadows);
    this.screens = new Screens(this.office.desks, this.assignment, q.tier === 'low' ? [384, 288] : [512, 384]);

    this.composer = this.createComposer();
    this.rig.onArrive = () => this.emit('arrive', this.rig.mode);

    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /* ------------------------------------------------------------------ */

  private createComposer() {
    const q = this.quality;
    const composer = new EffectComposer(this.renderer, {
      frameBufferType: HalfFloatType,
      multisampling: q.msaa,
    });
    composer.addPass(new RenderPass(this.scene, this.camera));

    if (q.ao) {
      const ao = new N8AOPostPass(this.scene, this.camera, this.host.clientWidth, this.host.clientHeight);
      ao.configuration.aoRadius = 0.9;
      ao.configuration.distanceFalloff = 0.5;
      ao.configuration.intensity = 2.2;
      ao.configuration.halfRes = true;
      ao.configuration.depthAwareUpsampling = true;
      ao.setQualityMode('Medium');
      composer.addPass(ao);
    }

    if (q.tiltShift) {
      this.tilt = new TiltShiftEffect({ offset: -0.06, focusArea: 0.5, feather: 0.32, kernelSize: KernelSize.MEDIUM });
      composer.addPass(new EffectPass(this.camera, this.tilt));
    }

    const bloom = new BloomEffect({
      intensity: 0.65,
      luminanceThreshold: 0.82,
      luminanceSmoothing: 0.22,
      mipmapBlur: true,
      radius: 0.68,
    });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
    const hue = new HueSaturationEffect({ saturation: -0.08 });
    const contrast = new BrightnessContrastEffect({ brightness: 0.0, contrast: 0.07 });
    const vignette = new VignetteEffect({ darkness: 0.52, offset: 0.26 });
    const noise = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN });
    noise.blendMode.opacity.value = 0.055;
    composer.addPass(new EffectPass(this.camera, bloom, tone, hue, contrast, vignette, noise));
    return composer;
  }

  /* ------------------------------------------------------------------ */

  on<K extends keyof ExperienceEvents>(k: K, fn: ExperienceEvents[K]) {
    (this.listeners[k] ??= [] as never[]).push(fn as never);
  }

  private emit<K extends keyof ExperienceEvents>(k: K, ...args: Parameters<ExperienceEvents[K]>) {
    (this.listeners[k] as ((...a: unknown[]) => void)[] | undefined)?.forEach((fn) => fn(...args));
  }

  /** Compile shaders behind the loader so the first frames don't hitch. */
  async warmup() {
    // never let a background tab or a slow driver hang the loader
    const frame = () => new Promise<void>((r) => {
      const id = setTimeout(r, 120);
      requestAnimationFrame(() => {
        clearTimeout(id);
        r();
      });
    });
    const timeout = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    this.emit('progress', 0.15);
    await frame();
    try {
      await Promise.race([this.renderer.compileAsync(this.scene, this.camera), timeout(2500)]);
    } catch {
      this.renderer.compile(this.scene, this.camera);
    }
    this.emit('progress', 0.6);
    // let the render loop draw a few frames (uploads, shadow maps) behind the loader
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      await frame();
      this.emit('progress', 0.6 + ((i + 1) / steps) * 0.4);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  /** The opening crane: from the tall grass up to the floor. */
  playIntro() {
    this.rig.go('overview', null, this.rig.reducedMotion ? 0.6 : 5.2);
  }

  /* ------------------------------------------------------------------ */

  focus(desk: Desk | null) {
    if (desk && this.focusedDesk.current === desk) return;
    this.focusedDesk.current = desk;
    if (desk) {
      this.rig.go('focus', desk);
      this.screens.focus(desk);
      this.workers.setFocus(desk);
    } else {
      this.rig.go('overview');
      this.screens.focus(null);
      this.workers.setFocus(null);
    }
    this.setHover(null);
    this.emit('focus', desk, desk ? this.assignment.get(desk.index) ?? null : null);
  }

  focusProject(project: Project) {
    const r = this.roster.find((x) => x.project === project);
    if (r) this.focus(r.desk);
  }

  step(dir: 1 | -1) {
    const cur = this.focusedDesk.current;
    if (!cur) return;
    // walk the floor in hiring order, including vacant desks at the end
    const order = FILL_ORDER.map(([p, k]) => this.office.desks[p * 4 + k]);
    const occupiedOrder = order.filter((d) => d.occupied);
    const list = cur.occupied ? occupiedOrder : order;
    const i = list.indexOf(cur);
    const next = list[(i + dir + list.length) % list.length];
    this.focus(next);
  }

  /* ------------------------------------------------------------------ */

  private setHover(desk: Desk | null) {
    if (this.hovered === desk) return;
    this.hovered = desk;
    this.screens.setHover(desk);
    this.workers.setHover(desk);
    this.emit('hover', desk, desk ? this.assignment.get(desk.index) ?? null : null);
  }

  private pick(clientX: number, clientY: number): Desk | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const ray = this.raycaster.ray;
    let best: Desk | null = null;
    let bestD = Infinity;
    const hit = new Vector3();
    for (const d of this.office.desks) {
      if (ray.intersectBox(d.hitBox, hit)) {
        const dist = hit.distanceToSquared(ray.origin);
        if (dist < bestD) {
          bestD = dist;
          best = d;
        }
      }
    }
    // the cursor parts the grass
    if (ray.intersectPlane(this.ground, hit)) {
      shared.uCursor.value.x = hit.x;
      shared.uCursor.value.z = hit.z;
    }
    return best;
  }

  private bindInput() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      this.drag = { active: true, x: e.clientX, y: e.clientY, moved: 0, t: performance.now(), id: e.pointerId };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      this.pointerInside = true;
      const w = window.innerWidth, h = window.innerHeight;
      this.rig.pointer.set((e.clientX / w) * 2 - 1, -((e.clientY / h) * 2 - 1));
      if (this.drag.active && this.drag.id === e.pointerId) {
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
        if (this.drag.moved > 6) this.rig.orbit(dx, dy);
        document.body.classList.toggle('is-dragging', this.drag.moved > 6 && this.rig.mode === 'overview');
      }
      if (this.rig.mode === 'overview' && !this.rig.isTransitioning()) {
        this.setHover(this.drag.moved > 6 ? null : this.pick(e.clientX, e.clientY));
        this.cursorTarget = 1;
      } else {
        this.pick(e.clientX, e.clientY);
        this.cursorTarget = 0.4;
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (!this.drag.active) return;
      const click = this.drag.moved < 8 && performance.now() - this.drag.t < 600;
      this.drag.active = false;
      document.body.classList.remove('is-dragging');
      el.releasePointerCapture(e.pointerId);
      if (!click) return;
      if (this.rig.mode === 'overview') {
        const d = this.pick(e.clientX, e.clientY);
        if (d) this.focus(d);
      } else if (this.rig.mode === 'focus') {
        const d = this.pick(e.clientX, e.clientY);
        if (d && d !== this.focusedDesk.current) this.focus(d);
      }
    });
    el.addEventListener('pointerleave', () => {
      this.pointerInside = false;
      this.cursorTarget = 0;
      this.setHover(null);
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.rig.zoom(e.deltaY);
    }, { passive: false });
  }

  resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.camera.aspect = w / h;
    this.rig.layout = w / h < 0.9 ? 'tall' : 'wide';
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  // adaptive resolution: if the GPU can't hold ~45fps, quietly render fewer pixels
  private perf = { ema: 1 / 60, timer: 0, warm: 0 };

  private tick() {
    const now = performance.now();
    const raw = (now - this.last) / 1000;
    const dt = Math.min(0.05, raw);
    this.last = now;
    this.renderFrame(dt);

    const p = this.perf;
    if (raw < 0.25) p.ema += (raw - p.ema) * 0.05; // ignore tab switches
    p.warm += raw;
    p.timer += raw;
    if (p.warm > 3 && p.timer > 2) {
      p.timer = 0;
      const dpr = this.renderer.getPixelRatio();
      if (p.ema > 1 / 45 && dpr > 1) {
        const next = Math.max(1, dpr - 0.25);
        this.renderer.setPixelRatio(next);
        this.resize();
        if (import.meta.env.DEV) console.info(`[fieldwork] dpr → ${next}`);
      }
    }
  }

  /** Dev helper: advance the world by `seconds` without waiting for frames. */
  debugStep(seconds: number) {
    const n = Math.ceil(seconds * 30);
    for (let i = 0; i < n; i++) this.renderFrame(1 / 30, i === n - 1);
  }

  private renderFrame(dt: number, draw = true) {
    this.clock += dt;
    const time = this.clock;
    this.world.update(time);
    this.rig.update(dt);
    this.workers.update(dt, time, this.camera.position);
    this.office.update();
    this.screens.update(dt, time);

    this.cursorStrength = damp(this.cursorStrength, this.pointerInside ? this.cursorTarget : 0, 4, dt);
    shared.uCursor.value.y = this.cursorStrength;

    if (this.tilt) {
      const focus = this.rig.mode === 'focus';
      const t = this.tilt;
      t.offset = damp(t.offset, focus ? 0.02 : -0.06, 3, dt);
      t.focusArea = damp(t.focusArea, focus ? 0.62 : 0.5, 3, dt);
    }
    if (draw) this.composer.render(dt);
  }

  /** Viewport rect of a desk's CRT face — the case study grows out of it. */
  screenRect(desk: Desk) {
    const hw = SCREEN.width / 2, hh = SCREEN.height / 2, c = SCREEN.center;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [dx, dy] of [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]]) {
      const v = new Vector3(c.x + dx, c.y + dy, c.z).applyMatrix4(desk.matrix);
      const p = this.project(v);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /** Screen-space position of a world point (for DOM labels). */
  project(v: Vector3, out = new Vector2()) {
    const p = v.clone().project(this.camera);
    out.set((p.x * 0.5 + 0.5) * this.host.clientWidth, (-p.y * 0.5 + 0.5) * this.host.clientHeight);
    return { x: out.x, y: out.y, visible: p.z < 1 && p.z > -1 };
  }
}
