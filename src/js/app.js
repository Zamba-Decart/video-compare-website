import { S, getSlot, MAX_SLOTS } from './state.js';
import { dom } from './dom.js';
import { initLoaders, openPicker, removeSlot, addFiles, blobIdFor } from './loaders.js';
import { initGrid, renderGrid, applyGridTransforms } from './grid.js';
import {
  play, pause, togglePlay, seek, seekFraction, frameStep,
  setMuted, setLoop, setAutoplay, setRate, syncActive,
  computeDuration, updateScrub, updateDurationDisplay, updateOptionButtons, updatePlayButton,
} from './playback.js';
import {
  renderOverlay, mountOverlay, mountReferenceVideo, applyAspectRatio, clearAspectRatio, renderInfoBar,
} from './viewer.js';
import { exportCurrentFrame, exportGridFrame } from './export.js';
import { stripExt } from './helpers.js';
import {
  initSaves, saveCurrentComparison, scheduleSessionSave, saveSessionNow,
  restoreSession, renderSavesFromStore, invalidateSession, cancelSessionSave, clearAllSaved,
} from './saves.js';
import { exportWorkspace, importWorkspaceToStorage } from './share.js';

let restoreSeekTime = null;   // one-shot: seek to a restored session's saved time once metadata loads
let unsaved = false;          // true when the current A/B tuple isn't a saved comparison (→ green Save button)

const hasVideos = () => S.slots.length > 0;
const canOverlay = () => S.selA && S.selB && S.selA !== S.selB;
const canPinRefVideo = () => S.slots.length >= 3;   // need a distinct 3rd clip for the reference role

// ---------- view / chrome ------------------------------------------------
function updateChrome() {
  const loaded = hasVideos();
  // workspace name replaces the "/ video diff tool" tagline when a bundle is loaded
  dom.logoSub.textContent = S.workspaceName ? `/ ${S.workspaceName}` : '/ video diff tool';
  dom.logoSub.classList.toggle('is-workspace', !!S.workspaceName);
  dom.dz.hidden = loaded;
  dom.toolbar.hidden = !loaded;
  dom.transportBar.hidden = !loaded;
  dom.infoBar.classList.toggle('on', loaded);
  dom.emptyState.style.display = loaded ? 'none' : '';

  const overlay = S.view === 'overlay';
  dom.modePills.hidden = !overlay;
  dom.abPickers.hidden = !overlay;
  dom.dWrap.hidden = !overlay;
  // overlay-only tools
  [dom.swapBtn, dom.resetViewBtn].forEach((b) => { b.hidden = !overlay; });
  dom.refVideoBtn.hidden = !overlay || !canPinRefVideo();
  dom.refVideoPick.hidden = !overlay || !canPinRefVideo();
  // available in BOTH grid and overlay (whenever videos are loaded) — the reference
  // *upload* must always be reachable (grid uploads, overlay shows the panel).
  [dom.flipHBtn, dom.flipVBtn, dom.rotateBtn, dom.exportBtn, dom.referenceBtn, dom.saveBtn].forEach((b) => { b.hidden = !loaded; });

  // reference panel: overlay-only + only when toggled on
  const refVideoVisible = overlay && S.refVideoOn && getSlot(S.refVideoId);
  const refImageVisible = overlay && S.reference.on;
  const refVisible = refVideoVisible || refImageVisible;
  dom.refVideoBtn.classList.toggle('is-on', refVideoVisible);
  dom.refVideoBtn.textContent = refVideoVisible ? '📌 Unpin Original' : '📌 Pin Original Video';
  // pin video and reference image are mutually exclusive in the panel → only one button lit
  dom.referenceBtn.classList.toggle('is-on', S.reference.on && !S.refVideoOn);
  dom.saveBtn.classList.toggle('save-dirty', unsaved && canOverlay());   // green when the tuple isn't saved
  dom.referencePanel.hidden = !refVisible;
  dom.body.classList.toggle('reference-on', refVisible);
  dom.refVideoStage.hidden = !refVideoVisible;
  dom.refDrop.hidden = refVideoVisible || !!S.reference.url;
  dom.refImg.hidden = refVideoVisible || !S.reference.url;
  dom.refClear.hidden = !refVisible;

  // overlay pill availability
  dom.viewOverlayBtn.style.opacity = canOverlay() ? '1' : '0.4';
  dom.viewOverlayBtn.style.pointerEvents = canOverlay() ? 'auto' : 'none';

  document.querySelectorAll('.vpill').forEach((b) => b.classList.toggle('on', b.dataset.view === S.view));

  // select status
  if (overlay) {
    dom.selectStatus.textContent = 'Comparing A vs B';
  } else if (canOverlay()) {
    dom.selectStatus.textContent = 'A + B set — hit Overlay';
  } else {
    const have = [S.selA && 'A', S.selB && 'B'].filter(Boolean).join(' + ') || 'none';
    dom.selectStatus.textContent = `Select 2 to overlay (${have})`;
  }
  dom.addMoreBtn.hidden = S.slots.length >= MAX_SLOTS;
}

function showGrid() {
  S.view = 'grid';
  dom.comp.classList.remove('ready');
  dom.videoGrid.classList.add('on');
  clearAspectRatio();
  dom.stageWrap.style.minHeight = '460px';
  renderGrid();          // re-parents all videos back into tiles
  syncActive();
  updateChrome();
  renderInfoBar();
  scheduleSessionSave();
}

