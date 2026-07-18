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
   "Smoothness" (`segments`) input — `segments` controls sweep resolution for
   the existing styles and has no equivalent meaning for a chain of discrete
   stations, so it should be hidden/disabled when the chain style is active.
   This exposes a gap in the current control-visibility mechanism: today
   [modules/styles/index.js](modules/styles/index.js)'s `ownedControlIds`
   only lets a style claim *exclusive* controls (`sides`, `ratio`,
   `cornerSmoothing`) — there's no way for a style to opt out of a `common`
   control (`segments`, `colour`, etc). Generalizing this now (rather than
   special-casing chain) means any future style can hide controls that don't
   apply to it too. See Phase 0.
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

### Phase 3 — figure-eight links
This phase carries the most visual risk (profile shape + mid-link twist), so
build a tight visual feedback loop before wiring it into the full loop:

- [ ] Build an isolated single-link preview harness: a small standalone page,
      `chain-link-preview.html`, reusing the same buildless
      Three.js-via-import-map setup as `index.html`, that renders just one
      pin-to-pin gap — two bearings at a chosen relative twist offset, and
      the link(s) connecting them — with its own minimal controls (twist
      offset, bearing radius, link width/thickness, inner vs outer). No ring,
      no full loop, no camera-navigating-a-large-torus — just the one
      assembly, close up. Once the profile and mid-link twist look right
      here, reuse the same generator function from Phase 3's other tasks in
      `modules/chain.js` for the full loop.
- [ ] Design the figure-eight profile: two end-loops (radius ≈
      `bearingRadius`) joined by a waisted middle, in narrow ("inner") and
      wide ("outer") variants per Decision 2.
- [ ] Implement the mid-link twist (Decision 5): profile orientation rotates
      along the link's length from the orientation at one bearing to the
      orientation at the next, so both end-loops stay flush and coplanar
      with their bearing.
- [ ] Place 4 links per pin-to-pin gap (2 inner + 2 outer per Decision 1/2),
      alternating which pair is inner vs outer link-to-link. Since twist is
      now a continuous `twists * 180` total (Decision 4, revised) rather
      than a discrete per-side index, there's no `mod linkCount` seam offset
      to compute — the closing gap (last pin back to pin 0) is just another
      link spanning whatever orientation delta the two ends actually have.
- [ ] Tests: end-loop centers coincide with the bearings they connect; inner
      vs outer widths differ as expected and alternate correctly around the
      loop; link count equals `linkCount * 4`; the closing gap connects
      cleanly regardless of whether `twists` is a "nice" number.

### Phase 4 — parameters, UI, config persistence
- [x] `linkCount` and `pinLength` controls landed early (Phase 1 follow-up).
- [ ] Add controls for `pinRadius` (currently derived from the shared
      "Slice Radius"/`polyRadius` control — may be worth breaking out on its
      own once the bearing exists to size against it), `bearingRadius`,
      `bearingLength`, inner/outer link width & thickness — following the
      `data-style-owned` + `ownedControlIds` pattern
      ([index.html](index.html), `modules/styles/*.js`).
- [ ] Confirm [modules/config.js](modules/config.js) persists all the new
      ids to the URL (`control_id_list` picks up `ownedControlIds`
      automatically — double check `getConfig()` reads each new field).
- [ ] Confirm STL export (`STLExporter`) works against the merged
      multi-primitive mesh — may need an explicit geometry-merge step,
      unlike the current single-sweep styles.

### Phase 5 — polish
- [ ] Visual proportion check against reference chain photos.
- [ ] Decide whether `chain-link-preview.html` stays as a permanent dev tool
      or gets deleted once Phase 3 is visually solid.
- [ ] Update [README.md](README.md) / [CLAUDE.md](CLAUDE.md) once the new
      module/style shape has settled.

## Testing approach

Every phase extends `test/chain.test.js` in the same style as
`test/mobius.test.js` / `test/styles.test.js`: pure-math assertions on point
counts, positions, radii, and transforms — no rendering/visual assertions.
Run with `npm test` (`node --test`).
