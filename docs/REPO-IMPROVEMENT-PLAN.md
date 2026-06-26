# Repo presentation & documentation — plan

> Status: **planned, not started.** Agreed to hold execution until around the **Vercel
> migration** (see Constraints). This doc is the checklist to work from when we pick it up.

## Goals
Make the repo readable and professional for the **Decart team** (not a public showcase),
and document the app + extension well enough that a teammate can run, understand, and extend
both without a verbal handoff.

## Constraints & context (read first)
- **Audience: internal Decart team.** Favor clear setup + architecture over marketing polish.
  Skip OSS-only furniture (issue/PR templates, contributor CoC, fancy badges).
- **License: none / internal** (all-rights-reserved). No `LICENSE` file; a one-line
  "Internal Decart tool — not licensed for external use" note in the README is enough.
- **Vercel migration is coming (for privacy).** Today the app is on **public GitHub Pages**
  at `https://zamba-decart.github.io/video-compare-website/src/index.html`. We're moving to
  **Vercel** so the tool (and the internal data it touches) isn't served from a public host.
  Implications that shape this plan:
  - **Don't bake the Pages URL into docs/media yet** — the canonical URL changes post-migration.
    Centralize the live URL in one place so it's a one-line edit later.
  - **Privacy: never commit real dashboard content.** All screenshots/GIFs must use the
    bundled sample clips (`testing/clips/clip1-red…`, `portrait-teal`, `reference-sample.png`),
    **never** `eval-dashboard.decart.ai` footage, model names, or person/VTON videos.
  - **Decide repo visibility** as part of the migration: if the repo itself should be private,
    that's a separate call — but it affects how careful we must be about the dashboard
    integration details already in `chrome extension/` (model paths, the dashboard hostname).

## Sequencing: what's safe now vs. wait-for-Vercel
**Safe to do anytime (hosting-independent):**
- README content accuracy (Workstream A) — it's stale regardless of where it's hosted.
- Docs reorganization + ARCHITECTURE (Workstream D).
- Repo metadata that isn't the URL (topics) (Workstream C, partial).

**Wait for / align with the Vercel migration:**
- The live-demo link, "Run/Deploy" docs, and the repo **homepage** field (Workstream C) —
  set them to the Vercel URL once it exists.
- Demo media (Workstream B) — capture after the UI is final post-migration so we don't
  re-shoot; app shots first, extension shots in a follow-up (once loaded unpacked).
- Any privacy/visibility decisions.

---

## Workstream A — README overhaul (front door)
The current `README.md` predates several features and is the highest-value fix.

**Update stale/missing content:**
- [ ] **Chrome extension** section: popup file-list, the always-on **selector widget**
  (corner icon → click videos on any page), the **Decart dashboard** Compare buttons, and the
  Settings (destination URL + Replace/Add). Link `chrome extension/README.md`.
- [ ] **Reference panel**: the **size scaler** (slider) + the **drag divider** between the
  reference and the video; box-resizing behavior (1× = video size, up to 2×).
- [ ] **Resizers**: vertical media resizer (handle below the media) + the reference/video split.
- [ ] **Saved panel**: collapse + right-dock (sticky, scrolls to page bottom).
- [ ] **Keyboard map**: re-derive from `src/js/app.js` (`bindKeyboard`) — the current table
  lists keys that changed (`<` `>`, `0`, `L`); verify every row before publishing.

**Structure & polish:**
- [ ] Hero block: title, one-line tagline, live-demo button (URL filled in post-Vercel), hero image.
- [ ] Table of contents.
- [ ] Sections: Live demo · Features · Chrome extension · Keyboard · Run locally · Architecture · Docs.
- [ ] One-line "internal Decart tool" + privacy note (videos stay client-side).
- [ ] **Single source of truth for the live URL** (a link reference at the bottom) so the
  Vercel switch is a one-line change.

## Workstream B — Visual demo media  → `docs/media/`  (wait-for-Vercel)
Use **sample clips only** (privacy). Plan: do **app shots now-ish, extension shots in a follow-up.**
- [ ] App screenshots: grid view, overlay slider, reference panel + scaler, the dual resizers.
- [ ] Extension screenshots: popup, the on-page widget selecting clips, dashboard Compare button
  (use a throwaway/sample page, **not** the real dashboard).
- [ ] 1–2 short GIFs: slider wipe; importing via the widget.
- Capture method: app shots via the dev-server preview; extension shots require loading it
  unpacked. Keep files small (compress); store under `docs/media/`.

## Workstream C — Repo metadata & hygiene
- [ ] Topics: `video`, `comparison`, `vton`, `evaluation`, `chrome-extension`, `mv3`, `frontend`.
- [ ] **Homepage field → Vercel URL** (after migration).
- [ ] No `LICENSE` (internal); README note instead.
- [ ] Revisit `.gitignore` (already ignores media/`.claude/`); confirm nothing sensitive is tracked.

## Workstream D — Docs organization  → `docs/`
- [ ] Move `HANDOFF.md` and `ROADMAP.md` into `docs/` (keep the root to README · CHANGELOG).
- [ ] New `docs/ARCHITECTURE.md`:
  - module map (`src/js/*` responsibilities — already drafted in the README's structure block),
  - data flow (load → grid/overlay → save → IndexedDB session/saves),
  - the **`extImport.js` `LOAD_VIDEOS` bridge contract** (the one load-bearing interface
    between the extension and the app),
  - the overlay sizing model (`layoutStageRow`, `--ar`/`--ref-grow`/`--stage-h`).
- [ ] A small architecture **diagram** (SVG): page → extension (detect/widget/SW) → `LOAD_VIDEOS`
  → app (`extImport` → loaders → viewer) → IndexedDB.
- [ ] Cross-link the extension README; frame the repo as "the app + its companion extension."

## Workstream E — Extension presentation
- [ ] Promote `chrome extension/README.md` from the main README ("two tools, one repo").
- [ ] Install steps + an install GIF (load-unpacked) — sample page, not the dashboard.
- [ ] Note the dashboard integration is internal-only.

## Open decisions (resolve at migration time)
1. **Repo visibility** — keep public, or make private alongside the Vercel move? (Affects how
   much dashboard-specific detail we leave in `chrome extension/`.)
2. **Canonical live URL** — final Vercel domain to drop into README/homepage/extension default.
3. **Extension default destination** — update `chrome extension/` default URL (currently the
   Pages site) to the Vercel URL; ship as a new extension version.

## Definition of done
- README is accurate to the shipped app + extension, with a TOC and (eventually) hero media.
- `docs/` holds ARCHITECTURE + the moved HANDOFF/ROADMAP; root is clean.
- Live URL lives in exactly one place and points at Vercel.
- All committed media uses sample clips only — zero internal/dashboard content.
