#!/usr/bin/env node
// Records the live project sites shown on the Fieldwork CRTs.
//
//   npm run capture                 # every site
//   npm run capture -- rbot faces   # just these ids
//
// Per site it writes public/work/<id>/site.mp4, site-floor.mp4 and site.jpg.
// See README.md in this folder for how the recording stays real-time faithful.

import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_ROOT = path.join(ROOT, 'public/work');
const TMP_ROOT = process.env.CAPTURE_TMP || path.join(os.tmpdir(), 'fieldwork-capture');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';

const VIEWPORT = { width: 1280, height: 906 };
const FPS = 30;
const FLOOR = { width: 400, height: 284, fps: 15, crf: 30, maxBytes: 450 * 1024, fallbackSeconds: 14 };
const MAIN_MAX_BYTES = 6 * 1024 * 1024;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Choreography. Times are seconds of the finished video.
//   { hold: s }                          stay put
//   { holdTo: s }                        stay put until the video is s seconds long
//   { to: y | 'css selector', offset, dur, ease }   glide the page there
//   { until: 'js expression', timeout }  wait for the page to do something itself
//   { click: 'css selector' }            DOM click (no pointer, no hover state)
// `loop: { fade: s }` dissolves the last s seconds into frame 1, for sites whose
// end state cannot glide back to the start (a one-way intro, a 40,000 px story);
// `through: '#hex'` dips through that colour instead of cross-dissolving.
// ---------------------------------------------------------------------------
export const SITES = [
  {
    id: 'hansanet',
    url: 'https://hansanet.in/',
    colorScheme: 'dark', // designed dark; it ignores the OS setting and stays dark by default
    settle: 1.5, // the night map fades in ("art-in"); let it finish
    crf: 24,
    beats: [
      { hold: 3.6 }, // hero: night map, comets running the fibre lines
      { to: '#story', offset: -154, dur: 1.3 }, // "Mill Street was dark for 48 minutes." four-step timeline
      { hold: 2.6 },
      { to: '#stakes', offset: -93, dur: 1.2 }, // "Know what broke before the phone rings." 2 in 3 + regulator numbers
      { hold: 2.5 },
      { to: '#does', offset: -149, dur: 1.2 }, // "Eight things your OLT page cannot tell you." cards draw themselves in
      { hold: 2.6 },
      { to: '#cost', offset: -181, dur: 1.6 }, // savings calculator: ₹75,000 lost vs ₹10,620
      { hold: 2.6 },
      { to: '#pricing', offset: -118, dur: 1.4 }, // pricing calculator: ₹2,124 a month
      { hold: 2.6 },
      { to: 0, dur: 2.2 },
      { hold: 1.6 },
    ],
    palette: {
      background: ['body', 'background-color'],
      text: ['body', 'color'],
      primary: ['--fibre'], // teal: logo, offer dot, drawn feature cards
      secondary: ['--crew'], // blue: the hero's fibre comets and primary actions
    },
  },
  {
    id: 'hyderabaddies',
    url: 'https://hyderabaddies.in/',
    colorScheme: 'light',
    settle: 1.0,
    crf: 24,
    beats: [
      // The poster lets go of the Charminar by itself ~11.7 s after load: red ground,
      // swinging Charminar, then it drops into the H, the ground flips to marigold
      // and the invite slip rises.
      { hold: 2.0 },
      { until: "document.querySelector('main[data-ground]')?.dataset.ground !== 'red'", timeout: 14 },
      { holdTo: 20.4 }, // the marigold poster and the invite slip; a still page from here
    ],
    // If it never lets go on its own, press its own "click to let go".
    fallbackClick: 'button[class*="_hint"]',
    // Back to the red poster through the cream "paper" flash the poster itself
    // uses between red and marigold, rather than a muddy orange cross-dissolve.
    loop: { fade: 0.5, through: '#FBF2DE' },
    palette: {
      background: ['--poster-red'],
      text: ['--paper'],
      primary: ['--marigold'],
      secondary: ['--maroon'],
    },
  },
  {
    id: 'rbot',
    url: 'https://resourcingbot.vercel.app/',
    colorScheme: 'light',
    settle: 1.2,
    crf: 25,
    beats: [
      { hold: 3.0 }, // "Hire faster. With AI precision." scattered emails
      { to: 3900, dur: 3.0, ease: 'cruise' }, // emails collapse into one file: "One hire. Seven people. One file."
      { hold: 1.8 },
      { to: 7250, dur: 2.4, ease: 'cruise' }, // Admin: APPROVED
      { hold: 1.6 },
      { to: 18300, dur: 5.0, ease: 'cruise' }, // Hiring manager brief, résumé storm, Recruiter: SHORTLISTED
      { hold: 1.6 },
      { to: 27500, dur: 4.2, ease: 'cruise' }, // Candidate test, Interviewer: SELECTED
      { hold: 1.4 },
      { to: 34900, dur: 3.6, ease: 'cruise' }, // HR: JOINED
      { hold: 2.2 },
    ],
    // Fade the last scene out to the bare desk and the opening emails back in.
    loop: { fade: 0.8, through: '#E9E1C8' },
    palette: {
      background: ['--ground'],
      text: ['--ink'],
      primary: ['--stamp-ink'],
      secondary: ['--manila'],
    },
  },
  {
    id: 'faces',
    url: 'https://3dprinting-seven.vercel.app/',
    colorScheme: 'light',
    settle: 1.0,
    crf: 24,
    // Reveal the verdict card that peeks in under the hero before the take, so the
    // last frame (back at the top, card revealed) matches the first.
    prewarm: 420,
    // The glossary coach mark ("Hover this word ... GOT IT") pops up ~2.5 s in.
    prepare: async (page) => {
      await page.waitForSelector('#glHintX', { state: 'visible', timeout: 8000 }).catch(() => {});
      await page.evaluate(() => document.querySelector('#glHintX')?.click());
      await page.waitForTimeout(900);
    },
    beats: [
      { hold: 3.6 }, // hero: headline, contour-drawn head, idle printer
      { to: 600, dur: 1.2 }, // "The answer, before the argument" + DECIDE TODAY
      { hold: 2.5 },
      { to: '#s1', offset: -90, dur: 1.1 }, // 01 · 130 mm, sizes chart (printer homing)
      { hold: 2.5 },
      { to: '#s2', offset: -90, dur: 1.3 }, // 02 · Resin vs filament diagrams
      { hold: 2.5 },
      { to: '#s5', offset: -90, dur: 1.7 }, // 05 · ₹265 of material (head printing)
      { hold: 2.5 },
      { to: '#test', offset: -90, dur: 1.5 }, // the decision: Spend ₹7,000 (print complete)
      { hold: 2.8 },
      { to: 0, dur: 2.2 },
      { hold: 1.6 },
    ],
    palette: {
      background: ['--paper'],
      text: ['--ink'],
      primary: ['--uv'],
      secondary: ['--amber'],
    },
  },
];

