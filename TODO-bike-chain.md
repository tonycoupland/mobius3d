# Bike-chain style — implementation plan

Goal: a new geometry style where the ring is built from repeating
pin/bearing/link assemblies (like a roller chain) instead of a single swept
cross-section, but still forms a closed loop that twists as it goes around
and rejoins itself at the start — the same Möbius-style closing-seam idea
used by the existing styles, applied to a discrete chain instead of a
continuous strip.

This file is the working plan — edit it directly with corrections/questions
as we iterate.

## Vocabulary

- **pin** — the small axle at each repeating position around the ring;
  everything else attaches to it.
- **bearing / barrel** — a cylindrical sleeve around each pin that the links'
  end-loops fit over (like a chain roller/bushing).
- **link** — a figure-eight-shaped plate with two circular end-loops, each
  end-loop fitting around one bearing, connecting that pin to a *neighbouring*
  pin.
- **link count** (`linkCount`) — number of pin/bearing stations around the
  loop. New, independent control (see Decision 3).

## Decisions

1. Four links meet at each bearing: two whose other end goes to the previous
   pin, two whose other end goes to the next pin.
2. Links alternate like a real roller chain: a narrower "inner" pair and a
   wider "outer" pair, link-to-link around the loop.
3. `linkCount` is a new, independent control, not tied to the existing
   "Smoothness" (`segments`) input.
   **Revised after Phase 3 review**: originally `segments` was hidden for
   chain (it has no sweep to resolve), which needed a small
   `irrelevantCommonControlIds` generalization of the control-visibility
   mechanism. Once the chain style had round pins/bearings/links, though,
   `segments` turned out to have a perfectly good meaning after all — it's
   now reused as the *radial* segment count for those round parts (how
   many sides approximate the circle), wired straight into
   `createChainGeometry`'s `radialSegments`. The `irrelevantCommonControlIds`
   mechanism was removed again since no style needs it anymore; the "loads
   of chain-only controls clutter every other style" problem it was
   partly aimed at is instead solved by grouping all of chain's *owned*
   controls into their own hideable "Bike Chain" section (see Phase 4).
4. Twist reuses the existing "Twist (sides)" control. Working out the units:
   in [modules/mobius.js](modules/mobius.js):107-140, the *existing* styles
   have two separate counts — `segments` (sweep resolution, e.g. 36) and
   `pointsPerPoly` (the cross-section's own rotational symmetry, e.g. 6 for a
   hexagon). Total twist over one lap is
   `twists * (360 / pointsPerPoly)` degrees, reached at `t = i / segments`
   fraction of the way around, and the closing seam reconnects with an index
   offset of `twists` (mod `pointsPerPoly`) — which is why an odd half-twist
   creates a genuine Möbius join while a multiple of `pointsPerPoly` closes up
   as a plain torus.
   For chain, each station *is* both the placement point and the discrete
   symmetry unit — there's no finer sweep resolution underneath it. So the
   same formula applies with `segments = pointsPerPoly = linkCount`: total
   twist over one lap is `twists * (360 / linkCount)` degrees, station `i`'s
   twist is `(i / linkCount) * that total`, and the closing link (last pin
   back to pin 0) uses an offset of `twists mod linkCount` stations — `twists`
   a multiple of `linkCount` closes as an untwisted loop, `twists =
   linkCount / 2` gives a true half-twist Möbius join, etc. `twistScale` for
   the chain style descriptor is therefore `1`, same as `polygonStyle`.
   **Revised after Phase 1 review**: rejected — a symmetric pin can't visibly
   distinguish twist amounts that are multiples of 180°, which made
   `twists = linkCount / 2` (a 180° total twist under the formula above)
   read as "one full visual twist," and the per-`linkCount` scaling meant
   the same `twists` value looked different depending on link count. Twist
   is now fully decoupled from `linkCount`, computed directly in
   [modules/chain.js](modules/chain.js)'s `createPinTransforms` rather than
   through `twistScale`.
   **Revised again**: `twists * 360` was still wrong — `twists` needed to
   count *half*-turns, since odd half-twists are what produce the actual
   Möbius join (an even number of half-twists closes as a plain, untwisted
   torus). Total twist over one lap is now `twists * 180` degrees:
   `twists = 1` is a 180° half twist, `twists = 2` is a 360° full twist
   (which looks the same as untwisted, as expected), etc.
