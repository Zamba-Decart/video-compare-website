const $ = (id) => document.getElementById(id);

export const dom = {
  body: document.body,

  // upload
  dz: $('dz'),
  dzInner: $('dz-inner'),
  fileInput: $('file-input'),

  // toolbar
  toolbar: $('toolbar'),
  modePills: $('mode-pills'),
  abPickers: $('ab-pickers'),
  pickA: $('pick-a'),
  pickB: $('pick-b'),
  dWrap: $('d-wrap'),
  dRange: $('d-range'),
  dPct: $('d-pct'),
  selectStatus: $('select-status'),
  viewOverlayBtn: $('view-overlay-btn'),
  addMoreBtn: $('add-more-btn'),
  swapBtn: $('swap-btn'),
  flipHBtn: $('flip-h-btn'),
  flipVBtn: $('flip-v-btn'),
  rotateBtn: $('rotate-btn'),
  resetViewBtn: $('reset-view-btn'),
  exportBtn: $('export-btn'),
  saveBtn: $('save-btn'),
  fullscreenBtn: $('fullscreen-btn'),

  // saved comparisons
  savesRail: $('saves-rail'),
  savesList: $('saves-list'),

  // stage
  stageWrap: $('stage-wrap'),
  emptyState: $('empty-state'),
  videoGrid: $('video-grid'),
  comp: $('comp'),
  divider: $('divider'),
  lblA: $('lbl-a'),
  lblB: $('lbl-b'),
  tHint: $('toggle-hint'),

  // transport
  transportBar: $('transport-bar'),
  frameBackBtn: $('frame-back-btn'),
  playBtn: $('play-btn'),
  frameFwdBtn: $('frame-fwd-btn'),
  tCur: $('t-cur'),
  scrub: $('scrub'),
  tDur: $('t-dur'),
  loopBtn: $('loop-btn'),
  autoplayBtn: $('autoplay-btn'),
  muteBtn: $('mute-btn'),
  rateSelect: $('rate-select'),
  fpsInput: $('fps-input'),

  // info
  infoBar: $('info-bar'),
  infoList: $('info-list'),

  headerResetBtn: $('header-reset-btn'),
};
