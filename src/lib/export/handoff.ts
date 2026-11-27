/**
 * A "handoff" is what another AI needs to carry on a conversation it never saw.
 * Pure data and text formatting, so the review screen can import it too.
 */

export const HANDOFF_SECTIONS = [
  { id: "goal", title: "What we're doing" },
  { id: "setup", title: "About me and my setup" },
  { id: "decision", title: "Decided (and why)" },
  { id: "rejected", title: "Ruled out — don't suggest these again" },
  { id: "state", title: "Where we got to" },
  { id: "next", title: "What's next and still open" },
] as const

export type HandoffSectionId = (typeof HANDOFF_SECTIONS)[number]["id"]

export interface HandoffPoint {
  id: string
  section: HandoffSectionId
  text: string
  /** Words from the conversation that back this point up. */
  quote: string
  /** True only when the quote was actually found in the conversation. */
  verified: boolean
}

export interface Handoff {
  points: HandoffPoint[]
  /** The final messages, word for word. */
  tail: string
  secretsRemoved: number
  /** Parts of a very long chat that were not read. */
  skippedParts: number
}

export function formatHandoff(input: { title: string; points: HandoffPoint[]; tail?: string }): string {
  const out = [
    `# Continuing a conversation: ${input.title.replace(/\s+/g, " ").trim()}`,
    "",
    "I was working on this with another AI. Below is what was established there. Treat it as the starting point, don't re-suggest anything ruled out, and ask me if something you need is missing.",
  ]
  for (const section of HANDOFF_SECTIONS) {
    const points = input.points.filter((p) => p.section === section.id && p.text.trim())
    if (points.length) out.push("", `## ${section.title}`, ...points.map((p) => `- ${p.text.trim()}`))
  }
  if (input.tail?.trim()) {
    out.push("", "## The last messages, word for word", "", input.tail.trim())
  }
  out.push("", "Reply with a two-line summary of where we are, then carry on.")
  return out.join("\n") + "\n"
}
