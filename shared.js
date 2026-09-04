// Shared core — loaded by popup.html + options.html as <script>, and by
// background.js via importScripts(). No DOM / window usage in here.

// --- Gemini model discovery ---------------------------------------------------

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
    if (/lite|-8b|thinking|preview|-exp|\d{6,}/.test(n)) s -= 8;
    return s;
  };
  return [...new Set(names)].sort((a, b) => score(b) - score(a)).slice(0, 8);
}

function suggestedReplacement(text) {
  const m = (text || "").match(/use\s+models\/([A-Za-z0-9._-]+)/);
  return m ? m[1] : null;
}

// --- formatting --------------------------------------------------------------

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

// One path segment: no slashes, no illegal chars, no leading dots.
function safeSegment(name, fallback) {
  const cleaned = (name || "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 60);
  return cleaned || fallback || "GemFetch";
}

// (downloadMarkdown lives in background.js — it needs the SW-scoped
//  onDeterminingFilename listener to force the filename Chrome uses.)

// --- Gemini summarization --------------------------------------------------

const PROMPT = `You are given raw text scraped from an AI assistant conversation (Google AI Mode / AI Overview, ChatGPT, Claude, Gemini, Perplexity, Copilot, or similar), or from a web page. The scrape contains a lot of interface clutter mixed in with the real content.

REMOVE completely:
- Navigation, toolbar and button labels ("Show more", "Show less", "Share", "Export", "Feedback", "Copy", "Thumbs up/down").
- Suggested / follow-up questions, "People also ask", "Related searches", ad or promo text.
- Sign-in prompts, cookie notices, disclaimers ("AI responses may include mistakes", "Generative AI is experimental").
- Repeated page headers/footers and menu items.
- Filler, hedging and padding. Tighten wordy sentences without changing their meaning.

KEEP:
- The full exchange: every user turn and every assistant turn, in order — explanations, lists, tables, code blocks, and inline citation links that belong to the content.
- Every image, from BOTH the user's prompts and the answers: any Markdown image \`![alt](url)\` in the raw text must appear UNCHANGED and in the same position in your "conversation" output. Never drop, rewrite or invent image URLs.

Output PLAIN TEXT in EXACTLY this structure — no JSON, no wrapping code fence, nothing before "TITLE:" and nothing after the conversation:

TITLE: <concise, specific, descriptive title, max ~12 words, no quotes, no trailing punctuation>

SYNTHESIS:
- <terse fragment, not a full sentence, ~12 words or fewer; drop lead-ins like "The item is" / "It is" / "This means"; lead with the fact, number or name>
- <3 to 7 of these>

CONVERSATION:
### Prompt 1
<the user's first message, cleaned>
### Response 1
<the assistant's first answer, cleaned Markdown — keep lists, tables, code blocks, image \`![alt](url)\` lines unchanged and in place>
### Prompt 2
<...and so on, incrementing per round>

If there is only a single answer with no visible user question, use "### Response 1" alone.`;

function _abortableSleep(ms, signal) {
  return new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          rej(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    }
  });
}

async function synthesize(apiKey, model, data, customPrompt, signal) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [
      {
        parts: [
          {
            text:
              PROMPT +
              (customPrompt
                ? `\n\nAdditional instructions from the user (obey these):\n${customPrompt}`
                : "") +
              `\n\nUser's search query: ${data.query || "(unknown)"}\n\nRaw text:\n"""\n` +
              (data.markdown || "").slice(0, 60000) +
              `\n"""`,
          },
        ],
      },
    ],
    generationConfig: { temperature: 0.3 },
  };

  let r, raw;
  for (let attempt = 0; attempt < 2; attempt++) {
    r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    raw = await r.text();
    if (r.status === 429 && attempt === 0) {
      const m = raw.match(/"retryDelay":\s*"(\d+)s"/);
      const wait = m ? Math.min(+m[1] + 1, 30) : 20;
      await _abortableSleep(wait * 1000, signal);
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
  try {
    j = JSON.parse(raw);
  } catch (e) {
    throw new Error("Bad API response");
  }
  const cand = j.candidates?.[0];
  let txt = cand?.content?.parts?.[0]?.text;
  if (!txt) {
    const fb = j.promptFeedback || cand?.finishReason || j;
    throw new Error("No content: " + JSON.stringify(fb).slice(0, 200));
  }
  // Strip an outer wrapping code fence only if the response opens with one
  // (don't clobber a legit closing fence of a trailing code block).
  const lead = txt.match(/^```[^\n]*\n/);
  if (lead) txt = txt.slice(lead[0].length).replace(/\n```\s*$/, "");
  txt = txt.trim();

  // Plain-text delimited format: TITLE: / SYNTHESIS: / CONVERSATION:
  const titleM = txt.match(/TITLE:\s*(.+?)\s*(?:\n|$)/);
  const synM = txt.match(/\nSYNTHESIS:\s*([\s\S]*?)(?:\n\s*CONVERSATION:|$)/i);
  const convM = txt.match(/\nCONVERSATION:\s*([\s\S]*)$/i);

  const title = titleM ? titleM[1].replace(/^["']|["']$/g, "").trim() : "";
  const synthesis = synM
    ? synM[1]
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => /^[-*]\s+/.test(l))
        .map((l) => l.replace(/^[-*]\s+/, "").trim())
    : [];
  let conversation = convM ? convM[1].trim() : txt;
  if (cand.finishReason && cand.finishReason !== "STOP")
    conversation += `\n\n> _(Transcript cut off by the model: ${cand.finishReason}.)_`;

  return { title, synthesis, conversation };
}

// Try the configured model; on a 404 (retired) switch to Google's suggested
// replacement or the top discoverable model, persist it, and retry once.
async function summarizeWithFallback(cfg, data, signal) {
  let model = cfg.model || "";
  if (!model) {
    const list = await discoverModels(cfg.apiKey).catch(() => []);
    model = list[0] || "gemini-flash-latest";
    await chrome.storage.local.set({ model, modelList: list });
  }
  try {
    return await synthesize(cfg.apiKey, model, data, cfg.customPrompt, signal);
  } catch (e) {
    if (!e.notFound) throw e;
    let next = e.replacement;
    if (!next) {
      const list = await discoverModels(cfg.apiKey);
      await chrome.storage.local.set({ modelList: list });
      next = list.find((m) => /flash/.test(m)) || list[0];
    }
    if (!next || next === model)
      throw new Error("This model was retired and no replacement was found. Open Settings → Refresh.");
    await chrome.storage.local.set({ model: next });
    return await synthesize(cfg.apiKey, next, data, cfg.customPrompt, signal);
  }
}

// --- Markdown assembly ----------------------------------------------------

function buildMarkdown(title, synthLines, data, conversation, groupName) {
  const now = new Date();
  const bullets = (synthLines || [])
    .map((s) => s.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);

  const imgs = Array.isArray(data.images) ? data.images : [];
  const missing = imgs.filter((im) => !conversation.includes(im.src));
  const imagesBlock = missing.length
    ? `\n\n## Images\n\n` +
      missing.map((im) => `![${(im.alt || "").replace(/[\[\]]/g, "")}](${im.src})`).join("\n\n") +
      "\n"
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
