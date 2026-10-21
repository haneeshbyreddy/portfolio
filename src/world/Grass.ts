import {
  DoubleSide,
  Group,
  Sphere,
  Vector3,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
} from 'three';
import { createNoise2D, mulberry32, smoothstep } from '../core/math';
import { simplex2D, windField } from '../core/glsl';
import { campGLSL, cloudGLSL, lawnGLSL, shared } from './shared';
import { col, palette } from './palette';
import { MEADOW_CENTER, terrainHeight } from './Terrain';
import { campBounds } from '../office/layout';

const heightNoise = createNoise2D(5);
const heightNoise2 = createNoise2D(6);
const edgeNoise = createNoise2D(7);

const CAMP = campBounds();

/** Signed distance to the camp (a rounded rectangle), in metres: negative inside. */
export function campSDF(x: number, z: number) {
  const b = CAMP;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const hx = (b.x1 - b.x0) / 2, hz = (b.z1 - b.z0) / 2;
  const r = 4;
  const qx = Math.abs(x - cx) - hx + r;
  const qz = Math.abs(z - cz) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}

/**
 * How tall the grass stands at (x, z) before anyone walks on it, for a blade
 * with random `k` (0..1). The meadow runs knee-high in drifts; where the camp
 * is set up it was cut a few weeks back and has come up lush and ankle-high,
 * blending out into the long grass over a few loose metres. No mown edge.
 */
function standingHeight(x: number, z: number, k: number) {
  const patch = heightNoise(x * 0.05, z * 0.05) * 0.5 + 0.5;
  const patch2 = heightNoise2(x * 0.18, z * 0.18) * 0.5 + 0.5;
  const meadow = 0.38 + patch * 0.5 + patch2 * 0.14;
  const cut = 0.19 + patch2 * 0.13 + patch * 0.07;
  const inCamp = 1 - smoothstep(1.5, 13 + edgeNoise(x * 0.09, z * 0.09) * 5, campSDF(x, z));
  const dist = Math.hypot(x - MEADOW_CENTER.x, z - MEADOW_CENTER.z - 12);
  return (cut + (meadow - cut) * (1 - inCamp)) * (0.72 + k * 0.56) * (1 + smoothstep(40, 100, dist) * 0.35);
}

function bladeGeometry(segments: number) {
  // A tapered strip; x in [-0.5, 0.5], y in [0, 1].
  const g = new PlaneGeometry(1, 1, 1, segments);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const taper = Math.pow(1 - y, 0.85);
    p.setX(i, p.getX(i) * taper);
  }
  const ig = new InstancedBufferGeometry();
  ig.setIndex(g.index);
  ig.setAttribute('position', p);
  return ig;
}

