/**
 * Local safety net for in-progress note edits.
 *
 * Drafts never touch the server: they only exist so closing a drawer, a
 * reload, or a crashed tab cannot silently destroy typing. The key includes
 * the note id, which is user-scoped server-side, so two accounts on the same
 * browser cannot read each other's drafts.
 */

export interface NoteEditDraft {
  title: string
  summary: string
  content: string
  folderPath: string
  tagsText: string
  savedAt: string
}

const DRAFT_KEY_PREFIX = 'chisos:note-edit-draft'

function draftKey(noteId: string): string {
  return `${DRAFT_KEY_PREFIX}:${noteId}`
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function loadNoteEditDraft(noteId: string): NoteEditDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(noteId))
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<NoteEditDraft> | null
    if (!parsed || typeof parsed !== 'object') return null

    const draft: NoteEditDraft = {
      title: asString(parsed.title),
      summary: asString(parsed.summary),
      content: asString(parsed.content),
      folderPath: asString(parsed.folderPath),
      tagsText: asString(parsed.tagsText),
      savedAt: asString(parsed.savedAt),
    }

    // A draft with no user-entered text would only blank out the real fields.
    if (!draft.title.trim() && !draft.content.trim() && !draft.tagsText.trim()) return null

    return draft
  } catch {
    return null
  }
}

export function saveNoteEditDraft(noteId: string, draft: Omit<NoteEditDraft, 'savedAt'>): void {
  try {
    window.localStorage.setItem(
      draftKey(noteId),
      JSON.stringify({ ...draft, savedAt: new Date().toISOString() })
    )
  } catch {
    // Storage can be full or disabled (private mode); editing still works.
  }
}

export function clearNoteEditDraft(noteId: string): void {
  try {
    window.localStorage.removeItem(draftKey(noteId))
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
