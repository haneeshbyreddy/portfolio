// Shared GLSL snippets.

export const simplex2D = /* glsl */ `
vec3 _permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = _permute(_permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x   + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

export const hash = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

/**
 * The single wind field shared by grass, ground, trees and particles, so every
 * gust that rolls across the meadow is coherent between systems.
 * Returns 0..1 gust strength at a world-space XZ position.
 */
export const windField = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
float gustField(vec2 p) {
  vec2 q = p * 0.032 - uWindDir * uTime * 0.42;
  float n = snoise(q) * 0.5 + 0.5;
  float n2 = snoise(q * 2.7 + vec2(13.1, 7.7) - uWindDir * uTime * 0.25) * 0.5 + 0.5;
  float g = n * 0.72 + n2 * 0.28;
  // slow "breathing" of the whole field
  g += 0.1 * sin(uTime * 0.21);
  return smoothstep(0.42, 0.92, g);
}
`;
