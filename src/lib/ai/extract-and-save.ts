import { prisma } from "@/lib/prisma"
import { extractWithConfig } from "@/lib/ai/extraction"
import { getLlmConfigForUser } from "@/lib/ai/user-llm"
import { stripImageLinks } from "@/lib/import/image-markdown"

export interface ExtractionCounts {
  decisions: number
  actionItems: number
  questions: number
}

/**
 * Runs AI extraction on a conversation's text and saves the decisions, action
 * items and questions straight to the database (no review step).
 *
 * Never throws: failures are returned in `error` so callers can still report
 * the already-saved conversation.
 */
export async function extractAndSave(params: {
  text: string
  conversationId: string
  workspaceId: string
  userId: string
  source: string
}): Promise<{ counts: ExtractionCounts; error: string | null }> {
  const { text, conversationId, workspaceId, userId, source } = params
  const counts: ExtractionCounts = { decisions: 0, actionItems: 0, questions: 0 }

  try {
    // The model reads text only — swap saved-image links for a plain marker.
    const plain = stripImageLinks(text)
    const result = await extractWithConfig(await getLlmConfigForUser(userId), plain)

    if (result.decisions?.length) {
      await prisma.decision.createMany({
        data: result.decisions.map((d) => ({
          title: d.title,
          summary: d.summary,
          status: d.status || "pending",
          confidence: typeof d.confidence === "number" ? d.confidence : 0.5,
          source,
          conversationId,
          workspaceId,
          userId,
        })),
      })
      counts.decisions = result.decisions.length
    }

    if (result.actionItems?.length) {
      await prisma.actionItem.createMany({
        data: result.actionItems.map((a) => ({
          title: a.title,
          description: a.description || "",
          status: "pending",
          priority: a.priority || "medium",
          conversationId,
          workspaceId,
          userId,
        })),
      })
      counts.actionItems = result.actionItems.length
    }

    if (result.questions?.length) {
      await prisma.question.createMany({
        data: result.questions.map((q) => ({
          question: q.question,
          status: "open",
          conversationId,
          workspaceId,
          userId,
        })),
      })
      counts.questions = result.questions.length
    }
    return { counts, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed"
    console.error("[extract-and-save] extraction failed:", message)
    return { counts, error: message }
  }
}
