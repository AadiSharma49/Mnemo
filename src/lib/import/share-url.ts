/**
 * Fetches a publicly shared AI chat link and turns it into a transcript.
 *
 * Providers (host allowlist — we never fetch arbitrary hosts, which keeps this
 * endpoint safe from SSRF):
 *   chatgpt     chatgpt.com/share/…, chat.openai.com/share/…   (dedicated parser)
 *   claude      claude.ai/share/…                              (snapshot API, then generic)
 *   gemini      share.gemini.google/…, gemini.google.com/share/… (headless browser render)
 *   perplexity  perplexity.ai/search/…, /page/…                (generic)
 *   grok        grok.com/share/…                               (generic)
 *   deepseek    chat.deepseek.com/share/…                      (generic)
 *   copilot     copilot.microsoft.com/shares/…                 (generic)
 *   poe         poe.com/s/…                                    (generic)
 *   mistral     chat.mistral.ai/chat/…                         (generic)
 *
 * "Generic" = look for embedded JSON that contains role/text message arrays,
 * and otherwise fall back to the page's visible text. Only ChatGPT is verified
 * against a live link; the others are best-effort and may need tuning per
 * provider as their share pages change.
 */

import { randomUUID } from "node:crypto"
import { BrowserUnavailableError, renderAndRun } from "@/lib/import/browser-render"

export type ShareSource =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "perplexity"
  | "grok"
  | "deepseek"
  | "copilot"
  | "poe"
  | "mistral"

/** An image captured from a shared chat; its id is already referenced in `content`. */
export interface SharedImage {
  id: string
  mimeType: string
  data: Buffer
}

/** Markdown reference used inside saved transcripts; rendered by the conversation page. */
export const imageMarkdown = (id: string) => `![image](/api/images/${id})`

export interface SharedConversation {
  title: string
  content: string
  messageCount: number
  /** When the chat happened (ms epoch), if the page exposes it. */
  occurredAt: number | null
  images: SharedImage[]
  source: ShareSource
}

export class ShareImportError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message)
  }
}

interface ProviderRule {
  source: ShareSource
  label: string
  hosts: string[]
  path: RegExp
}

const PROVIDERS: ProviderRule[] = [
  { source: "chatgpt", label: "ChatGPT", hosts: ["chatgpt.com", "www.chatgpt.com", "chat.openai.com"], path: /^\/share\/(e\/)?[0-9a-f-]{8,}\/?$/i },
  { source: "claude", label: "Claude", hosts: ["claude.ai"], path: /^\/share\/[0-9a-f-]{8,}\/?$/i },
  { source: "gemini", label: "Gemini", hosts: ["gemini.google.com", "g.co"], path: /^\/(app\/)?(gemini\/)?share\/[\w-]+\/?$/i },
  // Short links like https://share.gemini.google/KMIn83WrWEsd (redirect to gemini.google.com/share/…)
  { source: "gemini", label: "Gemini", hosts: ["share.gemini.google"], path: /^\/[\w-]{6,}\/?$/ },
  { source: "perplexity", label: "Perplexity", hosts: ["perplexity.ai", "www.perplexity.ai"], path: /^\/(search|page)\/[\w-]+\/?$/i },
  { source: "grok", label: "Grok", hosts: ["grok.com"], path: /^\/share\/[\w-]+\/?$/i },
  { source: "deepseek", label: "DeepSeek", hosts: ["chat.deepseek.com"], path: /^\/share\/[\w-]+\/?$/i },
  { source: "copilot", label: "Copilot", hosts: ["copilot.microsoft.com"], path: /^\/shares\/[\w-]+\/?$/i },
  { source: "poe", label: "Poe", hosts: ["poe.com"], path: /^\/s\/[\w-]+\/?$/i },
  { source: "mistral", label: "Le Chat", hosts: ["chat.mistral.ai"], path: /^\/chat\/[\w-]+\/?$/i },
]

export const SUPPORTED_PROVIDER_LABELS = PROVIDERS.map((p) => p.label)

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
const MAX_BYTES = 8 * 1024 * 1024
const MAX_REDIRECTS = 4

function matchProvider(url: URL): ProviderRule | null {
  return (
    PROVIDERS.find((p) => p.hosts.includes(url.hostname.toLowerCase()) && p.path.test(url.pathname)) ?? null
  )
}

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
  const rule = matchProvider(url)
  if (!rule) {
    throw new ShareImportError(
      `Unsupported link. Paste a public share link from: ${SUPPORTED_PROVIDER_LABELS.join(", ")}.`,
      400
    )
  }
  return { source: rule.source, url }
}

