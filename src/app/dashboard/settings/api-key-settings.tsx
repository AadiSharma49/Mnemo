"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Icons } from "@/lib/icons"
import { cn } from "@/lib/utils"

type Status = "loading" | "no-key" | "has-key" | "error"

/** Copy-ready MCP config for Claude Desktop / Cursor. */
function McpSnippet({ apiKey }: { apiKey: string }) {
  const [copied, setCopied] = React.useState(false)
  const config = JSON.stringify(
    {
      mcpServers: {
        mnemo: {
          command: "node",
          args: ["/absolute/path/to/Mnemo/mcp-server/index.mjs"],
          env: { MNEMO_API_KEY: apiKey, MNEMO_URL: typeof window !== "undefined" ? window.location.origin : "" },
        },
      },
    },
    null,
    2
  )

  return (
    <div className="mt-6 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Use with Claude Desktop or Cursor (MCP)
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            navigator.clipboard.writeText(config).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })
          }
        >
          {copied ? <Icons.check className="mr-1.5 h-3.5 w-3.5" /> : <Icons.copy className="mr-1.5 h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy config"}
        </Button>
      </div>
      <pre className="mt-3 max-h-56 overflow-auto rounded-md border bg-background p-3 text-xs">{config}</pre>
      <ol className="mt-3 space-y-1 text-sm text-muted-foreground">
        <li>1. Replace the path with where this repo&apos;s <code>mcp-server/index.mjs</code> lives on your machine.</li>
        <li>2. Paste into <code>claude_desktop_config.json</code> (or Cursor → Settings → MCP), then restart the app.</li>
        <li>3. Ask: <em>&quot;Search my Mnemo decisions for …&quot;</em></li>
      </ol>
    </div>
  )
}

export function ApiKeySettings() {
  const [status, setStatus] = React.useState<Status>("loading")
  const [newKey, setNewKey] = React.useState<string | null>(null)
  const [working, setWorking] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/user/api-key")
        if (!res.ok) throw new Error("failed")
        const data = await res.json()
        if (!cancelled) setStatus(data.hasKey ? "has-key" : "no-key")
      } catch {
        if (!cancelled) setStatus("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const generate = React.useCallback(async () => {
    setWorking(true)
    setNewKey(null)
    try {
      const res = await fetch("/api/user/api-key", { method: "POST" })
      if (!res.ok) throw new Error("failed")
      const data = await res.json()
      setNewKey(data.key)
      setStatus("has-key")
    } catch {
      setStatus("error")
    } finally {
      setWorking(false)
    }
  }, [])

  const copy = React.useCallback(() => {
    if (!newKey) return
    navigator.clipboard.writeText(newKey).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [newKey])

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icons.plug className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">API Key — Extension &amp; MCP</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              One key connects the browser extension (capture) and MCP clients like Claude Desktop and Cursor (search your decisions).
            </p>
          </div>
        </div>
        {status === "has-key" && !newKey && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
            <Icons.checkCircle className="h-3.5 w-3.5" />
            Active
          </span>
        )}
      </div>

      <div className="mt-5">
        {status === "loading" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icons.spinner className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}

        {status === "error" && (
          <p className="text-sm text-error">Couldn&apos;t load your API key status. Refresh and try again.</p>
        )}

        {/* Freshly generated key — shown once */}
        {newKey && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
              <Icons.alertCircle className="h-4 w-4 shrink-0" />
              Copy this key now — it won&apos;t be shown again.
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border bg-muted px-3 py-2.5 font-mono text-sm">
                {newKey}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copy}
                title="Copy key"
                className={cn("shrink-0", copied && "border-success/40 text-success")}
              >
                {copied ? <Icons.check className="h-4 w-4" /> : <Icons.copy className="h-4 w-4" />}
              </Button>
            </div>
            <McpSnippet apiKey={newKey} />
          </div>
        )}

        {/* No key yet */}
        {status === "no-key" && !newKey && (
          <Button onClick={generate} disabled={working}>
            {working ? (
              <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Icons.plus className="mr-2 h-4 w-4" />
            )}
            Generate API Key
          </Button>
        )}

        {/* Key exists (not just generated) */}
        {status === "has-key" && !newKey && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your API key is active. For security the key is hidden — if you&apos;ve lost it,
              regenerate a new one (this invalidates the old key).
            </p>
            <Button variant="outline" onClick={generate} disabled={working}>
              {working ? (
                <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Icons.zap className="mr-2 h-4 w-4" />
              )}
              Regenerate Key
            </Button>
          </div>
        )}
      </div>

      {/* Connect steps */}
      <div className="mt-6 rounded-lg border border-dashed bg-muted/30 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Connect the extension
        </p>
        <ol className="space-y-1.5 text-sm text-muted-foreground">
          <li>1. Click the Mnemo icon in your browser toolbar</li>
          <li>
            2. Set the Mnemo URL and paste your API key, then click{" "}
            <span className="font-medium text-foreground">Connect</span>
          </li>
          <li>3. Open a chat on Claude / ChatGPT / Gemini and click Capture</li>
        </ol>
      </div>
    </div>
  )
}
