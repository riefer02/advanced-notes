import { useEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import {
  Archive,
  ArchiveRestore,
  Calendar,
  Copy,
  Download,
  Folder,
  History,
  Pencil,
  Pin,
  PinOff,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import type { Note, NoteView } from '../lib/api'
import {
  useNoteAudio,
  useNoteRevisions,
  useRestoreNoteRevision,
  useUpdateNote,
} from '../hooks/useNotes'
import { formatDateTime } from '../lib/format'
import { copyText, downloadText, noteFilename, noteToMarkdown } from '../lib/note-export'
import { clearNoteEditDraft, loadNoteEditDraft, saveNoteEditDraft } from './noteEditDraft'
import SuggestedTodos from './SuggestedTodos'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Callout, DetailSection, Disclosure, MetaBar, MetaItem } from '@/components/ui/detail'

interface NoteDetailProps {
  note: Note & { snippet?: string; rank?: number }
  /** Which lifecycle view opened this note. */
  view?: NoteView
  /** Omit for read-only contexts (e.g. a summary's source note). */
  onDelete?: () => void
  onPin?: (pinned: boolean) => void
  onArchive?: (archived: boolean) => void
  onRestore?: () => void
  onPurge?: () => void
  onUpdated?: (note: Note) => void
  /**
   * Notifies the host drawer when the edit form differs from the saved note,
   * so it can guard close/backdrop/Escape instead of losing work.
   */
  onDirtyChange?: (dirty: boolean) => void
}

function tagsToInput(tags: string[]): string {
  return tags.join(', ')
}

function inputToTags(value: string): string[] {
  const seen = new Set<string>()
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => {
      if (!tag || seen.has(tag)) return false
      seen.add(tag)
      return true
    })
}

