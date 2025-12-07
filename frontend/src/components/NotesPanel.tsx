import { useState, useEffect, useRef } from 'react'
import FolderTree from './FolderTree'
import NotesList, { NoteItemData } from './NotesList'
import SearchBar from './SearchBar'
import TagCloud from './TagCloud'
import SlideOver from './ui/SlideOver'
import NoteDetail from './NoteDetail'
import { useNotes, useSearchNotes, useNotesByTag, useDeleteNote } from '../hooks/useNotes'

export default function NotesPanel() {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showFolders, setShowFolders] = useState(false)
  
  // Selection State
  const [selectedNote, setSelectedNote] = useState<NoteItemData | null>(null)
  
  const searchInputRef = useRef<HTMLInputElement>(null)
  const deleteNoteMutation = useDeleteNote()

  // Get counts for different views
  const { data: allNotes } = useNotes()
  const { data: searchResults } = useSearchNotes(searchQuery)
  const { data: tagNotes } = useNotesByTag(selectedTag)
  
  const noteCount = searchQuery 
    ? searchResults?.length || 0
    : selectedTag 
    ? tagNotes?.length || 0
    : selectedFolder
    ? 0 // Will be calculated by NotesList (we don't have this easily here without filtering)
    : allNotes?.notes?.length || 0

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // "/" to focus search (unless already in an input)
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleDeleteNote = async () => {
    if (!selectedNote) return
    
    if (!confirm('Are you sure you want to delete this note?')) {
      return
    }

    try {
      await deleteNoteMutation.mutateAsync(selectedNote.id)
      setSelectedNote(null) // Close slide-over
    } catch (err) {
      alert('Failed to delete note')
    }
  }

  return (
    <div className="h-full bg-white flex flex-col">
      <div className="p-6 space-y-6 flex-1 overflow-y-auto">
        {/* Header */}
        <div className="border-b pb-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Your Notes</h2>
            {!searchQuery && !selectedTag && !selectedFolder && (
              <span className="text-sm font-medium text-gray-500">
                {noteCount} {noteCount === 1 ? 'note' : 'notes'}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            🏷️ Tag-first organization powered by AI
          </p>
        </div>

        {/* Search Bar */}
        <SearchBar
          ref={searchInputRef}
          value={searchQuery}
          onChange={(query) => {
            setSearchQuery(query)
            // Clear tag and folder selections when searching
            if (query) {
              setSelectedTag(null)
              setSelectedFolder(null)
            }
          }}
          onClear={() => setSearchQuery('')}
        />

        {/* Tag Cloud - Primary Navigation */}
        <TagCloud
          selectedTag={selectedTag}
          onSelectTag={(tag) => {
            setSelectedTag(tag)
            setSelectedFolder(null) // Clear folder selection when tag is selected
          }}
        />

        {/* Active Filter Context */}
        {(searchQuery || selectedTag || selectedFolder) && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              {searchQuery ? (
                <>
                  <svg className="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium text-blue-900">
                    Found {noteCount} result{noteCount !== 1 ? 's' : ''} for "{searchQuery}"
                  </span>
                </>
              ) : selectedTag ? (
                <>
                  <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <span className="font-medium text-blue-900">
                    Showing {noteCount} note{noteCount !== 1 ? 's' : ''} tagged with "{selectedTag}"
                  </span>
                </>
              ) : selectedFolder ? (
                <>
                  <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="font-medium text-blue-900">
                    Viewing folder: {selectedFolder}
                  </span>
                </>
              ) : null}
            </div>
            <button
              onClick={() => {
                setSearchQuery('')
                setSelectedTag(null)
                setSelectedFolder(null)
              }}
              className="text-xs text-blue-700 hover:text-blue-900 font-medium flex items-center gap-1"
            >
              Clear
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="space-y-4">
          {searchQuery ? (
            /* Show search results when searching */
            <NotesList 
              searchQuery={searchQuery} 
              onTagClick={(tag) => {
                setSelectedTag(tag)
                setSearchQuery('')
              }}
              onNoteSelect={setSelectedNote}
              selectedNoteId={selectedNote?.id}
            />
          ) : selectedTag ? (
            /* Show notes filtered by tag */
            <NotesList 
              tag={selectedTag} 
              onTagClick={(tag) => setSelectedTag(tag)}
              onNoteSelect={setSelectedNote}
              selectedNoteId={selectedNote?.id}
            />
          ) : (
            /* Show folder tree (de-emphasized) and selected folder notes */
            <>
              <button
                onClick={() => setShowFolders(!showFolders)}
                className="text-sm text-gray-600 hover:text-gray-800 flex items-center gap-1"
              >
                <svg
                  className={`h-4 w-4 transition-transform ${showFolders ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {showFolders ? 'Hide' : 'Show'} folder view
              </button>
              
              {showFolders && (
                <>
                  <FolderTree
                    selectedFolder={selectedFolder}
                    onSelectFolder={(folder) => {
                      setSelectedFolder(folder)
                      setSelectedTag(null) // Clear tag selection when folder is selected
                    }}
                  />
                  {selectedFolder && (
                    <div className="mt-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">
                        Notes in {selectedFolder}
                      </h3>
                      <NotesList 
                        folder={selectedFolder}
                        onTagClick={(tag) => {
                          setSelectedTag(tag)
                          setSelectedFolder(null)
                        }}
                        onNoteSelect={setSelectedNote}
                        selectedNoteId={selectedNote?.id}
                      />
                    </div>
                  )}
                </>
              )}
              
              {!showFolders && !selectedFolder && (
                 <NotesList 
                   onTagClick={(tag) => setSelectedTag(tag)}
                   onNoteSelect={setSelectedNote}
                   selectedNoteId={selectedNote?.id}
                 />
              )}
            </>
          )}
        </div>
      </div>

      {/* Note Detail Slide-Over */}
      <SlideOver
        isOpen={!!selectedNote}
        onClose={() => setSelectedNote(null)}
        title={selectedNote?.title || 'Note Details'}
        width="max-w-xl"
      >
        {selectedNote && (
          <NoteDetail 
            note={selectedNote} 
            onDelete={handleDeleteNote}
          />
        )}
      </SlideOver>
    </div>
  )
}
