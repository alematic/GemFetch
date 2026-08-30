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

  if (sel && sel.trim().length > 40) {
    markdown = sel.trim();
    mode += " (selection)";
  } else if (isAiMode) {
    const main = document.querySelector('div[role="main"], #main') || document.body;
    markdown = blockMd(main);
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
    markdown = box ? blockMd(box) : "";
  }

  return { url, query, mode, markdown: clean(markdown) };
}
