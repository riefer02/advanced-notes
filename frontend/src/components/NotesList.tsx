import { useMemo } from 'react'
import { ChevronRight, FileText, Pin } from 'lucide-react'
import { useNotesInfinite, useSearchNotes, useNotesByTag } from '../hooks/useNotes'
import { formatShortDate, pluralize } from '../lib/format'
import type { Note, NoteView } from '../lib/api'
import { Button } from '@/components/ui/button'

// The backend hard-caps search at 50 results and tag lookups at 50 notes.
const SEARCH_RESULT_CAP = 50
const TAG_RESULT_CAP = 50

// Define NoteItemData locally but export for usage if needed (though Note is usually enough)
export type NoteItemData = Note & {
  snippet?: string
  rank?: number
}

interface NotesListProps {
  folder?: string
  searchQuery?: string
  tag?: string | null
  view?: NoteView
  onTagClick?: (tag: string) => void
  onNoteSelect: (note: NoteItemData) => void
  selectedNoteId?: string | null
  /** Clears search/tag/folder filters (and returns to the active view). */
  onBrowseAll?: () => void
  /** Opens the capture panel; a real next action instead of instructions. */
  onCreateNote?: (mode: 'record' | 'write') => void
}

export default function NotesList({
  folder,
  searchQuery,
  tag,
  view = 'active',
  onTagClick,
  onNoteSelect,
  selectedNoteId,
  onBrowseAll,
  onCreateNote,
}: NotesListProps) {
  // Use exactly one source: search, tag, or the paginated folder/browse list.
  const isSearchMode = !!searchQuery?.trim()
  const isTagMode = !!tag && !isSearchMode

  const notesQuery = useNotesInfinite(folder, view, !isSearchMode && !isTagMode)
  const searchQueryHook = useSearchNotes(searchQuery || '')
  const tagQueryHook = useNotesByTag(tag || null, TAG_RESULT_CAP, isTagMode)
  const { isLoading: notesLoading, error: notesError } = notesQuery
  const { data: searchResults, isLoading: searchLoading, error: searchError } = searchQueryHook
  const { data: tagResults, isLoading: tagLoading, error: tagError } = tagQueryHook

  const isLoading = isSearchMode ? searchLoading : isTagMode ? tagLoading : notesLoading
  const error = isSearchMode ? searchError : isTagMode ? tagError : notesError

  // Pages can overlap when a new note shifts offsets; dedupe by id.
  const pageNotes = useMemo(() => {
    const seen = new Set<string>()
    const merged: NoteItemData[] = []
    for (const page of notesQuery.data?.pages ?? []) {
      for (const note of page.notes) {
        if (seen.has(note.id)) continue
        seen.add(note.id)
        merged.push(note)
      }
    }
    return merged
  }, [notesQuery.data])

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading notes">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="border-line bg-surface animate-pulse rounded-xl border p-3">
            <div className="bg-surface-sunken mb-2 h-4 w-3/4 rounded"></div>
            <div className="flex items-center gap-3">
              <div className="bg-surface-sunken h-3 w-24 rounded"></div>
              <div className="bg-surface-sunken h-3 w-20 rounded"></div>
            </div>
          </div>
        ))}
        <p className="text-ink-subtle mt-4 text-center text-xs">
          {isSearchMode ? 'Searching...' : 'Loading your notes...'}
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="border-destructive/20 bg-destructive/5 rounded-xl border p-4">
        <p className="text-destructive text-sm">
          {isSearchMode
            ? 'Search failed'
            : isTagMode
              ? 'Failed to load notes by tag'
              : 'Failed to load notes'}
        </p>
        {onBrowseAll && (
          <Button variant="outline" size="sm" className="mt-3" onClick={onBrowseAll}>
            Back to all notes
          </Button>
        )}
      </div>
    )
  }

  // Normalize all data sources to unified format
  const notes: NoteItemData[] = isSearchMode
    ? (searchResults || []).map((sr) => ({ ...sr.note, snippet: sr.snippet, rank: sr.rank }))
    : isTagMode
      ? tagResults || []
      : pageNotes

  const total = notesQuery.data?.pages[0]?.total

  if (notes.length === 0) {
    return (
      <EmptyNotes
        isSearchMode={isSearchMode}
        isTagMode={isTagMode}
        searchQuery={searchQuery?.trim()}
        tag={tag}
        view={view}
        onBrowseAll={onBrowseAll}
        onCreateNote={onCreateNote}
      />
    )
  }

  return (
    <div className="space-y-2">
      <div
        role="list"
        aria-label={isSearchMode ? 'Search results' : 'Notes list'}
        className="space-y-1.5"
      >
        {notes.map((note) => (
          <NoteItem
            key={note.id}
            note={note}
            isSelected={selectedNoteId === note.id}
            onClick={() => onNoteSelect(note)}
            onTagClick={onTagClick}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="text-ink-subtle text-[11px] leading-4" aria-live="polite">
          {isSearchMode
            ? notes.length >= SEARCH_RESULT_CAP
              ? `Showing first ${SEARCH_RESULT_CAP} matches — refine your search to narrow the list.`
              : pluralize(notes.length, 'match', 'matches')
            : isTagMode
              ? notes.length >= TAG_RESULT_CAP
                ? `Showing first ${TAG_RESULT_CAP} notes with #${tag}.`
                : pluralize(notes.length, 'note')
              : total != null && notes.length < total
                ? `Showing ${notes.length} of ${pluralize(total, 'note')}`
                : `Showing ${pluralize(notes.length, 'note')}`}
        </p>
        {!isSearchMode && !isTagMode && notesQuery.hasNextPage && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void notesQuery.fetchNextPage()}
            loading={notesQuery.isFetchingNextPage}
          >
            Load more
          </Button>
        )}
      </div>
    </div>
  )
}

