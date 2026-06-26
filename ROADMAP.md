# Video Comparator — Roadmap

Planned features and fixes, with implementation approaches and a suggested order.
This is a working doc — items move to the [CHANGELOG](CHANGELOG.md) once shipped.

**Where main stands today (`86b76e5`):** grid + synced overlay compare (slider/dissolve/toggle),
zoom/pan/flip/rotate, save + session auto-restore (IndexedDB), reference **image** panel
(overlay-only) with persistence, pinned reference **video** ("Pin Original Video") with an
auto-pin heuristic, and the `extImport.js` `postMessage` bridge.

Effort key: **S** ≈ <1h · **M** ≈ a few hours · **L** ≈ a day+ / its own sub-project.

---

## ⚠️ Decisions to confirm before building

1. **Share format (#1):** ZIP bundle (recommended), a self-contained `.html` viewer, a hosted link, or several? And does a share include just the current workspace, or also all saved comparisons?
2. **Remove "nudge" (#7):** `<` / `>` nudge the *comparison* slider/blend; `←` / `→` scrub the *video timeline* — technically different, but you find them redundant. Confirm we drop the `<` / `>` keyboard nudge (mouse-drag on the slider stays).
3. **Auto-pin reference video (#3):** remove the auto-pin heuristic entirely, or keep it as an **off-by-default** toggle?
4. **Saved panel (#6):** default position — bottom rail (today) or right dock? Remember the choice per browser?
5. **Reference in grid (#4):** when shown in grid, does the panel sit *beside* the grid (shrinking it), and should a pinned reference **video** also be allowed in grid?

---

## Phase 1 — Quick UI fixes  ✅ shipped (PR #2)

### #5 — Slimmer transport bar  · **S**
- **What:** the play/scrub/loop/autoplay/mute row takes too much vertical space.
- **How:** CSS only — reduce `.transport-bar` padding, `.t-ctl` size (36→28px), tighten gaps; collapse the fps control into a small inline field. No JS.
- **Touches:** `styles.css`.

### #7 — Shortcuts as a popover; remove "nudge"  · **S–M**
- **What:** replace the always-on keyboard-hint strip with a **⌨ Shortcuts** button that opens a popover/modal listing all keys. Remove the `<` / `>` nudge (redundant with scrub per you).
- **How:** add a `#shortcuts-btn` + a hidden `#shortcuts-popover` (reuse modal styling); move the `kbd-hints` content into it. Delete the `<` / `>` `nudgeActiveSlider` keybindings + the "nudge" hint. Frees vertical space (pairs with #5).
- **Touches:** `index.html`, `styles.css`, `app.js` (remove nudge handlers).

### #8 — Drop `L` (loop) and `0` (reset) shortcuts  · **S**
- **What:** remove those two keybindings (buttons stay).
- **How:** delete the `l` and `0` cases in `bindKeyboard`; update the shortcuts popover from #7.
- **Touches:** `app.js`. (Bundle with #7.)

### #4 — Reference button + panel available in Grid view  · **M**
- **What:** the 🖼 Reference toggle is overlay-only today; show it in grid too (confusing without it).
- **How:** in `updateChrome`, stop gating `referenceBtn`/`referencePanel` on `overlay`. The `.stage-row` flex already wraps `[reference | stage]`, so the grid simply shrinks beside the panel — verify the grid's adaptive columns still look right at the narrower width, and that the aspect-cap (`--ar`, currently from selA) has a sensible grid fallback.
- **Touches:** `app.js` (`updateChrome`, show/hide logic), `viewer.js` (aspect handling in grid), `styles.css`.
- **Open Q:** decision #5 (does a pinned reference *video* also apply in grid?).

---

## Phase 2 — Reference intake & behavior  ✅ shipped (PR #3)

### #2 — Auto-detect a dropped image as the reference  · **M**
- **What:** dropping e.g. 3 videos + 1 image should auto-assign the image as the reference (by file type), no extra click.
- **How:** broaden the main dropzone to accept images (`accept` + the `addFiles` filter). Split intake: video files → slots; the (first) image file → `loadReferenceImage` + turn the reference on. Works for both drag-drop and the file picker.
- **Touches:** `loaders.js` (`addFiles` splits by MIME), `app.js` (route image → reference), `index.html` (dropzone `accept`).
- **Edge:** multiple images → use the first, ignore/queue the rest (note in UI).

### #3 — Reference *video* is manual, not auto-detected  · **DONE**
- **What:** the reference video is now assigned only by the user (R picker / "Pin Original Video").
- **Resolution:** the auto-pin heuristic was first made an off-by-default toggle (PR #3), then **removed entirely** (decision #3) — no `autoPinReference` state, no toggle button, no on-load heuristic. The manual pin controls are all that remain.

---

## Phase 3 — Saved panel UX  ✅ shipped (PR #4)

### #6 — Collapsible saved panel + dock to the right  · **M**
- **What:** let the "Saved comparisons" rail collapse (hide / expand) and optionally move to a right-side dock instead of the bottom.
- **How:**
  - **Collapse:** a header toggle (▾/▸) that hides `.saves-list`; remember open/closed in `localStorage`.
  - **Dock right:** a position toggle (`bottom` | `right`). `right` switches `.main` to a 2-column layout (content + a vertical saved sidebar); `bottom` keeps today's full-width rail. Persist the choice in `localStorage`.
- **Touches:** `index.html` (toggle controls), `styles.css` (the two layouts), `app.js`/`saves.js` (toggle state + persistence).

---

## Phase 4 — Sharing a session / saved videos  ✅ shipped (PR #6)

### #1 — Share the workspace *with the videos*  · **DONE**
- **Shipped:** ⤓ Save workspace / ⤒ Load workspace buttons in the header export/import a portable `.zip` (vendored JSZip) — `manifest.json` (current session + **all** saved comparisons) + `media/` (every video & reference blob, deduped). Plain download named `<your-name>_video_comparator.zip`; import merges saved comparisons (union by id) and adopts the bundled workspace, then reloads to restore. Dropping a `.zip` on the app also loads it. No hosting — download + manual share.
- **Goal (original):** hand someone a single artifact (zip / file / link) that reopens with the same loaded videos + saved comparisons + reference, since the JSON alone isn't enough — the (small) videos must travel too.
- **Recommended: a portable ZIP bundle** (`*.vcbundle.zip`)
  - **Contents:** `manifest.json` (the session + saved-comparison metadata: clips by filename, A/B/reference selections, modes/positions/transforms) + `media/` (each unique video + reference image, stored once, keyed by the existing `blobId`).
  - **Export:** "⇪ Export bundle" → collect the loaded slots' files + reference + (optionally) every saved comparison's videos → zip → download. Scope toggle: *workspace only* vs *+ all saved comparisons* (decision #1).
  - **Import:** drop a `.vcbundle.zip` on the app → unzip → recreate slots / saved comparisons / reference from the bundled files (reuses `addBlobSlot` + the saves-restore path) → restore state.
  - **Library:** vendor **JSZip** (one file) into `src/js/vendor/` so it also works in the standalone (CDN would break offline/`file://`).
  - **Dedup:** each unique video stored once even if reused across saves.
- **Variant — "send to someone with nothing installed":** *Export self-contained viewer* → one `.html` (the standalone build) with the bundle's videos embedded as base64 + auto-loaded on open. Zero setup for the recipient; heavier file (~+33% from base64). Nice-to-have.
- **Variant — link:** needs hosting (the app is serverless today). Options later: upload the bundle to a bucket / gist / transfer-style service and share the URL, or a tiny serverless upload endpoint. Out of scope for v1.
- **Touches:** new `share.js` (export/import), `index.html` (buttons), bundler (vendor JSZip), `saves.js` (reuse restore).
- **Risks:** bundle size if videos aren't actually small; base64 bloat for the HTML variant; very large zips hit browser memory limits.

---

## Phase 5 — Chrome extension (grab page media → open in app)  ✅ P1 shipped

### #9 — "Open these videos in the Comparator" extension  · **P1 DONE**
- **Shipped (P1):** an MV3 extension in [`chrome extension/`](chrome%20extension/). Click the
  icon → `detect.js` scans the active tab for `<video>`/`<source>`/`og:video` + `<img>`/`og:image`
  → popup (tick clips, star one image as the reference, replace/append) → the service worker
  fetches each chosen URL (`<all_urls>` bypasses page CORS), base64-encodes it, finds/opens the
  Comparator tab, and `deliver.js` posts `LOAD_VIDEOS` into the existing `extImport.js` bridge —
  no app changes. Destination URL configurable (live Pages [default] / localhost / custom).
  Streamed `blob:`/MSE/HLS sources are listed but greyed out. **Decisions resolved:** URL
  configurable (#1); `<all_urls>` accepted for the internal tool (#2); load-unpacked distribution
  for v1 (#3). **Still open (P2/P3):** in-page overlay tagging, CSS background images, frame-grab
  thumbnails, streamed-media capture.

#### Original design notes (#9)
- **Goal:** on any webpage with a few videos (+ a reference image), click the extension and have them loaded into the app automatically.
- **Foundation we already have:** `extImport.js` accepts `window.postMessage({ type: 'LOAD_VIDEOS', mode, videos, referenceImage })`. The extension just needs to *find* media, *fetch* it, and *deliver* it through that bridge.
- **Architecture (MV3):**
  - **Detect** (content script): scan for `<video>` / `<video><source>` `src`s, `<img>`, CSS background images, and `og:video`/`og:image` meta.
  - **Choose** — two UX options you floated:
    - **(a) Popup list:** thumbnails + checkboxes; pick the videos, star one image as the reference, hit "Open in Comparator." Simpler.
    - **(b) In-page overlay:** click elements on the page to tag them (number the videos, mark the reference). Slicker, more work.
  - **Acquire** (background service worker): `fetch` each chosen URL → blob (broad `host_permissions` lets the extension bypass page CORS for direct files).
  - **Deliver:** open the app URL (configurable: live Pages or localhost) in a tab; a small content script on the app page relays the blobs via `window.postMessage(LOAD_VIDEOS)` → `extImport.js` loads them. (Alt: stash in `chrome.storage`, app reads on open.)
- **Phasing:** P1 popup + direct-file `<video src>` grab + postMessage handoff (covers the common case). P2 the overlay tagging UI. P3 streamed media.
- **Hard cases (likely out of scope initially):** MSE / `blob:` / HLS / DASH video (YouTube-style streaming has no grabbable file URL — needs capture/remux); cross-origin sites needing per-site host permissions.
- **Where it lives:** a new `extension/` folder in this repo (shares the `extImport.js` contract), or its own repo.
- **Brainstorm verdict:** start with **(a) popup + direct files**; it's the 80% case and reuses the existing bridge. Treat (b) and streamed media as follow-ups.

---

## Suggested order

1. ~~**Phase 1** (#5, #7, #8, #4)~~ — ✅ shipped (PR #2).
2. ~~**Phase 2** (#2, #3)~~ — ✅ shipped (PR #3); auto-pin later removed entirely.
3. ~~**Phase 3** (#6)~~ — ✅ shipped (PR #4).
4. ~~**Phase 4** (#1)~~ — ✅ shipped (PR #6): portable `.zip` workspace bundles (full mirror, plain download).
5. ~~**Phase 5** (#9)~~ — ✅ P1 shipped: MV3 extension in `chrome extension/` (popup + direct-file grab → `extImport.js`). P2/P3 (overlay tagging, CSS backgrounds, frame-grab thumbnails, streamed media) remain.

Workflow: small batches per phase on `main` (or short feature branches → PR), rebuild the
standalone (`tools/build-standalone.py`) and verify in-browser before each push.
