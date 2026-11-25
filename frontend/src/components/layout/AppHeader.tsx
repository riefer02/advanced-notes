import { Link } from '@tanstack/react-router'
import { SignedIn, UserButton } from '@clerk/clerk-react'
import { Menu, Plus, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '../theme/ThemeToggle'

export function AppHeader({
  activeItem,
  onOpenDrawer,
  onOpenCommandPalette,
  onOpenAsk,
}: {
  activeItem: { label: string } | undefined
  onOpenDrawer: () => void
  onOpenCommandPalette: () => void
  onOpenAsk: () => void
}) {
  return (
    <header className="border-line bg-surface/85 supports-[backdrop-filter]:bg-surface/70 flex h-14 items-center justify-between gap-4 border-b px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenDrawer}
          className="text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:ring-ring grid size-10 place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none lg:hidden"
        >
          <span className="sr-only">Open menu</span>
          <Menu className="size-4.5" aria-hidden="true" />
        </button>

        <span className="text-ink text-[13px] leading-5 font-semibold tracking-[-0.01em]">
          {activeItem?.label ?? 'Chisos'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onOpenCommandPalette}
          className="size-10 sm:hidden"
          aria-label="Search"
          aria-haspopup="dialog"
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Search className="size-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onOpenCommandPalette}
          className="text-ink-subtle hidden gap-2 sm:flex"
          aria-haspopup="dialog"
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Search className="size-3.5" />
          <span className="text-xs font-normal">Search</span>
          <kbd className="border-line bg-surface-muted text-ink-subtle pointer-events-none rounded border px-1.5 py-0.5 font-sans text-[10px] leading-none font-medium">
            {typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
              ? '⌘K'
              : 'Ctrl K'}
          </kbd>
        </Button>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" aria-label="Quick actions" className="h-10 sm:h-8">
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">New</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link to="/notes" search={{ compose: true }}>
                Write a Note
              </Link>
            </DropdownMenuItem>
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
