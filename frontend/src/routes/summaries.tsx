import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useQueries } from '@tanstack/react-query'

import SlideOver from '../components/ui/SlideOver'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ChevronRight, MessageSquare, Trash2 } from 'lucide-react'
import { Callout, DetailCard, DetailCardHeader, DetailSection } from '@/components/ui/detail'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/ui/page-header'
import NoteDetail from '../components/NoteDetail'
import { useAppShell } from '../components/layout/AppShell'
import { fetchAskHistory, fetchDigests, fetchNote } from '../lib/api'
import type { AskHistoryItem, DigestHistoryItem, DigestResult, Note } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import { formatDateTime } from '../lib/format'
import { track } from '../lib/analytics'
import { useDeleteAskHistoryItem, useDeleteDigest, useGenerateSummary } from '../hooks/useNotes'

export const Route = createFileRoute('/summaries')({
  component: SummariesPage,
})

type TabKey = 'digests' | 'ask'

const DIGEST_PAGE_SIZE = 50
const MAX_DIGEST_PAGES = 10
const ASK_PAGE_SIZE = 50
const MAX_ASK_PAGES = 10

interface DigestContent {
  summary?: string
  key_themes?: string[]
  action_items?: string[]
}

function parseDigestContent(content: string): DigestContent | null {
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as DigestContent
    }
  } catch {
    // Legacy rows are plain text; the caller renders them directly.
  }
  return null
}

/** Collapse markdown into one readable line for list previews. */
function flattenMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstSentence(text: string): string {
  const flat = flattenMarkdown(text)
  if (!flat) return ''
  const match = flat.match(/^(.+?[.!?])(\s|$)/)
  const sentence = match ? match[1] : flat
  return sentence.length > 140 ? `${sentence.slice(0, 137).trimEnd()}…` : sentence
}

