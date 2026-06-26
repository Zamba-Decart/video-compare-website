# Handoff — next up: the browser extension (Phase 5 / #9)

This is a cold-start brief for the next agent. Everything through Phase 4 + a UX
batch is shipped on `main` and live. The remaining roadmap item is the **Chrome
extension** that grabs a page's videos/images and loads them into the app.

---

## 1. Project state (all on `main`, deployed)

Live site: **https://zamba-decart.github.io/video-compare-website/** (GitHub Pages,
built from `main`, serves the modular `src/index.html`).

Shipped (see [ROADMAP.md](ROADMAP.md) + git history / PRs #2–#9):
- **Phase 1** — UI polish: slim transport bar, ⌨ Shortcuts popover, reference button in grid.
- **Phase 2** — drop an image → it becomes the reference (`#2`). The old auto-pin heuristic (`#3`) was added then **removed entirely** — the reference video is now manual only.
- **Phase 3** — Saved-comparisons panel: collapse + dock-right toggle, persisted.
- **Phase 4** — Portable **workspace bundles**: ⤓ Save / ⤒ Load a `.zip` (`<name>_video_comparator.zip`) containing every video + saved comparison. Import **fully replaces** the workspace (no carryover). Drop a `.zip` on the app to load it.
- **UX batch / fixes** — A/B/R are three roles you can freely reassign (swapping, never losing the pin); saved comparisons keep the pinned reference video; **Clear workspace** (wipe-all w/ save prompt) vs **Remove current media set** (unload videos, keep saves); drag the stage's bottom edge to resize; the loaded workspace's name shows in the header tagline; the ★ Save button goes green while the current tuple is unsaved; pin-video and reference-image are mutually exclusive.

Only remaining roadmap item: **Phase 5 / #9 — the extension.**

---

## 2. Layout & build

- **`src/`** — the modular ES-module app (what Pages serves). Key modules: `state.js`,
  `dom.js`, `loaders.js`, `playback.js`, `viewer.js`, `grid.js`, `export.js`,
  `saves.js`, `share.js` (bundle export/import), `extImport.js` (**the extension bridge**), `app.js`.
- **`video-compare.html`** (repo root) — single-file standalone, built from `src/` by
  **`python3 tools/build-standalone.py`**. It inlines CSS + all JS modules + vendored
  JSZip + favicons. **Re-run the build after any `src/` change** (CI doesn't; the file is committed).
- **`tools/dev-server.py`** — no-cache static server for local preview (see gotchas below).
- `testing/clips/` (gitignored) — sample media: `clip1-red`/`clip2-green`/`clip3-blue`/`clip4-purple` (640×360), `portrait-teal` (360×640, the odd-aspect one), `reference-sample.png`.
- Persistence: IndexedDB — `blobs` store (video/image bytes keyed by a `blobId` = `name__size__lastModified`) + `kv` store (`saves` array, `session` record). Prefs in `localStorage` (`vc.savesDock`, `vc.savesCollapsed`, `vc.stageHeight`).

---

## 3. The extension — design (agreed; not yet built)

**Goal:** on any page with a few videos (+ maybe a reference image), click the
extension, pick what you want, and have them load into the Comparator.

### The one load-bearing constraint — read `src/js/extImport.js` first
The app already exposes a bridge. **No app changes are needed**; the extension just
feeds it. Two facts shape everything:

1. It listens for `window.postMessage({ type: 'LOAD_VIDEOS', mode, videos, referenceImage })`
   and **guards `if (event.source !== window) return`** → the message must be posted from
   the app page's *own* window. So a **content script injected into the app tab** posts it
   (not the popup/SW directly).
2. Descriptors carry **bytes, not URLs**. Each `videos[]` entry is
   `{ blob } | { dataUrl } | { buffer, type }` (+ optional `name`, `type`); `referenceImage`
   is one descriptor of the same shape. The app never fetches anything itself. So the
   extension must **fetch the media and hand over the data** — and **base64 `dataUrl` is the
   reliable transport** (raw `Blob`/`ArrayBuffer` get mangled through `chrome.runtime` messaging).
   - `mode`: `'replace' | 'append'` (default `append`). `'replace'` saves the current comparison quietly, then clears.
   - There's also `window.importVideosFromExtension = loadVideoFiles` for a direct call.

### Components (new `extension/` folder, MV3)
- `manifest.json`
- `background/service-worker.js` — orchestrator: request detection → fetch+base64 → open the app tab → send payload.
- `content/detect.js` — injected on click (`activeTab` + `chrome.scripting`); scans the page for media.
- `content/deliver.js` — runs on the app URL; relays the payload via `window.postMessage(LOAD_VIDEOS)`.
- `popup/` — `popup.html/js/css`: thumbnails + checkboxes, star one image as the reference, "Open in Comparator."
- `icons/`, `README.md`.

### Data flow
click icon → SW injects `detect.js` → detect lists media (`<video>`/`<source>` src, `<img>`,
`og:video`/`og:image`) → popup (pick clips + star a reference) → SW `fetch`es each chosen URL
(host permissions bypass the page's CORS) → base64 → opens the app tab (configurable URL) →
`deliver.js` posts `{ videos:[{dataUrl,name}], referenceImage, mode }` → `extImport.js` loads it.

### Permissions
`activeTab`, `scripting`, and **`host_permissions: ["<all_urls>"]`** — the last is the only
meaningful one (needed so the service worker can fetch cross-origin media). Fine for an
internal tool; it's what a Web Store review would scrutinize.

### Phasing
- **P1 (MVP):** popup + direct-file `<video src>`/`<source>` grab + base64 handoff + image-as-reference. Covers the common case.
- **P2:** in-page overlay tagging UI; CSS background images; `og:` meta; frame-grab thumbnails (same-origin).
- **P3:** streamed media.

### Known limitation (state it in the UI, don't pretend)
`blob:` / MSE / HLS / DASH video — i.e. **YouTube and most streaming sites** — have no
grabbable file URL, so they're out of scope. `detect.js` should still *show* them, greyed
out with a "streamed — can't grab" note. Auth/cookie-gated media is also P1-out.

---

## 4. Open decisions — confirm with the user (@zamba) before building
1. **App target URL** — configurable (default the live Pages site, with a localhost dev option) *[recommended]*, or hardcode the live site?
2. **`<all_urls>` host permission** — OK for the team tool? (Needed for cross-origin fetch.)
3. **Distribution** — load-unpacked / internal `.zip` for the team *[recommended for v1]*, or Chrome Web Store?

Then scaffold P1 on a branch and commit this architecture as `extension/README.md`.

---

## 5. Dev / verify workflow & gotchas
- **Workflow:** feature branch → PR → merge to `main`. Commit trailer: `Co-Authored-By: Claude ...`. PRs use `🤖 Generated with [Claude Code]` footer.
- **After editing `src/`, rebuild the standalone** (`python3 tools/build-standalone.py`) and commit it.
- **Preview caching trap (important):** plain `python -m http.server` lets the browser cache ES modules, so edits can silently *not* take effect. Use `tools/dev-server.py` (sends `no-store`). The Claude Code preview tool also caches `.claude/launch.json` per session. **When in doubt, verify against the standalone `/video-compare.html`** — it's a single file (no per-module caching) and is the most reliable thing to load.
- **Verifying behavior headlessly:** synthetic `DragEvent`s drop their `dataTransfer`; drive file intake via the file input (`input.files = dataTransfer.files; dispatchEvent('change')`) instead. Saved-comparison cards restore via their inner `.save-open` button, not the card div.
- The extension's `deliver.js` will need to wait for the app tab to be ready before posting — either retry, or have the app emit a ready signal (small, optional app-side add).
