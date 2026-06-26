// overlay.js — in-page visual selector.
//
// Injected on demand (popup → "Pick on page"). It draws clickable highlight boxes
// over every <video> (and, optionally, every <img>) on the page so you can select
// clips by *pointing at them* — no filenames needed. Click videos to number them in
// order; flip on "images" to star one as the reference. "Open in Comparator" sends the
// chosen URLs through the same IMPORT_VIDEO_URLS path the popup and dashboard use.
//
// Works on any page (host_permissions: <all_urls>), including the eval dashboard and
// internal tools where video names are opaque.

(() => {
  if (window.__vcOverlay) { window.__vcOverlay.flash(); return; }

  const Z = 2147483600;
  const MAX_CLIPS = 4; // the Comparator grid holds up to 4
  const isGrabbable = (url) => /^https?:\/\//i.test(url || '');

  const videoSrc = (v) =>
    v.currentSrc || v.getAttribute('src') || v.querySelector('source[src]')?.src || '';
  const imageSrc = (img) => img.currentSrc || img.getAttribute('src') || '';

  const extFromUrl = (url, fallback) => {
    try {
      const m = new URL(url, location.href).pathname.match(/\.([a-z0-9]{2,5})$/i);
      return m ? m[1].toLowerCase() : fallback;
    } catch (_) { return fallback; }
  };

  // ---- state --------------------------------------------------------------
  const boxes = new Map();     // element -> { el, kind }
  const clips = [];            // selected <video> elements, in click order
  let refEl = null;            // selected <img> element (reference)
  let showImages = false;
  let mode = 'replace';
  let busy = false;

  // ---- DOM scaffold -------------------------------------------------------
  const root = document.createElement('div');
  root.id = '__vc_overlay_root';
  root.style.cssText =
    `position:fixed;inset:0;z-index:${Z};pointer-events:none;` +
    `font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;`;
  (document.body || document.documentElement).appendChild(root);

  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;';
  root.appendChild(layer);

  const bar = document.createElement('div');
  bar.style.cssText =
    `position:fixed;left:50%;bottom:18px;transform:translateX(-50%);pointer-events:auto;` +
    `display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;` +
    `background:#101114ee;color:#f4f4f5;border:1px solid #3b3f47;` +
    `box-shadow:0 8px 30px #000a;backdrop-filter:blur(6px);font-size:13px;line-height:1;`;
  root.appendChild(bar);

  const tip = document.createElement('span');
  tip.style.cssText = 'color:#a1a1aa;max-width:280px;';
  tip.textContent = 'Click videos to pick them in order. Esc to cancel.';

  const count = document.createElement('span');
  count.style.cssText = 'font-weight:650;white-space:nowrap;';

  const imgToggle = document.createElement('button');
  styleBtn(imgToggle);
  imgToggle.textContent = '＋ reference image';
  imgToggle.title = 'Show images so you can star one as the reference';
  imgToggle.addEventListener('click', () => {
    showImages = !showImages;
    imgToggle.style.borderColor = showImages ? '#c084fc' : '#3b3f47';
    imgToggle.textContent = showImages ? '✓ images shown' : '＋ reference image';
    rescan();
    render();
  });

  const modeBtn = document.createElement('button');
  styleBtn(modeBtn);
  setModeLabel();
  modeBtn.addEventListener('click', () => {
    mode = mode === 'replace' ? 'append' : 'replace';
    setModeLabel();
  });

  const openBtn = document.createElement('button');
  styleBtn(openBtn, true);
  openBtn.textContent = 'Open in Comparator';
  openBtn.addEventListener('click', open);

  const cancelBtn = document.createElement('button');
  styleBtn(cancelBtn);
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', teardown);

  bar.append(tip, count, imgToggle, modeBtn, openBtn, cancelBtn);

  function styleBtn(b, primary = false) {
    b.type = 'button';
    b.style.cssText =
      `font:inherit;font-size:12px;padding:7px 11px;border-radius:8px;cursor:pointer;white-space:nowrap;` +
      (primary
        ? 'background:#e6f85e;color:#111;border:1px solid #e6f85e;font-weight:650;'
        : 'background:#1b1d22;color:#f4f4f5;border:1px solid #3b3f47;');
  }
  function setModeLabel() { modeBtn.textContent = mode === 'replace' ? 'Mode: Replace' : 'Mode: Add'; }

  // ---- scanning & boxes ---------------------------------------------------
  function makeBox(el, kind) {
    const box = document.createElement('div');
    box.style.cssText =
      'position:fixed;box-sizing:border-box;pointer-events:auto;cursor:pointer;border-radius:6px;' +
      'transition:border-color .1s,background .1s;';
    const badge = document.createElement('div');
    badge.style.cssText =
      'position:absolute;top:4px;left:4px;min-width:20px;height:20px;padding:0 6px;border-radius:11px;' +
      'display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#111;';
    box.appendChild(badge);
    box.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onPick(el, kind); });
    layer.appendChild(box);
    return { box, badge, kind };
  }

  function rescan() {
    const wanted = new Set();

    document.querySelectorAll('video').forEach((v) => {
      wanted.add(v);
      if (!boxes.has(v)) boxes.set(v, makeBox(v, 'video'));
    });

    if (showImages) {
      document.querySelectorAll('img').forEach((img) => {
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if (w && h && (w < 64 || h < 64)) return;
        wanted.add(img);
        if (!boxes.has(img)) boxes.set(img, makeBox(img, 'image'));
      });
    }

    // Drop boxes whose element is gone or no longer wanted.
    for (const [el, info] of boxes) {
      if (!wanted.has(el) || !el.isConnected) {
        info.box.remove();
        boxes.delete(el);
        const i = clips.indexOf(el);
        if (i >= 0) clips.splice(i, 1);
        if (refEl === el) refEl = null;
      }
    }
  }

  function onPick(el, kind) {
    const grabbable = isGrabbable(kind === 'video' ? videoSrc(el) : imageSrc(el));
    if (!grabbable) return;

    if (kind === 'video') {
      const i = clips.indexOf(el);
      if (i >= 0) clips.splice(i, 1);
      else if (clips.length < MAX_CLIPS) clips.push(el);
    } else {
      refEl = refEl === el ? null : el;
    }
    render();
  }

  // ---- positioning & paint (single rAF loop tracks scroll on SPAs) --------
  let frame = 0;
  function tick() {
    if (frame++ % 20 === 0) rescan();   // catch lazily-added videos
    render();
    raf = requestAnimationFrame(tick);
  }

  function render() {
    for (const [el, info] of boxes) {
      const r = el.getBoundingClientRect();
      const visible = r.width > 8 && r.height > 8 &&
        r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      if (!visible) { info.box.style.display = 'none'; continue; }

      info.box.style.display = 'block';
      info.box.style.left = `${r.left}px`;
      info.box.style.top = `${r.top}px`;
      info.box.style.width = `${r.width}px`;
      info.box.style.height = `${r.height}px`;

      const src = info.kind === 'video' ? videoSrc(el) : imageSrc(el);
      const grabbable = isGrabbable(src);

      if (!grabbable) {
        info.box.style.border = '2px dashed #6b7280';
        info.box.style.background = '#6b728022';
        info.box.title = 'streamed (blob:) — can’t grab';
        info.badge.style.display = 'none';
        info.box.style.cursor = 'not-allowed';
        continue;
      }
      info.box.style.cursor = 'pointer';
      info.box.title = '';

      if (info.kind === 'video') {
        const n = clips.indexOf(el);
        const on = n >= 0;
        info.box.style.border = on ? '3px solid #7dd3fc' : '2px solid #7dd3fc99';
        info.box.style.background = on ? '#7dd3fc26' : 'transparent';
        info.badge.style.display = on ? 'flex' : 'none';
        info.badge.style.background = '#7dd3fc';
        info.badge.textContent = on ? String(n + 1) : '';
      } else {
        const on = refEl === el;
        info.box.style.border = on ? '3px solid #c084fc' : '2px dashed #c084fc99';
        info.box.style.background = on ? '#c084fc26' : 'transparent';
        info.badge.style.display = on ? 'flex' : 'none';
        info.badge.style.background = '#c084fc';
        info.badge.textContent = on ? 'R' : '';
      }
    }

    const parts = [`${clips.length} video${clips.length === 1 ? '' : 's'}`];
    if (refEl) parts.push('+ ref');
    count.textContent = parts.join(' ');
    openBtn.disabled = busy || clips.length === 0;
    openBtn.style.opacity = openBtn.disabled ? '0.55' : '1';
  }

  // ---- actions ------------------------------------------------------------
  function open() {
    if (busy || !clips.length) return;
    busy = true;
    tip.textContent = 'Fetching & opening…';

    const videos = clips.map((el, i) => ({
      src: videoSrc(el),
      name: `clip-${i + 1}.${extFromUrl(videoSrc(el), 'mp4')}`
    }));
    const referenceImage = refEl
      ? { src: imageSrc(refEl), name: `reference.${extFromUrl(imageSrc(refEl), 'jpg')}`, label: 'Reference' }
      : null;

    chrome.runtime.sendMessage({ type: 'IMPORT_VIDEO_URLS', mode, videos, referenceImage }, (response) => {
      busy = false;
      if (chrome.runtime.lastError || !response?.ok) {
        tip.style.color = '#fda4af';
        tip.textContent = chrome.runtime.lastError?.message || response?.error || 'Import failed.';
        return;
      }
      teardown();
    });
  }

  let raf = null;
  function onKey(e) { if (e.key === 'Escape') teardown(); }

  function teardown() {
    if (raf) cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    delete window.__vcOverlay;
  }

  window.__vcOverlay = {
    flash() { bar.animate?.([{ outline: '2px solid #e6f85e' }, { outline: 'none' }], { duration: 600 }); }
  };
  document.addEventListener('keydown', onKey, true);
  rescan();
  tick();
})();
