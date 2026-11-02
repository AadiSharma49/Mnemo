"use client"

import * as React from "react"
import { Icons } from "@/lib/icons"

/**
 * Copies a ready-to-paste "what we've already decided" brief for starting a new
 * AI chat, so the model doesn't re-suggest things the team ruled out.
 */
export function CopyBriefButton({ workspaceId }: { workspaceId: string }) {
  const [state, setState] = React.useState<"idle" | "busy" | "copied" | "error">("idle")

  async function copy() {
    setState("busy")
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/brief`, { cache: "no-store" })
      if (!res.ok) throw new Error()
      await navigator.clipboard.writeText(await res.text())
      setState("copied")
    } catch {
      setState("error")
    }
    setTimeout(() => setState("idle"), 2500)
  }

  return (
    <button
      type="button"
      onClick={copy}
      disabled={state === "busy"}
      title="Copy what you've already decided, to paste at the start of a new AI chat"
      className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-60"
    >
      {state === "copied" ? <Icons.check className="h-4 w-4" /> : <Icons.copy className="h-4 w-4" />}
      <span>{state === "copied" ? "Copied" : state === "error" ? "Couldn't copy" : "Copy AI brief"}</span>
    </button>
  )
}