function EmptyNotes({
  isSearchMode,
  isTagMode,
  searchQuery,
  tag,
  view,
  onBrowseAll,
  onCreateNote,
}: {
  isSearchMode: boolean
  isTagMode: boolean
  searchQuery?: string
  tag?: string | null
  view: NoteView
  onBrowseAll?: () => void
  onCreateNote?: (mode: 'record' | 'write') => void
}) {
  const title = isSearchMode
    ? 'No results found'
    : isTagMode
      ? 'No notes with this tag yet'
      : view === 'trash'
        ? 'Trash is empty'
        : view === 'archived'
          ? 'No archived notes'
          : 'No notes yet'

  const description = isSearchMode
    ? searchQuery
      ? `Nothing matches “${searchQuery}”. Try a shorter phrase, or search all notes.`
      : 'Try a shorter phrase, or browse all notes.'
    : isTagMode
      ? `Nothing is tagged #${tag} yet. Browse all notes to pick another tag.`
      : view === 'trash'
        ? 'Notes you delete appear here and can be restored or purged.'
        : view === 'archived'
          ? 'Archive a note to keep it out of the active list without deleting it.'
          : 'Record a thought or write it down — folders and tags are organized for you.'

  return (
    <div className="border-line bg-surface-muted/40 rounded-xl border border-dashed p-8 text-center">
      <FileText className="text-line-strong mx-auto size-10" aria-hidden />
      <h3 className="text-ink mt-3 text-sm font-semibold">{title}</h3>
      <p className="text-ink-muted mx-auto mt-1.5 max-w-sm text-[13px] leading-5">{description}</p>

      {(isSearchMode || isTagMode || view !== 'active') && onBrowseAll ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onBrowseAll}>
          {view === 'active' ? 'Show all notes' : 'Back to active notes'}
        </Button>
      ) : onCreateNote ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" onClick={() => onCreateNote('write')}>
            Write a note
          </Button>
          <Button variant="outline" size="sm" onClick={() => onCreateNote('record')}>
            Record audio
          </Button>
        </div>
      ) : null}
    </div>
  )
}

interface NoteItemProps {
  note: NoteItemData
  isSelected: boolean
  onClick: () => void
  onTagClick?: (tag: string) => void
}

function NoteItem({ note, isSelected, onClick, onTagClick }: NoteItemProps) {
  const hasSnippet = !!note.snippet
  const contentPreview =
    note.summary?.trim() ||
    (note.content
      ? note.content.substring(0, 150)
      : note.snippet?.replace(/<[^>]*>/g, '').substring(0, 150) || '')

  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer rounded-xl border p-3 transition-[border-color,box-shadow,background-color] duration-150 ${
        isSelected
          ? 'border-brand/40 bg-brand-soft/50 ring-brand/15 ring-1'
          : 'border-line bg-surface hover:border-line-strong hover:shadow-lift'
      }`}
      role="listitem"
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onClick()
          }}
          className="focus-visible:ring-ring min-w-0 flex-1 rounded-md text-left focus-visible:ring-2 focus-visible:outline-none"
          aria-label={`Open note: ${note.title}`}
        >
          <span className="flex items-center gap-1.5">
            <span
              className={`truncate text-[13px] leading-5 font-semibold tracking-[-0.01em] ${
                isSelected ? 'text-brand' : 'text-ink'
              }`}
            >
              {note.title}
            </span>
            {note.pinned_at && (
              <Pin
                className="size-3 shrink-0 text-warning"
                fill="currentColor"
                aria-label="Pinned"
              />
            )}
            {hasSnippet && note.rank && (
              <span className="text-2xs shrink-0 rounded bg-warning-soft px-1.5 py-0.5 font-medium tracking-tight text-warning tabular-nums">
                {Math.round(note.rank * 100)}%
              </span>
            )}
          </span>

          <span className="text-ink-muted mt-0.5 line-clamp-2 block text-xs leading-5">
            {contentPreview}
          </span>
        </button>

        <ChevronRight
          className={`text-line-strong mt-0.5 size-4 shrink-0 transition-opacity max-sm:opacity-100 ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          aria-hidden
        />
      </div>

      <div className="text-ink-subtle mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4">
        <span>{formatShortDate(note.updated_at || note.created_at)}</span>
        {note.word_count > 0 && (
          <>
            <span aria-hidden className="bg-line-strong size-0.5 rounded-full" />
            <span className="tabular-nums">{pluralize(note.word_count, 'word')}</span>
          </>
        )}
        {note.tags?.slice(0, 3).map((tag) => (
          <button
            key={tag}
            onClick={(event) => {
              event.stopPropagation()
              onTagClick?.(tag)
            }}
            className="hover:text-brand focus-visible:ring-ring max-w-28 truncate rounded transition-colors focus-visible:ring-2 focus-visible:outline-none max-sm:inline-flex max-sm:min-h-9 max-sm:items-center"
          >
            #{tag}
          </button>
        ))}
        {note.tags && note.tags.length > 3 && (
          <span className="text-ink-subtle">+{note.tags.length - 3}</span>
        )}
      </div>
    </div>
  )
}
