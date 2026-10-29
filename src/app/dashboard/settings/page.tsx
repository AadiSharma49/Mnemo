import { Metadata } from "next"
import { getOrCreateUser } from "@/lib/api-utils"
import { ApiKeySettings } from "./api-key-settings"
import { ProfileSettings } from "./profile-settings"

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your settings",
}

export default async function SettingsPage() {
  const user = await getOrCreateUser()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and application settings.
        </p>
      </div>

      <ProfileSettings
        initial={{
          firstName: user.firstName ?? "",
          lastName: user.lastName ?? "",
          email: user.email,
          avatarUrl: user.avatarUrl,
        }}
      />

      <ApiKeySettings />

      <div className="rounded-xl border bg-card p-6">
        <h3 className="text-lg font-semibold">Notifications</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your notification preferences.
        </p>
      </div>
    </div>
  )
}
