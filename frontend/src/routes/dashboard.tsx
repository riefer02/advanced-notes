import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@clerk/clerk-react'
import { useState, useEffect, useRef } from 'react'
import AudioUploader from '../components/AudioUploader'
import NotesPanel from '../components/NotesPanel'
import { setAuthTokenGetter, generateSummary, askNotes, fetchNote, deleteNote } from '../lib/api'
import type { DigestResult, AskResponse, Note } from '../lib/api'
import SlideOver from '../components/ui/SlideOver'
import ReactMarkdown from 'react-markdown'
import NoteDetail from '../components/NoteDetail'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const recordButtonRef = useRef<HTMLButtonElement>(null)

  // Set up auth token getter for API calls
  useEffect(() => {
    setAuthTokenGetter(getToken)
  }, [getToken])
  const [activeTab, setActiveTab] = useState<'transcribe' | 'notes'>('transcribe')
  
  // Summary Feature State
  const [showSummary, setShowSummary] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [digestResult, setDigestResult] = useState<DigestResult | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  // Ask Notes Feature State
  const [showAsk, setShowAsk] = useState(false)
  const [askQuery, setAskQuery] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [askResult, setAskResult] = useState<AskResponse | null>(null)
  const [askError, setAskError] = useState<string | null>(null)
  const [selectedSourceNote, setSelectedSourceNote] = useState<Note | null>(null)
  const [isLoadingSourceNote, setIsLoadingSourceNote] = useState(false)
  
  // Keyboard shortcuts
  // Note: Recording shortcut intentionally disabled for now.

  const handleSummarize = async () => {
    setShowSummary(true)
    setIsSummarizing(true)
    setDigestResult(null)
    setSummaryError(null)
    
    try {
      const result = await generateSummary()
      setDigestResult(result)
    } catch (error) {
      console.error('Failed to generate summary:', error)
      setSummaryError(error instanceof Error ? error.message : 'Failed to generate summary')
    } finally {
      setIsSummarizing(false)
    }
  }

  const handleAskQuery = async (query: string) => {
    const q = query.trim()
    if (!q) return
    setShowAsk(true)
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
  }

  const handleAskClick = async () => {
    await handleAskQuery(askQuery)
  }

  const openSourceNote = async (noteId: string) => {
    setIsLoadingSourceNote(true)
    try {
      const note = await fetchNote(noteId)
      setSelectedSourceNote(note)
    } catch (e) {
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
      // Keep the ask result visible; sources may now be stale until next ask.
    } catch (e) {
      alert('Failed to delete note')
    }
  }

  // Show loading state while Clerk is loading
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  // Redirect to sign-in if not authenticated
  if (!isSignedIn) {
    window.location.href = '/sign-in'
    return null
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Mobile Tabs - Visible only on mobile */}
      <div className="lg:hidden border-b bg-white flex-shrink-0">
        <div className="flex">
          <button
            onClick={() => setActiveTab('transcribe')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'transcribe'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            aria-current={activeTab === 'transcribe' ? 'page' : undefined}
          >
            🎤 Transcribe
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'notes'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            aria-current={activeTab === 'notes' ? 'page' : undefined}
          >
            📁 Notes
          </button>
        </div>
      </div>

      {/* Desktop Split-Pane Layout */}
      <div className="flex-1 lg:flex overflow-hidden">
        {/* Left Pane: Input Controls (40%) */}
        <div
          className={`lg:w-[40%] lg:border-r lg:border-gray-200 bg-white lg:bg-gray-50 overflow-y-auto ${
            activeTab === 'transcribe' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="p-4 lg:p-8 max-w-2xl mx-auto">
             <div className="lg:hidden mb-6">
                <button
                  onClick={() => setShowAsk(true)}
                  className="w-full mb-3 flex justify-center items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-sm font-medium transition-colors border border-blue-200"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16h6M12 20a8 8 0 100-16 8 8 0 000 16z" />
                  </svg>
                  Ask Your Notes
                </button>
                <button
                  onClick={handleSummarize}
                  className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg text-sm font-medium transition-colors border border-purple-200"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Summarize Recent Notes
                </button>
             </div>
             <AudioUploader recordButtonRef={recordButtonRef} />
          </div>
        </div>

        {/* Right Pane: Notes Panel (60%) */}
        <div
          className={`lg:w-[60%] overflow-hidden ${
            activeTab === 'notes' ? 'block' : 'hidden lg:block'
          }`}
        >
          <NotesPanel />
        </div>
      </div>

      {/* Summary Slide-Over */}
      <SlideOver
        isOpen={showSummary}
        onClose={() => setShowSummary(false)}
        title={
          <div className="flex items-center gap-2 text-purple-900">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Smart Summary
          </div>
        }
      >
        <div className="space-y-6">
          {isSummarizing ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="relative">
                <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold text-purple-600">AI</span>
                </div>
              </div>
              <p className="text-sm text-purple-600 font-medium animate-pulse">
                Analyzing your recent notes...
              </p>
            </div>
          ) : summaryError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-medium text-red-800">Summarization Failed</h3>
                <p className="text-sm text-red-600 mt-1">{summaryError}</p>
              </div>
              <button
                onClick={handleSummarize}
                className="px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors border border-red-200"
              >
                Try Again
              </button>
            </div>
          ) : digestResult ? (
            <div className="prose prose-purple max-w-none">
              <div className="bg-purple-50 rounded-xl p-6 border border-purple-100 mb-6">
                <h3 className="text-lg font-semibold text-purple-900 mb-4 mt-0">Smart Digest</h3>
                <div className="text-gray-800 leading-relaxed mb-4 text-sm">
                  <ReactMarkdown>{digestResult.summary}</ReactMarkdown>
                </div>
                
                {digestResult.key_themes.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-purple-800 uppercase tracking-wider mb-2">Key Themes</h4>
                    <ul className="space-y-1 text-gray-700 list-none pl-0 my-0">
                      {digestResult.key_themes.map((theme, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-1.5 w-1.5 h-1.5 bg-purple-500 rounded-full flex-shrink-0"></span>
                          <span>{theme}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {digestResult.action_items.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-purple-200">
                    <h4 className="text-sm font-semibold text-purple-800 uppercase tracking-wider mb-2">Action Items</h4>
                    <ul className="space-y-2 text-gray-700 list-none pl-0 my-0">
                      {digestResult.action_items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <input type="checkbox" className="mt-1 rounded border-purple-300 text-purple-600 focus:ring-purple-500" />
                          <span className="text-sm">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
             <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-gray-500">
                  Click "Summarize Recent" to generate a digest of your latest notes.
                </p>
             </div>
          )}
        </div>
      </SlideOver>

      {/* Ask Notes Slide-Over */}
      <SlideOver
        isOpen={showAsk}
        onClose={() => {
          setShowAsk(false)
          setAskError(null)
          setIsAsking(false)
        }}
        title={
          <div className="flex items-center gap-2 text-blue-900">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16h6M12 20a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            Ask Your Notes
          </div>
        }
        width="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-900" htmlFor="ask-query">
              Question
            </label>
            <textarea
              id="ask-query"
              value={askQuery}
              onChange={(e) => setAskQuery(e.target.value)}
              placeholder='e.g. "Tell me what I have been eating in February"'
              className="w-full min-h-[90px] rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleAskClick}
                disabled={!askQuery.trim() || isAsking}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                {isAsking ? 'Asking…' : 'Ask'}
              </button>
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
              <p className="text-sm text-blue-700 font-medium">Planning + searching + summarizing…</p>
            </div>
          )}

          {askError && (
            <div className="rounded-lg bg-red-50 p-4 border border-red-200">
              <p className="text-sm text-red-800">{askError}</p>
            </div>
          )}

          {askResult && (
            <div className="space-y-6">
              {/* Derived filters */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <div className="text-xs font-semibold text-blue-900 uppercase tracking-wider mb-3">
                  Derived filters
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {askResult.query_plan.time_range?.start_date && (
                    <span className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800">
                      {askResult.query_plan.time_range.start_date} → {askResult.query_plan.time_range.end_date || '…'}
                    </span>
                  )}
                  {askResult.query_plan.include_tags.map((t) => (
                    <span key={`in-${t}`} className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800">
                      +{t}
                    </span>
                  ))}
                  {askResult.query_plan.exclude_tags.map((t) => (
                    <span key={`out-${t}`} className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800">
                      -{t}
                    </span>
                  ))}
                  {askResult.query_plan.folder_paths?.map((p) => (
                    <span key={`f-${p}`} className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800">
                      folder:{p}
                    </span>
                  ))}
                  {!askResult.query_plan.time_range && askResult.query_plan.include_tags.length === 0 && askResult.query_plan.exclude_tags.length === 0 && !askResult.query_plan.folder_paths && (
                    <span className="px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800">
                      all-notes
                    </span>
                  )}
                </div>
                <div className="mt-3 text-xs text-blue-900">
                  <span className="font-semibold">Semantic query:</span> {askResult.query_plan.semantic_query}
                </div>
              </div>

              {/* Warnings */}
              {askResult.warnings?.length > 0 && (
                <div className="rounded-lg bg-yellow-50 p-4 border border-yellow-200">
                  <div className="text-xs font-semibold text-yellow-900 uppercase tracking-wider mb-2">Warnings</div>
                  <ul className="text-sm text-yellow-900 space-y-1 list-disc pl-5">
                    {askResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Answer */}
              <div className="prose prose-blue max-w-none">
                <ReactMarkdown>{askResult.answer_markdown}</ReactMarkdown>
              </div>

              {/* Sources */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-gray-900">Sources</div>
                  <div className="text-xs text-gray-500">{askResult.sources.length} note(s)</div>
                </div>
                <div className="space-y-2">
                  {askResult.sources.map((s) => (
                    <button
                      key={s.note_id}
                      onClick={() => openSourceNote(s.note_id)}
                      className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 hover:border-blue-300 hover:shadow-sm transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{s.title}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(s.updated_at).toLocaleString()} · score {Math.round(s.score * 100)}%
                          </div>
                        </div>
                        <svg className="h-5 w-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                      {s.tags?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {s.tags.slice(0, 4).map((t) => (
                            <span key={`${s.note_id}-${t}`} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {t}
                            </span>
                          ))}
                          {s.tags.length > 4 && <span className="text-xs text-gray-400">+{s.tags.length - 4}</span>}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Follow-ups */}
              {askResult.followups?.length > 0 && (
                <div className="border-t pt-4">
                  <div className="text-sm font-semibold text-gray-900 mb-2">Follow-ups</div>
                  <div className="flex flex-col gap-2">
                    {askResult.followups.map((f, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setAskQuery(f)
                          void handleAskQuery(f)
                        }}
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
    </div>
  )
}
