import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, type ComponentType } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  Disc3,
  FileText,
  Inbox,
  Mic,
  PenLine,
  Search,
  StickyNote,
  UtensilsCrossed,
} from 'lucide-react'

import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DetailCard } from '@/components/ui/detail'
import { EmptyState } from '../components/EmptyState'
import { useLibrary, type LibraryItem, type LibraryKind } from '../hooks/useLibrary'
import { formatShortDate, pluralize } from '../lib/format'

type LibraryFilter = 'all' | LibraryKind

const FILTERS: { value: LibraryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'note', label: 'Notes' },
  { value: 'meal', label: 'Meals' },
  { value: 'vinyl', label: 'Vinyl' },
  { value: 'todo', label: 'Tasks' },
]

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

export const Route = createFileRoute('/library')({
  validateSearch: (search: Record<string, unknown>): { type?: LibraryKind } => ({
    type:
      search.type === 'note' ||
      search.type === 'meal' ||
      search.type === 'vinyl' ||
      search.type === 'todo'
        ? search.type
        : undefined,
  }),
  component: LibraryPage,
})

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function itemTitle(item: LibraryItem): string {
  switch (item.kind) {
    case 'note':
      return item.note.title || 'Untitled note'
    case 'meal':
      return MEAL_LABEL[item.meal.meal_type] ?? 'Meal'
    case 'vinyl':
      return item.record.album_title
    case 'todo':
      return item.todo.title
  }
}

function itemPreview(item: LibraryItem): string {
  switch (item.kind) {
    case 'note':
      return stripMarkdown(item.note.summary || item.note.content).slice(0, 180)
    case 'meal':
      return item.meal.items.length
        ? item.meal.items.map((mealItem) => mealItem.name).join(', ')
        : item.meal.transcription
    case 'vinyl':
      return (
        [item.record.label, item.record.genre.join(', ')].filter(Boolean).join(' · ') || 'Record'
      )
    case 'todo':
      return item.todo.description || 'No details'
  }
}

function itemMeta(item: LibraryItem): string[] {
  switch (item.kind) {
    case 'note':
      return [item.note.folder_path, ...item.note.tags.slice(0, 2).map((tag) => `#${tag}`)].filter(
        Boolean
      )
    case 'meal':
      return [item.meal.meal_date, pluralize(item.meal.items.length, 'item')]
    case 'vinyl':
      return [
        item.record.artist,
        item.record.release_year ? String(item.record.release_year) : null,
      ].filter((value): value is string => Boolean(value))
    case 'todo':
      return [
        item.todo.status === 'completed' ? 'Completed' : 'Active',
        item.todo.note_id ? 'From a note' : 'Manual',
      ]
  }
}

function itemIcon(item: LibraryItem): {
  icon: ComponentType<{ className?: string }>
  className: string
} {
  switch (item.kind) {
    case 'note':
      return { icon: StickyNote, className: 'bg-domain-notes/10 text-domain-notes' }
    case 'meal':
      return { icon: UtensilsCrossed, className: 'bg-domain-meals/10 text-domain-meals' }
    case 'vinyl':
      return { icon: Disc3, className: 'bg-domain-vinyl/10 text-domain-vinyl' }
    case 'todo':
      return { icon: CheckCircle2, className: 'bg-domain-tasks/10 text-domain-tasks' }
  }
}

