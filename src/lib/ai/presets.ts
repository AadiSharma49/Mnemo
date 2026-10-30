/** Provider list and defaults. Pure data so the settings UI can import it too. */

export type LlmProvider = "gemini" | "anthropic" | "openai" | "openrouter" | "ollama" | "custom"

export interface ProviderPreset {
  label: string
  defaultModel: string
  defaultBaseUrl?: string
  needsKey: boolean
  needsBaseUrl: boolean
  keyHint: string
}

export const PROVIDER_PRESETS: Record<LlmProvider, ProviderPreset> = {
  gemini: { label: "Google Gemini", defaultModel: "gemini-2.5-flash", needsKey: true, needsBaseUrl: false, keyHint: "AIza…" },
  openai: { label: "OpenAI", defaultModel: "gpt-4o-mini", defaultBaseUrl: "https://api.openai.com/v1", needsKey: true, needsBaseUrl: false, keyHint: "sk-…" },
  anthropic: { label: "Anthropic (Claude)", defaultModel: "claude-haiku-5-5", needsKey: true, needsBaseUrl: false, keyHint: "sk-ant-…" },
  openrouter: { label: "OpenRouter", defaultModel: "openai/gpt-4o-mini", defaultBaseUrl: "https://openrouter.ai/api/v1", needsKey: true, needsBaseUrl: false, keyHint: "sk-or-…" },
  ollama: { label: "Ollama (local)", defaultModel: "llama3.1", defaultBaseUrl: "http://localhost:11434/v1", needsKey: false, needsBaseUrl: true, keyHint: "" },
  custom: { label: "Custom (OpenAI-compatible)", defaultModel: "", needsKey: false, needsBaseUrl: true, keyHint: "optional" },
}

export const LLM_PROVIDERS = Object.keys(PROVIDER_PRESETS) as LlmProvider[]