// ---------------------------------------------------------------------------

const HIDE_CHROME_CSS = `
  ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
  html { scrollbar-width: none !important; }
  *, *::before, *::after { cursor: none !important; caret-color: transparent !important; }
`;

const log = (id, ...a) => console.log(`[${id}]`, ...a);

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString();
}

async function prepPage(page, site) {
  await page.goto(site.url, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.addStyleTag({ content: HIDE_CHROME_CSS });
  // Load every image up front (without scrolling, so one-shot reveals still play
  // on camera) so no glide lands on a half-loaded picture.
  await page.evaluate(async () => {
    for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) =>
        img.complete ? img.decode?.().catch(() => {}) : new Promise((r) => { img.onload = img.onerror = r; }),
      ),
    );
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  if (site.prewarm) {
    // One pass down the page (to `prewarm` px, or all of it) and back before the
    // take. It fires one-shot scroll reveals and warms rasterisation off camera;
    // opt-in, because reveals that play on camera are usually worth keeping.
    await page.evaluate(async (limit) => {
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      const max = Math.min(limit === true ? Infinity : limit, document.documentElement.scrollHeight - innerHeight);
      for (let y = 0; y < max; y += 120) { window.scrollTo({ top: y, behavior: 'instant' }); await raf(); await raf(); }
      for (let y = max; y > 0; y -= 240) { window.scrollTo({ top: y, behavior: 'instant' }); await raf(); await raf(); }
      window.scrollTo({ top: 0, behavior: 'instant' });
    }, site.prewarm);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);
  }
  if (site.prepare) await site.prepare(page);
  await page.waitForTimeout((site.settle ?? 1) * 1000);
}

