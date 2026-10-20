# Fieldwork

An office in an open field. Every desk is a project.

A 3D portfolio built from the Severance one-sheet (order: even rows of white desks,
cream terminals) dropped into an overcast meadow (wind, hills, haze). Projects
are people at desks; empty desks stand bare as open invitations.
Click a desk and the camera leans over the worker's shoulder onto their monitor,
which plays a live preview of the work. Visit an empty one and its terminal boots.

Each desk carries everything its project shipped, on the thing it plays on: a
website loops on the terminal as a real screen recording, a film plays on the same
tube like a tape (letterboxed, with the deck's PLAY readout, and the worker sits
back to watch), and a vertical reel lives on the worker's cream handset. Pick the
reel and they lift the phone over their shoulder to show you while the camera
leans in. The case study then opens the piece in its true shape: a browser
window, a 16:9 player, or the same handset, with sound.

The world itself is procedural: geometry, people and the meadow's sound are
generated in code. The only files are each project's media in `public/work/` and
the score in `public/audio/`.

## Art direction

The site is set like the titles of a short film (after Gawx's): a grotesk for
what things are, an italic serif for the one word in each line that carries the
feeling, and a monospace for the slate (desk numbers, durations, credits). Mark
the serif word in copy with `*asterisks*`. Headlines are set tight and large; the
slate sits above them in small capitals. There is no pure black or
white: graphite `#1b1c1a` and ash `#efeee9` are the ends of the scale, and every
surface carries grain.

- **Wordmark.** "Field" in Inter Tight, "*work*" in Newsreader Italic, then a full
  stop: the place and the craft. The monogram is the F with the italic w tucked
  under its arm. Both are drawn as paths by `scripts/brand/wordmark.py`, which
  writes `src/ui/brand.ts` and `public/favicon.svg`.
- **Surfaces.** Type sits straight on the picture, lit by a shadow. What you read
  is paper (a desk's file card, the index); what you watch is film (the case study).
- **The opening** (`src/ui/Opening.ts`). The page starts in the meadow's own fog.
  While the floor loads, three sentences cut in on the line where the horizon will
  appear, then the title card holds, the fog lifts in depth order and the camera
  cranes up out of the grass. A second visit in a session goes straight to the title,
  and a click skips ahead.
- **Sound.** An original boom-bap instrumental (`public/audio/score.m4a`: 78 bars at 88 BPM, cut on bar lines with a crossfade so it comes round without a seam, streamed) under the wind. It
  is muffled in the fog and opens as it lifts, and steps back when a film or reel speaks.

## Run

```bash
npm install
npm run dev
```

```bash
npm run build
```

Add `?q=low`, `?q=medium` or `?q=high` to the URL to force a quality tier.

## Add a project

Edit `src/data/projects.ts`. Each entry hires one person. The projects sit side by side
along the front row, centred, in list order from left to right; past five they carry
on one row back (`fillOrder` in `src/office/layout.ts`).

| Field        | What it drives                                                   |
| ------------ | ---------------------------------------------------------------- |
| `media`      | Everything the project shipped, in order; the first is what the desk shows on arrival |
| `kind`       | What shipped, in a few words ("Website and launch reel")          |
| `palette`    | Its title cards on the monitor while the footage loads            |
| `facts`      | Three numbers from the work itself, shown big in the case study   |
| `id`         | Its folder in `public/work/`, and the seed for the worker's look  |

### Media

Each piece of media plays on a device on the desk:

| `kind` | Plays on                       | Files in `public/work/<id>/`                       |
| ------ | ------------------------------ | -------------------------------------------------- |
| `site` | The terminal, in a browser frame | `site.mp4` (1280×906 recording), `site-floor.mp4`, `site.jpg` |
| `film` | The terminal, letterboxed like a tape | `film.mp4` (16:9, with sound), `film-floor.mp4`, `film.jpg` |
| `reel` | The worker's phone             | `reel.mp4` (9:16, with sound), `reel-floor.mp4`, `reel.jpg` |

`*-floor.mp4` is a small silent loop for distant monitors (about 400 px wide, 12–15 fps);
the full file loads when someone sits down at the desk. A desk with a reel gets the
phone and its stand automatically.

Website recordings are made by `npm run capture` (`scripts/capture/`): headless Chrome
scrolls each site through a set of beats and the frames are encoded with ffmpeg.
Re-run it whenever a site changes. Films and reels are encoded by hand, for example:

```bash
ffmpeg -i film.mov -vf scale=1280:720 -c:v libx264 -crf 27 -preset slow -c:a aac -b:a 128k -movflags +faststart film.mp4
```

```bash
ffmpeg -i film.mov -vf scale=384:216,fps=12 -c:v libx264 -crf 31 -an -movflags +faststart film-floor.mp4
```

Need more desks? Change `GRID` in `src/office/layout.ts`. The lawn, its mowing stripes,
contact shadows, hit areas and the establishing shot's framing follow.

## Personalise

- `src/config/site.ts` — name, title, headline, email, links, about copy.
- `src/world/palette.ts` — every colour in the world.
- `src/core/CameraRig.ts` — the three shots (intro crane, establishing, over-the-shoulder), and how the overview frames and limits itself (`framingFor`, `ROAM`, `AZ_MAX`, `TILT`).

## Controls

| Input                                   | On the floor                                       | At a desk                        |
| --------------------------------------- | -------------------------------------------------- | -------------------------------- |
| Drag                                    | Slide the floor (zoom in to roam further)          | Look around                      |
| Scroll / pinch                          | Zoom toward the cursor; keep going on a desk to sit in | Zoom out to go back to the floor |
| Right-drag / two-finger twist / `Q` `E` | Turn around the floor                              |                                  |
| Click / tap a desk                      | Lean over that shoulder                            | Hop to that desk                 |
| Click the phone or terminal             |                                                    | Show what's on it                |
| `1`–`9`                                 |                                                    | Switch between the desk's media  |
| Double-click the lawn                   | Step in toward that spot                           |                                  |
| Arrows / `WASD`, `+` `−`                | Slide, zoom                                        | `←` `→` walk to the previous / next desk |
| `Esc` / `0`                             | Reset the view                                     | Back to the floor                |
| `I`                                     | Index of all projects                              | Index of all projects            |

In the case study, `Space` plays and pauses a film or reel, `←` `→` skip five seconds,
and the numbers switch media there too.

## Map

```
src/
  core/        renderer, camera rig (shift lens) + controls, quality tiers, math, glsl
  world/       sky, terrain, grass (wind + cursor), trees, pollen + birds
  office/      floor plan, instanced furniture, phones, workers (IK + behaviours)
  screens/     CRT + phone screens, the media library, programs (site, tape, reel, vacant)
  ui/          the opening, wordmark, file card + media list, case study player, index, adaptive pointer, sound
  data/        projects
  config/      site copy
```
