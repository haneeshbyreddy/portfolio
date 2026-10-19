import { ShaderChunk } from 'three';

/**
 * Global shader tweaks applied once, before any material compiles.
 *
 * Fog: three's FogExp2 squares the distance term, which turns hills into a
 * wall of grey. A plain exponential keeps the office crisp at 30 m, the hills
 * half-veiled at 300 m and lets the far mountains survive as silhouettes.
 */
export function applyShaderPatches() {
  ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;
}
