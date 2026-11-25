import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Disc3,
  FileText,
  MessageCircle,
  MessageSquare,
  Mic,
  PenLine,
  Search,
  StickyNote,
  UtensilsCrossed,
} from 'lucide-react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useGlobalSearch } from '../hooks/useGlobalSearch'
import { useNotes } from '../hooks/useNotes'
import { formatShortDate } from '../lib/format'
import { NAV_ITEMS } from './layout/nav-items'

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onOpenAsk: () => void
}

const QUICK_ACTIONS = [
  { label: 'Write a Note', action: 'write' as const, icon: PenLine },
  { label: 'Record a Note', to: '/notes' as const, icon: Mic },
  { label: 'Ask Notes', action: 'ask' as const, icon: MessageSquare },
  { label: 'Create Summary', to: '/summaries' as const, icon: FileText },
  { label: 'Log a Meal', to: '/meals' as const, icon: UtensilsCrossed },
  { label: 'Browse Vinyl', to: '/vinyl' as const, icon: Disc3 },
  { label: 'Send Feedback', to: '/feedback' as const, icon: MessageCircle },
]

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '')
}

function mealPreview(items: { name: string }[], transcription: string): string {
  if (items.length > 0) {
    return items
      .slice(0, 3)
      .map((item) => item.name)
      .join(', ')
  }
  return transcription
}

