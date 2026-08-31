const logEl = document.getElementById("log");
const editorEl = document.getElementById("editor");
const titleEl = document.getElementById("title");
const synthEl = document.getElementById("synth");
const groupEl = document.getElementById("group");
const groupLabel = document.getElementById("groupLabel");
const saveEl = document.getElementById("save");
const grantEl = document.getElementById("grant");
const recentEl = document.getElementById("recent");
const recentWrap = document.getElementById("recentWrap");

let CFG = {};
let ROOT = null;
let PREP = null; // { data, conversation }

function log(msg, cls) {
  logEl.textContent = msg;
  logEl.className = cls || "";
}

document.getElementById("opts").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

const pad = (n) => String(n).padStart(2, "0");
const datePrefix = (d) =>
  `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

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

async function dirFor(group, create) {
  if (!group) return ROOT;
  return ROOT.getDirectoryHandle(sanitizeFolder(group), { create: !!create });
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
    /* not in a group */
  }
  return g;
}

const PROMPT = `You are given raw text scraped from a Google "AI Mode" or "AI Overview" answer panel. The scrape contains a lot of page clutter mixed in with the real answer.

REMOVE completely:
- Navigation, toolbar and button labels ("Show more", "Show less", "Share", "Export", "Feedback", "Copy", "Thumbs up/down").
- Suggested / follow-up questions, "People also ask", "Related searches", ad or promo text.
- Sign-in prompts, cookie notices, disclaimers ("AI responses may include mistakes", "Generative AI is experimental").
- Repeated page headers/footers and menu items.
- Filler, hedging and padding. Tighten wordy sentences without changing their meaning.

KEEP:
- The user's actual question(s) and the substantive answer(s): explanations, lists, tables, code blocks, and inline citation links that belong to the answer.
- Every image: any Markdown image \`![alt](url)\` in the raw text must appear UNCHANGED and in the same position in your "conversation" output. Never drop, rewrite or invent image URLs.

Return JSON with:
- "title": a concise, specific, descriptive title (max ~12 words, no surrounding quotes, no trailing punctuation).
- "synthesis": 3-7 bullet points. Each is a TERSE FRAGMENT, not a full sentence — aim for 12 words or fewer. Drop lead-ins like "The item is", "It is", "This means"; drop articles where readable. Lead with the fact, number, or name. Good: "Used value roughly $20-50 USD (~17-43 CHF)". Bad: "The used market value for fully functional units generally ranges between $20 and $50 USD.". The bulletpoints are to be written with "-" a dash. f
- "conversation": the cleaned answer as tight, readable Markdown — cut filler and hedging hard. If distinct prompt/response turns exist, format each as "### Prompt" then "### Response". No preamble, no closing remarks.`;

