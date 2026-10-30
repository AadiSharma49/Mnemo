/**
 * Builds a Markdown decision log for a workspace — ready to paste into a GitHub
 * repo (docs/decisions.md), Notion, Confluence or an email.
 */

export interface LogDecision {
  title: string
  summary: string
  status: string
  confidence: number
  source: string
  createdAt: Date
  conversation: { title: string; occurredAt: Date | null } | null
}

export interface LogActionItem {
  title: string
  description: string
  status: string
  priority: string
}

export interface LogQuestion {
  question: string
  status: string
}

const day = (d: Date) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })

/** The date a decision was made: when the source chat happened, else when it was saved. */
const decidedOn = (d: LogDecision) => d.conversation?.occurredAt ?? d.createdAt

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim()

export function buildDecisionLog(input: {
  workspaceName: string
  decisions: LogDecision[]
  actionItems: LogActionItem[]
  questions: LogQuestion[]
  exportedAt?: Date
}): string {
  const { workspaceName, actionItems, questions } = input
  const exportedAt = input.exportedAt ?? new Date()
  const decisions = [...input.decisions].sort((a, b) => decidedOn(b).getTime() - decidedOn(a).getTime())

  const out: string[] = []
  out.push(`# ${oneLine(workspaceName)} — Decision Log`, "")
  out.push(
    `_Exported ${day(exportedAt)} from Mnemo · ${decisions.length} decision${decisions.length === 1 ? "" : "s"}` +
      ` · ${actionItems.length} action item${actionItems.length === 1 ? "" : "s"}` +
      ` · ${questions.length} open question${questions.length === 1 ? "" : "s"}_`,
    ""
  )

  out.push("## Decisions", "")
  if (decisions.length === 0) out.push("_No decisions recorded yet._", "")
  for (const d of decisions) {
    out.push(`### ${oneLine(d.title)}`, "")
    const meta = [
      `**Date:** ${day(decidedOn(d))}`,
      `**Status:** ${d.status}`,
      `**Confidence:** ${Math.round(d.confidence * 100)}%`,
    ]
    if (d.conversation) meta.push(`**From:** ${oneLine(d.conversation.title)}`)
    else meta.push(`**Source:** ${d.source}`)
    out.push(meta.join(" · "), "")
    if (d.summary.trim()) out.push(d.summary.trim(), "")
  }

  const openQuestions = questions.filter((q) => q.status === "open")
  if (openQuestions.length) {
    out.push("## Open questions", "")
    for (const q of openQuestions) out.push(`- ${oneLine(q.question)}`)
    out.push("")
  }

  const openItems = actionItems.filter((a) => a.status !== "done" && a.status !== "completed")
  if (openItems.length) {
    out.push("## Action items", "")
    for (const a of openItems) {
      const detail = a.description.trim() ? ` — ${oneLine(a.description)}` : ""
      out.push(`- [ ] **${oneLine(a.title)}** (${a.priority})${detail}`)
    }
    out.push("")
  }

  return out.join("\n")
}
