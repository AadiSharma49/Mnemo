"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Icons } from "@/lib/icons"
import { formatHandoff, HANDOFF_SECTIONS, type Handoff, type HandoffPoint } from "@/lib/export/handoff"

/**
 * "Continue in another AI": prepares a handoff, lets the user check every point
 * against its source quote, then copies only what they approved.
 */
export function HandoffPanel({ conversationId, title }: { conversationId: string; title: string }) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [handoff, setHandoff] = React.useState<Handoff | null>(null)
  const [model, setModel] = React.useState("")
  const [points, setPoints] = React.useState<HandoffPoint[]>([])
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const [withTail, setWithTail] = React.useState(true)
  const [copied, setCopied] = React.useState(false)

  async function prepare() {
    setBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/conversations/${conversationId}/handoff`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Couldn't prepare the handoff. Please try again.")
      const next: Handoff = data.handoff
      setHandoff(next)
      setModel(data.model)
      setPoints(next.points)
      // Points whose quote couldn't be found start unticked.
      setPicked(new Set(next.points.filter((p) => p.verified).map((p) => p.id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't prepare the handoff.")
    } finally {
      setBusy(false)
    }
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  async function copy() {
    const text = formatHandoff({
      title,
      points: points.filter((p) => picked.has(p.id)),
      tail: withTail ? handoff?.tail : undefined,
    })
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setError("Your browser blocked copying. Allow clipboard access and try again.")
    }
  }

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Continue in another AI</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Turn this chat into a briefing you can paste into Claude, ChatGPT or Gemini. You check it first.
          </p>
        </div>
        <Button size="sm" variant={handoff ? "outline" : "default"} onClick={prepare} disabled={busy}>
          {busy ? "Reading the chat…" : handoff ? "Prepare again" : "Prepare handoff"}
        </Button>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}

      {handoff && (
        <div className="mt-5 space-y-5">
          <p className="text-xs text-muted-foreground">
            Written by {model}.
            {handoff.secretsRemoved > 0 && ` ${handoff.secretsRemoved} item(s) that looked like secrets were removed.`}
            {handoff.skippedParts > 0 && ` This chat is very long: ${handoff.skippedParts} middle part(s) were not read.`}
          </p>

          {points.length === 0 && <p className="text-sm text-muted-foreground">Nothing worth handing over was found.</p>}

          {HANDOFF_SECTIONS.map((section) => {
            const inSection = points.filter((p) => p.section === section.id)
            if (!inSection.length) return null
            return (
              <div key={section.id} className="space-y-2">
                <h3 className="text-sm font-semibold">{section.title}</h3>
                {inSection.map((point) => (
                  <div key={point.id} className="flex gap-3 rounded-lg border p-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0"
                      checked={picked.has(point.id)}
                      onChange={() => toggle(point.id)}
                      aria-label={`Include: ${point.text}`}
                    />
                    <div className="min-w-0 flex-1">
                      <textarea
                        className="field-sizing-content w-full resize-none bg-transparent text-sm outline-none focus:underline"
                        value={point.text}
                        onChange={(e) =>
                          setPoints((all) => all.map((p) => (p.id === point.id ? { ...p, text: e.target.value } : p)))
                        }
                        aria-label="Edit point"
                      />
                      <p className="mt-1 text-xs text-muted-foreground wrap-break-word">
                        {point.verified ? `From the chat: “${point.quote}”` : "No matching quote in the chat. Check this before including it."}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={withTail} onChange={(e) => setWithTail(e.target.checked)} />
            Include the last messages word for word
          </label>

          <Button size="sm" onClick={copy} disabled={picked.size === 0 && !withTail}>
            {copied ? <Icons.check className="mr-1 h-4 w-4" /> : <Icons.copy className="mr-1 h-4 w-4" />}
            {copied ? "Copied — paste it into a new chat" : "Copy handoff"}
          </Button>
        </div>
      )}
    </div>
  )
}
