import { complete, type LlmConfig } from "./llm"

export interface ExtractionResult {
  decisions: Array<{
    title: string
    summary: string
    status: "pending" | "accepted" | "rejected" | "deferred"
    confidence: number
  }>
  actionItems: Array<{
    title: string
    description: string
    priority: "low" | "medium" | "high"
  }>
  questions: Array<{
    question: string
  }>
}

/**
 * Turns a conversation into decisions, action items and questions using whichever
 * model the user has configured.
 */

const SYSTEM_PROMPT = `You are a decision intelligence extraction engine. Analyze conversations and extract:
1. Decisions — notable choices made, with rationale
2. Action Items — tasks someone agreed to do
3. Questions — unresolved questions raised

Rules:
- Return ONLY valid JSON, no markdown, no code fences, no explanation
- decisions.title must be specific and actionable
- decisions.summary should capture rationale, alternatives considered, and who decided
- decisions.status: "accepted" | "rejected" | "deferred" | "pending"
- decisions.confidence: 0.0 to 1.0 (how clearly was this decision made)
- actionItems.title: specific task
- actionItems.priority: "high" | "medium" | "low"
- questions.question: the exact question as asked

Return format:
{
  "decisions": [{ "title": "...", "summary": "...", "status": "accepted", "confidence": 0.9 }],
  "actionItems": [{ "title": "...", "description": "...", "priority": "medium" }],
  "questions": [{ "question": "..." }]
}

If nothing fits a category, return an empty array for that category.`

// Cap input so extraction stays fast and the JSON output can't be truncated.
const MAX_INPUT_CHARS = 24000

function normalize(obj: unknown): ExtractionResult {
  const r = (obj ?? {}) as ExtractionResult
  if (!Array.isArray(r.decisions)) r.decisions = []
  if (!Array.isArray(r.actionItems)) r.actionItems = []
  if (!Array.isArray(r.questions)) r.questions = []
  return r
}

function tryParse(s: string): ExtractionResult | null {
  try {
    return normalize(JSON.parse(s))
  } catch {
    return null
  }
}

/** Tolerates code fences or prose around the JSON — local models often add them. */
export function parseExtraction(raw: string): ExtractionResult {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
  const direct = tryParse(s)
  if (direct) return direct

  const start = s.indexOf("{")
  const end = s.lastIndexOf("}")
  if (start !== -1 && end > start) {
    const sliced = tryParse(s.slice(start, end + 1))
    if (sliced) return sliced
  }
  throw new Error("The AI returned a malformed response. Please try again.")
}

export async function extractWithConfig(cfg: LlmConfig, content: string): Promise<ExtractionResult> {
  const trimmed =
    content.length > MAX_INPUT_CHARS ? content.slice(0, MAX_INPUT_CHARS) + "\n\n[conversation truncated]" : content

  const raw = await complete(cfg, {
    system: SYSTEM_PROMPT,
    prompt: `Extract decisions, action items, and questions from this conversation:\n\n${trimmed}`,
    temperature: 0.1,
    maxTokens: 8192,
    json: true,
  })
  return parseExtraction(raw)
}
