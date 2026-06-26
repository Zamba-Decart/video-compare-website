// detect.js — page media scanner.
//
// Injected on demand into the active tab by the popup (via chrome.scripting.executeScript
// with `files`). It scans the page for videos and images and returns a plain,
// structure-cloneable summary as the script's completion value (the trailing IIFE).
//
// It does NOT fetch anything — it only reports URLs. The service worker does the
// fetching (it has the host permissions to bypass page CORS for direct files).
//
// "grabbable" = the media has a real http(s) URL we can fetch. blob:/MSE/HLS/DASH
// sources (YouTube and most streaming sites) have no fetchable file URL, so they are
// reported but flagged ungrabbable so the popup can grey them out honestly.

(function detectPageMedia() {
  const MAX_ITEMS = 80; // keep the popup manageable on media-heavy pages

  const toAbsolute = (url) => {
    if (!url) return '';
    try {
      return new URL(url, location.href).href;
    } catch (_) {
      return '';
    }
  };

  const isGrabbable = (url) => /^https?:\/\//i.test(url || '');

  const filenameFromUrl = (url, fallback) => {
    try {
      const u = new URL(url, location.href);
      const last = u.pathname.split('/').filter(Boolean).pop() || '';
      const clean = decodeURIComponent(last).split('?')[0];
      return clean || fallback;
    } catch (_) {
      return fallback;
    }
  };

  const ensureExt = (name, fallbackExt) =>
    (/\.[a-z0-9]{2,5}$/i.test(name) ? name : `${name}.${fallbackExt}`);

  const ungrabbableReason = (url) => {
    if (!url) return 'no source URL';
    if (url.startsWith('blob:')) return 'streamed (blob:) — can’t grab';
    if (url.startsWith('data:')) return 'inline data — skipped';
    if (url.startsWith('mediasource:')) return 'streamed (MSE) — can’t grab';
    return 'unsupported source';
  };

  // ---- videos -------------------------------------------------------------
  const videos = [];
  const seenVideo = new Set();

  const pushVideo = (rawSrc, { poster = '', width = null, height = null, duration = null } = {}) => {
    const src = toAbsolute(rawSrc);
    if (!src || seenVideo.has(src)) return;
    seenVideo.add(src);
    const grabbable = isGrabbable(src);
    videos.push({
      src,
      name: ensureExt(filenameFromUrl(src, `video-${videos.length + 1}`), 'mp4'),
      poster: toAbsolute(poster),
      width: width || null,
      height: height || null,
      duration: Number.isFinite(duration) ? duration : null,
      grabbable,
      reason: grabbable ? '' : ungrabbableReason(rawSrc.startsWith('blob:') || rawSrc.startsWith('data:') ? rawSrc : src)
    });
  };

  document.querySelectorAll('video').forEach((video) => {
    const meta = {
      poster: video.poster || '',
      width: video.videoWidth || null,
      height: video.videoHeight || null,
      duration: Number.isFinite(video.duration) ? video.duration : null
    };
    // Prefer the actually-playing source, but also surface declared <source> URLs.
    const direct = video.getAttribute('src');
    const current = video.currentSrc;
    // currentSrc surfaces a <video> whose source is blob:/MSE — still worth a (greyed) row.
    if (direct) pushVideo(direct, meta);
    else if (current) pushVideo(current, meta);
    video.querySelectorAll('source[src]').forEach((s) => pushVideo(s.getAttribute('src'), meta));
  });

  // og:video / twitter:player meta tags (often a real file URL even when the
  // on-page player is a streamed blob).
  document
    .querySelectorAll('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"], meta[name="twitter:player:stream"]')
    .forEach((m) => pushVideo(m.getAttribute('content'), {}));

  // ---- images (reference-image candidates) --------------------------------
  const images = [];
  const seenImage = new Set();

  const pushImage = (rawSrc, { width = null, height = null, alt = '' } = {}) => {
    const src = toAbsolute(rawSrc);
    if (!src || seenImage.has(src)) return;
    seenImage.add(src);
    const grabbable = isGrabbable(src);
    images.push({
      src,
      name: ensureExt(filenameFromUrl(src, `image-${images.length + 1}`), 'jpg'),
      width: width || null,
      height: height || null,
      alt: (alt || '').slice(0, 120),
      grabbable,
      reason: grabbable ? '' : ungrabbableReason(src)
    });
  };

  // og:image first — it's usually the page's canonical reference image.
  document
    .querySelectorAll('meta[property="og:image"], meta[property="og:image:url"], meta[property="og:image:secure_url"]')
    .forEach((m) => pushImage(m.getAttribute('content'), { alt: 'og:image' }));

  document.querySelectorAll('img').forEach((img) => {
    // Skip sprites / icons / tracking pixels.
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (w && h && (w < 64 || h < 64)) return;
    pushImage(img.currentSrc || img.getAttribute('src'), { width: w || null, height: h || null, alt: img.alt });
  });

  // Grabbable first, then by area (bigger images make better references).
  images.sort((a, b) => {
    if (a.grabbable !== b.grabbable) return a.grabbable ? -1 : 1;
    return ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0));
  });

  return {
    pageTitle: document.title || '',
    pageUrl: location.href,
    videos: videos.slice(0, MAX_ITEMS),
    images: images.slice(0, MAX_ITEMS)
  };
})();