export default function NoteDetail({
  note,
  view = 'active',
  onDelete,
  onPin,
  onArchive,
  onRestore,
  onPurge,
  onUpdated,
  onDirtyChange,
}: NoteDetailProps) {
  const [current, setCurrent] = useState(note)
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(note.title)
  const [summary, setSummary] = useState(note.summary ?? '')
  const [content, setContent] = useState(note.content)
  const [folderPath, setFolderPath] = useState(note.folder_path)
  const [tagsText, setTagsText] = useState(tagsToInput(note.tags))
  const [showHistory, setShowHistory] = useState(false)
  const [restoredDraftAt, setRestoredDraftAt] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  const updateNote = useUpdateNote()
  const restoreRevision = useRestoreNoteRevision()
  const audioQuery = useNoteAudio(current.id)
  const revisionsQuery = useNoteRevisions(current.id, showHistory)
  const audioUrl = audioQuery.data?.playback.url
  const isTrash = view === 'trash'

  useEffect(() => {
    setCurrent(note)
  }, [note])

  // The saved values that "dirty" is measured against.
  const saved = useMemo(
    () => ({
      title: current.title,
      summary: current.summary ?? '',
      content: current.content,
      folderPath: current.folder_path,
      tagsText: tagsToInput(current.tags),
    }),
    [current]
  )

  const isDirty =
    isEditing &&
    (title !== saved.title ||
      summary !== saved.summary ||
      content !== saved.content ||
      folderPath !== saved.folderPath ||
      tagsText !== saved.tagsText)

  const onDirtyChangeRef = useRef(onDirtyChange)
  onDirtyChangeRef.current = onDirtyChange

  useEffect(() => {
    onDirtyChangeRef.current?.(isDirty)
  }, [isDirty])

  // Keep a debounced local draft while editing. It is a safety net only —
  // saving to the server stays an explicit action.
  useEffect(() => {
    if (!isEditing) return

    if (!isDirty) {
      clearNoteEditDraft(current.id)
      return
    }

    const handle = window.setTimeout(() => {
      saveNoteEditDraft(current.id, {
        title,
        summary,
        content,
        folderPath,
        tagsText,
      })
    }, 500)

    return () => window.clearTimeout(handle)
  }, [isEditing, isDirty, current.id, title, summary, content, folderPath, tagsText])

  const beginEdit = () => {
    updateNote.reset()

    const draft = loadNoteEditDraft(current.id)
    if (draft) {
      setTitle(draft.title)
      setSummary(draft.summary)
      setContent(draft.content)
      setFolderPath(draft.folderPath)
      setTagsText(draft.tagsText)
      setRestoredDraftAt(draft.savedAt || 'unknown')
    } else {
      setTitle(current.title)
      setSummary(current.summary ?? '')
      setContent(current.content)
      setFolderPath(current.folder_path)
      setTagsText(tagsToInput(current.tags))
      setRestoredDraftAt(null)
    }

    setIsEditing(true)
  }

  const cancelEdit = () => {
    clearNoteEditDraft(current.id)
    setRestoredDraftAt(null)
    updateNote.reset()
    setIsEditing(false)
  }

  const discardRestoredDraft = () => {
    clearNoteEditDraft(current.id)
    setRestoredDraftAt(null)
    setTitle(current.title)
    setSummary(current.summary ?? '')
    setContent(current.content)
    setFolderPath(current.folder_path)
    setTagsText(tagsToInput(current.tags))
  }

  const handleSave = async () => {
    const trimmedTitle = title.trim()
    const trimmedContent = content.trim()
    const trimmedFolder = folderPath.trim()
    if (!trimmedTitle || !trimmedContent || !trimmedFolder) return

    try {
      const updated = await updateNote.mutateAsync({
        noteId: current.id,
        input: {
          title: trimmedTitle,
          summary: summary.trim(),
          content: trimmedContent,
          folder_path: trimmedFolder,
          tags: inputToTags(tagsText),
        },
      })
      clearNoteEditDraft(current.id)
      setRestoredDraftAt(null)
      setCurrent(updated)
      onUpdated?.(updated)
      setIsEditing(false)
    } catch {
      // updateNote.isError renders the message below.
    }
  }

  const handleRestoreRevision = async (version: number) => {
    try {
      const updated = await restoreRevision.mutateAsync({
        noteId: current.id,
        version,
      })
      setCurrent(updated)
      onUpdated?.(updated)
    } catch {
      // restoreRevision.isError renders below.
    }
  }

  const handleCopyMarkdown = async () => {
    const copied = await copyText(noteToMarkdown(current))
    setCopyState(copied ? 'copied' : 'error')
    if (copied) window.setTimeout(() => setCopyState('idle'), 2000)
  }

  const handleDownloadMarkdown = () => {
    downloadText(noteFilename(current), noteToMarkdown(current))
  }

  const hasSnippet = !!note.snippet

  return (
    <div className="space-y-5 pb-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-ink text-[17px] leading-6 font-semibold tracking-[-0.02em] break-words">
            {current.title}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <MetaBar>
              <MetaItem icon={Calendar}>{formatDateTime(current.created_at)}</MetaItem>
              {current.word_count > 0 && <MetaItem>{current.word_count} words</MetaItem>}
              <MetaItem icon={Folder} className="max-w-full">
                {current.folder_path}
              </MetaItem>
            </MetaBar>
            <Badge variant="neutral" className="text-2xs">
              {current.source === 'manual' ? 'Typed' : 'Audio'}
            </Badge>
            {current.version && current.version > 1 && (
              <Badge variant="outline" className="text-2xs font-mono">
                v{current.version}
              </Badge>
            )}
          </div>
        </div>

        {!isEditing && (
          <div className="flex shrink-0 items-center gap-1">
            {view === 'active' && onPin && (
              <Button
                variant="ghost"
                size="sm"
                className="max-sm:size-9"
                onClick={() => onPin(!current.pinned_at)}
                aria-pressed={!!current.pinned_at}
              >
                {current.pinned_at ? <PinOff /> : <Pin />}
                <span className="hidden lg:inline">{current.pinned_at ? 'Unpin' : 'Pin'}</span>
                <span className="sr-only lg:hidden">
                  {current.pinned_at ? 'Unpin note' : 'Pin note'}
                </span>
              </Button>
            )}
            {!isTrash && onArchive && (
              <Button
                variant="ghost"
                size="sm"
                className="max-sm:size-9"
                onClick={() => onArchive(!current.archived_at)}
              >
                {current.archived_at ? <ArchiveRestore /> : <Archive />}
                <span className="hidden lg:inline">
                  {current.archived_at ? 'Unarchive' : 'Archive'}
                </span>
                <span className="sr-only lg:hidden">
                  {current.archived_at ? 'Unarchive note' : 'Archive note'}
                </span>
              </Button>
            )}
            {!isTrash && (
              <Button variant="outline" size="sm" className="max-sm:h-9" onClick={beginEdit}>
                <Pencil />
                Edit
              </Button>
            )}
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-4">
          {restoredDraftAt && (
            <div
              role="status"
              className="border-line bg-surface-muted text-ink-muted flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs leading-5"
            >
              <span className="flex items-center gap-1.5">
                <History className="text-ink-subtle size-3.5 shrink-0" aria-hidden />
                Restored an unsaved draft
                {restoredDraftAt !== 'unknown' && ` saved ${formatDateTime(restoredDraftAt)}`}.
              </span>
              <Button size="xs" variant="ghost" onClick={discardRestoredDraft}>
                Discard draft
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="note-title">Title</Label>
            <Input
              id="note-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={500}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note-summary">Summary</Label>
            <Textarea
              id="note-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Optional short summary"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="note-folder">Folder</Label>
              <Input
                id="note-folder"
                value={folderPath}
                onChange={(event) => setFolderPath(event.target.value)}
                placeholder="e.g. work/meetings"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note-tags">Tags</Label>
              <Input
                id="note-tags"
                value={tagsText}
                onChange={(event) => setTagsText(event.target.value)}
                placeholder="comma, separated, tags"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note-content">Transcript / content</Label>
            <Textarea
              id="note-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={14}
              className="font-mono text-sm"
            />
          </div>

          {updateNote.isError && (
            <p className="text-destructive text-sm">
              Could not save note: {updateNote.error.message}
            </p>
          )}

          <div className="border-line flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <span className="text-ink-subtle text-xs">
              {isDirty ? 'Kept as a local draft until you save.' : 'No unsaved changes.'}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={cancelEdit} disabled={updateNote.isPending}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                loading={updateNote.isPending}
                disabled={!title.trim() || !content.trim() || !folderPath.trim()}
              >
                Save changes
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {current.summary && (
            <Callout label="Summary">
              <p className="text-ink text-[13px] leading-5.5">{current.summary}</p>
            </Callout>
          )}

          {hasSnippet && (
            <Callout tone="warning" label={`Search match · ${Math.round((note.rank || 0) * 100)}%`}>
              <div
                className="text-ink text-[13px] leading-5.5"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(note.snippet || '', { ALLOWED_TAGS: ['mark'] }),
                }}
              />
            </Callout>
          )}

          {current.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {current.tags.map((tag) => (
                <span
                  key={tag}
                  className="border-line bg-surface-muted text-ink-muted rounded-md border px-2 py-0.5 text-[11px] font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {audioUrl && (
            <DetailSection label="Source audio">
              <audio controls preload="none" src={audioUrl} className="h-9 w-full">
                Your browser does not support audio playback.
              </audio>
            </DetailSection>
          )}

          <div className="border-line border-t pt-4">
            <div className="max-w-[70ch] text-[15px] leading-7 whitespace-pre-wrap text-ink/90">
              {current.content}
            </div>
          </div>

          <div className="border-line flex flex-wrap items-center gap-2 border-t pt-4">
            <Button variant="ghost" size="sm" onClick={() => void handleCopyMarkdown()}>
              <Copy />
              {copyState === 'copied'
                ? 'Copied'
                : copyState === 'error'
                  ? 'Copy failed'
                  : 'Copy Markdown'}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDownloadMarkdown}>
              <Download />
              Download .md
            </Button>
          </div>

          {!isTrash && <SuggestedTodos noteId={current.id} />}

          {!isTrash && (
            <Disclosure
              summary="History"
              open={showHistory}
              onOpenChange={setShowHistory}
              hint={
                revisionsQuery.data ? `${revisionsQuery.data.revisions.length} versions` : undefined
              }
            >
              <div className="space-y-1.5">
                {revisionsQuery.isLoading && (
                  <p className="text-ink-subtle text-xs">Loading history…</p>
                )}
                {revisionsQuery.isError && (
                  <p className="text-destructive text-xs">Could not load history.</p>
                )}
                {revisionsQuery.data && revisionsQuery.data.revisions.length === 0 && (
                  <p className="text-ink-subtle text-xs">
                    No earlier versions yet. Edits will appear here.
                  </p>
                )}
                {revisionsQuery.data?.revisions.map((revision) => (
                  <div
                    key={revision.id}
                    className="border-line bg-surface-muted/60 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-ink text-xs font-medium">
                        v{revision.version} · {formatDateTime(revision.created_at)}
                      </p>
                      <p className="text-ink-subtle mt-0.5 truncate text-[11px]">
                        {revision.title} · {revision.word_count} words · {revision.edit_source}
                      </p>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={restoreRevision.isPending}
                      onClick={() => void handleRestoreRevision(revision.version)}
                    >
                      <RotateCcw />
                      Restore
                    </Button>
                  </div>
                ))}
                {restoreRevision.isError && (
                  <p className="text-destructive text-xs">Could not restore that version.</p>
                )}
              </div>
            </Disclosure>
          )}

          {(onRestore || onPurge || onDelete) && (
            <div className="border-line flex items-center gap-2 border-t pt-4">
              {isTrash ? (
                <>
                  {onRestore && (
                    <Button onClick={onRestore} size="sm">
                      <RotateCcw />
                      Restore note
                    </Button>
                  )}
                  {onPurge && (
                    <Button variant="destructive" size="sm" onClick={onPurge}>
                      <Trash2 />
                      Delete forever
                    </Button>
                  )}
                </>
              ) : (
                onDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/8 hover:text-destructive"
                    onClick={onDelete}
                  >
                    <Trash2 />
                    Move to Trash
                  </Button>
                )
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
