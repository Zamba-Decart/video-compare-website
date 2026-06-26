// deliver.js — the bridge into the Comparator page.
//
// The service worker injects this file into the Comparator tab (via
// chrome.scripting.executeScript) and then sends it the fetched payload. This
// script relays that payload to the page via window.postMessage, which is the
// only thing src/js/extImport.js listens for:
//
//   window.addEventListener('message', (e) => { if (e.source !== window) return; ... })
//
// Because extImport.js guards on `event.source === window`, the message MUST be
// posted from the page's own window — hence this content script rather than a
// direct chrome.tabs.sendMessage from the worker to the page.

(() => {
  // Injected fresh on every import; the guard keeps us from stacking duplicate
  // listeners on a long-lived Comparator tab (which would load each clip twice).
  if (window.__vcDeliverInstalled) return;
  window.__vcDeliverInstalled = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'LOAD_VIDEOS' || !Array.isArray(message.videos)) return;
    window.postMessage(
      {
        type: 'LOAD_VIDEOS',
        mode: message.mode || 'append',
        videos: message.videos,
        referenceImage: message.referenceImage || null
      },
      '*'
    );
    // Respond synchronously so the worker's sendMessage channel closes cleanly. Without
    // this, the worker sees "The message port closed before a response was received" and
    // reports a false failure (so the picker overlay never clears, even though it worked).
    sendResponse({ ok: true });
  });
})();
