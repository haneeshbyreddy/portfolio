import { Color, ShaderMaterial, Texture, Vector2 } from 'three';
import { shared } from '../world/shared';

/**
 * CRT face: slight barrel, fine scanlines, phosphor bloom, a glass layer that
 * reflects the overcast sky, the classic power-on (dot → line → frame), and a
 * channel change (the picture rolls, tears and drowns in snow for a beat).
 */
export function createScreenMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uMap: { value: null as Texture | null },
      uHasMap: { value: 0 },
      uOn: { value: 0 },
      uBoot: { value: 1 },
      uTime: { value: 0 },
      uHover: { value: 0 },
      uFocus: { value: 0 },
      uSwitch: { value: 0 },
      uRes: { value: new Vector2(512, 384) },
      uGlass: { value: new Color('#b9c4c6') },
      uVeil: shared.uVeil,
      uFogColor: shared.uFogColor,
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        #ifdef USE_INSTANCING
          wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        #endif
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uHasMap, uOn, uBoot, uTime, uHover, uFocus, uSwitch;
      uniform vec2 uRes;
      uniform vec3 uGlass, uFogColor;
      uniform float uVeil;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void main() {
        vec2 uv = vUv;
        vec2 cc = uv - 0.5;
        float r2 = dot(cc, cc);
        vec2 buv = 0.5 + cc * (1.0 + 0.055 * r2) * 0.985;

        // channel change: lines tear sideways and the frame rolls
        float sw = uSwitch;
        float frameNo = floor(uTime * 30.0);
        if (sw > 0.0) {
          float row = floor(buv.y * 160.0);
          buv.x += (hash12(vec2(row, frameNo)) - 0.5) * 0.16 * sw * sw;
          buv.y = fract(buv.y + sw * sw * 0.42);
        }

        vec3 img = vec3(0.0);
        if (uHasMap > 0.5) {
          img = texture2D(uMap, buv).rgb;
          // tiny chromatic fringe
          img.r = mix(img.r, texture2D(uMap, buv + vec2(0.0012, 0.0)).r, 0.5);
          img.b = mix(img.b, texture2D(uMap, buv - vec2(0.0012, 0.0)).b, 0.5);
        }
        // snow, and the dark band of the vertical blank rolling through
        if (sw > 0.0) {
          float snow = hash12(floor(buv * uRes * 0.5) + frameNo * 17.0);
          img = mix(img, vec3(snow * 0.85), smoothstep(0.15, 0.85, sw));
          img *= 1.0 - smoothstep(0.0, 0.04, sw) * (1.0 - smoothstep(0.0, 0.06, abs(fract(buv.y + 0.5) - 0.5) - 0.02)) * 0.9;
        }
        float inside = step(0.0, buv.x) * step(buv.x, 1.0) * step(0.0, buv.y) * step(buv.y, 1.0);

        // scanlines — softer when the camera is close
        float lines = mix(uRes.y, uRes.y * 0.5, uFocus);
        float scan = 0.9 + 0.1 * sin(buv.y * lines * 3.14159);
        float roll = 0.97 + 0.03 * sin(buv.y * 6.0 - uTime * 1.6);
        img *= scan * roll;

        float vig = smoothstep(0.82, 0.18, length(cc * vec2(1.0, 1.2)));

        // power-on: a dot, a line, then the frame
        float b = uBoot;
        float lineW = smoothstep(0.0, 0.16, b);
        float openY = smoothstep(0.14, 0.42, b);
        float hy = mix(0.003, 0.5, openY);
        float mask = step(abs(cc.x), lineW * 0.5) * step(abs(cc.y), hy);
        vec3 flash = vec3(0.9, 1.0, 0.95) * (1.0 - openY) * 3.5 * lineW;
        vec3 picture = mix(flash, img, openY) * mask;

        vec3 emissive = picture * uOn * inside * (0.78 + vig * 0.32) * (1.35 + uHover * 0.35);

        // glass
        float ndv = max(dot(normalize(vN), normalize(vV)), 0.0);
        float fres = pow(1.0 - ndv, 3.0);
        vec3 glass = vec3(0.018, 0.024, 0.024) * (0.6 + vig * 0.6);
        glass += uGlass * (0.035 + fres * 0.35);
        // soft window-like highlight across the top of the tube
        float streak = smoothstep(0.32, 0.0, abs(uv.y - 0.82 + uv.x * 0.18)) * smoothstep(0.0, 0.25, uv.x) * smoothstep(1.0, 0.6, uv.x);
        glass += uGlass * streak * 0.07;

        vec3 col = glass * (1.0 - uOn * 0.55) + emissive;
        col = mix(col, uFogColor, uVeil);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}
