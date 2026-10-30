import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getOrCreateUser } from "@/lib/api-utils"
import { decryptSecret } from "@/lib/crypto"
import { getServerDefaultConfig } from "@/lib/ai/user-llm"
import { LLM_PROVIDERS, PROVIDER_PRESETS, LlmError, complete, type LlmConfig, type LlmProvider } from "@/lib/ai/llm"

/**
 * POST /api/user/ai-settings/test
 * Sends one tiny request to check a provider/key/model works — before saving.
 * Body: { provider, model?, baseUrl?, apiKey? } — omit everything to test what's
 * currently in use (saved settings, else the server default).
 * If `apiKey` is omitted for the already-saved provider, the stored key is used.
 */
export async function POST(request: Request) {
  let userId: string
  try {
    userId = (await getOrCreateUser()).id
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { provider?: unknown; model?: unknown; baseUrl?: unknown; apiKey?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    /* empty body = test current settings */
  }

  try {
    let cfg: LlmConfig
    if (body.provider === undefined) {
      const saved = await prisma.userAiSettings.findUnique({ where: { userId } })
      cfg = saved
        ? {
            provider: saved.provider as LlmProvider,
            model: saved.model,
            baseUrl: saved.baseUrl ?? undefined,
            apiKey: saved.encryptedKey ? decryptSecret(saved.encryptedKey) : undefined,
          }
        : getServerDefaultConfig()
    } else {
      const provider = body.provider as LlmProvider
      if (!LLM_PROVIDERS.includes(provider)) {
        return NextResponse.json({ ok: false, error: "Choose a provider from the list." }, { status: 400 })
      }
      const preset = PROVIDER_PRESETS[provider]
      let apiKey = typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : undefined
      if (!apiKey) {
        const saved = await prisma.userAiSettings.findUnique({ where: { userId } })
        if (saved?.encryptedKey && saved.provider === provider) apiKey = decryptSecret(saved.encryptedKey)
      }
      cfg = {
        provider,
        model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : preset.defaultModel,
        baseUrl: typeof body.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl.trim() : undefined,
        apiKey,
      }
    }

    const started = Date.now()
    const reply = await complete(cfg, { prompt: "Reply with the single word: ok", maxTokens: 20, temperature: 0 })
    return NextResponse.json({
      ok: true,
      provider: cfg.provider,
      model: cfg.model,
      latencyMs: Date.now() - started,
      reply: reply.trim().slice(0, 40),
    })
  } catch (error) {
    const message = error instanceof LlmError ? error.message : "The test request failed."
    if (!(error instanceof LlmError)) console.error("[ai-settings/test]", error instanceof Error ? error.message : error)
    return NextResponse.json({ ok: false, error: message }, { status: 200 })
  }
}
