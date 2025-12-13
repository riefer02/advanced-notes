import { Link, useRouterState } from '@tanstack/react-router'
import { SignedIn, UserButton } from '@clerk/clerk-react'
import { useEffect, useMemo, useRef, useState } from 'react'

type NavItem = {
  to: '/dashboard' | '/summaries' | '/notes' | '/settings'
  label: string
  icon: (props: { className?: string }) => JSX.Element
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7m-9 2v8m4-8v8m5-10l2 2m-2-2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V10z" />
      </svg>
    ),
  },
  {
    to: '/summaries',
    label: 'Summaries',
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6a2 2 0 012-2h2a2 2 0 012 2v6m4 0H5" />
      </svg>
    ),
  },
  {
    to: '/notes',
    label: 'Notes',
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

function getIsActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`)
}

function getFocusable(container: HTMLElement | null) {
  if (!container) return []
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ]
  return Array.from(container.querySelectorAll<HTMLElement>(selectors.join(','))).filter(
    (el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden')
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  })

  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const drawerPanelRef = useRef<HTMLDivElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  const activeItem = useMemo(() => {
    return NAV_ITEMS.find((i) => getIsActive(pathname, i.to))
  }, [pathname])

  useEffect(() => {
    if (!isDrawerOpen) return

    lastFocusedRef.current = document.activeElement as HTMLElement | null
    const focusables = getFocusable(drawerPanelRef.current)
    focusables[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsDrawerOpen(false)
        return
      }
      if (e.key !== 'Tab') return

      const items = getFocusable(drawerPanelRef.current)
      if (!items.length) return

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (e.shiftKey) {
        if (!active || active === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (!active || active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      lastFocusedRef.current?.focus?.()
    }
  }, [isDrawerOpen])

  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = 'unset'
      }
    }
    document.body.style.overflow = 'unset'
  }, [isDrawerOpen])

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop rail */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-gray-200 lg:bg-white">
        <div className="h-16 px-4 flex items-center border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Chisos
            </span>
          </div>
        </div>
        <nav className="p-3" aria-label="Primary">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = getIsActive(pathname, item.to)
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-800'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 lg:hidden transition ${
          isDrawerOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
        }`}
        aria-hidden={!isDrawerOpen}
      >
        <div
          className={`absolute inset-0 bg-gray-900/40 transition-opacity ${
            isDrawerOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setIsDrawerOpen(false)}
        />
        <div className="absolute inset-y-0 left-0 w-full max-w-xs">
          <div
            ref={drawerPanelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation drawer"
            className={`h-full bg-white shadow-xl transform transition-transform ${
              isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="h-16 px-4 flex items-center justify-between border-b border-gray-200">
              <span className="text-base font-semibold text-gray-900">Menu</span>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="rounded-md p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <span className="sr-only">Close menu</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="p-3" aria-label="Primary">
              <ul className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const active = getIsActive(pathname, item.to)
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => setIsDrawerOpen(false)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
                          active
                            ? 'bg-blue-50 text-blue-800'
                            : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <item.icon className="h-5 w-5" />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </div>
        </div>
      </div>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="lg:hidden rounded-md p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <span className="sr-only">Open menu</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                🐺
              </span>
              <span className="text-sm font-semibold text-gray-900 truncate">
                {activeItem?.label ?? 'Chisos'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
          </div>
        </header>

        <main className="flex-1 min-h-0">{children}</main>
      </div>
    </div>
  )
}


