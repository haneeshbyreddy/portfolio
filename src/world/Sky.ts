import { BackSide, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { simplex2D } from '../core/glsl';
import { col, palette } from './palette';

/**
 * Overcast dome: heavy stratus layers, a brighter band at the horizon and a
 * sun buried somewhere behind the cloud deck. Below the horizon it resolves to
 * the exact fog colour so terrain dissolves into it without a seam.
 */
export function createSky(sunDir: Vector3) {
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uZenith: { value: col(palette.skyZenith) },
      uMid: { value: col(palette.skyMid) },
      uHorizon: { value: col(palette.horizon) },
      uFog: { value: col(palette.fog) },
      uCloudDark: { value: col(palette.cloudDark) },
      uCloudLight: { value: col(palette.cloudLight) },
      uSunGlow: { value: col(palette.sunGlow) },
      uSunDir: { value: sunDir.clone().normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // pin to far plane
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uZenith, uMid, uHorizon, uFog, uCloudDark, uCloudLight, uSunGlow, uSunDir;
      varying vec3 vDir;
      ${simplex2D}
      float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 6; i++) { s += a * snoise(p); p = p * 2.02 + vec2(17.3, 9.1); a *= 0.5; }
        return s;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float hp = max(h, 0.0);

        // base gradient
        vec3 sky = mix(uHorizon, uMid, smoothstep(0.0, 0.18, hp));
        sky = mix(sky, uZenith, smoothstep(0.12, 0.7, hp));

        // project onto a cloud deck; stretch along x for stratus streaks
        vec2 uv = d.xz / (hp + 0.11);
        uv *= vec2(0.22, 0.42);
        vec2 drift = vec2(uTime * 0.0045, uTime * 0.0012);
        // domain warp for soft, torn edges
        vec2 w = vec2(fbm(uv * 0.8 + drift), fbm(uv * 0.8 - drift + 4.7));
        float n = fbm(uv + w * 0.55 + drift * 2.0) * 0.5 + 0.5;
        float body = smoothstep(0.32, 0.78, n);
        // fake light through the deck: sample toward the sun
        float lit = fbm(uv * 1.6 + w * 0.4 + uSunDir.xz * 0.25 + drift * 2.0) * 0.5 + 0.5;
        vec3 cloud = mix(uCloudDark, uCloudLight, smoothstep(0.25, 0.85, lit) * 0.85 + 0.1);

        float coverage = 0.82 * smoothstep(-0.02, 0.1, h);
        vec3 c = mix(sky, cloud, body * coverage);

        // diffused sun behind the deck
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        c += uSunGlow * (pow(s, 6.0) * 0.22 + pow(s, 48.0) * 0.18) * (1.0 - body * 0.6);

        // horizon haze band — melts into fog below
        c = mix(c, uHorizon, exp(-hp * 16.0) * 0.75);
        c = mix(uFog, c, smoothstep(-0.04, 0.012, h));

        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new Mesh(new SphereGeometry(4500, 64, 32), material);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.name = 'sky';
  return { mesh, material };
}
