import { useState, useEffect } from 'react'
import { useCheckUsername } from '../hooks/useProfile'

interface UsernameInputProps {
  value: string
  onChange: (value: string) => void
  currentUsername?: string | null
}

const USERNAME_RE = /^[a-z0-9][a-z0-9_.]{1,28}[a-z0-9]$/

export default function UsernameInput({ value, onChange, currentUsername }: UsernameInputProps) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  // Debounce the availability check
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, 500)
    return () => clearTimeout(timer)
  }, [value])

  const shouldCheck =
    debouncedValue.length >= 3 &&
    USERNAME_RE.test(debouncedValue) &&
    debouncedValue !== currentUsername

  const { data: availability, isFetching } = useCheckUsername(shouldCheck ? debouncedValue : '')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '')
    onChange(raw)
  }

  const isFormatValid = value.length === 0 || (value.length >= 3 && USERNAME_RE.test(value))
  const isTooShort = value.length > 0 && value.length < 3
  const isOwnUsername = value === currentUsername

  return (
    <div>
      <label htmlFor="username" className="block text-sm font-medium text-ink mb-1">
        Username
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle text-sm">@</span>
        <input
          id="username"
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="your.username"
          maxLength={30}
          className={`w-full pl-7 pr-8 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand ${
            !isFormatValid ? 'border-destructive/30' : 'border-line-strong'
          }`}
        />
        {value.length >= 3 && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {isFetching ? (
              <div className="h-4 w-4 border-2 border-line-strong border-t-brand rounded-full animate-spin" />
            ) : isOwnUsername ? (
              <span className="text-positive text-sm" title="Your current username">
                &#10003;
              </span>
            ) : availability?.available ? (
              <span className="text-positive text-sm" title="Available">
                &#10003;
              </span>
            ) : isFormatValid && shouldCheck ? (
              <span className="text-destructive text-sm" title="Taken">
                &#10007;
              </span>
            ) : null}
          </div>
        )}
      </div>
      {isTooShort && (
        <p className="mt-1 text-xs text-destructive">Username must be at least 3 characters</p>
      )}
      {!isFormatValid && !isTooShort && value.length > 0 && (
        <p className="mt-1 text-xs text-destructive">
          Must start and end with a letter or number. Only letters, numbers, periods, and
          underscores.
        </p>
      )}
    </div>
  )
}
