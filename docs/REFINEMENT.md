# Refinement backlog

Where the mock stands after the first build (commit `7419661`, 2026-10-19), and what to pick up next.

## Needs your input first

- **Project details.** The five real projects (Hyderabaddies, HansaNet, Ayuja, R-Bot, Printed Faces) are in `src/data/projects.ts`, written from the live sites and the Ayuja production notes. Check the roles, stacks, years (all 2026) and the three `facts` on each. The order on the floor is a guess: Hyderabaddies gets the best desk because it shows off the phone.
- **HansaNet film.** Not made yet. When it exists, add a `film` entry to HansaNet's `media` with files in `public/work/hansanet/`, and its terminal changes channel between the site and the film.
- **Identity.** In `src/config/site.ts`, the name ("Haneesh Byreddy") was guessed from your email handle, the email is `hello@yourdomain.com`, and the social links are `#`.

## Known rough edges

- **Trees.** Up close, the forest edge still reads as rounded "lollipop" canopies. Options: more varied canopy shapes, billboard impostors, or a denser, darker edge.
- **Figures up close.** The short hairstyle looks like a bowl cut from behind, and the hands are blocky mittens. The heads are faceless on purpose.
- **Lawn.** At the over-shoulder distance, the mown blades look like sparse tufts. Raise the density around the desks, or make the blades finer.
- **Establishing shot.** The sky band is narrow and the far mountains are faint. Tune the overview framing in `framingFor()` in `CameraRig.ts` (`far`, `elFar`, `yFar`), the fog density in `World.ts`, or the mountain height in `Terrain.ts`.
- **Vacant desk power-down.** The single hi-res canvas is shared, so when you leave an empty desk its screen briefly shows the next desk's content during the 0.35s power-off.
- **Mobile.** In portrait, the floor is a narrow band across the middle of a tall frame, the outer columns are half cropped (drag or pinch to reach them), and the focus sheet is tall.

## Not verified yet

- Video on iOS Safari: the floor loops autoplay muted and inline, the full files are drawn into canvas textures, and the case study borrows the same `<video>`. Check that all of these play on a real iPhone, and that sound comes up when you open a case study.
- Media weight: about 30 MB of video across the five projects, loaded per desk (floor loops ~2 MB up front). Watch the first visit to a desk on a slow connection; the title card shows until the footage arrives.

- Frame rate on real hardware. I only measured about 3.9M triangles and about 150 draw calls per frame, and I tested in a throttled preview pane. Test on an integrated GPU laptop and on a phone. Quality tiers live in `src/core/quality.ts`; force one with `?q=low|medium|high`.
- Procedural sound on Safari and iOS.
- Bundle size is 911 KB (282 KB gzipped). Lazy-loading postprocessing and n8ao would shave the first load.

## The new art direction (2026-10-20)

- **Score.** You picked the fourth take of the ElevenLabs flow (four minutes, stereo). The site plays bars 8–86 of it (24.54 s to 237.27 s, 3 min 33 s) with a 0.3 s crossfade into the start, as AAC at 160 kbps (4.4 MB, streamed). Browsers may leave a hairline gap at the loop point once every three and a half minutes.
- **Opening on real devices.** Check the cold open on a phone: the sentence beats, the fog colour matching the first rendered frame, and the lift's frame rate while the fog is dense.
- **Newsreader.** The italic adds about 147 KB (latin). Subset it if the first load needs to be lighter.

## Ideas parked

- Each new project gets a "new hire" moment: a figure walks across the lawn to its desk.
- Small name plaques on the desks.
- Weather or time-of-day variants for the sky.
