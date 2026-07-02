// Global app state. A "slot" is an uploaded video:
//   { id, file, url, name, w, h, duration, videoEl, ready }
export const S = {
  slots: [],

  view: 'grid',        // 'grid' | 'overlay'
  workspaceName: '',   // label of the current workspace (set when a bundle is loaded)
  selA: null,          // slot id assigned to A
  selB: null,          // slot id assigned to B
  refVideoId: null,    // slot id pinned in the left reference panel
  refVideoOn: false,

  // overlay comparison
  mode: 'slider',      // 'slider' | 'dissolve' | 'toggle'
  pos: 0.5,            // slider divider position (0..1)
  dissolve: 0.5,       // dissolve blend (0..1)
  toggleFrame: 'a',    // 'a' | 'b'

  // view transforms (shared by both overlay videos)
  flipH: false,
  flipV: false,
  rotation: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
  dragging: false,
  panning: false,

  // playback (synced master transport)
  playing: false,
  loop: true,
  autoplay: true,
  muted: true,
  rate: 1,
  fps: 30,
  normSync: false,     // duration-normalized sync: scale playbackRate so all clips start/end together
  duration: 0,         // master timeline length = max duration of active videos
  curTime: 0,          // last known master time
  scrubbing: false,

  isFullscreen: false,

  // reference image (overlay only) — shown in a panel beside the comparison.
  // Ephemeral for now; fields kept together so persistence can be added later.
  reference: {
    on: false,
    url: null,     // object URL for display
    name: null,
    file: null,    // the File/blob, persisted to IndexedDB
    blobId: null,  // stable content id (kept across re-saves / restores)
    scale: 1,      // display size multiplier (0.5–2); 1 = capped to the video size
  },
};

export const MAX_SLOTS = 4;

export function getSlot(id) {
  return S.slots.find((s) => s.id === id) || null;
}
