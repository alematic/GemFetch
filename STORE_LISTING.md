# Chrome Web Store listing — draft

Fill the gaps marked `TODO`, then submit at
https://chrome.google.com/webstore/devconsole (one-time $5 registration).

---

**Name:** GemFetch

**Summary (132 char max):**
Save any AI chat (Google AI Mode, ChatGPT, Claude, Gemini, Perplexity…) as clean Markdown — title, synthesis, transcript — in one click.

**Category:** Productivity

**Language:** English

---

## Detailed description

GemFetch turns an AI assistant conversation — Google AI Mode / AI Overview,
ChatGPT, Claude, Gemini, Perplexity, Copilot and more — into a tidy Markdown
note on your computer, in one click.

• **One click, one file.** Click the toolbar button, glance at the auto-generated
  title and bullet-point synthesis, hit Save.
• **Cleaned up.** GemFetch uses the Gemini API (with your own free key) to strip
  buttons, follow-up chips, disclaimers and filler, and to rewrite the exchange
  as readable Markdown.
• **Your folder, no prompts.** Files land in a subfolder of your Downloads,
  named `YYMMDD-title.md`. No folder-access permission is ever requested.
• **Runs in the background.** Start it and close the popup; the analysis
  finishes on its own. Turn on auto-save for zero-touch capture.
• **Organised.** Optionally an extra subfolder per Chrome tab group, plus an
  Archive button on recent notes.
• **Private by design.** Your API key and settings never leave your browser.
  The only network request is the summarization call to Google, using your key.
  No analytics, no servers, no tracking. Open source (MIT).

**You need a free Google AI Studio API key** (aistudio.google.com/apikey). The
free tier is rate-limited; heavy users can enable billing on their own key.

---

## Privacy practices tab

- **Single purpose:** Save the current AI assistant conversation (or selected
  page text) as a Markdown file.
- **Permission justifications:**
  - `activeTab` + `scripting`: read the current page's text (only the tab the
    user explicitly clicked the button on).
  - `storage`: store the user's settings and recent-saves list locally.
  - `downloads`: write the generated Markdown file into a Downloads subfolder,
    and reveal it in the OS file manager when the user clicks "Show".
  - `tabs` / `tabGroups`: read the active tab's tab-group name for foldering.
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
