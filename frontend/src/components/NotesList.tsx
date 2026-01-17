import { useNotes, useSearchNotes, useNotesByTag } from '../hooks/useNotes'
import type { Note } from '../lib/api'

// Define NoteItemData locally but export for usage if needed (though Note is usually enough)
export type NoteItemData = Note & {
  snippet?: string
  rank?: number
}

interface NotesListProps {
  folder?: string
  searchQuery?: string
  tag?: string | null
  onTagClick?: (tag: string) => void
  onNoteSelect: (note: NoteItemData) => void
  selectedNoteId?: string | null
}

export default function NotesList({
  folder,
  searchQuery,
  tag,
  onTagClick,
  onNoteSelect,
  selectedNoteId,
}: NotesListProps) {
  // Use either notes query, search query, or tag query
  const notesQuery = useNotes(folder)
  const searchQueryHook = useSearchNotes(searchQuery || '')
  const tagQueryHook = useNotesByTag(tag || null)

  const isSearchMode = !!searchQuery
  const isTagMode = !!tag && !searchQuery
  const { data: notesData, isLoading: notesLoading, error: notesError } = notesQuery
  const { data: searchResults, isLoading: searchLoading, error: searchError } = searchQueryHook
  const { data: tagResults, isLoading: tagLoading, error: tagError } = tagQueryHook

  const isLoading = isSearchMode ? searchLoading : isTagMode ? tagLoading : notesLoading
  const error = isSearchMode ? searchError : isTagMode ? tagError : notesError

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading notes">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-3/4 mb-3"></div>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-3 bg-gray-200 rounded w-24"></div>
              <div className="h-3 bg-gray-200 rounded w-20"></div>
            </div>
          </div>
        ))}
        <p className="text-center text-sm text-gray-500 mt-4">
          {isSearchMode ? 'Searching...' : 'Loading your notes...'}
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 border border-red-200">
        <p className="text-sm text-red-800">
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
      <div className="rounded-lg bg-gradient-to-br from-gray-50 to-blue-50 p-8 text-center border-2 border-dashed border-gray-300">
        <svg
          className="mx-auto h-16 w-16 text-gray-400"
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
        <h3 className="mt-4 text-lg font-semibold text-gray-900">
          {isSearchMode
            ? 'No results found'
            : isTagMode
              ? 'No notes with this tag yet'
              : 'No notes yet'}
        </h3>
        <p className="mt-2 text-sm text-gray-600 max-w-sm mx-auto">
          {isSearchMode
            ? 'Try adjusting your search terms or browse all notes'
            : isTagMode
              ? 'Create notes with this tag by recording new audio notes'
              : 'Start recording your first voice note to get organized with AI-powered tagging'}
        </p>
        {!isSearchMode && !isTagMode && (
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <p className="text-xs text-gray-500">
              Use the <span className="font-semibold text-gray-700">Start Recording</span> button in
              the left panel to create your first note.
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
      className="space-y-2"
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
  const contentPreview = note.content
    ? note.content.substring(0, 150)
    : note.snippet?.replace(/<[^>]*>/g, '').substring(0, 150) || ''

  return (
    <div
      onClick={onClick}
      className={`
        group relative rounded-lg border p-4 cursor-pointer transition-all
        ${
          isSelected
            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 shadow-sm'
            : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
        }
      `}
      role="listitem"
    >
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4
              className={`text-sm font-semibold truncate ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}
            >
              {note.title}
            </h4>
            {hasSnippet && note.rank && (
              <span className="flex-shrink-0 text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded-full font-medium">
                {Math.round(note.rank * 100)}%
              </span>
            )}
          </div>

          <p
            className={`text-sm line-clamp-2 mb-2 ${isSelected ? 'text-blue-800' : 'text-gray-600'}`}
          >
            {contentPreview}
          </p>

          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>{new Date(note.updated_at || note.created_at).toLocaleDateString()}</span>
            {note.word_count > 0 && <span>{note.word_count} words</span>}
          </div>
        </div>

        <div
          className={`opacity-0 group-hover:opacity-100 transition-opacity ${isSelected ? 'opacity-100' : ''}`}
        >
          <svg
            className="h-5 w-5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      {/* Tags row - prevent click propagation to not select note when clicking tag */}
      {note.tags && note.tags.length > 0 && (
        <div className="mt-3 flex gap-1 flex-wrap">
          {note.tags.slice(0, 3).map((tag) => (
            <button
              key={tag}
              onClick={(e) => {
                e.stopPropagation()
                onTagClick?.(tag)
              }}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-700 transition-colors"
            >
              {tag}
            </button>
          ))}
          {note.tags.length > 3 && (
            <span className="text-xs text-gray-400">+{note.tags.length - 3}</span>
          )}
        </div>
      )}
    </div>
  )
}
