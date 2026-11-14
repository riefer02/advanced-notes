import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'

import SlideOver from '../components/ui/SlideOver'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ChevronRight, Trash2 } from 'lucide-react'
import { Callout, DetailCard, DetailCardHeader, DetailSection } from '@/components/ui/detail'
import { PageHeader } from '@/components/ui/page-header'
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
  const sourceRequestRef = useRef(0)

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

  const handleDeleteDigest = async (digestId: string) => {
    if (!confirm('Delete this digest?')) return
    try {
      await deleteDigestMutation.mutateAsync(digestId)
      setSelectedDigest(null)
    } catch {
      alert('Failed to delete digest')
    }
  }

  const handleDeleteAsk = async (askId: string) => {
    if (!confirm('Delete this Ask history item?')) return
    try {
      await deleteAskMutation.mutateAsync(askId)
      setSelectedAsk(null)
    } catch {
      alert('Failed to delete Ask history item')
    }
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 px-5 py-6 sm:px-8">
        <PageHeader
          title="Summaries"
          description="Digests of what you have captured, generated on demand."
          actions={
            <Button
              size="sm"
              onClick={handleGenerateSummary}
              loading={generateSummaryMutation.isPending}
            >
              Generate summary
            </Button>
          }
        />

        {summaryError && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between">
              <span>{summaryError}</span>
              <button
                onClick={() => setSummaryError(null)}
                className="text-destructive hover:text-destructive text-sm font-medium"
              >
                Dismiss
              </button>
            </AlertDescription>
          </Alert>
        )}

        {inlineResult && (
          <DetailCard>
            <DetailCardHeader
              title="New summary"
              subtitle="Generated just now"
              action={
                <Button variant="ghost" size="xs" onClick={() => setInlineResult(null)}>
                  Dismiss
                </Button>
              }
            />
            <div className="border-line space-y-4 border-t px-4 py-4">
              <div className="markdown">
                <ReactMarkdown>{inlineResult.summary}</ReactMarkdown>
              </div>
              {inlineResult.key_themes.length > 0 && (
                <DetailSection label="Key themes">
                  <ul className="text-ink-muted list-disc space-y-1 pl-5 text-[13px] leading-5">
                    {inlineResult.key_themes.map((theme, i) => (
                      <li key={i}>{theme}</li>
                    ))}
                  </ul>
                </DetailSection>
              )}
              {inlineResult.action_items.length > 0 && (
                <DetailSection label="Action items">
                  <ul className="text-ink-muted list-disc space-y-1 pl-5 text-[13px] leading-5">
                    {inlineResult.action_items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </DetailSection>
              )}
            </div>
          </DetailCard>
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
          <div className="space-y-4 pb-2">
            <div className="text-ink-subtle text-xs">
              {new Date(selectedDigest.created_at).toLocaleString()}
            </div>
            {parsedDigest?.summary ? (
              <div className="markdown">
                <ReactMarkdown>{parsedDigest.summary}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-ink text-[15px] leading-7 whitespace-pre-wrap">
                {selectedDigest.content}
              </div>
            )}

            {parsedDigest?.key_themes?.length ? (
              <DetailSection label="Key themes">
                <ul className="text-ink-muted list-disc space-y-1 pl-5 text-[13px] leading-5">
                  {parsedDigest.key_themes.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </DetailSection>
            ) : null}

            {parsedDigest?.action_items?.length ? (
              <DetailSection label="Action items">
                <ul className="text-ink-muted list-disc space-y-1 pl-5 text-[13px] leading-5">
                  {parsedDigest.action_items.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </DetailSection>
            ) : null}

            <div className="border-line border-t pt-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/8 hover:text-destructive"
                onClick={() => void handleDeleteDigest(selectedDigest.id)}
              >
                <Trash2 />
                Delete digest
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
          <div className="space-y-4 pb-2">
            <div className="text-ink-subtle text-xs">
              {new Date(selectedAsk.created_at).toLocaleString()}
            </div>
            <Callout tone="brand" label="Question">
              <p className="text-[13px] leading-5">{selectedAsk.query}</p>
            </Callout>
            <div className="markdown">
              <ReactMarkdown>{selectedAsk.answer_markdown}</ReactMarkdown>
            </div>

            {parsedAsk?.cited?.length ? (
              <DetailSection label="Cited notes">
                <div className="space-y-1.5">
                  {parsedAsk.cited.map((nid) => (
                    <button
                      key={nid}
                      onClick={() => void openSourceNote(nid)}
                      className="border-line bg-surface hover:border-line-strong hover:shadow-card focus-visible:ring-ring w-full rounded-xl border p-3 text-left transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-ink truncate text-[13px] font-medium">
                            Note {nid.slice(0, 8)}
                          </div>
                          <div className="text-ink-subtle mt-0.5 text-[11px]">
                            {Math.round(((parsedAsk.scores?.[nid] ?? 0) as number) * 100)}% match
                          </div>
                        </div>
                        <ChevronRight className="text-ink-subtle size-4 shrink-0" aria-hidden />
                      </div>
                    </button>
                  ))}
                </div>
              </DetailSection>
            ) : null}

            <div className="border-line border-t pt-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/8 hover:text-destructive"
                onClick={() => void handleDeleteAsk(selectedAsk.id)}
              >
                <Trash2 />
                Delete ask history item
              </Button>
            </div>
          </div>
        )}
      </SlideOver>

      <SlideOver
        isOpen={!!selectedSourceNote || isLoadingSourceNote}
        onClose={closeSourceNote}
        title="Source Note"
        width="max-w-xl"
      >
        {isLoadingSourceNote ? (
          <div className="py-10 text-sm text-ink-muted">Loading note…</div>
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
          />
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
    return <div className="text-ink-subtle py-6 text-[13px]">Loading digests…</div>
  }
  if (props.error) {
    return <div className="text-destructive py-6 text-[13px]">Failed to load digests</div>
  }
  if (!props.digests.length) {
    return (
      <div className="border-line bg-surface-muted/30 rounded-xl border border-dashed px-4 py-8 text-center">
        <p className="text-ink text-[13px] font-medium">No digests yet</p>
        <p className="text-ink-subtle mt-1 text-xs">
          Generate a summary to turn your notes into a digest.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {props.digests.map((d) => {
        const preview =
          d.content
            .replace(/[#*_>`~-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 110) || 'Digest'

        return (
          <button
            key={d.id}
            onClick={() => props.onSelect(d)}
            className="border-line bg-surface hover:border-line-strong hover:shadow-card focus-visible:ring-ring w-full rounded-xl border p-3 text-left transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-ink line-clamp-1 text-[13px] font-medium">{preview}</div>
                <div className="text-ink-subtle mt-0.5 text-[11px]">
                  {new Date(d.created_at).toLocaleString()}
                </div>
              </div>
              <ChevronRight className="text-ink-subtle size-4 shrink-0" aria-hidden />
            </div>
          </button>
        )
      })}
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
    return <div className="text-ink-subtle py-6 text-[13px]">Loading ask history…</div>
  }
  if (props.error) {
    return <div className="text-destructive py-6 text-[13px]">Failed to load ask history</div>
  }
  if (!props.items.length) {
    return (
      <div className="border-line bg-surface-muted/30 rounded-xl border border-dashed px-4 py-8 text-center">
        <p className="text-ink text-[13px] font-medium">No questions yet</p>
        <p className="text-ink-subtle mt-1 text-xs">
          Ask a question from the header or command palette and it will show up here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {props.items.map((d) => (
        <button
          key={d.id}
          onClick={() => props.onSelect(d)}
          className="border-line bg-surface hover:border-line-strong hover:shadow-card focus-visible:ring-ring w-full rounded-xl border p-3 text-left transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:outline-none"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-ink truncate text-[13px] font-medium">{d.query}</div>
              <div className="text-ink-subtle mt-0.5 text-[11px]">
                {new Date(d.created_at).toLocaleString()}
              </div>
            </div>
            <ChevronRight className="text-ink-subtle size-4 shrink-0" aria-hidden />
          </div>
        </button>
      ))}
    </div>
  )
}
