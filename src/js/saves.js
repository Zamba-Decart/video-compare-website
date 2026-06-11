import { S, getSlot } from './state.js';
import { dom } from './dom.js';
import { stripExt, esc } from './helpers.js';
import { putBlob, getBlob, deleteBlob, listBlobIds, hasBlob, kvGet, kvSet, kvDel } from './storage.js';
import { addBlobSlot, blobIdFor, removeSlot } from './loaders.js';

const MAX_SAVES = 12;
let onApply = null;          // app: applies a restored comparison (sets A/B + state, shows overlay)
let onApplySession = null;   // app: applies a restored session (slots + view + playback)
let sessionTimer = null;
let wipeGen = 0;             // bumped by clearAllSaved; saveSessionNow bails if it changed mid-flight
let savesChain = Promise.resolve();   // serializes read-modify-write on kv['saves']

// Serialize kv['saves'] mutations so rapid save/delete clicks can't lost-update each other.
function lockSaves(fn) {
  const run = savesChain.then(fn, fn);
  savesChain = run.then(() => {}, () => {});
  return run;
}

export function initSaves(handlers = {}) {
  onApply = handlers.onApply || null;
  onApplySession = handlers.onApplySession || null;
}

const slotBlobId = (slot) => slot.blobId || blobIdFor(slot.file, slot.name);

async function safe(promise, fallback) {
  try { return await promise; } catch (e) { return fallback; }
}

// Returns the blob id, or null if the blob could not be stored (quota / no storage),
// so callers never persist a record that references a non-existent blob.
async function ensureBlob(slot) {
  const id = slotBlobId(slot);
  try {
    if (!(await hasBlob(id))) await putBlob(id, slot.file, slot.name);
    return id;
  } catch (e) {
    return null;
  }
}

// Small gallery thumbnail of the current overlay (ignores zoom/pan/rotate for a clean frame).
function capturePreview(size = 320) {
  const a = getSlot(S.selA);
  const b = getSlot(S.selB);
  if (!a || !b) return '';
  const W = size;
  const H = Math.round(size * (a.w && a.h ? a.h / a.w : 9 / 16));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d0d0f';
  ctx.fillRect(0, 0, W, H);
  const draw = (v, opacity, clipFrom) => {
    const iw = v.videoWidth;
    const ih = v.videoHeight;
    if (!iw || !ih) return;
    const fit = Math.min(W / iw, H / ih);
    const dw = iw * fit;
    const dh = ih * fit;
    ctx.save();
    if (clipFrom !== null) { ctx.beginPath(); ctx.rect(W * clipFrom, 0, W * (1 - clipFrom), H); ctx.clip(); }
    ctx.globalAlpha = opacity;
    ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.restore();
  };
  draw(a.videoEl, 1, null);
  if (S.mode === 'slider') {
    draw(b.videoEl, 1, S.pos);
    ctx.fillStyle = '#c8f03c';
    ctx.fillRect(W * S.pos - 1, 0, 2, H);
  } else if (S.mode === 'dissolve') {
    draw(b.videoEl, S.dissolve, null);
  } else {
    draw(b.videoEl, S.toggleFrame === 'b' ? 1 : 0, null);
  }
  try { return canvas.toDataURL('image/jpeg', 0.6); } catch (e) { return ''; }
}

