import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { fetchWithRetry, isRetryableStatus } from "./fetch-retry"
import { PROVIDER_PRESETS, type LlmProvider } from "./presets"

export { PROVIDER_PRESETS, LLM_PROVIDERS, type LlmProvider, type ProviderPreset } from "./presets"

/**
 * One interface for every model provider. Callers ask for a text completion;
 * this file knows how each provider's HTTP API wants to be spoken to.
 *
 *   gemini      Google Generative Language API
 *   anthropic   Anthropic Messages API
 *   openai      OpenAI Chat Completions
 *   openrouter  OpenAI-compatible, many models behind one key
 *   ollama      OpenAI-compatible, models running on your own machine
 *   custom      any other OpenAI-compatible server (LM Studio, vLLM, Groq, Together…)
 */

export interface LlmConfig {
  provider: LlmProvider
  model: string
  apiKey?: string
  /** Required for ollama/custom; optional override for the others. */
  baseUrl?: string
}

export interface CompleteOptions {
  system?: string
  prompt: string
  temperature?: number
  maxTokens?: number
  /** Ask for strict JSON where the provider supports it. */
  json?: boolean
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "auth" | "busy" | "bad-response" | "network" = "bad-response"
  ) {
    super(message)
  }
}

/* ── Base-URL safety (SSRF) ─────────────────────────────────────────────── */

function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase()
  if (v === "::1" || v === "::" || v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true
  const mapped = v.startsWith("::ffff:") ? v.slice(7) : v
  const parts = mapped.split(".").map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false
  const [a, b] = parts
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

const isHosted = () => process.env.NODE_ENV === "production" && process.env.ALLOW_PRIVATE_AI_URLS !== "true"

/**
 * Users supply base URLs, and our server makes the request — so on a hosted
 * deployment we refuse anything that points inside our own network (cloud
 * metadata, localhost, private ranges). Local development and self-hosted
 * installs (ALLOW_PRIVATE_AI_URLS=true) may use localhost for Ollama.
 */
export async function assertSafeBaseUrl(raw: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new LlmError("That base URL isn't valid.", "config")
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new LlmError("The base URL must start with http:// or https://", "config")
  }
  if (!isHosted()) return url

  if (url.protocol !== "https:") {
    throw new LlmError("On this server the base URL must use https://", "config")
  }
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new LlmError("This server can't reach localhost. Use a public https URL (for example a tunnel to your Ollama).", "config")
  }
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address)
  if (addresses.length === 0) throw new LlmError("Couldn't resolve that base URL's host.", "config")
  if (addresses.some(isPrivateAddress)) {
    throw new LlmError("That base URL points to a private network address, which isn't allowed.", "config")
  }
  return url
}

/* ── Completion ─────────────────────────────────────────────────────────── */

export function validateConfig(cfg: LlmConfig): void {
  const preset = PROVIDER_PRESETS[cfg.provider]
  if (!preset) throw new LlmError(`Unknown provider "${cfg.provider}".`, "config")
  if (!cfg.model.trim()) throw new LlmError("Choose a model name.", "config")
  if (preset.needsKey && !cfg.apiKey) throw new LlmError(`${preset.label} needs an API key.`, "config")
  if (preset.needsBaseUrl && !(cfg.baseUrl || preset.defaultBaseUrl)) {
    throw new LlmError(`${preset.label} needs a base URL.`, "config")
  }
}

export async function complete(cfg: LlmConfig, opts: CompleteOptions): Promise<string> {
  validateConfig(cfg)
  switch (cfg.provider) {
    case "gemini":
      return completeGemini(cfg, opts)
    case "anthropic":
      return completeAnthropic(cfg, opts)
    default:
      return completeOpenAICompatible(cfg, opts)
  }
}

function failFromResponse(provider: string, status: number, body: string): never {
  if (status === 401 || status === 403) {
    throw new LlmError(`${provider} rejected the API key (HTTP ${status}). Check that it's correct and has access to this model.`, "auth")
  }
  if (isRetryableStatus(status)) {
    throw new LlmError(`${provider} is busy right now. Please try again in a moment.`, "busy")
  }
  throw new LlmError(`${provider} error (${status}): ${body.slice(0, 240)}`)
}

async function send(provider: string, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchWithRetry(url, { ...init, signal: AbortSignal.timeout(90_000) })
  } catch {
    throw new LlmError(`Couldn't reach ${provider}. Check the URL and your connection.`, "network")
  }
}

async function completeGemini(cfg: LlmConfig, o: CompleteOptions): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`
  const res = await send("Gemini", url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey! },
    body: JSON.stringify({
      ...(o.system ? { systemInstruction: { parts: [{ text: o.system }] } } : {}),
      contents: [{ role: "user", parts: [{ text: o.prompt }] }],
      generationConfig: {
        temperature: o.temperature ?? 0.1,
        maxOutputTokens: o.maxTokens ?? 4096,
        ...(o.json ? { responseMimeType: "application/json" } : {}),
      },
    }),
  })
  if (!res.ok) failFromResponse("Gemini", res.status, await res.text().catch(() => ""))
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new LlmError("Gemini returned an empty response.")
  return String(text)
}

async function completeAnthropic(cfg: LlmConfig, o: CompleteOptions): Promise<string> {
  const base = cfg.baseUrl ? (await assertSafeBaseUrl(cfg.baseUrl)).toString().replace(/\/+$/, "") : "https://api.anthropic.com"
  const res = await send("Anthropic", `${base}/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": cfg.apiKey!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: o.maxTokens ?? 4096,
      temperature: o.temperature ?? 0.1,
      ...(o.system ? { system: o.system } : {}),
      messages: [{ role: "user", content: o.prompt }],
    }),
  })
  if (!res.ok) failFromResponse("Anthropic", res.status, await res.text().catch(() => ""))
  const data = await res.json()
  const text = Array.isArray(data?.content)
    ? data.content.filter((b: { type?: string }) => b.type === "text").map((b: { text?: string }) => b.text ?? "").join("")
    : ""
  if (!text) throw new LlmError("Anthropic returned an empty response.")
  return text
}

async function completeOpenAICompatible(cfg: LlmConfig, o: CompleteOptions): Promise<string> {
  const preset = PROVIDER_PRESETS[cfg.provider]
  const baseRaw = cfg.baseUrl || preset.defaultBaseUrl!
  const base = (await assertSafeBaseUrl(baseRaw)).toString().replace(/\/+$/, "")
  const isOpenAI = cfg.provider === "openai"
  // OpenAI's newest models reject `temperature` and `max_tokens`.
  const reasoning = isOpenAI && /^(o\d|gpt-5)/i.test(cfg.model)

  const res = await send(preset.label, `${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      ...(cfg.provider === "openrouter"
        ? { "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000", "X-Title": "Mnemo" }
        : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        ...(o.system ? [{ role: "system", content: o.system }] : []),
        { role: "user", content: o.prompt },
      ],
      ...(reasoning ? {} : { temperature: o.temperature ?? 0.1 }),
      ...(isOpenAI ? { max_completion_tokens: o.maxTokens ?? 4096 } : { max_tokens: o.maxTokens ?? 4096 }),
      ...(o.json && (isOpenAI || cfg.provider === "openrouter" || cfg.provider === "ollama")
        ? { response_format: { type: "json_object" } }
        : {}),
    }),
  })
  if (!res.ok) failFromResponse(preset.label, res.status, await res.text().catch(() => ""))
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new LlmError(`${preset.label} returned an empty response.`)
  return String(text)
}
