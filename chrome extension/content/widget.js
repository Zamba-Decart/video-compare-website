// widget.js — the always-on page widget.
//
// Runs on every page (manifest content_scripts: <all_urls>). It does nothing visible
// until the user enables the widget (storage flag `widgetEnabled`, toggled from the
// popup). When enabled, it shows a small icon in the top-right corner of every page;
// clicking it opens the in-page selector overlay (highlight boxes over videos/images —
// click to pick, no filenames needed) and "Open in Comparator" sends them through the
// shared IMPORT_VIDEO_URLS pipeline. The selector closes after; the corner icon stays.

(() => {
  if (window.__vcWidget) return;
  window.__vcWidget = true;

  const KEY = 'widgetEnabled';
  const Z = 2147483600;
  const isGrabbable = (url) => /^https?:\/\//i.test(url || '');

  let iconEl = null;
  let overlay = null; // controller while the selector is open

  // ---- corner icon --------------------------------------------------------
  function buildIcon() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = '__vc_widget_icon';
    btn.title = 'Video selector — click to pick videos for the Comparator';
    btn.style.cssText =
      `position:fixed;top:14px;right:14px;z-index:${Z};width:44px;height:44px;padding:0;` +
      `display:flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;` +
      `background:#101114ee;border:1px solid #7dd3fc;box-shadow:0 4px 16px #0009;` +
      `transition:transform .12s,box-shadow .12s;`;
    btn.onmouseenter = () => { btn.style.transform = 'scale(1.08)'; };
    btn.onmouseleave = () => { btn.style.transform = overlay ? 'scale(1.08)' : 'scale(1)'; };

    const img = document.createElement('img');
    img.src = chrome.runtime.getURL('icons/icon48.png');
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.style.cssText = 'width:28px;height:28px;border-radius:7px;pointer-events:none;';
    btn.appendChild(img);

    btn.addEventListener('click', toggleOverlay);
    (document.body || document.documentElement).appendChild(btn);
    return btn;
  }

  function showIcon() {
    if (!iconEl) iconEl = buildIcon();
    iconEl.style.display = 'flex';
  }
  function hideIcon() {
    if (iconEl) iconEl.style.display = 'none';
    if (overlay) overlay.close();
  }
  function reflectActive() {
    if (iconEl) {
      iconEl.style.boxShadow = overlay ? '0 0 0 3px #e6f85e88, 0 4px 16px #0009' : '0 4px 16px #0009';
      iconEl.style.transform = overlay ? 'scale(1.08)' : 'scale(1)';
    }
  }

  function toggleOverlay() {
    if (overlay) overlay.close();
    else overlay = createOverlay(() => { overlay = null; reflectActive(); });
    reflectActive();
  }

  // ---- selector overlay (click boxes over media) --------------------------
  function createOverlay(onClose) {
    const MAX_CLIPS = 4;
    const videoSrc = (v) => v.currentSrc || v.getAttribute('src') || v.querySelector('source[src]')?.src || '';
    const imageSrc = (img) => img.currentSrc || img.getAttribute('src') || '';
    const extFromUrl = (url, fallback) => {
      try {
        const m = new URL(url, location.href).pathname.match(/\.([a-z0-9]{2,5})$/i);
        return m ? m[1].toLowerCase() : fallback;
      } catch (_) { return fallback; }
    };

    const boxes = new Map();
    const clips = [];
    let refEl = null;
    let showImages = false;
    let busy = false;
    let raf = null;
    let frame = 0;

    const root = document.createElement('div');
    root.style.cssText =
      `position:fixed;inset:0;z-index:${Z - 1};pointer-events:none;` +
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
    tip.style.cssText = 'color:#a1a1aa;max-width:300px;';
    tip.textContent = 'Click videos to pick them in order. Esc to cancel.';

    const count = document.createElement('span');
    count.style.cssText = 'font-weight:650;white-space:nowrap;';

    const imgToggle = mkBtn('＋ reference image');
    imgToggle.title = 'Show images so you can star one as the reference';
    imgToggle.addEventListener('click', () => {
      showImages = !showImages;
      imgToggle.style.borderColor = showImages ? '#c084fc' : '#3b3f47';
      imgToggle.textContent = showImages ? '✓ images shown' : '＋ reference image';
      rescan();
      render();
    });

    const openBtn = mkBtn('Open in Comparator', true);
    openBtn.addEventListener('click', open);

    const cancelBtn = mkBtn('Cancel');
    cancelBtn.addEventListener('click', close);

    bar.append(tip, count, imgToggle, openBtn, cancelBtn);

    function mkBtn(label, primary = false) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText =
        `font:inherit;font-size:12px;padding:7px 11px;border-radius:8px;cursor:pointer;white-space:nowrap;` +
        (primary
          ? 'background:#e6f85e;color:#111;border:1px solid #e6f85e;font-weight:650;'
          : 'background:#1b1d22;color:#f4f4f5;border:1px solid #3b3f47;');
      return b;
    }

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

    function tick() {
      if (frame++ % 20 === 0) rescan();
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
        if (!isGrabbable(src)) {
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

      // No mode → the service worker applies the Replace/Add choice from settings.
      chrome.runtime.sendMessage({ type: 'IMPORT_VIDEO_URLS', videos, referenceImage }, (response) => {
        busy = false;
        if (chrome.runtime.lastError || !response?.ok) {
          tip.style.color = '#fda4af';
          tip.textContent = chrome.runtime.lastError?.message || response?.error || 'Import failed.';
          return;
        }
        close();
      });
    }

    function onKey(e) { if (e.key === 'Escape') close(); }

    function close() {
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      if (typeof onClose === 'function') onClose();
    }

    document.addEventListener('keydown', onKey, true);
    rescan();
    tick();
    return { close };
  }

  // ---- enable/disable wiring ----------------------------------------------
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === 'sync' || area === 'local') && KEY in changes) {
      changes[KEY].newValue ? showIcon() : hideIcon();
    }
  });

  chrome.storage.sync.get(KEY).then(({ [KEY]: enabled }) => {
    if (enabled) showIcon();
  }).catch(() => {});
})();
