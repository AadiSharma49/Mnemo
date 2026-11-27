/**
 * Masks things that look like credentials. People paste keys and connection
 * strings into AI chats; none of that should travel to another model.
 * Pattern-based, so it reduces the risk but can't promise to catch everything.
 */

const MASK = "[secret removed]"

const PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, MASK],
  // Provider keys: OpenAI/Anthropic/OpenRouter, Stripe/Clerk, GitHub, Google, AWS, Slack, Mnemo
  [/\bsk-[A-Za-z0-9_-]{16,}/g, MASK],
  [/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g, MASK],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, MASK],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, MASK],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, MASK],
  [/\bAKIA[0-9A-Z]{16}\b/g, MASK],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, MASK],
  [/\b(?:mnemo|relay)_sk_[A-Za-z0-9_-]{8,}/g, MASK],
  // JSON Web Tokens
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, MASK],
  // user:password@host in a connection string
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):[^\s@/]+@/gi, `$1:${MASK}@`],
  // PASSWORD=..., API_KEY: "...", client_secret=...
  [/\b([A-Za-z0-9_]*(?:password|passwd|secret|api_?key|token)[A-Za-z0-9_]*\s*[=:]\s*)(["']?)(?!\[secret)[^\s"']{8,}\2/gi, `$1$2${MASK}$2`],
]

export function redactSecrets(input: string): { text: string; count: number } {
  let count = 0
  let text = input
  for (const [pattern, replacement] of PATTERNS) {
    count += text.match(pattern)?.length ?? 0
    text = text.replace(pattern, replacement)
  }
  return { text, count }
}