function showOverlay() {
  if (!canOverlay()) return;
  S.view = 'overlay';
  dom.videoGrid.classList.remove('on');
  dom.videoGrid.innerHTML = '';   // release tiles; videos move into #comp
  dom.comp.querySelectorAll('video').forEach((v) => v.remove());  // drop any stale overlay videos (e.g. restoring while already in overlay)
  dom.refVideoStage.querySelectorAll('video').forEach((v) => v.remove());
  mountOverlay();
  mountReferenceVideo();
  dom.comp.classList.add('ready');
  applyAspectRatio();
  syncActive();
  updateChrome();
  renderPickers();
  renderInfoBar();
  renderOverlay();
  scheduleSessionSave();
}

function setView(view) {
  if (view === 'overlay') showOverlay();
  else showGrid();
}

// ---------- selection ----------------------------------------------------
// Re-render after the A/B selection changed (from grid pills, dropdowns, or cycling).
function applyOverlayChange() {
  unsaved = true;   // the A/B/R tuple just changed → not the saved comparison anymore
  if (S.view === 'overlay') {
    if (!canOverlay()) { showGrid(); return; }
    dom.comp.querySelectorAll('video').forEach((v) => v.remove());
    dom.refVideoStage.querySelectorAll('video').forEach((v) => v.remove());
    mountOverlay();
    mountReferenceVideo();
    syncActive();
    renderOverlay();
  } else {
    renderGrid();
  }
  updateChrome();
  renderInfoBar();
  renderPickers();
  scheduleSessionSave();
}

// Grid tile A/B buttons: clicking the active role toggles it off.
function onSelect(role, id) {
  if (role === 'a') {
    if (S.selB === id) S.selB = S.selA;   // swap if picking B's video as A
    S.selA = (S.selA === id) ? null : id;
  } else {
    if (S.selA === id) S.selA = S.selB;
    S.selB = (S.selB === id) ? null : id;
  }
  applyOverlayChange();
}

// A, B and the reference video (R) are three distinct roles. Assigning a clip that's already
// held by another role SWAPS them — so the three stay distinct AND the pinned reference is
// never silently dropped. Any clip can be moved into any role.
const roleClip = (role) => (role === 'a' ? S.selA : role === 'b' ? S.selB : S.refVideoId);
function placeClip(role, id) {
  if (role === 'a') S.selA = id;
  else if (role === 'b') S.selB = id;
  else { S.refVideoId = id; S.refVideoOn = !!id; }
}
function currentRoleOf(id) {
  if (id === S.selA) return 'a';
  if (id === S.selB) return 'b';
  if (S.refVideoOn && id === S.refVideoId) return 'r';
  return null;
}
function assignRole(role, id) {
  if (!id || !getSlot(id)) return;
  if (roleClip(role) === id && (role !== 'r' || S.refVideoOn)) return;   // already there
  const src = currentRoleOf(id);
  if (src && src !== role) placeClip(src, roleClip(role));   // the clip `role` held moves into id's old role
  placeClip(role, id);
  if (role === 'r') S.reference.on = false;   // pinning a video hides the reference image (mutually exclusive)
  applyOverlayChange();
}

// Cycle a side to the next/prev loaded clip, skipping the other side and wrapping.
function cycleSide(role, dir) {
  if (S.view !== 'overlay') return;
  const other = role === 'a' ? S.selB : S.selA;
  const cur = role === 'a' ? S.selA : S.selB;
  const cand = S.slots.map((s) => s.id).filter((id) => id !== other);
  if (cand.length < 2) return;   // nothing else to cycle to
  let i = cand.indexOf(cur);
  if (i === -1) i = 0;
  assignRole(role, cand[(i + dir + cand.length) % cand.length]);
}

// Populate the A/B dropdowns with the loaded clips (overlay only).
function renderPickers() {
  if (S.view !== 'overlay') return;
  const fill = (sel, selectedId) => {
    sel.innerHTML = '';
    S.slots.forEach((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = stripExt(s.name);
      sel.appendChild(o);
    });
    if (selectedId) sel.value = selectedId;
  };
  fill(dom.pickA, S.selA);
  fill(dom.pickB, S.selB);

  fill(dom.pickRef, (S.refVideoId && getSlot(S.refVideoId)) ? S.refVideoId : null);
}

function toggleRefVideo() {
  if (S.refVideoOn) {
    S.refVideoOn = false;
    dom.refVideoStage.querySelectorAll('video').forEach((v) => v.remove());
    syncActive();
    updateChrome();
    renderInfoBar();
    renderPickers();
    scheduleSessionSave();
    return;
  }

  const next = S.slots.find((s) => s.id !== S.selA && s.id !== S.selB);
  if (next) assignRole('r', next.id);
}