async function readPalette(page, palette) {
  return page.evaluate((palette) => {
    const toHex = (c) => {
      const cv = document.createElement('canvas').getContext('2d');
      cv.fillStyle = '#000';
      cv.fillStyle = c;
      return cv.fillStyle.toUpperCase();
    };
    const out = {};
    for (const [k, spec] of Object.entries(palette)) {
      const [a, b] = spec;
      const raw = a.startsWith('--')
        ? getComputedStyle(document.documentElement).getPropertyValue(a).trim()
        : getComputedStyle(document.querySelector(a)).getPropertyValue(b);
      out[k] = `${toHex(raw)}  (${a}${b ? ' ' + b : ''})`;
    }
    return out;
  }, palette);
}

// Runs inside the page and drives the take on its own clock.
//
// The clock follows requestAnimationFrame in real time, with two exceptions so a
// hitch in the site never turns into a jump in the scroll:
//  - a main-thread stall (one rAF gap > 25 ms) only advances the clock 25 ms;
//  - if a scroll position has not reached the screen 60 ms after it was set
//    (Chrome busy rasterising), the clock waits for it, up to 400 ms. The
//    screencast reports each presented frame's scroll offset back to the page.
// The video is cut on this clock, so a stall costs a few milliseconds of page
// animation instead of a freeze followed by a lurch.
async function choreograph(beats) {
  const LAG = 60, MAX_WAIT = 400, CAP = 25;
  const fw = (window.__fw = { at: 0, y: null });
  fw.present = (tsMs, y) => { if (tsMs > fw.at) { fw.at = tsMs; fw.y = Math.round(y); } };

  const EASES = {
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    // Cruise: sine-ramped acceleration over the first/last 22%, constant speed between.
    // Scroll-scrubbed scenes then play at an even pace instead of whipping past mid-glide.
    cruise: (t) => {
      const a = 0.22, v = 1 / (1 - a);
      const ramp = (x) => v * (x / 2 - (a / (2 * Math.PI)) * Math.sin((Math.PI * x) / a));
      if (t <= a) return ramp(t);
      if (t >= 1 - a) return 1 - ramp(1 - t);
      return v * (a / 2 + (t - a));
    },
  };
  const maxY = () => document.documentElement.scrollHeight - innerHeight;
  const resolve = (b) => {
    if (typeof b.to === 'number') return Math.min(b.to, maxY());
    const el = document.querySelector(b.to);
    if (!el) throw new Error('no element for ' + b.to);
    return Math.max(0, Math.min(maxY(), Math.round(el.getBoundingClientRect().top + scrollY + (b.offset || 0))));
  };

  const ticks = []; // { r: epoch ms of the rAF, c: clock ms, y: scroll after this tick }
  const unseen = []; // scroll positions set but not yet presented: { r, y }
  let clock = 0, prevR = null, waits = 0;
  const tick = () => new Promise((res) => requestAnimationFrame((t) => {
    const r = performance.timeOrigin + t;
    let dt = prevR === null ? 0 : Math.min(r - prevR, CAP);
    prevR = r;
    if (unseen.length && fw.y !== null) {
      const seen = unseen.findLastIndex((e) => e.y === fw.y && e.r <= fw.at - 10);
      if (seen >= 0) unseen.splice(0, seen + 1);
    }
    const age = unseen.length ? r - unseen[0].r : 0;
    if (age > LAG + MAX_WAIT) unseen.length = 0; // nothing visible changed; carry on
    else if (age > LAG) { dt = 0; waits++; }
    clock += dt;
    res({ r, c: clock });
  }));
  let lastY = Math.round(scrollY);
  const commit = (r, y) => {
    if (y !== undefined) window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    const now = Math.round(scrollY);
    if (now !== lastY) unseen.push({ r, y: now });
    lastY = now;
    ticks.push({ r, c: clock, y: now });
  };

  let t = await tick();
  commit(t.r);
  const marks = [];
  for (const b of beats) {
    const kind = b.hold || b.holdTo ? 'hold' : b.to !== undefined ? 'glide' : b.until ? 'until' : 'click';
    const mark = { kind, at: clock / 1000, beat: b.to ?? b.hold ?? b.holdTo ?? b.until ?? b.click };
    marks.push(mark);
    const t0 = clock;
    if (b.hold || b.holdTo) {
      const end = b.hold ? t0 + b.hold * 1000 : b.holdTo * 1000;
      while (clock < end) { t = await tick(); commit(t.r); }
    } else if (b.to !== undefined) {
      const from = scrollY, to = resolve(b), dur = b.dur * 1000, ease = EASES[b.ease || 'inOutCubic'];
      for (;;) {
        t = await tick();
        const p = Math.min(1, (clock - t0) / dur);
        commit(t.r, from + (to - from) * ease(p));
        if (p >= 1) break;
      }
    } else if (b.until) {
      const test = new Function(`return (${b.until});`);
      const limit = t0 + (b.timeout ?? 15) * 1000;
      while (!test() && clock < limit) { t = await tick(); commit(t.r); }
      if (!test() && b.fallbackClick) document.querySelector(b.fallbackClick)?.click();
    } else if (b.click) {
      document.querySelector(b.click)?.click();
    }
    mark.end = clock / 1000;
    mark.y = Math.round(scrollY);
  }
  // Excised time, for the log.
  const stalls = [];
  for (let i = 1; i < ticks.length; i++) {
    const lost = ticks[i].r - ticks[i - 1].r - (ticks[i].c - ticks[i - 1].c);
    if (lost > 20) stalls.push({ at: +(ticks[i - 1].c / 1000).toFixed(2), ms: Math.round(lost) });
  }
  return { ticks, marks, stalls, waits, duration: clock / 1000 };
}

