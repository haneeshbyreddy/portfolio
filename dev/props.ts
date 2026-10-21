/**
 * Dev-only preview for src/camp/props.ts — the whole camp kit in a lineup on a
 * lawn under the site's overcast light, through the site's own material.
 *
 *   /dev/props.html?view=front|hero|top|close&prop=<name>&az=<deg>&el=<deg>&dist=<m>
 *     &tx=&ty=&tz= (close-up target in the prop's own space) &dy=<m>
 *     &solo=1&ao=0&labels=0&dpr=2&tm=neutral|aces
 *
 * `prop` names are the lineup names printed in the HUD (beanbag, parasol,
 * campChair, crate, cooler, bike, backpack, pizzaOpen, pizzaShut, cableReel,
 * powerStrip, thermos, laptop, laptopShut, blanket, bookOpen, bookShut …).
 * `az` is measured from the prop's front (+Z), positive toward its right side.
 * window.__ready flips true once a frame is on screen; window.__tris has the
 * triangle counts.
 */
import {
  ACESFilmicToneMapping,
  BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  HalfFloatType,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  NoToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  BloomEffect,
  BrightnessContrastEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { createOfficeMaterial, mat } from '../src/office/builder';
import { buildChairGeometry, buildStationGeometry } from '../src/office/parts';
import { applyShaderPatches } from '../src/core/shaderPatches';
import { createSky } from '../src/world/Sky';
import { palette } from '../src/world/palette';
import * as P from '../src/camp/props';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) && q.get(k) !== '' ? Number(q.get(k)) : d);
const view = q.get('view') ?? 'front';
const focus = q.get('prop');
const solo = q.get('solo') === '1';
const useAO = q.get('ao') !== '0';
const SUN_DIR = new Vector3(-0.45, 0.62, -0.62).normalize();

applyShaderPatches();

const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(num('dpr', Math.min(2, devicePixelRatio)));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color('#b7bfbc');
scene.fog = new FogExp2(new Color(palette.fog).getHex(), 0.0014);

// --- light: the site's overcast rig
const hemi = new HemisphereLight(new Color('#d6dee0'), new Color('#4d5a3a'), 0.55);
scene.add(hemi);
const sun = new DirectionalLight(new Color('#fff4e6'), 1.25);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 6;
scene.add(sun, sun.target);

{
  const envScene = new Scene();
  const envSky = createSky(SUN_DIR);
  envSky.mesh.scale.setScalar(0.02);
  envScene.add(envSky.mesh);
  const g = new Mesh(new CircleGeometry(80, 32), new MeshBasicMaterial({ color: new Color('#56703c') }));
  g.rotation.x = -Math.PI / 2;
  g.position.y = -2;
  envScene.add(g);
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.03, 0.1, 200).texture;
  scene.environmentIntensity = 0.9;
  pmrem.dispose();
}

// --- lawn
const lawn = new Mesh(new PlaneGeometry(120, 120), new MeshStandardMaterial({ color: new Color('#5b8338'), roughness: 1 }));
lawn.rotation.x = -Math.PI / 2;
lawn.receiveShadow = true;
scene.add(lawn);

// --- the kit
interface Item {
  name: string;
  geo: BufferGeometry;
  m: Matrix4;
  ref?: boolean;
}
const material = createOfficeMaterial();
const items: Item[] = [];
const add = (name: string, geo: BufferGeometry, x: number, z: number, ry = 0, y = 0, extra?: Matrix4) => {
  const m = mat(x, y, z, 0, ry, 0);
  if (extra) m.multiply(extra);
  items.push({ name, geo, m });
};
const ref = (name: string, geo: BufferGeometry, m: Matrix4) => items.push({ name, geo, m, ref: true });