// Apply the overlay state (mode / positions / transforms) from a record onto S + UI.
function applyViewState(rec) {
  S.mode = rec.mode || 'slider';
  S.pos = Number.isFinite(rec.pos) ? rec.pos : 0.5;
  S.dissolve = Number.isFinite(rec.dissolve) ? rec.dissolve : 0.5;
  S.toggleFrame = rec.toggleFrame || 'a';
  S.zoom = Number.isFinite(rec.zoom) ? rec.zoom : 1;
  S.panX = rec.panX || 0;
  S.panY = rec.panY || 0;
  S.rotation = rec.rotation || 0;
  S.flipH = !!rec.flipH;
  S.flipV = !!rec.flipV;
  document.querySelectorAll('.mpill').forEach((b) => b.classList.toggle('on', b.dataset.mode === S.mode));
  dom.dRange.value = String(S.dissolve);
  dom.dPct.textContent = Math.round(S.dissolve * 100) + '%';
}

// Reset the overlay view to defaults (used by saved-card restore — a fresh comparison).
function resetViewState() {
  S.mode = 'slider';
  S.pos = 0.5;
  S.dissolve = 0.5;
  S.toggleFrame = 'a';
  S.zoom = 1; S.panX = 0; S.panY = 0; S.rotation = 0; S.flipH = false; S.flipV = false;
  document.querySelectorAll('.mpill').forEach((b) => b.classList.toggle('on', b.dataset.mode === 'slider'));
  dom.dRange.value = '0.5';
  dom.dPct.textContent = '50%';
}

// Restore a saved comparison: load just the two clips into a FRESH comparison
// (default mode/positions/transforms, from the start) — but bring back its reference image.
function applyRestoredComparison(rec, aId, bId, refData, refVideoSlotId) {
  S.selA = aId;
  S.selB = bId;
  S.refVideoId = refVideoSlotId || null;
  S.refVideoOn = !!refVideoSlotId;
  resetViewState();
  S.curTime = 0;
  restoreSeekTime = null;
  // pinned video and reference image are mutually exclusive: if the save pinned a video, load
  // the image (if any) but leave it inactive so the user can still toggle to it.
  if (refData) restoreReference(refData.blob, refData.name, refData.blobId, !refVideoSlotId);
  else { clearReferenceImage(); S.reference.on = false; }
  unsaved = false;   // a restored saved comparison IS the saved one
  showOverlay();
  if (S.autoplay) play();
}

// Restore a whole session (created = freshly-made slots, in order).
function applyRestoredSession(rec, created, refData) {
  S.workspaceName = rec.workspaceName || '';
  unsaved = true;   // a restored workspace's current tuple isn't itself a saved comparison
  S.loop = rec.loop !== false;
  S.autoplay = rec.autoplay !== false;
  S.muted = rec.muted !== false;
  S.rate = Number.isFinite(rec.rate) ? rec.rate : 1;
  S.fps = Number.isFinite(rec.fps) ? rec.fps : 30;
  S.curTime = Number.isFinite(rec.curTime) ? rec.curTime : 0;
  dom.rateSelect.value = String(S.rate);
  dom.fpsInput.value = String(S.fps);
  updateOptionButtons();

  // Resolve A/B by content id (robust to skipped/deduped slots); tolerate legacy index records.
  const resolveSel = (ref) => {
    if (ref == null || ref === -1) return null;
    if (typeof ref === 'number') return S.slots[ref] ? S.slots[ref].id : null;
    const slot = S.slots.find((s) => s.blobId === ref);
    return slot ? slot.id : null;
  };
  S.selA = resolveSel(rec.selA);
  S.selB = resolveSel(rec.selB);
  S.refVideoId = resolveSel(rec.refVideoId);
  S.refVideoOn = !!rec.refVideoOn && !!S.refVideoId && S.refVideoId !== S.selA && S.refVideoId !== S.selB;
  applyViewState(rec);
  if (refData) restoreReference(refData.blob, refData.name, refData.blobId, refData.on);

  if (rec.view === 'overlay' && canOverlay()) showOverlay();
  else showGrid();

  restoreSeekTime = (Number.isFinite(rec.curTime) && rec.curTime > 0.05) ? rec.curTime : null;
  if (S.autoplay) play();
}

function autoAssign() {
  if (!S.selA && S.slots[0]) S.selA = S.slots[0].id;
  if (!S.selB && S.slots[1] && S.slots[1].id !== S.selA) S.selB = S.slots[1].id;
  if (S.refVideoId && (S.refVideoId === S.selA || S.refVideoId === S.selB || !getSlot(S.refVideoId))) {
    S.refVideoId = null;
    S.refVideoOn = false;
  }
}

// ---------- slot lifecycle ----------------------------------------------
function onSlotsChanged() {
  autoAssign();
  if (hasVideos()) unsaved = true;   // loading/removing clips makes the current set unsaved
  if (S.view === 'overlay' && !canOverlay()) S.view = 'grid';
  if (S.view === 'grid') renderGrid();
  computeDuration();
  updateDurationDisplay();
  syncActive();
  updateChrome();
  renderInfoBar();
  renderPickers();

  if (hasVideos() && S.autoplay && !S.playing) play();
  if (!hasVideos()) { pause(); S.curTime = 0; updateScrub(0); }
  scheduleSessionSave();
}

function onMeta() {
  if (S.view === 'grid') renderGrid();
  computeDuration();
  updateDurationDisplay();
  renderInfoBar();
  renderPickers();
  if (S.view === 'overlay') mountReferenceVideo();
  // re-apply a restored session's playback position once we actually know durations
  if (restoreSeekTime != null && S.duration > 0) {
    const t = restoreSeekTime;
    restoreSeekTime = null;
    seek(t);
  }
  if (S.autoplay && !S.playing && hasVideos()) play();
}

