import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  CalendarDays,
  Check,
  ChevronRight,
  Circle,
  Copy,
  LoaderCircle,
  Sparkles,
  Tag,
  FileText,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

import SlideOver from '../ui/SlideOver'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Callout, DetailSection, Disclosure, MetaBar, MetaItem } from '@/components/ui/detail'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import NoteDetail from '../NoteDetail'
import { askNotes, deleteNote, fetchNote } from '../../lib/api'
import type { AskResponse, Note } from '../../lib/api'
import { formatShortDate, pluralize } from '../../lib/format'

const ASK_STAGES = ['Planning', 'Searching your notes', 'Writing the answer'] as const

export function AskSlideOver({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [askQuery, setAskQuery] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [askStage, setAskStage] = useState(0)
  const [askResult, setAskResult] = useState<AskResponse | null>(null)
  const [askError, setAskError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  const [selectedSourceNote, setSelectedSourceNote] = useState<Note | null>(null)
  const [isLoadingSourceNote, setIsLoadingSourceNote] = useState(false)
  const [confirmDeleteSource, setConfirmDeleteSource] = useState(false)
  const [sourceNoteError, setSourceNoteError] = useState<string | null>(null)
  const [sourceNoteDirty, setSourceNoteDirty] = useState(false)
  const [confirmDiscardSource, setConfirmDiscardSource] = useState(false)
  const sourceRequestRef = useRef(0)
  const askRequestRef = useRef(0)
  const copyTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    }
  }, [])

  // The backend answers in one request, so the stages are a calm progress
  // sequence rather than fake precision.
  useEffect(() => {
    if (!isAsking) {
      setAskStage(0)
      return
    }
    setAskStage(0)
    const timers = [
      window.setTimeout(() => setAskStage(1), 900),
      window.setTimeout(() => setAskStage(2), 2600),
    ]
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [isAsking])

  const handleAskQuery = useCallback(async (query: string) => {
    const q = query.trim()
    if (!q) return
    const requestId = askRequestRef.current + 1
    askRequestRef.current = requestId
    setAskQuery(q)
    setIsAsking(true)
    setAskResult(null)
    setAskError(null)
    setCopyState('idle')
    try {
      const result = await askNotes(q, 12, false)
      if (askRequestRef.current === requestId) setAskResult(result)
    } catch (error) {
      if (askRequestRef.current !== requestId) return
      console.error('Failed to ask notes:', error)
      setAskError(error instanceof Error ? error.message : 'Failed to ask notes')
    } finally {
      if (askRequestRef.current === requestId) setIsAsking(false)
    }
  }, [])

  const cancelAsk = () => {
    // Abandon the in-flight request: a late response is ignored.
    askRequestRef.current += 1
    setIsAsking(false)
  }

  const handleCopyAnswer = async () => {
    if (!askResult) return
    try {
      await navigator.clipboard.writeText(askResult.answer_markdown)
      setCopyState('copied')
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      setCopyState('error')
    }
  }

  const closeSourceNote = () => {
    // Invalidate any in-flight fetch so a late response cannot reopen the drawer.
    sourceRequestRef.current += 1
    setIsLoadingSourceNote(false)
    setSourceNoteError(null)
    setSelectedSourceNote(null)
    setConfirmDeleteSource(false)
    setSourceNoteDirty(false)
  }

  const requestCloseSourceNote = () => {
    if (sourceNoteDirty) {
      setConfirmDiscardSource(true)
      return
    }
    closeSourceNote()
  }

  const openSourceNote = async (noteId: string) => {
    const requestId = sourceRequestRef.current + 1
    sourceRequestRef.current = requestId
    setIsLoadingSourceNote(true)
    setSourceNoteError(null)
    setSourceNoteDirty(false)
    try {
      const note = await fetchNote(noteId)
      if (sourceRequestRef.current === requestId) setSelectedSourceNote(note)
    } catch {
      if (sourceRequestRef.current === requestId) setSourceNoteError('Failed to load note')
    } finally {
      if (sourceRequestRef.current === requestId) setIsLoadingSourceNote(false)
    }
  }

  const handleDeleteSourceNote = async () => {
    if (!selectedSourceNote) return
    try {
      await deleteNote(selectedSourceNote.id)
      void queryClient.invalidateQueries()
      setSelectedSourceNote(null)
      setSourceNoteError(null)
    } catch {
      setSourceNoteError('Failed to move note to trash')
    }
  }

  const handleClose = () => {
    askRequestRef.current += 1
    onClose()
    setAskError(null)
    setIsAsking(false)
  }

  const plan = askResult?.query_plan
  const timeRange = plan?.time_range
  const includeTags = plan?.include_tags ?? []
  const sources = askResult?.sources ?? []

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
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  void handleAskQuery(askQuery)
                }
              }}
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
                  setCopyState('idle')
                }}
                className="text-ink-muted hover:text-ink text-sm"
              >
                Clear
              </button>
              <span className="text-ink-subtle ml-auto text-[11px]">⌘/Ctrl + Enter to ask</span>
            </div>
          </div>

          {isAsking && (
            <div
              className="border-line bg-surface-muted rounded-xl border px-4 py-3"
              aria-live="polite"
            >
              <ul className="space-y-1.5">
                {ASK_STAGES.map((stage, index) => (
                  <li key={stage} className="flex items-center gap-2 text-[13px]">
                    {index < askStage ? (
                      <Check className="text-positive size-3.5" aria-hidden />
                    ) : index === askStage ? (
                      <LoaderCircle className="text-brand size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Circle className="text-ink-subtle size-2.5" aria-hidden />
                    )}
                    <span className={index <= askStage ? 'text-ink' : 'text-ink-subtle'}>
                      {stage}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-end">
                <Button variant="ghost" size="xs" onClick={cancelAsk}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {askError && (
            <Callout tone="danger" label="Could not answer">
              <p className="text-destructive text-[13px] leading-5">{askError}</p>
            </Callout>
          )}

          {askResult && (
            <div className="space-y-5">
              {askResult.warnings?.length > 0 && (
                <Callout tone="warning" label="Warnings">
                  <ul className="text-warning list-disc space-y-1 pl-4 text-[12px] leading-5">
                    {askResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </Callout>
              )}

              <MetaBar>
                <MetaItem icon={FileText}>Searched {pluralize(sources.length, 'note')}</MetaItem>
                {timeRange?.start_date && (
                  <MetaItem icon={CalendarDays}>
                    {formatShortDate(timeRange.start_date)}
                    {timeRange.end_date ? ` – ${formatShortDate(timeRange.end_date)}` : ''}
                  </MetaItem>
                )}
                {includeTags.length > 0 && (
                  <MetaItem icon={Tag}>
                    {includeTags
                      .slice(0, 3)
                      .map((tag) => `#${tag}`)
                      .join(' ')}
                  </MetaItem>
                )}
              </MetaBar>

              <div className="space-y-2">
                <div className="markdown">
                  <ReactMarkdown>{askResult.answer_markdown}</ReactMarkdown>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="xs" onClick={() => void handleCopyAnswer()}>
                    {copyState === 'copied' ? <Check className="text-positive" /> : <Copy />}
                    {copyState === 'copied' ? 'Copied' : 'Copy answer'}
                  </Button>
                  {copyState === 'error' && (
                    <span className="text-destructive text-[11px]">Could not copy</span>
                  )}
                </div>
              </div>

              {plan && (
                <Disclosure summary="How this answer was made" hint="filters and query">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {timeRange?.start_date && (
                        <span className="border-line bg-surface-muted text-ink-muted rounded-full border px-2 py-0.5">
                          {timeRange.start_date} → {timeRange.end_date || '…'}
                        </span>
                      )}
                      {plan.include_tags.map((t) => (
                        <span
                          key={`in-${t}`}
                          className="border-line bg-surface-muted text-ink-muted rounded-full border px-2 py-0.5"
                        >
                          +{t}
                        </span>
                      ))}
                      {plan.exclude_tags.map((t) => (
                        <span
                          key={`out-${t}`}
                          className="border-line bg-surface-muted text-ink-muted rounded-full border px-2 py-0.5"
                        >
                          -{t}
                        </span>
                      ))}
                      {plan.folder_paths?.map((p) => (
                        <span
                          key={`f-${p}`}
                          className="border-line bg-surface-muted text-ink-muted rounded-full border px-2 py-0.5"
                        >
                          folder:{p}
                        </span>
                      ))}
                      {!timeRange &&
                        plan.include_tags.length === 0 &&
                        plan.exclude_tags.length === 0 &&
                        !plan.folder_paths && (
                          <span className="border-line bg-surface-muted text-ink-muted rounded-full border px-2 py-0.5">
                            all-notes
                          </span>
                        )}
                    </div>
                    <p className="text-ink-subtle text-xs leading-5">
                      <span className="text-ink-muted font-semibold">Semantic query:</span>{' '}
                      {plan.semantic_query}
                    </p>
                  </div>
                </Disclosure>
              )}

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
                              {formatShortDate(source.updated_at)} · matched your question
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
                          className="border-line bg-surface-muted hover:bg-surface-sunken focus-visible:ring-ring text-ink rounded-lg border px-3 py-2 text-left text-[13px] transition-colors focus-visible:ring-2 focus-visible:outline-none"
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
        onClose={requestCloseSourceNote}
        title="Source Note"
        width="max-w-xl"
      >
        {isLoadingSourceNote ? (
          <div className="text-ink-subtle py-10 text-[13px]">Loading note…</div>
        ) : sourceNoteError && !selectedSourceNote ? (
          <p className="text-destructive py-6 text-[13px]">{sourceNoteError}</p>
        ) : selectedSourceNote ? (
          <>
            {sourceNoteError && (
              <p className="text-destructive mb-3 text-[13px]">{sourceNoteError}</p>
            )}
            <NoteDetail
              note={selectedSourceNote}
              view={
                selectedSourceNote.deleted_at
                  ? 'trash'
                  : selectedSourceNote.archived_at
                    ? 'archived'
                    : 'active'
              }
              onDelete={
                selectedSourceNote.deleted_at ? undefined : () => setConfirmDeleteSource(true)
              }
              onDirtyChange={setSourceNoteDirty}
            />
          </>
        ) : null}
      </SlideOver>

      <ConfirmDialog
        open={confirmDeleteSource}
        onOpenChange={setConfirmDeleteSource}
        title="Move this note to Trash?"
        description="You can restore it later from the Trash view."
        confirmLabel="Move to Trash"
        variant="destructive"
        onConfirm={handleDeleteSourceNote}
      />

      <ConfirmDialog
        open={confirmDiscardSource}
        onOpenChange={setConfirmDiscardSource}
        title="Discard unsaved changes?"
        description="Your edits to this source note have not been saved."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        variant="destructive"
        onConfirm={() => {
          setSourceNoteDirty(false)
          setConfirmDiscardSource(false)
          closeSourceNote()
        }}
      />
    </>
  )
}
