import { useNotes, useSearchNotes, useDeleteNote, useNotesByTag } from '../hooks/useNotes'
import { useState } from 'react'
import type { Note, SearchResult, NoteListItem } from '../lib/api'

interface NotesListProps {
  folder?: string
  searchQuery?: string
  tag?: string | null
  onTagClick?: (tag: string) => void
}

// Unified note item type for rendering
type NoteItemData = (Note | NoteListItem) & {
  snippet?: string
  rank?: number
}

export default function NotesList({ folder, searchQuery, tag, onTagClick }: NotesListProps) {
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
  
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
  
  const deleteNoteMutation = useDeleteNote()

  const handleDelete = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) {
      return
    }
    
    try {
      await deleteNoteMutation.mutateAsync(noteId)
      if (expandedNoteId === noteId) {
        setExpandedNoteId(null)
      }
    } catch (err) {
      alert('Failed to delete note')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2 text-gray-500">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">{isSearchMode ? 'Searching...' : 'Loading notes...'}</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 border border-red-200">
        <p className="text-sm text-red-800">
          {isSearchMode ? 'Search failed' : isTagMode ? 'Failed to load notes by tag' : 'Failed to load notes'}
        </p>
      </div>
    )
  }

  // Normalize all data sources to unified format
  const notes: NoteItemData[] = isSearchMode 
    ? (searchResults || []).map(sr => ({ ...sr.note, snippet: sr.snippet, rank: sr.rank }))
    : isTagMode 
    ? (tagResults || [])
    : (notesData?.notes || [])

  if (notes.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 p-6 text-center border border-gray-200">
        <svg
          className="mx-auto h-10 w-10 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="mt-2 text-sm text-gray-600">
          {isSearchMode ? 'No notes found for this search' : isTagMode ? 'No notes with this tag' : 'No notes in this folder'}
        </p>
      </div>
    )
  }

  return (
    <div role="list" aria-label={isSearchMode ? 'Search results' : 'Notes list'} className="space-y-3">
      {notes.map((note) => (
        <NoteItem
          key={note.id}
          note={note}
          isExpanded={expandedNoteId === note.id}
          onToggle={() => setExpandedNoteId(expandedNoteId === note.id ? null : note.id)}
          onDelete={() => handleDelete(note.id)}
          onTagClick={onTagClick}
        />
      ))}
    </div>
  )
}

interface NoteItemProps {
  note: NoteItemData
  isExpanded: boolean
  onToggle: () => void
  onDelete: () => void
  onTagClick?: (tag: string) => void
}

function NoteItem({ note, isExpanded, onToggle, onDelete, onTagClick }: NoteItemProps) {
  const hasSnippet = !!note.snippet
  const hasContent = 'content' in note && note.content
  
  return (
    <div
      className={`rounded-lg border transition-all ${
        isExpanded
          ? 'border-blue-300 shadow-md bg-blue-50'
          : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
      role="listitem"
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 text-left flex items-start justify-between gap-3 hover:bg-gray-50 transition-colors rounded-t-lg"
        aria-expanded={isExpanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-gray-900 truncate">{note.title}</h4>
            {hasSnippet && note.rank && (
              <span className="flex-shrink-0 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-medium">
                {Math.round(note.rank * 100)}% match
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              {note.folder_path}
            </span>
            <span className="flex items-center gap-1">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {new Date(note.updated_at || note.created_at).toLocaleDateString()}
            </span>
            {note.word_count > 0 && (
              <span className="flex items-center gap-1">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                  />
                </svg>
                {note.word_count} words
              </span>
            )}
          </div>
          {note.tags && note.tags.length > 0 && (
            <div className="mt-2 flex gap-1 flex-wrap">
              {note.tags.slice(0, 5).map((tag) => (
                <button
                  key={tag}
                  onClick={(e) => {
                    e.stopPropagation()
                    onTagClick?.(tag)
                  }}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                  title={`Filter by tag: ${tag}`}
                >
                  🏷️ {tag}
                </button>
              ))}
              {note.tags.length > 5 && (
                <span className="text-xs text-gray-500">+{note.tags.length - 5} more</span>
              )}
            </div>
          )}
        </div>
        <svg
          className={`h-5 w-5 text-gray-400 transition-transform flex-shrink-0 ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-200">
          {hasSnippet ? (
            <div className="mb-3">
              <div className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
                Search match:
              </div>
              <div
                className="text-sm text-gray-700 p-3 bg-yellow-50 rounded border border-yellow-100"
                dangerouslySetInnerHTML={{ __html: note.snippet || '' }}
              />
            </div>
          ) : hasContent ? (
            <div className="mb-3">
              <div className="text-xs font-medium text-gray-500 mb-1.5">Content preview:</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto p-3 bg-gray-50 rounded border border-gray-200">
                {(note as Note).content.substring(0, 500)}
                {(note as Note).content.length > 500 && '...'}
              </div>
            </div>
          ) : null}
          
          <div className="flex items-center justify-between pt-2 border-t border-gray-200">
            <div className="text-xs text-gray-500 flex items-center gap-3">
              {note.confidence && (
                <span className="flex items-center gap-1">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  {Math.round(note.confidence * 100)}% confidence
                </span>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="text-xs text-red-600 hover:text-red-800 font-medium transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