// ---------- overlay interaction (ported from image tool) -----------------
function getRelX(event) {
  // Inverse of the shared view transform: map the pointer back to the slice fraction
  // (local x of the element box) so the wipe tracks the cursor — and stays welded to the
  // divider — under any zoom / pan / flip / rotation. Mirrors positionDivider() in viewer.js.
  const cr = dom.comp.getBoundingClientRect();
  const CW = cr.width || 1;
  const clientX = event.touches ? event.touches[0].clientX : event.clientX;
  const clientY = event.touches ? event.touches[0].clientY : event.clientY;
  const qx = clientX - cr.left - CW / 2 - S.panX;
  const qy = clientY - cr.top - cr.height / 2 - S.panY;
  const th = (S.rotation * Math.PI) / 180;
  const rx = Math.cos(th) * qx + Math.sin(th) * qy;   // R(-θ)·q, x component
  const ax = S.zoom * (S.flipH ? -1 : 1);
  const pos = 0.5 + (rx / ax) / CW;
  return Math.max(0.001, Math.min(0.999, pos));
}

function clampPan() {
  if (S.zoom <= 1) { S.panX = 0; S.panY = 0; return; }
  const rect = dom.stageWrap.getBoundingClientRect();
  const maxX = Math.max(0, ((rect.width * S.zoom) - rect.width) / 2);
  const maxY = Math.max(0, ((rect.height * S.zoom) - rect.height) / 2);
  S.panX = Math.max(-maxX, Math.min(maxX, S.panX));
  S.panY = Math.max(-maxY, Math.min(maxY, S.panY));
}

function zoomBy(delta, clientX, clientY) {
  if (S.view !== 'overlay') return;
  const rect = dom.stageWrap.getBoundingClientRect();
  const beforeZoom = S.zoom;
  const nextZoom = Math.max(1, Math.min(8, Number((S.zoom + delta).toFixed(3))));
  if (nextZoom === beforeZoom) return;
  const cx = clientX - rect.left - rect.width / 2;
  const cy = clientY - rect.top - rect.height / 2;
  const ratio = nextZoom / beforeZoom;
  S.panX = (S.panX - cx) * ratio + cx;
  S.panY = (S.panY - cy) * ratio + cy;
  S.zoom = nextZoom;
  if (S.zoom === 1) { S.panX = 0; S.panY = 0; }
  clampPan();
  renderOverlay();
  scheduleSessionSave();
}

// Flip/rotate are view transforms that apply in BOTH grid and overlay; render the active view.
function applyTransformButtons() {
  dom.flipHBtn.classList.toggle('is-on', S.flipH);
  dom.flipVBtn.classList.toggle('is-on', S.flipV);
  dom.rotateBtn.classList.toggle('is-on', S.rotation % 360 !== 0);
}

function afterTransformChange() {
  if (S.view === 'overlay') renderOverlay();   // applies full transform (incl. zoom/pan) + button states
  else applyGridTransforms();                   // grid: rotate/flip only (no zoom/pan, no clip/opacity)
  applyTransformButtons();
  scheduleSessionSave();
}

function exportCurrentView() {
  if (S.view === 'overlay') exportCurrentFrame();
  else exportGridFrame();
}

// ---------- reference image (overlay side panel) ----------
function syncReferenceUI() {
  const has = !!S.reference.url;
  dom.refImg.hidden = !has;
  dom.refDrop.hidden = has;
  dom.refClear.hidden = !has;
}

function toggleReference() {
  S.reference.on = !S.reference.on;
  if (S.reference.on && S.refVideoOn) {   // showing the image overrides the pinned video
    S.refVideoOn = false;
    dom.refVideoStage.querySelectorAll('video').forEach((v) => v.remove());
    syncActive();
  }
  updateChrome();
  scheduleSessionSave();
  if (S.view === 'overlay') { applyAspectRatio(); renderOverlay(); }   // stage width changed → re-fit + re-place divider
}

function loadReferenceImage(file) {
  if (!file || !(file.type || '').startsWith('image/')) return;
  if (S.reference.url) URL.revokeObjectURL(S.reference.url);
  S.reference.file = file;
  S.reference.name = file.name;
  S.reference.blobId = blobIdFor(file, file.name);
  S.reference.url = URL.createObjectURL(file);
  dom.refImg.src = S.reference.url;
  S.reference.on = true;
  if (S.refVideoOn) {   // loading a reference image overrides the pinned video
    S.refVideoOn = false;
    dom.refVideoStage.querySelectorAll('video').forEach((v) => v.remove());
    syncActive();
  }
  syncReferenceUI();
  updateChrome();
  scheduleSessionSave();
  if (S.view === 'overlay') { applyAspectRatio(); renderOverlay(); }
}

// Restore a persisted reference image (preserves its original blobId for re-save consistency).
function restoreReference(blob, name, blobId, on) {
  if (!blob) return;
  if (S.reference.url) URL.revokeObjectURL(S.reference.url);
  S.reference.file = blob instanceof File ? blob : new File([blob], name || 'reference', { type: blob.type || 'image/png' });
  S.reference.name = name || 'reference';
  S.reference.blobId = blobId || blobIdFor(S.reference.file, S.reference.name);
  S.reference.url = URL.createObjectURL(blob);
  S.reference.on = !!on;
  dom.refImg.src = S.reference.url;
  syncReferenceUI();
}