async function record(site, frameDir) {
  const browser = await chromium.launch({ channel: 'chromium', args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      userAgent: USER_AGENT,
      colorScheme: site.colorScheme || 'light',
      reducedMotion: 'no-preference',
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      bypassCSP: true, // the choreography evaluates small predicates in the page
    });
    const page = await context.newPage();
    await prepPage(page, site);
    const palette = site.palette ? await readPalette(page, site.palette) : null;

    const cdp = await context.newCDPSession(page);
    const frames = [];
    const writes = [];
    cdp.on('Page.screencastFrame', (f) => {
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      const ts = f.metadata.timestamp;
      // Tell the choreography what has reached the screen (see choreograph()).
      cdp.send('Runtime.evaluate', {
        expression: `window.__fw && __fw.present(${ts * 1000}, ${f.metadata.scrollOffsetY})`,
      }).catch(() => {});
      const file = path.join(frameDir, `${String(frames.length).padStart(5, '0')}.jpg`);
      frames.push({ ts: ts * 1000, y: Math.round(f.metadata.scrollOffsetY), file });
      writes.push(fs.promises.writeFile(file, Buffer.from(f.data, 'base64')));
    });
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 95,
      maxWidth: VIEWPORT.width,
      maxHeight: VIEWPORT.height,
      everyNthFrame: 1,
    });
    await page.waitForTimeout(600);

    const beats = site.beats.map((b) => (b.until && site.fallbackClick ? { ...b, fallbackClick: site.fallbackClick } : b));
    const timeline = await page.evaluate(choreograph, beats);
    await page.waitForTimeout(400);
    await cdp.send('Page.stopScreencast');
    await Promise.all(writes);
    return { frames, timeline, palette };
  } finally {
    await browser.close();
  }
}

