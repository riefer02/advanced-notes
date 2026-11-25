import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '@clerk/clerk-react'
import type { FolderNode, Note } from '../lib/api'
import { isNetworkUnreachableError } from '../lib/offline-queue'
import { useCreateNote, useFolderTree } from '../hooks/useNotes'
import { useOfflineQueue } from '../hooks/useOfflineQueue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const DRAFT_KEY_PREFIX = 'chisos:note-draft'

interface NoteComposerProps {
  onCreated?: (note: Note) => void
}

interface Draft {
  title: string
  content: string
  folder: string
  tags: string
}

function loadDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Draft>
    return {
      title: parsed.title ?? '',
      content: parsed.content ?? '',
      folder: parsed.folder ?? 'inbox',
      tags: parsed.tags ?? '',
    }
  } catch {
    return null
  }
}

function parseTags(value: string): string[] {
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

function collectFolderPaths(node: FolderNode | undefined, acc: string[] = []): string[] {
  if (!node) return acc
  for (const child of node.subfolders) {
    if (child.path) acc.push(child.path)
    collectFolderPaths(child, acc)
  }
  return acc
}

export default function NoteComposer({ onCreated }: NoteComposerProps) {
  const { userId } = useAuth()
  // Scope drafts per account: notes are user-isolated, and a shared browser
  // must not surface one user's draft to another.
  const draftKey = `${DRAFT_KEY_PREFIX}:${userId ?? 'anonymous'}`
  const [draft] = useState(() => loadDraft(draftKey))
  const [title, setTitle] = useState(draft?.title ?? '')
  const [content, setContent] = useState(draft?.content ?? '')
  const [folder, setFolder] = useState(draft?.folder ?? 'inbox')
  const [tagsText, setTagsText] = useState(draft?.tags ?? '')
  const [savedNote, setSavedNote] = useState<Note | null>(null)
  const [queuedOffline, setQueuedOffline] = useState(false)
  const [queueError, setQueueError] = useState<string | null>(null)

  const contentRef = useRef<HTMLTextAreaElement>(null)
  const createNote = useCreateNote()
  const { data: folderTree } = useFolderTree()
  const { isOnline, enqueueNote, persistence } = useOfflineQueue(userId)
  const folderOptions = collectFolderPaths(folderTree)

  useEffect(() => {
    contentRef.current?.focus()
  }, [])

  // Keep a local draft so a closed tab or navigation cannot lose typing.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (!title.trim() && !content.trim() && !tagsText.trim()) {
        window.localStorage.removeItem(draftKey)
        return
      }
      window.localStorage.setItem(
        draftKey,
        JSON.stringify({ title, content, folder, tags: tagsText })
      )
    }, 500)
    return () => window.clearTimeout(handle)
  }, [draftKey, title, content, folder, tagsText])

  const edit =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value)
      setSavedNote(null)
      setQueuedOffline(false)
      setQueueError(null)
    }

  const queueDraft = async (): Promise<boolean> => {
    try {
      await enqueueNote({
        title: title.trim() || undefined,
        content: content.trim(),
        folder_path: folder.trim() || 'inbox',
        tags: parseTags(tagsText),
      })
      setQueuedOffline(true)
      setQueueError(null)
      setSavedNote(null)
      createNote.reset()
      setTitle('')
      setContent('')
      setTagsText('')
      window.localStorage.removeItem(draftKey)
      contentRef.current?.focus()
      return true
    } catch (error) {
      setQueueError(
        error instanceof Error ? error.message : 'Could not save this note on this device.'
      )
      return false
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!content.trim() || createNote.isPending) return

    if (!isOnline) {
      await queueDraft()
      return
    }

    try {
      const note = await createNote.mutateAsync({
        title: title.trim() || undefined,
        content: content.trim(),
        folder_path: folder.trim() || 'inbox',
        tags: parseTags(tagsText),
      })
      setSavedNote(note)
      setQueuedOffline(false)
      setTitle('')
      setContent('')
      setTagsText('')
      window.localStorage.removeItem(draftKey)
      onCreated?.(note)
      contentRef.current?.focus()
    } catch (error) {
      // A dropped connection is the one failure we can absorb: keep the note
      // on this device instead of leaving it only in the form. Validation,
      // auth, and quota errors still render through createNote.isError.
      if (isNetworkUnreachableError(error)) {
        await queueDraft()
      }
    }
  }

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0
  const canSave = content.trim().length > 0 && !createNote.isPending

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault()
          void handleSubmit(event)
        }
      }}
      className="space-y-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-ink text-[15px] font-semibold tracking-[-0.015em]">Write a note</h2>
          <p className="text-sm text-ink-muted">
            {isOnline
              ? 'Type it yourself. It lands in your notes immediately — no audio needed.'
              : 'Offline — this note is saved on this device and synced when you reconnect.'}
          </p>
        </div>
        <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-ink-muted">
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </span>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="composer-title">Title (optional)</Label>
        <Input
          id="composer-title"
          value={title}
          onChange={(event) => edit(setTitle)(event.target.value)}
          maxLength={500}
          placeholder="Defaults to the first line"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="composer-content">Note</Label>
        <Textarea
          id="composer-content"
          ref={contentRef}
          value={content}
          onChange={(event) => edit(setContent)(event.target.value)}
          rows={10}
          placeholder="Start typing…"
          aria-required="true"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="composer-folder">Folder</Label>
          <Input
            id="composer-folder"
            value={folder}
            onChange={(event) => edit(setFolder)(event.target.value)}
            placeholder="inbox"
            list="composer-folder-options"
          />
          <datalist id="composer-folder-options">
            {folderOptions.map((path) => (
              <option key={path} value={path} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="composer-tags">Tags</Label>
          <Input
            id="composer-tags"
            value={tagsText}
            onChange={(event) => edit(setTagsText)(event.target.value)}
            placeholder="comma, separated, tags"
          />
        </div>
      </div>

      {queuedOffline && (
        <Alert variant="success">
          <AlertTitle>Saved on this device — will sync when online.</AlertTitle>
          {persistence === 'memory' && (
            <AlertDescription>
              This browser can't persist captures across reloads, so keep this tab open until the
              connection returns.
            </AlertDescription>
          )}
        </Alert>
      )}

      {queueError && (
        <Alert variant="destructive">
          <AlertTitle>Could not save note</AlertTitle>
          <AlertDescription>{queueError}</AlertDescription>
        </Alert>
      )}

      {createNote.isError && (
        <Alert variant="destructive">
          <AlertTitle>Could not save note</AlertTitle>
          <AlertDescription>
            {createNote.error instanceof Error ? createNote.error.message : 'Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      {savedNote && (
        <Alert variant="success">
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>
            “{savedNote.title}” was added to {savedNote.folder_path}.
          </AlertDescription>
        </Alert>
      )}

      <div className="border-line flex items-center justify-between gap-3 border-t pt-4">
        <Button type="submit" disabled={!canSave} loading={createNote.isPending}>
          {isOnline ? 'Save note' : 'Save offline'}
        </Button>
        <span className="text-xs text-ink-subtle">
          {isOnline ? '⌘/Ctrl + Enter' : 'Saved on this device'}
        </span>
      </div>
    </form>
  )
}