function clearReferenceImage() {
  if (S.reference.url) URL.revokeObjectURL(S.reference.url);
  S.reference.url = null;
  S.reference.name = null;
  S.reference.file = null;
  S.reference.blobId = null;
  dom.refImg.removeAttribute('src');
  syncReferenceUI();
}

function clearActiveReference() {
  if (S.refVideoOn) {
    S.refVideoOn = false;
    S.refVideoId = null;
    dom.refVideoStage.querySelectorAll('video').forEach((v) => v.remove());
    syncActive();
    updateChrome();
    renderInfoBar();
    renderPickers();
    scheduleSessionSave();
    return;
  }

  clearReferenceImage();
  S.reference.on = false;
  updateChrome();
}

function resetView() {
  S.flipH = false; S.flipV = false; S.rotation = 0;
  S.zoom = 1; S.panX = 0; S.panY = 0;
  afterTransformChange();
}

function swapAB() {
  if (!canOverlay()) return;
  [S.selA, S.selB] = [S.selB, S.selA];
  unsaved = true;
  if (S.view === 'overlay') { dom.comp.querySelectorAll('video').forEach((v) => v.remove()); mountOverlay(); }
  updateChrome();
  renderInfoBar();
  renderPickers();
  renderOverlay();
  scheduleSessionSave();
}

function bindOverlayInteraction() {
  let panStartX = 0, panStartY = 0, startPanX = 0, startPanY = 0;
  const startPan = (cx, cy) => { S.panning = true; panStartX = cx; panStartY = cy; startPanX = S.panX; startPanY = S.panY; renderOverlay(); };

  dom.stageWrap.addEventListener('contextmenu', (e) => { if (S.view === 'overlay' && S.zoom > 1) e.preventDefault(); });

  dom.stageWrap.addEventListener('mousedown', (e) => {
    if (S.view !== 'overlay') return;
    const wantsPan = (S.zoom > 1 && e.button === 2) || (S.zoom > 1 && e.shiftKey);
    if (wantsPan) { startPan(e.clientX, e.clientY); e.preventDefault(); return; }
    if (S.mode !== 'slider' || e.button !== 0) return;
    S.dragging = true;
    S.pos = getRelX(e);
    renderOverlay();
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (S.panning) { S.panX = startPanX + (e.clientX - panStartX); S.panY = startPanY + (e.clientY - panStartY); clampPan(); renderOverlay(); return; }
    if (!S.dragging) return;
    S.pos = getRelX(e);
    renderOverlay();
  });

  document.addEventListener('mouseup', () => {
    const was = S.dragging || S.panning;
    S.dragging = false; S.panning = false;
    if (was) scheduleSessionSave();
  });

  dom.stageWrap.addEventListener('touchstart', (e) => {
    if (S.view !== 'overlay') return;
    if (S.zoom > 1 && e.touches.length === 1) { startPan(e.touches[0].clientX, e.touches[0].clientY); return; }
    if (S.mode !== 'slider') return;
    S.dragging = true; S.pos = getRelX(e); renderOverlay();
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (S.panning && e.touches.length === 1) { S.panX = startPanX + (e.touches[0].clientX - panStartX); S.panY = startPanY + (e.touches[0].clientY - panStartY); clampPan(); renderOverlay(); return; }
    if (!S.dragging) return;
    S.pos = getRelX(e); renderOverlay();
  }, { passive: true });

  document.addEventListener('touchend', () => {
    const was = S.dragging || S.panning;
    S.dragging = false; S.panning = false;
    if (was) scheduleSessionSave();
  });

  // toggle-mode click
  dom.stageWrap.addEventListener('click', () => {
    if (S.view !== 'overlay' || S.mode !== 'toggle' || S.dragging) return;
    S.toggleFrame = S.toggleFrame === 'a' ? 'b' : 'a';
    renderOverlay();
    scheduleSessionSave();
  });

  // wheel zoom
  dom.stageWrap.addEventListener('wheel', (e) => {
    if (S.view !== 'overlay') return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 0.12 : -0.12, e.clientX, e.clientY);
  }, { passive: false });
}

// ---------- modes --------------------------------------------------------
function setMode(mode) {
  document.querySelectorAll('.mpill').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  S.mode = mode;
  if (mode === 'toggle') S.toggleFrame = 'a';
  if (S.view !== 'overlay' && canOverlay()) { showOverlay(); }
  renderOverlay();
  scheduleSessionSave();
}

// ---------- fullscreen ---------------------------------------------------
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); S.isFullscreen = true; }
    else { await document.exitFullscreen(); S.isFullscreen = false; }
  } catch (e) { S.isFullscreen = !!document.fullscreenElement; }
  dom.body.classList.toggle('is-fullscreen', S.isFullscreen);
}

