import '@fontsource-variable/inter-tight';
import '@fontsource-variable/geist-mono';
import './ui/styles.css';
import { Experience } from './core/Experience';
import { UI } from './ui/UI';

async function boot() {
  const host = document.getElementById('app')!;

  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) {
    host.innerHTML = `<div class="fallback"><div><h1 style="font-weight:500;letter-spacing:-.05em;font-size:64px;margin:0">Fieldwork</h1><p class="mono">This experience needs WebGL 2.</p></div></div>`;
    return;
  }

  // fonts are drawn into the monitor canvases, so wait for them
  const fonts = Promise.all([
    document.fonts.load('500 20px "Inter Tight Variable"'),
    document.fonts.load('650 20px "Inter Tight Variable"'),
    document.fonts.load('500 20px "Geist Mono Variable"'),
  ]).catch(() => undefined);

  const t0 = performance.now();
  const exp = new Experience(host);
  if (import.meta.env.DEV) (window as unknown as { __exp: Experience }).__exp = exp;
  const ui = new UI(exp, host);
  if (import.meta.env.DEV) (window as unknown as { __ui: UI }).__ui = ui;
  exp.on('progress', (p) => ui.setProgress(p));

  await fonts;
  ui.setProgress(0.08);
  exp.start();
  await exp.warmup();
  ui.reveal();
  if (import.meta.env.DEV) console.info(`[fieldwork] ready in ${Math.round(performance.now() - t0)}ms`);
}

boot();
