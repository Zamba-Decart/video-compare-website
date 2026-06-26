// popup.js — drives the picker UI.
//
// On open: inject detect.js into the active tab, render the videos (checkboxes)
// and image candidates (pick one as the reference). On submit: hand the chosen
// URLs to the service worker, which fetches + delivers them to the Comparator.

const els = {
  status: document.getElementById('status'),
  form: document.getElementById('form'),
  videosSection: document.getElementById('videos-section'),
  videoList: document.getElementById('video-list'),
  videoCount: document.getElementById('video-count'),
  selectAll: document.getElementById('select-all'),
  imagesSection: document.getElementById('images-section'),
  imageList: document.getElementById('image-list'),
  clearRef: document.getElementById('clear-ref'),
  open: document.getElementById('open'),
  overlay: document.getElementById('overlay'),
  overlayHint: document.getElementById('overlay-hint'),
  refresh: document.getElementById('refresh'),
  settings: document.getElementById('settings')
};

let state = { tabId: null, videos: [], images: [] };

const RESTRICTED = /^(chrome|edge|brave|about|chrome-extension|moz-extension|view-source|devtools|data):/i;

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle('error', isError);
  els.status.hidden = !text;
}

function fmtDuration(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function videoMetaLine(v) {
  if (!v.grabbable) return v.reason || 'can’t grab';
  const parts = [];
  if (v.width && v.height) parts.push(`${v.width}×${v.height}`);
  const dur = fmtDuration(v.duration);
  if (dur) parts.push(dur);
  return parts.join(' · ') || v.name;
}

function thumb({ bg = '', glyph = '🎞' } = {}) {
  const div = document.createElement('div');
  div.className = 'thumb';
  if (bg) {
    const img = document.createElement('img');
    img.src = bg;
    img.alt = '';
    img.addEventListener('error', () => { img.remove(); div.textContent = glyph; });
    div.appendChild(img);
  } else {
    div.textContent = glyph;
  }
  return div;
}

function renderVideos() {
  els.videoList.textContent = '';
  const grabbable = state.videos.filter((v) => v.grabbable);
  els.videoCount.textContent = `${grabbable.length} grabbable`;

  state.videos.forEach((v, index) => {
    const row = document.createElement('div');
    row.className = `row${v.grabbable ? '' : ' disabled'}`;

    const label = document.createElement('label');
    label.className = 'pick';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = v.grabbable;
    checkbox.disabled = !v.grabbable;
    checkbox.value = String(index);
    checkbox.addEventListener('change', syncSelectAll);

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = v.name;
    name.title = v.src;

    const meta = document.createElement('div');
    meta.className = `meta${v.grabbable ? '' : ' warn'}`;
    meta.textContent = videoMetaLine(v);

    const text = document.createElement('div');
    text.className = 'meta-text';
    text.append(name, meta);

    label.append(checkbox, thumb({ bg: v.poster, glyph: '🎞' }), text);
    row.append(label);
    els.videoList.append(row);
  });
}

function renderImages() {
  els.imageList.textContent = '';
  const usable = state.images.filter((i) => i.grabbable);
  els.imagesSection.hidden = usable.length === 0;
  if (!usable.length) return;

  usable.forEach((img, index) => {
    const row = document.createElement('div');
    row.className = 'row image';

    const label = document.createElement('label');
    label.className = 'pick';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'reference';
    radio.value = String(index);
    radio.addEventListener('change', () => { els.clearRef.hidden = false; });

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = img.alt || img.name;
    name.title = img.src;

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = img.width && img.height ? `${img.width}×${img.height}` : img.name;

    const text = document.createElement('div');
    text.className = 'meta-text';
    text.append(name, meta);

    label.append(radio, thumb({ bg: img.src, glyph: '🖼' }), text);
    row.append(label);
    els.imageList.append(row);
  });
}

function syncSelectAll() {
  const boxes = [...els.videoList.querySelectorAll('input[type="checkbox"]:not(:disabled)')];
  els.selectAll.checked = boxes.length > 0 && boxes.every((b) => b.checked);
}

function selectedVideos() {
  return [...els.videoList.querySelectorAll('input[type="checkbox"]:checked')]
    .map((b) => state.videos[Number(b.value)])
    .filter(Boolean)
    .map((v) => ({ src: v.src, name: v.name }));
}

function selectedReference() {
  const usable = state.images.filter((i) => i.grabbable);
  const picked = els.imageList.querySelector('input[name="reference"]:checked');
  if (!picked) return null;
  const img = usable[Number(picked.value)];
  return img ? { src: img.src, name: img.name, label: img.alt || 'Reference' } : null;
}

function selectedMode() {
  return document.querySelector('input[name="mode"]:checked')?.value || 'replace';
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function scanPage() {
  setStatus('Scanning page…');
  els.form.hidden = true;
  els.overlay.hidden = true;
  els.overlayHint.hidden = true;

  const tab = await getActiveTab();
  state.tabId = tab?.id ?? null;

  if (!tab?.url || RESTRICTED.test(tab.url)) {
    setStatus('This page can’t be scanned (browser-internal or extension page). Open a normal web page and try again.', true);
    return;
  }

  // Manual on-page selection is always available once we have a real tab — it's the
  // reliable path on sites where filenames are meaningless.
  els.overlay.hidden = false;

  let result;
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: state.tabId },
      files: ['content/detect.js']
    });
    result = injection?.result;
  } catch (error) {
    setStatus(`Couldn’t scan this page: ${error.message}`, true);
    return;
  }

  state.videos = result?.videos || [];
  state.images = result?.images || [];

  if (!state.videos.length) {
    setStatus('No videos auto-detected. Use “Pick videos on the page” below, or scroll so they load and rescan.', true);
    els.overlayHint.hidden = false;
    els.imagesSection.hidden = true;
    return;
  }

  setStatus('');
  els.form.hidden = false;
  renderVideos();
  renderImages();
  syncSelectAll();

  const grabbable = state.videos.filter((v) => v.grabbable).length;
  els.open.disabled = grabbable === 0;
  if (grabbable === 0) {
    setStatus('Found videos, but all are streamed (blob:/HLS) with no grabbable file URL.', true);
  }
}

