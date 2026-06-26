# Changelog — Page Media Importer extension

## 1.1.0 — overlay picker + dashboard tuple fix

- **In-page overlay selector** (`overlay.js`, P2): popup → "Pick videos on the page"
  draws clickable highlight boxes over every video (numbered 1–4 in click order) and,
  with "＋ reference image" on, over images (star one as the reference). Open straight
  into the Comparator. The reliable path on sites with opaque filenames. Tracks scroll
  and lazily-added videos via a rAF loop; `Esc`/Cancel dismisses. Uses the shared
  `IMPORT_VIDEO_URLS` pipeline.
- **Dashboard fix:** the per-row **Compare** button now grabs the *whole tuple* + the
  reference image. `findRowContainer` climbs to the composite row (reference image, or
  ≥2 videos) instead of stopping at the first single-video ancestor; `metadataForVideo`
  also reads a `<source>` child when a `<video>` has no direct `src`.

## 1.0.0 — Phase 5 / #9, P1

First version. Generalized, any-page MV3 extension that feeds the app's
`extImport.js` bridge — no app changes required.

- `detect.js`: scans the active tab for `<video>`/`<source>`/`og:video` and
  `<img>`/`og:image`; flags `blob:`/MSE/streamed sources as ungrabbable instead of
  dropping them.
- Popup: video checkboxes (select-all), optional reference-image star, replace/append
  mode, "Open in Comparator".
- `service-worker.js`: fetch chosen URLs → base64 `data:` URLs → find/open/focus the
  Comparator tab → inject `deliver.js` → post `LOAD_VIDEOS`.
- `deliver.js`: guarded relay (no duplicate listeners on a reused tab).
- Options page: configurable destination URL (Live GitHub Pages [default] / localhost
  dev / custom), stored in `chrome.storage.sync`.

Reuses the fetch/base64/tab-lifecycle approach proven in the dashboard-specific
`video-compare-extension` repo, generalized to work on any page via `activeTab` +
`chrome.scripting`.

### Dashboard integration (folded in)

- `dashboard.js`: the Decart eval-dashboard content script from the standalone
  `video-compare-extension` repo, now part of this unified extension. Injects per-row
  **Compare** buttons on `eval-dashboard.decart.ai` with rich label extraction and
  reference-image detection. Shares the `IMPORT_VIDEO_URLS` contract with the popup.
- The extension icon now appears on the injected **Compare** button (via
  `web_accessible_resources`); the button label swaps independently so the icon stays put.
