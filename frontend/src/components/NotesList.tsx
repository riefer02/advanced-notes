import { useNotes, useSearchNotes, useDeleteNote } from '../hooks/useNotes'
import { useState } from 'react'
import type { Note, SearchResult } from '../lib/api'

interface NotesListProps {
  folder?: string
  searchQuery?: string
}

export default function NotesList({ folder, searchQuery }: NotesListProps) {
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
  
  // Use either notes query or search query
  const notesQuery = useNotes(folder)
  const searchQueryHook = useSearchNotes(searchQuery || '')
  
  const isSearchMode = !!searchQuery
  const { data: notesData, isLoading: notesLoading, error: notesError } = notesQuery
  const { data: searchResults, isLoading: searchLoading, error: searchError } = searchQueryHook
  
  const isLoading = isSearchMode ? searchLoading : notesLoading
  const error = isSearchMode ? searchError : notesError
  
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
          {isSearchMode ? 'Search failed' : 'Failed to load notes'}
        </p>
      </div>
    )
  }

  const notes = isSearchMode ? searchResults || [] : notesData?.notes || []

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
          {isSearchMode ? 'No notes found for this search' : 'No notes in this folder'}
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
          isSearch={isSearchMode}
          isExpanded={expandedNoteId === note.id}
          onToggle={() => setExpandedNoteId(expandedNoteId === note.id ? null : note.id)}
          onDelete={() => handleDelete(note.id)}
        />
      ))}
    </div>
  )
}

interface NoteItemProps {
  note: Note | SearchResult
  isSearch: boolean
  isExpanded: boolean
  onToggle: () => void
  onDelete: () => void
}

function NoteItem({ note, isSearch, isExpanded, onToggle, onDelete }: NoteItemProps) {
  const searchResult = isSearch ? (note as SearchResult) : null
  
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
          <h4 className="text-sm font-semibold text-gray-900 truncate">{note.title}</h4>
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
              {note.folder_path || 'folder_path' in note && note.folder_path}
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
              {new Date(note.created_at).toLocaleDateString()}
            </span>
          </div>
          {note.tags.length > 0 && (
            <div className="mt-2 flex gap-1 flex-wrap">
              {note.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700"
                >
                  {tag}
                </span>
              ))}
              {note.tags.length > 3 && (
                <span className="text-xs text-gray-500">+{note.tags.length - 3}</span>
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
          {searchResult && searchResult.snippet ? (
            <div
              className="text-sm text-gray-700 prose prose-sm max-w-none mb-3"
              dangerouslySetInnerHTML={{ __html: searchResult.snippet }}
            />
          ) : (
            'content' in note && (
              <div className="text-sm text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto mb-3 p-3 bg-white rounded border border-gray-200">
                {note.content.substring(0, 500)}
                {note.content.length > 500 && '...'}
              </div>
            )
          )}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200">
            <div className="text-xs text-gray-500">
              {'word_count' in note && note.word_count && (
                <span>{note.word_count} words</span>
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