/** Fetches with manual redirects so every hop stays on an allowlisted host. */
async function safeFetch(start: URL, accept: string): Promise<Response> {
  let url = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response
    try {
      res = await fetch(url.toString(), {
        headers: { "User-Agent": BROWSER_UA, Accept: accept, "Accept-Language": "en-US,en;q=0.9" },
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      })
    } catch {
      throw new ShareImportError("Couldn't reach the share link. Check the URL and try again.", 502)
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location")
      if (!loc) throw new ShareImportError("The share link redirected somewhere unusable.", 502)
      const next = new URL(loc, url)
      const allowed = next.protocol === "https:" && PROVIDERS.some((p) => p.hosts.includes(next.hostname.toLowerCase()))
      if (!allowed) throw new ShareImportError("The share link redirected to an unsupported site.", 400)
      url = next
      continue
    }
    return res
  }
  throw new ShareImportError("The share link redirected too many times.", 502)
}

async function readText(res: Response): Promise<string> {
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new ShareImportError("This shared conversation is too large to import.", 413)
  return text
}

export async function fetchSharedConversation(raw: string): Promise<SharedConversation> {
  const { source, url } = parseShareUrl(raw)
  const label = PROVIDERS.find((p) => p.source === source)!.label

  let parsed: Parsed | null = null

  // Gemini renders shared chats in the browser, so a plain fetch gets an empty shell.
  if (source === "gemini") {
    try {
      parsed = await renderGeminiShare(url.toString())
    } catch (e) {
      if (e instanceof BrowserUnavailableError) {
        throw new ShareImportError(
          "Gemini shared chats need a browser to read. This server has none available — open the link and use the Mnemo extension to capture it instead.",
          501
        )
      }
      console.error("[share-url] gemini render failed:", e instanceof Error ? e.message : e)
      throw new ShareImportError(
        "Couldn't load that Gemini share page. The link may be private, deleted, or slow to respond — try again.",
        502
      )
    }
  }

  // Claude exposes a JSON snapshot endpoint; try it before scraping the page.
  if (source === "claude") {
    const id = url.pathname.split("/").filter(Boolean).pop()
    try {
      const api = await safeFetch(
        new URL(`https://claude.ai/api/chat_snapshots/${id}?rendering_mode=messages&render_all_tools=true`),
        "application/json"
      )
      if (api.ok) {
        const json = JSON.parse(await readText(api))
        const msgs = findMessages(json)
        if (msgs.length) {
          const title = typeof json?.snapshot_name === "string" ? json.snapshot_name : typeof json?.title === "string" ? json.title : ""
          parsed = toTranscript(title, msgs, label)
        }
      }
    } catch (e) {
      if (e instanceof ShareImportError && e.status === 413) throw e
      /* fall through to page scraping */
    }
  }

  if (!parsed && source !== "gemini") {
    const res = await safeFetch(url, "text/html,application/xhtml+xml")
    if (res.status === 404) throw new ShareImportError("This share link doesn't exist or was deleted.", 404)
    if (!res.ok) {
      throw new ShareImportError(`${label} blocked or rejected the request (HTTP ${res.status}).`, 502)
    }
    const html = await readText(res)
    parsed = source === "chatgpt" ? parseChatGPTShareHtml(html) : parseGenericHtml(html, label, TEXT_FALLBACK.has(source))
  }

  if (!parsed || parsed.content.trim().length < 20) {
    throw new ShareImportError(
      `Couldn't read any messages from that ${label} page. The link may be private or deleted, or ${label} may block automated access. You can paste the conversation manually instead.`,
      422
    )
  }
  return { ...parsed, occurredAt: parsed.occurredAt ?? null, images: parsed.images ?? [], source }
}

type Parsed = {
  title: string
  content: string
  messageCount: number
  occurredAt?: number | null
  images?: SharedImage[]
}
type Msg = { role: "user" | "assistant"; text: string }

