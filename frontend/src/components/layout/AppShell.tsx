import { Link, useRouterState } from '@tanstack/react-router'
import { SignedIn, useAuth, UserButton } from '@clerk/clerk-react'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'

import SlideOver from '../ui/SlideOver'
import NoteDetail from '../NoteDetail'
import { askNotes, deleteNote, fetchNote, generateSummary, setAuthTokenGetter } from '../../lib/api'
import type { AskResponse, DigestResult, Note } from '../../lib/api'

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

  // AI Modals state (Ask primary + Summarize secondary)
  const [showAsk, setShowAsk] = useState(false)
  const [askQuery, setAskQuery] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [askResult, setAskResult] = useState<AskResponse | null>(null)
  const [askError, setAskError] = useState<string | null>(null)

  const [showSummary, setShowSummary] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [digestResult, setDigestResult] = useState<DigestResult | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const [selectedSourceNote, setSelectedSourceNote] = useState<Note | null>(null)
  const [isLoadingSourceNote, setIsLoadingSourceNote] = useState(false)

  const [isAIMenuOpen, setIsAIMenuOpen] = useState(false)
  const aiMenuButtonRef = useRef<HTMLButtonElement>(null)
  const aiMenuRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!isAIMenuOpen) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsAIMenuOpen(false)
      }
    }
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (aiMenuRef.current?.contains(target)) return
      if (aiMenuButtonRef.current?.contains(target)) return
      setIsAIMenuOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onClickOutside)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onClickOutside)
    }
  }, [isAIMenuOpen])

  const handleAskQuery = async (query: string) => {
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
  }

  const handleSummarize = async () => {
    setShowSummary(true)
    setIsSummarizing(true)
    setDigestResult(null)
    setSummaryError(null)
    try {
      const result = await generateSummary()
      setDigestResult(result)
    } catch (error) {
      console.error('Failed to generate summary:', error)
      setSummaryError(error instanceof Error ? error.message : 'Failed to generate summary')
    } finally {
      setIsSummarizing(false)
    }
  }

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

  const aiActions = useMemo(
    () => ({
      openAsk: (prefill?: string) => {
        if (prefill) setAskQuery(prefill)
        setShowAsk(true)
      },
      openAskWithQuery: (prefill: string) => {
        setAskQuery(prefill)
        void handleAskQuery(prefill)
      },
      openSummarize: () => void handleSummarize(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  return (
    <AIActionContext.Provider value={aiActions}>
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
            <button
              type="button"
              onClick={() => {
                setShowAsk(true)
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-white font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              aria-label="Ask your notes"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16h6M12 20a8 8 0 100-16 8 8 0 000 16z" />
              </svg>
              <span className="hidden sm:inline">Ask Notes</span>
            </button>

            <div className="relative">
              <button
                ref={aiMenuButtonRef}
                type="button"
                onClick={() => setIsAIMenuOpen((v) => !v)}
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="AI actions"
                aria-haspopup="menu"
                aria-expanded={isAIMenuOpen}
              >
                <span className="hidden sm:inline">AI</span>
                <svg className="h-5 w-5 sm:ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isAIMenuOpen && (
                <div
                  ref={aiMenuRef}
                  role="menu"
                  aria-label="AI actions menu"
                  className="absolute right-0 mt-2 w-52 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden z-50"
                >
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setIsAIMenuOpen(false)
                      void handleSummarize()
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-gray-800 hover:bg-gray-50"
                  >
                    Summarize Recent
                    <div className="text-xs text-gray-500 mt-0.5">Recap your latest notes</div>
                  </button>
                </div>
              )}
            </div>
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16h6M12 20a8 8 0 100-16 8 8 0 000 16z" />
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
            className="w-full min-h-[90px] rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleAskQuery(askQuery)}
              disabled={!askQuery.trim() || isAsking}
              className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {isAsking ? 'Asking…' : 'Ask'}
            </button>
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
            <p className="text-sm text-blue-700 font-medium">Planning + searching + summarizing…</p>
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
                    {askResult.query_plan.time_range.start_date} → {askResult.query_plan.time_range.end_date || '…'}
                  </span>
                )}
                {askResult.query_plan.include_tags.map((t) => (
                  <span key={`in-${t}`} className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800">
                    +{t}
                  </span>
                ))}
                {askResult.query_plan.exclude_tags.map((t) => (
                  <span key={`out-${t}`} className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800">
                    -{t}
                  </span>
                ))}
                {askResult.query_plan.folder_paths?.map((p) => (
                  <span key={`f-${p}`} className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800">
                    folder:{p}
                  </span>
                ))}
                {!askResult.query_plan.time_range && askResult.query_plan.include_tags.length === 0 && askResult.query_plan.exclude_tags.length === 0 && !askResult.query_plan.folder_paths && (
                  <span className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800">
                    all-notes
                  </span>
                )}
              </div>
              <div className="mt-3 text-xs text-blue-900">
                <span className="font-semibold">Semantic query:</span> {askResult.query_plan.semantic_query}
              </div>
            </div>

            {askResult.warnings?.length > 0 && (
              <div className="rounded-lg bg-yellow-50 p-4 border border-yellow-200">
                <div className="text-xs font-semibold text-yellow-900 uppercase tracking-wider mb-2">Warnings</div>
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
                    className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 hover:border-blue-300 hover:shadow-sm transition"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{s.title}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(s.updated_at).toLocaleString()} · score {Math.round(s.score * 100)}%
                        </div>
                      </div>
                      <svg className="h-5 w-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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

    {/* Summary Slide-Over (global) */}
    <SlideOver
      isOpen={showSummary}
      onClose={() => setShowSummary(false)}
      title={
        <div className="flex items-center gap-2 text-purple-900">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Smart Summary
        </div>
      }
      width="max-w-xl"
    >
      <div className="space-y-6">
        {isSummarizing ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="relative">
              <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-purple-600">AI</span>
              </div>
            </div>
            <p className="text-sm text-purple-600 font-medium animate-pulse">Analyzing your recent notes...</p>
          </div>
        ) : summaryError ? (
          <div className="rounded-lg bg-red-50 p-4 border border-red-200">
            <p className="text-sm text-red-800">{summaryError}</p>
          </div>
        ) : digestResult ? (
          <div className="prose prose-purple max-w-none">
            <div className="bg-purple-50 rounded-xl p-6 border border-purple-100 mb-6">
              <h3 className="text-lg font-semibold text-purple-900 mb-4 mt-0">Smart Digest</h3>
              <div className="text-gray-800 leading-relaxed mb-4 text-sm">
                <ReactMarkdown>{digestResult.summary}</ReactMarkdown>
              </div>
              {digestResult.key_themes.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-purple-800 uppercase tracking-wider mb-2">Key Themes</h4>
                  <ul className="space-y-1 text-gray-700 list-none pl-0 my-0">
                    {digestResult.key_themes.map((theme, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 w-1.5 h-1.5 bg-purple-500 rounded-full flex-shrink-0" />
                        <span>{theme}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {digestResult.action_items.length > 0 && (
                <div className="mt-4 pt-4 border-t border-purple-200">
                  <h4 className="text-sm font-semibold text-purple-800 uppercase tracking-wider mb-2">Action Items</h4>
                  <ul className="space-y-2 text-gray-700 list-none pl-0 my-0">
                    {digestResult.action_items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <input type="checkbox" className="mt-1 rounded border-purple-300 text-purple-600 focus:ring-purple-500" />
                        <span className="text-sm">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-10 text-sm text-gray-600">Use “Summarize Recent” to generate a digest of your latest notes.</div>
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

    </AIActionContext.Provider>
  )
}

type AIActionContextValue = {
  openAsk: (prefill?: string) => void
  openAskWithQuery: (prefill: string) => void
  openSummarize: () => void
}

const AIActionContext = createContext<AIActionContextValue | null>(null)

export function useAIActions() {
  const ctx = useContext(AIActionContext)
  if (!ctx) {
    throw new Error('useAIActions must be used within AppShell')
  }
  return ctx
}


