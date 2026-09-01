# GemFetch — Privacy Policy

_Last updated: 2026-09-01_

GemFetch is a browser extension that saves an AI assistant conversation (or selected page text)
as a Markdown file on your computer.

## What data GemFetch handles

- **Page content.** When you click the toolbar button, GemFetch reads the text of
  the page you clicked the button on, so it can extract the conversation.
- **Your API key.** You enter a Google AI Studio API key in the extension's
  settings.
- **Your settings.** Model choice, save-folder name, group names, extra
  instructions, and a short list of your most recent saves (which, so the
  "Archive" button can work, includes the Markdown text of those recent notes).

## Where the data goes

- **Stays on your device:** your API key, all settings and the recent-saves list
  (`chrome.storage.local`). None of this is transmitted to the extension author
  or any third party.
- **Sent to Google:** the scraped page text and your search query are sent to
  Google's Generative Language API (`generativelanguage.googleapis.com`), using
  **your** API key, solely to generate the title, synthesis, and cleaned-up
  transcript. This request is governed by
  [Google's API terms and privacy policy](https://ai.google.dev/gemini-api/terms).
- **Written to disk:** the resulting Markdown file is saved, via the browser's
  download mechanism, into a subfolder of your Downloads folder.

## What GemFetch does NOT do

- No analytics, telemetry, tracking, or advertising.
- No remote code loading.
- No servers operated by the extension author. There is no backend.
- No access to your browsing history, other tabs, cookies, or passwords.

## Permissions and why

| Permission | Reason |
|---|---|
| `activeTab` + `scripting` | Read the current page's text — only the tab you clicked the button on. |
| `storage` | Save your settings and recent-saves list locally. |
| `downloads` | Write the Markdown file into a Downloads subfolder, and reveal it when you click "Show". |
| `tabs`, `tabGroups` | Read the current tab's Chrome tab-group name to choose a subfolder. |
| host access to `generativelanguage.googleapis.com` | Call the Gemini API with your key. |

## Contact

Open an issue at the project's GitHub repository.
