/**
 * Builds a compact "context brief" — the decisions, rejected options and open
 * questions a person or team has already settled — written to be pasted at the
 * start of a new AI chat (or returned by the MCP `get_project_context` tool), so
 * the model stops re-suggesting things you already ruled out.
 */

export interface BriefDecision {
  title: string
  summary: string
  status: string
  confidence: number
  createdAt: Date
  conversation?: { occurredAt: Date | null } | null
}

export interface BriefQuestion {
  question: string
  status: string
}

export interface BriefActionItem {
  title: string
  status: string
  priority: string
}

const STOP = new Set(["the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "we", "our", "is", "it", "how", "what", "why", "do", "did", "should", "with", "about", "use", "which", "can", "does", "are", "be", "i", "my", "this", "that"])

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w))

const decidedOn = (d: BriefDecision) => d.conversation?.occurredAt ?? d.createdAt
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim()

/** Higher = more relevant to the topic. 0 when there's no topic or no overlap. */
function relevance(d: BriefDecision, topic: string[]): number {
  if (topic.length === 0) return 0
  const text = new Set(words(`${d.title} ${d.summary}`))
  return topic.reduce((n, w) => n + (text.has(w) ? 1 : 0), 0)
}

export function buildContextBrief(input: {
  workspaceName: string
  decisions: BriefDecision[]
  questions: BriefQuestion[]
  actionItems: BriefActionItem[]
  /** Optional focus: relevant decisions are listed first. */
  topic?: string
  maxChars?: number
}): string {
  const maxChars = input.maxChars ?? 6000
  const topic = words(input.topic ?? "")

  // Relevant first, then newest first.
  const ranked = [...input.decisions].sort(
    (a, b) => relevance(b, topic) - relevance(a, topic) || decidedOn(b).getTime() - decidedOn(a).getTime()
  )
  const settled = ranked.filter((d) => d.status === "accepted")
  const rejected = ranked.filter((d) => d.status === "rejected")
  const open = input.questions.filter((q) => q.status === "open")
  const todo = input.actionItems.filter((a) => a.status !== "done" && a.status !== "completed")

  const sections: string[][] = []

  sections.push([
    `# Project context: ${oneLine(input.workspaceName)}`,
    "",
    "Decisions already made in earlier conversations. Treat them as settled unless I say otherwise, and do not re-suggest anything under 'Ruled out'.",
  ])

  if (settled.length) {
    sections.push([
      "",
      "## Decided",
      ...settled.map((d) => `- ${oneLine(d.title)} (${ymd(decidedOn(d))})${d.summary.trim() ? ` — ${oneLine(d.summary)}` : ""}`),
    ])
  }
  if (rejected.length) {
    sections.push([
      "",
      "## Ruled out — don't suggest these again",
      ...rejected.map((d) => `- ${oneLine(d.title)}${d.summary.trim() ? ` — ${oneLine(d.summary)}` : ""}`),
    ])
  }
  if (open.length) {
    sections.push(["", "## Still open", ...open.map((q) => `- ${oneLine(q.question)}`)])
  }
  if (todo.length) {
    sections.push(["", "## In progress", ...todo.slice(0, 15).map((a) => `- ${oneLine(a.title)} (${a.priority})`)])
  }
  if (sections.length === 1) {
    sections.push(["", "_Nothing has been captured in this workspace yet._"])
  }

  // Keep whole sections while they fit; trim the line that overflows.
  const out: string[] = []
  let size = 0
  for (const section of sections) {
    for (const line of section) {
      if (size + line.length + 1 > maxChars) {
        out.push("- …(more in Mnemo)")
        return out.join("\n") + "\n"
      }
      out.push(line)
      size += line.length + 1
    }
  }
  return out.join("\n") + "\n"
}
