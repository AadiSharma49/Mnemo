import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/crypto"
import { LlmError, PROVIDER_PRESETS, type LlmConfig, type LlmProvider } from "./llm"

/**
 * Which model does this user's AI work run on?
 *   1. The provider/key they saved in Settings (bring-your-own-model), else
 *   2. the server default (Gemini, using GEMINI_API_KEY from the environment).
 */
export async function getLlmConfigForUser(userId: string): Promise<LlmConfig> {
  const saved = await prisma.userAiSettings.findUnique({ where: { userId } })

  if (saved) {
    let apiKey: string | undefined
    if (saved.encryptedKey) {
      try {
        apiKey = decryptSecret(saved.encryptedKey)
      } catch {
        throw new LlmError("Your saved API key can't be read any more. Open Settings → AI Model and enter it again.", "config")
      }
    }
    return {
      provider: saved.provider as LlmProvider,
      model: saved.model,
      baseUrl: saved.baseUrl ?? undefined,
      apiKey,
    }
  }

  return getServerDefaultConfig()
}

export function getServerDefaultConfig(): LlmConfig {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new LlmError(
      "No AI model is connected. Add your own API key in Settings → AI Model to enable extraction and chat.",
      "config"
    )
  }
  return { provider: "gemini", model: process.env.AI_MODEL || PROVIDER_PRESETS.gemini.defaultModel, apiKey }
}

export function hasServerDefault(): boolean {
  return !!process.env.GEMINI_API_KEY
}
