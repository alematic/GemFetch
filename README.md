# GemFetch

A tiny Chrome (Manifest V3) extension. One click on a Google search page saves the
**AI Overview** or **AI Mode** conversation as a Markdown file — with an
AI-generated title, a bullet-point synthesis, the cleaned-up chat, and a link back
to the page. Files are filed into a subfolder named after the current **Chrome tab
group**, and recent chats can be moved between groups (e.g. into an **Archive**).

## Output

```
<working folder>/<Tab group name>/260830-Understanding-GC-MS-calibration.md
```

```markdown
---
title: "Understanding GC-MS calibration curves"
source: AI Mode
group: Research
query: "how to build a gc-ms calibration curve"
url: https://www.google.com/search?...
saved: 2026-08-30T14:32:01.000Z
---

# Understanding GC-MS calibration curves

[Open this chat](https://www.google.com/search?...)

## Synthesis
- ...
- ...

## Conversation
### Prompt
...
### Response
...
```

- Filename: `YYMMDD-<title-slug>.md`, with `-1`, `-2` … on collision.
- Subfolder: the current Chrome tab group's name. Tab not in a group → the
  **Default group** from Settings (`Inbox`).

## Install (unpacked)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this `gemfetch` folder.
3. Open the extension → **Settings**:
   - Paste a free **Google AI Studio API key** (`aistudio.google.com/apikey`).
   - Optionally set the model, default group, and archive group name.
   - **Choose folder…** → pick your working folder.
4. Pin the extension.

## Use

- Run a Google search; open **AI Mode** or let the **AI Overview** load.
- Click the GemFetch icon. It shows the detected tab-group name (editable).
- Click **Fetch & save this page** → reads the page, summarizes, writes the file.
- The **Recent** list shows the last 8 saves with a group dropdown + **Move**
  button to relocate a file (into Archive or any other group subfolder).
- If Chrome has forgotten folder permission, click the button once more to re-grant.

## Notes / limitations

- Google's search markup is unlabelled and changes often; the scraper is
  best-effort. If it grabs junk or misses content, **select the answer text on the
  page first**, then click — a non-empty selection is used verbatim.
- Everything is local. The API key and the folder handle never leave the browser;
  the only outbound request is the summarization call to Google's Generative
  Language API.
- Uses `activeTab`, so it works on any `www.google.*` domain with no host list.
- If the summarization call fails, the file is still written with the raw scrape.
