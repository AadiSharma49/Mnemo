import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUserId } from "@/lib/api-utils"
import { fetchSharedConversation, ShareImportError } from "@/lib/import/share-url"

/**
 * POST /api/conversations/import-url
 * Imports a public share link (e.g. a ChatGPT share URL) as a conversation.
 *
 * Body: { url: string, workspaceId: string }
 * Returns: the created Conversation (201)
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId()

    let body: { url?: string; workspaceId?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 })
    }

    const { url, workspaceId } = body
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "A share URL is required" }, { status: 400 })
    }
    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json({ error: "Workspace ID is required" }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, userId } })
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
    }

    const shared = await fetchSharedConversation(url)

    const conversation = await prisma.conversation.create({
      data: {
        title: shared.title.slice(0, 100),
        content: shared.content,
        workspaceId,
        userId,
      },
    })
    return NextResponse.json(conversation, { status: 201 })
  } catch (error) {
    if (error instanceof ShareImportError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[import-url] Error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to import conversation" }, { status: 500 })
  }
}