5. Pin, barrel, and both link end-loops at a given station lie in one flat
   plane (matching the bearing's local orientation). Consecutive bearings
   have different orientations (twist accumulates station to station per
   Decision 4), so each link must rotate along its own length from the
   orientation at one end to the orientation at the other — the twist
   happens in the middle of the link, not at its ends.
6. Construction is different enough from the existing sweep-and-stitch
   approach (`MOBIUS.generateGeometry`) that it gets its own generator,
   `modules/chain.js`, rather than being expressed as another
   `createPointFactory` inside the current `GeometryStyle` interface.

## Phased plan

### Phase 0 — scaffolding ✅
- [x] Create `modules/chain.js` for chain-specific geometry generation.
- [x] Create `test/chain.test.js` alongside it (mirrors `test/mobius.test.js`).
- [x] Generalize control visibility (Decision 3): added
      `irrelevantCommonControlIds` to the `GeometryStyle` interface
      ([modules/styles/index.js](modules/styles/index.js)), empty for the
      three existing styles, `['segments']` for chain. `index.html`'s
      `regenerate()` now resets/disables any `[data-toggleable-common]`
      control per the active style (currently only `segments` carries that
      attribute). Also generalized how geometry gets built: styles can now
      provide their own `buildGeometry(config)` instead of the
      resolveSides/twistScale/createPointFactory + `generateGeometry` path,
      which is how chain plugs in without touching `mobius.js`.

### Phase 1 — pins only ✅ (first step)
- [x] `createPinTransforms(linkCount, ringRadius, twists)` in
      [modules/chain.js](modules/chain.js) — per station `i`, returns
      position + a combined orientation matrix using the Decision 4 formula
      (`segments = pointsPerPoly = linkCount`), reusing the "face outward" +
      incremental-twist matrix logic already in `generateGeometry`
      ([modules/mobius.js](modules/mobius.js):117-137).
- [x] `createPinGeometry(pinRadius, pinLength, linkCount, ringRadius,
      twists)` — places a `CylinderGeometry` at each transform, merged with
      `BufferGeometryUtils.mergeGeometries`.
- [x] Added the "Bike Chain" entry
      ([modules/styles/chainStyle.js](modules/styles/chainStyle.js)) to
      `STYLES` and a `linkCount` control ("Chain Links") in
      [index.html](index.html). Pin radius is derived from the existing
      "Slice Radius" control (`polyRadius * 0.25`); pin length has its own
      dedicated "Pin Length (mm)" control (`pinLength`), added once it
      became clear reusing "Slice Radius" for both was conflating two
      unrelated dimensions. "Pin Length" lives in the Size section
      alongside Ring Radius / Slice Radius (it's a physical dimension, even
      though — like the other style-owned controls — it's only enabled
      while the chain style is active).
- [x] Tests ([test/chain.test.js](test/chain.test.js)): pin count equals
      `linkCount`; pins are evenly spaced by angle around the ring;
      cumulative twist across all pins matches `twists * 180` degrees,
      independent of `linkCount`; `twists = 1` is a 180° half twist and
      `twists = 2` a 360° full twist; the twist delta from the last pin
      back to pin 0 matches the per-step delta; `twists = 0` closes
      untwisted; each pin cylinder is centred exactly on its transform.
- [x] Visually verified in-browser: "Bike Chain" is now the default style
      (Grass Green the default colour, for visibility while iterating);
      Smoothness/Polygon Sides/Rectangle Ratio grey out correctly; the same
      `twists` value now produces the same overall twisted shape regardless
      of `linkCount` (checked at `linkCount = 8` and `24`); "Slice Radius"
      only changes pin thickness, "Pin Length" only changes pin length;
      `twists = 1` shows a clean half twist, `twists = 2` a full twist.
      Switching back to Polygon re-enables Smoothness with no regressions.
      `npm test` — 18/18 passing.

### Phase 2 — bearing barrel around each pin ✅
- [x] `createBearingGeometry(bearingRadius, bearingLength, linkCount,
      ringRadius, twists)` in [modules/chain.js](modules/chain.js) — reuses
      the same per-station transforms as the pins via a shared
      `createStationCylinderGeometry` helper (pins and bearings are both
      "a cylinder at each station," just different radius/length).
      `createChainGeometry(...)` merges pins + bearings into one
      `BufferGeometry` for the style's `buildGeometry`.
- [x] Added "Bearing Radius (mm)" / "Bearing Length (mm)" controls
      (`bearingRadius`, `bearingLength`) in the Size section of
      [index.html](index.html), following the same pattern as Pin Length.
- [x] Tests ([test/chain.test.js](test/chain.test.js)): bearing count
      matches `linkCount`; each bearing is centred exactly on its pin's
      transform (reusing the min/max-distance check from Phase 1, factored
      into a shared `assertStationCylindersCentered` helper); the merged
      chain geometry contains both blocks (pins then bearings) each
      correctly sized and centred.
- [x] Visually verified in-browser: each pin now has a wider, shorter
      barrel centred on it, with the thinner pin still visible poking out
      both ends; twist and all Phase-1 controls still behave correctly.
      `npm test` — 21/21 passing.
- Note for Phase 3: bearing/pin sizing isn't validated against each other
  (e.g. nothing stops `bearingLength > pinLength`) — fine for now since
  it's just visual tuning, but worth keeping in mind once link end-loops
  need to fit around the bearing without overhanging the pin.

### Phase 3 — figure-eight links ✅ (v1: rounded, not flat-plate)
- [x] `createLinkGeometry(startTransform, endTransform, options)` in
      [modules/chain.js](modules/chain.js) — a tube whose circular
      cross-section wraps fully around the pin axis (radius = `loopRadius`,
      reusing `bearingRadius`) at both ends and tapers linearly to a
      narrower `waistRadius` in the middle. Orientation is slerped and
      position lerped between the two end stations across `lengthSegments`
      steps, so the twist happens along the link's length (Decision 5)
      instead of at its coplanar ends. `axialOffset` shifts a whole plate
      along the (interpolated) local pin axis.
- [x] `createChainLinksGeometry(linkCount, ringRadius, twists, options)` —
      places 2 plates per pin-to-pin gap (`axialOffset = ±separation/2`),
      alternating `linkInnerSeparation`/`linkOuterSeparation` by gap parity
      (Decision 1/2: this reads "inner"/"outer" as the axial spacing
      between the pair of plates bridging a gap, matching how a real roller
      chain's inner vs outer plate pairs are set at different gauges — not
      as two different loop/waist widths). No `mod linkCount` seam handling
      needed: twist is continuous now (Decision 4, revised), so the closing
      gap is just another plate pair spanning whatever orientation delta
      the last and first stations actually have.
      `createChainGeometry` now merges pins + bearings + links into one
      `BufferGeometry`.
- [x] Added "Link Waist Radius (mm)", "Link Inner Separation (mm)", "Link
      Outer Separation (mm)" controls in the Size section.
- **Known simplification, not the original plan**: this is a solid-of-
  revolution "dumbbell/spindle" (round in cross-section), not a flat
  stamped-plate figure-eight outline. Building a true flat 2D outline
  (two loops + a waisted middle, extruded with a separate thickness axis)
  was judged substantially more complex for a first pass — see the
  design discussion in this session if picking it up later. The rounded
  version already reads as chain-link-like once rendered with the pins and
  bearings; revisit only if the flat-plate look turns out to matter.
- **Skipped**: the standalone `chain-link-preview.html` isolation harness.
  Iterating directly against the full loop turned out to be practical
  (the assembly rendered correctly on the first real attempt), so the
  harness wasn't needed this round — still an option if link-shape
  iteration gets harder in a future pass.
- [x] Tests ([test/chain.test.js](test/chain.test.js)): `createLinkGeometry`
      rings match `loopRadius` at both ends and `waistRadius` (via slerped
      mid-orientation) in the middle; `axialOffset` shifts the plate along
      the local pin axis correctly; `createChainLinksGeometry` places two
      plates per gap with the right alternating separation; `createChainGeometry`
      produces the correctly-sized merged pins+bearings+links geometry.
- [x] Bug found & fixed along the way: `BufferGeometryUtils.mergeGeometries`
      requires every input geometry to have the same attribute set (so the
      link geometry needed a `uv` attribute added, matching
      `CylinderGeometry`'s pins/bearings) and to be uniformly indexed or
      non-indexed (so pin/bearing `CylinderGeometry`s are now built with
      `.toNonIndexed()`) — otherwise the final `mergeGeometries([pins,
      bearings, links])` silently returns `null`.
- [x] Visually verified (via a temporary local `python3 -m http.server`,
      see `.claude/launch.json` — needed because this session's `file://`
      preview cached an old copy of `chain.js` across reloads and briefly
      looked like a real bug): the full loop renders as pins, bearings, and
      tapered links forming a recognizable chain shape; `twist = 1` shows a
      clean progressive twist around the loop; switching to and from other
      styles still works with no regressions; STL export
      (`STLExporter.parse`) succeeds against the merged multi-primitive
      mesh. `npm test` — 24/24 passing.

### Phase 3 follow-up — round smoothness, link thickness, closing-gap fix ✅
Four rounds of feedback after the first working render:

- [x] **Smoothness controls roundness again.** Reused by the chain style as
      `radialSegments` for pins/bearings/links (`createPinGeometry` /
      `createBearingGeometry` / `createChainGeometry` all take an optional
      `radialSegments` param, default 12, wired from `config.segments` in
      [modules/styles/chainStyle.js](modules/styles/chainStyle.js)). This is
      what prompted reverting Decision 3's "hide Smoothness" call and
      removing the now-unused `irrelevantCommonControlIds` mechanism.
- [x] **Added a Link Thickness control.** `createLinkGeometry`'s ring is now
      an ellipse rather than a circle away from its coplanar ends: a "wide"
      axis (local Y) still tapers from `loopRadius` to `waistRadius`, but a
      separate "thin" axis (local Z) tapers from `loopRadius` down to
      `linkThickness / 2`, flattening the neck into a plate-like cross
      section instead of a round rod. Defaults `thickness` to
      `waistRadius * 2` when omitted, which reproduces the old round shape
      exactly (kept the existing round-waist tests passing unchanged).
- [x] **New "Bike Chain" settings section.** All of chain's `ownedControlIds`
      (`linkCount`, `pinLength`, `bearingRadius`, `bearingLength`,
      `linkWaistRadius`, `linkThickness`, `linkInnerSeparation`,
      `linkOuterSeparation`) now live together under one `<h2>Bike
      Chain</h2>` inside a `<div id="chainControls">` in
      [index.html](index.html), whose whole `display` is toggled in
      `regenerate()` based on `style.id === 'chain'` — hidden entirely for
      every other style instead of individually greyed out. Scoped to just
      chain for now since it's the only style with "loads" of settings; not
      generalized into a per-style-section mechanism until another style
      actually needs one.
- [x] **Fixed the closing-gap twist bug.** This was the same class of
      problem `generateGeometry`'s `twisted_offset` already solves for the
      sweep styles (Decision 4): `createChainLinksGeometry` was building the
      last gap's link by slerping from `transforms[linkCount - 1]` to
      `transforms[0]` directly, but `transforms[0]` represents *twist = 0*,
      not "the last station's twist plus one more per-step delta" — so the
      final link's orientation slerp was crossing almost the *entire*
      accumulated twist in a single short span, instead of the same small
      per-step delta every other link spans. Fixed with a new
      `createClosingStationTransform(linkCount, ringRadius, twists)` that
      computes the station transform at the continuous index `linkCount`
      (not wrapped to 0): same position as station 0 (angle wraps to the
      same point), but twist continues on past the last real station's
      value instead of resetting. `createChainLinksGeometry` now uses this
      for the final gap's `end` transform. Verified with a quaternion
      `angleTo` test showing the closing gap's orientation delta now
      matches every other gap's, where the old code's delta was more than
      2x larger for a 180°-total-twist example.
- [x] `npm test` — 29/29 passing. Visually verified via the local
      `python3 -m http.server` harness: Smoothness re-enabled and visibly
      rounds the pins/bearings/links; links read as flatter plates with the
      default thickness; the "Bike Chain" section shows only when that
      style is active and the panel is otherwise clean for the other
      styles; a twist=1 loop shows no more visually "over-twisted" link
      near the seam; STL export still succeeds.

### Phase 4 — parameters, UI, config persistence
- [x] `linkCount`, `pinLength`, `bearingRadius`, `bearingLength`,
      `linkWaistRadius`, `linkThickness`, `linkInnerSeparation`,
      `linkOuterSeparation` controls all landed alongside Phases 1–3 rather
      than being deferred, and are now grouped into their own hideable
      section (see the Phase 3 follow-up above).
- [ ] `pinRadius` is still derived from the shared "Slice Radius"/`polyRadius`
      control rather than its own control — may be worth breaking out on
      its own now that the bearing/links exist to size against it.
- [x] [modules/config.js](modules/config.js) persists every chain control
      to the URL (`control_id_list` picks up `ownedControlIds`
      automatically; `getConfig()` has a matching read for each field).
- [x] STL export (`STLExporter.parse`) confirmed working against the merged
      multi-primitive mesh (pins + bearings + links all merged into one
      `BufferGeometry` up front in `createChainGeometry`, so export needed
      no special-casing).

### Phase 5 — polish
- [ ] Visual proportion check against reference chain photos.
- [ ] Update [README.md](README.md) / [CLAUDE.md](CLAUDE.md) once the new
      module/style shape has settled.

## Testing approach

Every phase extends `test/chain.test.js` in the same style as
`test/mobius.test.js` / `test/styles.test.js`: pure-math assertions on point
counts, positions, radii, and transforms — no rendering/visual assertions.
Run with `npm test` (`node --test`).
