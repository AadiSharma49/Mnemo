import { NextResponse } from "next/server"
import { clerkClient } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { getOrCreateUser } from "@/lib/api-utils"

/**
 * GET   — the signed-in user's profile.
 * PATCH — update first/last name. Written to our database and mirrored to
 *         Clerk so the next sign-in doesn't show the old name.
 *
 * Email and avatar stay managed by Clerk (verification flows live there).
 */

const MAX_NAME = 60

export async function GET() {
  try {
    const u = await getOrCreateUser()
    return NextResponse.json({
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      avatarUrl: u.avatarUrl,
    })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function PATCH(request: Request) {
  let user
  try {
    user = await getOrCreateUser()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { firstName?: unknown; lastName?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const clean = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : undefined)
  const firstName = clean(body.firstName)
  const lastName = clean(body.lastName)

  if (!firstName) {
    return NextResponse.json({ error: "First name is required" }, { status: 400 })
  }
  if (firstName.length > MAX_NAME || (lastName?.length ?? 0) > MAX_NAME) {
    return NextResponse.json({ error: `Names must be ${MAX_NAME} characters or fewer` }, { status: 400 })
  }

  try {
    const client = await clerkClient()
    await client.users.updateUser(user.clerkId, { firstName, lastName: lastName ?? "" })
  } catch (error) {
    console.error("[profile] Clerk update failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Couldn't update your profile. Try again." }, { status: 502 })
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { firstName, lastName: lastName || null },
    select: { firstName: true, lastName: true },
  })
  return NextResponse.json(updated)
}
