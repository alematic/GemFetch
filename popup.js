const logEl = document.getElementById("log");
const goEl = document.getElementById("go");
const groupEl = document.getElementById("group");
const recentEl = document.getElementById("recent");
const recentWrap = document.getElementById("recentWrap");

let CFG = {};
let ROOT = null;

function log(msg, cls) {
  logEl.textContent = msg;
  logEl.className = cls || "";
}

document.getElementById("opts").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

const pad = (n) => String(n).padStart(2, "0");

function datePrefix(d) {
  return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function slug(s) {
  return (
    (s || "")
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60) || "chat"
  );
}

function sanitizeFolder(name) {
  const cleaned = (name || "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 50);
  return cleaned || "Inbox";
}

async function subdir(name, create) {
  return ROOT.getDirectoryHandle(sanitizeFolder(name), { create: !!create });
}

async function listGroups() {
  const out = [];
  for await (const [name, h] of ROOT.entries()) if (h.kind === "directory") out.push(name);
  return out.sort();
}

async function detectGroup(tab) {
  let g = CFG.defaultGroup || "Inbox";
  try {
    if (tab.groupId != null && tab.groupId !== -1 && chrome.tabGroups) {
      const tg = await chrome.tabGroups.get(tab.groupId);
      if (tg && tg.title) g = tg.title;
    }
  } catch (e) {
    /* tab not in a group */
  }
  return g;
}

async function synthesize(apiKey, model, data) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = `You are given the raw scraped text of a Google Gemini search result (AI Overview or AI Mode conversation).

Return:
1. "title": a concise, specific, descriptive title (max ~12 words, no quotes, no trailing punctuation).
2. "synthesis": 3-8 short bullet strings capturing the key facts / answers / takeaways.
3. "conversation": the content rewritten as clean readable Markdown. If distinct prompt/response turns are present, format each as "### Prompt" / "### Response". Preserve links, lists and tables. Remove UI cruft (button labels, "Show more", nav text). Do not invent content.

User's search query: ${data.query || "(unknown)"}

Raw text:
"""
${(data.markdown || "").slice(0, 120000)}
"""`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          synthesis: { type: "ARRAY", items: { type: "STRING" } },
          conversation: { type: "STRING" },
        },
        required: ["title", "synthesis", "conversation"],
      },
    },
  };

  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Gemini API ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const txt = j.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return JSON.parse(txt);
}

async function writeUnique(dirHandle, baseName, contents) {
  const existing = new Set();
  for await (const [name] of dirHandle.entries()) existing.add(name);
  let fname = baseName;
  let i = 1;
  while (existing.has(fname)) fname = baseName.replace(/\.md$/, "") + `-${i++}.md`;
  const fh = await dirHandle.getFileHandle(fname, { create: true });
  const w = await fh.createWritable();
  await w.write(contents);
  await w.close();
  return fname;
}

async function pushRecent(entry) {
  const { recent = [] } = await chrome.storage.local.get("recent");
  recent.unshift(entry);
  await chrome.storage.local.set({ recent: recent.slice(0, 8) });
}

async function renderRecent() {
  const { recent = [] } = await chrome.storage.local.get("recent");
  if (!recent.length) {
    recentWrap.style.display = "none";
    return;
  }
  recentWrap.style.display = "block";
  const groups = await listGroups();
  const archive = sanitizeFolder(CFG.archiveGroup || "Archive");
  const targets = Array.from(new Set([archive, ...groups]));
  recentEl.innerHTML = "";
  recent.forEach((r, idx) => {
    const row = document.createElement("div");
    row.className = "row";

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = `${r.group}/${r.filename}`;
    name.title = name.textContent;

    const sel = document.createElement("select");
    targets
      .filter((t) => t !== r.group)
      .forEach((t) => {
        const o = document.createElement("option");
        o.value = t;
        o.textContent = t;
        sel.appendChild(o);
      });

    const btn = document.createElement("button");
    btn.textContent = "Move";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await moveFile(r.group, r.filename, sel.value);
        r.group = sel.value;
        const { recent: cur = [] } = await chrome.storage.local.get("recent");
        cur[idx] = r;
        await chrome.storage.local.set({ recent: cur });
        renderRecent();
      } catch (e) {
        btn.disabled = false;
        log("Move failed: " + e.message, "err");
      }
    });

    row.append(name, sel, btn);
    recentEl.appendChild(row);
  });
}

