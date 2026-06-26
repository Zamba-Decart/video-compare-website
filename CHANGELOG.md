# Changelog

All notable changes to the Video Comparator are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/); this is a
single-page browser tool, so "releases" map to batches of work rather than tagged builds.

## [1.7.2] — 2026-06-26

### Changed
- Header buttons recolored by severity: **Remove current media set** is orange (only
  unloads the current videos); **Clear workspace** is red (wipes everything).

### Fixed
- A `replace` import (extension/`postMessage`) with no reference image now **clears** the
  previous tuple's reference instead of carrying it into the new comparison.

## [1.7.1] — 2026-06-26

### Changed
- **Vertical media resizer moved below the media** (centered, above the transport) instead
  of overlapping the bottom of the video — always visible, more discoverable.
- **Right-docked saved panel** is now sticky and viewport-tall, so the list scrolls down to
  the bottom of the page instead of being clipped by a short content column. Its scrollbar
  is a slim green bar (was the default white).

### Fixed
- The green wipe-comparison divider no longer lingers over the grid after importing new
  clips while in overlay (the overlay is now fully torn down on the drop to grid).
- Wipe-slider stutter when the reference panel is open: `layoutStageRow` no longer runs on
  every wipe frame (only on actual layout changes), so dragging the seam is smooth again.

## [1.7.0] — 2026-06-26

### Changed
- **Reference scaler now resizes the box, not just the image.** The slider (and the new
  divider, below) drive `--ref-grow`, which sizes the reference *panel* to the video's
  width × scale. 1× = the video's own size (never larger by default); up to 2×.
- **Overlay sizing reworked (`layoutStageRow`)**: the video box and reference box are both
  sized to the video's aspect ratio and clamped to fit the row, so the video always fills
  its box (no letterbox, divider stays welded) and is never tiny — fixes portrait/dashboard
  clips defaulting small. The pair is centered.

### Added
- **Drag divider between the reference and the video** (`#mid-resize`): drag right to grow
  the reference / shrink the video, left for the opposite — kept in sync with the slider.
- **Clearer resize handles**: a visible grip on the divider between the media, and a larger
  grip on the bottom edge (vertical media resize, below the media / above the transport).

### Fixed
- The reference scaler slider no longer appears in grid view (only in overlay).

## [1.6.0] — 2026-06-26

### Added
- **Reference image scaler**: a thin slider (0.5×–2×) right of the “Comparing A vs B”
  status, shown only in overlay when a reference image is loaded. 1× caps the reference to
  the video size; 2× can exceed it. The scale persists with the session and saved
  comparisons.

### Changed
- The reference image is capped to the video size by default (1×).
- The **Reference** button only glows in overlay now — in grid (where the panel is hidden)
  it no longer lights up after importing clips that carry a reference.

## [1.5.0] — 2026-06-25

### Added
- **Chrome extension** (`chrome extension/`, MV3) — Phase 5 / #9, P1. Click the toolbar
  icon on any page to scan it for videos (`<video>`/`<source>`/`og:video`) and images
  (`<img>`/`og:image`), tick the clips, optionally star one image as the reference, and
  open them straight in the Comparator. The service worker fetches each chosen URL
  (`host_permissions: <all_urls>` bypasses page CORS), base64-encodes it, finds/opens the
  Comparator tab, and delivers via the existing `extImport.js` `LOAD_VIDEOS` bridge — **no
  app changes**. Destination URL is configurable (live Pages [default] / localhost dev /
  custom). Streamed `blob:`/MSE/HLS sources are listed but greyed out as ungrabbable.

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
- Capped looping resets the pinned original and compared outputs to `0` together.
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
