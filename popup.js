const logEl = document.getElementById("log");
const editorEl = document.getElementById("editor");
const titleEl = document.getElementById("title");
const synthEl = document.getElementById("synth");
const groupEl = document.getElementById("group");
const groupLabel = document.getElementById("groupLabel");
const saveEl = document.getElementById("save");
const stopEl = document.getElementById("stop");
const restartEl = document.getElementById("restart");
const recentEl = document.getElementById("recent");
const recentWrap = document.getElementById("recentWrap");

let CFG = {};
let TAB = null;

function log(msg, cls) {
  logEl.textContent = msg;
  logEl.className = cls || "";
}

document.getElementById("opts").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

async function detectGroup(tab) {
  let g = CFG.defaultGroup || "Inbox";
  try {
    if (tab && tab.groupId != null && tab.groupId !== -1 && chrome.tabGroups) {
      const tg = await chrome.tabGroups.get(tab.groupId);
      if (tg && tg.title) g = tg.title;
    }
  } catch (e) {
    /* not in a group */
  }
  return g;
}

// --- recent list -------------------------------------------------------

async function renderRecent() {
  const { recent = [] } = await chrome.storage.local.get("recent");
  if (!recent.length) {
    recentWrap.style.display = "none";
    return;
  }
  recentWrap.style.display = "block";
  const archive = CFG.archiveGroup || "Archive";
  recentEl.innerHTML = "";
  recent.forEach((r, idx) => {
    const row = document.createElement("div");
    row.className = "row";

    const shown = r.savedAs || r.filename || "(saved)";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = shown;
    name.title = shown;

    const showBtn = document.createElement("button");
    showBtn.textContent = "Show";
    showBtn.title = "Reveal in your file manager";
    showBtn.addEventListener("click", () => {
      if (r.downloadId != null) chrome.downloads.show(r.downloadId);
      else chrome.downloads.showDefaultFolder();
    });

    const arcBtn = document.createElement("button");
    arcBtn.textContent = "→ " + archive;
    arcBtn.title = `Re-save a copy into the ${archive} subfolder`;
    arcBtn.disabled = !r.md || r.group === archive;
    arcBtn.addEventListener("click", async () => {
      arcBtn.disabled = true;
      const res = await chrome.runtime.sendMessage({
        type: "refile",
        md: r.md,
        title: r.title,
        toGroup: archive,
      });
      if (res && res.ok) {
        log(`Copied to ${archive}/ — delete the old file if you want.`, "ok");
      } else {
        arcBtn.disabled = false;
        log("Re-file failed: " + ((res && res.error) || "?"), "err");
      }
    });

    row.append(name, showBtn, arcBtn);
    recentEl.appendChild(row);
  });
}

// --- job-driven main view --------------------------------------------

function setView(state) {
  editorEl.style.display = state === "ready" ? "block" : "none";
  stopEl.style.display = state === "running" ? "block" : "none";
  restartEl.style.display =
    ["ready", "saved", "cancelled", "error", "empty"].includes(state) ? "block" : "none";
}

async function getJob() {
  return (await chrome.storage.local.get("job")).job || null;
}

function showGroupField(value) {
  if (!CFG.useGroups) return;
  groupEl.value = value || CFG.defaultGroup || "Inbox";
  groupEl.style.display = "block";
  groupLabel.style.display = "block";
}

function applyJob(job) {
  if (!job || job.tabId !== (TAB && TAB.id)) return;
  if (job.phase === "running") {
    log("Analyzing… you can close this popup — it keeps running in the background.");
    setView("running");
  } else if (job.phase === "ready") {
    showGroupField(job.group);
    titleEl.value = (job.out.title || "").trim();
    synthEl.value = (Array.isArray(job.out.synthesis) ? job.out.synthesis : []).join("\n");
    log(job.warn || "Review the title & synthesis, then Save.", job.warn ? "warn" : "");
    setView("ready");
    saveEl.disabled = false;
  } else if (job.phase === "saved") {
    log("Saved: " + job.savedAs + (job.warn ? "\n" + job.warn : ""), job.warn ? "warn" : "ok");
    setView("saved");
    renderRecent();
  } else if (job.phase === "cancelled") {
    log("Analysis stopped.", "warn");
    setView("cancelled");
  } else if (job.phase === "error") {
    log(job.error || "Something went wrong.", "err");
    setView("error");
  }
}

async function startJob() {
  editorEl.style.display = "none";
  stopEl.style.display = "none";
  restartEl.style.display = "none";
  log("Reading the page…");
  if (CFG.useGroups) showGroupField(await detectGroup(TAB));

  let data;
  try {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: TAB.id },
      func: scrapeGeminiConversation,
    });
    data = result;
  } catch (e) {
    log("Can't read this page: " + e.message, "err");
    setView("empty");
    return;
  }
  if (!data || !data.markdown || data.markdown.length < 40) {
    log(
      "No Gemini content found here. Open AI Mode / let AI Overview load, or select the answer text — then Start again.",
      "err",
    );
    setView("empty");
    return;
  }

  const group = CFG.useGroups ? groupEl.value : "";
  await chrome.runtime.sendMessage({ type: "summarize", scrapeData: data, group, tabId: TAB.id });
  log("Analyzing… you can close this popup — it keeps running in the background.");
  setView("running");
}

saveEl.addEventListener("click", async () => {
  saveEl.disabled = true;
  log("Saving…");
  const group = CFG.useGroups ? groupEl.value : "";
  const res = await chrome.runtime.sendMessage({
    type: "save",
    title: titleEl.value.trim() || "Gemini chat",
    synthesis: synthEl.value.split("\n"),
    group,
  });
  if (res && res.ok) {
    log("Saved: " + res.savedAs, "ok");
    setView("saved");
    renderRecent();
  } else {
    saveEl.disabled = false;
    log((res && res.error) || "Save failed.", "err");
  }
});

stopEl.addEventListener("click", () => chrome.runtime.sendMessage({ type: "cancel" }));
restartEl.addEventListener("click", () => startJob());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.job) applyJob(changes.job.newValue);
});

// --- init -----------------------------------------------------------

async function init() {
  CFG = await chrome.storage.local.get([
    "apiKey", "model", "customPrompt", "downloadDir", "autoSave",
    "useGroups", "defaultGroup", "archiveGroup",
  ]);
  [TAB] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!CFG.apiKey) {
    log("Open Settings and paste your Google AI Studio API key.", "err");
    return;
  }

  try {
    await renderRecent();
  } catch (e) {
    /* ignore */
  }

  const job = await getJob();
  if (job && job.tabId === TAB.id && ["running", "ready"].includes(job.phase)) {
    applyJob(job);
  } else {
    startJob();
  }
}

init();
