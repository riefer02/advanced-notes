import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@clerk/clerk-react'
import { useUserSettings, useUpdateUserSettings } from '../hooks/useSettings'
import { useMyProfile, useUpdateProfile } from '../hooks/useProfile'
import AvatarUploader from '../components/AvatarUploader'
import UsernameInput from '../components/UsernameInput'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const { data: settings, isLoading: settingsLoading } = useUserSettings()
  const updateSettings = useUpdateUserSettings()
  const { data: profile, isLoading: profileLoading } = useMyProfile()
  const updateProfile = useUpdateProfile()

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [discoverable, setDiscoverable] = useState(true)
  const [hasChanges, setHasChanges] = useState(false)

  // Sync form state from profile data
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name)
      setUsername(profile.username ?? '')
      setBio(profile.bio ?? '')
      setDiscoverable(profile.discoverable)
    }
  }, [profile])

  // Track changes — reset stale success message when user starts editing again
  useEffect(() => {
    if (!profile) return
    const changed =
      displayName !== profile.display_name ||
      username !== (profile.username ?? '') ||
      bio !== (profile.bio ?? '') ||
      discoverable !== profile.discoverable
    setHasChanges(changed)
    if (changed) {
      updateProfile.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName, username, bio, discoverable, profile])

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

  const handleSaveProfile = () => {
    const data: {
      display_name?: string
      username?: string | null
      bio?: string
      discoverable?: boolean
    } = {}

    if (displayName !== profile?.display_name) data.display_name = displayName
    if (username !== (profile?.username ?? '')) {
      data.username = username || null
    }
    if (bio !== (profile?.bio ?? '')) data.bio = bio
    if (discoverable !== profile?.discoverable) data.discoverable = discoverable

    updateProfile.mutate(data)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">Settings</h2>

        {/* Profile Section */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-4 border-b border-gray-100">
            <h3 className="text-base font-medium text-gray-900">Profile</h3>
            <p className="mt-1 text-sm text-gray-500">
              Your public profile information visible to friends.
            </p>
          </div>

          <div className="px-4 py-4 space-y-5">
            {profileLoading ? (
              <div className="text-sm text-gray-500">Loading profile...</div>
            ) : profile ? (
              <>
                {/* Avatar */}
                <AvatarUploader avatarUrl={profile.avatar_url} displayName={profile.display_name} />

                {/* Display Name */}
                <div>
                  <label
                    htmlFor="display-name"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Display name
                  </label>
                  <input
                    id="display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={255}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Username */}
                <UsernameInput
                  value={username}
                  onChange={setUsername}
                  currentUsername={profile.username}
                />

                {/* Bio */}
                <div>
                  <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
                    Bio
                  </label>
                  <textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Tell us about yourself..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                </div>

                {/* Discoverable */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <label
                      htmlFor="discoverable-toggle"
                      className="text-sm font-medium text-gray-900 cursor-pointer"
                    >
                      Discoverable
                    </label>
                    <p className="mt-1 text-sm text-gray-500">
                      Allow other users to find you by name, username, or email.
                    </p>
                  </div>
                  <button
                    id="discoverable-toggle"
                    type="button"
                    role="switch"
                    aria-checked={discoverable}
                    onClick={() => setDiscoverable(!discoverable)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      discoverable ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        discoverable ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Save Button */}
                {hasChanges && (
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      disabled={updateProfile.isPending}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {updateProfile.isPending ? 'Saving...' : 'Save changes'}
                    </button>
                    {updateProfile.isError && (
                      <p className="text-sm text-red-500">{updateProfile.error.message}</p>
                    )}
                  </div>
                )}
                {updateProfile.isSuccess && !hasChanges && (
                  <p className="text-sm text-green-600">Profile updated!</p>
                )}
              </>
            ) : null}
          </div>
        </div>

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
      </div>
    </div>
  )
}
