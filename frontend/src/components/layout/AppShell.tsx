import { Link, useRouterState } from '@tanstack/react-router'
import { SignedIn, useAuth, UserButton } from '@clerk/clerk-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'

import SlideOver from '../ui/SlideOver'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import NoteDetail from '../NoteDetail'
import { askNotes, deleteNote, fetchNote, setAuthTokenGetter } from '../../lib/api'
import type { AskResponse, Note } from '../../lib/api'
import { useFriendRequests } from '../../hooks/useFriends'
import { useReceivedShares } from '../../hooks/useSharing'

type NavItem = {
  to:
    | '/dashboard'
    | '/summaries'
    | '/notes'
    | '/todos'
    | '/meals'
    | '/vinyl'
    | '/friends'
    | '/settings'
    | '/feedback'
  label: string
  icon: (props: { className?: string }) => JSX.Element
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: ({ className }) => (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
        />
      </svg>
    ),
  },
  {
    to: '/summaries',
    label: 'Summaries',
    icon: ({ className }) => (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605"
        />
      </svg>
    ),
  },
  {
    to: '/notes',
    label: 'Notes',
    icon: ({ className }) => (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
        />
      </svg>
    ),
  },
  {
    to: '/todos',
    label: 'Todos',
    icon: ({ className }) => (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    ),
  },
  {
    to: '/meals',
    label: 'Meals',
    icon: ({ className }) => (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0L3 16.5m18-4.5a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    ),
  },
  {
    to: '/vinyl',
    label: 'Vinyl',
    icon: ({ className }) => (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z"
        />
      </svg>
    ),
  },
  {
    to: '/friends',
    label: 'Friends',
    icon: ({ className }) => (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
        />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: ({ className }) => (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        />
      </svg>
    ),
  },
  {
    to: '/feedback',
    label: 'Feedback',
    icon: ({ className }) => (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
        />
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
  const { getToken } = useAuth()
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  })

  // Ensure API layer can fetch auth tokens regardless of current route.
  useEffect(() => {
    setAuthTokenGetter(getToken)
  }, [getToken])

  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const drawerPanelRef = useRef<HTMLDivElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  // Ask Notes state
  const [showAsk, setShowAsk] = useState(false)
  const [askQuery, setAskQuery] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [askResult, setAskResult] = useState<AskResponse | null>(null)
  const [askError, setAskError] = useState<string | null>(null)

  const [selectedSourceNote, setSelectedSourceNote] = useState<Note | null>(null)
  const [isLoadingSourceNote, setIsLoadingSourceNote] = useState(false)

  const { data: friendRequestsData } = useFriendRequests()
  const { data: receivedSharesData } = useReceivedShares()
  const pendingCount =
    (friendRequestsData?.requests?.length ?? 0) + (receivedSharesData?.received?.length ?? 0)

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

  const handleAskQuery = useCallback(async (query: string) => {
    const q = query.trim()
    if (!q) return
    setShowAsk(true)
    setIsAsking(true)
    setAskResult(null)
    setAskError(null)
    try {
      const result = await askNotes(q, 12, false)
      setAskResult(result)
    } catch (error) {
      console.error('Failed to ask notes:', error)
      setAskError(error instanceof Error ? error.message : 'Failed to ask notes')
    } finally {
      setIsAsking(false)
    }
  }, [])

  const openSourceNote = async (noteId: string) => {
    setIsLoadingSourceNote(true)
    try {
      const note = await fetchNote(noteId)
      setSelectedSourceNote(note)
    } catch {
      alert('Failed to load note')
    } finally {
      setIsLoadingSourceNote(false)
    }
  }

  const handleDeleteSourceNote = async () => {
    if (!selectedSourceNote) return
    if (!confirm('Are you sure you want to delete this note?')) return
    try {
      await deleteNote(selectedSourceNote.id)
      setSelectedSourceNote(null)
    } catch {
      alert('Failed to delete note')
    }
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 flex">
        {/* Desktop rail */}
        <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-gray-200 lg:bg-white">
          <div className="h-16 px-4 flex items-center border-b border-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
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
                      {item.to === '/friends' && pendingCount > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-white bg-red-500 rounded-full">
                          {pendingCount}
                        </span>
                      )}
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
                  className="rounded-md p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <span className="sr-only">Close menu</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
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
                          {item.to === '/friends' && pendingCount > 0 && (
                            <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-white bg-red-500 rounded-full">
                              {pendingCount}
                            </span>
                          )}
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
                className="lg:hidden rounded-md p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <span className="sr-only">Open menu</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>

              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-lg font-bold bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  🐺
                </span>
                <span className="text-sm font-semibold text-gray-900 truncate">
                  {activeItem?.label ?? 'Chisos'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button aria-label="Quick actions">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="hidden sm:inline">New</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard">Record a Note</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setShowAsk(true)}>Ask Notes</DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/summaries">Create Summary</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/meals">Log a Meal</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/vinyl">Browse Vinyl</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/feedback">Send Feedback</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <SignedIn>
                <UserButton afterSignOutUrl="/" />
              </SignedIn>
            </div>
          </header>

          <main className="flex-1 min-h-0">{children}</main>
        </div>
      </div>

      {/* Ask Notes Slide-Over (global) */}
      <SlideOver
        isOpen={showAsk}
        onClose={() => {
          setShowAsk(false)
          setAskError(null)
          setIsAsking(false)
        }}
        title={
          <div className="flex items-center gap-2 text-blue-900">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16h6M12 20a8 8 0 100-16 8 8 0 000 16z"
              />
            </svg>
            Ask Your Notes
          </div>
        }
        width="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-900" htmlFor="ask-query">
              Question
            </label>
            <textarea
              id="ask-query"
              value={askQuery}
              onChange={(e) => setAskQuery(e.target.value)}
              placeholder='e.g. "Tell me what I have been eating in February"'
              className="w-full min-h-[90px] rounded-lg border border-gray-300 p-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
            />
            <div className="flex items-center gap-2">
              <Button
                onClick={() => void handleAskQuery(askQuery)}
                disabled={!askQuery.trim() || isAsking}
              >
                {isAsking ? 'Asking…' : 'Ask'}
              </Button>
              <button
                onClick={() => {
                  setAskQuery('')
                  setAskResult(null)
                  setAskError(null)
                }}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                Clear
              </button>
            </div>
          </div>

          {isAsking && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm text-blue-700 font-medium">
                Planning + searching + summarizing…
              </p>
            </div>
          )}

          {askError && (
            <div className="rounded-lg bg-red-50 p-4 border border-red-200">
              <p className="text-sm text-red-800">{askError}</p>
            </div>
          )}

          {askResult && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <div className="text-xs font-semibold text-blue-900 uppercase tracking-wider mb-3">
                  Derived filters
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {askResult.query_plan.time_range?.start_date && (
                    <span className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800">
                      {askResult.query_plan.time_range.start_date} →{' '}
                      {askResult.query_plan.time_range.end_date || '…'}
                    </span>
                  )}
                  {askResult.query_plan.include_tags.map((t) => (
                    <span
                      key={`in-${t}`}
                      className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800"
                    >
                      +{t}
                    </span>
                  ))}
                  {askResult.query_plan.exclude_tags.map((t) => (
                    <span
                      key={`out-${t}`}
                      className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800"
                    >
                      -{t}
                    </span>
                  ))}
                  {askResult.query_plan.folder_paths?.map((p) => (
                    <span
                      key={`f-${p}`}
                      className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800"
                    >
                      folder:{p}
                    </span>
                  ))}
                  {!askResult.query_plan.time_range &&
                    askResult.query_plan.include_tags.length === 0 &&
                    askResult.query_plan.exclude_tags.length === 0 &&
                    !askResult.query_plan.folder_paths && (
                      <span className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800">
                        all-notes
                      </span>
                    )}
                </div>
                <div className="mt-3 text-xs text-blue-900">
                  <span className="font-semibold">Semantic query:</span>{' '}
                  {askResult.query_plan.semantic_query}
                </div>
              </div>

              {askResult.warnings?.length > 0 && (
                <div className="rounded-lg bg-yellow-50 p-4 border border-yellow-200">
                  <div className="text-xs font-semibold text-yellow-900 uppercase tracking-wider mb-2">
                    Warnings
                  </div>
                  <ul className="text-sm text-yellow-900 space-y-1 list-disc pl-5">
                    {askResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="prose prose-blue max-w-none">
                <ReactMarkdown>{askResult.answer_markdown}</ReactMarkdown>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-gray-900">Sources</div>
                  <div className="text-xs text-gray-500">{askResult.sources.length} note(s)</div>
                </div>
                <div className="space-y-2">
                  {askResult.sources.map((s) => (
                    <button
                      key={s.note_id}
                      onClick={() => void openSourceNote(s.note_id)}
                      className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 hover:border-blue-300 hover:shadow-xs transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {s.title}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(s.updated_at).toLocaleString()} · score{' '}
                            {Math.round(s.score * 100)}%
                          </div>
                        </div>
                        <svg
                          className="h-5 w-5 text-gray-400 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {askResult.followups?.length > 0 && (
                <div className="border-t pt-4">
                  <div className="text-sm font-semibold text-gray-900 mb-2">Follow-ups</div>
                  <div className="flex flex-col gap-2">
                    {askResult.followups.map((f, i) => (
                      <button
                        key={i}
                        onClick={() => void handleAskQuery(f)}
                        className="text-left rounded-lg border border-gray-200 bg-gray-50 p-3 hover:bg-gray-100 transition text-sm text-gray-800"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </SlideOver>

      {/* Source Note Detail (nested) */}
      <SlideOver
        isOpen={!!selectedSourceNote || isLoadingSourceNote}
        onClose={() => setSelectedSourceNote(null)}
        title="Source Note"
        width="max-w-xl"
      >
        {isLoadingSourceNote ? (
          <div className="py-10 text-sm text-gray-600">Loading note…</div>
        ) : selectedSourceNote ? (
          <NoteDetail note={selectedSourceNote} onDelete={handleDeleteSourceNote} />
        ) : null}
      </SlideOver>
    </>
  )
}