async function moveFile(fromGroup, filename, toGroup) {
  const srcDir = await subdir(fromGroup, false);
  const file = await (await srcDir.getFileHandle(filename)).getFile();
  const text = await file.text();
  const destDir = await subdir(toGroup, true);
  await writeUnique(destDir, filename, text);
  await srcDir.removeEntry(filename);
}

async function init() {
  CFG = await chrome.storage.local.get(["apiKey", "model", "defaultGroup", "archiveGroup"]);
  ROOT = await idbGet("dirHandle");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  window._tab = tab;
  groupEl.value = await detectGroup(tab);
  if (ROOT && (await ROOT.queryPermission({ mode: "readwrite" })) === "granted") {
    try {
      await renderRecent();
    } catch (e) {
      /* ignore */
    }
  }
  if (!CFG.apiKey || !ROOT) {
    log("Open Settings: set the API key and working folder.", "err");
    return;
  }
  log("Ready. Click to fetch & save.");
}

async function run() {
  goEl.disabled = true;
  try {
    if (!CFG.apiKey) throw new Error("No API key set. Open Settings.");
    if (!ROOT) throw new Error("No working folder set. Open Settings.");

    log("Requesting folder access…");
    if (!(await ensurePermission(ROOT)))
      throw new Error("Folder access denied. Click the button again to retry.");

    log("Reading the page…");
    const tab = window._tab;
    const [{ result: data } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeGeminiConversation,
    });
    if (!data || !data.markdown || data.markdown.length < 40)
      throw new Error("No Gemini content found. Select the answer text on the page, then retry.");

    log("Summarizing with Gemini…");
    const model = CFG.model || "gemini-2.5-flash";
    let out;
    try {
      out = await synthesize(CFG.apiKey, model, data);
    } catch (e) {
      log("Summary failed, saving raw. " + e.message, "err");
      out = { title: data.query || "Gemini chat", synthesis: [], conversation: data.markdown };
    }

    const title = (out.title || data.query || "Gemini chat").trim();
    const synth = Array.isArray(out.synthesis) ? out.synthesis : [];
    const conversation = out.conversation || data.markdown;
    const now = new Date();
    const groupName = sanitizeFolder(groupEl.value);
    const md =
      `---\n` +
      `title: "${title.replace(/"/g, "'")}"\n` +
      `source: ${data.mode}\n` +
      `group: ${groupName}\n` +
      `query: "${(data.query || "").replace(/"/g, "'")}"\n` +
      `url: ${data.url}\n` +
      `saved: ${now.toISOString()}\n` +
      `---\n\n# ${title}\n\n[Open this chat](${data.url})\n\n` +
      `## Synthesis\n\n` +
      (synth.length ? synth.map((s) => `- ${s}`).join("\n") : "_(no synthesis)_") +
      `\n\n## Conversation\n\n${conversation}\n`;

    const baseName = `${datePrefix(now)}-${slug(title)}.md`;
    log("Writing file…");
    const dir = await subdir(groupName, true);
    const written = await writeUnique(dir, baseName, md);
    await pushRecent({ group: groupName, filename: written, title, ts: now.toISOString() });
    await renderRecent();
    log(`Saved: ${groupName}/${written}`, "ok");
  } catch (e) {
    log(e.message, "err");
  } finally {
    goEl.disabled = false;
  }
}

goEl.addEventListener("click", run);
init();
