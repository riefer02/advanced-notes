import { useState, useEffect, useRef } from 'react'
import FolderTree from './FolderTree'
import NotesList, { NoteItemData } from './NotesList'
import SearchBar from './SearchBar'
import TagCloud from './TagCloud'
import SlideOver from './ui/SlideOver'
import NoteDetail from './NoteDetail'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useArchiveNote,
  useDeleteNote,
  useNote,
  useNotes,
  useNotesByTag,
  usePinNote,
  usePurgeNote,
  useRestoreNote,
  useSearchNotes,
} from '../hooks/useNotes'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import type { NoteView } from '../lib/api'

interface NotesPanelProps {
  focusNoteId?: string | null
  onFocusHandled?: () => void
}

export default function NotesPanel({ focusNoteId, onFocusHandled }: NotesPanelProps) {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showFolders, setShowFolders] = useState(false)
  const [view, setView] = useState<NoteView>('active')

  // Debounce so typing does not fire a request per keystroke.
  const debouncedSearch = useDebouncedValue(searchQuery, 300)

  // Selection State
  const [selectedNote, setSelectedNote] = useState<NoteItemData | null>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const deleteNoteMutation = useDeleteNote()
  const pinMutation = usePinNote()
  const archiveMutation = useArchiveNote()
  const restoreMutation = useRestoreNote()
  const purgeMutation = usePurgeNote()

  // A capture action (record/transcribe or manual save) can ask the panel to
  // open a specific note, including from a deep link.
  const { data: focusedNote } = useNote(focusNoteId ?? '')
  useEffect(() => {
    if (focusNoteId && focusedNote) {
      if (focusedNote.deleted_at) setView('trash')
      else if (focusedNote.archived_at) setView('archived')
      setSelectedFolder(null)
      setSelectedTag(null)
      setSearchQuery('')
      setSelectedNote(focusedNote)
      onFocusHandled?.()
    }
  }, [focusNoteId, focusedNote, onFocusHandled])

  // Get counts for different views. Only one source is active at a time.
  const { data: allNotes } = useNotes(
    undefined,
    50,
    0,
    !debouncedSearch && !selectedTag && !selectedFolder,
    view
  )
  const { data: folderNotes } = useNotes(selectedFolder ?? undefined, 50, 0, !!selectedFolder, view)
  const { data: searchResults } = useSearchNotes(debouncedSearch)
  const { data: tagNotes } = useNotesByTag(selectedTag)

  const noteCount = debouncedSearch
    ? searchResults?.length || 0
    : selectedTag
      ? tagNotes?.length || 0
      : selectedFolder
        ? folderNotes?.total || 0
        : allNotes?.total || 0

  const changeView = (next: NoteView) => {
    setView(next)
    setSelectedFolder(null)
    setSelectedTag(null)
    setSearchQuery('')
    setShowFolders(false)
    setSelectedNote(null)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // "/" to focus search (unless already in an input)
      if (
        e.key === '/' &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleDeleteNote = async () => {
    if (!selectedNote) return

    if (!confirm('Move this note to Trash? You can restore it later.')) {
      return
    }

    try {
      await deleteNoteMutation.mutateAsync(selectedNote.id)
      setSelectedNote(null)
    } catch {
      alert('Failed to move note to trash')
    }
  }

  const handlePinNote = async (pinned: boolean) => {
    if (!selectedNote) return
    try {
      const updated = await pinMutation.mutateAsync({ noteId: selectedNote.id, pinned })
      setSelectedNote(updated)
    } catch {
      alert('Failed to update pin')
    }
  }

  const handleArchiveNote = async (archived: boolean) => {
    if (!selectedNote) return
    try {
      await archiveMutation.mutateAsync({ noteId: selectedNote.id, archived })
      setSelectedNote(null)
    } catch {
      alert('Failed to update archive')
    }
  }

  const handleRestoreNote = async () => {
    if (!selectedNote) return
    try {
      await restoreMutation.mutateAsync(selectedNote.id)
      setSelectedNote(null)
    } catch {
      alert('Failed to restore note')
    }
  }

  const handlePurgeNote = async () => {
    if (!selectedNote) return
    if (!confirm('Delete this note forever? This cannot be undone.')) {
      return
    }
    try {
      await purgeMutation.mutateAsync(selectedNote.id)
      setSelectedNote(null)
    } catch {
      alert('Failed to permanently delete note')
    }
  }

  return (
    <div className="h-full bg-white flex flex-col">
      <div className="p-6 space-y-6 flex-1 overflow-y-auto">
        {/* Header */}
        <div className="border-b pb-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Your Notes</h2>
            {!debouncedSearch && !selectedTag && !selectedFolder && (
              <span className="text-sm font-medium text-gray-500">
                {noteCount} {noteCount === 1 ? 'note' : 'notes'}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Capture, pin, archive, and restore — nothing is lost by accident.
          </p>
          <Tabs
            value={view}
            onValueChange={(value) => changeView(value as NoteView)}
            className="mt-3"
          >
            <TabsList className="w-full">
              <TabsTrigger value="active" className="flex-1">
                Active
              </TabsTrigger>
              <TabsTrigger value="archived" className="flex-1">
                Archived
              </TabsTrigger>
              <TabsTrigger value="trash" className="flex-1">
                Trash
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {view === 'active' ? (
          <>
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
          </>
        ) : (
          <Alert variant={view === 'trash' ? 'warning' : 'info'}>
            <AlertDescription className="text-sm">
              {view === 'trash'
                ? 'Deleted notes stay here until you restore them or delete them forever.'
                : 'Archived notes are hidden from search, tags, and folders. Unarchive one to bring it back.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Active Filter Context */}
        {(debouncedSearch || selectedTag || selectedFolder) && (
          <Alert variant="info" className="flex items-center justify-between">
            <AlertDescription className="flex items-center gap-2 text-sm">
              {debouncedSearch ? (
                <>
                  <svg className="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-medium text-blue-900">
                    Found {noteCount} result{noteCount !== 1 ? 's' : ''} for "{debouncedSearch}"
                  </span>
                </>
              ) : selectedTag ? (
                <>
                  <svg
                    className="h-4 w-4 text-blue-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                    />
                  </svg>
                  <span className="font-medium text-blue-900">
                    Showing {noteCount} note{noteCount !== 1 ? 's' : ''} tagged with "{selectedTag}"
                  </span>
                </>
              ) : selectedFolder ? (
                <>
                  <svg
                    className="h-4 w-4 text-blue-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                  <span className="font-medium text-blue-900">
                    Viewing folder: {selectedFolder}
                  </span>
                </>
              ) : null}
            </AlertDescription>
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </Alert>
        )}

        {/* Content Area */}
        <div className="space-y-4">
          {view !== 'active' ? (
            <NotesList
              view={view}
              onNoteSelect={setSelectedNote}
              selectedNoteId={selectedNote?.id}
            />
          ) : debouncedSearch ? (
            /* Show search results when searching */
            <NotesList
              searchQuery={debouncedSearch}
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
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
                {showFolders ? 'Hide' : 'Show'} folder view
              </button>

              {showFolders && (
                <FolderTree
                  selectedFolder={selectedFolder}
                  onSelectFolder={(folder) => {
                    setSelectedFolder(folder)
                    setSelectedTag(null) // Clear tag selection when folder is selected
                  }}
                />
              )}

              {selectedFolder ? (
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
              ) : (
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
            key={selectedNote.id}
            note={selectedNote}
            view={view}
            onDelete={view === 'trash' ? undefined : handleDeleteNote}
            onPin={handlePinNote}
            onArchive={handleArchiveNote}
            onRestore={handleRestoreNote}
            onPurge={handlePurgeNote}
            onUpdated={(updated) => setSelectedNote(updated)}
          />
        )}
      </SlideOver>
    </div>
  )
}