function dayKey(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function dayLabel(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'Earlier'

  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (dayKey(timestamp) === dayKey(today.toISOString())) return 'Today'
  if (dayKey(timestamp) === dayKey(yesterday.toISOString())) return 'Yesterday'
  return formatShortDate(date)
}

function matchesQuery(item: LibraryItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true

  switch (item.kind) {
    case 'note':
      return [
        item.note.title,
        item.note.summary ?? '',
        item.note.content,
        item.note.folder_path,
        ...item.note.tags,
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    case 'meal':
      return [
        item.meal.transcription,
        item.meal.meal_type,
        ...item.meal.items.map((mealItem) => mealItem.name),
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    case 'vinyl':
      return [
        item.record.artist,
        item.record.album_title,
        item.record.label ?? '',
        ...item.record.genre,
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    case 'todo':
      return [item.todo.title, item.todo.description ?? ''].join(' ').toLowerCase().includes(needle)
  }
}

function LibraryPage() {
  const navigate = useNavigate()
  const { type } = Route.useSearch()
  const filter: LibraryFilter = type ?? 'all'
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(25)
  const { items, isLoading, allFailed, hasError, hasMore, refetch } = useLibrary(limit)

  const counts = {
    all: items.length,
    note: items.filter((item) => item.kind === 'note').length,
    meal: items.filter((item) => item.kind === 'meal').length,
    vinyl: items.filter((item) => item.kind === 'vinyl').length,
    todo: items.filter((item) => item.kind === 'todo').length,
  }

  const visible = items.filter(
    (item) => (filter === 'all' || item.kind === filter) && matchesQuery(item, query)
  )

  const groups = visible.reduce<{ label: string; items: LibraryItem[] }[]>((acc, item) => {
    const label = dayLabel(item.timestamp)
    const last = acc[acc.length - 1]
    if (last?.label === label) last.items.push(item)
    else acc.push({ label, items: [item] })
    return acc
  }, [])

  const setFilter = (next: LibraryFilter) => {
    void navigate({
      to: '/library',
      search: next === 'all' ? {} : { type: next },
    })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-5 px-5 py-6 sm:px-8">
        <PageHeader
          title="Library"
          description="Everything you've captured, newest first."
          actions={
            <div className="flex flex-wrap items-center gap-0.5">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/notes" search={{ compose: true }}>
                  <PenLine className="size-4" />
                  Write
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/notes">
                  <Mic className="size-4" />
                  Record
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/meals">
                  <UtensilsCrossed className="size-4" />
                  Log meal
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/vinyl">
                  <Disc3 className="size-4" />
                  Add record
                </Link>
              </Button>
            </div>
          }
        />

        <div className="space-y-3">
          <div className="relative">
            <Search
              className="text-ink-subtle pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter the library by title, content, artist, or food..."
              aria-label="Filter the library"
              className="pl-9"
            />
          </div>

          <div className="scrollbar-hide -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {FILTERS.map((option) => {
              const active = filter === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  aria-pressed={active}
                  className={`focus-visible:ring-ring flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                    active
                      ? 'border-brand/30 bg-brand-soft text-brand'
                      : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {option.label}
                  <span className="text-2xs tabular-nums opacity-70">{counts[option.value]}</span>
                </button>
              )
            })}
          </div>
        </div>

        {allFailed ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
              <span>Could not load your library.</span>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : hasError ? (
          <Alert variant="warning">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
              <span>Some sources did not load. The rest of your library is below.</span>
              <Button variant="ghost" size="sm" onClick={() => void refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {isLoading && items.length === 0 ? (
          <div className="space-y-2" role="status" aria-label="Loading library">
            {[...Array(5)].map((_, index) => (
              <div
                key={index}
                className="border-line bg-surface flex animate-pulse items-start gap-3 rounded-xl border p-3"
              >
                <div className="bg-surface-sunken size-8 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="bg-surface-sunken h-3 w-1/2 rounded" />
                  <div className="bg-surface-sunken h-2.5 w-4/5 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Inbox className="text-line-strong mx-auto size-10" aria-hidden />}
            title={query.trim() ? 'No matches in your library' : 'Nothing in your library yet'}
            description={
              query.trim()
                ? `Nothing matches “${query.trim()}”. Try a shorter phrase or another filter.`
                : 'Record a note, write one, log a meal, or add a record — it all lands here.'
            }
            action={
              !query.trim() ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button size="sm" asChild>
                    <Link to="/notes">
                      <Mic />
                      Record a note
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/notes" search={{ compose: true }}>
                      <FileText />
                      Write a note
                    </Link>
                  </Button>
                </div>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.label} className="space-y-2">
                <h2 className="section-label">{group.label}</h2>
                <DetailCard className="divide-line divide-y overflow-hidden">
                  {group.items.map((item) => (
                    <LibraryRow key={`${item.kind}:${item.id}`} item={item} />
                  ))}
                </DetailCard>
              </section>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <p className="text-ink-subtle text-[11px]">Showing up to {limit} of each type.</p>
              {hasMore && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLimit((current) => current + 25)}
                >
                  Show more
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LibraryRow({ item }: { item: LibraryItem }) {
  const { icon: Icon, className } = itemIcon(item)
  const title = itemTitle(item)
  const preview = itemPreview(item)
  const meta = itemMeta(item)

  const content = (
    <>
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${className}`}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink block truncate text-[13px] leading-5 font-medium">{title}</span>
        <span className="text-ink-muted mt-0.5 line-clamp-2 block text-xs leading-5">
          {preview}
        </span>
        <span className="text-ink-subtle mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4">
          <span>{formatShortDate(item.timestamp)}</span>
          {meta.map((value) => (
            <span key={value} className="flex items-center gap-2">
              <span aria-hidden className="bg-line-strong size-0.5 rounded-full" />
              {value}
            </span>
          ))}
        </span>
      </span>
      <ChevronRight className="text-line-strong mt-1 size-4 shrink-0" aria-hidden />
    </>
  )

  const classNameRow =
    'hover:bg-surface-muted/60 focus-visible:bg-surface-muted/60 flex items-start gap-3 px-4 py-3 transition-colors focus-visible:outline-none'

  if (item.kind === 'note') {
    return (
      <Link to="/notes" search={{ note: item.note.id }} className={classNameRow}>
        {content}
      </Link>
    )
  }

  if (item.kind === 'meal') {
    return (
      <Link to="/meals" search={{ date: item.meal.meal_date }} className={classNameRow}>
        {content}
      </Link>
    )
  }

  if (item.kind === 'vinyl') {
    return (
      <Link to="/vinyl" search={{ record: item.record.id }} className={classNameRow}>
        {content}
      </Link>
    )
  }

  return (
    <Link
      to={item.todo.note_id ? '/notes' : '/todos'}
      search={item.todo.note_id ? { note: item.todo.note_id } : {}}
      className={classNameRow}
    >
      {content}
    </Link>
  )
}
