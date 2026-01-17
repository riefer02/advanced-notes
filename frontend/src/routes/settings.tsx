import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@clerk/clerk-react'
import { useUserSettings, useUpdateUserSettings } from '../hooks/useSettings'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const { data: settings, isLoading: settingsLoading } = useUserSettings()
  const updateSettings = useUpdateUserSettings()

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

  const handleAutoAcceptToggle = () => {
    if (settings) {
      updateSettings.mutate({ auto_accept_todos: !settings.auto_accept_todos })
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">Settings</h2>

        {/* Todo Settings Section */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-4 border-b border-gray-100">
            <h3 className="text-base font-medium text-gray-900">Todo Extraction</h3>
            <p className="mt-1 text-sm text-gray-500">
              Control how AI-extracted todos are handled when you record notes.
            </p>
          </div>

          <div className="px-4 py-4">
            {settingsLoading ? (
              <div className="text-sm text-gray-500">Loading settings...</div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <label
                    htmlFor="auto-accept-todos"
                    className="text-sm font-medium text-gray-900 cursor-pointer"
                  >
                    Auto-accept extracted todos
                  </label>
                  <p className="mt-1 text-sm text-gray-500">
                    When enabled, todos extracted from your voice notes will be automatically added
                    to your todo list. When disabled, they will appear as suggestions that you can
                    review and accept individually.
                  </p>
                </div>
                <button
                  id="auto-accept-todos"
                  type="button"
                  role="switch"
                  aria-checked={settings?.auto_accept_todos ?? false}
                  onClick={handleAutoAcceptToggle}
                  disabled={updateSettings.isPending}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    settings?.auto_accept_todos ? 'bg-blue-600' : 'bg-gray-200'
                  } ${updateSettings.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings?.auto_accept_todos ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Additional settings sections can go here */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
          More settings coming soon.
        </div>
      </div>
    </div>
  )
}
