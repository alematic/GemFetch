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

  // Only ever capture http(s) image URLs. `data:` URIs are almost always
  // tracking pixels / spacer gifs / loading placeholders with no natural
  // size to filter on, and embedding one verbatim dumps a huge base64 blob
  // as literal text into the saved Markdown (confirmed in the wild: a 1x1
  // PNG tracking pixel leaking through as unreadable text in a note).
  function imgSrc(el) {
    let s = el.currentSrc || el.getAttribute("src") || el.getAttribute("data-src") || el.getAttribute("data-lsrc") || "";
    if (!/^https?:/.test(s) && el.getAttribute("srcset")) {
      const parts = el.getAttribute("srcset").split(",").map((x) => x.trim().split(/\s+/)[0]);
      s = parts[parts.length - 1] || s;
    }
    return s;
  }
  // Junk we never want even when it's big enough to pass the size check:
  // favicon services, logos/branding, avatars, sprites/icon sheets, badges,
  // emoji art, and 1x1-style spacer/tracking pixels served over http(s).
  const JUNK_IMG_RE = /favicon|gstatic\.com\/images\/branding|\/branding\/|googlelogo|\blogos?\b|avatar|profile[-_]?pic|\bsprites?\b|\bicons?\b|\bbadges?\b|emoji|spacer|tracking[-_]?pixel|[/_-]1x1[/._-]/i;
  function usableImg(s, el) {
    if (!/^https?:/.test(s)) return false;
    if (JUNK_IMG_RE.test(s)) return false;
    // naturalWidth/naturalHeight are 0 until the image has actually loaded,
    // which would let un-loaded placeholders slip through a natural-size
    // check. The rendered box (present the moment layout has happened) is
    // the reliable signal, and a 0x0 box (not laid out yet) is rejected too.
    // Floor kept modest: prompt attachments render as fairly small chips on
    // some assistants, and dropping those would defeat the point.
    const r = el.getBoundingClientRect();
    return r.width >= 48 && r.height >= 48;
  }

  // ---- image classification: prompt attachment vs. answer body vs. source card ----
  const CHROME_TAG = new Set(["nav", "aside", "header", "footer"]);
  const CHROME_ROLE = /^(navigation|complementary|banner|contentinfo|toolbar|tablist|menu)$/;
  const RELATED_TEXT_RE = /related search|people also ask|suggested|follow[- ]?up/i;
  // Small best-effort registry of "this is a user turn" markers, in the same
  // spirit as the site registry below — not exhaustive, just cheap and forgiving.
  const USER_TURN_SEL =
    '[data-message-author-role="user"], [data-testid="user-message"], ' +
    '[class*="user-turn" i], [class*="user-message" i], [data-role="user"]';
  function looksLikeRelatedBlock(node) {
    const label = (node.getAttribute && node.getAttribute("aria-label")) || "";
    if (RELATED_TEXT_RE.test(label)) return true;
    const h = node.querySelector && node.querySelector("h1,h2,h3,h4");
    return !!(h && h.parentElement === node && RELATED_TEXT_RE.test(h.textContent || ""));
  }
  // Walk from an <img> (or background-image element) up to the captured
  // scope, classifying it as "prompt", "answer", "source", or null (drop).
  function describeImg(el, scope) {
    let userTurn = false;
    let chip = false;
    let sourceHref = null;
    let node = el;
    while (node && node !== scope) {
      const tag = node.tagName ? node.tagName.toLowerCase() : "";
      if (CHROME_TAG.has(tag)) return { kind: null };
      const role = node.getAttribute && node.getAttribute("role");
      if (role && CHROME_ROLE.test(role)) return { kind: null };
      if (looksLikeRelatedBlock(node)) return { kind: null };
      if (node.matches && node.matches(USER_TURN_SEL)) userTurn = true;
      // Assistants render prompt attachments as image chips inside a <button>.
      if (tag === "button" && node.querySelector("img")) chip = true;
      // An image sitting inside a link to a DIFFERENT site than the page
      // itself is the reliable signature of a source/citation card thumbnail
      // (favicon, publisher logo, article art) rather than an image the
      // assistant actually put in its own answer.
      if (!sourceHref && tag === "a" && node.hasAttribute("href")) {
        const resolved = realUrl(node.getAttribute("href") || "");
        let h = "";
        try { h = new URL(resolved, location.href).hostname.replace(/^www\./, ""); } catch (e) {}
        if (h && h !== HOST) sourceHref = resolved;
      }
      node = node.parentElement;
    }
    // An explicit user-turn marker beats everything else. Failing that, the
    // external link wins over the button-chip guess — plenty of sites wrap a
    // citation thumbnail in a <button> too, and calling one a prompt
    // attachment would inline it into the note, which is the bug we are fixing.
    if (userTurn) return { kind: "prompt", sourceHref: null };
    if (sourceHref) return { kind: "source", sourceHref };
    if (chip) return { kind: "prompt", sourceHref: null };
    return { kind: "answer", sourceHref: null };
  }

  // The same picture is often served at two CDN sizes within one answer;
  // without this it gets inlined twice and reads as a duplicate in the note.
  const inlineSeen = new Set();

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
        // Only prompt attachments and images the assistant put in its own
        // answer get inlined — source-card thumbnails and dropped chrome
        // must never appear as literal `![]()` lines (Gemini is told to
        // preserve every such line verbatim, so anything inline ends up
        // in the saved note no matter what it actually is).
        if (usableImg(src, c)) {
          const kind = describeImg(c, scopeEl).kind;
          const key = normImgUrl(src);
          if ((kind === "prompt" || kind === "answer") && !inlineSeen.has(key)) {
            inlineSeen.add(key);
            out += `![${(c.alt || "").replace(/[\[\]\n]/g, " ").trim()}](${src})\n\n`;
          }
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

  // --- images: prompt attachments, answer images, and a couple of source thumbnails ---
  // Strip query/hash before comparing so the same picture served at two
  // sizes (e.g. a CDN width param) isn't listed twice; the full original
  // URL is still what gets stored.
  function normImgUrl(u) {
    try {
      const x = new URL(u, location.href);
      x.search = "";
      x.hash = "";
      return x.href;
    } catch (e) {
      return u.split(/[?#]/)[0];
    }
  }
  const promptAnswerImgs = [];
  const sourceCandidates = []; // { src, alt, href } — href is the citation link it sat inside
  const imgSeen = new Set();
  if (scopeEl) {
    scopeEl.querySelectorAll("img").forEach((im) => {
      const s = imgSrc(im);
      if (!usableImg(s, im)) return;
      const { kind, sourceHref } = describeImg(im, scopeEl);
      if (!kind) return;
      const key = normImgUrl(s);
      if (imgSeen.has(key)) return;
      imgSeen.add(key);
      const alt = (im.alt || "").replace(/[\[\]\n]/g, " ").trim();
      if (kind === "source") sourceCandidates.push({ src: s, alt, href: sourceHref });
      else promptAnswerImgs.push({ src: s, alt, kind });
    });
    // Background-image tiles are almost always decorative UI (carousels,
    // related-content cards); only keep ones that land in the answer body,
    // routed through the same classifier so this can never disagree with
    // the <img> pass above.
    scopeEl.querySelectorAll('[style*="background-image"]').forEach((el) => {
      const m = /url\(["']?(https?:[^"')]+)["']?\)/.exec(el.getAttribute("style") || "");
      if (!m) return;
      const s = m[1];
      if (!usableImg(s, el)) return;
      if (describeImg(el, scopeEl).kind !== "answer") return;
      const key = normImgUrl(s);
      if (imgSeen.has(key)) return;
      imgSeen.add(key);
      promptAnswerImgs.push({ src: s, alt: (el.getAttribute("aria-label") || "").replace(/[\[\]\n]/g, " ").trim(), kind: "answer" });
    });
  }
  // Prompt entries first, then answer — stable sort keeps document order
  // within each group — capped at 10 combined.
  promptAnswerImgs.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "prompt" ? -1 : 1));
  const cappedPromptAnswer = promptAnswerImgs.slice(0, 10).map(({ src, alt, kind }) => ({ src, alt, kind }));

  // For sources, prefer thumbnails that belong to the first few sources[]
  // entries (matched on the same realUrl() normalisation used to build that
  // list) so the pair shown is actually representative; fall back to the
  // first 2 usable source-classified images in document order otherwise.
  const topSourceUrls = sources.slice(0, 5).map((s) => normImgUrl(s.url));
  const chosenSources = [];
  sourceCandidates.forEach((cand) => {
    if (chosenSources.length >= 2 || !cand.href) return;
    if (topSourceUrls.includes(normImgUrl(cand.href))) chosenSources.push(cand);
  });
  sourceCandidates.forEach((cand) => {
    if (chosenSources.length >= 2 || chosenSources.includes(cand)) return;
    chosenSources.push(cand);
  });
  const images = cappedPromptAnswer.concat(
    chosenSources.slice(0, 2).map(({ src, alt }) => ({ src, alt, kind: "source" })),
  );

  return {
    url,
    query,
    mode,
    markdown: clean(markdown),
    sources: sources.slice(0, 25),
    images,
  };
}
