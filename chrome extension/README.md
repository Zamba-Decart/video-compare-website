# Video Comparator — Page Media Importer (Chrome extension)

Grab the videos (and one reference image) from any web page and open them straight
into the [Video Comparator](../src/index.html). This is **Phase 5 / #9** from the
[ROADMAP](../ROADMAP.md) — the popup + direct-file path (P1).

It needs **no changes to the app**: it feeds the existing
[`src/js/extImport.js`](../src/js/extImport.js) bridge, which listens for
`window.postMessage({ type: 'LOAD_VIDEOS', mode, videos, referenceImage })`.

## How it works

```
click icon → detect.js scans the active tab for media
           → popup: tick clips, optionally star one image as the reference, pick mode
           → service-worker.js fetches each chosen URL (host perms bypass page CORS)
             → base64 data: URLs (the transport extImport.js accepts reliably)
           → opens / focuses the Comparator tab (URL configurable in Settings)
           → deliver.js (injected) posts LOAD_VIDEOS to the page → extImport.js loads it
```

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest. |
| `content/detect.js` | Injected on click into the active tab; scans `<video>`/`<source>`/`og:video` + `<img>`/`og:image`; returns a media list. Fetches nothing. |
| `popup/` | Picker UI — video checkboxes, image reference star, replace/append mode. |
| `background/service-worker.js` | Orchestrator: fetch → base64 → find/open the Comparator tab → deliver. |
| `content/deliver.js` | Injected into the Comparator tab; relays the payload via `window.postMessage` (extImport requires `event.source === window`, so the post must come from the page's own window). |
| `options/` | Set the Comparator destination URL (live / localhost / custom). |

## Install (load unpacked)

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select this `chrome extension/` folder.
3. (Optional) click the extension → ⚙ → choose the destination: **Live (GitHub Pages)**
   is the default; switch to **Local dev** (`http://localhost:8765/src/index.html`) when
   running `tools/dev-server.py`.

To reload after edits: hit the ↻ on the extension card. If a Comparator tab was open,
reload it too.

## Usage

Open a page with videos → click the extension icon → tick the clips you want,
optionally star one image as the reference, choose **Replace** (default — saves the
current comparison quietly, then clears) or **Add** → **Open in Comparator**.

## Permissions

- `activeTab` + `scripting` — inject `detect.js` into the page you're on, and
  `deliver.js` into the Comparator tab.
- `tabs` — find/open/focus the Comparator tab.
- `storage` — remember the destination URL.
- `host_permissions: <all_urls>` — the **load-bearing** one: lets the service worker
  `fetch()` cross-origin media files (the page's own CORS doesn't apply to the worker).
  Appropriate for an internal team tool; it's what a Web Store review would scrutinise.

## Known limitations (P1)

- **Streamed video can't be grabbed.** `blob:` / MSE / HLS / DASH sources — i.e.
  **YouTube and most streaming sites** — have no fetchable file URL. They're still
  *listed*, greyed out with a "can't grab" note, never silently dropped.
- **Auth/cookie-gated media** may 401/403 from the worker's fetch.
- **No frame-grab thumbnails** yet (videos show their `poster` if present, else a
  placeholder). Same-origin frame capture is a P2 item.
- One reference image at a time (star one); CSS background images and an in-page
  click-to-tag overlay are P2.

## Roadmap (from [ROADMAP.md](../ROADMAP.md) #9)

- **P1 (this):** popup + direct-file `<video src>`/`<source>` grab + base64 handoff + image-as-reference.
- **P2:** in-page overlay tagging, CSS background images, frame-grab thumbnails.
- **P3:** streamed-media capture/remux.

## Prior art

A dashboard-specific predecessor (auto-injected **Compare** buttons on
`eval-dashboard.decart.ai`) lives in the separate `video-compare-extension` repo. This
folder is the **generalized, any-page** successor that the ROADMAP/HANDOFF called for.
