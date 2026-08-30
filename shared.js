// Shared helpers: IndexedDB key/value store (for the FileSystemDirectoryHandle)

const _DB = "gss-db";
const _STORE = "kv";

function _openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function idbGet(key) {
  const db = await _openDb();
  return new Promise((res, rej) => {
    const t = db.transaction(_STORE, "readonly").objectStore(_STORE).get(key);
    t.onsuccess = () => res(t.result);
    t.onerror = () => rej(t.error);
  });
}

async function idbSet(key, value) {
  const db = await _openDb();
  return new Promise((res, rej) => {
    const t = db.transaction(_STORE, "readwrite").objectStore(_STORE).put(value, key);
    t.onsuccess = () => res();
    t.onerror = () => rej(t.error);
  });
}

async function ensurePermission(handle) {
  const opts = { mode: "readwrite" };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  if ((await handle.requestPermission(opts)) === "granted") return true;
  return false;
}
