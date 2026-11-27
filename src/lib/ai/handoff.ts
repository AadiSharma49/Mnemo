import { complete, type LlmConfig } from "./llm"
import { HANDOFF_SECTIONS, type Handoff, type HandoffPoint, type HandoffSectionId } from "@/lib/export/handoff"
import { redactSecrets } from "@/lib/redact"
import { dropStale, pickParts } from "./split"
import { stripImageLinks } from "@/lib/import/image-markdown"

/**
 * Reads a whole conversation (in parts when it's long) and writes the handoff.
 * Every point has to quote the conversation, and the quote is checked here in
 * code rather than trusted from the model.
 */

const TAIL_CHARS = 3000

const SYSTEM_PROMPT = `You prepare a handoff so a different AI can continue a conversation it has never seen.
Capture what it needs, not a recap of who said what.

Sections:
- goal: what the user is trying to achieve
- setup: facts about the user, their project, tools, constraints and preferences
- decision: choices that were settled, with the reason
- rejected: options that were ruled out, with the reason. An AI suggestion the user did not accept is NOT a decision.
- state: how far things got; keep exact names, numbers, commands and file names
- next: next steps and unresolved questions

Rules:
- Each point is one self-contained sentence or two, understandable without the conversation.
- "quote" is copied character for character from the conversation, under 200 characters, and supports the point.
- If something changed during the conversation, report only the final position.
- Do not invent anything. Fewer accurate points are better than many weak ones.
- Return ONLY JSON: {"points":[{"section":"decision","text":"...","quote":"..."}]}`

type RawPoint = { section: HandoffSectionId; text: string; quote: string }

function parseJson(raw: string): Record<string, unknown> {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new Error("The AI returned a malformed response. Please try again.")
  }
}

export function parsePoints(raw: string): RawPoint[] {
  const list = parseJson(raw).points
  if (!Array.isArray(list)) throw new Error("The AI returned a malformed response. Please try again.")
  const ids = new Set<string>(HANDOFF_SECTIONS.map((s) => s.id))
  return list
    .filter((p): p is RawPoint => !!p && ids.has(p.section) && typeof p.text === "string" && !!p.text.trim())
    .map((p) => ({ section: p.section, text: p.text.trim(), quote: typeof p.quote === "string" ? p.quote.trim() : "" }))
}

/** Ignores differences models introduce when copying: markdown marks, curly quotes, spacing. */
const normalize = (s: string) =>
  s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim()

export function isQuoted(quote: string, transcript: string): boolean {
  const q = normalize(quote)
  return q.length >= 8 && normalize(transcript).includes(q)
}

export function lastMessages(text: string, size = TAIL_CHARS): string {
  const trimmed = text.trim()
  if (trimmed.length <= size) return trimmed
  const slice = trimmed.slice(-size)
  const firstBreak = slice.indexOf("\n")
  return "…\n" + (firstBreak >= 0 && firstBreak < size / 2 ? slice.slice(firstBreak + 1) : slice)
}

export async function buildHandoff(cfg: LlmConfig, content: string): Promise<Handoff> {
  const { text, count } = redactSecrets(stripImageLinks(content))
  const { parts, skipped } = pickParts(text)

  let found: RawPoint[] = []
  for (const [i, part] of parts.entries()) {
    const raw = await complete(cfg, {
      system: SYSTEM_PROMPT,
      prompt: `Conversation${parts.length > 1 ? ` (part ${i + 1} of ${parts.length})` : ""}:\n\n${part}`,
      temperature: 0.1,
      maxTokens: 8192,
      json: true,
    })
    found = found.concat(parsePoints(raw))
  }
  if (parts.length > 1 && found.length) found = await dropStale(cfg, found, (p) => `[${p.section}] ${p.text}`)

  const points: HandoffPoint[] = found.map((p, i) => ({ ...p, id: `p${i}`, verified: isQuoted(p.quote, text) }))
  return { points, tail: lastMessages(text), secretsRemoved: count, skippedParts: skipped }
}
