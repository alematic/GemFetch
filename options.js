const $ = (id) => document.getElementById(id);

const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-flash-latest",
];

function fillModels(list, selected) {
  const sel = $("model");
  sel.innerHTML = "";
  const seen = new Set();
  const all = [...list];
  if (selected && !all.includes(selected)) all.unshift(selected);
  all.forEach((m) => {
    if (seen.has(m)) return;
    seen.add(m);
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    if (m === selected) o.selected = true;
    sel.appendChild(o);
  });
}

async function fetchModels(apiKey) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`,
  );
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return (j.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /gemini/i.test(n))
    .sort();
}

async function load() {
  const cfg = await chrome.storage.local.get([
    "apiKey", "model", "modelList", "folderName",
    "useGroups", "defaultGroup", "archiveGroup",
  ]);
  $("key").value = cfg.apiKey || "";
  $("useGroups").checked = !!cfg.useGroups;
  $("defaultGroup").value = cfg.defaultGroup || "Inbox";
  $("archiveGroup").value = cfg.archiveGroup || "Archive";
  $("folder").textContent = cfg.folderName ? `✓ ${cfg.folderName}` : "none selected";
  fillModels(cfg.modelList && cfg.modelList.length ? cfg.modelList : FALLBACK_MODELS, cfg.model || "gemini-2.5-flash");
}

$("refresh").addEventListener("click", async () => {
  const apiKey = $("key").value.trim();
  if (!apiKey) { $("status").textContent = "Enter the API key first."; return; }
  $("status").textContent = "Loading models…";
  try {
    const list = await fetchModels(apiKey);
    await chrome.storage.local.set({ modelList: list });
    fillModels(list, $("model").value);
    $("status").textContent = `Loaded ${list.length} models.`;
  } catch (e) {
    $("status").textContent = "Failed: " + e.message;
  }
});

$("pick").addEventListener("click", async () => {
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "gemfetch-folder" });
    await ensurePermission(handle);
    await idbSet("dirHandle", handle);
    await chrome.storage.local.set({ folderName: handle.name });
    $("folder").textContent = `✓ ${handle.name}`;
    $("status").textContent = "Folder set.";
  } catch (e) {
    if (e.name !== "AbortError") $("status").textContent = "Error: " + e.message;
  }
});

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    apiKey: $("key").value.trim(),
    model: $("model").value || "gemini-2.5-flash",
    useGroups: $("useGroups").checked,
    defaultGroup: $("defaultGroup").value.trim() || "Inbox",
    archiveGroup: $("archiveGroup").value.trim() || "Archive",
  });
  $("status").textContent = "Saved.";
  setTimeout(() => ($("status").textContent = ""), 2000);
});

load();
