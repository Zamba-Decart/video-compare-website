// dashboard.js — Decart eval-dashboard integration (compatibility, top priority).
//
// Ported from the standalone video-compare-extension. Statically injected on
// https://eval-dashboard.decart.ai/* (see manifest content_scripts). It adds a
// "Compare" button beside each row's download button; clicking it grabs that row's
// videos (+ any reference image) and sends them to the service worker via the same
// IMPORT_VIDEO_URLS contract the popup uses. The worker fetches, base64-encodes, and
// delivers them to the Comparator — so the dashboard path stays identical to before,
// now with the extension icon on the button.

const DOWNLOAD_BUTTON_SELECTOR = [
  'button[aria-label="Download row composite"]',
  'button[title="Download composite (ref + cells)"]'
].join(',');

const IMPORT_BUTTON_ATTR = 'data-video-compare-import';
const PROCESSED_BUTTON_ATTR = 'data-video-compare-import-processed';
const LABEL_CLASS = 'vc-import-label';
const STYLE_ID = 'video-compare-import-style';
const MODELISH_PATTERN = /(?:^|[_\s-])(eval|dmd|sparse|dense|latest|baseline|model|ref|reference|cell|1080p|720p|480p)(?:$|[_\s-])/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITLE_LABEL_PATTERN = /\b(Input|Output|Reference|Ref|Src|Cell|Target|Composite)\s*:\s*([^\n\r|]+)/gi;

function filenameFromUrl(src, fallback = 'video.mp4') {
  try {
    const url = new URL(src, location.href);
    const part = url.pathname.split('/').filter(Boolean).pop();
    return part || fallback;
  } catch (error) {
    return fallback;
  }
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function isUsefulLabel(text) {
  const value = cleanText(text);
  if (!value || value.length < 3 || value.length > 120) return false;
  if (/^(download|compare|importing|sent|failed|no videos)$/i.test(value)) return false;
  if (UUID_PATTERN.test(value)) return false;
  if (/^[0-9_.-]+$/.test(value)) return false;
  TITLE_LABEL_PATTERN.lastIndex = 0;
  return TITLE_LABEL_PATTERN.test(value) || MODELISH_PATTERN.test(value) || value.includes('_');
}

function titleLabelsFromText(text, { includeReference = false } = {}) {
  const labels = [];
  const value = text || '';
  TITLE_LABEL_PATTERN.lastIndex = 0;
  let match = TITLE_LABEL_PATTERN.exec(value);

  while (match) {
    const kind = cleanText(match[1]);
    const name = cleanText(match[2]).replace(/\b(download|compare)\b.*$/i, '').trim();
    if (name && (includeReference || !/^ref(erence)?$/i.test(kind))) {
      labels.push(`${kind}: ${name}`);
    }
    match = TITLE_LABEL_PATTERN.exec(value);
  }

  return labels;
}

function safeName(text, fallback) {
  const base = cleanText(text)
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 96);

  return base || fallback;
}

function textCandidates(root) {
  const candidates = [];
  titleLabelsFromText(root.innerText || root.textContent || '').forEach((label) => candidates.push(label));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);

  for (let node = root; node; node = walker.nextNode()) {
    if (node.matches?.('button, svg, script, style, video')) continue;
    const aria = node.getAttribute?.('aria-label') || node.getAttribute?.('title');
    if (isUsefulLabel(aria)) candidates.push(cleanText(aria));

    const directText = Array.from(node.childNodes || [])
      .filter((child) => child.nodeType === Node.TEXT_NODE)
      .map((child) => child.textContent)
      .join(' ');

    if (isUsefulLabel(directText)) candidates.push(cleanText(directText));
  }

  return Array.from(new Set(candidates));
}

function closestUsefulText(video) {
  let node = video.parentElement;

  for (let depth = 0; node && depth < 6; depth += 1) {
    const candidates = textCandidates(node);
    if (candidates.length) return candidates[0];
    node = node.parentElement;
  }

  return '';
}

function labelSetForRoot(root) {
  return textCandidates(root).slice(0, 16);
}

function preferredLabelForIndex(labels, index) {
  if (!labels.length) return '';
  const nonReference = labels.filter((label) => !/^ref(erence)?\s*:/i.test(label));
  return nonReference[index] || nonReference[0] || labels[index] || labels[0] || '';
}

function videoLabel(video, index, labels = []) {
  const aria = video.getAttribute('aria-label') || video.getAttribute('title');
  if (isUsefulLabel(aria)) return cleanText(aria);

  const closest = closestUsefulText(video);
  if (closest) return closest;

  const indexed = preferredLabelForIndex(labels, index);
  if (indexed) return indexed;

  const src = video.currentSrc || video.src || '';
  return filenameFromUrl(src, `video-${index + 1}.mp4`);
}

