import { prisma } from "@/lib/prisma"
import { getOrCreateUser } from "@/lib/api-utils"

/**
 * GET /api/images/:imageId
 * Serves an image saved with a conversation. Only the owner can read it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ imageId: string }> }) {
  const { imageId } = await params

  let userId: string
  try {
    userId = (await getOrCreateUser()).id
  } catch {
    return new Response("Unauthorized", { status: 401 })
  }

  const image = await prisma.conversationImage.findFirst({
    where: { id: imageId, userId },
    select: { mimeType: true, data: true },
  })
  if (!image) return new Response("Not found", { status: 404 })

  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
