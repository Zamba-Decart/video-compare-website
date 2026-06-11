// Tiny IndexedDB wrapper: a `blobs` store (video bytes, keyed by a content id) and a
// `kv` store (saved-comparisons array + session record). All calls reject on failure;
// callers wrap in try/catch so the app still works when storage is unavailable
// (private mode, some file:// contexts, quota errors).
const DB_NAME = 'video-compare-db';
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const putBlob = (id, blob, name) => run('blobs', 'readwrite', (s) => s.put({ blob, name }, id));
export const getBlob = (id) => run('blobs', 'readonly', (s) => s.get(id));
export const deleteBlob = (id) => run('blobs', 'readwrite', (s) => s.delete(id));
export const listBlobIds = () => run('blobs', 'readonly', (s) => s.getAllKeys());
export const hasBlob = (id) => getBlob(id).then((v) => !!v);

export const kvGet = (key) => run('kv', 'readonly', (s) => s.get(key));
export const kvSet = (key, val) => run('kv', 'readwrite', (s) => s.put(val, key));
export const kvDel = (key) => run('kv', 'readwrite', (s) => s.delete(key));
