# mobius3d

Interactive generator for twisted-ring / Möbius-strip-style 3D objects. A purely browser-based app lets you tune shape parameters, see a live Three.js preview, and export an STL for 3D printing. No build step, no server, no non-web dependencies.

> The project started as a Python script (`generate_stl.py`) that wrote STL files directly from hand-edited parameters. That script has been removed — the Three.js app in [index.html](index.html) is now the only implementation, and is a superset of what the script could do (adds rounded and rectangular cross-sections, live preview, URL-shareable configs). If you see references to Python in old commits/issues, they predate this cleanup.

## Live app (primary surface)

- [index.html](index.html) — single-page app. No build step, no bundler, no package.json. Opens directly in a browser (Three.js is loaded from a CDN via an import map).
- [modules/mobius.js](modules/mobius.js) — geometry generation (pure Three.js math, no DOM).
- [modules/config.js](modules/config.js) — reads/writes the control panel `<input>`/`<select>` elements and serializes them to URL query params so a configuration can be shared/bookmarked via URL.

Run it: open `index.html` directly in a browser, or serve the directory (`python3 -m http.server`) if the browser blocks module imports over `file://`.

### How generation works ([modules/mobius.js](modules/mobius.js))

1. A 2D cross-section polygon is generated in the XY plane by one of three "factories," selected by `geometryType`:
   - `createPolygonPoints` — regular N-sided polygon (sharp corners).
   - `createRoundedPolygonPoints` — same, but corners are rounded with an arc (`cornerRadius`, `cornerSegments`).
   - `createPolygonPointsInRectangular` — takes a regular polygon and keeps only 3–4 of its points (first, middle, last) to approximate a flat rectangular ribbon.
2. `generateGeometry(sides, polyRadius, ringRadius, segments, twists, polygonFactory)` sweeps that cross-section around a ring of `ringRadius`, in `segments` steps:
   - applies an incremental twist rotation (Z axis) proportional to progress around the ring,
   - reorients the cross-section to face outward (rotate into the XZ-ish plane, then rotate around Z to the current angle),
   - translates it to its position on the ring,
   - stitches consecutive cross-sections together into a triangle strip (`fillSides`) to form the closed tube/band.
3. The **last segment is a special case**: because the strip has twisted by some number of "sides" by the time it closes the loop, the closing seam has to connect polygon N-1 back to polygon 0 with an index offset (`twisted_offset = twists`) instead of a 1:1 match — this is what makes it topologically a Möbius-like strip rather than a plain torus when the twist is an odd multiple of half the polygon's rotational symmetry.
4. There's a dead/unused `fillPolys` branch (end-cap triangulation via fan-from-centroid) — currently always `false`, so the mesh has no end caps. Since the shape is a closed loop this normally doesn't matter, but it's there if an open/cut variant is ever wanted.

### UI → geometry parameter mapping ([index.html](index.html) `regenerate()`)

The control panel is more literal than the geometry function — `index.html` does some translation before calling `MOBIUS.generateGeometry`:

- **`twist`** (the "Twist (sides)" input) is a count of polygon-sides-worth of rotation, not degrees, and it's *rescaled per geometry type* before being passed down:
  - `rectangular`: `twist *= 2`, and `sides` is forced to `2 * ratio` (the rectangle is modeled as a many-sided polygon reduced to 4 points, so "sides" here is really a subdivision count for the underlying polygon, not the rectangle's 4 corners).
  - `rounded`: `twist *= 21` (21 = `cornerSegments (20) + 1`, i.e. one rounded corner's point count) — tightly coupled to the hardcoded `cornerSegments = 20` in the `rounded` case a few lines above. If `cornerSegments` ever changes, this multiplier must change with it.
  - `polygon`: `twist *= 1` (no-op).
  - **This coupling is the trickiest part of the codebase to extend.** Any new geometry factory needs a matching entry here so the closing-seam offset lines up with the factory's actual point count per side.
- Relevant inputs are disabled/enabled depending on `geometryType` (`cornerSmoothing` only for `rounded`, `ratio` only for `rectangular`, `sides` disabled for `rectangular` since it's derived from `ratio`).
- Every input/select change triggers a full `regenerate()` (rebuild mesh from scratch — no incremental updates) and calls `CONFIG.updateURLFromInputs()` to sync the URL.
- STL export uses Three.js's `STLExporter` on the live mesh and triggers a client-side download — no server round-trip.

### Config/URL sync ([modules/config.js](modules/config.js))

`control_id_list` is the single source of truth for which control IDs get serialized to/from the URL query string. **Any new control added to `index.html` must be added to this list**, or it silently won't persist across reload/share.

## Known rough edges / things to watch when iterating

- No `package.json`, formatter, linter, or test suite of any kind. Verification is currently "open it in a browser and look at it" — there's no automated way to confirm a geometry change is correct beyond visual inspection and manual STL export/print.
- The twist-scaling-per-geometry-type logic in `index.html` (see above) is fragile magic-number territory; a refactor to make `polygonFactory` report its own point-count/seam-offset rules would remove the need to hand-tune multipliers whenever a new shape style is added.
- `regenerate()` fully rebuilds the BufferGeometry on every keystroke/change — fine at current segment counts, but worth watching if higher-resolution shapes or animation are added later.
- Colour is a fixed dropdown of named hex values in `index.html`, not a colour picker.

## Examples

[examples/3side360step.jpg](examples/3side360step.jpg) and [examples/6side24step.jpg](examples/6side24step.jpg) are sample renders referenced from the README. Their filenames reference the old Python script's parameter names (`step_count`, `twist` as a rotation fraction) — see [README.md](README.md) for the equivalent settings in the current app's UI terms.
