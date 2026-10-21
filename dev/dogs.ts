/**
 * Dev-only preview for src/camp/Dogs.ts — every coat × pose on a lawn under
 * the site's overcast light.
 *
 *   /dev/dogs.html?view=wide|close|far|side|top&dog=<i>&t=<seconds>
 *     &az=<rad>&el=<rad>&dist=<m>&yaw=<rad>&attn=<x,z>|walk&pause=1&tm=neutral|aces|none
 *     &only=0,3,5&ruler=1&dpr=2
 *
 * Dogs are laid out row = coat (golden, black, collie), column = pose
 * (lying, sleeping, sitting); index = row * 3 + column.
 *
 * window.__step(seconds) advances the animation clock on a fixed 1/60 s step
 * and renders; window.__attention(x, z | null), window.__cam(az, el, dist, dog?)
 * window.__info() for triangle counts.
 */
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  NoToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Plane,
  Quaternion,
  Raycaster,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Dogs, type DogCoat, type DogPlacement, type DogPose } from '../src/camp/Dogs';
import { applyShaderPatches } from '../src/core/shaderPatches';
import { createSky } from '../src/world/Sky';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const view = q.get('view') ?? 'wide';
const COATS: DogCoat[] = ['golden', 'black', 'collie'];
const POSES: DogPose[] = ['lying', 'sleeping', 'sitting'];
const SUN_DIR = new Vector3(-0.45, 0.62, -0.62).normalize();

applyShaderPatches();

const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(num('dpr', Math.min(2, devicePixelRatio)));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
const tm = q.get('tm') ?? 'neutral';
renderer.toneMapping = tm === 'aces' ? ACESFilmicToneMapping : tm === 'none' ? NoToneMapping : NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color('#b7bfbc');
scene.fog = new FogExp2(new Color('#b7bfbc').getHex(), 0.016);

// light: as the site
const hemi = new HemisphereLight(new Color('#d6dee0'), new Color('#4d5a3a'), 0.55);
scene.add(hemi);
const sun = new DirectionalLight(new Color('#fff4e6'), 1.25);
sun.position.copy(SUN_DIR).multiplyScalar(30);
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 70 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 5;
scene.add(sun, sun.target);

// environment: the site's sky over a meadow-coloured ground, prefiltered
{
  const envScene = new Scene();
  const sky = createSky(SUN_DIR);
  sky.mesh.scale.setScalar(0.02);
  envScene.add(sky.mesh);
  const g = new Mesh(new CircleGeometry(80, 32), new MeshBasicMaterial({ color: new Color('#56703c') }));
  g.rotation.x = -Math.PI / 2;
  g.position.y = -2;
  envScene.add(g);
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.03, 0.1, 200).texture;
  scene.environmentIntensity = 0.9;
  pmrem.dispose();
}

// lawn
const lawn = new Mesh(new CircleGeometry(60, 64), new MeshStandardMaterial({ color: new Color('#5d873b'), roughness: 1 }));
lawn.rotation.x = -Math.PI / 2;
lawn.receiveShadow = true;
scene.add(lawn);

// dogs
const only = q.get('only')?.split(',').map(Number);
const yaw = num('yaw', 0.55);
const placements: DogPlacement[] = [];
const centres: Vector3[] = [];
COATS.forEach((coat, row) => {
  POSES.forEach((pose, col) => {
    const i = row * 3 + col;
    const pos = new Vector3((col - 1) * 1.9, 0, (1 - row) * 1.8);
    centres.push(pos);
    if (only && !only.includes(i)) return;
    placements.push({
      matrix: new Matrix4().compose(pos, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), new Vector3(1, 1, 1)),
      pose,
      coat,
      seed: num('seed', 11) * 97 + i * 7919,
    });
  });
});
const t0 = performance.now();
const dogs = new Dogs(scene, placements, true);
const buildMs = performance.now() - t0;

if (q.get('ruler')) {
  for (const h of [0.3, 0.45, 0.75]) {
    const m = new Mesh(new BoxGeometry(0.01, h, 0.01), new MeshBasicMaterial({ color: '#ffffff' }));
    m.position.set(-2.95 + h, h / 2, 1.8);
    scene.add(m);
  }
}

// attention marker
const marker = new Mesh(new RingGeometry(0.05, 0.08, 24), new MeshBasicMaterial({ color: '#e2601e' }));
marker.rotation.x = -Math.PI / 2;
marker.position.y = 0.01;
marker.visible = false;
scene.add(marker);

let attention: Vector3 | null = null;
const attnParam = q.get('attn');
if (attnParam && attnParam !== 'walk') {
  const [x, z] = attnParam.split(',').map(Number);
  attention = new Vector3(x, 0, z);
}

