import { Color, DataTexture, RGBAFormat, Texture, Vector2, Vector3, Vector4 } from 'three';
import { GRID, lawnBounds } from '../office/layout';
import { palette } from './palette';

const lawn = lawnBounds();

const white = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat);
white.needsUpdate = true;

/**
 * Uniform objects shared by reference across every custom material, so one
 * write per frame drives grass, ground, trees and particles together.
 */
export const shared = {
  uTime: { value: 0 },
  uWindDir: { value: new Vector2(0.86, -0.5).normalize() },
  uLawn: { value: new Vector4(lawn.x0, lawn.z0, lawn.x1, lawn.z1) },
  /** Soft contact shadows baked under the furniture. */
  uAO: { value: white as Texture },
  uAOBounds: { value: new Vector4(-1, -1, 1, 1) },
  /** xz = cursor on the ground, y = strength (0..1). */
  uCursor: { value: new Vector3(0, 0, 0) },
  /**
   * How much of the floor the opening's fog still hides (0 once it has lifted).
   * Materials that light themselves (screens, pollen) can't take scene fog, so
   * they fade into it with this instead.
   */
  uVeil: { value: 0 },
  uFogColor: { value: new Color(palette.fog) },
  /** How much light a passing cloud takes off the land (0 = none). */
  uCloud: { value: 0.34 },
};

export const lawnGLSL = /* glsl */ `
uniform vec4 uLawn;
uniform sampler2D uAO;
uniform vec4 uAOBounds;
float lawnSDF(vec2 p) {
  vec2 c = (uLawn.xy + uLawn.zw) * 0.5;
  vec2 h = (uLawn.zw - uLawn.xy) * 0.5;
  float r = 2.6;
  vec2 q = abs(p - c) - h + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float sampleAO(vec2 p) {
  vec2 uv = (p - uAOBounds.xy) / (uAOBounds.zw - uAOBounds.xy);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
  return texture2D(uAO, vec2(uv.x, 1.0 - uv.y)).r;
}
// mowing stripes, running toward the camera and mown to the floor plan:
// darker turf under each column of desks, a light stripe down every aisle
float stripe(vec2 p) {
  return smoothstep(-0.12, 0.12, -cos((p.x - ${GRID.x.toFixed(3)}) * ${((2 * Math.PI) / GRID.pitchX).toFixed(5)}));
}
`;

/**
 * Cloud shade: the field lies under a thin deck with heavier patches drifting
 * through it on the wind, the way light moves over open country. The office
 * stands in a break in the cloud, so the floor is always the brightest thing
 * in the landscape and the meadow around it falls away — lighting the subject,
 * not the set. Needs `snoise` (simplex2D), `uTime` + `uWindDir` (windField)
 * and `lawnGLSL`. Returns a multiplier for the lit colour.
 */
export const cloudGLSL = /* glsl */ `
uniform float uCloud;
float cloudShade(vec2 p) {
  vec2 q = p * 0.011 - uWindDir * uTime * 0.026;
  float n = snoise(q) * 0.62 + snoise(q * 2.3 + vec2(7.3, 1.9)) * 0.38;
  float cover = 0.5 + 0.5 * smoothstep(-0.25, 0.35, n);
  float open = smoothstep(3.0, 24.0, lawnSDF(p));
  return 1.0 - cover * open * uCloud;
}
`;
