# Video Compare Website

A local, browser-only video comparison viewer — the video counterpart to
[image-compare-website](https://zambav.github.io/image-compare-website/src/index.html).
Drop in several AI-generated clips (or render passes / before-after edits), see them
side by side in sync, then overlay any two for a frame-accurate slider / dissolve / toggle compare.

**Live:** https://zamba-decart.github.io/video-compare-website/src/index.html

Everything runs client-side. Videos never leave your machine — they're loaded as local blob URLs.

## What it does

- **Drop up to 4 videos** → they appear **side by side** in an adaptive grid (spread view).
- **Synced playback** — one master transport drives every video together:
  play/pause, scrub, **loop**, **autoplay**, mute, playback speed, and **frame stepping**.
  Lagging videos are drift-corrected so frames stay aligned.
- **Select two** (assign **A** / **B**) → switch to **Overlay** and compare with the same
  modes as the image tool:
  - **Slider** — draggable wipe between A and B
  - **Dissolve** — opacity blend (A↔B slider)
  - **Toggle** — click to flip between A and B
- **Zoom & pan** (wheel to zoom to cursor, shift-drag or right-drag to pan), **flip H/V**,
  **rotate**, **reset view**, **swap A/B**, **fullscreen**.
- **Export the current frame** of the comparison as a composited PNG.

## Keyboard

| Key | Action | Key | Action |
|-----|--------|-----|--------|
| `Space` | play / pause | `S` `D` `T` | slider / dissolve / toggle |
| `,` `.` | step one frame back / fwd | `← →` | scrub (Shift = ±5s) |
| `wheel` | zoom to cursor | `shift+drag` | pan |
| `0` | reset view | `F` | fullscreen |
| `L` | loop | `M` | mute |
| `+` `-` | zoom in / out | `E` | export frame (overlay) |

## Project structure

```
video-compare-website/
├─ index.html              # redirect → src/index.html (GitHub Pages root)
├─ assets/                 # favicons
└─ src/
   ├─ index.html           # markup
   ├─ css/styles.css       # dark theme (ported from image-compare) + grid/transport
   └─ js/
      ├─ state.js          # global state
      ├─ dom.js            # cached element refs
      ├─ loaders.js        # multi-video upload + drag/drop
      ├─ grid.js           # spread/grid view + A/B selection
      ├─ playback.js       # synced master transport + drift correction
      ├─ viewer.js         # overlay render (slider / dissolve / toggle + transforms)
      ├─ export.js         # export current frame as PNG
      └─ app.js            # orchestration, events, keyboard
```

## Running locally

It's a static site — open `src/index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000/src/index.html
```

## Not yet (deferred)

- Persisting loaded videos across reloads (videos are large; re-drop each session).
- Saved-comparison gallery, metadata sidecar parsing.
- Recording the overlay as a video (only single-frame PNG export today).
- N-way overlay of 3–4 videos at once (overlay is 2-up; the grid shows all).