async function synthesize(apiKey, model, data) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [
      {
        parts: [
          {
            text:
              PROMPT +
              (CFG.customPrompt ? `\n\nAdditional instructions from the user (obey these):\n${CFG.customPrompt}` : "") +
              `\n\nUser's search query: ${data.query || "(unknown)"}\n\nRaw text:\n"""\n` +
              (data.markdown || "").slice(0, 60000) +
              `\n"""`,
          },
        ],
      },
    ],
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

  let r, raw;
  for (let attempt = 0; attempt < 2; attempt++) {
    r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    raw = await r.text();
    if (r.status === 429 && attempt === 0) {
      const m = raw.match(/"retryDelay":\s*"(\d+)s"/);
      const wait = m ? Math.min(+m[1] + 1, 55) : 25;
      log(`Rate limited by the API — retrying in ${wait}s…`, "warn");
      await new Promise((res) => setTimeout(res, wait * 1000));
      continue;
    }
    break;
  }
  if (r.status === 429)
    throw new Error(
      "Free-tier quota exhausted for this model. Wait a minute, pick a lighter 'flash' model in Settings, or add billing to the key.",
    );
  if (r.status === 404) {
    const err = new Error(raw.slice(0, 300));
    err.notFound = true;
    err.replacement = suggestedReplacement(raw);
    throw err;
  }
  if (!r.ok) throw new Error(`API ${r.status}: ${raw.slice(0, 300)}`);
  let j;
  try { j = JSON.parse(raw); } catch { throw new Error("Bad API response"); }
  let txt = j.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!txt) {
    const fb = j.promptFeedback || j.candidates?.[0]?.finishReason || j;
    throw new Error("No content: " + JSON.stringify(fb).slice(0, 200));
  }
  txt = txt.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
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
  if (!recent.length) { recentWrap.style.display = "none"; return; }
  recentWrap.style.display = "block";
  const groups = await listGroups();
  const archive = sanitizeFolder(CFG.archiveGroup || "Archive");
  const targets = Array.from(new Set(["", archive, ...groups])); // "" = folder root
  const labelOf = (g) => g || "· folder root ·";
  recentEl.innerHTML = "";
  recent.forEach((r, idx) => {
    const row = document.createElement("div");
    row.className = "row";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = `${labelOf(r.group)} / ${r.filename}`;
    name.title = name.textContent;
    const sel = document.createElement("select");
    targets.filter((t) => t !== (r.group || "")).forEach((t) => {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = labelOf(t);
      sel.appendChild(o);
    });
    const btn = document.createElement("button");
    btn.textContent = "Move";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await moveFile(r.group || "", r.filename, sel.value);
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
    const openBtn = document.createElement("button");
    openBtn.textContent = "Open";
    openBtn.title = CFG.folderPath
      ? "Open the containing folder in a tab"
      : "Set the working-folder path in Settings to enable";
    openBtn.addEventListener("click", () => {
      if (!CFG.folderPath) {
        log("Add the working folder's full path in Settings to enable Open.", "warn");
        return;
      }
      const base = CFG.folderPath.replace(/\\/g, "/").replace(/\/+$/, "");
      const rel = r.group ? "/" + encodeURIComponent(r.group) : "";
      chrome.tabs.create({ url: `file:///${base}${rel}/` });
    });

    row.append(name, sel, btn, openBtn);
    recentEl.appendChild(row);
  });
}

async function moveFile(fromGroup, filename, toGroup) {
  const srcDir = await dirFor(fromGroup, false);
  const file = await (await srcDir.getFileHandle(filename)).getFile();
  const text = await file.text();
  const destDir = await dirFor(toGroup, true);
  const written = await writeUnique(destDir, filename, text);
  await srcDir.removeEntry(filename);
  return written;
}

function buildMarkdown(title, synthLines, data, conversation, groupName) {
  const now = new Date();
  const bullets = synthLines
    .map((s) => s.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);

  // If the model dropped images that were in the raw scrape, append them.
  const rawImgs = (data.markdown || "").match(/!\[[^\]]*\]\([^)]+\)/g) || [];
  const convHasImg = /!\[[^\]]*\]\([^)]+\)/.test(conversation);
  const imagesBlock =
    rawImgs.length && !convHasImg
      ? `\n\n## Images\n\n` + [...new Set(rawImgs)].join("\n\n") + "\n"
      : "";

  const src = Array.isArray(data.sources) ? data.sources : [];
  const sourcesBlock = src.length
    ? `\n\n## Sources\n\n` +
      src
        .map((s, i) => `${i + 1}. [${(s.title || s.host).replace(/[\[\]]/g, "")}](${s.url})`)
        .join("\n") +
      "\n"
    : "";

  return {
    now,
    md:
      `---\n` +
      `title: "${title.replace(/"/g, "'")}"\n` +
      `source: ${data.mode}\n` +
      (groupName ? `group: ${groupName}\n` : "") +
      `query: "${(data.query || "").replace(/"/g, "'")}"\n` +
      `saved: ${now.toISOString()}\n` +
      `---\n\n# ${title}\n\n[↗ Open this chat in your browser](${data.url})\n\n` +
      `## Synthesis\n\n` +
      (bullets.length ? bullets.map((s) => `- ${s}`).join("\n") : "_(none)_") +
      `\n\n## Conversation\n\n${conversation}\n` +
      imagesBlock +
      sourcesBlock,
  };
}

