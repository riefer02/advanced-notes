import type { Note } from './api'

/** A portable Markdown representation of a note, including its filing metadata. */
export function noteToMarkdown(note: Note): string {
  const meta = [
    note.created_at ? `Created: ${note.created_at}` : null,
    note.folder_path ? `Folder: ${note.folder_path}` : null,
    note.tags.length ? `Tags: ${note.tags.map((tag) => `#${tag}`).join(' ')}` : null,
    note.source ? `Source: ${note.source}` : null,
    note.version ? `Version: ${note.version}` : null,
  ].filter(Boolean)

  const parts = [
    `# ${note.title || 'Untitled note'}`,
    '',
    meta.join('  \n'),
    '',
    note.summary ? `> ${note.summary}` : null,
    note.summary ? '' : null,
    note.content,
    '',
  ]

  return parts.filter((part) => part !== null).join('\n')
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function downloadText(filename: string, text: string, mime = 'text/markdown'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function noteFilename(note: Note): string {
  const slug = (note.title || 'note')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'note'}.md`
}
