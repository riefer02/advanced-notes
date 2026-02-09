import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@clerk/clerk-react'
import { useUserSettings, useUpdateUserSettings } from '../hooks/useSettings'
import { useMyProfile, useUpdateProfile } from '../hooks/useProfile'
import AvatarUploader from '../components/AvatarUploader'
import UsernameInput from '../components/UsernameInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

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
                  <Label htmlFor="display-name" className="mb-1">
                    Display name
                  </Label>
                  <Input
                    id="display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={255}
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
                  <Label htmlFor="bio" className="mb-1">
                    Bio
                  </Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Tell us about yourself..."
                    className="resize-none"
                  />
                </div>

                {/* Discoverable */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <Label
                      htmlFor="discoverable-toggle"
                      className="text-sm font-medium text-gray-900 cursor-pointer"
                    >
                      Discoverable
                    </Label>
                    <p className="mt-1 text-sm text-gray-500">
                      Allow other users to find you by name, username, or email.
                    </p>
                  </div>
                  <Switch
                    id="discoverable-toggle"
                    checked={discoverable}
                    onCheckedChange={setDiscoverable}
                  />
                </div>

                {/* Save Button */}
                {hasChanges && (
                  <div className="flex items-center gap-3 pt-2">
                    <Button onClick={handleSaveProfile} loading={updateProfile.isPending}>
                      {updateProfile.isPending ? 'Saving...' : 'Save changes'}
                    </Button>
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
                  <Label
                    htmlFor="auto-accept-todos"
                    className="text-sm font-medium text-gray-900 cursor-pointer"
                  >
                    Auto-accept extracted todos
                  </Label>
                  <p className="mt-1 text-sm text-gray-500">
                    When enabled, todos extracted from your voice notes will be automatically added
                    to your todo list. When disabled, they will appear as suggestions that you can
                    review and accept individually.
                  </p>
                </div>
                <Switch
                  id="auto-accept-todos"
                  checked={settings?.auto_accept_todos ?? false}
                  onCheckedChange={() => handleAutoAcceptToggle()}
                  disabled={updateSettings.isPending}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
