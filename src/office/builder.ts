import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface Finish {
  color: string;
  rough?: number;
  metal?: number;
  /** 0..1 — adds a woven micro-texture (chair fabric, mouse pad). */
  fabric?: number;
}

const _q = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const _s = new Vector3();

export function mat(
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0,
  sx = 1, sy = 1, sz = 1,
) {
  return new Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

/**
 * Collects primitive parts with a colour + PBR finish baked into vertex
 * attributes, then merges them into one geometry. A whole desk becomes one
 * draw call, and every desk on the floor shares it through instancing.
 */
export class GeoBuilder {
  private parts: BufferGeometry[] = [];

  add(geo: BufferGeometry, finish: Finish, matrix?: Matrix4) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (matrix) g.applyMatrix4(matrix);
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (g.attributes.uv1) g.deleteAttribute('uv1');
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    const c = new Color(finish.color);
    const color = new Float32Array(n * 3);
    const m = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      color[i * 3] = c.r;
      color[i * 3 + 1] = c.g;
      color[i * 3 + 2] = c.b;
      m[i * 3] = finish.rough ?? 0.6;
      m[i * 3 + 1] = finish.metal ?? 0;
      m[i * 3 + 2] = finish.fabric ?? 0;
    }
    g.setAttribute('color', new Float32BufferAttribute(color, 3));
    g.setAttribute('aMat', new Float32BufferAttribute(m, 3));
    this.parts.push(g);
    return this;
  }

  box(w: number, h: number, d: number, finish: Finish, matrix: Matrix4, radius = 0) {
    const g = radius > 0
      ? new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2))
      : new BoxGeometry(w, h, d);
    return this.add(g, finish, matrix);
  }

  cyl(rTop: number, rBottom: number, h: number, finish: Finish, matrix: Matrix4, seg = 16) {
    return this.add(new CylinderGeometry(rTop, rBottom, h, seg, 1), finish, matrix);
  }

  sphere(r: number, finish: Finish, matrix: Matrix4, w = 12, h = 8) {
    return this.add(new SphereGeometry(r, w, h), finish, matrix);
  }

  torus(r: number, tube: number, finish: Finish, matrix: Matrix4, arc = Math.PI * 2) {
    return this.add(new TorusGeometry(r, tube, 8, 16, arc), finish, matrix);
  }

  build() {
    const g = mergeGeometries(this.parts, false)!;
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Tapered box — the back of a CRT. Back face (+z) is scaled by `taper`. */
export function frustumBox(w: number, h: number, d: number, taper: number) {
  const g = new BoxGeometry(1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const k = z > 0 ? taper : 1;
    p.setXYZ(i, p.getX(i) * k * w, p.getY(i) * k * h, z * d);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * MeshStandardMaterial that reads roughness / metalness / fabric from the
 * merged vertex attributes. One material for the whole office.
 */
export function createOfficeMaterial() {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute vec3 aMat;
         varying vec3 vMat;
         varying vec3 vObj;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vMat = aMat;
         vObj = position;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vMat;
         varying vec3 vObj;
         float fabricHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         if (vMat.z > 0.0) {
           vec3 q = vObj * 900.0;
           float weave = sin(q.x) * sin(q.y) * 0.5 + 0.5;
           float grain = fabricHash(floor(vObj * 420.0));
           diffuseColor.rgb *= mix(1.0, 0.9 + weave * 0.08 + grain * 0.06, vMat.z);
         }`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vMat.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMat.y;');
  };
  material.customProgramCacheKey = () => 'office-material';
  return material;
}
