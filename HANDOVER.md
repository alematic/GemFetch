# Handover — final test pass before Chrome Web Store upload

_Written 2026-09-15, GemFetch v2.2.1. Read `CLAUDE.md` first for architecture;
this file is just the pre-flight checklist for the next session._

## Where things stand

The extension is feature-complete and has been used successfully end to end by
the author (Alessandro). Recent fixes, in order, all already pushed to `main`:

- Non-JSON Gemini output format (JSON mode kept breaking on Markdown content).
- `chrome.downloads.onDeterminingFilename` fix for the "saved as download.md" bug.
- Multi-assistant capture (ChatGPT/Claude/Gemini/Perplexity/Copilot/…), numbered
  `### Prompt N` / `### Response N` turns.
- Per-run model picker in the popup + `lite`-model ranking preference (Pro and
  plain Flash both hit quota walls in testing; Flash-Lite did not).
- **`data:` image URIs are no longer captured** — one leaked a giant base64
  tracking-pixel blob as literal text into a saved note (found via a real
  screenshot, now fixed at the scraper level).
- Options page: Website/GitHub/Donate links, a no-backend mailto Feedback form.
- README/landing-page polish: animated logo, tip-jar donate graphic, a
  Markdown-parsing bug in the README's donate section (blockquote + floated
  image broke GitHub's renderer — fixed).

**Nothing is known-broken right now.** This session's job is to *verify that*,
not to build more.

## Final test pass — do this before uploading

1. **Fresh reload.** `chrome://extensions` → reload the GemFetch card → clear
   any old entries under "Fehler"/Errors (stale errors from earlier builds have
   caused confusion before — always start clean before you trust the error list).
2. **Settings sanity check:** API key present, click **Refresh** — confirm a
   `flash-lite` variant appears and is picked/available, Save folder set,
   Website/GitHub/Donate links open correctly, **Feedback** form opens a
   pre-filled email draft (don't actually send it) or shows the "write a
   message first" guard if empty.
3. **Capture on at least 3 different surfaces**, e.g. Google AI Mode, ChatGPT,
   and one of Claude/Gemini/Perplexity. For each:
   - Model picker at the top of the popup shows a sensible default; try
     switching it and confirm the run uses your choice (not silently the old one).
   - Popup survives being closed mid-analysis — reopen it later, the result
     should be sitting there ready to review (or already saved, if auto-save is on).
   - Saved filename is `YYMMDD-<title-slug>.md`, **not** `download.md`.
   - Open the saved file: front-matter looks right, `## Synthesis` bullets are
     terse (not full sentences), `### Prompt 1` / `### Response 1` etc. are
     numbered and in order, no stray `data:image/...;base64,...` text anywhere.
   - **Show** button reveals the file in the OS file manager.
   - **→ Archive** re-files a copy; **NotesMD** button opens notesmd.cc.
4. **Test the "select text first" fallback** on a page GemFetch doesn't
   specifically target (select a paragraph anywhere, click the icon, confirm
   the selection — not the whole page — gets summarized).
5. **Load on a second, clean Chrome profile** if possible (no other extensions,
   fresh install) — the dev/store guidance recommends this and it catches
   permission-prompt surprises early.
6. **Check the live GitHub Pages site** (`https://alematic.github.io/GemFetch/`)
   renders correctly after the latest push — logo shows and animates, donate
   section reads as prose (not literal `**bold**` or a tiny squished image —
   this exact bug happened once already, see commit `27256b4`), privacy page
   loads, all links resolve.
7. **Check the README on github.com/alematic/GemFetch** renders the same way —
   GitHub's renderer and the raw browser preview don't always agree on raw-HTML
   edge cases, so verify on the actual repo page, not just locally.

## Only if all of the above is clean → prepare the upload

1. Take 1–2 real screenshots for the Store listing if `screenshots/` doesn't
   already have good ones (see `CLAUDE.md`'s "Current state" section — as of
   last check, `analysis.png` was good, `extensions.png`/`ai-search.png` were
   not, `opennote.png` is a nice bonus but shows a third-party app's UI).
2. Zip only the runtime files (exact command in `README.md` → Publishing).
3. Upload at the [Web Store dev dashboard](https://chrome.google.com/webstore/devconsole/)
   (the $5 fee is already paid) — paste listing text from `STORE_LISTING.md`,
   set the Website field to the Pages URL, attach screenshots, submit for review.
4. **Do not** update `docs/index.html`'s `#install` link to a real Store URL
   until the listing is actually approved and live — it 404s until then.

## Things NOT to do

- Don't reintroduce the File System Access API (folder picker) — removed
  deliberately, see `CLAUDE.md` → "Hard constraints".
- Don't put Gemini's response back into JSON mode — it broke repeatedly on
  Markdown content; the current plain `TITLE:/SYNTHESIS:/CONVERSATION:` format
  exists specifically to avoid that.
- Don't add a real backend for feedback/analytics — the whole privacy pitch is
  "no backend, ever"; the mailto form is deliberate, not a placeholder to upgrade.
- Don't commit anything from `screenshots/` without looking at it first — it's
  gitignored on purpose because two early ones leaked unrelated browser state.
