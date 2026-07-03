import { S, getSlot } from './state.js';
import { dom } from './dom.js';
import { stripExt } from './helpers.js';

export function applyAspectRatio() {
  const a = getSlot(S.selA);
  if (a && a.w && a.h) {
    dom.stageWrap.style.aspectRatio = `${a.w} / ${a.h}`;
    // --ar lives on :root so BOTH the stage (max-width cap) and the reference panel
    // (its width is sized to the video) can read it.
    document.documentElement.style.setProperty('--ar', a.w / a.h);
    dom.stageWrap.style.maxHeight = '78vh';
    dom.stageWrap.style.minHeight = '';
  }
}

export function clearAspectRatio() {
  dom.stageWrap.style.aspectRatio = '';
  dom.stageWrap.style.maxHeight = '';
  dom.stageWrap.style.minHeight = '';
  clearStageRowSizing();
}

// Clear the JS-driven overlay sizing so grid / no-reference layouts fall back to CSS flex.
export function clearStageRowSizing() {
  [dom.stageWrap, dom.referencePanel].forEach((el) => { el.style.width = ''; el.style.height = ''; });
  if (dom.midResize) dom.midResize.style.height = '';
}

function setSize(el, w, h) {
  const wp = `${w}px`, hp = `${h}px`;
  if (el.style.width !== wp) el.style.width = wp;
  if (el.style.height !== hp) el.style.height = hp;
}

// In overlay WITH the reference panel, size the video box to the video's aspect ratio
// (so the video fills its box — no letterbox, divider stays welded) and the reference box
// to the REFERENCE content's own aspect ratio, with --ref-grow scaling the reference's
// height — so the slider actually scales the image, not just the card around it. Height
// is clamped so video + reference + handle fit the row width; the result is centered.
export function layoutStageRow() {
  const refOn = S.view === 'overlay' && document.body.classList.contains('reference-on');
  if (!refOn) { clearStageRowSizing(); return; }

  const a = getSlot(S.selA);
  const ar = (a && a.w && a.h) ? a.w / a.h : 1.78;
  const grow = S.reference.scale || 1;

  // aspect of what's actually in the panel: pinned ref video > ref image > the video's ar
  let refAr = ar;
  if (S.refVideoOn) {
    const rv = getSlot(S.refVideoId);
    if (rv && rv.w && rv.h) refAr = rv.w / rv.h;
  } else if (dom.refImg && dom.refImg.naturalWidth && dom.refImg.naturalHeight) {
    refAr = dom.refImg.naturalWidth / dom.refImg.naturalHeight;
  }

  const rowW = dom.stageRow.clientWidth;
  const reserve = 48;   // stage-row gap + mid handle + a little slack (avoid sub-px overflow)
  const prefH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stage-h')) || 460;
  const viewH = window.innerHeight * 0.78 || prefH;   // innerHeight can read 0 mid-layout
  const maxH = Math.min(prefH, viewH);
  const fitH = (rowW - reserve) / (ar + grow * refAr);
  const H = Math.round(Math.max(160, Math.min(maxH, fitH)));
  const videoW = Math.round(H * ar);
  // the reference may outgrow the stage height (that's the point of the slider) —
  // clamp it to the viewport, not to the video's preferred height
  const refH = Math.round(Math.min(viewH, H * grow));

  setSize(dom.stageWrap, videoW, H);
  setSize(dom.referencePanel, Math.round(refH * refAr), refH);
  if (dom.midResize) dom.midResize.style.height = `${H}px`;
}

// Move the two selected videos into the overlay stage (A under, B over).
export function mountOverlay() {
  const a = getSlot(S.selA);
  const b = getSlot(S.selB);
  if (!a || !b) return;
  // prepend B then A so DOM order is [A, B, divider, labels…] → B paints over A,
  // divider/labels (with z-index) stay on top.
  dom.comp.prepend(b.videoEl);
  dom.comp.prepend(a.videoEl);
}

export function mountReferenceVideo() {
  const ref = S.refVideoOn ? getSlot(S.refVideoId) : null;
  dom.refVideoStage.querySelectorAll('video').forEach((v) => v.remove());
  if (!ref) return;

  ref.videoEl.style.clipPath = 'none';
  ref.videoEl.style.opacity = '1';
  ref.videoEl.style.transform = 'none';
  ref.videoEl.style.transformOrigin = 'center center';
  dom.refVideoStage.appendChild(ref.videoEl);
  dom.refVideoLabel.textContent = stripExt(ref.name);
}

function applyTransforms(els) {
  const sx = S.flipH ? -1 : 1;
  const sy = S.flipV ? -1 : 1;
  const tf = `translate(${S.panX}px, ${S.panY}px) rotate(${S.rotation}deg) scale(${S.zoom * sx}, ${S.zoom * sy})`;
  els.forEach((el) => {
    el.style.transform = tf;
    el.style.transformOrigin = 'center center';
  });

  dom.flipHBtn.classList.toggle('is-on', S.flipH);
  dom.flipVBtn.classList.toggle('is-on', S.flipV);
  dom.rotateBtn.classList.toggle('is-on', S.rotation % 360 !== 0);
  dom.resetViewBtn.classList.toggle('is-on', S.zoom > 1 || S.panX !== 0 || S.panY !== 0);
}

