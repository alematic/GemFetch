// Service worker: runs the slow work (summarize + file write) so it survives the
// popup closing or the window moving. State lives in chrome.storage.local.job.
// Files are written via the downloads API — no folder permission, ever.

importScripts("shared.js");

let ABORT = null;
let keepAlive = null;

// --- downloads: force the filename Chrome actually uses ------------------
// chrome.downloads.download's `filename` option is unreliable for blob/data
// URLs (Chrome falls back to "download.md"), so we authoritatively set it in
// onDeterminingFilename, matching our own downloads by their blob URL.
const PENDING_DL = new Map(); // url -> relPath

try {
  chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    const relPath = PENDING_DL.get(item.url);
    if (relPath) suggest({ filename: relPath, conflictAction: "uniquify" });
    else suggest();
  });
} catch (e) {
  /* event unavailable — fall back to the download() filename option */
}

function downloadMarkdown(relPath, md) {
  let url;
  try {
    url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
  } catch (e) {
    url = "data:text/markdown;charset=utf-8," + encodeURIComponent(md);
  }
  PENDING_DL.set(url, relPath);
  const cleanup = () => {
    PENDING_DL.delete(url);
    try { URL.revokeObjectURL(url); } catch (e) {}
  };
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename: relPath, conflictAction: "uniquify", saveAs: false }, (id) => {
      if (chrome.runtime.lastError || id == null) {
        cleanup();
        reject(new Error(chrome.runtime.lastError?.message || "download failed"));
        return;
      }
      const done = (d) => {
        if (d.id === id && d.state && d.state.current !== "in_progress") {
          chrome.downloads.onChanged.removeListener(done);
          cleanup();
        }
      };
      chrome.downloads.onChanged.addListener(done);
      setTimeout(cleanup, 120000);
      chrome.downloads.search({ id }, (items) => {
        resolve({ id, filename: (items && items[0] && items[0].filename) || relPath });
      });
    });
  });
}

function startKeepAlive() {
  if (keepAlive) return;
  keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
}
function stopKeepAlive() {
  clearInterval(keepAlive);
  keepAlive = null;
}

async function getJob() {
  return (await chrome.storage.local.get("job")).job || null;
}
async function patchJob(patch) {
  const job = { ...((await getJob()) || {}), ...patch, ts: Date.now() };
  await chrome.storage.local.set({ job });
  return job;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "summarize") {
    runSummarize(msg);
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === "cancel") {
    if (ABORT) ABORT.abort();
    patchJob({ phase: "cancelled" });
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === "save") {
    runSave(msg).then(sendResponse);
    return true;
  }
  if (msg.type === "refile") {
    refile(msg.md, msg.title, msg.toGroup)
      .then((r) => sendResponse({ ok: true, id: r.id }))
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  return false;
});

async function runSummarize({ scrapeData, group, tabId }) {
  if (ABORT) ABORT.abort();
  ABORT = new AbortController();
  startKeepAlive();
  await chrome.storage.local.set({
    job: {
      id: Date.now(),
      phase: "running",
      tabId,
      group: group || "",
      scrapeData,
      out: null,
      warn: "",
      error: "",
      savedAs: "",
      downloadId: null,
      ts: Date.now(),
    },
  });
  const cfg = await chrome.storage.local.get(["apiKey", "model", "customPrompt", "autoSave"]);
  let out, warn = "";
  try {
    out = await summarizeWithFallback(cfg, scrapeData, ABORT.signal);
  } catch (e) {
    if (e && e.name === "AbortError") {
      await patchJob({ phase: "cancelled" });
      stopKeepAlive();
      ABORT = null;
      return;
    }
    warn = "AI summary failed: " + (e && e.message ? e.message : e);
    out = {
      title: scrapeData.query || "Gemini chat",
      synthesis: [],
      conversation: scrapeData.markdown,
    };
  }

  if (cfg.autoSave) {
    try {
      const saved = await writeFile(
        out.title,
        out.synthesis,
        scrapeData,
        out.conversation,
        group || "",
      );
      await patchJob({ phase: "saved", out, warn, savedAs: saved.savedAs, downloadId: saved.id });
    } catch (e) {
      await patchJob({ phase: "ready", out, warn: (warn ? warn + " · " : "") + "Auto-save failed: " + e.message });
    }
  } else {
    await patchJob({ phase: "ready", out, warn });
  }
  stopKeepAlive();
  ABORT = null;
}

async function writeFile(title, synthesis, scrapeData, conversation, group) {
  const t = (title || scrapeData.query || "Gemini chat").trim();
  const { downloadDir } = await chrome.storage.local.get("downloadDir");
  const root = safeSegment(downloadDir || "GemFetch", "GemFetch");
  const sub = group ? safeSegment(group, "Inbox") + "/" : "";
  const { now, md } = buildMarkdown(
    t,
    synthesis,
    scrapeData,
    conversation || scrapeData.markdown,
    group || "",
  );
  const relPath = `${root}/${sub}${datePrefix(now)}-${slug(t)}.md`;
  const res = await downloadMarkdown(relPath, md);
  // Chrome returns the absolute path; show just the tail from the root folder.
  const shown = res.filename.replace(/\\/g, "/").split("/" + root + "/").pop();
  const savedAs = `${root}/${shown}`;

  const { recent = [] } = await chrome.storage.local.get("recent");
  recent.unshift({
    group: group || "",
    savedAs,
    downloadId: res.id,
    title: t,
    ts: now.toISOString(),
    md,
  });
  await chrome.storage.local.set({ recent: recent.slice(0, 12) });
  return { savedAs, id: res.id };
}

async function runSave({ title, synthesis, group }) {
  const job = await getJob();
  if (!job || !job.out) return { error: "Nothing to save — start an analysis first." };
  try {
    const saved = await writeFile(title, synthesis, job.scrapeData, job.out.conversation, group || "");
    await patchJob({ phase: "saved", savedAs: saved.savedAs, downloadId: saved.id });
    return { ok: true, savedAs: saved.savedAs };
  } catch (e) {
    await patchJob({ phase: "error", error: e.message });
    return { error: e.message };
  }
}

// "Re-file": re-save a cached recent item into another subfolder.
async function refile(mdText, title, toGroup) {
  const { downloadDir } = await chrome.storage.local.get("downloadDir");
  const root = safeSegment(downloadDir || "GemFetch", "GemFetch");
  const sub = toGroup ? safeSegment(toGroup, "Inbox") + "/" : "";
  const relPath = `${root}/${sub}${datePrefix(new Date())}-${slug(title)}.md`;
  return downloadMarkdown(relPath, mdText);
}
