import { S, getSlot } from './state.js';
import { dom } from './dom.js';
import { fmtTime } from './helpers.js';

const DRIFT_TOLERANCE = 0.08;   // seconds before we snap a lagging video
const DRIFT_INTERVAL = 250;     // ms between drift corrections
let rafId = null;
let lastDrift = 0;

// ---- active set ---------------------------------------------------------
export function getActiveSlots() {
  if (S.view === 'overlay') {
    return [getSlot(S.selA), getSlot(S.selB)].filter(Boolean);
  }
  return S.slots;
}

function activeVideos() {
  return getActiveSlots().map((s) => s.videoEl).filter(Boolean);
}

function primaryVideo() {
  // master clock = the active video with the longest known duration
  const vids = activeVideos().filter((v) => isFinite(v.duration) && v.duration > 0);
  if (!vids.length) return activeVideos()[0] || null;
  return vids.reduce((a, b) => (b.duration > a.duration ? b : a));
}

export function computeDuration() {
  S.duration = activeVideos().reduce((m, v) => Math.max(m, v.duration || 0), 0);
  return S.duration;
}

// ---- transport ----------------------------------------------------------
export function play() {
  if (!activeVideos().length) return;
  S.playing = true;
  applyMuteRate();
  // re-sync everyone to the master time before playing
  syncTimes(S.curTime);
  activeVideos().forEach((v) => { v.play().catch(() => {}); });
  startClock();
  updatePlayButton();
}

export function pause() {
  S.playing = false;
  const prim = primaryVideo();
  if (prim) S.curTime = prim.currentTime;   // resync so frame-step/scrub start from the real position
  activeVideos().forEach((v) => v.pause());
  stopClock();
  updatePlayButton();
  updateScrub(S.curTime);
}

export function togglePlay() {
  if (S.playing) pause(); else play();
}

export function seek(t) {
  const dur = S.duration || computeDuration();
  const clamped = Math.max(0, Math.min(dur || t, t));
  S.curTime = clamped;
  syncTimes(clamped);
  updateScrub(clamped);
}

export function seekFraction(frac) {
  seek(frac * (S.duration || computeDuration()));
}

function syncTimes(t) {
  activeVideos().forEach((v) => {
    const target = Math.min(t, v.duration || t);
    if (Math.abs(v.currentTime - target) > 0.001) {
      try { v.currentTime = target; } catch (e) { /* noop */ }
    }
  });
}

export function frameStep(dir) {
  if (S.playing) pause();
  const prim = primaryVideo();
  const base = prim ? prim.currentTime : S.curTime;   // step from the live position, not a stale clock value
  const step = 1 / (S.fps || 30);
  seek(base + dir * step);
}

// ---- options ------------------------------------------------------------
export function applyMuteRate() {
  activeVideos().forEach((v) => {
    v.muted = S.muted;
    v.playbackRate = S.rate;
  });
}

export function setMuted(m) {
  S.muted = m;
  applyMuteRate();
  updateOptionButtons();
}

export function setLoop(l) {
  S.loop = l;
  updateOptionButtons();
}

export function setAutoplay(a) {
  S.autoplay = a;
  updateOptionButtons();
}

export function setRate(r) {
  S.rate = r;
  applyMuteRate();
}

// Called when the active set (view / selection / slots) changes.
export function syncActive() {
  computeDuration();
  const active = new Set(activeVideos());
  // pause anything no longer active
  S.slots.forEach((s) => {
    if (s.videoEl && !active.has(s.videoEl)) s.videoEl.pause();
  });
  applyMuteRate();
  syncTimes(Math.min(S.curTime, S.duration));
  if (S.playing && active.size) {
    activeVideos().forEach((v) => v.play().catch(() => {}));
    startClock();
  }
  updateDurationDisplay();
  updateScrub(S.curTime);
  updatePlayButton();
}

// ---- master clock -------------------------------------------------------
function startClock() {
  if (rafId != null) return;
  lastDrift = performance.now();
  const tick = () => {
    if (!S.playing) { rafId = null; return; }
    const prim = primaryVideo();
    if (prim) {
      S.curTime = prim.currentTime;
      const dur = S.duration || computeDuration();

      // loop / stop at the end of the master timeline
      if (dur > 0 && S.curTime >= dur - 0.04 && allEndedOrAtEnd(dur)) {
        if (S.loop) {
          seek(0);
          activeVideos().forEach((v) => v.play().catch(() => {}));
        } else {
          pause();
          return;
        }
      }

      // periodic drift correction
      const now = performance.now();
      if (now - lastDrift > DRIFT_INTERVAL) {
        lastDrift = now;
        activeVideos().forEach((v) => {
          if (v === prim) return;
          const target = Math.min(S.curTime, v.duration || S.curTime);
          if (Math.abs(v.currentTime - target) > DRIFT_TOLERANCE && !v.seeking) {
            try { v.currentTime = target; } catch (e) { /* noop */ }
          }
        });
      }
      if (!S.scrubbing) updateScrub(S.curTime);
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function allEndedOrAtEnd(dur) {
  return activeVideos().every((v) => v.ended || (v.currentTime >= (v.duration || dur) - 0.06));
}

function stopClock() {
  if (rafId != null) cancelAnimationFrame(rafId);
  rafId = null;
}

// ---- UI sync ------------------------------------------------------------
export function updatePlayButton() {
  dom.playBtn.textContent = S.playing ? '⏸' : '▶';
}

export function updateScrub(t) {
  const dur = S.duration || 0;
  if (!S.scrubbing) {
    dom.scrub.value = String(dur > 0 ? Math.round((t / dur) * 1000) : 0);
  }
  dom.tCur.textContent = fmtTime(t);
}

export function updateDurationDisplay() {
  dom.tDur.textContent = fmtTime(S.duration || 0);
}

export function updateOptionButtons() {
  dom.loopBtn.classList.toggle('on', S.loop);
  dom.autoplayBtn.classList.toggle('on', S.autoplay);
  dom.muteBtn.classList.toggle('on', !S.muted);
  dom.muteBtn.textContent = S.muted ? '🔇 Muted' : '🔊 Sound';
}
