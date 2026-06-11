import { S } from './state.js';
import { dom } from './dom.js';
import { esc, stripExt, fmtDur } from './helpers.js';

let handlers = {};

export function initGrid(h = {}) {
  handlers = h; // { onSelect(role, id), onRemove(id) }
}

// Grid videos show the FULL frame: rotate/flip are honored (orientation), but zoom/pan
// and the slider/dissolve clip+opacity (overlay-only comparison effects) are not.
function gridTransform() {
  return `rotate(${S.rotation}deg) scale(${S.flipH ? -1 : 1}, ${S.flipV ? -1 : 1})`;
}

export function applyGridTransforms() {
  const tf = gridTransform();
  S.slots.forEach((slot) => {
    const v = slot.videoEl;
    if (!v) return;
    v.style.transform = tf;
    v.style.transformOrigin = 'center center';
    v.style.clipPath = 'none';
    v.style.opacity = '1';
  });
}

export function renderGrid() {
  const grid = dom.videoGrid;
  grid.innerHTML = '';
  grid.className = 'video-grid on count-' + Math.min(Math.max(S.slots.length, 1), 4);

  S.slots.forEach((slot) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    if (S.selA === slot.id) tile.classList.add('sel-a');
    if (S.selB === slot.id) tile.classList.add('sel-b');

    // the (re-parented) video element — drop the overlay's clip/opacity (comparison effects)
    // but keep rotate/flip so the grid reflects the current orientation.
    const v = slot.videoEl;
    v.style.clipPath = 'none';
    v.style.opacity = '1';
    v.style.transform = gridTransform();
    v.style.transformOrigin = 'center center';
    tile.appendChild(v);

    // caption bar
    const bar = document.createElement('div');
    bar.className = 'tile-bar';
    const spec = slot.ready ? `${slot.w}×${slot.h} · ${fmtDur(slot.duration)}` : 'loading…';
    bar.innerHTML = `<span class="tile-name" title="${esc(slot.name)}">${esc(stripExt(slot.name))}</span><span class="tile-spec">${spec}</span>`;
    tile.appendChild(bar);

    // remove button
    const rm = document.createElement('button');
    rm.className = 'tile-remove';
    rm.type = 'button';
    rm.textContent = '×';
    rm.title = 'Remove video';
    rm.addEventListener('click', (e) => { e.stopPropagation(); handlers.onRemove?.(slot.id); });
    tile.appendChild(rm);

    // A / B selection
    const sel = document.createElement('div');
    sel.className = 'tile-sel';
    const aBtn = document.createElement('button');
    aBtn.type = 'button';
    aBtn.className = 'sel-btn' + (S.selA === slot.id ? ' on-a' : '');
    aBtn.textContent = 'A';
    aBtn.title = 'Assign to A';
    aBtn.addEventListener('click', (e) => { e.stopPropagation(); handlers.onSelect?.('a', slot.id); });
    const bBtn = document.createElement('button');
    bBtn.type = 'button';
    bBtn.className = 'sel-btn' + (S.selB === slot.id ? ' on-b' : '');
    bBtn.textContent = 'B';
    bBtn.title = 'Assign to B';
    bBtn.addEventListener('click', (e) => { e.stopPropagation(); handlers.onSelect?.('b', slot.id); });
    sel.append(aBtn, bBtn);
    tile.appendChild(sel);

    grid.appendChild(tile);
  });
}
