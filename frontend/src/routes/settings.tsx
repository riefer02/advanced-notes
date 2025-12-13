import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@clerk/clerk-react'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!isSignedIn) {
    window.location.href = '/sign-in'
    return null
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
          Settings are coming soon. This page is a placeholder for account and preferences.
        </div>
      </div>
    </div>
  )
}

