import {
  FogExp2,
  HalfFloatType,
  Matrix4,
  NoToneMapping,
  PCFShadowMap,
  Plane,
  Ray,
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
import { Controls } from './Controls';
import { clamp, damp, smoothstep } from './math';
import { createWorld } from '../world/World';
import { shared } from '../world/shared';
import { Office, type Desk } from '../office/Office';
import { Workers } from '../office/Workers';
import { PHONE, Phones } from '../office/Phones';
import { fillOrder, floorBounds } from '../office/layout';
import { SCREEN } from '../office/parts';
import { Screens } from '../screens/Screens';
import { Library } from '../screens/Library';
import { deviceFor, projects, type Device, type Project } from '../data/projects';

export interface ExperienceEvents {
  hover: (desk: Desk | null, project: Project | null) => void;
  focus: (desk: Desk | null, project: Project | null) => void;
  /** The piece of media on show at the focused desk changed. */
  media: (desk: Desk, project: Project, index: number) => void;
  /** At a desk, the pointer is over a device you could switch to (or nothing). */
  aim: (device: Device | null) => void;
  arrive: (mode: string) => void;
  progress: (p: number) => void;
  /** After the camera has moved for a frame — anything pinned to the scene follows here. */
  frame: (dt: number) => void;
}

/** Fog density at full veil, as a multiple of the clear day's: dense enough to hide the grass at your feet. */
const VEIL_RANGE = 24000;

type Listener<K extends keyof ExperienceEvents> = ExperienceEvents[K];

export class Experience {
  readonly quality: Quality;
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: ShiftCamera;
  readonly rig: CameraRig;
  readonly controls: Controls;
  readonly office: Office;
  readonly workers: Workers;
  readonly phones: Phones;
  readonly screens: Screens;
  readonly library: Library;
  /** Which of the focused project's media is on show. */
  selected = 0;
  /** desk.index → project */
  readonly assignment = new Map<number, Project>();
  /** projects in floor order with their desks */
  readonly roster: { project: Project; desk: Desk }[] = [];
  /** Every desk index in hiring order: the projects' line first, then the empty desks. */
  private readonly fill: number[];

  private composer: EffectComposer;
  private tilt: TiltShiftEffect | null = null;
  /** Corners of the furnished floor, ground to just above the heads — what the lens keeps sharp. */
  private floorHull = (() => {
    const f = floorBounds();
    const pts: Vector3[] = [];
    for (const x of [f.x0, f.x1]) for (const z of [f.z0, f.z1]) for (const y of [0, 1.45]) pts.push(new Vector3(x, y, z));
    return pts;
  })();
  private _v = new Vector3();
  private _ray = new Ray();
  private _inv = new Matrix4();
  private world: ReturnType<typeof createWorld>;
  private raycaster = new Raycaster();
  private ndc = new Vector2();
  private ground = new Plane(new Vector3(0, 1, 0), 0);
  private hovered: Desk | null = null;
  private aimed: Device | null = null;
  private cursorStrength = 0;
  private cursorTarget = 0;
  private listeners: { [K in keyof ExperienceEvents]?: Listener<K>[] } = {};
  private last = performance.now();
  private clock = 0;
  private pointerInside = false;
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
    this.clearDensity = (this.scene.fog as FogExp2).density;

    // assign projects to desks in hiring order
    this.fill = fillOrder(projects.length);
    const hired = projects.slice(0, this.fill.length);
    const handsets = new Set(hired.flatMap((p, i) => (p.media.some((m) => deviceFor(m) === 'phone') ? [this.fill[i]] : [])));
    this.office = new Office(this.scene, new Set(hired.map((_, i) => this.fill[i])), q.shadows, handsets);
    hired.forEach((p, i) => {
      const desk = this.office.desks[this.fill[i]];
      this.assignment.set(desk.index, p);
      this.roster.push({ project: p, desk });
    });
    this.phones = new Phones(this.office.root, [...handsets].map((i) => this.office.desks[i]), this.office.material, q.shadows);
    this.workers = new Workers(this.office.root, this.roster.map(({ desk, project }) => ({ desk, seed: project.id })), q.shadows);
    this.workers.phones = this.phones;
    this.library = new Library(q.tier === 'low');
    this.screens = new Screens(this.office.desks, this.assignment, this.library, this.phones, q.tier === 'low' ? [384, 288] : [512, 384]);

    this.composer = this.createComposer();
    this.rig.onArrive = () => this.emit('arrive', this.rig.mode);

    this.controls = new Controls(this.renderer.domElement, this.rig, {
      tap: (x, y) => this.tap(x, y),
      doubleTap: (x, y) => this.doubleTap(x, y),
      move: (x, y, dragging) => this.pointerMoved(x, y, dragging),
      leave: () => {
        this.pointerInside = false;
        this.cursorTarget = 0;
        this.setHover(null);
      },
      back: () => this.focus(null),
      dive: (x, y) => {
        const d = this.pick(x, y);
        if (d) this.focus(d);
        return !!d;
      },
    });
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

  /* ------------------------------------------------------------------ */
  /* The opening fog                                                     */
  /* ------------------------------------------------------------------ */

  /** 1 = the meadow is lost in fog, as the opening finds it. 0 = an ordinary overcast day. */
  private veil = 0;
  private lift: { from: number; t: number; dur: number } | null = null;
  private clearDensity = 0;

  /**
   * Fog density runs on a log scale from the veil, so as it falls the meadow
   * comes back in depth order: the grass at your feet, the field, the floor of
   * desks, the treeline, and the sky last.
   */
  setVeil(v: number) {
    this.veil = clamp(v);
    const fog = this.scene.fog as FogExp2;
    fog.density = this.clearDensity * Math.pow(VEIL_RANGE, this.veil);
    // the desks sit ~60 m out from the opening shot; screens fade with them
    const hidden = (d: number) => 1 - Math.exp(-d * 60);
    shared.uVeil.value = clamp((hidden(fog.density) - hidden(this.clearDensity)) / (1 - hidden(this.clearDensity)));
    this.world.sky.material.uniforms.uVeil.value = smoothstep(0.02, 0.42, this.veil);
  }

  /** How much fog is left (1 at the opening, 0 once it has lifted). */
  get fog() {
    return this.veil;
  }

  /** Thin the fog away over `seconds`. */
  liftVeil(seconds: number) {
    this.lift = { from: this.veil, t: 0, dur: Math.max(0.01, seconds) };
  }

  private stepVeil(dt: number) {
    const l = this.lift;
    if (!l) return;
    l.t += dt;
    const k = Math.min(1, l.t / l.dur);
    // the densest part of the fog hides nothing worth waiting for, so it goes
    // quickly; the meadow then takes its time coming back
    this.setVeil(l.from * Math.pow(1 - k, 2.2));
    if (k >= 1) this.lift = null;
  }

  /** Screen y (CSS px) of the eye-level horizon for the opening shot. */
  horizonY() {
    this.camera.updateMatrixWorld();
    const f = this.camera.getWorldDirection(this._v);
    f.y = 0;
    f.normalize().multiplyScalar(4000).add(this.camera.position);
    return this.project(f).y;
  }

  /** The opening crane: from the tall grass up to the floor. */
  playIntro() {
    this.rig.go('overview', null, this.rig.reducedMotion ? 0.6 : 5.2);
    this.library.startFloor();
  }

  /* ------------------------------------------------------------------ */

  focus(desk: Desk | null) {
    if (desk && this.focusedDesk.current === desk) return;
    const prev = this.focusedDesk.current;
    if (prev) this.settle(prev);
    this.focusedDesk.current = desk;
    if (desk) {
      // every visit starts on the project's lead piece
      const project = this.assignment.get(desk.index);
      this.selected = 0;
      this.rig.subject = project ? deviceFor(project.media[0]) : 'terminal';
      this.rig.go('focus', desk);
      this.screens.focus(desk);
      this.workers.setFocus(desk);
      if (project) this.show(desk, project, 0);
    } else {
      this.rig.go('overview');
      this.screens.focus(null);
      this.workers.setFocus(null);
    }
    this.setHover(null);
    this.setAim(null);
    this.emit('focus', desk, desk ? this.assignment.get(desk.index) ?? null : null);
  }

  /** Put a piece of the focused project's media on show: the terminal changes channel, or the phone comes up. */
  selectMedia(index: number) {
    const desk = this.focusedDesk.current;
    const project = desk ? this.assignment.get(desk.index) : null;
    if (!desk || !project || index === this.selected || !project.media[index]) return;
    this.selected = index;
    this.show(desk, project, index);
    this.rig.frame(deviceFor(project.media[index]));
  }

  private show(desk: Desk, project: Project, index: number) {
    const m = project.media[index];
    const phone = deviceFor(m) === 'phone';
    if (!phone) this.screens.tune(desk, m);
    this.screens.raise(desk, phone);
    this.workers.setShowing(desk, phone);
    this.workers.setWatching(desk, m.kind === 'film');
    this.library.setAudible(m);
    this.setAim(null);
    this.emit('media', desk, project, index);
  }

  /** Leaving a desk: the phone goes back in its stand and the terminal back to the lead piece. */
  private settle(desk: Desk) {
    this.workers.setShowing(desk, false);
    this.workers.setWatching(desk, false);
    this.library.setAudible(null);
    const lead = this.assignment.get(desk.index)?.media.find((m) => deviceFor(m) === 'terminal');
    if (lead) this.screens.tune(desk, lead);
  }

  /** The next desk in hiring order that nobody sits at yet. */
  firstVacant(): Desk | null {
    for (const i of this.fill) if (!this.office.desks[i].occupied) return this.office.desks[i];
    return null;
  }

  focusProject(project: Project) {
    const r = this.roster.find((x) => x.project === project);
    if (r) this.focus(r.desk);
  }

  step(dir: 1 | -1) {
    const cur = this.focusedDesk.current;
    if (!cur) return;
    // walk the floor in hiring order, including vacant desks at the end
    const order = this.fill.map((i) => this.office.desks[i]);
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

  private pointerMoved(x: number, y: number, dragging: boolean) {
    this.pointerInside = true;
    // parallax holds still under a drag, or it would fight the hand
    if (!dragging) this.rig.pointer.set((x / window.innerWidth) * 2 - 1, -((y / window.innerHeight) * 2 - 1));
    const desk = this.pick(x, y);
    if (this.rig.mode === 'overview' && !this.rig.isTransitioning() && !dragging) {
      this.setHover(desk);
      this.cursorTarget = 1;
    } else {
      this.setHover(null);
      this.cursorTarget = 0.4;
    }
    this.setAim(dragging ? null : this.switchable(this.pickDevice(x, y)));
  }

  /** A device on the focused desk that holds media other than what's on show. */
  private switchable(device: Device | null) {
    const desk = this.focusedDesk.current;
    const project = desk ? this.assignment.get(desk.index) : null;
    if (!device || !project || deviceFor(project.media[this.selected]) === device) return null;
    return project.media.some((m) => deviceFor(m) === device) ? device : null;
  }

  private setAim(device: Device | null) {
    if (device === this.aimed) return;
    this.aimed = device;
    this.emit('aim', device);
  }

  private tap(x: number, y: number) {
    const device = this.pickDevice(x, y);
    const fd = this.focusedDesk.current;
    const project = fd ? this.assignment.get(fd.index) : null;
    if (device && project) {
      const i = project.media.findIndex((m) => deviceFor(m) === device);
      if (i >= 0) {
        this.selectMedia(i);
        return;
      }
    }
    const d = this.pick(x, y);
    if (d && d !== this.focusedDesk.current && this.rig.mode !== 'intro') this.focus(d);
  }

  /** At a desk: is the pointer on its terminal or its phone? */
  private pickDevice(clientX: number, clientY: number): Device | null {
    const desk = this.focusedDesk.current;
    if (!desk || this.rig.mode !== 'focus') return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const phone = this.phones.get(desk);
    const p = phone ? this.hitFace(phone.matrix, 0, 0, PHONE.d / 2, PHONE.w / 2 + 0.012, PHONE.h / 2 + 0.012) : Infinity;
    const c = SCREEN.center;
    const t = this.hitFace(desk.matrix, c.x, c.y, c.z, SCREEN.width / 2 + 0.04, SCREEN.height / 2 + 0.04);
    if (p === Infinity && t === Infinity) return null;
    return p < t ? 'phone' : 'terminal';
  }

  /** Distance along the pointer ray to a rectangle facing ±Z in `frame`'s space, or Infinity on a miss. */
  private hitFace(frame: Matrix4, cx: number, cy: number, z: number, hw: number, hh: number) {
    const ray = this._ray.copy(this.raycaster.ray).applyMatrix4(this._inv.copy(frame).invert());
    if (Math.abs(ray.direction.z) < 1e-6) return Infinity;
    const t = (z - ray.origin.z) / ray.direction.z;
    if (t <= 0) return Infinity;
    const hit = ray.at(t, this._v);
    return Math.abs(hit.x - cx) <= hw && Math.abs(hit.y - cy) <= hh ? t : Infinity;
  }

  /** Double-click the open floor to step in toward that spot. */
  private doubleTap(x: number, y: number) {
    if (this.rig.mode !== 'overview' || this.pick(x, y)) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.rig.zoomAt(0.6, new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1));
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
    this.stepVeil(dt);
    this.world.update(time);
    this.controls.update(dt);
    this.rig.update(dt);
    this.workers.update(dt, time, this.camera.position);
    this.office.update();
    this.screens.update(dt, time);

    this.cursorStrength = damp(this.cursorStrength, this.pointerInside ? this.cursorTarget : 0, 4, dt);
    shared.uCursor.value.y = this.cursorStrength;

    if (this.tilt) {
      const t = this.tilt;
      // sharp band in NDC y: centre + half height. Intro and focus keep a fixed lens;
      // the overview fits the band to the floor so every row of desks stays crisp
      // and only the foreground grass and the far hills go soft.
      // at a desk the sharp band sits wherever the shift lens puts the subject
      let centre = this.rig.mode === 'focus' ? 0.02 + this.camera.shift.y : -0.06;
      let half = this.rig.mode === 'focus' ? 0.3 : 0.18;
      const band = this.rig.mode === 'overview' ? this.floorBand() : null;
      if (band) {
        centre = (band.lo + band.hi) / 2;
        half = (band.hi - band.lo) / 2 + 0.05;
      }
      t.offset = damp(t.offset, centre, 4, dt);
      t.focusArea = damp(t.focusArea, half + t.feather, 4, dt);
    }
    if (draw) this.composer.render(dt);
    this.emit('frame', dt);
  }

  /** Vertical extent of the floor on screen (NDC y). */
  private floorBand() {
    this.camera.updateMatrixWorld();
    let lo = Infinity, hi = -Infinity;
    for (const p of this.floorHull) {
      const v = this._v.copy(p).applyMatrix4(this.camera.matrixWorldInverse);
      // a corner behind the lens means the floor runs off the bottom of the frame
      if (v.z > -this.camera.near) {
        lo = -1.2;
        continue;
      }
      v.applyMatrix4(this.camera.projectionMatrix);
      lo = Math.min(lo, v.y);
      hi = Math.max(hi, v.y);
    }
    lo = Math.max(lo, -1.2);
    hi = Math.min(hi, 1.2);
    return hi > lo ? { lo, hi } : null;
  }

  /** World corners of a desk's CRT face. */
  private screenCorners(desk: Desk) {
    const hw = SCREEN.width / 2, hh = SCREEN.height / 2, c = SCREEN.center;
    return [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]].map(([dx, dy]) => new Vector3(c.x + dx, c.y + dy, c.z).applyMatrix4(desk.matrix));
  }

  /** Viewport rect of a desk's CRT face or phone display — the case study grows out of it. */
  screenRect(desk: Desk, device: Device = 'terminal') {
    const corners = device === 'phone' ? this.phones.screenCorners(desk) : this.screenCorners(desk);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const v of corners) {
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