// The dashboard lazy-loads the model-output cells: until scrolled into view a cell's
// <video> has NO src — only a poster `…/assets/<id>.thumb.jpg`. The video is the same
// asset, `…/assets/<id>.mp4` (verified against the live dashboard). So when there's no
// src, recover the URL from the poster attribute (which React renders to the DOM, and
// which a content script can read — unlike the page's React props).
function videoUrlFromPoster(poster) {
  if (poster && /\.thumb\.jpg(?:[?#]|$)/i.test(poster)) {
    return poster.replace(/\.thumb\.jpg(?:\?[^#]*)?(?:#.*)?$/i, '.mp4');
  }
  return '';
}

// Output assets live at `…/results/<model>/step_<n>/…`; the <model> segment is the
// meaningful name to show (far better than a UUID filename).
function modelLabelFromUrl(url) {
  const m = /\/results\/([^/]+)\//.exec(url || '');
  return m ? m[1] : '';
}

function metadataForVideo(video, index, labels = []) {
  // Sites can opt in explicitly (eval-viewer does — its tiles are lazy and have no
  // src until scrolled into view) by stamping the asset URL + clip name on the element.
  const dataUrl = video.dataset?.vcUrl || '';
  const dataName = video.dataset?.vcName || '';

  let src = dataUrl
    || video.currentSrc
    || video.getAttribute('src')
    || video.querySelector('source[src]')?.getAttribute('src')
    || '';
  if (!src) src = videoUrlFromPoster(video.getAttribute('poster') || '');
  if (!src) return null;

  const absolute = new URL(src, location.href).href;
  const model = modelLabelFromUrl(absolute);

  const label = dataName.replace(/\.[a-z0-9]{2,5}$/i, '') || model || videoLabel(video, index, labels);
  const fallback = filenameFromUrl(src, `video-${index + 1}.mp4`);
  const hasExtension = /\.[a-z0-9]{2,5}$/i.test(label);
  const name = hasExtension ? safeName(label, fallback) : `${safeName(label, fallback)}.mp4`;

  return {
    id: absolute,
    src: absolute,
    name,
    label,
    poster: video.poster || '',
    duration: Number.isFinite(video.duration) ? video.duration : null,
    width: video.videoWidth || null,
    height: video.videoHeight || null
  };
}

function uniqueVideos(videos) {
  const seen = new Set();
  return videos.filter((video) => {
    if (!video || seen.has(video.src)) return false;
    seen.add(video.src);
    return true;
  });
}

function extractVideos(root = document) {
  const labels = labelSetForRoot(root);
  const videos = Array.from(root.querySelectorAll('video'))
    .map((video, index) => metadataForVideo(video, index, labels))
    .filter(Boolean);

  return uniqueVideos(videos);
}

function setNameForRoot(root) {
  const labels = labelSetForRoot(root);
  return labels[0] || document.title || 'Decart evaluation';
}

function referenceImageForRoot(root) {
  const images = Array.from(root.querySelectorAll('img'));
  const image = images.find((img) => {
    const text = `${img.alt || ''} ${img.title || ''} ${img.getAttribute('aria-label') || ''}`;
    return /\breference\b/i.test(text);
  });
  if (!image?.src) return null;

  const labels = titleLabelsFromText(root.innerText || root.textContent || '', { includeReference: true });
  const label = labels.find((item) => /^ref(erence)?\s*:/i.test(item)) || cleanText(image.alt) || 'Reference';
  const src = new URL(image.src, location.href).href;

  return {
    src,
    name: `${safeName(label, 'reference')}.${filenameFromUrl(src, 'reference.jpg').split('.').pop() || 'jpg'}`,
    label
  };
}

function rootHasReferenceImage(root) {
  return Array.from(root.querySelectorAll('img')).some((img) => {
    const text = `${img.alt || ''} ${img.title || ''} ${img.getAttribute('aria-label') || ''}`;
    return /\breference\b/i.test(text);
  });
}

// The download button is the "row composite (ref + cells)" control, so the row
// container holds the reference image AND every cell video. Climbing to the FIRST
// ancestor with any video stops inside a single cell (→ only one video imported).
// Instead, climb to the smallest ancestor that holds the whole composite: the
// reference image, or at least two videos. Fall back to the first video-bearing
// ancestor if neither materialises.
function findRowContainer(button) {
  let node = button.parentElement;
  let firstWithVideo = null;

  for (let depth = 0; node && depth < 14; depth += 1, node = node.parentElement) {
    const videoCount = node.querySelectorAll('video').length;
    if (videoCount === 0) continue;
    if (!firstWithVideo) firstWithVideo = node;
    if (videoCount >= 2 || rootHasReferenceImage(node)) return node;
  }

  return firstWithVideo || document;
}

function extractVideosForButton(button) {
  const row = findRowContainer(button);
  const rowVideos = extractVideos(row);
  const videos = rowVideos.length ? rowVideos : extractVideos(document);
  const setName = setNameForRoot(row);
  const referenceImage = referenceImageForRoot(row);

  const namedVideos = videos.map((video, index) => {
    if (!UUID_PATTERN.test((video.name || '').replace(/\.[a-z0-9]{2,5}$/i, ''))) return video;

    const base = safeName(`${setName}_${index + 1}`, `video-${index + 1}`);
    return { ...video, name: `${base}.mp4`, label: `${setName} ${index + 1}` };
  });

  namedVideos.referenceImage = referenceImage;
  return namedVideos;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    [${IMPORT_BUTTON_ATTR}] {
      display: inline-flex !important;
      align-items: center;
      gap: 5px;
      border-color: color-mix(in srgb, currentColor 35%, transparent) !important;
    }

    [${IMPORT_BUTTON_ATTR}] .${LABEL_CLASS} { line-height: 1; }

    [${IMPORT_BUTTON_ATTR}] img {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      flex: none;
    }

    [${IMPORT_BUTTON_ATTR}][data-status="working"] {
      opacity: .7;
      pointer-events: none;
    }
  `;
  document.documentElement.appendChild(style);
}

// Keep the extension icon on the button by only swapping the label span's text.
function setLabel(button, text) {
  const label = button.querySelector(`.${LABEL_CLASS}`);
  if (label) label.textContent = text;
  else button.textContent = text;
}

function makeImportButton(downloadButton) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = downloadButton.className;
  button.setAttribute(IMPORT_BUTTON_ATTR, 'true');
  button.setAttribute('title', 'Import this row into Video Comparator');
  button.setAttribute('aria-label', 'Import row into Video Comparator');

  const icon = document.createElement('img');
  icon.src = chrome.runtime.getURL('icons/icon48.png');
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = LABEL_CLASS;
  label.textContent = 'Compare';

  button.append(icon, label);

  button.addEventListener('click', () => {
    const videos = extractVideosForButton(downloadButton);
    const referenceImage = videos.referenceImage || null;
    if (!videos.length) {
      setLabel(button, 'No videos');
      setTimeout(() => setLabel(button, 'Compare'), 1600);
      return;
    }

    button.dataset.status = 'working';
    setLabel(button, 'Importing…');

    // No mode → the service worker applies the Replace/Add choice from settings.
    sendImportMessage({ type: 'IMPORT_VIDEO_URLS', videos, referenceImage }, button);
  });

  return button;
}

function markImportFailed(button, error) {
  button.dataset.status = '';
  const message = String(error?.message || error || '');
  const contextInvalidated = /context invalidated|extension context/i.test(message);
  setLabel(button, contextInvalidated ? 'Refresh page' : 'Failed');
  button.title = contextInvalidated
    ? 'Reload this Decart tab after reloading the extension, then click Compare again.'
    : 'Import failed. Check the extension service worker console.';
  console.error('Video compare import failed', error);
  if (!contextInvalidated) setTimeout(() => setLabel(button, 'Compare'), 2000);
}

function sendImportMessage(payload, button) {
  try {
    chrome.runtime.sendMessage(payload, (response) => {
      let runtimeError = null;
      try {
        runtimeError = chrome.runtime.lastError;
      } catch (error) {
        runtimeError = error;
      }

      if (runtimeError || !response?.ok) {
        markImportFailed(button, runtimeError || response?.error);
        return;
      }

      button.dataset.status = '';
      button.title = 'Import this row into Video Comparator';
      setLabel(button, 'Sent');
      setTimeout(() => setLabel(button, 'Compare'), 1600);
    });
  } catch (error) {
    markImportFailed(button, error);
  }
}

function injectImportButtons() {
  ensureStyles();

  document.querySelectorAll(DOWNLOAD_BUTTON_SELECTOR).forEach((downloadButton) => {
    if (downloadButton.hasAttribute(PROCESSED_BUTTON_ATTR)) return;
    downloadButton.setAttribute(PROCESSED_BUTTON_ATTR, 'true');
    downloadButton.insertAdjacentElement('afterend', makeImportButton(downloadButton));
  });
}

function scheduleInjection() {
  window.requestAnimationFrame(injectImportButtons);
}

scheduleInjection();

const observer = new MutationObserver(scheduleInjection);
observer.observe(document.documentElement, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_VIDEO_URLS') {
    const videos = extractVideos(document);
    sendResponse({ videos, referenceImage: referenceImageForRoot(document) });
    return false;
  }

  if (message?.type === 'GET_ROW_VIDEO_URLS') {
    const buttons = Array.from(document.querySelectorAll(DOWNLOAD_BUTTON_SELECTOR));
    const button = buttons[message.index || 0];
    const videos = button ? extractVideosForButton(button) : [];
    sendResponse({ videos, referenceImage: videos.referenceImage || null });
    return false;
  }

  return false;
});
