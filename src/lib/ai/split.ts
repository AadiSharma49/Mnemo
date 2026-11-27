import { complete, type LlmConfig } from "./llm"

/** Long chats are read in parts so nothing at the end is silently ignored. */

const PART_CHARS = 24000
const MAX_PARTS = 8

/** Splits on line breaks so a message is rarely cut mid-sentence. */
export function splitParts(text: string, size = PART_CHARS): string[] {
  const parts: string[] = []
  let rest = text
  while (rest.length > size) {
    const cut = rest.lastIndexOf("\n", size)
    const at = cut > size / 2 ? cut : size
    parts.push(rest.slice(0, at))
    rest = rest.slice(at)
  }
  parts.push(rest)
  return parts
}

/** The parts to actually read: the opening (goal and setup) plus the most recent ones. */
export function pickParts(text: string): { parts: string[]; skipped: number } {
  const all = splitParts(text)
  const parts = all.length > MAX_PARTS ? [all[0], ...all.slice(-(MAX_PARTS - 1))] : all
  return { parts, skipped: all.length - parts.length }
}

/**
 * Later parts can overturn earlier ones, so the model picks what still holds.
 * Everything is kept if its answer can't be used.
 */
export async function dropStale<T>(cfg: LlmConfig, items: T[], describe: (item: T) => string): Promise<T[]> {
  if (items.length < 2) return items
  const raw = await complete(cfg, {
    system:
      'These notes were collected in order from consecutive parts of one conversation. Remove duplicates, and remove earlier notes that a later one overturns, replaces or completes. Return ONLY JSON: {"keep":[numbers of the notes to keep]}',
    prompt: items.map((item, i) => `${i}. ${describe(item)}`).join("\n"),
    temperature: 0,
    maxTokens: 4096,
    json: true,
  })
  try {
    const keep: unknown = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)).keep
    if (!Array.isArray(keep)) return items
    const kept = items.filter((_, i) => keep.includes(i))
    return kept.length ? kept : items
  } catch {
    return items
  }
}