/** Malformed/partial JSON should not reach the drawer as punctuation soup. */
function digestFallbackText(content: string): string {
  const trimmed = content.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed
      .replace(/[{}[\]"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return content
}

function digestTitle(digest: DigestHistoryItem): string {
  const parsed = parseDigestContent(digest.content)
  if (parsed?.summary) {
    const title = firstSentence(parsed.summary)
    if (title) return title
  }
  return firstSentence(digestFallbackText(digest.content)) || 'Digest'
}

function SummariesPage() {
  const [tab, setTab] = useState<TabKey>('digests')
  const { openAsk } = useAppShell()

  const [digestPages, setDigestPages] = useState(1)
  const digestQueries = useQueries({
    queries: Array.from({ length: digestPages }, (_, page) => ({
      queryKey: queryKeys.digests(DIGEST_PAGE_SIZE, page * DIGEST_PAGE_SIZE),
      queryFn: () => fetchDigests(DIGEST_PAGE_SIZE, page * DIGEST_PAGE_SIZE),
      staleTime: 30000,
    })),
  })
  const digests = digestQueries.flatMap((query) => query.data?.digests ?? [])
  const digestsLoading = digestQueries[0]?.isLoading ?? false
  const digestsError = digestQueries.find((query) => query.error)?.error ?? null

  const lastDigestQuery = digestQueries[digestQueries.length - 1]
  const lastDigestPageSize = lastDigestQuery?.data?.digests.length ?? 0
  const digestsTotal = digestQueries[0]?.data?.total ?? 0
  const hasMoreDigests =
    digestPages < MAX_DIGEST_PAGES &&
    (lastDigestPageSize >= DIGEST_PAGE_SIZE || digestsTotal > digests.length)
  const isLoadingMoreDigests = digestPages > 1 && (lastDigestQuery?.isLoading ?? false)

  const [askPages, setAskPages] = useState(1)
  const askQueries = useQueries({
    queries: Array.from({ length: askPages }, (_, page) => ({
      queryKey: queryKeys.askHistory(ASK_PAGE_SIZE, page * ASK_PAGE_SIZE),
      queryFn: () => fetchAskHistory(ASK_PAGE_SIZE, page * ASK_PAGE_SIZE),
      staleTime: 30000,
    })),
  })
  const askItems = askQueries.flatMap((query) => query.data?.items ?? [])
  const askLoading = askQueries[0]?.isLoading ?? false
  const askError = askQueries.find((query) => query.error)?.error ?? null
  const lastAskQuery = askQueries[askQueries.length - 1]
  const lastAskPageSize = lastAskQuery?.data?.items.length ?? 0
  const askTotal = askQueries[0]?.data?.total ?? 0
  const hasMoreAsk =
    askPages < MAX_ASK_PAGES && (lastAskPageSize >= ASK_PAGE_SIZE || askTotal > askItems.length)
  const isLoadingMoreAsk = askPages > 1 && (lastAskQuery?.isLoading ?? false)

  const deleteDigestMutation = useDeleteDigest()
  const deleteAskMutation = useDeleteAskHistoryItem()
  const generateSummaryMutation = useGenerateSummary()

  const [selectedDigest, setSelectedDigest] = useState<DigestHistoryItem | null>(null)
  const [selectedAsk, setSelectedAsk] = useState<AskHistoryItem | null>(null)

  const [selectedSourceNote, setSelectedSourceNote] = useState<Note | null>(null)
  const [isLoadingSourceNote, setIsLoadingSourceNote] = useState(false)
  const [sourceNoteError, setSourceNoteError] = useState<string | null>(null)
  const [sourceNoteDirty, setSourceNoteDirty] = useState(false)
  const [confirmDiscardSource, setConfirmDiscardSource] = useState(false)
  const sourceRequestRef = useRef(0)

  const [inlineResult, setInlineResult] = useState<DigestResult | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [pendingDelete, setPendingDelete] = useState<{
    kind: 'digest' | 'ask'
    id: string
  } | null>(null)

  const parsedDigest = useMemo(() => {
    if (!selectedDigest) return null
    return parseDigestContent(selectedDigest.content)
  }, [selectedDigest])

  const parsedAsk = useMemo(() => {
    if (!selectedAsk) return null
    let cited: string[] = []
    try {
      cited = JSON.parse(selectedAsk.cited_note_ids_json)
    } catch (error) {
      console.warn('Unable to parse cited note IDs JSON', error)
    }
    return { cited }
  }, [selectedAsk])

  const citedNoteTitles = useMemo(() => {
    const citations = selectedAsk?.cited_notes ?? []
    return new Map(citations.map((note) => [note.id, note.title]))
  }, [selectedAsk])

  const closeSourceNote = () => {
    // Invalidate any in-flight fetch so a late response cannot reopen the drawer.
    sourceRequestRef.current += 1
    setIsLoadingSourceNote(false)
    setSourceNoteError(null)
    setSelectedSourceNote(null)
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

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    const target = pendingDelete
    setDeleteError(null)
    try {
      if (target.kind === 'digest') {
        await deleteDigestMutation.mutateAsync(target.id)
        setSelectedDigest(null)
      } else {
        await deleteAskMutation.mutateAsync(target.id)
        setSelectedAsk(null)
      }
    } catch {
      setDeleteError(
        target.kind === 'digest' ? 'Failed to delete digest' : 'Failed to delete Ask history item'
      )
    }
  }

  const handleGenerateSummary = () => {
    setSummaryError(null)
    setInlineResult(null)
    generateSummaryMutation.mutate(undefined, {
      onSuccess: (data) => {
        setInlineResult(data)
        setTab('digests')
        track('summary_generated', { status: 'success' })
      },
      onError: (error) => {
        setSummaryError(error instanceof Error ? error.message : 'Failed to generate summary')
        track('summary_generated', { status: 'failure' })
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
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={openAsk}>
                <MessageSquare />
                Ask notes
              </Button>
              <Button
                size="sm"
                onClick={handleGenerateSummary}
                loading={generateSummaryMutation.isPending}
              >
                Generate summary
              </Button>
            </div>
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

        {deleteError && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between">
              <span>{deleteError}</span>
              <button
                onClick={() => setDeleteError(null)}
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
            digests={digests}
            total={digestsTotal}
            isLoading={digestsLoading}
            error={digestsError}
            hasMore={hasMoreDigests}
            isLoadingMore={isLoadingMoreDigests}
            onLoadMore={() => setDigestPages((page) => page + 1)}
            onSelect={setSelectedDigest}
          />
        ) : (
          <AskHistoryList
            items={askItems}
            total={askTotal}
            isLoading={askLoading}
            error={askError}
            hasMore={hasMoreAsk}
            isLoadingMore={isLoadingMoreAsk}
            onLoadMore={() => setAskPages((page) => page + 1)}
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
              {formatDateTime(selectedDigest.created_at)}
            </div>
            {parsedDigest?.summary ? (
              <div className="markdown">
                <ReactMarkdown>{parsedDigest.summary}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-ink text-[15px] leading-7 whitespace-pre-wrap">
                {digestFallbackText(selectedDigest.content)}
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
                onClick={() => setPendingDelete({ kind: 'digest', id: selectedDigest.id })}
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
            <div className="text-ink-subtle text-xs">{formatDateTime(selectedAsk.created_at)}</div>
            <Callout tone="brand" label="Question">
              <p className="text-[13px] leading-5">{selectedAsk.query}</p>
            </Callout>
            <div className="markdown">
              <ReactMarkdown>{selectedAsk.answer_markdown}</ReactMarkdown>
            </div>

            {parsedAsk?.cited?.length ? (
              <DetailSection label="Cited notes">
                <div className="space-y-1.5">
                  {parsedAsk.cited.map((nid) => {
                    const title = citedNoteTitles.get(nid)
                    return (
                      <button
                        key={nid}
                        onClick={() => void openSourceNote(nid)}
                        className="border-line bg-surface hover:border-line-strong hover:shadow-card focus-visible:ring-ring w-full rounded-xl border p-3 text-left transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:outline-none"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-ink truncate text-[13px] font-medium">
                              {title || `Note ${nid.slice(0, 8)}`}
                            </div>
                            <div className="text-ink-subtle mt-0.5 text-[11px]">
                              matched your question
                            </div>
                          </div>
                          <ChevronRight className="text-ink-subtle size-4 shrink-0" aria-hidden />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </DetailSection>
            ) : null}

            <div className="border-line border-t pt-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/8 hover:text-destructive"
                onClick={() => setPendingDelete({ kind: 'ask', id: selectedAsk.id })}
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
        onClose={requestCloseSourceNote}
        title="Source Note"
        width="max-w-xl"
      >
        {isLoadingSourceNote ? (
          <div className="text-ink-muted py-10 text-sm">Loading note…</div>
        ) : sourceNoteError ? (
          <p className="text-destructive py-6 text-[13px]">{sourceNoteError}</p>
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
            onDirtyChange={setSourceNoteDirty}
          />
        ) : null}
      </SlideOver>

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

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title={pendingDelete?.kind === 'digest' ? 'Delete this digest?' : 'Delete this ask?'}
        description={
          pendingDelete?.kind === 'digest'
            ? 'This removes the digest from your summary history. It cannot be undone.'
            : 'This removes the question and answer from your Ask history. It cannot be undone.'
        }
        confirmLabel="Delete"
        variant="destructive"
        pending={deleteDigestMutation.isPending || deleteAskMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

function DigestList(props: {
  digests: DigestHistoryItem[]
  total?: number
  isLoading: boolean
  error: unknown
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
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
        const parsed = parseDigestContent(d.content)
        const title = digestTitle(d)
        const themes = parsed?.key_themes?.filter(Boolean).slice(0, 3) ?? []

        return (
          <button
            key={d.id}
            onClick={() => props.onSelect(d)}
            className="border-line bg-surface hover:border-line-strong hover:shadow-card focus-visible:ring-ring w-full rounded-xl border p-3 text-left transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-ink line-clamp-1 text-[13px] font-medium">{title}</div>
                <div className="text-ink-subtle mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                  <span>{formatDateTime(d.created_at)}</span>
                  {themes.map((theme) => (
                    <span key={theme}>#{theme}</span>
                  ))}
                </div>
              </div>
              <ChevronRight className="text-ink-subtle size-4 shrink-0" aria-hidden />
            </div>
          </button>
        )
      })}

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-ink-subtle text-[11px]">
          Showing {props.digests.length}
          {props.total && props.total > props.digests.length ? ` of ${props.total}` : ''} digest
          {props.digests.length === 1 ? '' : 's'}
        </span>
        {props.hasMore && (
          <Button
            variant="ghost"
            size="xs"
            onClick={props.onLoadMore}
            loading={props.isLoadingMore}
          >
            Load more
          </Button>
        )}
      </div>
    </div>
  )
}

function AskHistoryList(props: {
  items: AskHistoryItem[]
  total?: number
  isLoading: boolean
  error: unknown
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
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
                {formatDateTime(d.created_at)}
              </div>
            </div>
            <ChevronRight className="text-ink-subtle size-4 shrink-0" aria-hidden />
          </div>
        </button>
      ))}

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-ink-subtle text-[11px]">
          Showing {props.items.length}
          {props.total && props.total > props.items.length ? ` of ${props.total}` : ''} question
          {props.items.length === 1 ? '' : 's'}
        </span>
        {props.hasMore && props.onLoadMore && (
          <Button
            variant="ghost"
            size="xs"
            onClick={props.onLoadMore}
            loading={props.isLoadingMore}
          >
            Load more
          </Button>
        )}
      </div>
    </div>
  )
}
