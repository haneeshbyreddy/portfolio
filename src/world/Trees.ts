import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise2D, mulberry32, smoothstep } from '../core/math';
import { MEADOW_CENTER, MEADOW_FLAT_RADIUS, terrainHeight } from './Terrain';

const noise = createNoise2D(77);

function tint(g: BufferGeometry, hex: string, jitter = 0, seed = 1) {
  const rand = mulberry32(seed);
  const c = new Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = 1 - jitter + rand() * jitter * 2;
    arr[i * 3] = c.r * k;
    arr[i * 3 + 1] = c.g * k;
    arr[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new Float32BufferAttribute(arr, 3));
  return g;
}

function lumpy(radius: number, detail: number, seed: number, squash = 0.92) {
  const g = new IcosahedronGeometry(radius, detail);
  const p = g.attributes.position;
  const rand = mulberry32(seed);
  const off = rand() * 100;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + noise(x * 1.1 + off, z * 1.1 + y * 0.8) * 0.22 + noise(x * 3.1 - off, z * 3.1 + y) * 0.06;
    // flatter underside, like a real canopy
    const under = y < 0 ? 0.72 : 1;
    p.setXYZ(i, x * k, y * k * squash * under, z * k);
  }
  return g;
}

function deciduous(seed: number) {
  const parts: BufferGeometry[] = [];
  const trunk = new CylinderGeometry(0.12, 0.22, 2.4, 6, 1).translate(0, 0.6, 0);
  parts.push(tint(trunk.toNonIndexed(), '#3a3026'));
  const rand = mulberry32(seed);
  const blobs = 7;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rand() * 0.8;
    const r = i === 0 ? 0 : 1.0 + rand() * 0.8;
    const s = i === 0 ? 2.1 : 1.1 + rand() * 0.7;
    const y = i === 0 ? 3.6 : 2.4 + rand() * 2.2;
    const b = lumpy(s, 1, seed + i * 7).translate(Math.cos(a) * r, y, Math.sin(a) * r);
    // canopy shading: lighter crown, darker skirt
    const g = b.index ? b.toNonIndexed() : b;
    tint(g, '#ffffff', 0.1, seed + i);
    const c = g.attributes.color, p = g.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const k = 0.72 + Math.min(1, Math.max(0, (p.getY(v) - 1.6) / 4)) * 0.42;
      c.setXYZ(v, c.getX(v) * k, c.getY(v) * k, c.getZ(v) * k);
    }
    parts.push(g);
  }
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
}

function bush(seed: number) {
  const parts: BufferGeometry[] = [];
  const rand = mulberry32(seed);
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    const b = lumpy(0.9 + rand() * 0.5, 1, seed + i * 3, 0.7).translate(Math.cos(a) * 0.8, 0.5, Math.sin(a) * 0.8);
    parts.push(tint(b.index ? b.toNonIndexed() : b, '#ffffff', 0.12, seed + i));
  }
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
}

function conifer(seed: number) {
  const parts: BufferGeometry[] = [];
  parts.push(tint(new CylinderGeometry(0.1, 0.16, 2.4, 5).translate(0, 0.6, 0).toNonIndexed(), '#3a3026'));
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const c = new ConeGeometry(1.6 * (1 - t * 0.55), 2.4, 8, 1).translate(0, 2.2 + i * 1.25, 0);
    parts.push(tint(c.toNonIndexed(), '#ffffff', 0.06, seed + i));
  }
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
}

export function createTrees(count: number) {
  const rand = mulberry32(9001);
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });

  const variants = [
    { geo: deciduous(3), share: 0.62 },
    { geo: conifer(8), share: 0.22 },
    { geo: bush(21), share: 0.16 },
  ];

  const placements: { x: number; y: number; z: number; s: number; yaw: number; c: Color; v: number }[] = [];
  const greens = ['#22301d', '#2a3a22', '#304327', '#1d2a1a', '#36482a', '#283622', '#3b4a2c', '#2e3d2a'];
  let guard = 0;
  while (placements.length < count && guard++ < count * 30) {
    const a = rand() * Math.PI * 2;
    // most trees crowd the forest edge the camera actually sees
    const r = rand() < 0.7
      ? MEADOW_FLAT_RADIUS - 8 + Math.pow(rand(), 1.3) * 190
      : MEADOW_FLAT_RADIUS + 80 + Math.pow(rand(), 1.4) * 520;
    const x = MEADOW_CENTER.x + Math.cos(a) * r;
    const z = MEADOW_CENTER.z + Math.sin(a) * r;
    // forest stands vs clearings
    const stand = noise(x * 0.012 + 4, z * 0.012) * 0.5 + 0.5 + noise(x * 0.05, z * 0.05) * 0.12;
    const edge = smoothstep(MEADOW_FLAT_RADIUS, MEADOW_FLAT_RADIUS + 25, r);
    const density = smoothstep(0.34, 0.5, stand) * (0.25 + edge * 0.75);
    if (rand() > density) continue;
    // keep the long view down the valley open
    if (z < MEADOW_CENTER.z - 150 && Math.abs(x) < 110 && rand() > 0.2) continue;
    const y = terrainHeight(x, z);
    const s = (0.75 + rand() * 0.75) * (1 + smoothstep(150, 600, r) * 0.8);
    const c = new Color(greens[Math.floor(rand() * greens.length)]);
    c.multiplyScalar(0.85 + rand() * 0.3);
    const pick = rand();
    const v = pick < variants[0].share ? 0 : pick < variants[0].share + variants[1].share ? 1 : 2;
    // bushes hug the forest edge and hide the trunks
    const bx = v === 2 ? MEADOW_CENTER.x + Math.cos(a) * (MEADOW_FLAT_RADIUS - 10 + rand() * 25) : x;
    const bz = v === 2 ? MEADOW_CENTER.z + Math.sin(a) * (MEADOW_FLAT_RADIUS - 10 + rand() * 25) : z;
    placements.push({ x: bx, y: (v === 2 ? terrainHeight(bx, bz) : y) - 0.6, z: bz, s: v === 2 ? s * 1.3 : s, yaw: rand() * Math.PI * 2, c, v });
  }

  // sectors around the meadow so the frustum can cull the forest behind the camera
  const SECTORS = 12;
  const dummy = new Object3D();
  const meshes: InstancedMesh[] = [];
  variants.forEach((variant, vi) => {
    for (let sct = 0; sct < SECTORS; sct++) {
      const list = placements.filter((p) => {
        if (p.v !== vi) return false;
        const ang = Math.atan2(p.z - MEADOW_CENTER.z, p.x - MEADOW_CENTER.x) + Math.PI;
        return Math.min(SECTORS - 1, Math.floor((ang / (Math.PI * 2)) * SECTORS)) === sct;
      });
      if (!list.length) continue;
      const mesh = new InstancedMesh(variant.geo, material, list.length);
      list.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.yaw, 0);
        dummy.scale.set(p.s, p.s * (0.9 + (i % 5) * 0.06), p.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, p.c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = `${['trees-deciduous', 'trees-conifer', 'trees-bush'][vi]}-${sct}`;
      meshes.push(mesh);
    }
  });

  return { meshes, material };
}
