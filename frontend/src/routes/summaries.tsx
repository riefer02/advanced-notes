import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth, UserButton } from '@clerk/clerk-react'
import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'

import SlideOver from '../components/ui/SlideOver'
import NoteDetail from '../components/NoteDetail'
import { fetchNote } from '../lib/api'
import type { AskHistoryItem, DigestHistoryItem, Note } from '../lib/api'
import { useAskHistory, useDigests, useDeleteAskHistoryItem, useDeleteDigest } from '../hooks/useNotes'

export const Route = createFileRoute('/summaries')({
  component: SummariesPage,
})

type TabKey = 'digests' | 'ask'

function SummariesPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const [tab, setTab] = useState<TabKey>('digests')

  const digestsQuery = useDigests(50, 0)
  const askHistoryQuery = useAskHistory(50, 0)

  const deleteDigestMutation = useDeleteDigest()
  const deleteAskMutation = useDeleteAskHistoryItem()

  const [selectedDigest, setSelectedDigest] = useState<DigestHistoryItem | null>(null)
  const [selectedAsk, setSelectedAsk] = useState<AskHistoryItem | null>(null)

  const [selectedSourceNote, setSelectedSourceNote] = useState<Note | null>(null)
  const [isLoadingSourceNote, setIsLoadingSourceNote] = useState(false)

  const parsedDigest = useMemo(() => {
    if (!selectedDigest) return null
    try {
      return JSON.parse(selectedDigest.content) as { summary?: string; key_themes?: string[]; action_items?: string[] }
    } catch {
      return null
    }
  }, [selectedDigest])

  const parsedAsk = useMemo(() => {
    if (!selectedAsk) return null
    let queryPlan: unknown = null
    let cited: string[] = []
    let scores: Record<string, number> = {}
    try {
      queryPlan = JSON.parse(selectedAsk.query_plan_json)
    } catch {}
    try {
      cited = JSON.parse(selectedAsk.cited_note_ids_json)
    } catch {}
    try {
      scores = selectedAsk.source_scores_json ? JSON.parse(selectedAsk.source_scores_json) : {}
    } catch {}
    return { queryPlan, cited, scores }
  }, [selectedAsk])

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

  const handleDeleteDigest = async (digestId: string) => {
    if (!confirm('Delete this digest?')) return
    await deleteDigestMutation.mutateAsync(digestId)
    setSelectedDigest(null)
  }

  const handleDeleteAsk = async (askId: string) => {
    if (!confirm('Delete this Ask history item?')) return
    await deleteAskMutation.mutateAsync(askId)
    setSelectedAsk(null)
  }

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!isSignedIn) {
    window.location.href = '/sign-in'
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col h-screen overflow-hidden">
      <header className="border-b bg-white sticky top-0 z-10 shadow-sm flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <Link
                to="/dashboard"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                ← Dashboard
              </Link>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
                🐺 Chisos
              </h1>
              <span className="text-sm font-semibold text-gray-900">Summaries</span>
            </div>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab('digests')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                tab === 'digests'
                  ? 'bg-purple-50 text-purple-800 border-purple-200'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Digests
            </button>
            <button
              onClick={() => setTab('ask')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                tab === 'ask'
                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Ask History
            </button>
          </div>

          {tab === 'digests' ? (
            <DigestList
              digests={digestsQuery.data?.digests ?? []}
              isLoading={digestsQuery.isLoading}
              error={digestsQuery.error}
              onSelect={setSelectedDigest}
            />
          ) : (
            <AskHistoryList
              items={askHistoryQuery.data?.items ?? []}
              isLoading={askHistoryQuery.isLoading}
              error={askHistoryQuery.error}
              onSelect={setSelectedAsk}
            />
          )}
        </div>
      </div>

      <SlideOver
        isOpen={!!selectedDigest}
        onClose={() => setSelectedDigest(null)}
        title="Digest"
        width="max-w-2xl"
      >
        {selectedDigest && (
          <div className="space-y-4 pb-6">
            <div className="text-xs text-gray-500">
              {new Date(selectedDigest.created_at).toLocaleString()}
            </div>
            {parsedDigest?.summary ? (
              <div className="prose prose-purple max-w-none">
                <ReactMarkdown>{parsedDigest.summary}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-sm text-gray-700 whitespace-pre-wrap">{selectedDigest.content}</div>
            )}

            {parsedDigest?.key_themes?.length ? (
              <div>
                <div className="text-xs font-semibold text-purple-800 uppercase tracking-wider mb-2">
                  Key Themes
                </div>
                <ul className="space-y-1 text-sm text-gray-800 list-disc pl-5">
                  {parsedDigest.key_themes.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {parsedDigest?.action_items?.length ? (
              <div>
                <div className="text-xs font-semibold text-purple-800 uppercase tracking-wider mb-2">
                  Action Items
                </div>
                <ul className="space-y-1 text-sm text-gray-800 list-disc pl-5">
                  {parsedDigest.action_items.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="pt-4 border-t">
              <button
                onClick={() => void handleDeleteDigest(selectedDigest.id)}
                className="w-full px-4 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-sm font-medium transition-colors"
              >
                Delete Digest
              </button>
            </div>
          </div>
        )}
      </SlideOver>

      <SlideOver
        isOpen={!!selectedAsk}
        onClose={() => setSelectedAsk(null)}
        title="Ask History"
        width="max-w-2xl"
      >
        {selectedAsk && (
          <div className="space-y-4 pb-6">
            <div className="text-xs text-gray-500">
              {new Date(selectedAsk.created_at).toLocaleString()}
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <div className="text-xs font-semibold text-blue-900 uppercase tracking-wider mb-1">
                Question
              </div>
              <div className="text-sm text-blue-900">{selectedAsk.query}</div>
            </div>
            <div className="prose prose-blue max-w-none">
              <ReactMarkdown>{selectedAsk.answer_markdown}</ReactMarkdown>
            </div>

            {parsedAsk?.cited?.length ? (
              <div className="border-t pt-4">
                <div className="text-sm font-semibold text-gray-900 mb-2">Cited Notes</div>
                <div className="space-y-2">
                  {parsedAsk.cited.map((nid) => (
                    <button
                      key={nid}
                      onClick={() => void openSourceNote(nid)}
                      className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 hover:border-blue-300 hover:shadow-sm transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{nid}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            score {Math.round(((parsedAsk.scores?.[nid] ?? 0) as number) * 100)}%
                          </div>
                        </div>
                        <svg className="h-5 w-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="pt-4 border-t">
              <button
                onClick={() => void handleDeleteAsk(selectedAsk.id)}
                className="w-full px-4 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-sm font-medium transition-colors"
              >
                Delete Ask History Item
              </button>
            </div>
          </div>
        )}
      </SlideOver>

      <SlideOver
        isOpen={!!selectedSourceNote || isLoadingSourceNote}
        onClose={() => setSelectedSourceNote(null)}
        title="Source Note"
        width="max-w-xl"
      >
        {isLoadingSourceNote ? (
          <div className="py-10 text-sm text-gray-600">Loading note…</div>
        ) : selectedSourceNote ? (
          <NoteDetail note={selectedSourceNote} onDelete={() => {}} />
        ) : null}
      </SlideOver>
    </div>
  )
}

function DigestList(props: {
  digests: DigestHistoryItem[]
  isLoading: boolean
  error: unknown
  onSelect: (d: DigestHistoryItem) => void
}) {
  if (props.isLoading) {
    return <div className="text-sm text-gray-600">Loading digests…</div>
  }
  if (props.error) {
    return <div className="text-sm text-red-700">Failed to load digests</div>
  }
  if (!props.digests.length) {
    return <div className="text-sm text-gray-600">No digests yet.</div>
  }

  return (
    <div className="space-y-2">
      {props.digests.map((d) => (
        <button
          key={d.id}
          onClick={() => props.onSelect(d)}
          className="w-full text-left rounded-lg border border-gray-200 bg-white p-4 hover:border-purple-300 hover:shadow-sm transition"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">Digest</div>
              <div className="text-xs text-gray-500 mt-1">{new Date(d.created_at).toLocaleString()}</div>
            </div>
            <svg className="h-5 w-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      ))}
    </div>
  )
}

function AskHistoryList(props: {
  items: AskHistoryItem[]
  isLoading: boolean
  error: unknown
  onSelect: (d: AskHistoryItem) => void
}) {
  if (props.isLoading) {
    return <div className="text-sm text-gray-600">Loading ask history…</div>
  }
  if (props.error) {
    return <div className="text-sm text-red-700">Failed to load ask history</div>
  }
  if (!props.items.length) {
    return <div className="text-sm text-gray-600">No ask history yet.</div>
  }

  return (
    <div className="space-y-2">
      {props.items.map((d) => (
        <button
          key={d.id}
          onClick={() => props.onSelect(d)}
          className="w-full text-left rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">{d.query}</div>
              <div className="text-xs text-gray-500 mt-1">{new Date(d.created_at).toLocaleString()}</div>
            </div>
            <svg className="h-5 w-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      ))}
    </div>
  )
}