async function doSave() {
  saveEl.disabled = true;
  try {
    const title = titleEl.value.trim() || PREP.data.query || "Gemini chat";
    const groupName = CFG.useGroups ? sanitizeFolder(groupEl.value) : "";
    const { now, md } = buildMarkdown(
      title,
      synthEl.value.split("\n"),
      PREP.data,
      PREP.conversation,
      groupName,
    );
    log("Writing file…");
    const dir = await dirFor(groupName, true);
    const baseName = `${datePrefix(now)}-${slug(title)}.md`;
    const written = await writeUnique(dir, baseName, md);
    await pushRecent({ group: groupName, filename: written, title, ts: now.toISOString() });
    await renderRecent();
    log(`Saved: ${(groupName ? groupName + " / " : "") + written}`, "ok");
    editorEl.style.display = "none";
  } catch (e) {
    log(e.message, "err");
    saveEl.disabled = false;
  }
}

// Try the configured model; if it's been retired (404), switch to the model
// Google suggests — or the top model the key can list — persist it, and retry.
async function summarizeWithFallback(data) {
  let model = CFG.model || "";
  if (!model) {
    const list = await discoverModels(CFG.apiKey).catch(() => []);
    model = list[0] || "gemini-flash-latest";
    await chrome.storage.local.set({ model, modelList: list });
    CFG.model = model;
  }
  try {
    return await synthesize(CFG.apiKey, model, data);
  } catch (e) {
    if (!e.notFound) throw e;
    let next = e.replacement;
    if (!next) {
      const list = await discoverModels(CFG.apiKey);
      await chrome.storage.local.set({ modelList: list });
      next = list.find((m) => /flash/.test(m)) || list[0];
    }
    if (!next || next === model) throw new Error("This model was retired and no replacement was found. Open Settings → Refresh.");
    log(`Model "${model}" retired — switching to "${next}"…`, "warn");
    await chrome.storage.local.set({ model: next });
    CFG.model = next;
    return await synthesize(CFG.apiKey, next, data);
  }
}

async function prepare() {
  try {
    log("Reading the page…");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (CFG.useGroups) {
      groupEl.value = await detectGroup(tab);
      groupEl.style.display = "block";
      groupLabel.style.display = "block";
    }
    const [{ result: data } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeGeminiConversation,
    });
    if (!data || !data.markdown || data.markdown.length < 40)
      throw new Error("No Gemini content found. Select the answer text on the page, then reopen.");

    log("Summarizing…");
    let out, warn = "";
    try {
      out = await summarizeWithFallback(data);
    } catch (e) {
      warn = "AI summary failed (" + e.message + "). You can still save the raw text.";
      out = { title: data.query || "Gemini chat", synthesis: [], conversation: data.markdown };
    }
    PREP = { data, conversation: out.conversation || data.markdown };
    titleEl.value = (out.title || data.query || "Gemini chat").trim();
    synthEl.value = (Array.isArray(out.synthesis) ? out.synthesis : []).join("\n");
    editorEl.style.display = "block";
    log(warn || "Review the title & synthesis, then Save.", warn ? "warn" : "");
  } catch (e) {
    log(e.message, "err");
  }
}

async function afterPermission() {
  try { await renderRecent(); } catch (e) {}
  prepare();
}

async function init() {
  CFG = await chrome.storage.local.get([
    "apiKey", "model", "customPrompt", "folderPath",
    "useGroups", "defaultGroup", "archiveGroup",
  ]);
  ROOT = await idbGet("dirHandle");
  saveEl.addEventListener("click", doSave);

  grantEl.addEventListener("click", async () => {
    grantEl.disabled = true;
    try {
      if ((await ROOT.requestPermission({ mode: "readwrite" })) !== "granted")
        throw new Error("denied");
      grantEl.style.display = "none";
      await afterPermission();
    } catch (e) {
      grantEl.disabled = false;
      log("Access denied — click the button to try again.", "err");
    }
  });

  if (!CFG.apiKey || !ROOT) {
    log("Open Settings: set the API key and working folder.", "err");
    return;
  }

  if ((await ROOT.queryPermission({ mode: "readwrite" })) === "granted") {
    await afterPermission();
  } else {
    log("Click to grant access to your working folder (once per browser session).");
    grantEl.style.display = "block";
  }
}

init();