function toTranscript(title: string, msgs: Msg[], label: string): Parsed {
  return {
    title: title.trim() || `Shared ${label} conversation`,
    content: msgs
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}:${m.text.startsWith("![") ? "\n" : " "}${m.text}`)
      .join("\n\n"),
    messageCount: msgs.length,
  }
}

/* ── ChatGPT share HTML → transcript ── */

export function parseChatGPTShareHtml(html: string): Parsed | null {
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
    const found = findChatGPTConversation(decodeTurboStream(flat))
    if (found) return found
  }
  return null
}

/** Decodes React Router's turbo-stream flat array into plain JS values. */
function decodeTurboStream(flat: unknown[]): unknown {
  const cache = new Map<number, unknown>()

  const decode = (idx: number): unknown => {
    if (idx < 0) return idx === -7 ? null : undefined
    if (cache.has(idx)) return cache.get(idx)
    const v = flat[idx]
    if (v === null || typeof v !== "object") {
      cache.set(idx, v)
      return v
    }
    if (Array.isArray(v)) {
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

/**
 * ChatGPT timestamps are epoch seconds. The share object's own create_time is
 * when the *link* was made, so prefer the earliest message time (when the chat
 * really started) and only fall back to the share times.
 */
function chatGPTTime(rec: Record<string, unknown>): number | null {
  const toMs = (v: unknown) => (typeof v === "number" && v > 0 ? Math.round(v * 1000) : null)
  const times = (rec.linear_conversation as { message?: { create_time?: unknown } }[])
    .map((n) => toMs(n?.message?.create_time))
    .filter((t): t is number => t !== null)
  if (times.length) return Math.min(...times)
  return toMs(rec.create_time) ?? toMs(rec.update_time)
}

/** ChatGPT image parts point at private files we can't fetch anonymously; we only note them. */
function isImagePart(p: unknown): boolean {
  return !!p && typeof p === "object" && (p as { content_type?: unknown }).content_type === "image_asset_pointer"
}

interface ShareNode {
  message?: {
    author?: { role?: string }
    content?: { parts?: unknown[]; text?: string }
    metadata?: { is_visually_hidden_from_conversation?: boolean }
  }
}

function findChatGPTConversation(root: unknown): Parsed | null {
  const seen = new Set<unknown>()
  const stack: unknown[] = [root]
  while (stack.length) {
    const cur = stack.pop()
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue
    seen.add(cur)

    const rec = cur as Record<string, unknown>
    if (Array.isArray(rec.linear_conversation) && rec.linear_conversation.length > 0) {
      const msgs: Msg[] = []
      for (const node of rec.linear_conversation as ShareNode[]) {
        const msg = node?.message
        if (!msg || msg.metadata?.is_visually_hidden_from_conversation) continue
        const role = msg.author?.role
        if (role !== "user" && role !== "assistant") continue
        const parts = msg.content?.parts
        const text = (
          Array.isArray(parts)
            ? parts
                .map((p) => (typeof p === "string" ? p : isImagePart(p) ? "[image]" : ""))
                .filter(Boolean)
                .join("\n")
            : (msg.content?.text ?? "")
        ).trim()
        if (text) msgs.push({ role, text })
      }
      const t = toTranscript(typeof rec.title === "string" ? rec.title : "", msgs, "ChatGPT")
      return { ...t, occurredAt: chatGPTTime(rec) }
    }
    for (const child of Array.isArray(cur) ? cur : Object.values(rec)) stack.push(child)
  }
  return null
}

/* ── Generic providers: embedded JSON messages, then visible text ── */

/** Providers whose share pages are server-rendered, so visible text is real content.
 *  Others (Claude, Gemini, …) ship an empty JS shell — scraping text would save junk. */
const TEXT_FALLBACK = new Set<ShareSource>(["perplexity"])

function parseGenericHtml(html: string, label: string, allowText: boolean): Parsed | null {
  const title = extractTitle(html)

  // 1. Embedded JSON blobs (Next.js data, JSON-LD, app state) that hold messages.
  const blobs = [...html.matchAll(/<script[^>]*(?:type="application\/(?:ld\+)?json"|id="__NEXT_DATA__")[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const b of blobs) {
    try {
      const msgs = findMessages(JSON.parse(b[1]))
      if (msgs.length >= 2) return toTranscript(title, msgs, label)
    } catch {
      /* not JSON */
    }
  }

  // 2. Visible page text (works for server-rendered pages such as Perplexity).
  if (!allowText) return null
  const text = visibleText(html)
  if (text.length < 300) return null
  return { title: title || `Shared ${label} conversation`, content: text, messageCount: 1 }
}

const USER_ROLES = new Set(["user", "human", "you", "prompt", "query"])
const BOT_ROLES = new Set(["assistant", "model", "ai", "bot", "claude", "gemini", "response", "answer"])

/** Walks any JSON and returns the largest array that looks like a chat. */
function findMessages(root: unknown): Msg[] {
  let best: Msg[] = []
  const seen = new Set<unknown>()
  const stack: unknown[] = [root]
  while (stack.length) {
    const cur = stack.pop()
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue
    seen.add(cur)
    if (Array.isArray(cur)) {
      const msgs = cur.map(asMessage).filter((m): m is Msg => m !== null)
      if (msgs.length >= 2 && msgs.length >= cur.length / 2 && msgs.length > best.length) best = msgs
    }
    for (const child of Array.isArray(cur) ? cur : Object.values(cur)) stack.push(child)
  }
  return best
}

function asMessage(node: unknown): Msg | null {
  if (!node || typeof node !== "object") return null
  const o = node as Record<string, unknown>
  const authorRole = (o.author as Record<string, unknown> | undefined)?.role
  const rawRole = [o.role, o.sender, authorRole, o.author, o.speaker].find((v) => typeof v === "string") as
    | string
    | undefined
  if (!rawRole) return null
  const r = rawRole.toLowerCase()
  const role = USER_ROLES.has(r) ? "user" : BOT_ROLES.has(r) ? "assistant" : null
  if (!role) return null
  const text = extractText(o.text ?? o.content ?? o.parts ?? o.message ?? o.markdown ?? o.answer).trim()
  return text ? { role, text } : null
}

function extractText(v: unknown): string {
  if (typeof v === "string") return v
  if (Array.isArray(v)) return v.map(extractText).filter(Boolean).join("\n")
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>
    if (typeof o.text === "string") return o.text
    if (o.parts) return extractText(o.parts)
    if (o.content) return extractText(o.content)
  }
  return ""
}

function extractTitle(html: string): string {
  const og = /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i.exec(html)?.[1]
  const t = og ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ""
  return decodeEntities(t).replace(/\s+/g, " ").trim().slice(0, 100)
}

function visibleText(html: string): string {
  const body = html
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|button)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
  return decodeEntities(body)
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 200_000)
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
}

/* ── Gemini: render in a headless browser, read the share viewer's DOM ── */

const GEMINI_HOSTS = new Set(["gemini.google.com", "share.gemini.google", "g.co"])

// Runs inside the page. A string (not a function) keeps bundler helpers out of it.
const GEMINI_EXTRACT_SCRIPT = `(() => {
  const turns = [];
  document.querySelectorAll("share-viewer user-query, share-viewer response-container").forEach((el) => {
    const isUser = el.tagName.toLowerCase() === "user-query";
    const text = (el.innerText || el.textContent || "").trim();
    const images = [];
    el.querySelectorAll("img").forEach((img) => {
      const src = img.currentSrc || img.src || "";
      const label = ((img.className || "") + " " + (img.alt || "")).toLowerCase();
      if (src.startsWith("https://") && !/avatar|icon|favicon|logo|sparkle/.test(label) && !images.includes(src)) images.push(src);
    });
    if (text || images.length) turns.push({ role: isUser ? "user" : "assistant", text, images });
  });
  const title = (document.querySelector("share-viewer h1")?.textContent || "").trim();
  const created = document.querySelector(".publish-time-mode")?.textContent || "";
  return { turns, title, created };
})()`

async function renderGeminiShare(url: string): Promise<Parsed | null> {
  const page = await renderAndRun<{
    turns: { role: "user" | "assistant"; text: string; images: string[] }[]
    title: string
    created: string
  }>(
    url,
    {
      readySelector: "share-viewer user-query",
      isAllowedFinalUrl: (u) => u.protocol === "https:" && GEMINI_HOSTS.has(u.hostname),
    },
    GEMINI_EXTRACT_SCRIPT
  )

  if (!page.turns.length) return null

  // "Created with Auto July 17, 2025 at 10:42 AM" → the date the chat was made.
  const m = /([A-Z][a-z]+ \d{1,2}, \d{4}) at (\d{1,2}:\d{2} [AP]M)/.exec(page.created)
  const ts = m ? Date.parse(`${m[1]} ${m[2]}`) : NaN

  const images: SharedImage[] = []
  const msgs: Msg[] = []
  for (const turn of page.turns) {
    const parts = turn.text ? [turn.text] : []
    for (const src of turn.images) {
      const img = images.length < MAX_IMAGES ? await downloadImage(src, images) : null
      parts.push(img ? imageMarkdown(img.id) : "[image unavailable]")
    }
    msgs.push({ role: turn.role, text: parts.join("\n") })
  }

  const t = toTranscript(page.title, msgs, "Gemini")
  return { ...t, occurredAt: Number.isFinite(ts) ? ts : null, images }
}

const MAX_IMAGES = 24
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])

/** Downloads one chat image (Google-hosted only) and records it; null if it can't be fetched safely. */
async function downloadImage(src: string, saved: SharedImage[]): Promise<SharedImage | null> {
  try {
    const url = new URL(src)
    if (url.protocol !== "https:" || !url.hostname.endsWith(".googleusercontent.com")) return null
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    })
    if (!res.ok || !new URL(res.url).hostname.endsWith(".googleusercontent.com")) return null
    const mimeType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
    if (!IMAGE_TYPES.has(mimeType)) return null
    const data = Buffer.from(await res.arrayBuffer())
    const total = saved.reduce((n, i) => n + i.data.length, 0)
    if (data.length === 0 || data.length > MAX_IMAGE_BYTES || total + data.length > MAX_TOTAL_IMAGE_BYTES) return null
    const image = { id: randomUUID(), mimeType, data }
    saved.push(image)
    return image
  } catch {
    return null
  }
}
