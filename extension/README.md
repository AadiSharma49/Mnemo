# Mnemo — Decision Capture (Chrome Extension)

One-click capture of AI conversations (Claude, ChatGPT, Gemini) into Mnemo.
No copy-paste. The extension reads the open conversation, sends it to Mnemo,
and Mnemo auto-extracts decisions, action items and questions.

This folder is **fully standalone** — vanilla JS, no build step, no bundler.

---

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Manifest V3 config (permissions, content scripts, popup) |
| `popup.html` / `popup.js` / `styles.css` | The toolbar popup UI + logic |
| `content.js` | Reads the conversation from the AI tool's DOM |
| `background.js` | Service worker (minimal in v1) |
| `icons/` | Extension icons (`icon16/48/128.png`) + `generate-icons.mjs` to rebuild them |

---

## Prerequisites (backend)

The extension talks to these Mnemo endpoints (already built):

- `GET  /api/user/api-key` — get your personal API key (Clerk-authed, in-browser)
- `GET  /api/extension/workspaces` — list your workspaces (API-key auth)
- `POST /api/extension/import` — capture + auto-extract (API-key auth)

The extension talks to the hosted Mnemo by default. To develop against a local
server (`npm run dev`), open **Self-hosting? Use a different server** on the
connect screen and enter `http://localhost:3000`.

---

## Load the extension in Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right) ON
3. Click **Load unpacked**
4. Select this `extension/` folder
5. The Mnemo "R" icon appears in your toolbar (pin it for convenience)

> After editing any extension file, click the **↻ reload** icon on the card at
> `chrome://extensions`.

---

## Get your API key

1. Sign in to Mnemo and open **Settings → API Key** (the extension's
   **Get my API key →** link goes straight there)
2. Click **Generate API Key** and copy it (looks like `mnemo_sk_…`) — **it's shown only once**
   - Lost it? Click **Regenerate Key** on the same page.

---

## Connect the extension

1. Click the Mnemo toolbar icon
2. **API key**: paste the `mnemo_sk_…` key
3. Click **Connect**

Self-hosting? Expand **Self-hosting? Use a different server** and enter your
own `https://` URL (plain `http://` is only accepted for localhost).

---

## Test the capture flow end-to-end

1. Go to **https://claude.ai** and open any conversation with real content
2. Click the Mnemo icon
3. Pick a **Workspace** from the dropdown
4. Click **Capture conversation**
   - "Reading the conversation…" → "Extracting decisions…"
   - Success: **"Found N decisions, M action items, K questions."**
5. Click **View in Mnemo** → the workspace opens with the new conversation and
   the extracted items already saved

Repeat on **https://chatgpt.com** and **https://gemini.google.com** to test the
other extractors.

---

## Troubleshooting

- **"Couldn't reach Mnemo…"** → the dev server isn't running, or the Mnemo
  URL in the popup is wrong.
- **"Your API key was rejected"** → regenerate a key (`POST /api/user/api-key`)
  and reconnect. Also confirm you restarted the dev server after the DB change.
- **"No conversation found on this page."** → open an actual conversation (not
  the new-chat screen), let it finish rendering, then capture. The DOM selectors
  for Claude/ChatGPT/Gemini can change over time; update the extractors in
  `content.js` if a site redesigns.
- **Popup does nothing on a chat page** → reload the extension at
  `chrome://extensions`, then refresh the chat tab.

---

## Rebuilding icons

```bash
cd extension/icons
node generate-icons.mjs
```

---

## Notes / v2 ideas

- Auth is a pasted API key for v1. A proper OAuth "Connect" flow can replace it
  (that's what `background.js` is scaffolded for).
- Extraction runs synchronously on import; very long conversations could be
  moved to a background job later.
- A "Settings" button in the Mnemo app to view/copy/regenerate the API key
  would remove the manual `/api/user/api-key` step.