const vertexShader = /* glsl */ `
  attribute vec4 aOffset;   // x, y, z, yaw
  attribute vec4 aParams;   // height, width, stiffness seed, colour seed
  uniform vec3 uCursor;
  varying float vT;
  varying float vSeed;
  varying float vGust;
  varying float vAO;
  varying float vTrod;
  varying float vMown;
  varying float vLawn;
  varying float vSide;
  varying float vCloud;
  ${simplex2D}
  ${lawnGLSL}
  ${windField}
  ${campGLSL}
  ${cloudGLSL}
  #include <fog_pars_vertex>

  void main() {
    float t = position.y;
    float h = aParams.x;
    float w = aParams.y;
    vec2 base = aOffset.xz;
    vec4 marks = groundMarks(base);
    // mown: cut short under the camp; the mower's line wanders a few
    // centimetres either way, and a band of rough steps down to it from the meadow
    float cutLine = marks.w + snoise(base * 2.6) * 0.06;
    float mown = smoothstep(0.52, 0.62, cutLine);
    float rough = smoothstep(0.2, 0.42, cutLine);
    // trodden grass: pressed down and laid over every which way, not snapped,
    // so each blade keeps a little spring in it; under a blanket there's none
    float trod = clamp(marks.y * (0.7 + aParams.w * 0.6), 0.0, 1.0) * (1.0 - mown * 0.6);
    float cut = 0.04 + aParams.w * 0.035;
    // stubble is cut square and reads broader than a long blade's tip
    w *= mix(1.0, 1.5, mown);
    float standing = h * mix(1.0, 0.34, trod);
    standing = mix(standing, min(standing, 0.12 + aParams.w * 0.1), rough);
    h = mix(standing, cut * mix(1.0, 0.75, trod), mown) * (1.0 - smoothstep(0.3, 0.7, marks.z));

    float c = cos(aOffset.w), s = sin(aOffset.w);
    vec3 side = vec3(c, 0.0, s);

    // wind: rolling gusts + per-blade flutter
    float gust = gustField(base);
    float flutter = sin(uTime * (2.2 + aParams.z * 1.8) + aParams.z * 40.0 + base.x * 0.6 + base.y * 0.4);
    float lean = 0.18 + aParams.z * 0.32;
    vec2 bendDir = uWindDir * (lean + gust * 1.05 + flutter * (0.05 + gust * 0.1));
    // a little natural curl in each blade's own direction
    bendDir += vec2(-s, c) * (aParams.w - 0.5) * 0.35;
    // cut blades are stiff stubble: they lean, they don't lie down
    bendDir *= mix(1.0, 0.45, mown);
    float fa = aOffset.w * 2.3 + aParams.z * 5.0;
    bendDir = mix(bendDir, vec2(cos(fa), sin(fa)) * (1.05 + aParams.z * 0.35) + uWindDir * gust * 0.12, trod * 0.85);

    // the cursor parts the grass
    vec2 toC = base - uCursor.xz;
    float dc = length(toC);
    float push = (1.0 - smoothstep(0.0, 1.6, dc)) * uCursor.y;
    bendDir += (toC / max(dc, 1e-3)) * push * 1.4;

    // bend along a circular arc so blade length is preserved
    float theta = clamp(length(bendDir), 1e-3, 1.45);
    vec2 dir = bendDir / max(length(bendDir), 1e-4);
    float a = theta * t;
    float along = h * (1.0 - cos(a)) / theta;
    float up = h * sin(a) / theta;

    vec3 world = vec3(base.x, aOffset.y, base.y)
               + side * position.x * w
               + vec3(dir.x * along, up, dir.y * along);

    vT = t;
    vSeed = aParams.w;
    vGust = gust * (1.0 - trod * 0.8);
    vAO = marks.x;
    vTrod = trod;
    vMown = mown;
    vLawn = lawnTone(base);
    vCloud = cloudShade(base);
    vSide = position.x;

    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uRoot, uMid, uTip, uDry, uSheen, uTrod, uLawn, uLawnDeep;
  varying float vT;
  varying float vSeed;
  varying float vGust;
  varying float vAO;
  varying float vTrod;
  varying float vMown;
  varying float vLawn;
  varying float vSide;
  varying float vCloud;
  #include <fog_pars_fragment>

  void main() {
    vec3 tip = mix(uTip, uDry, smoothstep(0.82, 1.0, vSeed) * 0.75);
    tip = mix(tip, uMid, smoothstep(0.25, 0.0, vSeed) * 0.5);
    vec3 col = mix(uRoot, uMid, smoothstep(0.0, 0.55, vT));
    col = mix(col, tip, smoothstep(0.45, 1.0, vT));
    col *= 0.78 + vSeed * 0.3;
    // fresh-cut lawn: one even green, a little lighter at the cut ends
    vec3 lawn = mix(uLawnDeep, uLawn, smoothstep(0.0, 0.85, vT)) * (0.93 + vSeed * 0.14) * vLawn;
    col = mix(col, lawn, vMown);
    // laid-over blades turn their paler undersides to the sky
    col = mix(col, uTrod * (0.86 + vSeed * 0.26), vTrod * smoothstep(0.0, 0.6, vT) * 0.55);
    // gusts tilt blades toward the sky: silver sheen sweeps across the field
    col = mix(col, uSheen, vGust * vT * 0.42 * (1.0 - vMown));
    // rounded blade: darker at the edges
    col *= 0.86 + 0.14 * (1.0 - abs(vSide) * 2.0);
    // overcast light
    col *= 1.04;
    col *= mix(0.5, 1.0, vAO);
    col *= vCloud;

    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeMaterial() {
  return new ShaderMaterial({
    side: DoubleSide,
    fog: true,
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.fog),
      uTime: shared.uTime,
      uWindDir: shared.uWindDir,
      uCamp: shared.uCamp,
      uGround: shared.uGround,
      uGroundBounds: shared.uGroundBounds,
      uCursor: shared.uCursor,
      uCloud: shared.uCloud,
      uRoot: { value: col(palette.grassRoot) },
      uMid: { value: col(palette.grassMid) },
      uTip: { value: col(palette.grassTip) },
      uDry: { value: col(palette.grassDry) },
      uSheen: { value: col(palette.grassSheen) },
      uTrod: { value: col(palette.grassTrod) },
      uLawn: { value: col(palette.lawn) },
      uLawnDeep: { value: col(palette.lawnDeep) },
    },
    vertexShader,
    fragmentShader,
  });
}

export interface GrassOptions {
  meadowCount: number;
  /** Extra blades over the camp, where the camera spends its time. */
  campCount: number;
}

export function createGrass({ meadowCount, campCount }: GrassOptions) {
  const rand = mulberry32(1234);
  const material = makeMaterial();

  // ---- meadow: density falling off with distance
  const meadowGeo = bladeGeometry(4);
  const mOffset = new Float32Array(meadowCount * 4);
  const mParams = new Float32Array(meadowCount * 4);
  const R = 105;
  for (let m = 0; m < meadowCount; m++) {
    const r = R * Math.pow(rand(), 0.72);
    const a = rand() * Math.PI * 2;
    // bias the disc toward the hills the camera looks at
    const x = MEADOW_CENTER.x + Math.cos(a) * r * 1.05;
    const z = MEADOW_CENTER.z + 12 + Math.sin(a) * r;
    const dist = Math.hypot(x - MEADOW_CENTER.x, z - MEADOW_CENTER.z - 12);
    const spread = 1 + Math.pow(dist / 30, 1.15) * 0.9; // wider blades far away to keep coverage
    const w = (0.018 + rand() * 0.02) * spread;
    mOffset.set([x, terrainHeight(x, z) - 0.02, z, rand() * Math.PI * 2], m * 4);
    mParams.set([standingHeight(x, z, rand()), w, rand(), rand()], m * 4);
  }
  // bucket blades into tiles so the frustum can skip what's behind the camera
  const TILE = 24;
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < meadowCount; i++) {
    const key = `${Math.floor(mOffset[i * 4] / TILE)},${Math.floor(mOffset[i * 4 + 2] / TILE)}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(i);
  }
  const meadow = new Group();
  meadow.name = 'meadow';
  for (const [key, list] of buckets) {
    const [tx, tz] = key.split(',').map(Number);
    const geo = new InstancedBufferGeometry();
    geo.setIndex(meadowGeo.index);
    geo.setAttribute('position', meadowGeo.attributes.position);
    const off = new Float32Array(list.length * 4);
    const par = new Float32Array(list.length * 4);
    list.forEach((src, j) => {
      off.set(mOffset.subarray(src * 4, src * 4 + 4), j * 4);
      par.set(mParams.subarray(src * 4, src * 4 + 4), j * 4);
    });
    geo.setAttribute('aOffset', new InstancedBufferAttribute(off, 4));
    geo.setAttribute('aParams', new InstancedBufferAttribute(par, 4));
    geo.instanceCount = list.length;
    geo.boundingSphere = new Sphere(new Vector3((tx + 0.5) * TILE, 1, (tz + 0.5) * TILE), TILE * 0.72 + 2.5);
    const mesh = new Mesh(geo, material);
    mesh.name = `meadow-${key}`;
    meadow.add(mesh);
  }

  // ---- the camp: the same grass, thicker where the camera spends its time,
  // thinning out into the meadow over a few metres so there's no seam
  const b = CAMP;
  const M = 5;
  const campGeo = bladeGeometry(3);
  const cOffset = new Float32Array(campCount * 4);
  const cParams = new Float32Array(campCount * 4);
  let n = 0;
  let guard = 0;
  while (n < campCount && guard++ < campCount * 4) {
    const x = b.x0 - M + rand() * (b.x1 - b.x0 + M * 2);
    const z = b.z0 - M + rand() * (b.z1 - b.z0 + M * 2);
    if (rand() > 1 - smoothstep(-1, M, campSDF(x, z))) continue;
    cOffset.set([x, terrainHeight(x, z) - 0.02, z, rand() * Math.PI * 2], n * 4);
    cParams.set([standingHeight(x, z, rand()), 0.015 + rand() * 0.017, rand(), rand()], n * 4);
    n++;
  }
  campGeo.setAttribute('aOffset', new InstancedBufferAttribute(cOffset.subarray(0, n * 4), 4));
  campGeo.setAttribute('aParams', new InstancedBufferAttribute(cParams.subarray(0, n * 4), 4));
  campGeo.instanceCount = n;
  const camp = new Mesh(campGeo, material);
  camp.frustumCulled = false;
  camp.name = 'camp-grass';

  return { meadow, camp };
}
