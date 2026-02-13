import { useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'

import { NAV_ITEMS } from './nav-items'

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
        className={`absolute inset-0 bg-gray-900/40 transition-opacity ${
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
          className={`h-full bg-white shadow-xl transform transition-transform ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="h-16 px-4 flex items-center justify-between border-b border-gray-200">
            <span className="text-base font-semibold text-gray-900">Menu</span>
            <button
              type="button"
              onClick={onClose}
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
                      onClick={onClose}
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
  )
}
