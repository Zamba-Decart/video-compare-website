# Changelog

All notable changes to the Video Comparator are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/); this is a
single-page browser tool, so "releases" map to batches of work rather than tagged builds.

## [1.4.0] — 2026-06-15

### Added
- **Pinned reference video** mode: pin one loaded clip into the left reference panel while
  A/B overlay comparison stays on the right with slider/dissolve/toggle controls.
- **Auto pin reference** heuristic: when one loaded video has a mismatched aspect ratio and
  two others match each other, the odd clip is pinned as the reference and the matching pair
  is selected for overlay.
- Extension bridge support for imported reference images via
  `postMessage({ type: 'LOAD_VIDEOS', referenceImage })`.
- Extension `replace` imports now quietly save the current A/B comparison to the saved rail
  before loading the next imported row.

### Changed
- Extension imports in `replace` mode clear stale pinned-reference state before loading the
  next row.
- Overlay playback now syncs the pinned reference video with A/B.
- When a pinned original/reference video is active, the loop duration is capped to the A/B
  output videos instead of the longer original.
- A/B/R picker controls are wider and wrap so long imported names are readable.
- The pinned video control is labeled **Pin Original Video**.

## [1.3.0] — 2026-06-15

### Added
- **Reference image panel** (overlay only): a toggleable **🖼 Reference** panel beside the
  A/B comparison with an upload/drop area. The comparison shifts right and the reference
  shows on the left; portrait (9:16) clips leave a wide reference panel.
- **Reference image persistence** — the reference is stored in IndexedDB and brought back by
  both session auto-restore (on reload) and saved comparisons (restoring a card reopens a
  fresh comparison **and** its reference image).
- **Extension import helper** (`extImport.js`) — external pages can
  `postMessage({ type: 'LOAD_VIDEOS', mode: 'replace' | 'append', videos: [...] })`
  (or call `window.importVideosFromExtension`) to load clips through the normal upload path.

### Changed
- The standalone bundler folds every module `<script src>` (not just `app.js`) into the
  single self-contained `video-compare.html`.
- When the reference panel is open, the stage gets an aspect-aware max-width cap so the
  video keeps filling it (no letterbox) and the wipe divider stays welded.

## [1.2.0] — 2026-06-11

### Added
- **Flip H/V, Rotate, Screenshot, and Save** now work in **both** grid and overlay views.
- Grid **Screenshot** exports the whole spread layout (adaptive 1×N / 2×2) as a PNG.

### Changed
- "Frame PNG" renamed to **Screenshot**.
- **Save** now clears the loaded videos after persisting, so the next batch can be dropped
  immediately (the save stays in the rail and reloads its clips when clicked).
- **`<` / `>`** nudge the dissolve blend faster than the slider wipe (the blend doesn't need
  fine alignment).
- **Reset All** clears only the current videos — **saved comparisons are kept** (delete those
  per-card). Restoring a saved card opens a **fresh** comparison of its clips (default
  positions), not the saved scrub/zoom state.

### Fixed
- Hardening from an adversarial review of the persistence layer: session A/B resolved by
  content id (not stale array index); reset can no longer be resurrected by an in-flight
  save; saves abort instead of persisting a dangling blob reference; failed restores roll
  back orphan slots; `kv['saves']` mutations are serialized; restored playback position is
  re-applied after metadata loads; nudge keys match the `<`/`>` glyph across keyboard layouts.

## [1.1.0] — 2026-06-10

### Added
- **Save + auto-restore** via IndexedDB: a "Saved comparisons" rail (video data + settings,
  deduped, last ~12) and an auto-restored workspace (clips + view + selection + settings).
- **A/B clip pickers** (dropdowns) and `[` / `]` (and `Shift` for A) cycling in overlay.
- **`<` / `>`** nudge hotkeys for the active slider / dissolve.
- Self-contained **`video-compare.html`** standalone (runs from `file://`) plus
  `tools/build-standalone.py` to generate it.

### Changed
- The grid always shows full, original frames — overlay clip/opacity no longer leak into it.

### Fixed
- The slider divider stays welded to the actual slice edge under zoom / pan / flip / rotation
  (and on window resize / fullscreen); the exported frame matches the live preview at any zoom.

## [1.0.0] — 2026-06-10

### Added
- Initial release. Drop up to 4 videos into an adaptive side-by-side grid; one synced master
  transport drives them all (play/pause, scrub, loop, autoplay, mute, playback speed, frame
  stepping) with drift correction; select two for a 2-up **overlay** compare
  (slider / dissolve / toggle) with zoom, pan, flip, rotate, fullscreen, and keyboard
  shortcuts. Published to GitHub Pages.
