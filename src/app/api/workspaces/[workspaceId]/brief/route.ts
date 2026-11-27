import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getOrCreateUser } from "@/lib/api-utils"
import { buildContextBrief } from "@/lib/export/context-brief"

/**
 * GET /api/workspaces/:workspaceId/brief?topic=
 * Plain-text context brief for pasting into a new AI chat.
 */
export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params

  let userId: string
  try {
    userId = (await getOrCreateUser()).id
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
    include: {
      decisions: { include: { conversation: { select: { occurredAt: true } } } },
      questions: true,
      actionItems: true,
    },
  })
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 })

  const topic = new URL(request.url).searchParams.get("topic") ?? undefined
  const brief = buildContextBrief({
    workspaceName: workspace.name,
    decisions: workspace.decisions,
    questions: workspace.questions,
    actionItems: workspace.actionItems,
    topic,
  })
  return new Response(brief, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  })
}
