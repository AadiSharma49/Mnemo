"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Icons } from "@/lib/icons"
import { LLM_PROVIDERS, PROVIDER_PRESETS, type LlmProvider } from "@/lib/ai/presets"

interface Saved {
  configured: boolean
  provider: LlmProvider | null
  model: string | null
  baseUrl: string | null
  hasKey: boolean
  serverDefaultAvailable: boolean
}

type Notice = { kind: "ok" | "error"; text: string } | null

export function AiModelSettings() {
  const [saved, setSaved] = React.useState<Saved | null>(null)
  const [provider, setProvider] = React.useState<LlmProvider>("openai")
  const [model, setModel] = React.useState("")
  const [baseUrl, setBaseUrl] = React.useState("")
  const [apiKey, setApiKey] = React.useState("")
  const [busy, setBusy] = React.useState<"save" | "test" | "remove" | null>(null)
  const [notice, setNotice] = React.useState<Notice>(null)

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/user/ai-settings", { cache: "no-store" })
      if (!res.ok) throw new Error()
      const data: Saved = await res.json()
      setSaved(data)
      if (data.configured && data.provider) {
        setProvider(data.provider)
        setModel(data.model ?? "")
        setBaseUrl(data.baseUrl ?? "")
      }
    } catch {
      setNotice({ kind: "error", text: "Couldn't load your AI settings. Refresh and try again." })
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const preset = PROVIDER_PRESETS[provider]
  const keyIsSaved = !!saved?.hasKey && saved.provider === provider
  const payload = { provider, model: model.trim(), baseUrl: baseUrl.trim(), apiKey: apiKey.trim() }

  function pickProvider(next: LlmProvider) {
    setProvider(next)
    setModel("")
    setBaseUrl("")
    setApiKey("")
    setNotice(null)
  }

  async function call(kind: "save" | "test" | "remove") {
    setBusy(kind)
    setNotice(null)
    try {
      if (kind === "test") {
        const res = await fetch("/api/user/ai-settings/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        setNotice(
          data.ok
            ? { kind: "ok", text: `Works — ${data.model} answered in ${(data.latencyMs / 1000).toFixed(1)}s.` }
            : { kind: "error", text: data.error || "The test failed." }
        )
      } else if (kind === "save") {
        const res = await fetch("/api/user/ai-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || "Couldn't save.")
        setApiKey("")
        await load()
        setNotice({ kind: "ok", text: "Saved. Extraction, Memory Chat and conflict checks now use this model." })
      } else {
        const res = await fetch("/api/user/ai-settings", { method: "DELETE" })
        if (!res.ok) throw new Error("Couldn't remove your settings.")
        setModel("")
        setBaseUrl("")
        setApiKey("")
        await load()
        setNotice({ kind: "ok", text: "Removed. The server default model is used again." })
      }
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Something went wrong." })
    } finally {
      setBusy(null)
    }
  }

  const canSubmit = !busy && (!preset.needsKey || !!apiKey.trim() || keyIsSaved) && (!preset.needsBaseUrl || !!(baseUrl.trim() || preset.defaultBaseUrl)) && (provider !== "custom" || !!model.trim())

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">AI Model</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Use your own provider and key for extraction, Memory Chat and conflict checks. Your key is stored
            encrypted and never shown again.
          </p>
        </div>
        {saved && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {saved.configured
              ? `${PROVIDER_PRESETS[saved.provider!]?.label ?? saved.provider} · ${saved.model}`
              : saved.serverDefaultAvailable
                ? "Server default (Gemini)"
                : "Not connected"}
          </span>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="ai-provider">Provider</Label>
          <select
            id="ai-provider"
            value={provider}
            onChange={(e) => pickProvider(e.target.value as LlmProvider)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            {LLM_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_PRESETS[p].label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="ai-model">Model</Label>
          <Input
            id="ai-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={preset.defaultModel || "model name"}
            autoComplete="off"
          />
        </div>

        {preset.needsBaseUrl && (
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="ai-base">Base URL</Label>
            <Input
              id="ai-base"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={preset.defaultBaseUrl || "https://your-server.example.com/v1"}
              autoComplete="off"
            />
          </div>
        )}

        {(preset.needsKey || provider === "custom") && (
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="ai-key">API key{!preset.needsKey && " (optional)"}</Label>
            <Input
              id="ai-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={keyIsSaved ? "Saved — leave blank to keep it" : preset.keyHint}
              autoComplete="off"
            />
          </div>
        )}
      </div>

      {provider === "ollama" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Ollama runs on your own machine, so this works when Mnemo runs locally. For a hosted Mnemo, expose Ollama
          over a public https address first.
        </p>
      )}
      {provider !== "gemini" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Search by meaning still uses Mnemo&apos;s own embedding model; your model handles everything else.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={() => call("test")} disabled={!canSubmit}>
          {busy === "test" && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
          Test connection
        </Button>
        <Button type="button" onClick={() => call("save")} disabled={!canSubmit}>
          {busy === "save" && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
        {saved?.configured && (
          <Button type="button" variant="ghost" onClick={() => call("remove")} disabled={!!busy}>
            {busy === "remove" && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
            Use server default
          </Button>
        )}
      </div>

      {notice && (
        <p className={notice.kind === "ok" ? "mt-3 text-sm text-success" : "mt-3 text-sm text-error"}>{notice.text}</p>
      )}
    </div>
  )
}
