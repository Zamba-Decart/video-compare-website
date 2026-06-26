# Video Comparator — Page Media Importer (Chrome extension)

Grab the videos (and one reference image) from any web page and open them straight
into the [Video Comparator](../src/index.html). This is **Phase 5 / #9** from the
[ROADMAP](../ROADMAP.md) — the popup + direct-file path (P1).

Three ways to pick media:

1. **On-page selector widget** (recommended) — toggle it on from the popup; a small icon
   sits in the top-right of every page. Click it → highlight boxes appear over every
   video; click them in order (numbered 1–4), optionally star an image as the reference,
   **Open in Comparator**. No filenames needed — the reliable path for internal tools.
2. **Popup file list** — the toolbar popup auto-detects media and lists it under a
   collapsed "Pick from detected files" dropdown (checkboxes + reference star). Handy when
   names are meaningful.
3. **Decart eval dashboard** (`eval-dashboard.decart.ai`) — a per-row **Compare** button
   (with the extension icon) injected next to each download button, with rich label
   extraction and reference-image detection. Original integration, kept working — the
   **top-priority** path.

It needs **no changes to the app**: it feeds the existing
[`src/js/extImport.js`](../src/js/extImport.js) bridge, which listens for
`window.postMessage({ type: 'LOAD_VIDEOS', mode, videos, referenceImage })`.

## How it works

```
widget icon / popup → pick videos (+ optional reference image)
           → service-worker.js fetches each chosen URL (host perms bypass page CORS)
             → base64 data: URLs (the transport extImport.js accepts reliably)
           → opens / focuses the Comparator tab (URL configurable in Settings)
           → deliver.js (injected) posts LOAD_VIDEOS to the page → extImport.js loads it
```

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest. |
| `content/dashboard.js` | Static content script on `eval-dashboard.decart.ai`; injects per-row **Compare** buttons (with the extension icon), extracts readable labels + the row's reference image, sends `IMPORT_VIDEO_URLS`. |
| `content/widget.js` | Runs on every page (`<all_urls>`). Shows the corner selector icon when the widget is enabled (storage flag `widgetEnabled`); clicking it opens the in-page selection overlay (numbered boxes over videos/images). Toggled from the popup. |
| `content/detect.js` | Injected on demand by the popup; scans the active tab for `<video>`/`<source>`/`og:video` + `<img>`/`og:image`; returns a media list. Fetches nothing. |
| `popup/` | Toggle the widget; collapsed "detected files" list (checkboxes + reference star). |
| `background/service-worker.js` | Orchestrator: fetch → base64 → find/open the Comparator tab → deliver. Applies the Replace/Add setting. |
| `content/deliver.js` | Injected into the Comparator tab; relays the payload via `window.postMessage` (extImport requires `event.source === window`, so the post must come from the page's own window). |
| `options/` | Comparator destination URL (live / localhost / custom) + Replace/Add mode. |

## Install (load unpacked)

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select this `chrome extension/` folder.
3. (Optional) click the extension → ⚙ → choose the destination: **Live (GitHub Pages)**
   is the default; switch to **Local dev** (`http://localhost:8765/src/index.html`) when
   running `tools/dev-server.py`.

To reload after edits: hit the ↻ on the extension card. If a Comparator tab was open,
reload it too.

## Usage

**Selector widget (recommended):** click the toolbar icon → **Toggle video selector
widget**. A small icon appears in the top-right corner of every page (and stays there
until you toggle it off). Click that icon on any page → clickable boxes appear over every
video; click them in the order you want (numbered 1–4); flip on **＋ reference image** to
star one image as the reference; then **Open in Comparator**. `Esc` or **Cancel** closes
the selection (the corner icon stays).

**Popup file list:** in the toolbar popup, expand **Pick from detected files** to tick
auto-detected clips and star a reference, then **Open in Comparator**. Best when filenames
are meaningful.

**Replace vs Add** and the **destination URL** live in **⚙ Settings**. Default is Replace
(quietly saves the current comparison, then loads the new set).

## Permissions

- `activeTab` + `scripting` — inject `detect.js` into the page you're on, and
  `deliver.js` into the Comparator tab.
- `tabs` — find/open/focus the Comparator tab.
- `storage` — remember the destination URL, Replace/Add mode, and whether the widget is on.
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
- One reference image at a time (star one); CSS background images are P2.
- The **selector widget** finds elements that are actual `<video>`/`<img>` nodes; media
  painted to `<canvas>` or set as CSS backgrounds won't get a box yet.
- The widget runs on `<all_urls>` and shows its corner icon on every page while enabled;
  toggle it off in the popup when you don't need it.

## Roadmap (from [ROADMAP.md](../ROADMAP.md) #9)

- **P1 (this):** popup + direct-file `<video src>`/`<source>` grab + base64 handoff + image-as-reference.
- **P2:** in-page overlay tagging ✅ (now the persistent `widget.js`); CSS background images, frame-grab thumbnails — still open.
- **P3:** streamed-media capture/remux.

## Dashboard integration & prior art

The Decart eval-dashboard integration originated in the standalone
`/Users/zambav/Repos/video-compare-extension` repo (`content.js`). It's folded into this
unified extension as `content/dashboard.js` — same behavior, plus the extension icon on the
button — so there's a single extension to install. **Keeping `eval-dashboard.decart.ai`
working is top priority**; it shares the `IMPORT_VIDEO_URLS` → fetch → `LOAD_VIDEOS`
pipeline with the popup, so any change to the service worker must keep that path intact.
The old repo remains as the standalone original.
