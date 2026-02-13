import { Link } from '@tanstack/react-router'
import { SignedIn, UserButton } from '@clerk/clerk-react'
import { Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { NavItem } from './nav-items'

export function AppHeader({
  activeItem,
  onOpenDrawer,
  onOpenCommandPalette,
  onOpenAsk,
}: {
  activeItem: NavItem | undefined
  onOpenDrawer: () => void
  onOpenCommandPalette: () => void
  onOpenAsk: () => void
}) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenDrawer}
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
        <Button
          variant="outline"
          onClick={onOpenCommandPalette}
          className="hidden sm:flex items-center gap-1.5 text-muted-foreground"
        >
          <Search className="h-3.5 w-3.5" />
          <kbd className="pointer-events-none text-xs">
            {typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
              ? '⌘K'
              : 'Ctrl+K'}
          </kbd>
        </Button>
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
              <Link to="/notes">Record a Note</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenAsk}>Ask Notes</DropdownMenuItem>
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
  )
}