// ---------- bindings -----------------------------------------------------
function bindToolbar() {
  document.querySelectorAll('.vpill').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('.mpill').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  dom.dRange.addEventListener('input', () => {
    S.dissolve = parseFloat(dom.dRange.value);
    dom.dPct.textContent = Math.round(S.dissolve * 100) + '%';
    if (S.mode === 'dissolve') renderOverlay();
    scheduleSessionSave();
  });

  dom.pickA.addEventListener('change', () => { assignRole('a', dom.pickA.value); dom.pickA.blur(); });
  dom.pickB.addEventListener('change', () => { assignRole('b', dom.pickB.value); dom.pickB.blur(); });
  dom.pickRef.addEventListener('change', () => { assignRole('r', dom.pickRef.value); dom.pickRef.blur(); });

  dom.addMoreBtn.addEventListener('click', openPicker);
  dom.swapBtn.addEventListener('click', swapAB);
  dom.flipHBtn.addEventListener('click', () => { S.flipH = !S.flipH; afterTransformChange(); });
  dom.flipVBtn.addEventListener('click', () => { S.flipV = !S.flipV; afterTransformChange(); });
  dom.rotateBtn.addEventListener('click', () => { S.rotation = (S.rotation + 90) % 360; afterTransformChange(); });
  dom.resetViewBtn.addEventListener('click', resetView);
  dom.exportBtn.addEventListener('click', exportCurrentView);
  dom.refVideoBtn.addEventListener('click', toggleRefVideo);
  dom.saveBtn.addEventListener('click', async () => { if (await saveCurrentComparison()) { unsaved = false; clearWorkspace(); } });
  dom.fullscreenBtn.addEventListener('click', toggleFullscreen);

  // reference image — overlay toggles the panel; grid (no panel) goes straight to upload
  dom.referenceBtn.addEventListener('click', () => {
    if (S.view === 'overlay') toggleReference();
    else dom.referenceInput.click();
  });
  dom.referenceInput.addEventListener('change', (e) => { loadReferenceImage(e.target.files[0]); dom.referenceInput.value = ''; });
  dom.refClear.addEventListener('click', (e) => { e.stopPropagation(); clearActiveReference(); scheduleSessionSave(); });
  window.addEventListener('LOAD_REFERENCE_IMAGE', (event) => {
    loadReferenceImage(event.detail?.file);
  });
}

function bindShortcuts() {
  const close = () => { dom.shortcutsModal.hidden = true; };
  dom.shortcutsBtn.addEventListener('click', () => { dom.shortcutsModal.hidden = false; });
  dom.shortcutsClose.addEventListener('click', close);
  dom.shortcutsModal.addEventListener('click', (e) => { if (e.target === dom.shortcutsModal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dom.shortcutsModal.hidden) close(); });
}

// ---------- saved panel: collapse + dock (persisted per browser) ---------
const SAVES_COLLAPSED_KEY = 'vc.savesCollapsed';
const SAVES_DOCK_KEY = 'vc.savesDock';

function applySavesCollapsed(collapsed) {
  dom.body.classList.toggle('saves-collapsed', collapsed);
  dom.savesCollapseBtn.textContent = collapsed ? '▸' : '▾';
  dom.savesCollapseBtn.title = collapsed ? 'Expand saved comparisons' : 'Collapse saved comparisons';
  dom.savesCollapseBtn.setAttribute('aria-expanded', String(!collapsed));
}

function applySavesDock(right) {
  dom.mainEl.classList.toggle('saves-dock-right', right);
  dom.savesDockBtn.classList.toggle('is-on', right);
  dom.savesDockBtn.title = right ? 'Dock to the bottom' : 'Dock to the right';
}

function loadSavesPanelPrefs() {
  let collapsed = false, right = false;
  try {
    collapsed = localStorage.getItem(SAVES_COLLAPSED_KEY) === '1';
    right = localStorage.getItem(SAVES_DOCK_KEY) === 'right';
  } catch (e) { /* storage unavailable */ }
  applySavesCollapsed(collapsed);
  applySavesDock(right);
}

