import { useNotes, useSearchNotes, useDeleteNote, useNotesByTag } from '../hooks/useNotes'
import { useState } from 'react'
import type { Note } from '../lib/api'

interface NotesListProps {
  folder?: string
  searchQuery?: string
  tag?: string | null
  onTagClick?: (tag: string) => void
}

// Unified note item type for rendering (all sources now return full Note objects)
type NoteItemData = Note & {
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
      <div className="space-y-3" role="status" aria-label="Loading notes">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 animate-pulse">
            {/* Title skeleton */}
            <div className="h-5 bg-gray-200 rounded w-3/4 mb-3"></div>
            
            {/* Metadata skeleton */}
            <div className="flex items-center gap-3 mb-3">
              <div className="h-3 bg-gray-200 rounded w-24"></div>
              <div className="h-3 bg-gray-200 rounded w-20"></div>
              <div className="h-3 bg-gray-200 rounded w-16"></div>
            </div>
            
            {/* Tags skeleton */}
            <div className="flex gap-2">
              <div className="h-6 bg-gray-200 rounded-full w-16"></div>
              <div className="h-6 bg-gray-200 rounded-full w-20"></div>
              <div className="h-6 bg-gray-200 rounded-full w-14"></div>
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
            <button
              onClick={() => {
                // Trigger the record button via keyboard shortcut simulation
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }))
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
              Record Your First Note
            </button>
            <p className="text-xs text-gray-500">
              or press <kbd className="px-1.5 py-0.5 text-xs font-semibold text-gray-800 bg-white border border-gray-300 rounded shadow-sm">R</kbd>
            </p>
          </div>
        )}
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
  const hasContent = !!note.content
  
  const contentPreview = hasContent 
    ? note.content.substring(0, 150)
    : hasSnippet 
    ? note.snippet?.replace(/<[^>]*>/g, '').substring(0, 150)
    : ''

  return (
    <div
      className={`rounded-lg border transition-all ${
        isExpanded
          ? 'border-blue-400 shadow-lg bg-white'
          : 'border-gray-200 hover:border-gray-300 bg-white hover:shadow-sm'
      }`}
      role="listitem"
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 text-left flex items-start justify-between gap-3 hover:bg-gray-50 transition-colors"
        aria-expanded={isExpanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-base font-semibold text-gray-900">{note.title}</h4>
            {hasSnippet && note.rank && (
              <span className="flex-shrink-0 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-medium">
                {Math.round(note.rank * 100)}% match
              </span>
            )}
          </div>
          
          {/* Preview text */}
          {!isExpanded && contentPreview && (
            <p className="text-sm text-gray-600 line-clamp-2 mb-2">
              {contentPreview}{contentPreview.length >= 150 ? '...' : ''}
            </p>
          )}
          
          <div className="flex items-center gap-3 text-xs text-gray-500">
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
        <div className="flex flex-col items-center gap-1">
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
          {!isExpanded && (
            <span className="text-xs text-blue-600 font-medium">Read</span>
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-3 border-t-2 border-blue-100 bg-blue-50/30">
          {hasSnippet ? (
            <div className="mb-3">
              <div className="text-xs font-medium text-yellow-700 mb-2 flex items-center gap-1">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
                Search match:
              </div>
              <div
                className="text-base leading-relaxed text-gray-800 p-4 bg-yellow-50 rounded-lg border border-yellow-200"
                dangerouslySetInnerHTML={{ __html: note.snippet || '' }}
              />
            </div>
          ) : hasContent ? (
            <div className="mb-3">
              <div className="text-base leading-relaxed text-gray-800 whitespace-pre-wrap max-h-96 overflow-y-auto p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                {note.content}
              </div>
            </div>
          ) : null}
          
          <div className="flex items-center justify-between pt-3">
            <div className="text-xs text-gray-500">
              {/* Optional metadata - kept minimal */}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:text-white hover:bg-red-600 font-medium transition-all rounded-md border border-red-200 hover:border-red-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

