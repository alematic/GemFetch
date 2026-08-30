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
- Navigation, toolbar and button labels ("Show more", "Show less", "Sources", "Share", "Export", "Feedback", "Copy", "Thumbs up/down").
- Suggested / follow-up questions, "People also ask", "Related searches", ad or promo text.
- Sign-in prompts, cookie notices, disclaimers ("AI responses may include mistakes", "Generative AI is experimental").
- Repeated page headers/footers and menu items.
- Filler, hedging and padding. Tighten wordy sentences without changing their meaning.

KEEP:
- The user's actual question(s) and the substantive answer(s): explanations, lists, tables, code blocks, and inline source links that belong to the answer.

Return JSON with:
- "title": a concise, specific, descriptive title (max ~12 words, no surrounding quotes, no trailing punctuation).
- "synthesis": 3-8 short bullet strings — the key takeaways / answers.
- "conversation": the cleaned answer as tight, readable Markdown. If distinct prompt/response turns exist, format each as "### Prompt" then "### Response". No preamble, no closing remarks.`;

async function synthesize(apiKey, model, data) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [
      {
        parts: [
          {
            text:
              PROMPT +
              `\n\nUser's search query: ${data.query || "(unknown)"}\n\nRaw text:\n"""\n` +
              (data.markdown || "").slice(0, 120000) +
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

  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await r.text();
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
    row.append(name, sel, btn);
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
  return {
    now,
    md:
      `---\n` +
      `title: "${title.replace(/"/g, "'")}"\n` +
      `source: ${data.mode}\n` +
      (groupName ? `group: ${groupName}\n` : "") +
      `query: "${(data.query || "").replace(/"/g, "'")}"\n` +
      `url: ${data.url}\n` +
      `saved: ${now.toISOString()}\n` +
      `---\n\n# ${title}\n\n[Open this chat](${data.url})\n\n` +
      `## Synthesis\n\n` +
      (bullets.length ? bullets.map((s) => `- ${s}`).join("\n") : "_(none)_") +
      `\n\n## Conversation\n\n${conversation}\n`,
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
      out = await synthesize(CFG.apiKey, CFG.model || "gemini-flash-latest", data);
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
    "apiKey", "model", "useGroups", "defaultGroup", "archiveGroup",
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