function bindSavesPanel() {
  dom.savesCollapseBtn.addEventListener('click', () => {
    const collapsed = !dom.body.classList.contains('saves-collapsed');
    applySavesCollapsed(collapsed);
    try { localStorage.setItem(SAVES_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
  });
  dom.savesDockBtn.addEventListener('click', () => {
    const right = !dom.mainEl.classList.contains('saves-dock-right');
    applySavesDock(right);
    try { localStorage.setItem(SAVES_DOCK_KEY, right ? 'right' : 'bottom'); } catch (e) { /* ignore */ }
    if (S.view === 'overlay') renderOverlay();   // stage width changed → re-fit the divider
  });
}

// ---------- workspace bundles (export / import a .zip) -------------------
// Modal asking whether to save the current workspace before a destructive action.
// Resolves to 'save' | 'discard' | 'cancel'.
function confirmWorkspaceAction(message) {
  return new Promise((resolve) => {
    dom.wsConfirmMsg.textContent = message;
    dom.wsConfirmModal.hidden = false;
    const finish = (val) => {
      dom.wsConfirmModal.hidden = true;
      dom.wsConfirmSave.removeEventListener('click', onSave);
      dom.wsConfirmDiscard.removeEventListener('click', onDiscard);
      dom.wsConfirmCancel.removeEventListener('click', onCancel);
      dom.wsConfirmModal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onSave = () => finish('save');
    const onDiscard = () => finish('discard');
    const onCancel = () => finish('cancel');
    const onBackdrop = (e) => { if (e.target === dom.wsConfirmModal) finish('cancel'); };
    const onKey = (e) => { if (e.key === 'Escape') finish('cancel'); };
    dom.wsConfirmSave.addEventListener('click', onSave);
    dom.wsConfirmDiscard.addEventListener('click', onDiscard);
    dom.wsConfirmCancel.addEventListener('click', onCancel);
    dom.wsConfirmModal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

// Returns true if a bundle was actually downloaded, false if cancelled / nothing to export.
async function exportWorkspaceBundle() {
  const a = getSlot(S.selA), b = getSlot(S.selB);
  let def = S.workspaceName || 'workspace';
  if (!S.workspaceName && a && b) def = `${stripExt(a.name)}_vs_${stripExt(b.name)}`;
  else if (!S.workspaceName && S.slots[0]) def = stripExt(S.slots[0].name);
  const name = window.prompt('Name this workspace bundle:', def);
  if (name === null) return false;   // cancelled
  try {
    const filename = await exportWorkspace(name);
    if (!filename) { window.alert('Nothing to export yet — load some videos or save a comparison first.'); return false; }
    return true;
  } catch (e) {
    window.alert('Export failed: ' + (e && e.message ? e.message : 'unknown error'));
    return false;
  }
}

const deriveWorkspaceName = (filename) =>
  (filename || '').replace(/\.zip$/i, '').replace(/_video_comparator$/i, '').trim() || 'workspace';

// Loading a workspace FULLY replaces the current one (videos + saved comparisons). Offer to save
// the current workspace first, then import + reload so init() restores cleanly from storage.
async function loadBundleFile(file) {
  if (!file) return;
  const wsName = deriveWorkspaceName(file.name);
  const choice = await confirmWorkspaceAction(`Load “${wsName}”? This replaces your current videos and all saved comparisons.`);
  if (choice === 'cancel') return;
  if (choice === 'save' && !(await exportWorkspaceBundle())) return;   // user backed out of saving
  try {
    invalidateSession();   // any pending/in-flight workspace save now bails — don't clobber the import
    cancelSessionSave();
    await importWorkspaceToStorage(file, { workspaceName: wsName });
    window.location.reload();
  } catch (e) {
    window.alert('Couldn\'t load that file: ' + (e && e.message ? e.message : 'invalid bundle'));
  }
}

// "Clear workspace" — wipe EVERYTHING (loaded videos + all saved comparisons), after offering
// to save the current workspace first.
async function clearWholeWorkspace() {
  const choice = await confirmWorkspaceAction('Clear the whole workspace? This removes the loaded videos and ALL saved comparisons. This can’t be undone.');
  if (choice === 'cancel') return;
  if (choice === 'save' && !(await exportWorkspaceBundle())) return;
  clearWorkspace();          // unload current media + reset (also clears the workspace name)
  await clearAllSaved();     // wipe persisted saves + session + every stored blob
}

function bindTransport() {
  dom.playBtn.addEventListener('click', togglePlay);
  dom.frameBackBtn.addEventListener('click', () => frameStep(-1));
  dom.frameFwdBtn.addEventListener('click', () => frameStep(1));

  dom.scrub.addEventListener('input', () => {
    S.scrubbing = true;
    seekFraction(parseInt(dom.scrub.value, 10) / 1000);
  });
  dom.scrub.addEventListener('change', () => { S.scrubbing = false; });
  ['mouseup', 'touchend'].forEach((ev) => dom.scrub.addEventListener(ev, () => { S.scrubbing = false; }));

  dom.loopBtn.addEventListener('click', () => { setLoop(!S.loop); scheduleSessionSave(); });
  dom.autoplayBtn.addEventListener('click', () => { setAutoplay(!S.autoplay); scheduleSessionSave(); });
  dom.muteBtn.addEventListener('click', () => { setMuted(!S.muted); scheduleSessionSave(); });
  dom.rateSelect.addEventListener('change', () => { setRate(parseFloat(dom.rateSelect.value)); scheduleSessionSave(); });
  dom.fpsInput.addEventListener('change', () => { S.fps = Math.max(1, Math.min(120, parseInt(dom.fpsInput.value, 10) || 30)); scheduleSessionSave(); });
}

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof Element && e.target.matches('input, select, textarea') && e.target.type !== 'range') return;
    if (!hasVideos()) return;
    const k = e.key.toLowerCase();

    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === ',') { e.preventDefault(); frameStep(-1); }
    else if (e.key === '.') { e.preventDefault(); frameStep(1); }
    else if (k === 's') setMode('slider');
    else if (k === 'd') setMode('dissolve');
    else if (k === 't') {
      if (S.view === 'overlay' && S.mode === 'toggle') { S.toggleFrame = S.toggleFrame === 'a' ? 'b' : 'a'; renderOverlay(); }
      else setMode('toggle');
    }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(S.curTime - (e.shiftKey ? 5 : 1 / (S.fps || 30))); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seek(S.curTime + (e.shiftKey ? 5 : 1 / (S.fps || 30))); }
    else if (k === '+' || e.key === '=') { e.preventDefault(); const r = dom.stageWrap.getBoundingClientRect(); zoomBy(0.2, r.left + r.width / 2, r.top + r.height / 2); }
    else if (k === '-' || e.key === '_') { e.preventDefault(); const r = dom.stageWrap.getBoundingClientRect(); zoomBy(-0.2, r.left + r.width / 2, r.top + r.height / 2); }
    else if (k === 'm') { e.preventDefault(); setMuted(!S.muted); }
    else if (k === 'f') { e.preventDefault(); toggleFullscreen(); }
    else if (k === 'e') { e.preventDefault(); exportCurrentView(); }
    else if (e.code === 'BracketRight') { e.preventDefault(); cycleSide(e.shiftKey ? 'a' : 'b', 1); }
    else if (e.code === 'BracketLeft') { e.preventDefault(); cycleSide(e.shiftKey ? 'a' : 'b', -1); }
  });
}