// back row: the big things
add('parasol', P.buildParasol(), -5.6, -3.0, 0.2);
ref('desk', buildStationGeometry(), mat(-2.9, 0, -3.1, 0, Math.PI, 0));
ref('chair', buildChairGeometry(), mat(-2.9, 0, -3.1, 0, 0, 0));
add('bike', P.buildBike(palette.bikeRed), -0.5, -3.0, -Math.PI / 2);
add('bikeMint', P.buildBike(palette.bikeMint), 1.4, -3.3, -Math.PI / 2, 0, new Matrix4().makeRotationZ(-P.BIKE.standLean));
add('beanbag', P.buildBeanbag(palette.rust), 3.4, -2.9, -0.35);
add('beanbagSlate', P.buildBeanbag(palette.slate), 4.6, -3.3, 0.3);
add('campChair', P.buildCampChair(), 5.8, -2.8, -0.4);
add('campChairSlate', P.buildCampChair(palette.slate), 6.5, -3.3, -0.1);

// middle row
add('blanket', P.buildBlanket(), -4.6, -0.8, 0.12);
add('cooler', P.buildCooler(), -2.7, -0.9, 0.25);
const crateGeo = P.buildCrate();
add('crate', crateGeo, -1.6, -1.0, -0.15);
add('crateTop', P.buildCrate(23), -1.6, -1.0, -0.05, P.CRATE_HEIGHT);
add('backpack', P.buildBackpack(palette.slate), -0.6, -0.8, 0.35);
add('backpackOlive', P.buildBackpack(palette.olive), -0.15, -1.0, -0.3);
add('cableReel', P.buildCableReel(), 0.75, -0.9, -0.5);
add('crateSide', P.buildCrate(5), 1.8, -1.0, 0.25);

// front row: the small things
add('pizzaOpen', P.buildPizzaBox(true), 2.75, -0.7, -0.2);
add('pizzaShut', P.buildPizzaBox(false), 3.3, -0.85, 0.3);
add('powerStrip', P.buildPowerStrip(), 3.8, -0.6, 0.1);
add('thermos', P.buildThermos(palette.slate), 4.15, -0.8, 0.5);
add('thermosOlive', P.buildThermos(palette.olive), 4.35, -0.7, 0.5);
add('laptop', P.buildLaptop(), 4.8, -0.7, -0.3);
add('laptopShut', P.buildLaptop(0), 5.3, -0.75, 0.2);
add('bookOpen', P.buildBook(true), 5.75, -0.65, 0.4);
add('bookShut', P.buildBook(false, palette.olive), 6.05, -0.8, -0.3);
add('bookShutRust', P.buildBook(false, '#8a3b2a'), 6.05, -0.8, -0.2, 0.02);

