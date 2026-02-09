import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@clerk/clerk-react'
import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'

import SlideOver from '../components/ui/SlideOver'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import NoteDetail from '../components/NoteDetail'
import { fetchNote } from '../lib/api'
import type { AskHistoryItem, DigestHistoryItem, DigestResult, Note } from '../lib/api'
import {
  useAskHistory,
  useDigests,
  useDeleteAskHistoryItem,
  useDeleteDigest,
  useGenerateSummary,
} from '../hooks/useNotes'

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
  const generateSummaryMutation = useGenerateSummary()

  const [selectedDigest, setSelectedDigest] = useState<DigestHistoryItem | null>(null)
  const [selectedAsk, setSelectedAsk] = useState<AskHistoryItem | null>(null)

  const [selectedSourceNote, setSelectedSourceNote] = useState<Note | null>(null)
  const [isLoadingSourceNote, setIsLoadingSourceNote] = useState(false)

  const [inlineResult, setInlineResult] = useState<DigestResult | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const parsedDigest = useMemo(() => {
    if (!selectedDigest) return null
    try {
      return JSON.parse(selectedDigest.content) as {
        summary?: string
        key_themes?: string[]
        action_items?: string[]
      }
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
    } catch (error) {
      console.warn('Unable to parse query plan JSON', error)
    }
    try {
      cited = JSON.parse(selectedAsk.cited_note_ids_json)
    } catch (error) {
      console.warn('Unable to parse cited note IDs JSON', error)
    }
    try {
      scores = selectedAsk.source_scores_json ? JSON.parse(selectedAsk.source_scores_json) : {}
    } catch (error) {
      console.warn('Unable to parse source score JSON', error)
    }
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

  const handleGenerateSummary = () => {
    setSummaryError(null)
    setInlineResult(null)
    generateSummaryMutation.mutate(undefined, {
      onSuccess: (data) => {
        setInlineResult(data)
        setTab('digests')
      },
      onError: (error) => {
        setSummaryError(error instanceof Error ? error.message : 'Failed to generate summary')
      },
    })
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
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-gray-900">Summaries</h2>
          <Button onClick={handleGenerateSummary} loading={generateSummaryMutation.isPending}>
            Generate Summary
          </Button>
        </div>

        {summaryError && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between">
              <span>{summaryError}</span>
              <button
                onClick={() => setSummaryError(null)}
                className="text-red-600 hover:text-red-800 text-sm font-medium"
              >
                Dismiss
              </button>
            </AlertDescription>
          </Alert>
        )}

        {inlineResult && (
          <Alert variant="accent" className="rounded-xl p-6">
            <AlertDescription>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-purple-900">New Summary</h3>
                <button
                  onClick={() => setInlineResult(null)}
                  className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                >
                  Dismiss
                </button>
              </div>
              <div className="prose prose-purple max-w-none text-sm mb-4">
                <ReactMarkdown>{inlineResult.summary}</ReactMarkdown>
              </div>
              {inlineResult.key_themes.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-purple-800 uppercase tracking-wider mb-2">
                    Key Themes
                  </h4>
                  <ul className="space-y-1 text-sm text-gray-800 list-disc pl-5">
                    {inlineResult.key_themes.map((theme, i) => (
                      <li key={i}>{theme}</li>
                    ))}
                  </ul>
                </div>
              )}
              {inlineResult.action_items.length > 0 && (
                <div className="pt-4 border-t border-purple-200">
                  <h4 className="text-sm font-semibold text-purple-800 uppercase tracking-wider mb-2">
                    Action Items
                  </h4>
                  <ul className="space-y-1 text-sm text-gray-800 list-disc pl-5">
                    {inlineResult.action_items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="digests">Digests</TabsTrigger>
            <TabsTrigger value="ask">Ask History</TabsTrigger>
          </TabsList>
        </Tabs>

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
              <div className="text-sm text-gray-700 whitespace-pre-wrap">
                {selectedDigest.content}
              </div>
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
              <Button
                variant="destructive"
                onClick={() => void handleDeleteDigest(selectedDigest.id)}
                className="w-full"
              >
                Delete Digest
              </Button>
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
            <Alert variant="info">
              <AlertDescription>
                <div className="text-xs font-semibold text-blue-900 uppercase tracking-wider mb-1">
                  Question
                </div>
                <div className="text-sm text-blue-900">{selectedAsk.query}</div>
              </AlertDescription>
            </Alert>
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
                      className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 hover:border-blue-300 hover:shadow-xs transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{nid}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            score {Math.round(((parsedAsk.scores?.[nid] ?? 0) as number) * 100)}%
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
            ) : null}

            <div className="pt-4 border-t">
              <Button
                variant="destructive"
                onClick={() => void handleDeleteAsk(selectedAsk.id)}
                className="w-full"
              >
                Delete Ask History Item
              </Button>
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
          className="w-full text-left rounded-lg border border-gray-200 bg-white p-4 hover:border-purple-300 hover:shadow-xs transition"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">Digest</div>
              <div className="text-xs text-gray-500 mt-1">
                {new Date(d.created_at).toLocaleString()}
              </div>
            </div>
            <svg
              className="h-5 w-5 text-gray-400 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
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
          className="w-full text-left rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-xs transition"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">{d.query}</div>
              <div className="text-xs text-gray-500 mt-1">
                {new Date(d.created_at).toLocaleString()}
              </div>
            </div>
            <svg
              className="h-5 w-5 text-gray-400 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      ))}
    </div>
  )
}