// Unload all videos + reset view to the empty dropzone (keeps saved comparisons).
function clearWorkspace() {
  invalidateSession();   // bump wipe-gen + cancel pending debounce so an in-flight save can't resurrect the cleared workspace
  pause();
  S.slots.slice().forEach((s) => removeSlot(s.id));
  S.selA = null; S.selB = null; S.refVideoId = null; S.refVideoOn = false; S.view = 'grid';
  S.zoom = 1; S.panX = 0; S.panY = 0; S.rotation = 0; S.flipH = false; S.flipV = false;
  S.curTime = 0;
  S.workspaceName = '';
  unsaved = false;
  clearReferenceImage();
  S.reference.on = false;
  showGrid();
  updateChrome();
}

// "Remove current media set" — unload the loaded videos; saved comparisons are kept.
function resetAll() {
  if (!S.slots.length) return;
  if (!window.confirm('Remove the current media set? Your saved comparisons are kept.')) return;
  clearWorkspace();
}

function bindFullscreenTracking() {
  document.addEventListener('fullscreenchange', () => {
    S.isFullscreen = !!document.fullscreenElement;
    dom.body.classList.toggle('is-fullscreen', S.isFullscreen);
    if (S.view === 'overlay') renderOverlay();
  });
}

// The divider is positioned in absolute px from the comp box size, so it must be
// recomputed whenever the stage resizes (window resize, fullscreen toggle, orientation,
// aspect-ratio reflow) — otherwise the line goes stale while the %-based clip seam moves.
function bindResizeTracking() {
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => { if (S.view === 'overlay') renderOverlay(); });
    ro.observe(dom.stageWrap);
  } else {
    window.addEventListener('resize', () => { if (S.view === 'overlay') renderOverlay(); });
  }
}

// ---------- stage resize (drag the bottom edge to grow/shrink the viewer) -------------
const STAGE_H_KEY = 'vc.stageHeight';
function applyStageHeight(px) {
  const h = Math.max(240, Math.min(1200, Math.round(px)));
  document.documentElement.style.setProperty('--stage-h', `${h}px`);
  return h;
}
function loadStageHeight() {
  try {
    const v = parseInt(localStorage.getItem(STAGE_H_KEY), 10);
    if (Number.isFinite(v)) applyStageHeight(v);
  } catch (e) { /* storage unavailable */ }
}
function bindStageResize() {
  if (!dom.stageResize) return;
  let startY = 0, startH = 0, dragging = false;
  const onMove = (e) => {
    if (!dragging) return;
    applyStageHeight(startH + (e.clientY - startY));
    if (S.view === 'overlay') renderOverlay();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    dom.body.classList.remove('resizing-stage');
    try { localStorage.setItem(STAGE_H_KEY, String(Math.round(dom.stageWrap.getBoundingClientRect().height))); } catch (e) { /* ignore */ }
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  dom.stageResize.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    startH = dom.stageWrap.getBoundingClientRect().height;
    dom.body.classList.add('resizing-stage');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

async function init() {
  initLoaders({ onChange: onSlotsChanged, onMeta, onReferenceImage: loadReferenceImage, onBundle: loadBundleFile });
  initGrid({ onSelect, onRemove: (id) => removeSlot(id) });
  initSaves({ onApply: applyRestoredComparison, onApplySession: applyRestoredSession });
  bindToolbar();
  bindTransport();
  bindShortcuts();
  bindSavesPanel();
  bindOverlayInteraction();
  bindKeyboard();
  bindFullscreenTracking();
  bindResizeTracking();
  dom.headerResetBtn.addEventListener('click', resetAll);
  dom.exportWsBtn.addEventListener('click', exportWorkspaceBundle);
  dom.loadWsBtn.addEventListener('click', () => dom.wsFileInput.click());
  dom.clearWsBtn.addEventListener('click', clearWholeWorkspace);
  dom.wsFileInput.addEventListener('change', (e) => { loadBundleFile(e.target.files[0]); dom.wsFileInput.value = ''; });
  bindStageResize();

  // flush the session before the tab is hidden/closed (debounce may not have fired)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveSessionNow(); });
  window.addEventListener('pagehide', () => { saveSessionNow(); });

  // initial UI state
  dom.fpsInput.value = String(S.fps);
  dom.rateSelect.value = String(S.rate);
  loadSavesPanelPrefs();
  loadStageHeight();
  updateOptionButtons();
  updatePlayButton();
  updateChrome();

  // restore the last workspace (if any), then render the saved-comparisons gallery
  try { await restoreSession(); } catch (e) { /* ignore */ }
  try { await renderSavesFromStore(); } catch (e) { /* ignore */ }
}

init();