// Cuts the take into 30 fps on the choreography clock. For each output frame,
// find the last rAF tick at or before that moment, then the newest screencast
// frame presented before the next tick could land (frames arrive ~1 vsync after
// their rAF). Chrome only emits frames when something changed, so holding the
// previous one is exact. When Chrome's pipeline runs a frame deeper (heavy
// sections), that frame still shows the previous tick's scroll; then take the
// next frame that shows the scroll the clock asked for, using the offset Chrome
// reports with every frame, so the glide never steps unevenly.
function pickFrames(frames, ticks) {
  const duration = ticks.at(-1).c / 1000;
  const n = 2 * Math.round((duration * FPS) / 2); // even, so the 15 fps floor cut divides it exactly
  const picks = [];
  let i = 0, j = 0, last = 0;
  for (let k = 0; k < n; k++) {
    const c = (k * 1000) / FPS;
    while (i + 1 < ticks.length && ticks[i + 1].c <= c + 0.5) i++;
    const bound = (i + 1 < ticks.length ? ticks[i + 1].r : ticks[i].r + 1000 / 60) + 10;
    while (j + 1 < frames.length && frames[j + 1].ts <= bound) j++;
    let pick = j;
    if (frames[j].y !== ticks[i].y) {
      for (let q = j + 1; q < frames.length && frames[q].ts <= bound + 70; q++) {
        if (frames[q].y === ticks[i].y) { pick = q; break; }
      }
    }
    last = Math.max(last, pick);
    picks.push(frames[last]);
  }
  return { picks, duration: n / FPS };
}

// Judder check, against the scroll offset Chrome reports for each frame: inside a
// glide every output frame should show the scroll position the clock asked for.
function cadenceReport(frames, picks, timeline) {
  const { ticks, marks } = timeline;
  let i = 0, glideFrames = 0, off = 0, worst = 0;
  for (let k = 0; k < picks.length; k++) {
    const c = (k * 1000) / FPS;
    while (i + 1 < ticks.length && ticks[i + 1].c <= c + 0.5) i++;
    if (!marks.some((m) => m.kind === 'glide' && c > m.at * 1000 && c < m.end * 1000)) continue;
    glideFrames++;
    const prev = k ? ticks.findLast((t) => t.c <= c - 1000 / FPS + 0.5)?.y ?? ticks[i].y : ticks[i].y;
    const miss = Math.abs(picks[k].y - ticks[i].y);
    worst = Math.max(worst, miss);
    if (miss > Math.max(2, Math.abs(ticks[i].y - prev) / 2)) off++;
  }
  const r0 = ticks[0].r, r1 = ticks.at(-1).r;
  const inside = frames.filter((f) => f.ts >= r0 && f.ts <= r1 + 20).length;
  return `${inside} source frames in ${((r1 - r0) / 1000).toFixed(1)} s real time, clock held ${timeline.waits} ticks; ` +
    `glides: ${glideFrames} output frames, ${off} off-position (worst ${worst} px)`;
}

// xfade runs P from 1 (first input) to 0 (second). A dip goes A → colour → B.
function xfadeTransition(through) {
  if (!through) return 'transition=fade';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(through.slice(i, i + 2), 16));
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; // BT.709, limited range
  const Y = Math.round(16 + (219 * y) / 255);
  const U = Math.round(128 + (224 * ((b - y) / 1.8556)) / 255);
  const V = Math.round(128 + (224 * ((r - y) / 1.5748)) / 255);
  const C = `if(eq(PLANE\\,0)\\,${Y}\\,if(eq(PLANE\\,1)\\,${U}\\,${V}))`;
  return `transition=custom:expr='if(gt(P\\,0.5)\\,A*(2*P-1)+${C}*(2-2*P)\\,B*(1-2*P)+${C}*(2*P))'`;
}

