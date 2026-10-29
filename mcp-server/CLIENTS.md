# Connect Mnemo to your AI tools (MCP)

The Mnemo MCP server works with **any MCP client**. Below are copy-paste
configs for the popular ones — Claude Desktop, Cursor, VSCode (Cline / Continue /
GitHub Copilot), Windsurf, and Zed.

They all run the **same command**:

```
node <absolute-path>/mcp-server/index.mjs
```

with two environment variables:

| Env var | Value |
| --- | --- |
| `MNEMO_API_KEY` | Your key from Mnemo → **Settings → API Key** |
| `MNEMO_URL` | `http://localhost:3000` locally, or your deployed URL for use anywhere |

> 💡 **To use Mnemo across machines / "everywhere"**, set `MNEMO_URL` to your
> **deployed** Mnemo URL (e.g. `https://mnemo.yourdomain.com`). With
> `localhost` it only works on the machine running Mnemo.

Replace `D:\\Mnemo\\mcp-server\\index.mjs` below with your real absolute path
(use **double backslashes** on Windows).

---

## Claude Desktop

Config file:
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mnemo": {
      "command": "node",
      "args": ["D:\\Mnemo\\mcp-server\\index.mjs"],
      "env": {
        "MNEMO_API_KEY": "mnemo_sk_your_key",
        "MNEMO_URL": "http://localhost:3000"
      }
    }
  }
}
```

Fully quit and reopen Claude Desktop. Look for the tools icon near the composer.

---

## Cursor

Config file: `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per-project),
or **Settings → MCP → Add new server**.

```json
{
  "mcpServers": {
    "mnemo": {
      "command": "node",
      "args": ["D:\\Mnemo\\mcp-server\\index.mjs"],
      "env": {
        "MNEMO_API_KEY": "mnemo_sk_your_key",
        "MNEMO_URL": "http://localhost:3000"
      }
    }
  }
}
```

Now in Cursor's chat (Agent mode), ask it to search your Mnemo decisions.

---

## VSCode — this is your "coding session" setup 🧑‍💻

VSCode itself doesn't speak MCP directly; you use one of these extensions:

### Option 1 — GitHub Copilot (agent mode, built into VSCode)

Create `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "mnemo": {
      "type": "stdio",
      "command": "node",
      "args": ["D:\\Mnemo\\mcp-server\\index.mjs"],
      "env": {
        "MNEMO_API_KEY": "mnemo_sk_your_key",
        "MNEMO_URL": "http://localhost:3000"
      }
    }
  }
}
```

Open Copilot Chat → switch to **Agent** mode → the `mnemo` tools appear. Ask:
*"What did we decide about the auth flow?"* while you code.

### Option 2 — Cline (VSCode extension)

Cline → **MCP Servers** → **Configure MCP Servers** (opens
`cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "mnemo": {
      "command": "node",
      "args": ["D:\\Mnemo\\mcp-server\\index.mjs"],
      "env": {
        "MNEMO_API_KEY": "mnemo_sk_your_key",
        "MNEMO_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Option 3 — Continue (VSCode extension)

In `~/.continue/config.yaml`:

```yaml
mcpServers:
  - name: mnemo
    command: node
    args:
      - D:\\Mnemo\\mcp-server\\index.mjs
    env:
      MNEMO_API_KEY: mnemo_sk_your_key
      MNEMO_URL: http://localhost:3000
```

---

## Windsurf

**Settings → Cascade → MCP Servers → Add**, or edit
`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "mnemo": {
      "command": "node",
      "args": ["D:\\Mnemo\\mcp-server\\index.mjs"],
      "env": {
        "MNEMO_API_KEY": "mnemo_sk_your_key",
        "MNEMO_URL": "http://localhost:3000"
      }
    }
  }
}
```

---

## Zed

In `settings.json` under `context_servers`:

```json
{
  "context_servers": {
    "mnemo": {
      "command": {
        "path": "node",
        "args": ["D:\\Mnemo\\mcp-server\\index.mjs"],
        "env": {
          "MNEMO_API_KEY": "mnemo_sk_your_key",
          "MNEMO_URL": "http://localhost:3000"
        }
      }
    }
  }
}
```

---

## Verify it works (any client)

Standalone smoke test from the project root, in PowerShell:

```powershell
$env:MNEMO_API_KEY = "mnemo_sk_your_key"
'{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node mcp-server/index.mjs
```

You should see a JSON line listing the five tools:
`search_decisions`, `list_decisions`, `list_action_items`,
`list_open_questions`, `list_workspaces`.

See [README.md](./README.md) for troubleshooting.
