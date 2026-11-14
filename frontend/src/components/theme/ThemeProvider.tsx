/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'chisos-theme'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isTheme(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

function resolve(theme: Theme): ResolvedTheme {
  return theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme
}

function apply(theme: ResolvedTheme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme

  // Keep the mobile browser chrome in sync with the selected theme.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#1c1c20' : '#fbfbfd')
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolve(readStoredTheme())
  )

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage can be unavailable (private mode); the choice still applies this session.
    }
  }, [])

  // Apply whenever the preference changes, and follow the OS while on "system".
  useEffect(() => {
    const next = resolve(theme)
    setResolvedTheme(next)
    apply(next)

    if (theme !== 'system' || typeof window === 'undefined') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const systemTheme = query.matches ? 'dark' : 'light'
      setResolvedTheme(systemTheme)
      apply(systemTheme)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [theme])

  // Keep multiple open tabs in sync when the preference changes elsewhere.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && isTheme(event.newValue)) {
        setThemeState(event.newValue)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  // Prefer an explicit provider, but keep components renderable in isolation
  // (tests, previews) without one.
  return (
    context ?? {
      theme: 'system' as Theme,
      resolvedTheme: 'light' as ResolvedTheme,
      setTheme: () => {},
    }
  )
}
