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
import { cloudGLSL, lawnGLSL, shared } from './shared';
import { col, palette } from './palette';
import { MEADOW_CENTER, terrainHeight } from './Terrain';
import { lawnBounds } from '../office/layout';

const heightNoise = createNoise2D(5);
const heightNoise2 = createNoise2D(6);

function lawnSDF(x: number, z: number) {
  const b = lawnBounds();
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const hx = (b.x1 - b.x0) / 2, hz = (b.z1 - b.z0) / 2;
  const r = 2.6;
  const qx = Math.abs(x - cx) - hx + r;
  const qz = Math.abs(z - cz) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
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
  varying float vSide;
  varying vec2 vXZ;
  varying float vCloud;
  ${simplex2D}
  ${windField}
  ${lawnGLSL}
  ${cloudGLSL}
  #include <fog_pars_vertex>

  void main() {
    float t = position.y;
    float h = aParams.x;
    float w = aParams.y;
    vec2 base = aOffset.xz;

    float c = cos(aOffset.w), s = sin(aOffset.w);
    vec3 side = vec3(c, 0.0, s);

    // wind: rolling gusts + per-blade flutter
    float gust = gustField(base);
    float flutter = sin(uTime * (2.2 + aParams.z * 1.8) + aParams.z * 40.0 + base.x * 0.6 + base.y * 0.4);
    float lean = 0.18 + aParams.z * 0.32;
    vec2 bendDir = uWindDir * (lean + gust * 1.05 + flutter * (0.05 + gust * 0.1));
    // a little natural curl in each blade's own direction
    bendDir += vec2(-s, c) * (aParams.w - 0.5) * 0.35;

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
    vGust = gust;
    vAO = sampleAO(base);
    vCloud = cloudShade(base);
    vSide = position.x;
    vXZ = base;

    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uRoot, uMid, uTip, uDry, uSheen, uLawnA, uLawnB;
  uniform float uLawnMode;
  varying float vT;
  varying float vSeed;
  varying float vGust;
  varying float vAO;
  varying float vSide;
  varying vec2 vXZ;
  varying float vCloud;
  ${lawnGLSL}
  #include <fog_pars_fragment>

  void main() {
    vec3 tip = mix(uTip, uDry, smoothstep(0.82, 1.0, vSeed) * 0.75);
    tip = mix(tip, uMid, smoothstep(0.25, 0.0, vSeed) * 0.5);
    vec3 col;
    if (uLawnMode > 0.5) {
      vec3 lawn = mix(uLawnB, uLawnA, stripe(vXZ));
      // mown turf is too dense to show its roots: shade toward the lawn, not the soil,
      // so the floor reads as velvet rather than speckle from the establishing shot
      col = mix(mix(uRoot, lawn, 0.55), lawn * (0.9 + vSeed * 0.2), smoothstep(0.0, 0.7, vT));
    } else {
      col = mix(uRoot, uMid, smoothstep(0.0, 0.55, vT));
      col = mix(col, tip, smoothstep(0.45, 1.0, vT));
      col *= 0.78 + vSeed * 0.3;
    }
    // gusts tilt blades toward the sky: silver sheen sweeps across the field
    col = mix(col, uSheen, vGust * vT * (uLawnMode > 0.5 ? 0.12 : 0.42));
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

function makeMaterial(lawnMode: boolean) {
  return new ShaderMaterial({
    side: DoubleSide,
    fog: true,
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.fog),
      uTime: shared.uTime,
      uWindDir: shared.uWindDir,
      uLawn: shared.uLawn,
      uAO: shared.uAO,
      uAOBounds: shared.uAOBounds,
      uCursor: shared.uCursor,
      uCloud: shared.uCloud,
      uLawnMode: { value: lawnMode ? 1 : 0 },
      uRoot: { value: col(palette.grassRoot) },
      uMid: { value: col(palette.grassMid) },
      uTip: { value: col(palette.grassTip) },
      uDry: { value: col(palette.grassDry) },
      uSheen: { value: col(palette.grassSheen) },
      uLawnA: { value: col(palette.lawnA) },
      uLawnB: { value: col(palette.lawnB) },
    },
    vertexShader,
    fragmentShader,
  });
}

export interface GrassOptions {
  meadowCount: number;
  lawnCount: number;
}

export function createGrass({ meadowCount, lawnCount }: GrassOptions) {
  const rand = mulberry32(1234);

  // ---- meadow: tall, wild, density falling off with distance
  const meadowGeo = bladeGeometry(4);
  const mOffset = new Float32Array(meadowCount * 4);
  const mParams = new Float32Array(meadowCount * 4);
  const R = 105;
  let m = 0;
  let guard = 0;
  while (m < meadowCount && guard++ < meadowCount * 4) {
    const r = R * Math.pow(rand(), 0.72);
    const a = rand() * Math.PI * 2;
    // bias the disc toward the hills the camera looks at
    const x = MEADOW_CENTER.x + Math.cos(a) * r * 1.05;
    const z = MEADOW_CENTER.z + 12 + Math.sin(a) * r;
    const sdf = lawnSDF(x, z);
    if (sdf < -0.2) continue;
    // mown edge: grass rises over a few metres outside the lawn
    const edge = smoothstep(-0.2, 3.2 + heightNoise(x * 0.3, z * 0.3) * 1.2, sdf);
    if (edge < 0.04 && rand() > 0.3) continue;
    const patch = heightNoise(x * 0.05, z * 0.05) * 0.5 + 0.5;
    const patch2 = heightNoise2(x * 0.18, z * 0.18) * 0.5 + 0.5;
    const tall = 0.38 + patch * 0.5 + patch2 * 0.14;
    const dist = Math.hypot(x - MEADOW_CENTER.x, z - MEADOW_CENTER.z - 12);
    const spread = 1 + Math.pow(dist / 30, 1.15) * 0.9; // wider blades far away to keep coverage
    const h = (0.12 + edge * tall) * (0.75 + rand() * 0.5) * (1 + smoothstep(40, 100, dist) * 0.35);
    const w = (0.022 + rand() * 0.024) * spread;
    mOffset.set([x, terrainHeight(x, z) - 0.02, z, rand() * Math.PI * 2], m * 4);
    mParams.set([h, w, rand(), rand()], m * 4);
    m++;
  }
  // bucket blades into tiles so the frustum can skip what's behind the camera
  const TILE = 24;
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < m; i++) {
    const key = `${Math.floor(mOffset[i * 4] / TILE)},${Math.floor(mOffset[i * 4 + 2] / TILE)}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(i);
  }
  const meadowMat = makeMaterial(false);
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
    const mesh = new Mesh(geo, meadowMat);
    mesh.name = `meadow-${key}`;
    meadow.add(mesh);
  }

  // ---- lawn: short, dense, ordered
  const b = lawnBounds();
  const lawnGeo = bladeGeometry(2);
  const lOffset = new Float32Array(lawnCount * 4);
  const lParams = new Float32Array(lawnCount * 4);
  let l = 0;
  guard = 0;
  while (l < lawnCount && guard++ < lawnCount * 3) {
    const x = b.x0 - 1 + rand() * (b.x1 - b.x0 + 2);
    const z = b.z0 - 1 + rand() * (b.z1 - b.z0 + 2);
    const sdf = lawnSDF(x, z);
    if (sdf > 0.9) continue;
    const h = 0.05 + rand() * 0.06 + smoothstep(-1, 0.9, sdf) * 0.08;
    lOffset.set([x, 0, z, rand() * Math.PI * 2], l * 4);
    lParams.set([h, 0.02 + rand() * 0.018, rand() * 0.4, rand()], l * 4);
    l++;
  }
  lawnGeo.setAttribute('aOffset', new InstancedBufferAttribute(lOffset.subarray(0, l * 4), 4));
  lawnGeo.setAttribute('aParams', new InstancedBufferAttribute(lParams.subarray(0, l * 4), 4));
  lawnGeo.instanceCount = l;

  const lawn = new Mesh(lawnGeo, makeMaterial(true));
  lawn.frustumCulled = false;
  lawn.name = 'lawn';

  return { meadow, lawn };
}