// Weld the wipe divider to B's real slice edge under ANY view transform.
// The clip edge is the local vertical line x = pos·W of the (shared) element box.
// Map its midpoint through the same transform = translate(pan) · rotate(θ) · scale(zoom·flip)
// about the box centre, and rotate the line by θ. clipPath insets the element box, so the
// horizontal scale (incl. flipH) is all that moves the edge along local x; flipV / the y-scale
// leave a vertical edge unchanged. At zoom 1 / θ 0 this reduces to left = pos·W as before.
function positionDivider() {
  const cr = dom.comp.getBoundingClientRect();
  const CW = cr.width;
  const CH = cr.height;
  const th = (S.rotation * Math.PI) / 180;
  const ax = S.zoom * (S.flipH ? -1 : 1);
  const off = ax * CW * (S.pos - 0.5);          // signed distance of the edge from centre, along local x
  const midX = CW / 2 + S.panX + Math.cos(th) * off;
  const midY = CH / 2 + S.panY + Math.sin(th) * off;
  dom.divider.style.left = midX + 'px';
  dom.divider.style.top = midY + 'px';
  dom.divider.style.transform = `rotate(${S.rotation}deg)`;
}

export function renderOverlay() {
  if (S.view !== 'overlay') return;
  const a = getSlot(S.selA);
  const b = getSlot(S.selB);
  if (!a || !b) return;
  // NOTE: do NOT call layoutStageRow() here — renderOverlay runs on every wipe-slider
  // frame, and layoutStageRow does layout reads/writes that would thrash + stutter the
  // drag. Callers invoke layoutStageRow() only when the layout actually changes.
  const va = a.videoEl;
  const vb = b.videoEl;

  const pct = (S.pos * 100).toFixed(3) + '%';

  va.style.opacity = '1';
  va.style.clipPath = 'none';
  applyTransforms([va, vb]);

  if (S.mode === 'slider') {
    vb.style.opacity = '1';
    vb.style.clipPath = `inset(0 0 0 ${pct})`;

    dom.divider.style.display = 'block';
    positionDivider();

    dom.lblA.style.display = 'block';
    dom.lblB.style.display = 'block';
    dom.lblA.textContent = stripExt(a.name);
    dom.lblB.textContent = stripExt(b.name);
    dom.tHint.style.display = 'none';

    dom.stageWrap.style.cursor = S.panning ? 'grabbing' : (S.zoom > 1 ? 'grab' : 'col-resize');
  } else if (S.mode === 'dissolve') {
    vb.style.opacity = String(S.dissolve);
    vb.style.clipPath = 'none';

    dom.divider.style.display = 'none';
    dom.lblA.style.display = 'none';
    dom.lblB.style.display = 'none';
    dom.tHint.style.display = 'none';

    dom.stageWrap.style.cursor = S.panning ? 'grabbing' : (S.zoom > 1 ? 'grab' : 'default');
  } else {
    vb.style.clipPath = 'none';
    dom.divider.style.display = 'none';
    dom.lblB.style.display = 'none';
    dom.tHint.style.display = 'block';
    dom.stageWrap.style.cursor = S.panning ? 'grabbing' : (S.zoom > 1 ? 'grab' : 'pointer');

    if (S.toggleFrame === 'a') {
      vb.style.opacity = '0';
      dom.lblA.style.display = 'block';
      dom.lblA.textContent = stripExt(a.name) + ' (A)';
    } else {
      vb.style.opacity = '1';
      dom.lblA.style.display = 'block';
      dom.lblA.textContent = stripExt(b.name) + ' (B)';
    }
  }

  // bottom-corner side markers: both in slider/dissolve; only the visible side in toggle
  const showA = S.mode !== 'toggle' || S.toggleFrame === 'a';
  const showB = S.mode !== 'toggle' || S.toggleFrame === 'b';
  dom.cornerA.style.display = showA ? 'flex' : 'none';
  dom.cornerB.style.display = showB ? 'flex' : 'none';

  const isDissolve = S.mode === 'dissolve';
  dom.dWrap.style.opacity = isDissolve ? '1' : '0.3';
  dom.dWrap.style.pointerEvents = isDissolve ? 'auto' : 'none';
}

export function renderInfoBar() {
  const a = getSlot(S.selA);
  const b = getSlot(S.selB);
  const r = S.refVideoOn ? getSlot(S.refVideoId) : null;
  const parts = [];
  if (r) parts.push({ color: '#ffcf5a', text: `R: ${stripExt(r.name)}  ${r.w}×${r.h}` });
  if (a) parts.push({ color: 'var(--acc)', text: `A: ${stripExt(a.name)}  ${a.w}×${a.h}` });
  if (b) parts.push({ color: 'var(--acc2)', text: `B: ${stripExt(b.name)}  ${b.w}×${b.h}` });
  dom.infoList.innerHTML = parts
    .map((p) => `<div class="info-item"><span class="info-dot" style="background:${p.color}"></span><span>${p.text}</span></div>`)
    .join('');
}
