import { useState, useEffect, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ListChecks, Mic, Monitor, Moon, Palette, Sun, UserRound } from 'lucide-react'
import { useUserSettings, useUpdateUserSettings } from '../hooks/useSettings'
import { useMyProfile, useUpdateProfile } from '../hooks/useProfile'
import { useTheme, type Theme } from '../components/theme/ThemeProvider'
import AvatarUploader from '../components/AvatarUploader'
import UsernameInput from '../components/UsernameInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { DetailCard, DetailCardHeader } from '@/components/ui/detail'
import { PageHeader } from '@/components/ui/page-header'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function SettingsPage() {
  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsLoadFailed,
  } = useUserSettings()
  const updateSettings = useUpdateUserSettings()
  const { data: profile, isLoading: profileLoading, isError: profileLoadFailed } = useMyProfile()
  const updateProfile = useUpdateProfile()

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [discoverable, setDiscoverable] = useState(true)
  const [hasChanges, setHasChanges] = useState(false)
  const [languagesText, setLanguagesText] = useState('')
  const initializedRef = useRef(false)
  const settingsInitializedRef = useRef(false)

  // Sync form state from profile data (only on first load)
  useEffect(() => {
    if (profile && !initializedRef.current) {
      setDisplayName(profile.display_name)
      setUsername(profile.username ?? '')
      setBio(profile.bio ?? '')
      setDiscoverable(profile.discoverable)
      initializedRef.current = true
    }
  }, [profile])

  useEffect(() => {
    if (settings && !settingsInitializedRef.current) {
      setLanguagesText((settings.transcription_languages ?? []).join(', '))
      settingsInitializedRef.current = true
    }
  }, [settings])

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

  const handleAutoAcceptToggle = () => {
    if (settings) {
      updateSettings.mutate({ auto_accept_todos: !settings.auto_accept_todos })
    }
  }

  const handleSaveLanguages = () => {
    const languages = Array.from(
      new Set(
        languagesText
          .split(',')
          .map((language) => language.trim().toLowerCase())
          .filter(Boolean)
      )
    ).slice(0, 5)
    updateSettings.mutate({ transcription_languages: languages })
  }

  const handleDiscardProfile = () => {
    if (!profile) return
    setDisplayName(profile.display_name)
    setUsername(profile.username ?? '')
    setBio(profile.bio ?? '')
    setDiscoverable(profile.discoverable)
    updateProfile.reset()
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
      <div className="mx-auto max-w-3xl space-y-4 px-5 py-6 sm:px-8">
        <PageHeader
          title="Settings"
          description="How you show up to friends, and how the app behaves."
        />

        <DetailCard>
          <DetailCardHeader
            icon={UserRound}
            title="Profile"
            subtitle="Your public profile information, visible to friends."
          />
          <div className="border-line space-y-4 border-t px-4 py-4">
            {profileLoading ? (
              <div className="text-ink-subtle text-[13px]">Loading profile…</div>
            ) : profileLoadFailed ? (
              <p className="text-destructive text-[13px]">
                Could not load your profile. Refresh the page to try again.
              </p>
            ) : profile ? (
              <>
                <AvatarUploader avatarUrl={profile.avatar_url} displayName={profile.display_name} />

                <div className="space-y-1.5">
                  <Label htmlFor="display-name">Display name</Label>
                  <Input
                    id="display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={255}
                  />
                </div>

                <UsernameInput
                  value={username}
                  onChange={setUsername}
                  currentUsername={profile.username}
                />

                <div className="space-y-1.5">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Tell us about yourself…"
                    className="resize-none"
                  />
                </div>

                <SettingRow
                  id="discoverable-toggle"
                  title="Discoverable"
                  description="Allow other users to find you by name, username, or email."
                  checked={discoverable}
                  onCheckedChange={setDiscoverable}
                />

                {updateProfile.isError && (
                  <p className="text-destructive text-[13px]">{updateProfile.error.message}</p>
                )}
                {updateProfile.isSuccess && !hasChanges && (
                  <p className="text-positive text-[13px]">Profile updated.</p>
                )}

                {hasChanges && (
                  <div className="border-line flex items-center justify-end gap-3 border-t pt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDiscardProfile}
                      disabled={updateProfile.isPending}
                    >
                      Discard
                    </Button>
                    <Button size="sm" onClick={handleSaveProfile} loading={updateProfile.isPending}>
                      Save changes
                    </Button>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </DetailCard>

        <DetailCard>
          <DetailCardHeader
            icon={Palette}
            title="Appearance"
            subtitle="Pick a theme, or follow your system setting."
          />
          <div className="border-line border-t px-4 py-4">
            <ThemeSelector />
          </div>
        </DetailCard>

        <DetailCard>
          <DetailCardHeader
            icon={ListChecks}
            title="Todo extraction"
            subtitle="Control what happens to tasks found in your notes."
          />
          <div className="border-line border-t px-4 py-4">
            {settingsLoading ? (
              <div className="text-ink-subtle text-[13px]">Loading settings…</div>
            ) : settingsLoadFailed ? (
              <p className="text-destructive text-[13px]">
                Could not load settings. Refresh the page to try again.
              </p>
            ) : (
              <SettingRow
                id="auto-accept-todos"
                title="Auto-accept extracted todos"
                description="Add extracted todos to your list immediately. When off, they appear as suggestions to review."
                checked={settings?.auto_accept_todos ?? false}
                onCheckedChange={() => handleAutoAcceptToggle()}
                disabled={updateSettings.isPending}
              />
            )}
            {updateSettings.isError && !settingsLoading && (
              <p className="text-destructive mt-3 text-xs">
                {updateSettings.error?.message || 'Could not save that change.'}
              </p>
            )}
          </div>
        </DetailCard>

        <DetailCard>
          <DetailCardHeader
            icon={Mic}
            title="Transcription"
            subtitle="Hint at the languages you speak so names transcribe accurately."
          />
          <div className="border-line space-y-3 border-t px-4 py-4">
            {settingsLoading ? (
              <div className="text-ink-subtle text-[13px]">Loading settings…</div>
            ) : settingsLoadFailed ? (
              <p className="text-destructive text-[13px]">
                Could not load settings. Refresh the page to try again.
              </p>
            ) : settings ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="transcription-languages">Preferred languages</Label>
                  <Input
                    id="transcription-languages"
                    value={languagesText}
                    onChange={(event) => setLanguagesText(event.target.value)}
                    placeholder="en, es, fr"
                    maxLength={50}
                  />
                  <p className="text-ink-subtle text-xs leading-4">
                    Comma-separated ISO codes. Leave empty to auto-detect.
                  </p>
                </div>
                <div className="flex items-center justify-end gap-3">
                  {updateSettings.isError && (
                    <p className="text-destructive text-xs">
                      {updateSettings.error?.message || 'Could not save.'}
                    </p>
                  )}
                  {updateSettings.isSuccess && <p className="text-positive text-xs">Saved.</p>}
                  <Button
                    size="sm"
                    onClick={handleSaveLanguages}
                    loading={updateSettings.isPending}
                  >
                    Save languages
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </DetailCard>
      </div>
    </div>
  )
}

function SettingRow({
  id,
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className="cursor-pointer">
          {title}
        </Label>
        <p className="text-ink-subtle mt-1 text-xs leading-5">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}

function ThemeSelector() {
  const { theme, setTheme } = useTheme()

  return (
    <div role="group" aria-label="Theme">
      <div className="bg-surface-muted grid grid-cols-3 gap-1 rounded-lg p-1">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = theme === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-pressed={active}
              className={`focus-visible:ring-ring flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all focus-visible:ring-2 focus-visible:outline-none ${
                active ? 'bg-surface-raised text-ink shadow-card' : 'text-ink-subtle hover:text-ink'
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          )
        })}
      </div>
      <p className="text-ink-subtle mt-2 text-xs leading-4">
        System follows the appearance setting of your device.
      </p>
    </div>
  )
}
