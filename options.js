const $ = (id) => document.getElementById(id);

function fillModels(list, selected) {
  const sel = $("model");
  const all = [...list];
  if (selected && !all.includes(selected)) all.unshift(selected);
  if (!all.length) all.push("gemini-flash-latest");
  sel.innerHTML = "";
  all.forEach((m) => {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    if (m === selected) o.selected = true;
    sel.appendChild(o);
  });
}

async function load() {
  const cfg = await chrome.storage.local.get([
    "apiKey", "model", "modelList", "customPrompt", "downloadDir", "autoSave",
    "useGroups", "defaultGroup", "archiveGroup",
  ]);
  $("key").value = cfg.apiKey || "";
  $("customPrompt").value = cfg.customPrompt || "";
  $("downloadDir").value = cfg.downloadDir || "GemFetch";
  $("autoSave").checked = !!cfg.autoSave;
  $("useGroups").checked = !!cfg.useGroups;
  $("defaultGroup").value = cfg.defaultGroup || "Inbox";
  $("archiveGroup").value = cfg.archiveGroup || "Archive";
  fillModels(cfg.modelList || [], cfg.model || "");
  if (cfg.apiKey && !(cfg.modelList || []).length) refresh();
}

async function refresh() {
  const apiKey = $("key").value.trim();
  if (!apiKey) { $("status").textContent = "Enter and save the API key first."; return; }
  $("status").textContent = "Loading models…";
  try {
    const list = await discoverModels(apiKey);
    await chrome.storage.local.set({ modelList: list });
    fillModels(list, $("model").value || list[0]);
    $("status").textContent = `Loaded ${list.length} models.`;
  } catch (e) {
    $("status").textContent = "Failed: " + e.message;
  }
}

$("refresh").addEventListener("click", refresh);

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    apiKey: $("key").value.trim(),
    customPrompt: $("customPrompt").value.trim(),
    downloadDir: $("downloadDir").value.trim() || "GemFetch",
    autoSave: $("autoSave").checked,
    model: $("model").value || "",
    useGroups: $("useGroups").checked,
    defaultGroup: $("defaultGroup").value.trim() || "Inbox",
    archiveGroup: $("archiveGroup").value.trim() || "Archive",
  });
  $("status").textContent = "Saved.";
  setTimeout(() => ($("status").textContent = ""), 2000);
});

load();
