import { S, getSlot } from './state.js';
import { dom } from './dom.js';
import { stripExt } from './helpers.js';

export function applyAspectRatio() {
  const a = getSlot(S.selA);
  if (a && a.w && a.h) {
    dom.stageWrap.style.aspectRatio = `${a.w} / ${a.h}`;
    dom.stageWrap.style.maxHeight = '78vh';
    dom.stageWrap.style.minHeight = '';
  }
}

export function clearAspectRatio() {
  dom.stageWrap.style.aspectRatio = '';
  dom.stageWrap.style.maxHeight = '';
  dom.stageWrap.style.minHeight = '';
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

  const isDissolve = S.mode === 'dissolve';
  dom.dWrap.style.opacity = isDissolve ? '1' : '0.3';
  dom.dWrap.style.pointerEvents = isDissolve ? 'auto' : 'none';
}

export function renderInfoBar() {
  const a = getSlot(S.selA);
  const b = getSlot(S.selB);
  const parts = [];
  if (a) parts.push({ color: 'var(--acc)', text: `A: ${stripExt(a.name)}  ${a.w}×${a.h}` });
  if (b) parts.push({ color: 'var(--acc2)', text: `B: ${stripExt(b.name)}  ${b.w}×${b.h}` });
  dom.infoList.innerHTML = parts
    .map((p) => `<div class="info-item"><span class="info-dot" style="background:${p.color}"></span><span>${p.text}</span></div>`)
    .join('');
}
