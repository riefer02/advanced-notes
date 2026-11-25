import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'

import { CommandPalette } from '../CommandPalette'
import { useFriendRequests } from '../../hooks/useFriends'
import { useReceivedShares } from '../../hooks/useSharing'

import { NAV_ITEMS } from './nav-items'
import { DesktopSidebar, MobileDrawer } from './Navigation'
import { AppHeader } from './AppHeader'
import { AskSlideOver } from './AskSlideOver'

interface AppShellContextValue {
  openAsk: () => void
}

const AppShellContext = createContext<AppShellContextValue | null>(null)

export function useAppShell() {
  const ctx = useContext(AppShellContext)
  if (!ctx) throw new Error('useAppShell must be used within AppShell')
  return ctx
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  })

  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [showAsk, setShowAsk] = useState(false)

  const { data: friendRequestsData } = useFriendRequests()
  const { data: receivedSharesData } = useReceivedShares()
  const pendingCount =
    (friendRequestsData?.requests?.length ?? 0) + (receivedSharesData?.received?.length ?? 0)

  const activeItem = useMemo(() => {
    return NAV_ITEMS.find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))
  }, [pathname])

  // Cmd+K / Ctrl+K to open command palette
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const appShellCtx = useMemo<AppShellContextValue>(() => ({ openAsk: () => setShowAsk(true) }), [])

  return (
    <AppShellContext.Provider value={appShellCtx}>
      <div className="bg-background flex min-h-screen">
        <a
          href="#main-content"
          className="bg-surface text-ink border-line focus-visible:ring-ring sr-only z-[100] rounded-lg border px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus-visible:ring-2 focus-visible:outline-none"
        >
          Skip to content
        </a>
        <DesktopSidebar pathname={pathname} pendingCount={pendingCount} />
        <MobileDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          pathname={pathname}
          pendingCount={pendingCount}
        />

        {/* Main column */}
        <div className="flex-1 min-w-0 flex flex-col">
          <AppHeader
            activeItem={activeItem}
            onOpenDrawer={() => setIsDrawerOpen(true)}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            onOpenAsk={() => setShowAsk(true)}
          />
          <main id="main-content" tabIndex={-1} className="flex-1 min-h-0">
            {children}
          </main>
        </div>
      </div>

      <AskSlideOver isOpen={showAsk} onClose={() => setShowAsk(false)} />

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenAsk={() => setShowAsk(true)}
      />
    </AppShellContext.Provider>
  )
}