els.selectAll.addEventListener('change', () => {
  els.videoList.querySelectorAll('input[type="checkbox"]:not(:disabled)')
    .forEach((b) => { b.checked = els.selectAll.checked; });
});

els.clearRef.addEventListener('click', () => {
  const picked = els.imageList.querySelector('input[name="reference"]:checked');
  if (picked) picked.checked = false;
  els.clearRef.hidden = true;
});

els.refresh.addEventListener('click', () => {
  scanPage().catch((e) => setStatus(e.message, true));
});

els.settings.addEventListener('click', () => chrome.runtime.openOptionsPage());

els.overlay.addEventListener('click', async () => {
  if (!state.tabId) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: state.tabId }, files: ['content/overlay.js'] });
    window.close(); // hand off to the on-page overlay
  } catch (error) {
    setStatus(`Couldn’t start the picker: ${error.message}`, true);
  }
});

els.form.addEventListener('submit', (event) => {
  event.preventDefault();

  const videos = selectedVideos();
  if (!videos.length) {
    setStatus('Select at least one video.', true);
    return;
  }

  els.open.disabled = true;
  setStatus(`Fetching ${videos.length} video${videos.length === 1 ? '' : 's'}…`);

  chrome.runtime.sendMessage(
    { type: 'IMPORT_VIDEO_URLS', mode: selectedMode(), videos, referenceImage: selectedReference() },
    (response) => {
      els.open.disabled = false;
      if (chrome.runtime.lastError || !response?.ok) {
        setStatus(chrome.runtime.lastError?.message || response?.error || 'Import failed.', true);
        return;
      }
      setStatus(`Opened ${response.count} video${response.count === 1 ? '' : 's'} in the Comparator.`);
      setTimeout(() => window.close(), 900);
    }
  );
});

scanPage().catch((e) => setStatus(e.message, true));
