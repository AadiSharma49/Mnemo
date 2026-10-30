"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Icons } from "@/lib/icons"

interface Props {
  initial: { firstName: string; lastName: string; email: string; avatarUrl: string | null }
}

export function ProfileSettings({ initial }: Props) {
  const router = useRouter()
  const [firstName, setFirstName] = React.useState(initial.firstName)
  const [lastName, setLastName] = React.useState(initial.lastName)
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null)

  const dirty = firstName.trim() !== initial.firstName || lastName.trim() !== initial.lastName
  const initials = ((firstName[0] ?? "") + (lastName[0] ?? "")).toUpperCase() || "?"

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || "Failed to save profile")
      setMessage({ kind: "ok", text: "Profile updated." })
      router.refresh()
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Failed to save profile" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border bg-card p-6">
      <h3 className="text-lg font-semibold">Profile</h3>
      <p className="mt-1 text-sm text-muted-foreground">How your name appears to you and your teammates.</p>

      <div className="mt-5 flex items-center gap-4">
        {initial.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={initial.avatarUrl} alt="" className="h-14 w-14 rounded-full border object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full border bg-muted text-sm font-semibold">
            {initials}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Your photo comes from your sign-in account. Change it from the account menu in the top bar.
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" value={firstName} maxLength={60} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" value={lastName} maxLength={60} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={initial.email} disabled readOnly />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button type="submit" disabled={saving || !dirty || !firstName.trim()}>
          {saving && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
        {message && (
          <p className={message.kind === "ok" ? "text-sm text-success" : "text-sm text-error"}>{message.text}</p>
        )}
      </div>
    </form>
  )
}
