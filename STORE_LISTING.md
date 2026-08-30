# Chrome Web Store listing — draft

Fill the gaps marked `TODO`, then submit at
https://chrome.google.com/webstore/devconsole (one-time $5 registration).

---

**Name:** GemFetch

**Summary (132 char max):**
Save Google AI Overview / AI Mode answers as clean Markdown — AI title, bullet synthesis, tidy transcript — in one click.

**Category:** Productivity

**Language:** English

---

## Detailed description

GemFetch turns a Google "AI Mode" conversation or "AI Overview" box into a tidy
Markdown note on your computer — in one click.

• **One click, one file.** Click the toolbar button, glance at the auto-generated
  title and bullet-point synthesis, hit Save.
• **Cleaned up.** GemFetch uses the Gemini API (with your own free key) to strip
  buttons, follow-up chips, disclaimers and filler, and to rewrite the exchange
  as readable Markdown.
• **Your folder.** Files are written straight into a working folder you choose,
  named `YYMMDD-title.md`.
• **Organised.** Optionally file each note into a subfolder named after the
  current Chrome tab group, and move recent notes into an Archive.
• **Private by design.** Your API key and settings never leave your browser.
  The only network request is the summarization call to Google, using your key.
  No analytics, no servers, no tracking. Open source (MIT).

**You need a free Google AI Studio API key** (aistudio.google.com/apikey). The
free tier is rate-limited; heavy users can enable billing on their own key.

---

## Privacy practices tab

- **Single purpose:** Save the AI answer on a Google search results page as a
  Markdown file.
- **Permission justifications:**
  - `activeTab` + `scripting`: read the current Google page's text when the user
    clicks the button.
  - `storage`: store the user's settings and recent-saves list locally.
  - `tabs` / `tabGroups`: read the active tab's tab-group name for foldering;
    open the working folder in a tab.
  - Host `generativelanguage.googleapis.com`: send page text to the Gemini API
    with the user's key to generate the summary.
- **Remote code:** No.
- **Data collected / sold / transferred:** None by the developer. Page text is
  sent to Google's API under the user's own key; nothing is sent to the developer.
- **Privacy policy URL:** TODO — `https://alematic.github.io/GemFetch/privacy.html`
  (or link the repo's PRIVACY.md raw URL).

---

## Assets to prepare

- **Icon:** done — `icons/icon128.png` (also 16/32/48), wired into `manifest.json`.
- **Screenshots:** 1280×800 or 640×400 PNG, at least one. Suggested shots:
  1. The popup on a Google AI Mode page showing the editable Title + Synthesis.
  2. A saved `.md` open in an editor.
  3. The Settings page.
- **Small promo tile (optional):** 440×280.

## Before submitting — code checklist

- [x] Icons set (16/32/48/128) wired into `manifest.json`.
- [ ] Bump `version` in `manifest.json` for each upload.
- [ ] Host the privacy policy at a public URL.
- [ ] Test on a fresh Chrome profile (no cached permissions).
