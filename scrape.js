// Injected into the active tab. Must be fully self-contained.
// Handles Google AI Overview / AI Mode plus the major web chat assistants,
// with a generic <main> fallback for anything else.
function scrapeConversation() {
  const clean = (s) =>
    (s || "")
      .replace(/ /g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  function inlineMd(node) {
    let out = "";
    node.childNodes.forEach((c) => {
      if (c.nodeType === 3) { out += c.textContent; return; }
      if (c.nodeType !== 1) return;
      const tag = c.tagName.toLowerCase();
      if (tag === "br") out += "\n";
      else if (tag === "a") {
        const t = inlineMd(c).trim();
        const href = c.getAttribute("href") || "";
        out += href && t ? `[${t}](${href})` : t;
      } else if (tag === "strong" || tag === "b") out += `**${inlineMd(c).trim()}**`;
      else if (tag === "em" || tag === "i") out += `*${inlineMd(c).trim()}*`;
      else if (tag === "code") out += "`" + c.textContent + "`";
      else out += inlineMd(c);
    });
    return out;
  }

  const SKIP = new Set(["script","style","noscript","svg","input","textarea","select","form","nav","header","footer"]);

  function imgSrc(el) {
    let s = el.currentSrc || el.getAttribute("src") || el.getAttribute("data-src") || el.getAttribute("data-lsrc") || "";
    if (!/^(https?:|data:image\/)/.test(s) && el.getAttribute("srcset")) {
      const parts = el.getAttribute("srcset").split(",").map((x) => x.trim().split(/\s+/)[0]);
      s = parts[parts.length - 1] || s;
    }
    return s;
  }
  function usableImg(s, w, h) {
    if (!/^(https?:|data:image\/)/.test(s)) return false;
    if (/gstatic\.com\/(faviconV2|images\/branding)|\/branding\/|googlelogo|avatar|profile-picture/i.test(s)) return false;
    if ((w && w < 40) || (h && h < 40)) return false;
    return true;
  }

  function blockMd(el, depth) {
    depth = depth || 0;
    let out = "";
    el.childNodes.forEach((c) => {
      if (c.nodeType === 3) {
        const t = c.textContent.trim();
        if (t) out += t + "\n\n";
        return;
      }
      if (c.nodeType !== 1) return;
      const tag = c.tagName.toLowerCase();
      // Skip chrome, but still descend into a button/figure that wraps an image
      // (assistants show prompt attachments as image chips inside buttons).
      if (tag === "button") {
        if (c.querySelector("img")) out += blockMd(c, depth);
        return;
      }
      if (SKIP.has(tag)) return;
      if (c.getAttribute && c.getAttribute("aria-hidden") === "true") return;
      const role = c.getAttribute && c.getAttribute("role");
      if (["navigation","complementary","banner","search","contentinfo","menu","menubar","toolbar","tablist"].includes(role)) return;
      const cs = window.getComputedStyle(c);
      if (cs && (cs.display === "none" || cs.visibility === "hidden")) return;

      if (/^h[1-6]$/.test(tag)) {
        const t = inlineMd(c).trim();
        if (t) out += "#".repeat(+tag[1]) + " " + t + "\n\n";
      } else if (tag === "ul" || tag === "ol") {
        Array.from(c.children).forEach((li, i) => {
          if (li.tagName.toLowerCase() !== "li") return;
          const prefix = "  ".repeat(depth) + (tag === "ol" ? `${i + 1}. ` : "- ");
          const firstLine = inlineMd(li).trim().split("\n")[0];
          out += prefix + firstLine + "\n";
          const sub = li.querySelector("ul,ol");
          if (sub) out += blockMd(li, depth + 1);
        });
        out += "\n";
      } else if (tag === "table") {
        Array.from(c.querySelectorAll("tr")).forEach((r, ri) => {
          const cells = Array.from(r.children).map((td) =>
            inlineMd(td).trim().replace(/\|/g, "\\|"),
          );
          out += "| " + cells.join(" | ") + " |\n";
          if (ri === 0) out += "| " + cells.map(() => "---").join(" | ") + " |\n";
        });
        out += "\n";
      } else if (tag === "pre") {
        const codeEl = c.querySelector("code");
        const codeText = (codeEl ? codeEl.textContent : c.textContent).replace(/\n+$/, "");
        out += "```\n" + codeText + "\n```\n\n";
      } else if (tag === "img") {
        const src = imgSrc(c);
        if (usableImg(src, c.naturalWidth || c.width, c.naturalHeight || c.height)) {
          out += `![${(c.alt || "").replace(/[\[\]\n]/g, " ").trim()}](${src})\n\n`;
        }
      } else if (["p","div","section","article","span","main","li","figure","details"].includes(tag)) {
        if (c.querySelector("h1,h2,h3,h4,h5,h6,ul,ol,p,table,pre,img")) {
          out += blockMd(c, depth);
        } else {
          const t = inlineMd(c).trim();
          if (t) out += t + "\n\n";
        }
      } else {
        out += blockMd(c, depth);
      }
    });
    return out;
  }

  // --- site registry: known web chat assistants -------------------------
  const HOST = location.hostname.replace(/^www\./, "");
  const SITES = [
    { re: /^chatgpt\.com$|^chat\.openai\.com$/, name: "ChatGPT" },
    { re: /^claude\.ai$/, name: "Claude" },
    { re: /^gemini\.google\.com$/, name: "Gemini" },
    { re: /(^|\.)perplexity\.ai$/, name: "Perplexity" },
    { re: /^copilot\.microsoft\.com$|^bing\.com$/, name: "Copilot" },
    { re: /^grok\.com$|^x\.ai$/, name: "Grok" },
    { re: /^poe\.com$/, name: "Poe" },
    { re: /^chat\.mistral\.ai$/, name: "Le Chat" },
    { re: /^chat\.deepseek\.com$/, name: "DeepSeek" },
    { re: /^you\.com$/, name: "You.com" },
  ];
  const site = SITES.find((s) => s.re.test(HOST));

  const url = location.href;
  const qEl = document.querySelector('textarea[name="q"], input[name="q"]');
  const query = (qEl && qEl.value) || "";
  const isGoogleSearch = /(^|\.)google\.[a-z.]+$/.test(HOST) && /\/search/.test(location.pathname);
  const isAiMode = isGoogleSearch && /[?&]udm=50/.test(url);

  const sel = window.getSelection ? String(window.getSelection()) : "";
  let markdown = "";
  let scopeEl = null;
  let mode;

  if (sel && sel.trim().length > 40) {
    markdown = sel.trim();
    mode = (site ? site.name : isGoogleSearch ? "Google" : "Web page") + " (selection)";
  } else if (site) {
    scopeEl =
      document.querySelector("main") ||
      document.querySelector('[role="main"]') ||
      document.querySelector("#__next main, chat-window") ||
      document.body;
    markdown = blockMd(scopeEl);
    mode = site.name;
  } else if (isAiMode) {
    scopeEl = document.querySelector('div[role="main"], #main') || document.body;
    markdown = blockMd(scopeEl);
    mode = "AI Mode";
  } else if (isGoogleSearch) {
    let box =
      document.querySelector('[data-subtree="aio"]') ||
      document.querySelector('div[aria-label^="AI Overview" i]');
    if (!box) {
      const cands = Array.from(document.querySelectorAll("div,section")).filter((e) => {
        const tc = e.textContent || "";
        return /AI Overview/i.test(tc) && tc.length > 120 && tc.length < 6000;
      });
      cands.sort((a, b) => a.textContent.length - b.textContent.length);
      box = cands[0] || document.querySelector("#rso") || document.querySelector('div[role="main"]');
    }
    scopeEl = box;
    markdown = box ? blockMd(box) : "";
    mode = "AI Overview";
  } else {
    // Generic: grab the main content region of any page.
    scopeEl = document.querySelector('main, [role="main"], #main, article') || null;
    markdown = scopeEl ? blockMd(scopeEl) : "";
    mode = "Web page";
  }

  // --- links referenced in the captured region -------------------------
  function realUrl(href) {
    try {
      const u = new URL(href, location.href);
      const q = u.searchParams.get("q") || u.searchParams.get("url") || u.searchParams.get("u");
      if (q && /^https?:/.test(q)) return q;
      return u.href;
    } catch (e) {
      return href;
    }
  }
  const ASSET_HOST = /(^|\.)(gstatic\.com|googleusercontent\.com|google\.[a-z.]+|bing\.com|microsoft\.com|office\.com|openai\.com|oaistatic\.com|oaiusercontent\.com|anthropic\.com|perplexity\.ai|cloudflare\.com|licdn\.com|fbcdn\.net)$/i;
  const UI_WORD = /^(new chat|share|copy|copied|regenerate|edit|delete|settings|upgrade|sign in|log in|help|feedback|sources?|show more|show less|continue|retry)$/i;
  const sources = [];
  const seen = new Set();
  if (scopeEl) {
    scopeEl.querySelectorAll('a[href^="http"], a[href^="/url?"]').forEach((a) => {
      const href = realUrl(a.getAttribute("href") || "");
      let host;
      try {
        host = new URL(href, location.href).hostname.replace(/^www\./, "");
      } catch (e) {
        return;
      }
      const text = (a.textContent || a.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
      if (host === HOST || ASSET_HOST.test(host) || seen.has(href)) return;
      if (UI_WORD.test(text) || text.length < 2) return;
      const cs = window.getComputedStyle(a);
      if (cs && cs.display === "none") return;
      seen.add(href);
      sources.push({ title: (text || host).slice(0, 140), url: href, host });
    });
  }

  // --- images: prompt attachments AND answer images -------------------
  const images = [];
  const imgSeen = new Set();
  if (scopeEl) {
    scopeEl.querySelectorAll("img").forEach((im) => {
      const s = imgSrc(im);
      if (!usableImg(s, im.naturalWidth || im.width, im.naturalHeight || im.height)) return;
      if (imgSeen.has(s)) return;
      imgSeen.add(s);
      images.push({ src: s, alt: (im.alt || "").replace(/[\[\]\n]/g, " ").trim() });
    });
    scopeEl.querySelectorAll('[style*="background-image"]').forEach((el) => {
      const m = /url\(["']?((?:https?:|data:image\/)[^"')]+)["']?\)/.exec(el.getAttribute("style") || "");
      if (!m || imgSeen.has(m[1])) return;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) return;
      imgSeen.add(m[1]);
      images.push({ src: m[1], alt: (el.getAttribute("aria-label") || "").trim() });
    });
  }

  return {
    url,
    query,
    mode,
    markdown: clean(markdown),
    sources: sources.slice(0, 25),
    images: images.slice(0, 20),
  };
}
