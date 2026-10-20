import {
  BufferAttribute,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three';
import { createNoise2D, fbm2, lerp, smoothstep } from '../core/math';
import { simplex2D, windField } from '../core/glsl';
import { lawnGLSL, shared } from './shared';
import { col, palette } from './palette';

const n1 = createNoise2D(11);
const n2 = createNoise2D(29);
const n3 = createNoise2D(47);

/** Meadow centre (slightly behind the office so the field opens toward the hills). */
export const MEADOW_CENTER = { x: 0, z: -18 };
export const MEADOW_FLAT_RADIUS = 150;

const ridged = (x: number, z: number) => {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i++) {
    const v = 1 - Math.abs(n3(x * f, z * f));
    s += Math.pow(v, 1.4) * a;
    a *= 0.45;
    f *= 2.2;
  }
  return s;
};

/**
 * The landscape: a flat meadow basin, forested rolling hills on both flanks
 * (ref 3), a valley opening straight ahead and a hazy mountain wall far away.
 */
export function terrainHeight(x: number, z: number) {
  const dx = x - MEADOW_CENTER.x;
  const dz = z - MEADOW_CENTER.z;
  const r = Math.hypot(dx, dz);

  const rise = smoothstep(MEADOW_FLAT_RADIUS - 10, 460, r);
  // valley corridor straight ahead (-Z): the centre stays low
  const ahead = smoothstep(-60, -320, dz);
  const corridor = lerp(1, 0.12 + 0.88 * smoothstep(60, 360, Math.abs(dx)), ahead);

  const rolling = (fbm2(n1, x * 0.0032, z * 0.0032, 5) * 0.5 + 0.5) * 95;
  const bumps = fbm2(n2, x * 0.016, z * 0.016, 3) * 7;
  let h = rise * (rolling * corridor + bumps * 0.6 + 6);

  // distant mountain wall
  const far = smoothstep(820, 1450, r);
  const massif = fbm2(n1, x * 0.0007 + 5.0, z * 0.0007, 3) * 0.5 + 0.5;
  const mountains = (massif * 0.6 + ridged(x * 0.0011 + 3.1, z * 0.0011) * 0.6) * 380 + 40;
  h += far * mountains * lerp(0.8, 1, ahead);

  // soft undulation inside the meadow (never under the office)
  const inner = smoothstep(30, 80, r) * (1 - rise);
  h += inner * fbm2(n2, x * 0.03, z * 0.03, 2) * 0.6;

  return h;
}

export function createTerrain() {
  const N = 380;
  const SIZE = 3000;
  const geo = new PlaneGeometry(2, 2, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);
    const v = pos.getZ(i);
    // warp the grid so vertices concentrate near the meadow
    const x = Math.sign(u) * Math.pow(Math.abs(u), 2.1) * SIZE + MEADOW_CENTER.x;
    const z = Math.sign(v) * Math.pow(Math.abs(v), 2.1) * SIZE + MEADOW_CENTER.z;
    pos.setXYZ(i, x, terrainHeight(x, z), z);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const material = new ShaderMaterial({
    fog: true,
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.fog),
      uTime: shared.uTime,
      uWindDir: shared.uWindDir,
      uLawn: shared.uLawn,
      uAO: shared.uAO,
      uAOBounds: shared.uAOBounds,
      uVeil: shared.uVeil,
      uSunDir: { value: new Vector3(-0.45, 0.6, -0.65).normalize() },
      uSky: { value: col('#c6d0d2') },
      uGround: { value: col('#4b5a3b') },
      uRoot: { value: col(palette.grassRoot) },
      uMid: { value: col(palette.grassMid) },
      uTip: { value: col(palette.grassTip) },
      uDry: { value: col(palette.grassDry) },
      uSheen: { value: col(palette.grassSheen) },
      uLawnA: { value: col(palette.lawnA) },
      uLawnB: { value: col(palette.lawnB) },
      uForest: { value: col(palette.forest) },
      uForestLight: { value: col(palette.forestLight) },
      uFar: { value: col(palette.hillFar) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir, uSky, uGround, uRoot, uMid, uTip, uDry, uSheen, uLawnA, uLawnB, uForest, uForestLight, uFar;
      varying vec3 vWorld;
      varying vec3 vNormal;
      ${simplex2D}
      ${windField}
      ${lawnGLSL}
      #include <fog_pars_fragment>
      uniform float uVeil;

      void main() {
        vec2 p = vWorld.xz;
        vec3 n = normalize(vNormal);
        float camDist = length(cameraPosition - vWorld);

        // --- meadow: reads as dense grass from a distance
        float pa = snoise(p * 0.035) * 0.5 + 0.5;
        float pa2 = snoise(p * 0.11 + 3.0) * 0.5 + 0.5;
        float fine = snoise(p * 1.7) * 0.5 + 0.5;
        vec3 meadow = mix(uMid, uTip, 0.12 + pa * 0.3) * 0.88;
        meadow = mix(meadow, uDry, smoothstep(0.62, 0.95, pa2) * 0.4);
        meadow = mix(meadow, uRoot, (1.0 - fine) * 0.35 * smoothstep(60.0, 8.0, camDist));
        float gust = gustField(p);
        meadow = mix(meadow, uSheen, gust * 0.32);

        // --- mown lawn under the office, with stripes
        float sdf = lawnSDF(p) + snoise(p * 0.45) * 0.35;
        float lawn = 1.0 - smoothstep(-0.3, 0.7, sdf);
        vec3 lawnCol = mix(uLawnB, uLawnA, stripe(p));
        lawnCol *= 0.92 + fine * 0.12;
        vec3 ground = mix(meadow, lawnCol, lawn);
        // the soil between blades right at the meadow edge
        ground = mix(ground, uRoot, smoothstep(0.7, 2.6, sdf) * (1.0 - smoothstep(2.6, 9.0, sdf)) * 0.25);

        // --- hills: forest canopy texture, clearings on gentle slopes
        float hgt = vWorld.y;
        float slope = 1.0 - n.y;
        float canopy = snoise(p * 0.09) * 0.5 + 0.5;
        float canopyFine = snoise(p * 0.45 + 11.0) * 0.5 + 0.5;
        vec3 forest = mix(uForest, uForestLight, canopy * 0.6 + canopyFine * 0.4);
        float forestMask = smoothstep(2.5, 12.0, hgt) * smoothstep(0.25, 0.65, snoise(p * 0.006 + 2.0) * 0.5 + 0.5 + slope * 0.8);
        vec3 col = mix(ground, forest, forestMask);
        col = mix(col, uFar, smoothstep(220.0, 600.0, hgt) * 0.6);

        // --- overcast lighting: mostly sky, a little sun
        float hemi = n.y * 0.5 + 0.5;
        vec3 light = mix(uGround, uSky, hemi) * 1.05;
        light += vec3(1.0, 0.96, 0.9) * max(dot(n, uSunDir), 0.0) * 0.35;
        col *= light;
        col *= mix(0.55, 1.0, sampleAO(p));

        gl_FragColor = vec4(col, 1.0);

        // aerial perspective: distant peaks keep a little more contrast near their tops
        #ifdef USE_FOG
          float fogFactor = 1.0 - exp(-fogDensity * vFogDepth);
          // peaks keep their silhouette through the haze, but not through the opening's fog
          fogFactor *= mix(1.0, 0.74, smoothstep(30.0, 380.0, hgt) * (1.0 - uVeil));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
        #endif
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new Mesh(geo, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = false;
  return { mesh, material };
}
