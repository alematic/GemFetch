# GemFetch — Privacy Policy

_Last updated: 2026-08-30_

GemFetch is a browser extension that saves a Google AI Overview / AI Mode answer
as a Markdown file on your computer.

## What data GemFetch handles

- **Page content.** When you click the toolbar button, GemFetch reads the text of
  the Google results page you are on, so it can extract the answer.
- **Your API key.** You enter a Google AI Studio API key in the extension's
  settings.
- **Your settings.** Model choice, working-folder name and path, group names,
  extra instructions, and a short list of your most recent saves.

## Where the data goes

- **Stays on your device:** your API key, all settings, the recent-saves list
  (`chrome.storage.local`), and the folder handle (`IndexedDB`). None of this is
  transmitted to the extension author or any third party.
- **Sent to Google:** the scraped page text and your search query are sent to
  Google's Generative Language API (`generativelanguage.googleapis.com`), using
  **your** API key, solely to generate the title, synthesis, and cleaned-up
  transcript. This request is governed by
  [Google's API terms and privacy policy](https://ai.google.dev/gemini-api/terms).
- **Written to disk:** the resulting Markdown file is written only to the folder
  you selected.

## What GemFetch does NOT do

- No analytics, telemetry, tracking, or advertising.
- No remote code loading.
- No servers operated by the extension author. There is no backend.
- No access to your browsing history, other tabs, cookies, or passwords.

## Permissions and why

| Permission | Reason |
|---|---|
| `activeTab` + `scripting` | Read the current Google page's text when you click the button. |
| `storage` | Save your settings and recent-saves list locally. |
| `tabs`, `tabGroups` | Read the current tab's Chrome tab-group name to choose a subfolder; open the working folder in a tab. |
| host access to `generativelanguage.googleapis.com` | Call the Gemini API with your key. |

## Contact

Open an issue at the project's GitHub repository.
