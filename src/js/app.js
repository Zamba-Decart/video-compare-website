import { S, getSlot, MAX_SLOTS } from './state.js';
import { dom } from './dom.js';
import { initLoaders, openPicker, removeSlot, addFiles } from './loaders.js';
import { initGrid, renderGrid, applyGridTransforms } from './grid.js';
import {
  play, pause, togglePlay, seek, seekFraction, frameStep,
  setMuted, setLoop, setAutoplay, setRate, syncActive,
  computeDuration, updateScrub, updateDurationDisplay, updateOptionButtons, updatePlayButton,
} from './playback.js';
import {
  renderOverlay, mountOverlay, applyAspectRatio, clearAspectRatio, renderInfoBar,
} from './viewer.js';
import { exportCurrentFrame, exportGridFrame } from './export.js';
import { stripExt } from './helpers.js';
import {
  initSaves, saveCurrentComparison, scheduleSessionSave, saveSessionNow, cancelSessionSave,
  restoreSession, renderSavesFromStore, clearAllSaved,
} from './saves.js';

let restoreSeekTime = null;   // one-shot: seek to a restored session's saved time once metadata loads

const hasVideos = () => S.slots.length > 0;
const canOverlay = () => S.selA && S.selB && S.selA !== S.selB;

// ---------- view / chrome ------------------------------------------------
function updateChrome() {
  const loaded = hasVideos();
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
  // available in BOTH grid and overlay (whenever videos are loaded)
  [dom.flipHBtn, dom.flipVBtn, dom.rotateBtn, dom.exportBtn, dom.saveBtn].forEach((b) => { b.hidden = !loaded; });

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
  mountOverlay();
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
  if (S.view === 'overlay') {
    if (!canOverlay()) { showGrid(); return; }
    dom.comp.querySelectorAll('video').forEach((v) => v.remove());
    mountOverlay();
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

// Dropdown / cycle: assign a clip to a side, swapping with the other side if it's the same
// clip (so A and B are never the same video). No toggle-off.
function setSide(role, id) {
  if (!id || !getSlot(id)) return;
  if (role === 'a') {
    if (S.selA === id) return;
    if (S.selB === id) S.selB = S.selA;
    S.selA = id;
  } else {
    if (S.selB === id) return;
    if (S.selA === id) S.selA = S.selB;
    S.selB = id;
  }
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
  setSide(role, cand[(i + dir + cand.length) % cand.length]);
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

// Restore a saved comparison: A/B already loaded as slots, set state + show overlay.
function applyRestoredComparison(rec, aId, bId) {
  S.selA = aId;
  S.selB = bId;
  applyViewState(rec);
  showOverlay();
}

// Restore a whole session (created = freshly-made slots, in order).
function applyRestoredSession(rec, created) {
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
  applyViewState(rec);

  if (rec.view === 'overlay' && canOverlay()) showOverlay();
  else showGrid();

  restoreSeekTime = (Number.isFinite(rec.curTime) && rec.curTime > 0.05) ? rec.curTime : null;
  if (S.autoplay) play();
}

function autoAssign() {
  if (!S.selA && S.slots[0]) S.selA = S.slots[0].id;
  if (!S.selB && S.slots[1] && S.slots[1].id !== S.selA) S.selB = S.slots[1].id;
}

// ---------- slot lifecycle ----------------------------------------------
function onSlotsChanged() {
  autoAssign();
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

// Inch the active comparison control: wipe position in Slider mode, blend in Dissolve mode.
// Dissolve moves faster than the slider (the wipe wants fine alignment; the blend doesn't).
function nudgeActiveSlider(dir, big) {
  if (S.view !== 'overlay') return;
  if (S.mode === 'slider') {
    const step = big ? 0.05 : 0.01;
    S.pos = Math.max(0.001, Math.min(0.999, S.pos + dir * step));
    renderOverlay();
    scheduleSessionSave();
  } else if (S.mode === 'dissolve') {
    const step = big ? 0.20 : 0.08;
    S.dissolve = Math.max(0, Math.min(1, S.dissolve + dir * step));
    dom.dRange.value = String(S.dissolve);
    dom.dPct.textContent = Math.round(S.dissolve * 100) + '%';
    renderOverlay();
    scheduleSessionSave();
  }
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

function resetView() {
  S.flipH = false; S.flipV = false; S.rotation = 0;
  S.zoom = 1; S.panX = 0; S.panY = 0;
  afterTransformChange();
}

function swapAB() {
  if (!canOverlay()) return;
  [S.selA, S.selB] = [S.selB, S.selA];
  if (S.view === 'overlay') { dom.comp.querySelectorAll('video').forEach((v) => v.remove()); mountOverlay(); }
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

  dom.pickA.addEventListener('change', () => { setSide('a', dom.pickA.value); dom.pickA.blur(); });
  dom.pickB.addEventListener('change', () => { setSide('b', dom.pickB.value); dom.pickB.blur(); });

  dom.addMoreBtn.addEventListener('click', openPicker);
  dom.swapBtn.addEventListener('click', swapAB);
  dom.flipHBtn.addEventListener('click', () => { S.flipH = !S.flipH; afterTransformChange(); });
  dom.flipVBtn.addEventListener('click', () => { S.flipV = !S.flipV; afterTransformChange(); });
  dom.rotateBtn.addEventListener('click', () => { S.rotation = (S.rotation + 90) % 360; afterTransformChange(); });
  dom.resetViewBtn.addEventListener('click', resetView);
  dom.exportBtn.addEventListener('click', exportCurrentView);
  dom.saveBtn.addEventListener('click', async () => { if (await saveCurrentComparison()) clearWorkspace(); });
  dom.fullscreenBtn.addEventListener('click', toggleFullscreen);
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
    else if (k === '0') { e.preventDefault(); resetView(); }
    else if (k === '+' || e.key === '=') { e.preventDefault(); const r = dom.stageWrap.getBoundingClientRect(); zoomBy(0.2, r.left + r.width / 2, r.top + r.height / 2); }
    else if (k === '-' || e.key === '_') { e.preventDefault(); const r = dom.stageWrap.getBoundingClientRect(); zoomBy(-0.2, r.left + r.width / 2, r.top + r.height / 2); }
    else if (k === 'l') { e.preventDefault(); setLoop(!S.loop); }
    else if (k === 'm') { e.preventDefault(); setMuted(!S.muted); }
    else if (k === 'f') { e.preventDefault(); toggleFullscreen(); }
    else if (k === 'e') { e.preventDefault(); exportCurrentView(); }
    else if (e.key === '<') { e.preventDefault(); nudgeActiveSlider(-1, e.altKey); }   // matches the glyph across keyboard layouts
    else if (e.key === '>') { e.preventDefault(); nudgeActiveSlider(1, e.altKey); }
    else if (e.code === 'BracketRight') { e.preventDefault(); cycleSide(e.shiftKey ? 'a' : 'b', 1); }
    else if (e.code === 'BracketLeft') { e.preventDefault(); cycleSide(e.shiftKey ? 'a' : 'b', -1); }
  });
}

// Unload all videos + reset view to the empty dropzone (keeps saved comparisons).
function clearWorkspace() {
  pause();
  S.slots.slice().forEach((s) => removeSlot(s.id));
  S.selA = null; S.selB = null; S.view = 'grid';
  S.zoom = 1; S.panX = 0; S.panY = 0; S.rotation = 0; S.flipH = false; S.flipV = false;
  S.curTime = 0;
  showGrid();
  updateChrome();
}

async function resetAll() {
  if (!window.confirm('Reset everything — clear loaded videos AND all saved comparisons?')) return;
  cancelSessionSave();   // stop any pending debounce from resurrecting state after the wipe
  await clearAllSaved();
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

async function init() {
  initLoaders({ onChange: onSlotsChanged, onMeta });
  initGrid({ onSelect, onRemove: (id) => removeSlot(id) });
  initSaves({ onApply: applyRestoredComparison, onApplySession: applyRestoredSession });
  bindToolbar();
  bindTransport();
  bindOverlayInteraction();
  bindKeyboard();
  bindFullscreenTracking();
  bindResizeTracking();
  dom.headerResetBtn.addEventListener('click', resetAll);

  // flush the session before the tab is hidden/closed (debounce may not have fired)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveSessionNow(); });
  window.addEventListener('pagehide', () => { saveSessionNow(); });

  // initial UI state
  dom.fpsInput.value = String(S.fps);
  dom.rateSelect.value = String(S.rate);
  updateOptionButtons();
  updatePlayButton();
  updateChrome();

  // restore the last workspace (if any), then render the saved-comparisons gallery
  try { await restoreSession(); } catch (e) { /* ignore */ }
  try { await renderSavesFromStore(); } catch (e) { /* ignore */ }
}

init();