function fmtWhen(ts) {
  try { return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch (e) { return ''; }
}

// ---- saved comparisons gallery -----------------------------------------
// Returns true if a comparison was saved. Works from grid or overlay (needs A and B set).
export async function saveCurrentComparison() {
  const a = getSlot(S.selA);
  const b = getSlot(S.selB);
  if (!a || !b || S.selA === S.selB) {
    window.alert('Pick two clips (assign A and B) to save a comparison.');
    return false;
  }

  const preview = capturePreview();
  const aId = await ensureBlob(a);
  const bId = await ensureBlob(b);
  if (!aId || !bId) {
    window.alert('Couldn’t save — browser storage is unavailable or full.');
    return false;
  }

  const rec = {
    id: `cmp-${Date.now()}-${Math.floor(Math.random() * 1e5)}`,
    savedAt: Date.now(),
    label: `${stripExt(a.name)}  vs  ${stripExt(b.name)}`,
    preview,
    a: { blobId: aId, name: a.name },
    b: { blobId: bId, name: b.name },
    mode: S.mode, pos: S.pos, dissolve: S.dissolve, toggleFrame: S.toggleFrame,
    zoom: S.zoom, panX: S.panX, panY: S.panY, rotation: S.rotation, flipH: S.flipH, flipV: S.flipV,
  };

  await lockSaves(async () => {
    let saves = (await safe(kvGet('saves'), [])) || [];
    saves.unshift(rec);
    saves = saves.slice(0, MAX_SAVES);
    await safe(kvSet('saves', saves));
    renderSaves(saves);
  });
  gcBlobs();
  return true;
}

export async function renderSavesFromStore() {
  const saves = (await safe(kvGet('saves'), [])) || [];
  renderSaves(saves);
}

function renderSaves(saves) {
  const list = dom.savesList;
  if (!list) return;
  if (!saves || !saves.length) {
    dom.savesRail.hidden = true;
    list.innerHTML = '';
    return;
  }
  dom.savesRail.hidden = false;
  list.innerHTML = saves.map((r) => `
    <div class="save-card" data-id="${r.id}" title="${esc(r.label)}">
      <button class="save-open" data-open="${r.id}" type="button">
        ${r.preview ? `<img class="save-thumb" src="${r.preview}" alt="">` : '<div class="save-thumb"></div>'}
        <span class="save-mode">${r.mode}</span>
      </button>
      <button class="save-del" data-del="${r.id}" type="button" aria-label="Delete">×</button>
      <div class="save-meta">
        <div class="save-label">${esc(r.label)}</div>
        <div class="save-time">${fmtWhen(r.savedAt)}</div>
      </div>
    </div>`).join('');

  list.querySelectorAll('[data-open]').forEach((n) => n.addEventListener('click', () => restoreSave(n.dataset.open)));
  list.querySelectorAll('[data-del]').forEach((n) => n.addEventListener('click', (e) => { e.stopPropagation(); deleteSave(n.dataset.del); }));
}

// Returns { slot, created } so a failed restore can roll back slots it just made.
async function loadClipSlot(ref) {
  const existing = S.slots.find((s) => slotBlobId(s) === ref.blobId);
  if (existing) return { slot: existing, created: false };
  const rec = await safe(getBlob(ref.blobId), null);
  if (!rec) return { slot: null, created: false };
  const made = addBlobSlot(rec.blob, ref.name || rec.name, ref.blobId, false);  // don't fire onChange; onApply renders
  return { slot: made, created: !!made };
}

async function restoreSave(id) {
  const saves = (await safe(kvGet('saves'), [])) || [];
  const rec = saves.find((r) => r.id === id);
  if (!rec || !onApply) return;
  const a = await loadClipSlot(rec.a);
  const b = await loadClipSlot(rec.b);
  if (!a.slot || !b.slot) {
    // roll back any slot we freshly created (avoid orphan slot + leaked object URL)
    [a, b].forEach((r) => { if (r.created && r.slot) removeSlot(r.slot.id); });
    window.alert('Could not restore — the saved video data is missing.');
    return;
  }
  onApply(rec, a.slot.id, b.slot.id);
}

async function deleteSave(id) {
  await lockSaves(async () => {
    let saves = (await safe(kvGet('saves'), [])) || [];
    saves = saves.filter((r) => r.id !== id);
    await safe(kvSet('saves', saves));
    renderSaves(saves);
  });
  gcBlobs();
}

// ---- session auto-save / restore ---------------------------------------
export function scheduleSessionSave() {
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => { saveSessionNow(); }, 700);
}

export function cancelSessionSave() {
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = null;
}

export async function saveSessionNow() {
  const gen = wipeGen;
  try {
    if (!S.slots.length) { await safe(kvDel('session')); return; }
    const aSlot = getSlot(S.selA);
    const bSlot = getSlot(S.selB);
    const slots = [];
    for (const s of S.slots) {
      if (gen !== wipeGen) return;          // a reset happened mid-flight — don't resurrect
      const id = await ensureBlob(s);
      if (id) slots.push({ blobId: id, name: s.name });
    }
    const rec = {
      slots,
      selA: aSlot ? slotBlobId(aSlot) : null,   // by content id, robust to skipped/deduped slots on restore
      selB: bSlot ? slotBlobId(bSlot) : null,
      view: S.view, mode: S.mode, pos: S.pos, dissolve: S.dissolve, toggleFrame: S.toggleFrame,
      zoom: S.zoom, panX: S.panX, panY: S.panY, rotation: S.rotation, flipH: S.flipH, flipV: S.flipV,
      loop: S.loop, autoplay: S.autoplay, muted: S.muted, rate: S.rate, fps: S.fps, curTime: S.curTime,
    };
    if (gen !== wipeGen) return;
    await safe(kvSet('session', rec));
    gcBlobs();
  } catch (e) { /* ignore */ }
}

export async function restoreSession() {
  const rec = await safe(kvGet('session'), null);
  if (!rec || !Array.isArray(rec.slots) || !rec.slots.length || !onApplySession) return false;
  const created = [];
  for (const sm of rec.slots) {
    const b = await safe(getBlob(sm.blobId), null);
    if (!b) continue;
    const slot = addBlobSlot(b.blob, sm.name || b.name, sm.blobId, false);
    if (slot) created.push(slot);
  }
  if (!created.length) return false;
  onApplySession(rec, created);
  return true;
}

// Wipe all persisted data (saves, session, stored video blobs).
export async function clearAllSaved() {
  wipeGen += 1;   // invalidate any in-flight saveSessionNow so it can't resurrect cleared data
  cancelSessionSave();
  await safe(kvDel('saves'));
  await safe(kvDel('session'));
  try { const ids = (await safe(listBlobIds(), [])) || []; for (const id of ids) await safe(deleteBlob(id)); } catch (e) { /* ignore */ }
  renderSaves([]);
}

// Delete any stored blob not referenced by a save, the session, or a loaded slot.
async function gcBlobs() {
  try {
    const keep = new Set();
    const saves = (await safe(kvGet('saves'), [])) || [];
    saves.forEach((r) => { keep.add(r.a.blobId); keep.add(r.b.blobId); });
    const sess = await safe(kvGet('session'), null);
    if (sess && Array.isArray(sess.slots)) sess.slots.forEach((s) => keep.add(s.blobId));
    S.slots.forEach((s) => keep.add(slotBlobId(s)));
    const ids = (await safe(listBlobIds(), [])) || [];
    for (const id of ids) if (!keep.has(id)) await safe(deleteBlob(id));
  } catch (e) { /* ignore */ }
}
