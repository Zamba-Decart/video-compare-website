import { S, getSlot } from './state.js';
import { stripExt } from './helpers.js';

// Draw a video's current frame with the active view transforms applied,
// optionally clipped to the right of `clipLeftRatio` (for slider mode).
function drawTransformed(ctx, video, width, height, opacity = 1, clipLeftRatio = null) {
  const iw = video.videoWidth;
  const ih = video.videoHeight;
  if (!iw || !ih) return;
  const fit = Math.min(width / iw, height / ih);
  const drawW = iw * fit;
  const drawH = ih * fit;

  ctx.save();
  if (clipLeftRatio !== null) {
    ctx.beginPath();
    ctx.rect(width * clipLeftRatio, 0, width * (1 - clipLeftRatio), height);
    ctx.clip();
  }
  ctx.translate(width / 2 + S.panX, height / 2 + S.panY);
  ctx.rotate((S.rotation * Math.PI) / 180);
  ctx.scale((S.flipH ? -1 : 1) * S.zoom, (S.flipV ? -1 : 1) * S.zoom);
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

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d0d0f';
  ctx.fillRect(0, 0, w, h);

  drawTransformed(ctx, a.videoEl, w, h, 1, null);

  if (S.mode === 'slider') {
    drawTransformed(ctx, b.videoEl, w, h, 1, S.pos);
    ctx.fillStyle = '#c8f03c';
    ctx.fillRect(w * S.pos - 1, 0, 2, h);
  } else if (S.mode === 'dissolve') {
    drawTransformed(ctx, b.videoEl, w, h, S.dissolve, null);
  } else {
    drawTransformed(ctx, b.videoEl, w, h, S.toggleFrame === 'b' ? 1 : 0, null);
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
