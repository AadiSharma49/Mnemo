import { complete, type LlmConfig } from "./llm"

/**
 * Conflict judge.
 *
 * pgvector cheaply narrows the field to decision pairs that are about the same
 * thing (high cosine similarity). But similarity ≠ contradiction — two similar
 * decisions can perfectly agree. So we hand the shortlisted pairs to the user's model and
 * ask it which ones genuinely CONTRADICT each other, with a reason + severity.
 */

export type Severity = "high" | "medium" | "low"

export interface ConflictPairInput {
  aTitle: string
  aSummary: string
  bTitle: string
  bSummary: string
}

export interface ConflictJudgement {
  index: number
  conflicts: boolean
  reason: string
  severity: Severity
}

const PROMPT = `You compare pairs of decisions a person or team made and decide whether the two decisions CONTRADICT each other.

A contradiction means the two decisions cannot both hold at the same time — for example: choosing two different tools/approaches for the SAME job, reversing an earlier decision, or committing to incompatible directions.

Important:
- Being about the same TOPIC is NOT a contradiction on its own.
- Decisions that agree, complement, or build on each other are NOT contradictions.
- Only flag a genuine conflict.

For each numbered pair, return an object:
{ "index": <number>, "conflicts": <boolean>, "reason": "<one sentence explaining the conflict, empty string if none>", "severity": "high" | "medium" | "low" }

severity: "high" = direct opposite or a reversal; "medium" = likely tension; "low" = minor or possible overlap.

Return ONLY a JSON array with one object per pair, in order. No prose, no markdown.`

function normalizeSeverity(s: unknown): Severity {
  return s === "high" || s === "medium" || s === "low" ? s : "medium"
}

function parseJudgements(raw: string): ConflictJudgement[] {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()

  const attempt = (text: string): unknown => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  let parsed = attempt(s)
  if (!Array.isArray(parsed)) {
    // Fallback: slice out the outermost [ ... ]
    const start = s.indexOf("[")
    const end = s.lastIndexOf("]")
    if (start !== -1 && end > start) parsed = attempt(s.slice(start, end + 1))
  }
  if (!Array.isArray(parsed)) return []

  return parsed
    .map((item, i): ConflictJudgement | null => {
      if (!item || typeof item !== "object") return null
      const o = item as Record<string, unknown>
      return {
        index: typeof o.index === "number" ? o.index : i,
        conflicts: o.conflicts === true,
        reason: typeof o.reason === "string" ? o.reason : "",
        severity: normalizeSeverity(o.severity),
      }
    })
    .filter((x): x is ConflictJudgement => x !== null)
}

export async function judgeConflicts(pairs: ConflictPairInput[], cfg: LlmConfig): Promise<ConflictJudgement[]> {
  if (pairs.length === 0) return []

  const list = pairs
    .map((p, i) => `Pair ${i}:\n  A. ${p.aTitle} — ${p.aSummary}\n  B. ${p.bTitle} — ${p.bSummary}`)
    .join("\n\n")

  const raw = await complete(cfg, {
    prompt: PROMPT + "\n\n" + list,
    temperature: 0,
    maxTokens: 4096,
    json: true,
  })
  return parseJudgements(raw)
}
