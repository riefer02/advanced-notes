import { useCallback, useState } from 'react'
import ReactMarkdown from 'react-markdown'

import SlideOver from '../ui/SlideOver'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import NoteDetail from '../NoteDetail'
import { askNotes, deleteNote, fetchNote } from '../../lib/api'
import type { AskResponse, Note } from '../../lib/api'

export function AskSlideOver({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [askQuery, setAskQuery] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [askResult, setAskResult] = useState<AskResponse | null>(null)
  const [askError, setAskError] = useState<string | null>(null)

  const [selectedSourceNote, setSelectedSourceNote] = useState<Note | null>(null)
  const [isLoadingSourceNote, setIsLoadingSourceNote] = useState(false)

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

  const openSourceNote = async (noteId: string) => {
    setIsLoadingSourceNote(true)
    try {
      const note = await fetchNote(noteId)
      setSelectedSourceNote(note)
    } catch {
      alert('Failed to load note')
    } finally {
      setIsLoadingSourceNote(false)
    }
  }

  const handleDeleteSourceNote = async () => {
    if (!selectedSourceNote) return
    if (!confirm('Are you sure you want to delete this note?')) return
    try {
      await deleteNote(selectedSourceNote.id)
      setSelectedSourceNote(null)
    } catch {
      alert('Failed to delete note')
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
          <div className="flex items-center gap-2 text-blue-900">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16h6M12 20a8 8 0 100-16 8 8 0 000 16z"
              />
            </svg>
            Ask Your Notes
          </div>
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
              className="min-h-[90px]"
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
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                Clear
              </button>
            </div>
          </div>

          {isAsking && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm text-blue-700 font-medium">
                Planning + searching + summarizing…
              </p>
            </div>
          )}

          {askError && (
            <Alert variant="destructive">
              <AlertDescription>{askError}</AlertDescription>
            </Alert>
          )}

          {askResult && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <div className="text-xs font-semibold text-blue-900 uppercase tracking-wider mb-3">
                  Derived filters
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {askResult.query_plan.time_range?.start_date && (
                    <span className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800">
                      {askResult.query_plan.time_range.start_date} →{' '}
                      {askResult.query_plan.time_range.end_date || '…'}
                    </span>
                  )}
                  {askResult.query_plan.include_tags.map((t) => (
                    <span
                      key={`in-${t}`}
                      className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800"
                    >
                      +{t}
                    </span>
                  ))}
                  {askResult.query_plan.exclude_tags.map((t) => (
                    <span
                      key={`out-${t}`}
                      className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800"
                    >
                      -{t}
                    </span>
                  ))}
                  {askResult.query_plan.folder_paths?.map((p) => (
                    <span
                      key={`f-${p}`}
                      className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800"
                    >
                      folder:{p}
                    </span>
                  ))}
                  {!askResult.query_plan.time_range &&
                    askResult.query_plan.include_tags.length === 0 &&
                    askResult.query_plan.exclude_tags.length === 0 &&
                    !askResult.query_plan.folder_paths && (
                      <span className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800">
                        all-notes
                      </span>
                    )}
                </div>
                <div className="mt-3 text-xs text-blue-900">
                  <span className="font-semibold">Semantic query:</span>{' '}
                  {askResult.query_plan.semantic_query}
                </div>
              </div>

              {askResult.warnings?.length > 0 && (
                <Alert variant="warning">
                  <AlertDescription>
                    <div className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-2">
                      Warnings
                    </div>
                    <ul className="text-sm text-amber-900 space-y-1 list-disc pl-5">
                      {askResult.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="prose prose-blue max-w-none">
                <ReactMarkdown>{askResult.answer_markdown}</ReactMarkdown>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-gray-900">Sources</div>
                  <div className="text-xs text-gray-500">{askResult.sources.length} note(s)</div>
                </div>
                <div className="space-y-2">
                  {askResult.sources.map((s) => (
                    <button
                      key={s.note_id}
                      onClick={() => void openSourceNote(s.note_id)}
                      className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 hover:border-blue-300 hover:shadow-xs transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {s.title}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(s.updated_at).toLocaleString()} · score{' '}
                            {Math.round(s.score * 100)}%
                          </div>
                        </div>
                        <svg
                          className="h-5 w-5 text-gray-400 shrink-0"
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
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {askResult.followups?.length > 0 && (
                <div className="border-t pt-4">
                  <div className="text-sm font-semibold text-gray-900 mb-2">Follow-ups</div>
                  <div className="flex flex-col gap-2">
                    {askResult.followups.map((f, i) => (
                      <button
                        key={i}
                        onClick={() => void handleAskQuery(f)}
                        className="text-left rounded-lg border border-gray-200 bg-gray-50 p-3 hover:bg-gray-100 transition text-sm text-gray-800"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </SlideOver>

      {/* Source Note Detail (nested) */}
      <SlideOver
        isOpen={!!selectedSourceNote || isLoadingSourceNote}
        onClose={() => setSelectedSourceNote(null)}
        title="Source Note"
        width="max-w-xl"
      >
        {isLoadingSourceNote ? (
          <div className="py-10 text-sm text-gray-600">Loading note…</div>
        ) : selectedSourceNote ? (
          <NoteDetail note={selectedSourceNote} onDelete={handleDeleteSourceNote} />
        ) : null}
      </SlideOver>
    </>
  )
}
