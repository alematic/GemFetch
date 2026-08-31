// This whole function is injected into the Google page. It must be self-contained.
function scrapeGeminiConversation() {
  const clean = (s) =>
    (s || "")
      .replace(/ /g, " ")
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

  const SKIP = new Set(["script","style","noscript","svg","button","input","textarea","select","form","nav","header","footer"]);

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
      if (SKIP.has(tag)) return;
      if (c.getAttribute && c.getAttribute("aria-hidden") === "true") return;
      const role = c.getAttribute && c.getAttribute("role");
      if (["navigation", "complementary", "banner", "search", "contentinfo", "menu", "menubar", "toolbar", "tablist"].includes(role)) return;
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
        out += "```\n" + c.textContent.trim() + "\n```\n\n";
      } else if (tag === "img") {
        const src = c.currentSrc || c.getAttribute("src") || "";
        const w = c.naturalWidth || c.width || 0;
        const h = c.naturalHeight || c.height || 0;
        const junk = /gstatic\.com\/(faviconV2|images\/branding)|\/branding\//i.test(src);
        if (/^(https?:|data:image\/)/.test(src) && !junk && (w === 0 || w >= 48) && (h === 0 || h >= 48)) {
          out += `![${(c.alt || "").replace(/[\[\]\n]/g, " ").trim()}](${src})\n\n`;
        }
      } else if (["p","div","section","article","span","main","li"].includes(tag)) {
        if (c.querySelector("h1,h2,h3,h4,h5,h6,ul,ol,p,table,pre")) {
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

  const url = location.href;
  const qEl = document.querySelector('textarea[name="q"], input[name="q"]');
  const query = (qEl && qEl.value) || "";
  const isAiMode = /[?&]udm=50/.test(url);
  let mode = isAiMode ? "AI Mode" : "AI Overview";

  const sel = window.getSelection ? String(window.getSelection()) : "";
  let markdown = "";
  let scopeEl = null;

  if (sel && sel.trim().length > 40) {
    markdown = sel.trim();
    mode += " (selection)";
  } else if (isAiMode) {
    scopeEl = document.querySelector('div[role="main"], #main') || document.body;
    markdown = blockMd(scopeEl);
  } else {
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
  }

  // Citation / source links inside the answer region.
  function realUrl(href) {
    try {
      const u = new URL(href, location.href);
      const q = u.searchParams.get("q") || u.searchParams.get("url");
      if (q && /^https?:/.test(q)) return q;
      return u.href;
    } catch (e) {
      return href;
    }
  }
  const BAD_HOST = /(^|\.)(google\.[a-z.]+|gstatic\.com|googleusercontent\.com|youtube\.com\/redirect|accounts\.google|policies\.google|support\.google)$/i;
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
      if (BAD_HOST.test(host) || seen.has(href)) return;
      const cs = window.getComputedStyle(a);
      if (cs && cs.display === "none") return;
      seen.add(href);
      const title = (a.textContent || a.getAttribute("aria-label") || host)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 140) || host;
      sources.push({ title, url: href, host });
    });
  }

  return { url, query, mode, markdown: clean(markdown), sources: sources.slice(0, 25) };
}
