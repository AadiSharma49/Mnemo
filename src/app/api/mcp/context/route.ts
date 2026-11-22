import { prisma } from "@/lib/prisma"
import { getUserFromApiKey, corsPreflight, jsonWithCors } from "@/lib/api-auth"
import { buildContextBrief } from "@/lib/export/context-brief"

/**
 * GET /api/mcp/context
 * A ready-to-use context brief (settled decisions, ruled-out options, open
 * questions) for the Mnemo MCP server's `get_project_context` tool.
 * Authenticated with a Bearer API key.
 *
 * Query params: workspaceId (required), topic? (relevant decisions first)
 * Returns: { workspace, brief }
 */

export async function OPTIONS() {
  return corsPreflight()
}

export async function GET(request: Request) {
  const user = await getUserFromApiKey(request)
  if (!user) return jsonWithCors({ error: "Invalid or missing API key" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get("workspaceId")
  if (!workspaceId) return jsonWithCors({ error: "workspaceId is required" }, { status: 400 })

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: user.id },
    include: {
      decisions: { include: { conversation: { select: { occurredAt: true } } } },
      questions: true,
      actionItems: true,
    },
  })
  if (!workspace) return jsonWithCors({ error: "Workspace not found" }, { status: 404 })

  const brief = buildContextBrief({
    workspaceName: workspace.name,
    decisions: workspace.decisions,
    questions: workspace.questions,
    actionItems: workspace.actionItems,
    topic: searchParams.get("topic") ?? undefined,
  })
  return jsonWithCors({ workspace: workspace.name, brief })
}
