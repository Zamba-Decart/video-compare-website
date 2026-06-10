import { S, getSlot } from './state.js';
import { dom } from './dom.js';
import { stripExt } from './helpers.js';

// Draw a video's current frame with the active view transforms applied. The output canvas
// represents the comp box (A's aspect, A fills it), so on-screen pan (CSS px relative to the
// stage) is scaled to canvas px via `panScale`. When `clipFromPos` is set, B is clipped in the
// SAME local space the DOM clipPath uses (x ≥ (pos-0.5)·W of the element box, post-transform),
// so the exported wipe lines up with the live preview at any zoom.
function drawTransformed(ctx, video, W, H, panScale, opacity, clipFromPos) {
  const iw = video.videoWidth;
  const ih = video.videoHeight;
  if (!iw || !ih) return;
  const fit = Math.min(W / iw, H / ih);
  const drawW = iw * fit;
  const drawH = ih * fit;

  ctx.save();
  ctx.translate(W / 2 + S.panX * panScale, H / 2 + S.panY * panScale);
  ctx.rotate((S.rotation * Math.PI) / 180);
  ctx.scale((S.flipH ? -1 : 1) * S.zoom, (S.flipV ? -1 : 1) * S.zoom);
  if (clipFromPos !== null) {
    ctx.beginPath();
    ctx.rect((clipFromPos - 0.5) * W, -H * 8, W * 16, H * 16);
    ctx.clip();
  }
  ctx.globalAlpha = opacity;
  ctx.drawImage(video, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

export function exportCurrentFrame() {
  const a = getSlot(S.selA);
  const b = getSlot(S.selB);
  if (!a || !b) return;

  // Output at A's native resolution (cap the long edge to keep files sane).
  let w = a.w || 1280;
  let h = a.h || 720;
  const cap = 2560;
  if (Math.max(w, h) > cap) {
    const k = cap / Math.max(w, h);
    w = Math.round(w * k);
    h = Math.round(h * k);
  }

  const compW = dom.comp.getBoundingClientRect().width || w;
  const panScale = w / compW;   // on-screen CSS px → output canvas px

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d0d0f';
  ctx.fillRect(0, 0, w, h);

  drawTransformed(ctx, a.videoEl, w, h, panScale, 1, null);

  if (S.mode === 'slider') {
    drawTransformed(ctx, b.videoEl, w, h, panScale, 1, S.pos);
    // divider line, drawn in the same local space so it stays on the slice edge
    ctx.save();
    ctx.translate(w / 2 + S.panX * panScale, h / 2 + S.panY * panScale);
    ctx.rotate((S.rotation * Math.PI) / 180);
    ctx.scale((S.flipH ? -1 : 1) * S.zoom, (S.flipV ? -1 : 1) * S.zoom);
    ctx.beginPath();
    const x0 = (S.pos - 0.5) * w;
    ctx.moveTo(x0, -h * 8);
    ctx.lineTo(x0, h * 8);
    ctx.strokeStyle = '#c8f03c';
    ctx.lineWidth = 2 / S.zoom;   // → ~2px after the zoom scale
    ctx.stroke();
    ctx.restore();
  } else if (S.mode === 'dissolve') {
    drawTransformed(ctx, b.videoEl, w, h, panScale, S.dissolve, null);
  } else {
    drawTransformed(ctx, b.videoEl, w, h, panScale, S.toggleFrame === 'b' ? 1 : 0, null);
  }

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${stripExt(a.name)}__vs__${stripExt(b.name)}_${S.mode}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
