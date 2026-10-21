export type Tier = 'high' | 'medium' | 'low';

export interface Quality {
  tier: Tier;
  dpr: number;
  meadowBlades: number;
  campBlades: number;
  trees: number;
  shadows: boolean;
  shadowMapSize: number;
  ao: boolean;
  msaa: number;
  tiltShift: boolean;
}

const presets: Record<Tier, Omit<Quality, 'tier' | 'dpr'> & { maxDpr: number }> = {
  high: { maxDpr: 1.75, meadowBlades: 380_000, campBlades: 240_000, trees: 5200, shadows: true, shadowMapSize: 2048, ao: true, msaa: 4, tiltShift: true },
  medium: { maxDpr: 1.5, meadowBlades: 190_000, campBlades: 120_000, trees: 3200, shadows: true, shadowMapSize: 1024, ao: false, msaa: 2, tiltShift: true },
  low: { maxDpr: 1.25, meadowBlades: 70_000, campBlades: 45_000, trees: 1600, shadows: false, shadowMapSize: 512, ao: false, msaa: 0, tiltShift: false },
};

function gpuString(): string {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const s = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(s || '').toLowerCase();
  } catch {
    return '';
  }
}

export function detectQuality(): Quality {
  const params = new URLSearchParams(location.search);
  const forced = params.get('q') as Tier | null;
  let tier: Tier = 'high';

  if (forced && forced in presets) {
    tier = forced;
  } else {
    const gpu = gpuString();
    const mobile = /iphone|ipad|android|mobile/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;
    const weakGpu = /intel|mali-g5|mali-t|adreno \(tm\) [3-5]|powervr|swiftshader|llvmpipe|software/.test(gpu);
    const cores = navigator.hardwareConcurrency || 4;
    if (weakGpu || cores <= 4) tier = 'low';
    else if (mobile) tier = 'medium';
    if (/apple m\d|apple gpu/.test(gpu) && !mobile) tier = 'high';
  }

  const p = presets[tier];
  return { tier, ...p, dpr: Math.min(window.devicePixelRatio || 1, p.maxDpr) };
}
