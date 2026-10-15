/**
 * Fetches a publicly shared AI chat link and turns it into a transcript.
 *
 * Supported: ChatGPT (chatgpt.com/share/…, chat.openai.com/share/…).
 * Other providers are not supported yet and are rejected with a clear message.
 *
 * ChatGPT share pages embed the conversation in the HTML as a React Router
 * "turbo-stream" payload (a flat array whose objects reference each other by
 * index). We decode that payload and read the linear message chain from it.
 */

export type ShareSource = "chatgpt"

export interface SharedConversation {
  title: string
  content: string
  messageCount: number
  source: ShareSource
}

export class ShareImportError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message)
  }
}

const CHATGPT_HOSTS = new Set(["chatgpt.com", "www.chatgpt.com", "chat.openai.com"])
const MAX_HTML_BYTES = 8 * 1024 * 1024

export function parseShareUrl(raw: string): { source: ShareSource; url: URL } {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new ShareImportError("That doesn't look like a valid URL.", 400)
  }
  if (url.protocol !== "https:") {
    throw new ShareImportError("Only https share links are supported.", 400)
  }
  if (CHATGPT_HOSTS.has(url.hostname) && /^\/share\/(e\/)?[0-9a-f-]{8,}\/?$/i.test(url.pathname)) {
    return { source: "chatgpt", url }
  }
  throw new ShareImportError(
    "Unsupported link. Paste a public ChatGPT share link (chatgpt.com/share/…).",
    400
  )
}

export async function fetchSharedConversation(raw: string): Promise<SharedConversation> {
  const { source, url } = parseShareUrl(raw)

  let res: Response
  try {
    res = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    })
  } catch {
    throw new ShareImportError("Couldn't reach the share link. Check the URL and try again.", 502)
  }

  if (res.status === 404) {
    throw new ShareImportError("This share link doesn't exist or was deleted.", 404)
  }
  if (!res.ok) {
    throw new ShareImportError(`The share page returned an error (HTTP ${res.status}).`, 502)
  }

  const html = await res.text()
  if (html.length > MAX_HTML_BYTES) {
    throw new ShareImportError("This shared conversation is too large to import.", 413)
  }

  const parsed = parseChatGPTShareHtml(html)
  if (!parsed || parsed.messageCount === 0) {
    throw new ShareImportError(
      "Couldn't read any messages from that page. The link may be private, or the page format changed.",
      422
    )
  }
  return { ...parsed, source }
}

/* ── ChatGPT share HTML → transcript ── */

export function parseChatGPTShareHtml(
  html: string
): { title: string; content: string; messageCount: number } | null {
  const re = /streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    let flat: unknown
    try {
      flat = JSON.parse(JSON.parse(match[1]))
    } catch {
      continue
    }
    if (!Array.isArray(flat)) continue
    const data = decodeTurboStream(flat)
    const found = findConversation(data)
    if (found) return found
  }
  return null
}

/** Decodes React Router's turbo-stream flat array into plain JS values. */
function decodeTurboStream(flat: unknown[]): unknown {
  const cache = new Map<number, unknown>()

  const decode = (idx: number): unknown => {
    if (idx < 0) {
      // -5 = undefined, -7 = null, -3 NaN, others are numeric specials
      if (idx === -7) return null
      return undefined
    }
    if (cache.has(idx)) return cache.get(idx)
    const v = flat[idx]
    if (v === null || typeof v !== "object") {
      cache.set(idx, v)
      return v
    }
    if (Array.isArray(v)) {
      // Tagged special values, e.g. ["D", ts]; keep the payload as-is.
      if (typeof v[0] === "string" && v.length <= 3 && /^[A-Z]$/.test(v[0])) {
        const out = v.length === 2 ? v[1] : v.slice(1)
        cache.set(idx, out)
        return out
      }
      const arr: unknown[] = []
      cache.set(idx, arr)
      for (const ref of v) arr.push(typeof ref === "number" ? decode(ref) : ref)
      return arr
    }
    const obj: Record<string, unknown> = {}
    cache.set(idx, obj)
    for (const [k, ref] of Object.entries(v as Record<string, unknown>)) {
      const m = /^_(\d+)$/.exec(k)
      if (!m) continue
      const key = decode(Number(m[1]))
      if (typeof key !== "string") continue
      obj[key] = typeof ref === "number" ? decode(ref) : ref
    }
    return obj
  }

  return decode(0)
}

interface ShareNode {
  message?: {
    author?: { role?: string }
    content?: { content_type?: string; parts?: unknown[]; text?: string }
    metadata?: { is_visually_hidden_from_conversation?: boolean }
  }
}

function findConversation(
  root: unknown
): { title: string; content: string; messageCount: number } | null {
  const seen = new Set<unknown>()
  const stack: unknown[] = [root]
  while (stack.length) {
    const cur = stack.pop()
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue
    seen.add(cur)

    const rec = cur as Record<string, unknown>
    if (Array.isArray(rec.linear_conversation) && rec.linear_conversation.length > 0) {
      return buildTranscript(
        typeof rec.title === "string" ? rec.title : "",
        rec.linear_conversation as ShareNode[]
      )
    }
    for (const child of Array.isArray(cur) ? cur : Object.values(rec)) stack.push(child)
  }
  return null
}

function buildTranscript(title: string, nodes: ShareNode[]) {
  const lines: string[] = []
  let count = 0
  for (const node of nodes) {
    const msg = node?.message
    if (!msg || msg.metadata?.is_visually_hidden_from_conversation) continue
    const role = msg.author?.role
    if (role !== "user" && role !== "assistant") continue

    const parts = msg.content?.parts
    let text = ""
    if (Array.isArray(parts)) {
      text = parts.filter((p): p is string => typeof p === "string").join("\n")
    } else if (typeof msg.content?.text === "string") {
      text = msg.content.text
    }
    text = text.trim()
    if (!text) continue

    lines.push(`${role === "user" ? "User" : "Assistant"}: ${text}`)
    count++
  }
  return {
    title: title.trim() || "Shared ChatGPT conversation",
    content: lines.join("\n\n"),
    messageCount: count,
  }
}
