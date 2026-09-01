# 💎 GemFetch

A tiny Chrome (Manifest V3) extension. Click the icon on a Google **AI Mode /
AI Overview** result — or a **ChatGPT / Claude / Gemini / Perplexity / Copilot**
conversation — and it captures the exchange, cleans it up with Gemini (strips
buttons, follow-up chips, disclaimers, filler), and saves it as a Markdown file
into a subfolder of your **Downloads** folder. Review the title and synthesis
first, or turn on auto-save and just walk away.

The analysis runs in the background — close the popup, move the window, do
something else; it finishes and (in auto-save mode) the file appears.

MIT licensed · [privacy policy](PRIVACY.md) · landing page in [`docs/`](docs/)

> **Support:** GemFetch is free and open source. If it helps you,
> [donate via PayPal](https://paypal.me/afulciniti95).

## Output

```
~/Downloads/<save folder>/260901-Understanding-GC-MS-calibration.md
```

```markdown
---
title: "Understanding GC-MS calibration curves"
source: AI Mode
query: "how to build a gc-ms calibration curve"
saved: 2026-08-30T14:32:01.000Z
---

# Understanding GC-MS calibration curves

[↗ Open this chat in your browser](https://www.google.com/search?...)

## Synthesis
- ...

## Conversation
### Prompt 1
...
### Response 1
... (images kept inline as ![](url))
### Prompt 2
...

## Sources
1. [Page title](https://example.com/article)
2. ...
```

Images found in the answer are kept inline (or collected under `## Images` if the
model drops them). Citation links from the answer are listed under `## Sources`
as remote URLs — some Google-hosted image URLs and redirect links may expire.

- Filename: `YYMMDD-<title-slug>.md` (Chrome adds ` (1)` on collision).
- Files go to `Downloads / <save folder> /` (default `GemFetch`; set it to
  `GeminiChatsMDs` to keep an existing location). Turn on *“File chats into
  per-tab-group subfolders”* for an extra `…/<tab group>/` level.
- Uses the browser's **downloads** mechanism, so **no folder permission is ever
  requested**. A brief entry appears in Chrome's download tray as each file lands.

## Install

Once published to the **Chrome Web Store**, end users just click *Add to Chrome*
on the listing — one click, no developer mode, and Chrome auto-updates it. The
steps below are only for running the unpacked source before/independently of that.

### Unpacked (developer)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this `gemfetch` folder.
3. Card → **Details** → **Extension options**:
   - Paste a free **Google AI Studio API key** (`aistudio.google.com/apikey`), Save.
   - Click **Refresh** to load the models your key can use, pick one.
   - Set the **Save folder** (a subfolder name under Downloads).
   - Optionally: **auto-save**, tab-group subfolders, Archive name.
4. Pin the extension.

## Use

- On a Google search, open **AI Mode** or let the **AI Overview** load.
- Click the GemFetch icon. It reads the page and summarizes in the background.
- **Review mode** (default): edit the **Title** / **Synthesis** (one bullet per
  line), click **Save**. **Auto-save mode**: the file is written as soon as the
  summary is ready — nothing else to do.
- **Stop analysis** cancels an in-flight run; **Start again** re-runs it.
- **Recent** lists the last saves: **Show** reveals the file in your file
  manager; **→ Archive** re-saves a copy into the Archive subfolder.

## API key, quotas, other users

Each user brings their own **free** Google AI Studio key (`aistudio.google.com/apikey`).
The key is stored locally in that user's browser only.

The free tier is rate-limited **per model** (requests per minute and per day).
Pick a **"flash"** model in Settings (Refresh loads what your key can use) —
they have the most generous free allowance. If you see `429` errors:

- Wait a minute (GemFetch auto-retries once) — per-minute limits reset fast.
- Prefer a lighter "flash" model; "pro" and newest-preview models have much smaller free quotas.
- For heavy use, enable **billing** on the key's Google Cloud project
  (console.cloud.google.com → Billing). A consumer *Gemini Advanced / Pro*
  subscription does **not** raise API limits — only Cloud billing does.

To distribute: share this folder (or the repo). Each person loads it unpacked and
enters their own key in Settings. No shared server, no shared quota.

## Notes / limitations

- Google's markup is unlabelled and shifts often; the scraper is best-effort. If
  it grabs junk or misses content, **select the answer text on the page first**,
  then reopen — a non-empty selection is used verbatim.
- Local only. API key + settings never leave the browser; the sole outbound
  request is the cleanup/summary call to Google's Generative Language API.
- If that call fails, GemFetch still saves the raw text (with a warning).
- Uses `activeTab` → works on any `www.google.*` domain, no host list.

## Supported pages

Recognised and captured whole-conversation: **Google AI Mode & AI Overview**,
**ChatGPT** (chatgpt.com), **Claude** (claude.ai), **Gemini** (gemini.google.com),
**Perplexity**, **Copilot**, **Grok**, **Poe**, **Le Chat**, **DeepSeek**, **You.com**.

On any other page GemFetch grabs the main content region (`<main>`), and on
*every* page a non-empty **text selection wins** — select exactly what you want,
click the icon, and that's what gets summarized and saved.

These sites change their markup constantly, so capture is best-effort. If a page
comes through messy or truncated, select the part you care about and re-run.

## Publishing

See [`STORE_LISTING.md`](STORE_LISTING.md) for the Chrome Web Store draft and the
pre-submit checklist (icons, versioning, hosted privacy policy). The landing page
under [`docs/`](docs/) is ready for GitHub Pages — enable it at
**Settings → Pages → Source: `main` / `docs`**, then it serves at
`https://alematic.github.io/GemFetch/`.

Before going fully public, update the `#install` link in `docs/index.html`
(and the `STORE_LISTING.md` privacy-policy URL) to the Chrome Web Store URL
once the listing is live.

## Contributing

Plain HTML/JS, no build step. Edit files, then reload the extension at
`chrome://extensions`. `node -c *.js` for a quick syntax check.

## License

[MIT](LICENSE).
