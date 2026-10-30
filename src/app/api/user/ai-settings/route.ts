import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getOrCreateUser } from "@/lib/api-utils"
import { encryptSecret, decryptSecret } from "@/lib/crypto"
import { hasServerDefault } from "@/lib/ai/user-llm"
import { LLM_PROVIDERS, PROVIDER_PRESETS, LlmError, assertSafeBaseUrl, validateConfig, type LlmProvider } from "@/lib/ai/llm"

/**
 * GET    — the user's saved model settings (never the key itself).
 * PUT    — save provider/model/base URL and, optionally, a new API key.
 *          Omit `apiKey` to keep the stored one (only valid for the same provider).
 * DELETE — remove saved settings and fall back to the server default.
 */

const noStore = { headers: { "Cache-Control": "no-store" } }

export async function GET() {
  let userId: string
  try {
    userId = (await getOrCreateUser()).id
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const saved = await prisma.userAiSettings.findUnique({ where: { userId } })
  return NextResponse.json(
    {
      configured: !!saved,
      provider: saved?.provider ?? null,
      model: saved?.model ?? null,
      baseUrl: saved?.baseUrl ?? null,
      hasKey: !!saved?.encryptedKey,
      serverDefaultAvailable: hasServerDefault(),
    },
    noStore
  )
}

export async function PUT(request: Request) {
  let userId: string
  try {
    userId = (await getOrCreateUser()).id
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { provider?: unknown; model?: unknown; baseUrl?: unknown; apiKey?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const provider = body.provider as LlmProvider
  if (!LLM_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Choose a provider from the list." }, { status: 400 })
  }
  const preset = PROVIDER_PRESETS[provider]
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : preset.defaultModel
  const baseUrl = typeof body.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl.trim() : undefined
  const newKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""

  if (model.length > 120 || (baseUrl?.length ?? 0) > 300 || newKey.length > 600) {
    return NextResponse.json({ error: "One of the values is too long." }, { status: 400 })
  }

  try {
    const existing = await prisma.userAiSettings.findUnique({ where: { userId } })

    // Keep the stored key only when staying on the same provider.
    let apiKey = newKey || undefined
    if (!apiKey && existing?.encryptedKey && existing.provider === provider) {
      apiKey = decryptSecret(existing.encryptedKey)
    }

    validateConfig({ provider, model, apiKey, baseUrl })
    if (baseUrl || preset.needsBaseUrl) await assertSafeBaseUrl(baseUrl || preset.defaultBaseUrl!)

    const data = {
      provider,
      model,
      baseUrl: baseUrl ?? null,
      encryptedKey: apiKey ? encryptSecret(apiKey) : null,
    }
    await prisma.userAiSettings.upsert({ where: { userId }, create: { userId, ...data }, update: data })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof LlmError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("[ai-settings] save failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Couldn't save your settings." }, { status: 500 })
  }
}

export async function DELETE() {
  let userId: string
  try {
    userId = (await getOrCreateUser()).id
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  await prisma.userAiSettings.deleteMany({ where: { userId } })
  return NextResponse.json({ ok: true })
}
