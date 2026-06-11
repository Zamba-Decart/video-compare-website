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

  downloadCanvas(canvas, `${stripExt(a.name)}__vs__${stripExt(b.name)}_${S.mode}.png`);
}

function downloadCanvas(canvas, name) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

// Screenshot the spread/grid view: every loaded clip's current frame in the same adaptive
// layout as the grid (1×N, or 2×2 for four), with rotate/flip honored, clipped per cell.
export function exportGridFrame() {
  const slots = S.slots.filter((s) => s.videoEl && s.videoEl.videoWidth);
  if (!slots.length) return;
  const n = slots.length;
  let cols;
  let rows;
  if (n === 1) { cols = 1; rows = 1; } else if (n === 2) { cols = 2; rows = 1; } else if (n === 3) { cols = 3; rows = 1; } else { cols = 2; rows = 2; }

  const cellW = 640;
  const cellH = 360;
  const gap = 8;
  const pad = 8;
  const W = pad * 2 + cols * cellW + (cols - 1) * gap;
  const H = pad * 2 + rows * cellH + (rows - 1) * gap;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d0d0f';
  ctx.fillRect(0, 0, W, H);

  const rot = (((S.rotation % 360) + 360) % 360) * Math.PI / 180;
  slots.forEach((s, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = pad + c * (cellW + gap);
    const y = pad + r * (cellH + gap);
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(x, y, cellW, cellH);

    const v = s.videoEl;
    const fit = Math.min(cellW / v.videoWidth, cellH / v.videoHeight);   // object-fit: contain to the cell
    const dw = v.videoWidth * fit;
    const dh = v.videoHeight * fit;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, cellW, cellH);   // clip rotated overflow like the tile's overflow:hidden
    ctx.clip();
    ctx.translate(x + cellW / 2, y + cellH / 2);
    ctx.rotate(rot);
    ctx.scale(S.flipH ? -1 : 1, S.flipV ? -1 : 1);
    ctx.drawImage(v, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  });

  downloadCanvas(canvas, `video-grid_${n}-up.png`);
}
