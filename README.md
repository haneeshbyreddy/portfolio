# Fieldwork

An office in an open field. Every desk is a project.

A 3D portfolio built from the Severance one-sheet (order: cubicles, ink partitions,
cream terminals) dropped into an overcast meadow (wind, hills, haze). Projects
are people at desks; empty desks are open invitations. Click a desk and the
camera leans over the worker's shoulder onto their monitor, which plays a live
preview of the work.

Everything is procedural — no models, photos or video files. Geometry, people,
monitor content and sound are all generated in code.

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

Edit `src/data/projects.ts`. Each entry hires one person and fills the next desk in
`FILL_ORDER` (`src/office/layout.ts`); front-facing desks fill first.

| Field        | What it drives                                                  |
| ------------ | --------------------------------------------------------------- |
| `discipline` | Which monitor program plays: `landing`, `saas`, `film`, `brand`, `app` |
| `palette`    | The project's colours on its screen and the panel accent        |
| `tagline`    | The hero line / title card on the screen                        |
| `id`         | Seeds the worker's look and behaviour, so each one is stable    |
| `url`        | Optional "Live site" / "Visit project" link                     |

Need more desks? Add a pod to `PODS` in `src/office/layout.ts` and append its four
quadrants to `FILL_ORDER`. The lawn, contact shadows and hit areas follow.

### Using real work on the screens

Monitor content is drawn into a canvas each frame (`src/screens/programs/*`, authored
in a virtual 800×600 space). To show real work, add a program that draws an
`HTMLImageElement` or `HTMLVideoElement` into the canvas with `ctx.drawImage` — the
CRT shader, bloom and the "Open case study" pop-out all keep working.

## Personalise

- `src/config/site.ts` — name, wordmark split, email, links, credits, about copy.
- `src/world/palette.ts` — every colour in the world.
- `src/core/CameraRig.ts` — the three shots (intro crane, establishing, over-the-shoulder).

## Controls

| Input                 | Action                       |
| --------------------- | ---------------------------- |
| Drag / scroll         | Look around the floor / zoom |
| Click a desk          | Lean over that shoulder      |
| `←` `→`               | Walk to the previous / next desk |
| `Esc`                 | Back to the floor            |
| `I`                   | Index of all projects        |

## Map

```
src/
  core/        renderer, camera rig (shift lens), quality tiers, math, glsl
  world/       sky, terrain, grass (wind + cursor), trees, pollen + birds
  office/      floor plan, instanced furniture, workers (IK + behaviours)
  screens/     CRT material + the five preview programs + vacant terminal
  ui/          one-sheet HUD, panel, case study, index, cursor, procedural sound
  data/        projects
  config/      site copy
```
