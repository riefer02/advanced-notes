import { useEffect, useRef, useState } from 'react'
import { Folder, Search, Tag, X } from 'lucide-react'
import FolderTree from './FolderTree'
import NotesList, { NoteItemData } from './NotesList'
import SearchBar from './SearchBar'
import TagCloud from './TagCloud'
import SlideOver from './ui/SlideOver'
import NoteDetail from './NoteDetail'
import { clearNoteEditDraft } from './noteEditDraft'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useArchiveNote,
  useDeleteNote,
  useNote,
  useNotes,
  useNotesByTagPage,
  usePinNote,
  usePurgeNote,
  useRestoreNote,
  useSearchNotes,
} from '../hooks/useNotes'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { pluralize } from '../lib/format'
import type { NoteView } from '../lib/api'

interface NotesPanelProps {
  focusNoteId?: string | null
  onFocusHandled?: () => void
  /** Deep link from global search: /notes?q=… */
  initialQuery?: string
  /** Opens the capture pane with a mode preselected. */
  onStartCapture?: (mode: 'record' | 'write') => void
}

export default function NotesPanel({
  focusNoteId,
  onFocusHandled,
  initialQuery,
  onStartCapture,
}: NotesPanelProps) {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState(initialQuery ?? '')
  const [showFolders, setShowFolders] = useState(false)
  const [view, setView] = useState<NoteView>('active')
  const [editDirty, setEditDirty] = useState(false)
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<'trash' | 'purge' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

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

  // A new deep-linked query (from global search) replaces the current search.
  // Only react to a changed value, so typed text is never clobbered.
  const appliedQueryRef = useRef(initialQuery ?? '')
  useEffect(() => {
    const next = initialQuery?.trim() ?? ''
    if (!next || next === appliedQueryRef.current) return
    appliedQueryRef.current = next
    setSearchQuery(next)
    setSelectedTag(null)
    setSelectedFolder(null)
    setView('active')
    window.requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [initialQuery])

  // A capture action (record/transcribe or manual save) can ask the panel to
  // open a specific note, including from a deep link.
  useEffect(() => {
    setActionError(null)
  }, [selectedNote?.id])

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

  // Only the active filter source fetches; the count query asks for one row.
  const isBrowsing = !debouncedSearch && !selectedTag && !selectedFolder
  const { data: browseCount } = useNotes(undefined, 1, 0, isBrowsing, view)
  const { data: folderCount } = useNotes(selectedFolder ?? undefined, 1, 0, !!selectedFolder, view)
  const { data: searchResults } = useSearchNotes(debouncedSearch)
  const { data: tagPage } = useNotesByTagPage(selectedTag, 1, 0)

  // `null` while the count is unresolved — never flash "0 notes".
  const noteCount = debouncedSearch
    ? searchResults
      ? searchResults.length
      : null
    : selectedTag
      ? tagPage
        ? tagPage.total
        : null
      : selectedFolder
        ? (folderCount?.total ?? null)
        : (browseCount?.total ?? null)

  const hasFilters = !!searchQuery.trim() || !!selectedTag || !!selectedFolder

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedTag(null)
    setSelectedFolder(null)
  }

  const browseAll = () => {
    clearFilters()
    setShowFolders(false)
    setView('active')
  }

  const changeView = (next: NoteView) => {
    setView(next)
    setSelectedFolder(null)
    setSelectedTag(null)
    setSearchQuery('')
    setShowFolders(false)
    setSelectedNote(null)
    setEditDirty(false)
    setConfirmDiscardOpen(false)
  }

  // A different note in the drawer starts from a clean edit state.
  useEffect(() => {
    setEditDirty(false)
  }, [selectedNote?.id])

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

  // The drawer's X, backdrop, and Escape all land here. Unsaved edits need an
  // explicit discard before the drawer can close.
  const requestCloseNote = () => {
    // The confirm dialog owns Escape while it is open; ignore the drawer's
    // close so the same keypress cannot reopen it.
    if (confirmDiscardOpen) return
    if (editDirty) {
      setConfirmDiscardOpen(true)
      return
    }
    setSelectedNote(null)
  }

  // Escape while the confirm dialog is open means "keep editing": close only
  // the dialog, before the drawer's own Escape handler can see the keypress.
  useEffect(() => {
    if (!confirmDiscardOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setConfirmDiscardOpen(false)
    }
    window.addEventListener('keydown', handleEscape, true)
    return () => window.removeEventListener('keydown', handleEscape, true)
  }, [confirmDiscardOpen])

  const discardAndClose = () => {
    if (selectedNote) clearNoteEditDraft(selectedNote.id)
    setEditDirty(false)
    setSelectedNote(null)
  }

  const handleDeleteNote = () => {
    if (!selectedNote) return
    setActionError(null)
    setPendingDelete('trash')
  }

  const confirmDelete = async () => {
    if (!selectedNote || !pendingDelete) return
    const noteId = selectedNote.id
    const isPurge = pendingDelete === 'purge'
    try {
      if (isPurge) {
        await purgeMutation.mutateAsync(noteId)
      } else {
        await deleteNoteMutation.mutateAsync(noteId)
      }
      clearNoteEditDraft(noteId)
      setSelectedNote(null)
    } catch {
      setActionError(
        isPurge ? 'Failed to permanently delete note.' : 'Failed to move note to trash.'
      )
    } finally {
      setPendingDelete(null)
    }
  }

  const handlePinNote = async (pinned: boolean) => {
    if (!selectedNote) return
    try {
      const updated = await pinMutation.mutateAsync({ noteId: selectedNote.id, pinned })
      setSelectedNote(updated)
    } catch {
      setActionError('Could not update the pin. Please try again.')
    }
  }

  const handleArchiveNote = async (archived: boolean) => {
    if (!selectedNote) return
    try {
      await archiveMutation.mutateAsync({ noteId: selectedNote.id, archived })
      setSelectedNote(null)
    } catch {
      setActionError('Could not update the archive. Please try again.')
    }
  }

  const handleRestoreNote = async () => {
    if (!selectedNote) return
    try {
      await restoreMutation.mutateAsync(selectedNote.id)
      setSelectedNote(null)
    } catch {
      setActionError('Could not restore the note. Please try again.')
    }
  }

  const handlePurgeNote = () => {
    if (!selectedNote) return
    setActionError(null)
    setPendingDelete('purge')
  }

  const listActions = {
    onBrowseAll: browseAll,
    onCreateNote: onStartCapture,
  }

  return (
    <div className="bg-surface flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {/* Header */}
        <div className="border-line border-b pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-ink text-xl leading-6 font-semibold tracking-[-0.02em]">
              Your Notes
            </h2>
            <span aria-live="polite" className="text-ink-subtle text-xs font-medium tabular-nums">
              {noteCount === null ? (
                <>
                  <span className="sr-only">Loading notes</span>
                  <span
                    aria-hidden
                    className="bg-surface-sunken inline-block h-3 w-12 animate-pulse rounded"
                  />
                </>
              ) : (
                pluralize(noteCount, 'note')
              )}
            </span>
          </div>
          <Tabs
            value={view}
            onValueChange={(value) => changeView(value as NoteView)}
            className="mt-2.5"
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
          <div className="space-y-2">
            {/* Compact filter toolbar: search + tag dialog + folder toggle */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-48 flex-1">
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
              </div>
              <div className="flex items-center gap-1.5">
                <TagCloud
                  selectedTag={selectedTag}
                  onSelectTag={(tag) => {
                    setSelectedTag(tag)
                    setSelectedFolder(null) // Clear folder selection when tag is selected
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="max-sm:h-9"
                  aria-pressed={showFolders}
                  aria-expanded={showFolders}
                  onClick={() => setShowFolders((open) => !open)}
                >
                  <Folder aria-hidden />
                  Folders
                </Button>
              </div>
            </div>

            {/* Compact active-filter summary */}
            {hasFilters && (
              <div className="flex flex-wrap items-center gap-1.5">
                {searchQuery.trim() && (
                  <FilterChip
                    icon={Search}
                    label={`"${searchQuery.trim()}"`}
                    clearLabel="Clear search"
                    onClear={() => setSearchQuery('')}
                  />
                )}
                {selectedTag && (
                  <FilterChip
                    icon={Tag}
                    label={`#${selectedTag}`}
                    clearLabel="Clear tag filter"
                    onClear={() => setSelectedTag(null)}
                  />
                )}
                {selectedFolder && (
                  <FilterChip
                    icon={Folder}
                    label={selectedFolder}
                    clearLabel="Clear folder filter"
                    onClear={() => setSelectedFolder(null)}
                  />
                )}
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-brand hover:text-brand/80 focus-visible:ring-ring min-h-7 rounded px-1 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  Clear all
                </button>
              </div>
            )}

            {showFolders && (
              <FolderTree
                selectedFolder={selectedFolder}
                onSelectFolder={(folder) => {
                  setSelectedFolder(folder)
                  setSelectedTag(null) // Clear tag selection when folder is selected
                }}
              />
            )}
          </div>
        ) : (
          <Alert variant={view === 'trash' ? 'warning' : 'info'}>
            <AlertDescription className="text-sm">
              {view === 'trash'
                ? 'Deleted notes stay here until you restore them or delete them forever.'
                : 'Archived notes are hidden from search, tags, and folders. Unarchive one to bring it back.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Content Area */}
        <div>
          {view !== 'active' ? (
            <NotesList
              view={view}
              onNoteSelect={setSelectedNote}
              selectedNoteId={selectedNote?.id}
              {...listActions}
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
              {...listActions}
            />
          ) : selectedTag ? (
            /* Show notes filtered by tag */
            <NotesList
              tag={selectedTag}
              onTagClick={(tag) => setSelectedTag(tag)}
              onNoteSelect={setSelectedNote}
              selectedNoteId={selectedNote?.id}
              {...listActions}
            />
          ) : (
            <NotesList
              folder={selectedFolder ?? undefined}
              onTagClick={(tag) => {
                setSelectedTag(tag)
                setSelectedFolder(null)
              }}
              onNoteSelect={setSelectedNote}
              selectedNoteId={selectedNote?.id}
              {...listActions}
            />
          )}
        </div>
      </div>

      {/* Note Detail Slide-Over */}
      <SlideOver isOpen={!!selectedNote} onClose={requestCloseNote} title="Note" width="max-w-xl">
        {selectedNote && (
          <div className="space-y-4">
            {actionError && (
              <Alert variant="destructive">
                <AlertDescription className="flex items-center justify-between gap-3 text-[13px]">
                  <span>{actionError}</span>
                  <button
                    type="button"
                    onClick={() => setActionError(null)}
                    className="shrink-0 text-xs underline underline-offset-2"
                  >
                    Dismiss
                  </button>
                </AlertDescription>
              </Alert>
            )}
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
              onDirtyChange={setEditDirty}
            />
          </div>
        )}
      </SlideOver>

      <ConfirmDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        title="Discard unsaved changes?"
        description="Your edits to this note have not been saved. Discard closes the note and removes its local draft."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        variant="destructive"
        onConfirm={discardAndClose}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title={pendingDelete === 'purge' ? 'Delete this note forever?' : 'Move this note to Trash?'}
        description={
          pendingDelete === 'purge'
            ? 'This permanently deletes the note, its history, and its audio. This cannot be undone.'
            : 'You can restore it from Trash later.'
        }
        confirmLabel={pendingDelete === 'purge' ? 'Delete forever' : 'Move to Trash'}
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function FilterChip({
  icon: Icon,
  label,
  clearLabel,
  onClear,
}: {
  icon: typeof Search
  label: string
  clearLabel: string
  onClear: () => void
}) {
  return (
    <span className="border-brand/20 bg-brand-soft text-brand inline-flex min-h-7 max-w-full items-center gap-1 rounded-md border pr-0.5 pl-1.5 text-[11px] font-medium">
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="max-w-40 truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={clearLabel}
        className="hover:bg-brand/10 focus-visible:ring-ring grid size-6 shrink-0 place-items-center rounded focus-visible:ring-2 focus-visible:outline-none"
      >
        <X className="size-3" aria-hidden />
      </button>
    </span>
  )
}
