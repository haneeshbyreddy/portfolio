import { Color, DataTexture, RGBAFormat, Texture, Vector2, Vector3, Vector4 } from 'three';
import { lawnBounds } from '../office/layout';
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
// mowing stripes, running toward the camera
float stripe(vec2 p) {
  return smoothstep(-0.12, 0.12, sin(p.x * 3.14159 / 1.25));
}
`;
