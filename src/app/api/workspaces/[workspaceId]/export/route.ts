import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getOrCreateUser } from "@/lib/api-utils"
import { buildDecisionLog } from "@/lib/export/decision-log"

/**
 * GET /api/workspaces/:workspaceId/export
 * Downloads the workspace's decisions, open questions and action items as a
 * Markdown decision log. Add ?inline=1 to view it in the browser instead.
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
      decisions: { include: { conversation: { select: { title: true, occurredAt: true } } } },
      actionItems: true,
      questions: true,
    },
  })
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 })

  const markdown = buildDecisionLog({
    workspaceName: workspace.name,
    decisions: workspace.decisions,
    actionItems: workspace.actionItems,
    questions: workspace.questions,
  })

  const slug = workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace"
  const inline = new URL(request.url).searchParams.get("inline") === "1"

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${slug}-decision-log.md"`,
      "Cache-Control": "no-store",
    },
  })
}
