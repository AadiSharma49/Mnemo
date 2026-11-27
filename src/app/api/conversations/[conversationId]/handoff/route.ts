import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUserId } from "@/lib/api-utils"
import { buildHandoff } from "@/lib/ai/handoff"
import { getLlmConfigForUser } from "@/lib/ai/user-llm"
import { LlmError, PROVIDER_PRESETS } from "@/lib/ai/llm"

// Long chats are read in several model calls.
export const maxDuration = 300

export async function POST(_request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { conversationId } = await params
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { content: true },
    })
    if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 })

    const cfg = await getLlmConfigForUser(userId)
    const handoff = await buildHandoff(cfg, conversation.content)
    return NextResponse.json({ handoff, model: `${PROVIDER_PRESETS[cfg.provider].label} · ${cfg.model}` })
  } catch (err) {
    console.error("[handoff] Error:", err instanceof Error ? err.message : err)
    // Config/auth/busy errors are written for the user — show them; hide anything else.
    if (err instanceof LlmError && err.kind !== "bad-response") {
      return NextResponse.json({ error: err.message }, { status: err.kind === "busy" ? 503 : 400 })
    }
    return NextResponse.json({ error: "Couldn't prepare the handoff. Please try again." }, { status: 500 })
  }
}
