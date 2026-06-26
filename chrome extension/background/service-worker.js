// service-worker.js — orchestrator.
//
// Flow: popup sends IMPORT_VIDEO_URLS { videos:[{src,name}], referenceImage, mode }
//   1. fetch each chosen URL (host_permissions: <all_urls> bypasses page CORS)
//   2. base64-encode it into a data: URL (the only transport extImport.js accepts
//      reliably — raw Blob/ArrayBuffer get mangled through chrome messaging)
//   3. find or open the Comparator tab (URL is configurable; see options page)
//   4. inject deliver.js and hand it the payload, which it posts to the page.

const DEFAULT_COMPARATOR_URL = 'https://zamba-decart.github.io/video-compare-website/src/index.html';

async function getComparatorUrl() {
  try {
    const { comparatorUrl } = await chrome.storage.sync.get('comparatorUrl');
    if (typeof comparatorUrl === 'string' && /^https?:\/\//i.test(comparatorUrl)) return comparatorUrl;
  } catch (_) { /* fall through to default */ }
  return DEFAULT_COMPARATOR_URL;
}

// A chrome.tabs.query match pattern can't include a port, so query broadly by
// scheme+host and then filter precisely by the full origin+path prefix in JS
// (origin keeps the port, e.g. http://localhost:8765, so localhost still matches).
function queryPatternFor(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}/*`;
}
function tabPrefixFor(url) {
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
}

// ---- media → base64 -------------------------------------------------------
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function blobToDataUrl(blob, fallbackType) {
  const base64 = arrayBufferToBase64(await blob.arrayBuffer());
  return `data:${blob.type || fallbackType};base64,${base64}`;
}

async function fetchAsDescriptor(item, fallbackType, fallbackName) {
  const res = await fetch(item.src);
  if (!res.ok) throw new Error(`Failed to fetch ${item.name || item.src}: HTTP ${res.status}`);
  const blob = await res.blob();
  return {
    dataUrl: await blobToDataUrl(blob, fallbackType),
    name: item.name || fallbackName,
    type: blob.type || fallbackType
  };
}

async function fetchVideos(videos) {
  return Promise.all(videos.map((v, i) => fetchAsDescriptor(v, 'video/mp4', `clip-${i + 1}.mp4`)));
}

async function fetchReferenceImage(image) {
  if (!image || !image.src) return null;
  return fetchAsDescriptor(image, 'image/jpeg', 'reference.jpg');
}

// ---- Comparator tab lifecycle --------------------------------------------
async function findComparatorTab(comparatorUrl) {
  try {
    const prefix = tabPrefixFor(comparatorUrl);
    const tabs = await chrome.tabs.query({ url: queryPatternFor(comparatorUrl) });
    return tabs.find((t) => t.url && t.url.split('#')[0].split('?')[0] === prefix)
      || tabs.find((t) => t.url && t.url.startsWith(prefix))
      || null;
  } catch (_) {
    return null;
  }
}

async function focusTab(tab) {
  if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
  return chrome.tabs.update(tab.id, { active: true });
}

function waitForTabComplete(targetTabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(targetTabId).then((tab) => {
      if (tab.status === 'complete') return resolve();

      let timeoutId = null;
      const cleanup = () => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        if (timeoutId) clearTimeout(timeoutId);
      };
      const onUpdated = (id, changeInfo) => {
        if (id === targetTabId && changeInfo.status === 'complete') {
          cleanup();
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for the Comparator tab to load.'));
      }, 30000);
    }).catch(reject);
  });
}

async function ensureDeliverInjected(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/deliver.js']
  });
}

function sendPayloadToTab(tabId, fetched, mode, referenceImage) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: 'LOAD_VIDEOS', mode, videos: fetched, referenceImage }, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve({ tabId, count: fetched.length });
    });
  });
}

async function deliver(tab, isExisting, comparatorUrl, fetched, mode, referenceImage) {
  await waitForTabComplete(tab.id);
  try {
    await ensureDeliverInjected(tab.id);
    return await sendPayloadToTab(tab.id, fetched, mode, referenceImage);
  } catch (error) {
    // An existing tab may be on a stale/non-app URL; reload it to the app and retry once.
    if (isExisting) {
      await chrome.tabs.update(tab.id, { url: comparatorUrl });
      await waitForTabComplete(tab.id);
      await ensureDeliverInjected(tab.id);
      return sendPayloadToTab(tab.id, fetched, mode, referenceImage);
    }
    throw error;
  }
}

async function importMedia({ videos, referenceImage, mode }) {
  if (!Array.isArray(videos) || videos.length === 0) {
    throw new Error('No videos were selected.');
  }
  const comparatorUrl = await getComparatorUrl();

  // Open/find the tab and fetch the media concurrently.
  const existing = await findComparatorTab(comparatorUrl);
  const tabPromise = existing
    ? focusTab(existing)
    : chrome.tabs.create({ url: comparatorUrl });
  const [tab, fetched, fetchedReference] = await Promise.all([
    tabPromise,
    fetchVideos(videos),
    fetchReferenceImage(referenceImage)
  ]);

  return deliver(tab, Boolean(existing), comparatorUrl, fetched, mode || 'replace', fetchedReference);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'IMPORT_VIDEO_URLS') return false;

  importMedia(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => {
      console.error('[Video Comparator importer] import failed:', error);
      sendResponse({ ok: false, error: error.message || String(error) });
    });

  return true; // keep the message channel open for the async response
});
