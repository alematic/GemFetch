const $ = (id) => document.getElementById(id);
const DEFAULT_MODEL = "gemini-2.0-flash";

async function load() {
  const cfg = await chrome.storage.local.get([
    "apiKey", "model", "folderName", "useGroups", "defaultGroup", "archiveGroup",
  ]);
  $("key").value = cfg.apiKey || "";
  $("model").value = cfg.model || DEFAULT_MODEL;
  if (!$("model").value) $("model").value = DEFAULT_MODEL; // saved model not in list
  $("useGroups").checked = !!cfg.useGroups;
  $("defaultGroup").value = cfg.defaultGroup || "Inbox";
  $("archiveGroup").value = cfg.archiveGroup || "Archive";
  $("folder").textContent = cfg.folderName ? `✓ ${cfg.folderName}` : "none selected";
}

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
    model: $("model").value || DEFAULT_MODEL,
    useGroups: $("useGroups").checked,
    defaultGroup: $("defaultGroup").value.trim() || "Inbox",
    archiveGroup: $("archiveGroup").value.trim() || "Archive",
  });
  $("status").textContent = "Saved.";
  setTimeout(() => ($("status").textContent = ""), 2000);
});

load();
