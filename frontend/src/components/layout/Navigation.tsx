import { useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'

import { NAV_ITEMS } from './nav-items'

function getIsActive(pathname: string, to: string) {
  if (to === '/library') {
    return (
      pathname === '/library' ||
      pathname.startsWith('/library/') ||
      pathname.startsWith('/notes') ||
      pathname.startsWith('/meals') ||
      pathname.startsWith('/vinyl')
    )
  }
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

// ============================================================================
// Desktop Sidebar
// ============================================================================

export function DesktopSidebar({
  pathname,
  pendingCount,
}: {
  pathname: string
  pendingCount: number
}) {
  return (
    <aside className="border-line bg-surface hidden lg:flex lg:w-60 lg:flex-col lg:border-r">
      <div className="border-line flex h-14 items-center border-b px-4">
        <div className="flex items-center gap-2">
          <span className="text-ink text-[15px] font-semibold tracking-[-0.02em]">Chisos</span>
        </div>
      </div>
      <nav className="p-2.5" aria-label="Primary">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = getIsActive(pathname, item.to)
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={`focus-visible:ring-ring flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none ${
                    active
                      ? 'bg-brand-soft/70 text-brand'
                      : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                  }`}
                >
                  <item.icon className="size-4.5 shrink-0" />
                  <span>{item.label}</span>
                  {item.to === '/friends' && pendingCount > 0 && (
                    <span className="bg-destructive text-background ml-auto inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold">
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
  )
}

// ============================================================================
// Mobile Drawer
// ============================================================================

export function MobileDrawer({
  isOpen,
  onClose,
  pathname,
  pendingCount,
}: {
  isOpen: boolean
  onClose: () => void
  pathname: string
  pendingCount: number
}) {
  const drawerPanelRef = useRef<HTMLDivElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    lastFocusedRef.current = document.activeElement as HTMLElement | null
    const focusables = getFocusable(drawerPanelRef.current)
    focusables[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
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
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = 'unset'
      }
    }
    document.body.style.overflow = 'unset'
  }, [isOpen])

  return (
    <div
      className={`fixed inset-0 z-50 lg:hidden transition ${
        isOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
      }`}
      aria-hidden={!isOpen}
    >
      <div
        className={`bg-scrim absolute inset-0 backdrop-blur-[2px] transition-opacity ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      <div className="absolute inset-y-0 left-0 w-full max-w-xs">
        <div
          ref={drawerPanelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation drawer"
          className={`bg-surface shadow-pop h-full transform transition-transform ease-[cubic-bezier(0.32,0.72,0,1)] ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="border-line flex h-14 items-center justify-between border-b px-4">
            <span className="text-ink text-[15px] font-semibold tracking-[-0.015em]">Menu</span>
            <button
              type="button"
              onClick={onClose}
              className="text-ink-subtle hover:bg-surface-muted hover:text-ink focus-visible:ring-ring grid size-8 place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
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
          <nav className="p-2.5" aria-label="Primary">
            <ul className="space-y-0.5">
              {NAV_ITEMS.map((item) => {
                const active = getIsActive(pathname, item.to)
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      aria-current={active ? 'page' : undefined}
                      onClick={onClose}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-brand-soft/70 text-brand'
                          : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                      }`}
                    >
                      <item.icon className="size-4.5 shrink-0" />
                      <span>{item.label}</span>
                      {item.to === '/friends' && pendingCount > 0 && (
                        <span className="bg-destructive text-background ml-auto inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold">
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
  )
}
