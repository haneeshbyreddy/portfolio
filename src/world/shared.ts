import { Color, DataTexture, RGBAFormat, Texture, Vector2, Vector3, Vector4 } from 'three';
import { campBounds } from '../office/layout';
import { palette } from './palette';

const camp = campBounds();

// no marks yet: full light (r), untrodden (g), uncovered (b), unmown (a)
const blank = new DataTexture(new Uint8Array([255, 0, 0, 0]), 1, 1, RGBAFormat);
blank.needsUpdate = true;

/**
 * Uniform objects shared by reference across every custom material, so one
 * write per frame drives grass, ground, trees and particles together.
 */
export const shared = {
  uTime: { value: 0 },
  uWindDir: { value: new Vector2(0.86, -0.5).normalize() },
  uCamp: { value: new Vector4(camp.x0, camp.z0, camp.x1, camp.z1) },
  /**
   * Marks on the ground, painted once the camp is set up (`GroundMarks`):
   * r = soft contact shade under everything that stands on the grass,
   * g = how trodden the grass is — under the chairs, along the paths,
   * b = covered by something lying on it, so no grass shows through,
   * a = mown: the clearings and paths cut out of the meadow for the camp.
   */
  uGround: { value: blank as Texture },
  uGroundBounds: { value: new Vector4(-1, -1, 1, 1) },
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
  uCloud: { value: 0.3 },
};

export const campGLSL = /* glsl */ `
uniform vec4 uCamp;
uniform sampler2D uGround;
uniform vec4 uGroundBounds;
float campSDF(vec2 p) {
  vec2 c = (uCamp.xy + uCamp.zw) * 0.5;
  vec2 h = (uCamp.zw - uCamp.xy) * 0.5;
  float r = 4.0;
  vec2 q = abs(p - c) - h + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
// x = light left by the contact shade (1 = none), y = how trodden, z = covered, w = mown (0..1)
vec4 groundMarks(vec2 p) {
  vec2 uv = (p - uGroundBounds.xy) / (uGroundBounds.zw - uGroundBounds.xy);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(1.0, 0.0, 0.0, 0.0);
  return texture2D(uGround, uv);
}
`;

/**
 * Fresh-cut lawn, as the ground under the stubble and the stubble itself
 * share it: the mower's stripes (a groundskeeper's pass, light and dark,
 * running toward the establishing shot) and the mottle of a real lawn.
 * Needs `snoise`. Multiplies a lawn colour.
 */
export const lawnGLSL = /* glsl */ `
float lawnTone(vec2 p) {
  float stripe = smoothstep(-0.2, 0.2, sin(p.x * 5.71));
  float mottle = snoise(p * 0.7) * 0.06 + snoise(p * 3.1 + 4.0) * 0.035;
  return 0.94 + stripe * 0.09 + mottle;
}
`;

/**
 * Cloud shade: the field lies under a thin deck with heavier patches drifting
 * through it on the wind, the way light moves over open country. The camp
 * sits in a break in the cloud, so it's always the brightest thing in the
 * landscape and the meadow around it falls away — lighting the subject, not
 * the set. Needs `snoise` (simplex2D), `uTime` + `uWindDir` (windField) and
 * `campGLSL`. Returns a multiplier for the lit colour.
 */
export const cloudGLSL = /* glsl */ `
uniform float uCloud;
float cloudShade(vec2 p) {
  vec2 q = p * 0.011 - uWindDir * uTime * 0.026;
  float n = snoise(q) * 0.62 + snoise(q * 2.3 + vec2(7.3, 1.9)) * 0.38;
  float cover = 0.5 + 0.5 * smoothstep(-0.25, 0.35, n);
  float open = smoothstep(2.0, 22.0, campSDF(p));
  return 1.0 - cover * open * uCloud;
}
`;
