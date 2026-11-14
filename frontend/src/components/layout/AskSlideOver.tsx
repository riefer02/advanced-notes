import { useCallback, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { ChevronRight, Sparkles } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

import SlideOver from '../ui/SlideOver'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Callout, DetailSection } from '@/components/ui/detail'
import NoteDetail from '../NoteDetail'
import { askNotes, deleteNote, fetchNote } from '../../lib/api'
import type { AskResponse, Note } from '../../lib/api'

export function AskSlideOver({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [askQuery, setAskQuery] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [askResult, setAskResult] = useState<AskResponse | null>(null)
  const [askError, setAskError] = useState<string | null>(null)

  const [selectedSourceNote, setSelectedSourceNote] = useState<Note | null>(null)
  const [isLoadingSourceNote, setIsLoadingSourceNote] = useState(false)
  const sourceRequestRef = useRef(0)

  const handleAskQuery = useCallback(async (query: string) => {
    const q = query.trim()
    if (!q) return
    setIsAsking(true)
    setAskResult(null)
    setAskError(null)
    try {
      const result = await askNotes(q, 12, false)
      setAskResult(result)
    } catch (error) {
      console.error('Failed to ask notes:', error)
      setAskError(error instanceof Error ? error.message : 'Failed to ask notes')
    } finally {
      setIsAsking(false)
    }
  }, [])

  const closeSourceNote = () => {
    // Invalidate any in-flight fetch so a late response cannot reopen the drawer.
    sourceRequestRef.current += 1
    setIsLoadingSourceNote(false)
    setSelectedSourceNote(null)
  }

  const openSourceNote = async (noteId: string) => {
    const requestId = sourceRequestRef.current + 1
    sourceRequestRef.current = requestId
    setIsLoadingSourceNote(true)
    try {
      const note = await fetchNote(noteId)
      if (sourceRequestRef.current === requestId) setSelectedSourceNote(note)
    } catch {
      if (sourceRequestRef.current === requestId) alert('Failed to load note')
    } finally {
      if (sourceRequestRef.current === requestId) setIsLoadingSourceNote(false)
    }
  }

  const handleDeleteSourceNote = async () => {
    if (!selectedSourceNote) return
    if (!confirm('Move this note to Trash? You can restore it later.')) return
    try {
      await deleteNote(selectedSourceNote.id)
      void queryClient.invalidateQueries()
      setSelectedSourceNote(null)
    } catch {
      alert('Failed to move note to trash')
    }
  }

  const handleClose = () => {
    onClose()
    setAskError(null)
    setIsAsking(false)
  }

  return (
    <>
      <SlideOver
        isOpen={isOpen}
        onClose={handleClose}
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="text-brand size-4" />
            Ask notes
          </span>
        }
        width="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ask-query">Question</Label>
            <Textarea
              id="ask-query"
              value={askQuery}
              onChange={(e) => setAskQuery(e.target.value)}
              placeholder='e.g. "Tell me what I have been eating in February"'
              className="min-h-[80px]"
            />
            <div className="flex items-center gap-2">
              <Button
                onClick={() => void handleAskQuery(askQuery)}
                disabled={!askQuery.trim() || isAsking}
              >
                {isAsking ? 'Asking…' : 'Ask'}
              </Button>
              <button
                onClick={() => {
                  setAskQuery('')
                  setAskResult(null)
                  setAskError(null)
                }}
                className="text-sm text-ink-muted hover:text-ink"
              >
                Clear
              </button>
            </div>
          </div>

          {isAsking && (
            <div className="flex flex-col items-center justify-center space-y-3 py-10">
              <div className="border-brand/20 border-t-brand size-8 animate-spin rounded-full border-2" />
              <p className="text-brand text-[13px] font-medium">
                Planning + searching + summarizing…
              </p>
            </div>
          )}

          {askError && (
            <Callout tone="danger" label="Could not answer">
              <p className="text-destructive text-[13px] leading-5">{askError}</p>
            </Callout>
          )}

          {askResult && (
            <div className="space-y-5">
              <div className="bg-brand-soft border border-brand/20 rounded-xl p-4">
                <div className="section-label text-brand mb-2.5">Derived filters</div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {askResult.query_plan.time_range?.start_date && (
                    <span className="bg-surface text-brand border-brand/20 rounded-full border px-2 py-1">
                      {askResult.query_plan.time_range.start_date} →{' '}
                      {askResult.query_plan.time_range.end_date || '…'}
                    </span>
                  )}
                  {askResult.query_plan.include_tags.map((t) => (
                    <span
                      key={`in-${t}`}
                      className="bg-surface text-brand border-brand/20 rounded-full border px-2 py-1"
                    >
                      +{t}
                    </span>
                  ))}
                  {askResult.query_plan.exclude_tags.map((t) => (
                    <span
                      key={`out-${t}`}
                      className="bg-surface text-brand border-brand/20 rounded-full border px-2 py-1"
                    >
                      -{t}
                    </span>
                  ))}
                  {askResult.query_plan.folder_paths?.map((p) => (
                    <span
                      key={`f-${p}`}
                      className="bg-surface text-brand border-brand/20 rounded-full border px-2 py-1"
                    >
                      folder:{p}
                    </span>
                  ))}
                  {!askResult.query_plan.time_range &&
                    askResult.query_plan.include_tags.length === 0 &&
                    askResult.query_plan.exclude_tags.length === 0 &&
                    !askResult.query_plan.folder_paths && (
                      <span className="bg-surface text-brand border-brand/20 rounded-full border px-2 py-1">
                        all-notes
                      </span>
                    )}
                </div>
                <div className="mt-3 text-xs text-brand">
                  <span className="font-semibold">Semantic query:</span>{' '}
                  {askResult.query_plan.semantic_query}
                </div>
              </div>

              {askResult.warnings?.length > 0 && (
                <Callout tone="warning" label="Warnings">
                  <ul className="text-warning list-disc space-y-1 pl-4 text-[12px] leading-5">
                    {askResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </Callout>
              )}

              <div className="markdown">
                <ReactMarkdown>{askResult.answer_markdown}</ReactMarkdown>
              </div>

              <div className="border-line border-t pt-4">
                <DetailSection label={`Sources · ${askResult.sources.length}`}>
                  <div className="space-y-1.5">
                    {askResult.sources.map((source) => (
                      <button
                        key={source.note_id}
                        onClick={() => void openSourceNote(source.note_id)}
                        className="border-line bg-surface hover:border-line-strong hover:shadow-card focus-visible:ring-ring w-full rounded-xl border p-2.5 text-left transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:outline-none"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-ink truncate text-[13px] font-medium">
                              {source.title}
                            </div>
                            <div className="text-ink-subtle mt-0.5 text-[11px]">
                              {new Date(source.updated_at).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}{' '}
                              · {Math.round(source.score * 100)}% match
                            </div>
                          </div>
                          <ChevronRight className="text-ink-subtle size-4 shrink-0" aria-hidden />
                        </div>
                      </button>
                    ))}
                  </div>
                </DetailSection>
              </div>

              {askResult.followups?.length > 0 && (
                <div className="border-line border-t pt-4">
                  <DetailSection label="Follow-ups">
                    <div className="flex flex-col gap-1.5">
                      {askResult.followups.map((followup, i) => (
                        <button
                          key={i}
                          onClick={() => void handleAskQuery(followup)}
                          className="border-line bg-surface-muted hover:bg-surface-sunken focus-visible:ring-ring rounded-lg border px-3 py-2 text-left text-[13px] text-ink transition-colors focus-visible:ring-2 focus-visible:outline-none"
                        >
                          {followup}
                        </button>
                      ))}
                    </div>
                  </DetailSection>
                </div>
              )}
            </div>
          )}
        </div>
      </SlideOver>

      {/* Source Note Detail (nested) */}
      <SlideOver
        isOpen={!!selectedSourceNote || isLoadingSourceNote}
        onClose={closeSourceNote}
        title="Source Note"
        width="max-w-xl"
      >
        {isLoadingSourceNote ? (
          <div className="text-ink-subtle py-10 text-[13px]">Loading note…</div>
        ) : selectedSourceNote ? (
          <NoteDetail
            note={selectedSourceNote}
            view={
              selectedSourceNote.deleted_at
                ? 'trash'
                : selectedSourceNote.archived_at
                  ? 'archived'
                  : 'active'
            }
            onDelete={selectedSourceNote.deleted_at ? undefined : handleDeleteSourceNote}
          />
        ) : null}
      </SlideOver>
    </>
  )
}
