// Video Compare extension import helper.
//
// External scripts can post:
//   { type: 'LOAD_VIDEOS', mode: 'replace' | 'append', videos: [...] }
// and this module loads the videos through the same path as drag/drop uploads.

import { S } from './state.js';
import { addFiles, removeSlot } from './loaders.js';
import { saveCurrentComparisonQuietly } from './saves.js';

function dataUrlToBlob(dataUrl) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!match) return null;

  const mime = match[1] || 'video/mp4';
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || '';
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

function descriptorToFile(video, index) {
  if (!video) return null;

  const blob = video.blob instanceof Blob
    ? video.blob
    : dataUrlToBlob(video.dataUrl)
      || (video.buffer ? new Blob([video.buffer], { type: video.type || 'video/mp4' }) : null);

  if (!blob) return null;

  const extension = blob.type === 'video/webm' ? 'webm' : 'mp4';
  const name = video.name || `clip-${index + 1}.${extension}`;
  const type = video.type || blob.type || 'video/mp4';

  return blob instanceof File && blob.name === name
    ? blob
    : new File([blob], name, { type });
}

function clearCurrentVideos() {
  S.slots.slice().forEach((slot) => removeSlot(slot.id));
  S.selA = null;
  S.selB = null;
  S.refVideoId = null;
  S.refVideoOn = false;
  S.view = 'grid';
  S.zoom = 1;
  S.panX = 0;
  S.panY = 0;
  S.rotation = 0;
  S.flipH = false;
  S.flipV = false;
  S.curTime = 0;
}

export async function loadVideoFiles(videos, options = {}) {
  const files = Array.from(videos || [])
    .map(descriptorToFile)
    .filter(Boolean);

  if (files.length && options.mode === 'replace') {
    await saveCurrentComparisonQuietly();
    clearCurrentVideos();
  }
  if (files.length) addFiles(files);
}

function loadReferenceImage(referenceImage) {
  const file = descriptorToFile(referenceImage, 0);
  if (!file || !(file.type || '').startsWith('image/')) return;
  window.dispatchEvent(new CustomEvent('LOAD_REFERENCE_IMAGE', { detail: { file } }));
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  const { data } = event;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'LOAD_VIDEOS') {
    const mode = data.mode || 'append';
    loadVideoFiles(data.videos, { mode })
      .then(() => {
        if (data.referenceImage) {
          loadReferenceImage(data.referenceImage);
        } else if (mode === 'replace') {
          // A fresh 'replace' import with no reference must NOT carry over the previous
          // tuple's reference image — clear it.
          window.dispatchEvent(new CustomEvent('CLEAR_REFERENCE_IMAGE'));
        }
      });
  }
});

window.importVideosFromExtension = loadVideoFiles;
