# Refinement backlog

Where the mock stands after the first build (commit `7419661`, 2026-10-19), and what to pick up next.

## Needs your input first

- **Real projects.** All seven entries in `src/data/projects.ts` are invented placeholders.
- **Identity.** In `src/config/site.ts`, the name ("Haneesh Byreddy") was guessed from your email handle, the email is `hello@yourdomain.com`, and the social links are `#`.
- **Real previews.** Every monitor program is procedural. For real work, add a program that `drawImage`s your screenshots or video into the canvas (see README → "Using real work on the screens").
- **Case-study numbers.** The stats in `statsFor()` in `src/ui/UI.ts` are placeholders for each discipline.

## Known rough edges

- **Trees.** Up close, the forest edge still reads as rounded "lollipop" canopies. Options: more varied canopy shapes, billboard impostors, or a denser, darker edge.
- **Figures up close.** The short hairstyle looks like a bowl cut from behind, and the hands are blocky mittens. The heads are faceless on purpose.
- **Lawn.** At the over-shoulder distance, the mown blades look like sparse tufts. Raise the density around the desks, or make the blades finer.
- **Establishing shot.** The sky band is narrow and the far mountains are faint. Tune the camera in `CameraRig.ts` (`elevation`, `radius`, `center`), the fog density in `World.ts`, or the mountain height in `Terrain.ts`.
- **Vacant desk power-down.** The single hi-res canvas is shared, so when you leave an empty desk its screen briefly shows the next desk's content during the 0.35s power-off.
- **Mobile.** In portrait, the outer desk columns are cropped in the overview, and the focus sheet is tall.

## Not verified yet

- Frame rate on real hardware. I only measured about 3.9M triangles and about 150 draw calls per frame, and I tested in a throttled preview pane. Test on an integrated GPU laptop and on a phone. Quality tiers live in `src/core/quality.ts`; force one with `?q=low|medium|high`.
- Procedural sound on Safari and iOS.
- Bundle size is 911 KB (282 KB gzipped). Lazy-loading postprocessing and n8ao would shave the first load.

## Ideas parked

- Each new project gets a "new hire" moment: a figure walks across the lawn to its desk.
- Small name plaques on the desks.
- Weather or time-of-day variants for the sky.
