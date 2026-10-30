import { useEffect, useState } from 'react'
import DOMPurify from 'dompurify'
import type { Note } from '../lib/api'
import { useNoteAudio, useUpdateNote } from '../hooks/useNotes'
import SuggestedTodos from './SuggestedTodos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface NoteDetailProps {
  note: Note & { snippet?: string; rank?: number }
  onDelete: () => void
  onUpdated?: (note: Note) => void
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

export default function NoteDetail({ note, onDelete, onUpdated }: NoteDetailProps) {
  const [current, setCurrent] = useState(note)
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(note.title)
  const [summary, setSummary] = useState(note.summary ?? '')
  const [content, setContent] = useState(note.content)
  const [folderPath, setFolderPath] = useState(note.folder_path)
  const [tagsText, setTagsText] = useState(tagsToInput(note.tags))

  const updateNote = useUpdateNote()
  const audioQuery = useNoteAudio(current.id)
  const audioUrl = audioQuery.data?.playback.url

  useEffect(() => {
    setCurrent(note)
  }, [note])

  const beginEdit = () => {
    setTitle(current.title)
    setSummary(current.summary ?? '')
    setContent(current.content)
    setFolderPath(current.folder_path)
    setTagsText(tagsToInput(current.tags))
    updateNote.reset()
    setIsEditing(true)
  }

  const cancelEdit = () => {
    updateNote.reset()
    setIsEditing(false)
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
      setCurrent(updated)
      onUpdated?.(updated)
      setIsEditing(false)
    } catch {
      // updateNote.isError renders the message below.
    }
  }

  const hasSnippet = !!note.snippet

  return (
    <div className="space-y-6 pb-6">
      <SuggestedTodos noteId={current.id} />

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-900">{current.title}</h3>
        {!isEditing && (
          <Button variant="outline" size="sm" onClick={beginEdit}>
            Edit
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-4">
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
            <p className="text-sm text-red-600">Could not save note: {updateNote.error.message}</p>
          )}

          <div className="flex items-center gap-2">
            <Button
              onClick={handleSave}
              loading={updateNote.isPending}
              disabled={!title.trim() || !content.trim() || !folderPath.trim()}
            >
              Save changes
            </Button>
            <Button variant="outline" onClick={cancelEdit} disabled={updateNote.isPending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          {current.summary && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-relaxed text-blue-900">
              {current.summary}
            </div>
          )}

          {/* Meta Info */}
          <div className="flex flex-col gap-2 text-sm text-gray-500">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                {new Date(current.created_at).toLocaleString()}
              </span>
              {current.word_count > 0 && (
                <span className="flex items-center gap-1">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                    />
                  </svg>
                  {current.word_count} words
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              Folder: {current.folder_path}
            </div>
          </div>

          {/* Tags */}
          {current.tags && current.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {current.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Source audio (when audio clips are enabled) */}
          {audioUrl && (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Source audio
              </div>
              <audio controls preload="none" src={audioUrl} className="w-full">
                Your browser does not support audio playback.
              </audio>
            </div>
          )}

          {/* Search Snippet (if available) */}
          {hasSnippet && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-yellow-800">
                Search Match ({Math.round((note.rank || 0) * 100)}%)
              </div>
              <div
                className="text-sm text-gray-800"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(note.snippet || '', { ALLOWED_TAGS: ['mark'] }),
                }}
              />
            </div>
          )}

          {/* Main Content */}
          <div className="prose prose-blue max-w-none">
            <div className="whitespace-pre-wrap text-base leading-relaxed text-gray-800">
              {current.content}
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-gray-200 pt-6">
            <Button variant="destructive" onClick={onDelete} className="w-full">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Delete Note
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