async function encodeMain(picks, duration, site, outFile) {
  const fade = site.loop?.fade || 0;
  // Chrome's JPEGs are full-range BT.601; the video is limited-range BT.709, tagged.
  const colour = 'scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=yuv420p';
  const tag = 'setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709';
  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-'];
  let filter;
  if (fade) {
    args.push('-loop', '1', '-framerate', String(FPS), '-t', String(fade + 0.5), '-i', picks[0].file);
    filter =
      `[0:v]${colour},settb=1/${FPS},setpts=N/${FPS}/TB[a];` +
      `[1:v]${colour},settb=1/${FPS},setpts=N/${FPS}/TB[b];` +
      `[a][b]xfade=${xfadeTransition(site.loop.through)}:duration=${fade}:offset=${(duration - fade).toFixed(4)},trim=duration=${duration.toFixed(4)},${tag}[v]`;
  } else {
    filter = `[0:v]${colour},${tag}[v]`;
  }
  args.push(
    '-filter_complex', filter, '-map', '[v]', '-an',
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', String(site.crf ?? 24),
    '-r', String(FPS), '-fps_mode', 'cfr',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', outFile,
  );
  const ff = spawn(FFMPEG, args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
  const cache = new Map();
  for (const f of picks) {
    let buf = cache.get(f.file);
    if (!buf) { cache.clear(); buf = fs.readFileSync(f.file); cache.set(f.file, buf); }
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
}

function encodeFloor(mainFile, outFile, seconds) {
  const args = ['-y', '-loglevel', 'error', '-i', mainFile];
  if (seconds) args.push('-t', String(seconds));
  args.push(
    '-vf', `fps=${FLOOR.fps},scale=${FLOOR.width}:${FLOOR.height}:flags=lanczos+accurate_rnd,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709`, '-an',
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', String(FLOOR.crf),
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', outFile,
  );
  run(FFMPEG, args);
}

function writePoster(firstFrame, outFile) {
  if (process.platform === 'darwin') {
    run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', firstFrame, '--out', outFile]);
  } else {
    run(FFMPEG, ['-y', '-loglevel', 'error', '-i', firstFrame, '-q:v', '4', outFile]);
  }
}

// First frame, the middle of every hold, last frame: what a viewer actually reads.
function contactSheet(file, duration, marks, outPng) {
  const times = [0, ...marks.filter((m) => m.kind === 'hold' || m.kind === 'until').map((m) => (m.at + m.end) / 2), duration - 0.1];
  const dir = path.dirname(outPng);
  times.forEach((t, i) => {
    const tile = path.join(dir, `sheet-${i}.png`);
    run(FFMPEG, ['-y', '-loglevel', 'error', '-ss', Math.max(0, t).toFixed(3), '-i', file, '-frames:v', '1', '-vf', 'scale=640:-2', tile]);
  });
  const cols = 4, rows = Math.ceil(times.length / cols);
  run(FFMPEG, ['-y', '-loglevel', 'error', '-i', path.join(dir, 'sheet-%d.png'), '-vf', `tile=${cols}x${rows}:padding=6:color=white`, '-frames:v', '1', outPng]);
  times.forEach((_, i) => fs.rmSync(path.join(dir, `sheet-${i}.png`), { force: true }));
}

function probe(file) {
  const j = JSON.parse(run(FFPROBE, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
  const v = j.streams.find((s) => s.codec_type === 'video');
  const audio = j.streams.some((s) => s.codec_type === 'audio');
  return `${v.codec_name}/${v.profile} ${v.width}x${v.height} ${v.r_frame_rate} ${Number(j.format.duration).toFixed(2)}s ` +
    `${(Number(j.format.size) / 1024).toFixed(0)} KB${audio ? ' AUDIO!' : ''}`;
}

async function captureSite(site) {
  const work = path.join(TMP_ROOT, site.id);
  const frameDir = path.join(work, 'frames');
  const outDir = path.join(OUT_ROOT, site.id);
  fs.mkdirSync(outDir, { recursive: true });

  let frames, timeline, palette;
  const saved = path.join(work, 'timeline.json');
  if (REUSE && fs.existsSync(saved) && fs.existsSync(frameDir)) {
    // Re-cut and re-encode a kept take (after --keep-frames) without recording again.
    log(site.id, 're-encoding the kept take in', work);
    ({ timeline } = JSON.parse(fs.readFileSync(saved, 'utf8')));
    frames = JSON.parse(fs.readFileSync(saved, 'utf8')).frames.map(([ts, y], i) => ({
      ts, y, file: path.join(frameDir, `${String(i).padStart(5, '0')}.jpg`),
    }));
  } else {
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(frameDir, { recursive: true });
    log(site.id, 'recording', site.url);
    ({ frames, timeline, palette } = await record(site, frameDir));
    fs.writeFileSync(saved, JSON.stringify({ timeline, frames: frames.map((f) => [f.ts, f.y]) }));
  }
  const { picks, duration } = pickFrames(frames, timeline.ticks);
  log(site.id, cadenceReport(frames, picks, timeline));
  for (const m of timeline.marks) log(site.id, `  ${m.at.toFixed(2)}–${m.end.toFixed(2)}s  ${m.kind.padEnd(5)} ${JSON.stringify(m.beat)}  → y=${m.y}`);
  if (timeline.stalls.length) log(site.id, 'stalls cut from the clock:', timeline.stalls.map((x) => `${x.at}s ${x.ms}ms`).join(', '));
  if (palette) log(site.id, 'palette', palette);

  const main = path.join(outDir, 'site.mp4');
  await encodeMain(picks, duration, site, main);
  let crf = site.crf ?? 24;
  while (fs.statSync(main).size > MAIN_MAX_BYTES && crf < 30) {
    crf += 1;
    log(site.id, `over ${MAIN_MAX_BYTES / 1048576} MB, re-encoding at CRF ${crf}`);
    await encodeMain(picks, duration, { ...site, crf }, main);
  }
  writePoster(picks[0].file, path.join(outDir, 'site.jpg'));

  const floor = path.join(outDir, 'site-floor.mp4');
  encodeFloor(main, floor);
  if (fs.statSync(floor).size > FLOOR.maxBytes) {
    log(site.id, `floor loop over ${FLOOR.maxBytes / 1024} KB, keeping the first ${FLOOR.fallbackSeconds}s`);
    encodeFloor(main, floor, FLOOR.fallbackSeconds);
  }

  log(site.id, 'site.mp4       ', probe(main));
  log(site.id, 'site-floor.mp4 ', probe(floor));
  log(site.id, 'site.jpg        ', `${(fs.statSync(path.join(outDir, 'site.jpg')).size / 1024).toFixed(0)} KB`);
  contactSheet(main, duration, timeline.marks, path.join(work, 'contact.png'));
  log(site.id, 'contact sheet  ', path.join(work, 'contact.png'));
  if (!KEEP) fs.rmSync(frameDir, { recursive: true, force: true });
}

const KEEP = process.argv.includes('--keep-frames') || process.argv.includes('--reuse');
const REUSE = process.argv.includes('--reuse');
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const sites = wanted.length ? SITES.filter((s) => wanted.includes(s.id)) : SITES;
if (wanted.length && sites.length !== wanted.length) {
  console.error('unknown site id; known:', SITES.map((s) => s.id).join(', '));
  process.exit(1);
}
for (const site of sites) await captureSite(site);
