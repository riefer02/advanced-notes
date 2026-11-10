import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '@clerk/clerk-react'
import type { FolderNode, Note } from '../lib/api'
import { useCreateNote, useFolderTree } from '../hooks/useNotes'
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

  const contentRef = useRef<HTMLTextAreaElement>(null)
  const createNote = useCreateNote()
  const { data: folderTree } = useFolderTree()
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
    }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!content.trim() || createNote.isPending) return

    try {
      const note = await createNote.mutateAsync({
        title: title.trim() || undefined,
        content: content.trim(),
        folder_path: folder.trim() || 'inbox',
        tags: parseTags(tagsText),
      })
      setSavedNote(note)
      setTitle('')
      setContent('')
      setTagsText('')
      window.localStorage.removeItem(draftKey)
      onCreated?.(note)
      contentRef.current?.focus()
    } catch {
      // createNote.isError renders the message below.
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
          <h2 className="text-lg font-semibold text-gray-900">Write a note</h2>
          <p className="text-sm text-gray-600">
            Type it yourself. It lands in your notes immediately — no audio needed.
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
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

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canSave} loading={createNote.isPending}>
          Save note
        </Button>
        <span className="text-xs text-gray-500">⌘/Ctrl + Enter</span>
      </div>
    </form>
  )
}