// camera
const camera = new PerspectiveCamera(num('fov', 35), innerWidth / innerHeight, 0.05, 400);
const dogIndex = num('dog', 0);
const cam = { az: 0, el: 0.42, dist: 7.2, target: new Vector3(0, 0.25, 0) };
function frame(az?: number, el?: number, dist?: number, dog?: number) {
  const focus = dog ?? dogIndex;
  if (view === 'head') {
    const c = centres[focus] ?? new Vector3();
    const pose = POSES[focus % 3];
    const local = pose === 'sitting' ? new Vector3(0, 0.66, 0.2) : pose === 'sleeping' ? new Vector3(0, 0.17, 0.36) : new Vector3(0, 0.44, 0.34);
    cam.target.copy(local.applyAxisAngle(new Vector3(0, 1, 0), yaw).add(c));
    cam.az = yaw - 0.55;
    cam.el = 0.12;
    cam.dist = 0.75;
  } else if (view === 'close' || view === 'far' || view === 'side' || view === 'front' || view === 'back') {
    const c = centres[focus] ?? new Vector3();
    const pose = POSES[focus % 3];
    cam.target.set(c.x, pose === 'sitting' ? 0.38 : 0.22, c.z);
    const facing = yaw;
    const rel = view === 'side' ? Math.PI / 2 : view === 'front' ? 0 : view === 'back' ? Math.PI : -0.65;
    cam.az = facing + rel;
    cam.el = view === 'far' ? 0.32 : 0.22;
    cam.dist = view === 'far' ? 12 : view === 'close' ? 1.6 : 2.0;
  } else if (view === 'top') {
    cam.az = 0; cam.el = 1.35; cam.dist = 7.5; cam.target.set(0, 0, 0);
  }
  if (az !== undefined && !Number.isNaN(az)) cam.az = az;
  if (el !== undefined && !Number.isNaN(el)) cam.el = el;
  if (dist !== undefined && !Number.isNaN(dist)) cam.dist = dist;
  const { az: a, el: e, dist: d, target } = cam;
  camera.position.set(target.x + Math.sin(a) * Math.cos(e) * d, target.y + Math.sin(e) * d, target.z + Math.cos(a) * Math.cos(e) * d);
  camera.lookAt(target);
}
frame(q.has('az') ? num('az', 0) : undefined, q.has('el') ? num('el', 0) : undefined, q.has('dist') ? num('dist', 0) : undefined);

// pointer → attention (when no fixed point is given)
const ray = new Raycaster();
const ground = new Plane(new Vector3(0, 1, 0), 0);
addEventListener('pointermove', (e) => {
  if (attnParam) return;
  ray.setFromCamera(new Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  attention = ray.ray.intersectPlane(ground, new Vector3()) ?? null;
});
addEventListener('pointerleave', () => { if (!attnParam) attention = null; });

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// clock
let clock = 0;
const STEP = 1 / 60;
function advance(seconds: number) {
  let n = Math.round(seconds / STEP);
  while (n-- > 0) {
    if (attnParam === 'walk') {
      // a slow loop in front of the focused dog (or the whole floor)
      const a = clock * num('ws', 0.5);
      const c = view === 'wide' ? new Vector3(0, 0, 2.6) : centres[dogIndex].clone().add(new Vector3(0, 0, 1.4).applyAxisAngle(new Vector3(0, 1, 0), yaw));
      const r = num('wr', view === 'wide' ? 2.2 : 1.1);
      attention = new Vector3(c.x + Math.sin(a) * r, 0, c.z + Math.cos(a) * r * 0.6);
    }
    dogs.update(STEP, clock, attention);
    clock += STEP;
  }
}
const hud = document.getElementById('hud')!;
function render() {
  marker.visible = !!attention;
  if (attention) marker.position.set(attention.x, 0.01, attention.z);
  renderer.render(scene, camera);
  hud.textContent = `t ${clock.toFixed(2)} s · build ${buildMs.toFixed(0)} ms · tris ${dogs.triangles.join(' ')} · calls ${renderer.info.render.calls}`;
}

advance(num('t', 0));
const paused = q.get('pause') === '1';
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  if (!paused) advance(Math.min(0.1, (now - last) / 1000));
  last = now;
  render();
});

declare global {
  interface Window {
    __step: (seconds: number) => number;
    __attention: (x: number | null, z?: number) => void;
    __cam: (az?: number, el?: number, dist?: number, dog?: number) => void;
    __info: () => unknown;
    __ready: boolean;
  }
}
window.__step = (s) => {
  advance(s);
  render();
  return clock;
};
window.__attention = (x, z) => {
  attention = x === null ? null : new Vector3(x, 0, z ?? 0);
  render();
};
window.__cam = (az, el, dist, dog) => {
  frame(az, el, dist, dog);
  render();
};
/** Per-frame bone samples for dog `i` over `seconds` (dev: smoothness checks). */
(window as unknown as { __probe: unknown }).__probe = (i: number, seconds: number) => {
  const dog = dogs.dogs[i];
  const out: number[][] = [];
  const fwd = new Vector3();
  const inv = new Matrix4().copy(dog.mesh.matrixWorld).invert();
  const n = Math.round(seconds / STEP);
  for (let k = 0; k < n; k++) {
    advance(STEP);
    dog.mesh.updateMatrixWorld(true);
    const head = dog.bones[3];
    fwd.set(0, 0, 1).transformDirection(head.matrixWorld).transformDirection(inv);
    const tail = dog.bones[8].quaternion;
    out.push([
      clock,
      Math.atan2(fwd.x, fwd.z),
      Math.asin(Math.max(-1, Math.min(1, -fwd.y))),
      dog.bones[1].scale.y,
      2 * Math.atan2(tail.y, tail.w),
      dog.bones[4].quaternion.z,
      dog.bones[6].scale.y,
    ]);
  }
  render();
  return out;
};
window.__info = () => ({
  buildMs,
  triangles: dogs.triangles,
  meshes: dogs.dogs.length,
  calls: renderer.info.render.calls,
  programs: renderer.info.programs?.length,
});
render();
window.__ready = true;
