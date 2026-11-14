import { useEffect, useId, useRef, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'

interface SlideOverProps {
  isOpen: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  width?: string
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

// Drawers can stack (e.g. Ask → source note). Track them so only the top-most
// one is modal, Escape closes one at a time, and the page unlocks on the last.
let openDrawers: string[] = []
const drawerListeners = new Set<() => void>()

function notifyDrawers() {
  drawerListeners.forEach((listener) => listener())
}

function registerDrawer(id: string) {
  openDrawers = [...openDrawers.filter((drawer) => drawer !== id), id]
  notifyDrawers()
}

function unregisterDrawer(id: string) {
  openDrawers = openDrawers.filter((drawer) => drawer !== id)
  notifyDrawers()
}

function subscribeDrawers(listener: () => void) {
  drawerListeners.add(listener)
  return () => drawerListeners.delete(listener)
}

let openDrawerCount = 0

function lockBodyScroll() {
  openDrawerCount += 1
  document.body.style.overflow = 'hidden'
}

function unlockBodyScroll() {
  openDrawerCount = Math.max(0, openDrawerCount - 1)
  if (openDrawerCount === 0) document.body.style.overflow = ''
}

export default function SlideOver({
  isOpen,
  onClose,
  title,
  children,
  width = 'max-w-md',
}: SlideOverProps) {
  const titleId = useId()
  const instanceId = useId()
  const drawerStack = useSyncExternalStore(
    subscribeDrawers,
    () => openDrawers.join('|'),
    () => ''
  )
  const openStack = drawerStack.split('|').filter(Boolean)
  const isTopmost = openStack.length === 0 || openStack[openStack.length - 1] === instanceId
  const dialogRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Track this drawer in the stack while it is open.
  useEffect(() => {
    if (!isOpen) return
    registerDrawer(instanceId)
    return () => unregisterDrawer(instanceId)
  }, [isOpen, instanceId])

  // Prevent body scroll when open
  useEffect(() => {
    if (!isOpen) return
    lockBodyScroll()
    return unlockBodyScroll
  }, [isOpen])

  // Move focus in, trap Tab inside this drawer, restore focus on close, and
  // make Escape close only the top-most drawer.
  useEffect(() => {
    if (!isOpen) return

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      const openDialogs = Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"][aria-hidden="false"]')
      )
      if (openDialogs[openDialogs.length - 1] !== dialogRef.current) return

      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      // Clicking non-focusable content moves focus to <body>; pull it back in.
      if (!panelRef.current.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      restoreFocusRef.current?.focus?.()
    }
  }, [isOpen])

  return (
    <div
      ref={dialogRef}
      className={`fixed inset-0 z-50 overflow-hidden transition-[opacity,visibility] duration-300 ease-out ${
        isOpen
          ? 'visible pointer-events-auto opacity-100'
          : 'invisible pointer-events-none opacity-0'
      }`}
      role="dialog"
      aria-modal={isTopmost}
      aria-hidden={!isOpen || !isTopmost}
      aria-labelledby={title ? titleId : undefined}
    >
      {/* Backdrop */}
      <div
        className="bg-scrim absolute inset-0 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 flex max-w-full sm:pl-8">
        <div
          className={`w-screen ${width} transform transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div
            ref={panelRef}
            className="bg-surface shadow-pop border-line flex h-full flex-col border-l"
          >
            {/* Header */}
            <div className="border-line flex items-center justify-between gap-4 border-b px-5 py-3.5">
              <h2
                id={titleId}
                className="text-ink min-w-0 text-[15px] leading-6 font-semibold tracking-[-0.015em]"
              >
                {title}
              </h2>
              <button
                type="button"
                className="text-ink-subtle hover:bg-surface-muted hover:text-ink focus-visible:ring-ring grid size-8 shrink-0 place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
                onClick={onClose}
              >
                <span className="sr-only">Close panel</span>
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            {/* Content */}
            <div className="relative flex-1 overflow-y-auto px-5 pt-4 pb-8">{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
