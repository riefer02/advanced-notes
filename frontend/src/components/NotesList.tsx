import { ChevronRight, Pin } from 'lucide-react'
import { useNotes, useSearchNotes, useNotesByTag } from '../hooks/useNotes'
import type { Note, NoteView } from '../lib/api'

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
}

export default function NotesList({
  folder,
  searchQuery,
  tag,
  view = 'active',
  onTagClick,
  onNoteSelect,
  selectedNoteId,
}: NotesListProps) {
  // Use exactly one source: search, tag, or the folder/browse list.
  const isSearchMode = !!searchQuery?.trim()
  const isTagMode = !!tag && !isSearchMode

  const notesQuery = useNotes(folder, 50, 0, !isSearchMode && !isTagMode, view)
  const searchQueryHook = useSearchNotes(searchQuery || '')
  const tagQueryHook = useNotesByTag(tag || null, 50, isTagMode)
  const { data: notesData, isLoading: notesLoading, error: notesError } = notesQuery
  const { data: searchResults, isLoading: searchLoading, error: searchError } = searchQueryHook
  const { data: tagResults, isLoading: tagLoading, error: tagError } = tagQueryHook

  const isLoading = isSearchMode ? searchLoading : isTagMode ? tagLoading : notesLoading
  const error = isSearchMode ? searchError : isTagMode ? tagError : notesError

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
      </div>
    )
  }

  // Normalize all data sources to unified format
  const notes: NoteItemData[] = isSearchMode
    ? (searchResults || []).map((sr) => ({ ...sr.note, snippet: sr.snippet, rank: sr.rank }))
    : isTagMode
      ? tagResults || []
      : notesData?.notes || []

  if (notes.length === 0) {
    return (
      <div className="border-line bg-surface-muted/40 rounded-xl border border-dashed p-8 text-center">
        <svg
          className="text-line-strong mx-auto size-10"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="text-ink mt-3 text-sm font-semibold">
          {isSearchMode
            ? 'No results found'
            : isTagMode
              ? 'No notes with this tag yet'
              : view === 'trash'
                ? 'Trash is empty'
                : view === 'archived'
                  ? 'No archived notes'
                  : 'No notes yet'}
        </h3>
        <p className="text-ink-muted mx-auto mt-1.5 max-w-sm text-[13px] leading-5">
          {isSearchMode
            ? 'Try adjusting your search terms or browse all notes'
            : isTagMode
              ? 'Create notes with this tag by recording audio or writing a note'
              : view === 'trash'
                ? 'Notes you delete appear here and can be restored or purged.'
                : view === 'archived'
                  ? 'Archive a note to keep it out of the active list without deleting it.'
                  : 'Record a voice note or write one yourself — both are organized with AI-powered tagging'}
        </p>
        {!isSearchMode && !isTagMode && view === 'active' && (
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <p className="text-ink-subtle text-xs">
              Use the <span className="text-ink font-medium">Record / Upload</span> or{' '}
              <span className="text-ink font-medium">Write</span> tab in the Capture panel to create
              your first note.
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
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
          className={`text-line-strong mt-0.5 size-4 shrink-0 transition-opacity ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          aria-hidden
        />
      </div>

      <div className="text-ink-subtle mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4">
        <span>
          {new Date(note.updated_at || note.created_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </span>
        {note.word_count > 0 && (
          <>
            <span aria-hidden className="bg-line-strong size-0.5 rounded-full" />
            <span className="tabular-nums">{note.word_count} words</span>
          </>
        )}
        {note.tags?.slice(0, 3).map((tag) => (
          <button
            key={tag}
            onClick={(event) => {
              event.stopPropagation()
              onTagClick?.(tag)
            }}
            className="hover:text-brand focus-visible:ring-ring max-w-28 truncate rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
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
