import { NextResponse } from "next/server"
import { getOrCreateUser } from "@/lib/api-utils"
import { complete } from "@/lib/ai/llm"
import { getLlmConfigForUser } from "@/lib/ai/user-llm"

/**
 * GET /api/system/ai
 * Health of the model the signed-in user's AI work runs on (their own provider
 * from Settings → AI Model, else the server default). Sends one tiny request.
 */
export async function GET() {
  const lastCheck = new Date().toISOString()
  let provider = "unknown"
  let model = "unknown"

  try {
    const user = await getOrCreateUser()
    const cfg = await getLlmConfigForUser(user.id)
    provider = cfg.provider
    model = cfg.model
    await complete(cfg, { prompt: "Reply with the single word: ok", maxTokens: 20, temperature: 0 })
    return NextResponse.json({ connected: true, provider, model, lastCheck, available: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI provider unavailable"
    return NextResponse.json(
      { connected: false, provider, model, lastCheck, available: false, error: message },
      { status: 503 }
    )
  }
}