const tris: Record<string, number> = {};
const centre = new Map<string, { c: Vector3; r: number; m: Matrix4 }>();
for (const it of items) {
  const n = it.geo.index ? it.geo.index.count / 3 : it.geo.attributes.position.count / 3;
  if (!it.ref) tris[it.name] = n;
  if (solo && focus && it.name !== focus) continue;
  const mesh = new InstancedMesh(it.geo, material, 1);
  mesh.setMatrixAt(0, it.m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  it.geo.computeBoundingBox();
  const bb = it.geo.boundingBox!.clone().applyMatrix4(it.m);
  const c = bb.getCenter(new Vector3());
  centre.set(it.name, { c, r: bb.getSize(new Vector3()).length() / 2, m: it.m });
}
(window as unknown as { __tris: Record<string, number> }).__tris = tris;

// --- camera
const camera = new PerspectiveCamera(num('fov', 35), innerWidth / innerHeight, 0.02, 2000);
const lookAt = new Vector3();
let shadowHalf = 9.5;
if (view === 'close' && focus && centre.has(focus)) {
  const { c, r, m } = centre.get(focus)!;
  const az = num('az', 30) * (Math.PI / 180);
  const el = num('el', 18) * (Math.PI / 180);
  const dist = num('dist', Math.max(0.35, r * 2.9));
  // azimuth from the prop's own front (+Z), turning toward its right (-X)
  const front = new Vector3(0, 0, 1).transformDirection(m);
  const right = new Vector3(-1, 0, 0).transformDirection(m);
  const dir = front.multiplyScalar(Math.cos(az)).add(right.multiplyScalar(Math.sin(az))).multiplyScalar(Math.cos(el)).setY(Math.sin(el));
  lookAt.copy(c).add(new Vector3(0, num('dy', 0), 0));
  // tx/ty/tz: aim at a point given in the prop's own space instead
  if (q.has('tx') || q.has('tz')) lookAt.set(num('tx', 0), num('ty', 0), num('tz', 0)).applyMatrix4(m);
  camera.position.copy(lookAt).addScaledVector(dir, dist);
  shadowHalf = Math.max(1.2, r * 2.2);
} else if (view === 'top') {
  camera.position.set(0, 17, 1.2);
  lookAt.set(0, 0, -1.6);
} else if (view === 'hero') {
  camera.position.set(7.5, 3.4, 7.2);
  lookAt.set(0.6, 0.5, -1.6);
} else {
  // front: the whole lineup from ~10 m, a person's eye height a little raised
  camera.position.set(0.4, 2.5, 9.6);
  lookAt.set(0.4, 0.55, -1.6);
}
camera.lookAt(lookAt);
camera.updateMatrixWorld();
sun.target.position.copy(lookAt).setY(0);
sun.position.copy(lookAt).setY(0).addScaledVector(SUN_DIR, 40);
const sc = sun.shadow.camera;
sc.left = -shadowHalf;
sc.right = shadowHalf;
sc.top = shadowHalf;
sc.bottom = -shadowHalf;
sc.near = 5;
sc.far = 90;
sc.updateProjectionMatrix();

// --- post: the site's grade (AO, neutral tone map, a touch of desaturation)
const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: 4 });
composer.addPass(new RenderPass(scene, camera));
if (useAO) {
  const ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
  ao.configuration.aoRadius = view === 'close' ? 0.25 : 0.9;
  ao.configuration.distanceFalloff = 0.5;
  ao.configuration.intensity = 2.2;
  ao.configuration.halfRes = false;
  ao.setQualityMode('High');
  composer.addPass(ao);
}
const tm = q.get('tm') ?? 'neutral';
if (tm === 'aces') {
  renderer.toneMapping = ACESFilmicToneMapping;
} else {
  renderer.toneMapping = NoToneMapping;
}
composer.addPass(
  new EffectPass(
    camera,
    new BloomEffect({ intensity: 0.4, luminanceThreshold: 0.86, luminanceSmoothing: 0.2, mipmapBlur: true }),
    new ToneMappingEffect({ mode: tm === 'aces' ? ToneMappingMode.ACES_FILMIC : ToneMappingMode.NEUTRAL }),
    new HueSaturationEffect({ saturation: -0.08 }),
    new BrightnessContrastEffect({ contrast: 0.07 }),
    new VignetteEffect({ darkness: 0.35, offset: 0.3 }),
  ),
);
void NeutralToneMapping;

// --- labels + hud
const hud = document.getElementById('hud')!;
if (view !== 'close') hud.textContent = Object.entries(tris)
  .map(([k, v]) => `${k.padEnd(16)} ${String(v).padStart(6)} tris`)
  .join('\n');
if (q.get('labels') !== '0' && view !== 'close') {
  for (const [name, { c }] of centre) {
    if (name === 'chair') continue;
    const p = c.clone().setY(0).project(camera);
    if (p.z > 1) continue;
    const el = document.createElement('div');
    el.className = 'tag';
    el.style.left = `${((p.x + 1) / 2) * innerWidth}px`;
    el.style.top = `${((1 - p.y) / 2) * innerHeight + 6}px`;
    el.textContent = name;
    document.body.appendChild(el);
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  composer.render();
});

let frames = 0;
const tick = () => {
  composer.render();
  if (++frames === 3) (window as unknown as { __ready: boolean }).__ready = true;
  if (frames < 3) requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
