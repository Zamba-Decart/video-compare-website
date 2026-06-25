// Portable workspace bundles: export the entire persistent state (current workspace +
// all saved comparisons + every video/reference blob) to a single .zip, and import one
// back. Serverless — the file is downloaded and shared manually. JSZip is loaded as a
// global (vendored, non-module) so this works on the live site AND the standalone build.
import { kvGet, kvSet, kvDel, putBlob, getBlob, deleteBlob, listBlobIds } from './storage.js';
import { saveSessionNow } from './saves.js';

const MAGIC = 'video-comparator';
const SUFFIX = '_video_comparator';

// Keep only filename-safe characters; the suffix below is always appended.
function sanitizeName(raw) {
  const base = (raw || '').trim().replace(/[^A-Za-z0-9 _.-]+/g, '').replace(/\s+/g, ' ').trim();
  return base || 'workspace';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function looksLikeBundle(file) {
  return !!file && (/\.zip$/i.test(file.name || '') || file.type === 'application/zip');
}

// Write the whole workspace to a .zip and trigger a download.
// Returns the filename, or null if there's nothing to export.
export async function exportWorkspace(rawName) {
  if (!window.JSZip) throw new Error('JSZip not loaded');
  await saveSessionNow();   // flush the live workspace so the export matches exactly what's on screen

  const session = await kvGet('session').catch(() => null);
  const saves = (await kvGet('saves').catch(() => null)) || [];
  if (!session && !saves.length) return null;

  const ids = (await listBlobIds().catch(() => null)) || [];
  const zip = new window.JSZip();
  const mediaIndex = [];
  let i = 0;
  for (const id of ids) {
    const rec = await getBlob(id).catch(() => null);
    if (!rec || !rec.blob) continue;
    const path = `media/${i}`;
    zip.file(path, rec.blob);                 // mp4/webm are already compressed → STORE below
    mediaIndex.push({ blobId: id, name: rec.name || '', file: path });
    i += 1;
  }

  const manifest = { app: MAGIC, version: 1, session: session || null, saves, media: mediaIndex };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const filename = sanitizeName(rawName) + SUFFIX + '.zip';
  downloadBlob(blob, filename);
  return filename;
}

// Parse a bundle and FULLY REPLACE storage with it — no carryover. The recipient's existing
// media, saved comparisons, and session are wiped, then the bundle's are written. Does NOT
// touch the live in-memory app — the caller reloads to restore from storage.
// Throws a friendly Error if the file isn't a valid bundle.
export async function importWorkspaceToStorage(file, { workspaceName = '' } = {}) {
  if (!window.JSZip) throw new Error('JSZip not loaded');

  let zip;
  try { zip = await window.JSZip.loadAsync(file); }
  catch (e) { throw new Error('not a readable .zip file'); }

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('not a Video Comparator bundle');
  let manifest;
  try { manifest = JSON.parse(await manifestFile.async('string')); }
  catch (e) { throw new Error('bundle manifest is corrupt'); }
  if (manifest.app !== MAGIC) throw new Error('not a Video Comparator bundle');

  // Wipe existing media so nothing of the recipient's old workspace carries over.
  const oldIds = (await listBlobIds().catch(() => null)) || [];
  for (const id of oldIds) await deleteBlob(id).catch(() => {});

  // Write every media blob from the bundle.
  for (const m of (manifest.media || [])) {
    const f = m.file && zip.file(m.file);
    if (!f) continue;
    const blob = await f.async('blob');
    await putBlob(m.blobId, blob, m.name || '').catch(() => {});
  }

  // Adopt the bundle's saved comparisons + current workspace wholesale (replace, not merge).
  await kvSet('saves', Array.isArray(manifest.saves) ? manifest.saves : []).catch(() => {});
  const session = manifest.session || null;
  if (session) {
    if (workspaceName) session.workspaceName = workspaceName;
    await kvSet('session', session).catch(() => {});
  } else {
    await kvDel('session').catch(() => {});
  }

  return { savesTotal: Array.isArray(manifest.saves) ? manifest.saves.length : 0, hasSession: !!session };
}