export function CommandPalette({ isOpen, onClose, onOpenAsk }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 250)
  const isSearching = debouncedQuery.trim().length >= 2

  const { data: results, isFetching, error } = useGlobalSearch(debouncedQuery)
  const { data: recentNotes } = useNotes(undefined, 5, 0, isOpen)

  useEffect(() => {
    if (!isOpen) setQuery('')
  }, [isOpen])

  const handleSelect = (action: () => void) => {
    action()
    onClose()
  }

  const handleNavSelect = (to: string) => {
    handleSelect(() => void navigate({ to }))
  }

  const handleActionSelect = (action: (typeof QUICK_ACTIONS)[number]) => {
    if ('action' in action && action.action === 'ask') {
      handleSelect(onOpenAsk)
    } else if ('action' in action && action.action === 'write') {
      handleSelect(() => void navigate({ to: '/notes', search: { compose: true } }))
    } else if ('to' in action) {
      handleSelect(() => void navigate({ to: action.to }))
    }
  }

  const hasContentResults =
    (results?.notes.length ?? 0) + (results?.meals.length ?? 0) + (results?.records.length ?? 0) > 0

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Search"
      description="Search notes, meals, records, pages, and actions"
      showCloseButton={false}
      shouldFilter={!isSearching}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search notes, meals, vinyl, and actions..."
      />
      <CommandList>
        {!isSearching && <CommandEmpty>No pages or actions found.</CommandEmpty>}
        {isSearching && isFetching && (
          <div className="text-ink-subtle flex items-center gap-2 px-4 py-3 text-[13px]">
            <Search className="size-3.5 animate-pulse" />
            Searching your library…
          </div>
        )}

        {isSearching && error && !isFetching && (
          <div className="text-destructive border-line border-b px-4 py-3 text-[13px]">
            Search failed. Try again, or{' '}
            <button type="button" className="underline underline-offset-2" onClick={onOpenAsk}>
              ask notes
            </button>
            .
          </div>
        )}

        {isSearching && (
          <>
            {results?.notes.length ? (
              <CommandGroup heading="Notes">
                {results.notes.map((result) => (
                  <CommandItem
                    key={result.note.id}
                    value={`note ${result.note.id} ${result.note.title} ${result.note.folder_path}`}
                    onSelect={() =>
                      handleSelect(
                        () => void navigate({ to: '/notes', search: { note: result.note.id } })
                      )
                    }
                  >
                    <StickyNote className="text-domain-notes size-4" />
                    <span className="min-w-0 flex-1 truncate">
                      {result.note.title || 'Untitled note'}
                    </span>
                    <span className="text-ink-subtle shrink-0 text-[11px]">
                      {result.note.folder_path}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {results?.meals.length ? (
              <CommandGroup heading="Meals">
                {results.meals.map((meal) => (
                  <CommandItem
                    key={meal.id}
                    value={`meal ${meal.id} ${meal.meal_date} ${meal.transcription}`}
                    onSelect={() =>
                      handleSelect(
                        () => void navigate({ to: '/meals', search: { date: meal.meal_date } })
                      )
                    }
                  >
                    <UtensilsCrossed className="text-domain-meals size-4" />
                    <span className="min-w-0 flex-1 truncate">
                      {MEAL_LABEL[meal.meal_type] ?? meal.meal_type} ·{' '}
                      {mealPreview(meal.items, meal.transcription)}
                    </span>
                    <span className="text-ink-subtle shrink-0 text-[11px]">
                      {formatShortDate(meal.meal_date)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {results?.records.length ? (
              <CommandGroup heading="Vinyl">
                {results.records.map((record) => (
                  <CommandItem
                    key={record.id}
                    value={`vinyl ${record.id} ${record.artist} ${record.album_title}`}
                    onSelect={() =>
                      handleSelect(
                        () => void navigate({ to: '/vinyl', search: { record: record.id } })
                      )
                    }
                  >
                    <Disc3 className="text-domain-vinyl size-4" />
                    <span className="min-w-0 flex-1 truncate">{record.album_title}</span>
                    <span className="text-ink-subtle shrink-0 text-[11px]">{record.artist}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {!isFetching && !error && !hasContentResults && (
              <CommandGroup heading="No matches">
                <CommandItem
                  value="ask notes"
                  onSelect={() => handleSelect(onOpenAsk)}
                  className="text-ink-muted"
                >
                  <MessageSquare className="size-4" />
                  Ask notes about “{debouncedQuery.trim()}”
                  <span className="text-ink-subtle ml-auto text-[11px]">semantic search</span>
                </CommandItem>
              </CommandGroup>
            )}

            <CommandGroup heading="Actions">
              <CommandItem
                value="all notes"
                onSelect={() =>
                  handleSelect(
                    () => void navigate({ to: '/notes', search: { q: debouncedQuery.trim() } })
                  )
                }
              >
                <Search className="size-4" />
                <span className="min-w-0 flex-1 truncate">
                  Search all notes for “{debouncedQuery.trim()}”
                </span>
              </CommandItem>
              <CommandItem value="ask notes" onSelect={() => handleSelect(onOpenAsk)}>
                <MessageSquare className="size-4" />
                Ask notes
              </CommandItem>
            </CommandGroup>
          </>
        )}

        {!isSearching && (
          <>
            {recentNotes?.notes.length ? (
              <CommandGroup heading="Recent notes">
                {recentNotes.notes.map((note) => (
                  <CommandItem
                    key={note.id}
                    value={`recent ${note.title} ${note.folder_path}`}
                    onSelect={() =>
                      handleSelect(() => void navigate({ to: '/notes', search: { note: note.id } }))
                    }
                  >
                    <StickyNote className="text-domain-notes size-4" />
                    <span className="min-w-0 flex-1 truncate">{note.title || 'Untitled note'}</span>
                    <span className="text-ink-subtle max-w-40 shrink-0 truncate text-[11px]">
                      {stripTags(note.summary || note.content).slice(0, 40)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            <CommandGroup heading="Navigation">
              {NAV_ITEMS.map((item) => (
                <CommandItem
                  key={item.to}
                  value={`page ${item.label}`}
                  onSelect={() => handleNavSelect(item.to)}
                >
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="Quick Actions">
              {QUICK_ACTIONS.map((action) => (
                <CommandItem
                  key={action.label}
                  value={`action ${action.label}`}
                  onSelect={() => handleActionSelect(action)}
                >
                  <action.icon className="size-4" />
                  <span>{action.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
