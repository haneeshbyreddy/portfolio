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
- **Establishing shot.** Any frontal shot that keeps the treeline in frame leaves a band of meadow between the headline and the back row; the cloud shade (`cloudGLSL` in `src/world/shared.ts`) darkens it so it recedes. Tune the framing in `framingFor()` in `CameraRig.ts` (lens, `elFar`, `yFar`, and how much of the front row fills the width), or the light with `shared.uCloud`.
- **Vacant desk power-down.** The single hi-res canvas is shared, so when you leave an empty desk its screen briefly shows the next desk's content during the 0.35s power-off.
- **Mobile.** In portrait the establishing shot rises to a plan view so all five working desks stay in frame. They're small at phone width (a desk is about 50 pt), so pinch to get closer. The focus sheet is tall.

## Not verified yet

- Video on iOS Safari: the floor loops autoplay muted and inline, the full files are drawn into canvas textures, and the case study borrows the same `<video>`. Check that all of these play on a real iPhone, and that sound comes up when you open a case study.
- Media weight: about 30 MB of video across the five projects, loaded per desk (floor loops ~2 MB up front). Watch the first visit to a desk on a slow connection; the title card shows until the footage arrives.

- Frame rate on real hardware. I only measured about 3.9M triangles and about 150 draw calls per frame, and I tested in a throttled preview pane. Test on an integrated GPU laptop and on a phone. Quality tiers live in `src/core/quality.ts`; force one with `?q=low|medium|high`.
- Sound on a real iPhone: iOS ignores a video's volume, so there the films route through the Web Audio mixer (`Ambience.route`). Check their level and lip sync, and that the score starts on the first tap.
- Bundle size is 911 KB (282 KB gzipped). Lazy-loading postprocessing and n8ao would shave the first load.

## The new art direction (2026-10-20)

- **Score.** You picked the fourth take of the ElevenLabs flow (four minutes, stereo). The site plays bars 8–86 of it (24.54 s to 237.27 s, 3 min 33 s) with a 0.3 s crossfade into the start, as AAC at 160 kbps (4.4 MB, streamed). Browsers may leave a hairline gap at the loop point once every three and a half minutes.
- **Opening on real devices.** Check the cold open on a phone: the sentence beats, the fog colour matching the first rendered frame, and the lift's frame rate while the fog is dense.
- **Newsreader.** The italic adds about 147 KB (latin). Subset it if the first load needs to be lighter.

## Ideas parked

- Each new project gets a "new hire" moment: a figure walks across the lawn to its desk.
- Small name plaques on the desks.
- Weather or time-of-day variants for the sky.

## The 5 × 4 floor (2026-10-20)

- **Grid.** 5 columns × 4 rows at 2.55 m × 3.0 m, down from 7 × 4 at 2.9 × 3.3. The five projects fill the front row; fifteen empty desks stand behind.
- **Shot.** A frontal tableau (Tati's *Playtime*, Gursky's rows, the Severance one-sheet). On wide screens it's a standing view from the edge of the floor on a ~35 mm lens (37° vertical), with the front row filling about 85% of the width. The distance comes from fitting both the width and the bottom edge, so 16:9 and ultrawide don't crop the chairs. On a phone, the shot rises to a plan view (about 43°, 40° lens).
- **Light.** The meadow and hills lie under a thin cloud deck, with heavier patches drifting through on the wind. The office stands in a break, so the floor is the brightest thing in frame (`cloudGLSL`, also patched into the tree material).
- **Lawn.** Mown to the floor plan: darker turf under each column and a light stripe down every aisle (`stripe()` in `shared.ts` reads `GRID`). Blade roots shade toward the turf instead of the soil, so the lawn reads as velvet rather than speckle.

## The camp (2026-10-21)

You shared a Gemini frame (desks scattered in long grass, beanbags, a parasol, dogs, bikes,
cords) and asked for that vibe, "everybody in their comfort zone, cool startup vibe", made
better rather than copied.

- **Concept.** A studio that carried its desks out into a field: *Le Déjeuner sur l'herbe* /
  Seurat's *Grande Jatte* rather than Severance. One rule dresses the set: everything was
  carried out by someone, and everything electric runs off one orange cord, from behind the
  camera along the path everyone walked in on, to a reel, to strips, to every desk.
- **Plan.** The grid is gone. The five projects keep a readable line, left to right in roster
  order, but loose: each desk at its own angle and depth, all facing the valley
  (`LINE` in `src/office/layout.ts`). Five empty desks stand behind (`OPEN`), so the hero line is
  now "Five at work. Five waiting for *yours*." Everything else is hand-placed in
  `src/camp/plan.ts`.
- **Ground.** You asked to "clean up intentionally where they're sitting and hanging out". A first try
  mowed a separate room round each desk with corridors between; you didn't like the look, so the
  whole camp now stands on one floor mown out of the meadow (the convex hull of everything set up,
  plus a margin round each thing, blurred into a loose outline), with a band of rough at the edge
  and a mown footpath in from behind the camera along the cord. A painted marks texture
  (`GroundMarks`, `src/camp/Ground.ts`: shade, trodden, covered, mown) drives the grass and the
  terrain; the lawn has a faint mottle and mowing stripes (`lawnGLSL` in `src/world/shared.ts`).
- **People.** Casual wardrobe (knits, hoodies with hoods, overshirts over tees, tees with bare
  forearms, denim, white sneakers; some bucket hats, backwards caps, beanies). New postures for
  people off duty: camp chair, beanbag, cross-legged on the ground; pastimes: laptop, book, phone,
  talk, rest, kite. At desks, a fourth way of sitting (ankle on the knee).
- **Life.** Dogs (sculpted, skinned; they breathe, wag, flick an ear and look at your cursor),
  a paper kite flown from a beanbag on the same wind as the grass, butterflies.
- **Shot.** Re-derived: a 43° lens from a little above, fitted so the working line fills the width
  and sits in the lower half, the empty desks and lounge climbing behind it toward the headline,
  the treeline still in frame. The opening now starts on the way-in path: the cord snakes away
  through the long grass toward a camp on the horizon, the kite above it.

### Still open
- Off-duty figures aren't clickable. The one out front on the beanbag could become *you*:
  click them for About.
- The kite and butterflies are deterministic loops, so they don't react to the cursor.
