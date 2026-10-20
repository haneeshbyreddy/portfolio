import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { mulberry32 } from '../core/math';
import { shared } from './shared';

/**
 * Small signs of life: seed fluff drifting on the wind through the office,
 * and a couple of birds working the thermals over the hills.
 */
export function createAtmosphere(count = 420) {
  const rand = mulberry32(5150);

  // ---------------- pollen
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rand() - 0.5) * 70;
    pos[i * 3 + 1] = 0.3 + rand() * 7;
    pos[i * 3 + 2] = (rand() - 0.5) * 60 - 2;
    seed[i] = rand();
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
  const pollenMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: shared.uTime,
      uWindDir: shared.uWindDir,
      uPixel: { value: 1 },
      uColor: { value: new Color('#fff6dd') },
      uVeil: shared.uVeil,
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform vec2 uWindDir;
      uniform float uPixel;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime * (0.6 + aSeed * 0.8);
        p.xz += uWindDir * t * 1.6;
        p.x += sin(t * 0.7 + aSeed * 30.0) * 1.2;
        p.y += sin(t * 0.9 + aSeed * 12.0) * 0.6 + sin(t * 2.3 + aSeed * 5.0) * 0.12;
        p.z += cos(t * 0.6 + aSeed * 21.0) * 1.0;
        // wrap inside the volume
        p.x = mod(p.x + 35.0, 70.0) - 35.0;
        p.z = mod(p.z + 32.0, 60.0) - 32.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = (0.022 + aSeed * 0.03) * uPixel;
        gl_PointSize = clamp(size * 900.0 / -mv.z, 1.0, 8.0);
        vA = (0.35 + 0.65 * fract(aSeed * 7.13)) * smoothstep(80.0, 6.0, -mv.z) * smoothstep(0.4, 2.5, -mv.z);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uVeil;
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor * a * vA * 0.32 * (1.0 - uVeil), 1.0);
      }
    `,
  });
  const pollen = new Points(geo, pollenMat);
  pollen.frustumCulled = false;
  pollen.name = 'pollen';

  // ---------------- birds
  const wing = new BufferGeometry();
  // a swept wing: root at origin, tip out along +x
  wing.setAttribute('position', new BufferAttribute(new Float32Array([
    0, 0, 0.12, 0, 0, -0.12, 0.9, 0, -0.32,
    0, 0, 0.12, 0.9, 0, -0.32, 1.25, 0, -0.55,
  ]), 3));
  wing.computeVertexNormals();
  const birdCount = 7;
  const birds = new InstancedMesh(wing, new MeshBasicMaterial({ color: '#2b302e', side: DoubleSide, fog: true }), birdCount * 2);
  birds.frustumCulled = false;
  birds.name = 'birds';
  const flock = Array.from({ length: birdCount }, (_, i) => ({
    r: 70 + rand() * 40,
    h: 26 + rand() * 12,
    speed: 0.05 + rand() * 0.025,
    phase: (i / birdCount) * 0.9 + rand() * 0.2,
    flap: 4 + rand() * 2,
    cx: -40 + (i % 2) * 70,
    cz: -150 - rand() * 40,
  }));
  const m = new Matrix4();
  const q = new Quaternion();
  const qw = new Quaternion();
  const p = new Vector3();
  const s = new Vector3(1, 1, 1);
  const fwd = new Vector3();
  const zAxis = new Vector3(0, 0, 1);
  const qq = new Quaternion();

  const update = (time: number) => {
    flock.forEach((b, i) => {
      const a = time * b.speed + b.phase * Math.PI * 2;
      p.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(time * 0.3 + i) * 2, b.cz + Math.sin(a) * b.r * 0.6);
      fwd.set(-Math.sin(a), 0, Math.cos(a) * 0.6).normalize();
      q.setFromUnitVectors(zAxis, fwd);
      // flap in bursts, glide in between
      const glide = Math.sin(time * 0.4 + i * 2) > 0.2 ? 0.15 : 1;
      const flap = Math.sin(time * b.flap + i) * 0.55 * glide + 0.1;
      const scale = 2.2;
      s.setScalar(scale);
      for (const side of [1, -1]) {
        // the left wing is the right wing turned half a revolution about the body axis
        qw.setFromAxisAngle(zAxis, side > 0 ? flap : Math.PI - flap);
        m.compose(p, qq.copy(q).multiply(qw), s);
        birds.setMatrixAt(i * 2 + (side > 0 ? 0 : 1), m);
      }
    });
    birds.instanceMatrix.needsUpdate = true;
  };

  return { pollen, birds, update, setPixelRatio: (r: number) => (pollenMat.uniforms.uPixel.value = r) };
}
