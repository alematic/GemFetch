// Shared helpers: IndexedDB key/value store + Gemini model discovery.

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

// --- Gemini model discovery -------------------------------------------------

// Ask the API which text models this key can call. Returns a shortlist,
// best first (newest chat-grade "flash"/"pro" models and *-latest aliases).
async function discoverModels(apiKey) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`,
  );
  if (!r.ok) throw new Error(`ListModels ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const names = (j.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /^gemini/i.test(n) && !/embedding|aqa|vision|image|tts|audio|gemma/i.test(n));

  const score = (n) => {
    let s = 0;
    if (/-latest$/.test(n)) s += 1000;
    const ver = parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || "0");
    s += ver * 10;
    if (/flash/.test(n)) s += 5;
    if (/pro/.test(n)) s += 3;
    if (/lite|-8b|thinking|preview|-exp|\d{6,}/.test(n)) s -= 8; // dated snapshots, previews
    return s;
  };
  const ranked = [...new Set(names)].sort((a, b) => score(b) - score(a));
  return ranked.slice(0, 8);
}

// Given a 404 body, pull the model Google tells us to use instead.
function suggestedReplacement(text) {
  const m = (text || "").match(/use\s+models\/([A-Za-z0-9._-]+)/);
  return m ? m[1] : null;
}
