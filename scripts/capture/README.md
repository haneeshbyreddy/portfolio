# Site captures

Screen recordings of the live project sites, played on the desk CRTs and in the
case-study view.

```bash
npx playwright install chromium   # once
npm run capture                   # every site
npm run capture -- rbot faces     # just these ids
```

Each site writes to `public/work/<id>/`:

| File             | What it is                                                                 |
| ---------------- | -------------------------------------------------------------------------- |
| `site.mp4`       | 1280×906 CSS px at DPR 1, 30 fps CFR, H.264 High, yuv420p BT.709, no audio, faststart, ≤ 6 MB |
| `site-floor.mp4` | The same loop at 400×284, 15 fps, CRF 30, ≤ 450 KB, for distant monitors   |
| `site.jpg`       | Frame 1 of `site.mp4` (the hero), JPEG q82                                 |

Needs `ffmpeg`/`ffprobe` on `PATH` (or `FFMPEG`/`FFPROBE`). Frames go to
`$CAPTURE_TMP` (default `$TMPDIR/fieldwork-capture/<id>/`), never into the repo;
that folder also gets `contact.png` (first frame, the middle of every hold, last
frame) and `timeline.json`.

Flags: `--keep-frames` keeps the JPEG frames; `--reuse` re-cuts and re-encodes a
kept take without recording again (for trying CRF or loop settings).

## How a take stays faithful

- Chrome (Playwright's `chromium`, new headless, GPU on) streams every compositor
  frame through CDP `Page.startScreencast` as JPEG q95 with its timestamp and
  scroll offset. Nothing is screenshotted frame by frame, so page animations run
  at their real speed.
- The scroll is driven from inside the page on `requestAnimationFrame`
  (`choreograph()`), ease-in-out cubic for glides, a constant-speed "cruise" for
  R-Bot's scroll-scrubbed story. No wheel events, no pointer, scrollbars hidden.
- The choreography keeps its own clock. It follows real time except when the
  site hitches: a main-thread stall only advances it 25 ms, and a scroll position
  that hasn't reached the screen within 60 ms (Chrome rasterising) pauses it. The
  video is cut on that clock, so a hitch costs a few milliseconds of page
  animation instead of a freeze followed by a lurch in the scroll.
- `pickFrames()` takes, for each 1/30 s, the newest frame on screen, matching the
  scroll offset Chrome reports for it. The log prints how many glide frames were
  off position (should be 0) and which stalls were cut.

## Choreography

Each entry in `SITES` (in `capture-sites.mjs`) is a list of beats:

```js
{ hold: 2.5 }                                  // stay put
{ to: '#pricing', offset: -118, dur: 1.4 }     // glide so the element sits 118 px higher
{ to: 3900, dur: 3.0, ease: 'cruise' }         // glide to a scroll position
{ until: "expr", timeout: 14 }                 // wait for the page to do something itself
{ holdTo: 20.4 }                               // stay until the video is 20.4 s long
```

Every take opens on the hero, glides through four or five sections with a 2–3 s
hold on each, and ends back on the hero so the loop closes. Where the end can't
glide back (Hyderabaddies' one-way poster, R-Bot's 40,000 px story), `loop.fade`
dips through the site's own background colour into frame 1.

Per-site options: `colorScheme`, `settle` (seconds after load before the take),
`prewarm` (scroll down and back first: `true` or a pixel depth), `prepare(page)`
(dismiss a coach mark), `crf` (raised automatically until `site.mp4` fits 6 MB).
