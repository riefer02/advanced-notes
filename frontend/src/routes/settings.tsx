import { useState, useEffect, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Gauge, ListChecks, Mic, Monitor, Moon, Palette, Sun, UserRound, X } from 'lucide-react'
import { useUserSettings, useUpdateUserSettings } from '../hooks/useSettings'
import { useMyProfile, useUpdateProfile } from '../hooks/useProfile'
import { useUsage } from '../hooks/useUsage'
import { useTheme, type Theme } from '../components/theme/ThemeProvider'
import AvatarUploader from '../components/AvatarUploader'
import UsernameInput from '../components/UsernameInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { DetailCard, DetailCardHeader } from '@/components/ui/detail'
import { PageHeader } from '@/components/ui/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatUtcDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/** Common spoken languages, stored as ISO 639-1 codes for the transcriber. */
const LANGUAGE_OPTIONS: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'pl', name: 'Polish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ru', name: 'Russian' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ta', name: 'Tamil' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
]

const MAX_LANGUAGES = 5

function languageName(code: string): string {
  return LANGUAGE_OPTIONS.find((option) => option.code === code)?.name ?? code.toUpperCase()
}

function formatUsageAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function SettingsPage() {
  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsLoadFailed,
  } = useUserSettings()
  const updateAutoAccept = useUpdateUserSettings()
  const updateLanguages = useUpdateUserSettings()
  const { data: profile, isLoading: profileLoading, isError: profileLoadFailed } = useMyProfile()
  const updateProfile = useUpdateProfile()
  const updateDiscoverable = useUpdateProfile()

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [languages, setLanguages] = useState<string[]>([])
  const initializedRef = useRef(false)
  const settingsInitializedRef = useRef(false)

  // Sync form state from profile data (only on first load)
  useEffect(() => {
    if (profile && !initializedRef.current) {
      setDisplayName(profile.display_name)
      setUsername(profile.username ?? '')
      setBio(profile.bio ?? '')
      initializedRef.current = true
    }
  }, [profile])

  useEffect(() => {
    if (settings && !settingsInitializedRef.current) {
      setLanguages(settings.transcription_languages ?? [])
      settingsInitializedRef.current = true
    }
  }, [settings])

  // Track changes — reset stale success message when user starts editing again
  useEffect(() => {
    if (!profile) return
    const changed =
      displayName !== profile.display_name ||
      username !== (profile.username ?? '') ||
      bio !== (profile.bio ?? '')
    setHasChanges(changed)
    if (changed) {
      updateProfile.reset()
      updateDiscoverable.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName, username, bio, profile])

  const savedLanguages = settings?.transcription_languages ?? []
  const hasLanguageChanges =
    languages.length !== savedLanguages.length ||
    languages.some((code) => !savedLanguages.includes(code))

  const handleAddLanguage = (code: string) => {
    setLanguages((current) =>
      current.includes(code) || current.length >= MAX_LANGUAGES ? current : [...current, code]
    )
  }

  const handleRemoveLanguage = (code: string) => {
    setLanguages((current) => current.filter((language) => language !== code))
  }

  const handleSaveLanguages = () => {
    updateLanguages.mutate({ transcription_languages: languages })
  }

  const handleDiscardProfile = () => {
    if (!profile) return
    setDisplayName(profile.display_name)
    setUsername(profile.username ?? '')
    setBio(profile.bio ?? '')
    updateProfile.reset()
  }

  const handleSaveProfile = () => {
    const data: {
      display_name?: string
      username?: string | null
      bio?: string
    } = {}

    if (displayName !== profile?.display_name) data.display_name = displayName
    if (username !== (profile?.username ?? '')) {
      data.username = username || null
    }
    if (bio !== (profile?.bio ?? '')) data.bio = bio

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

                <div>
                  <SettingRow
                    id="discoverable-toggle"
                    title="Discoverable"
                    description="Allow other users to find you by name, username, or email."
                    checked={profile.discoverable}
                    onCheckedChange={(checked) =>
                      updateDiscoverable.mutate({ discoverable: checked })
                    }
                    disabled={updateDiscoverable.isPending}
                  />
                  <p className="text-ink-subtle mt-3 text-xs">This switch saves automatically.</p>
                  {updateDiscoverable.isError && (
                    <p className="text-destructive mt-1 text-xs">
                      {updateDiscoverable.error?.message || 'Could not save that change.'}
                    </p>
                  )}
                  {updateDiscoverable.isSuccess && (
                    <p className="text-positive mt-1 text-xs">Saved.</p>
                  )}
                </div>

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

        <UsageCard />

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
              <>
                <SettingRow
                  id="auto-accept-todos"
                  title="Auto-accept extracted todos"
                  description="Add extracted todos to your list immediately. When off, they appear as suggestions to review."
                  checked={settings?.auto_accept_todos ?? false}
                  onCheckedChange={(checked) =>
                    updateAutoAccept.mutate({ auto_accept_todos: checked })
                  }
                  disabled={updateAutoAccept.isPending}
                />
                <p className="text-ink-subtle mt-3 text-xs">This switch saves automatically.</p>
                {updateAutoAccept.isError && (
                  <p className="text-destructive mt-1 text-xs">
                    {updateAutoAccept.error?.message || 'Could not save that change.'}
                  </p>
                )}
                {updateAutoAccept.isSuccess && <p className="text-positive mt-1 text-xs">Saved.</p>}
              </>
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
                <div className="space-y-2">
                  <Label htmlFor="add-language">Preferred languages</Label>
                  {languages.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {languages.map((code) => (
                        <span
                          key={code}
                          className="border-line bg-surface-muted text-ink inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs"
                        >
                          {languageName(code)}
                          <button
                            type="button"
                            onClick={() => handleRemoveLanguage(code)}
                            aria-label={`Remove ${languageName(code)}`}
                            className="text-ink-subtle hover:text-ink hover:bg-surface-sunken focus-visible:ring-ring rounded-full p-0.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                          >
                            <X className="size-3" aria-hidden />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-ink-subtle text-xs">Autodetect (default)</p>
                  )}
                  <Select
                    value=""
                    onValueChange={handleAddLanguage}
                    disabled={languages.length >= MAX_LANGUAGES}
                  >
                    <SelectTrigger id="add-language" className="w-full sm:w-56">
                      <SelectValue
                        placeholder={
                          languages.length >= MAX_LANGUAGES
                            ? 'Maximum of 5 languages'
                            : 'Add a language'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGE_OPTIONS.filter((option) => !languages.includes(option.code)).map(
                        (option) => (
                          <SelectItem key={option.code} value={option.code}>
                            {option.name}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-ink-subtle text-xs leading-4">
                    Up to 5 languages. Leave empty to detect the language automatically.
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs">
                    {updateLanguages.isError && (
                      <p className="text-destructive">
                        {updateLanguages.error?.message || 'Could not save.'}
                      </p>
                    )}
                    {updateLanguages.isSuccess && !hasLanguageChanges && (
                      <p className="text-positive">Saved.</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSaveLanguages}
                    loading={updateLanguages.isPending}
                    disabled={!hasLanguageChanges}
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

function UsageCard() {
  const { data, isLoading, error, refresh } = useUsage()

  return (
    <DetailCard>
      <DetailCardHeader
        icon={Gauge}
        title="Usage"
        subtitle="Transcription minutes and AI calls this month."
      />
      <div className="border-line space-y-4 border-t px-4 py-4">
        {isLoading ? (
          <div className="text-ink-subtle text-[13px]">Loading usage…</div>
        ) : error ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-destructive text-[13px]">Could not load usage.</p>
            <Button variant="ghost" size="xs" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        ) : data ? (
          <>
            <UsageBar
              label="Transcription"
              used={data.transcription_minutes_used}
              limit={data.transcription_minutes_limit}
              unit="minutes"
            />
            <UsageBar
              label="AI calls"
              used={data.ai_calls_used}
              limit={data.ai_calls_limit}
              unit="calls"
            />
            <div className="text-ink-subtle flex flex-wrap items-center gap-2 text-xs">
              <span>Resets {formatUtcDate(data.period_end)}</span>
              <span aria-hidden>·</span>
              <Badge variant="neutral" className="capitalize">
                {data.tier}
              </Badge>
            </div>
          </>
        ) : null}
      </div>
    </DetailCard>
  )
}

function UsageBar({
  label,
  used,
  limit,
  unit,
}: {
  label: string
  used: number
  limit: number
  unit: string
}) {
  const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const nearLimit = percent >= 80

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink text-[13px] font-medium">{label}</span>
        <span className={cn('text-xs tabular-nums', nearLimit ? 'text-warning' : 'text-ink-muted')}>
          {formatUsageAmount(used)} / {formatUsageAmount(limit)} {unit}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        className="bg-surface-muted h-1.5 overflow-hidden rounded-full"
      >
        <div
          className={cn('h-full rounded-full', nearLimit ? 'bg-warning' : 'bg-brand')}
          style={{ width: `${percent}%` }}
        />
      </div>
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
