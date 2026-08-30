# GemFetch

A tiny Chrome (Manifest V3) extension. Click the icon on a Google search page and
it fetches the **AI Overview** / **AI Mode** answer, cleans it up with Gemini
(strips buttons, follow-up chips, disclaimers, filler), and — after you eyeball
the title and bullet synthesis — saves it as a Markdown file in your working
folder.

## Output

```
<working folder>/260830-Understanding-GC-MS-calibration.md
```

```markdown
---
title: "Understanding GC-MS calibration curves"
source: AI Mode
query: "how to build a gc-ms calibration curve"
url: https://www.google.com/search?...
saved: 2026-08-30T14:32:01.000Z
---

# Understanding GC-MS calibration curves

[Open this chat](https://www.google.com/search?...)

## Synthesis
- ...

## Conversation
### Prompt
...
### Response
...
```

- Filename: `YYMMDD-<title-slug>.md` (`-1`, `-2` … on collision).
- By default files go **straight into the working folder**. Turn on
  *“File chats into per-tab-group subfolders”* in Settings to file each chat into
  a subfolder named after the current Chrome tab group instead.

## Install (unpacked)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this `gemfetch` folder.
3. Card → **Details** → **Extension options**:
   - Paste a free **Google AI Studio API key** (`aistudio.google.com/apikey`), Save.
   - Click **Refresh list** to load the models your key can use, pick one.
   - Optionally enable tab-group subfolders / set the Archive name.
   - **Choose folder…** → pick your working folder, approve the prompt.
4. Pin the extension.

## Use

- On a Google search, open **AI Mode** or let the **AI Overview** load.
- Click the GemFetch icon. It reads the page and summarizes, then shows an
  editable **Title** and **Synthesis** (one bullet per line).
- Tweak them, click **Save**.
- **Recent** lists the last 8 saves with a **Move** button to relocate a file
  (to the Archive subfolder, another tab-group subfolder, or the folder root).
- If Chrome forgot folder permission, reopen the popup to re-grant.

## API key, quotas, other users

Each user brings their own **free** Google AI Studio key (`aistudio.google.com/apikey`).
The key is stored locally in that user's browser only.

The free tier is rate-limited **per model** (requests per minute and per day).
GemFetch defaults to **Gemini 2.0 Flash**, which has the most generous free
allowance (~200 requests/day). If you see `429` errors:

- Wait a minute (GemFetch auto-retries once) — per-minute limits reset fast.
- Stay on Gemini 2.0 Flash; the newer models have much smaller free quotas.
- For heavy use, enable **billing** on the key's Google Cloud project
  (console.cloud.google.com → Billing). A consumer *Gemini Advanced / Pro*
  subscription does **not** raise API limits — only Cloud billing does.

To distribute: share this folder (or the repo). Each person loads it unpacked and
enters their own key in Settings. No shared server, no shared quota.

## Notes / limitations

- Google's markup is unlabelled and shifts often; the scraper is best-effort. If
  it grabs junk or misses content, **select the answer text on the page first**,
  then reopen — a non-empty selection is used verbatim.
- Local only. API key + folder handle never leave the browser; the sole outbound
  request is the cleanup/summary call to Google's Generative Language API.
- If that call fails, the popup says so and still lets you save the raw text.
- Uses `activeTab` → works on any `www.google.*` domain, no host list.
