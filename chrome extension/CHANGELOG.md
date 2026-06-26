# Changelog — Page Media Importer extension

## 1.2.1 — dashboard lazy-cell fix

- The eval-dashboard per-row **Compare** button now grabs the **whole tuple**, not just
  the one loaded cell. The model-output cells lazy-load, so until scrolled into view they
  have no `<video src>` — only a poster `…/assets/<id>.thumb.jpg`. We now recover the video
  URL from that poster (`<id>.mp4`, verified against the live dashboard) and name each clip
  by its model (the `/results/<model>/` path segment) instead of a UUID.
- Service-worker fetches now send `credentials: 'include'` so cookie-gated media works too.

## 1.2.0 — persistent selector widget + cleaner popup

- **Toggleable on-page widget.** The overlay selector is now a persistent corner icon
  (top-right of every page) you turn on/off from the popup ("Toggle video selector
  widget"). Clicking the icon opens the same numbered-box selector; closing the selection
  leaves the icon in place. `widget.js` runs on `<all_urls>` and reacts to the
  `widgetEnabled` flag live (no page reload needed). Replaces the one-shot `overlay.js`.
- **Cleaner popup.** The detected-file list moved into a collapsed "Pick from detected
  files" dropdown; the widget toggle is the primary action.
- **Replace is the default and the Replace/Add choice moved to Settings** (`importMode`).
  The popup, widget, and dashboard buttons all omit `mode`; the service worker applies the
  setting (default `replace`).

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
