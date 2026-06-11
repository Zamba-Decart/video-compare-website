import { S, MAX_SLOTS } from './state.js';
import { dom } from './dom.js';
import { nextId } from './helpers.js';

let onChange = () => {};
let onMeta = () => {};

export function initLoaders(handlers = {}) {
  onChange = handlers.onChange || onChange;
  onMeta = handlers.onMeta || onMeta;

  // file picker
  dom.fileInput.addEventListener('change', (e) => {
    addFiles(e.target.files);
    dom.fileInput.value = ''; // allow re-selecting same file
  });

  // drag/drop on dropzone + stage
  [dom.dz, dom.stageWrap].forEach((zone) => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dom.dz.classList.add('over');
    });
    zone.addEventListener('dragleave', () => dom.dz.classList.remove('over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.dz.classList.remove('over');
      if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
    });
  });
}

export function openPicker() {
  dom.fileInput.click();
}

function createVideoEl(slot) {
  const v = document.createElement('video');
  v.src = slot.url;
  v.muted = S.muted;
  v.loop = false;            // looping handled by the synced controller
  v.playsInline = true;
  v.preload = 'auto';
  v.controls = false;
  v.crossOrigin = 'anonymous';
  v.draggable = false;
  v.dataset.slotId = slot.id;

  v.addEventListener('loadedmetadata', () => {
    slot.w = v.videoWidth;
    slot.h = v.videoHeight;
    slot.duration = v.duration;
    slot.ready = true;
    onMeta(slot);
  });
  return v;
}

// Stable id for dedup/persistence (same file → same id across saves/sessions).
export function blobIdFor(file, name) {
  return `${name || file.name || 'clip'}__${file.size || 0}__${file.lastModified || 0}`;
}

function makeSlot(blob, name, blobId) {
  const slot = {
    id: nextId(),
    file: blob,
    blobId: blobId || blobIdFor(blob, name),
    url: URL.createObjectURL(blob),
    name,
    w: 0,
    h: 0,
    duration: 0,
    ready: false,
    videoEl: null,
  };
  slot.videoEl = createVideoEl(slot);
  return slot;
}

export function addFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv|mkv)$/i.test(f.name));
  if (!files.length) return;

  let added = 0;
  for (const file of files) {
    if (S.slots.length >= MAX_SLOTS) {
      // eslint-disable-next-line no-alert
      window.alert(`Up to ${MAX_SLOTS} videos at a time. Remove one to add more.`);
      break;
    }
    S.slots.push(makeSlot(file, file.name));
    added += 1;
  }

  if (added) onChange();
}

// Restore a clip from a stored blob (used by saved-comparison / session restore).
// Reuses an already-loaded slot with the same blobId if present. Pass triggerChange=false
// to batch several restores and fire onChange once.
export function addBlobSlot(blob, name, blobId, triggerChange = true) {
  const existing = S.slots.find((s) => (s.blobId || blobIdFor(s.file, s.name)) === blobId);
  if (existing) return existing;
  if (S.slots.length >= MAX_SLOTS) return null;
  const slot = makeSlot(blob, name, blobId);
  S.slots.push(slot);
  if (triggerChange) onChange();
  return slot;
}

export function removeSlot(id) {
  const idx = S.slots.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const [slot] = S.slots.splice(idx, 1);
  try {
    slot.videoEl?.pause();
    slot.videoEl?.removeAttribute('src');
    slot.videoEl?.load();
    URL.revokeObjectURL(slot.url);
  } catch (e) { /* noop */ }

  if (S.selA === id) S.selA = null;
  if (S.selB === id) S.selB = null;
  onChange();
}
