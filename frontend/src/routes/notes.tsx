import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import AudioUploader from '../components/AudioUploader'
import NoteComposer from '../components/NoteComposer'
import NotesPanel from '../components/NotesPanel'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type CaptureMode = 'record' | 'write'

export const Route = createFileRoute('/notes')({
  validateSearch: (
    search: Record<string, unknown>
  ): { compose?: boolean; note?: string; q?: string } => {
    const params: { compose?: boolean; note?: string; q?: string } = {}
    if (search.compose === '1' || search.compose === true || search.compose === 'true') {
      params.compose = true
    }
    if (typeof search.note === 'string' && search.note) {
      params.note = search.note
    }
    // Handoff from global search: /notes?q=prayer
    if (typeof search.q === 'string' && search.q.trim()) {
      params.q = search.q.trim()
    }
    return params
  },
  component: NotesPage,
})

function NotesPage() {
  const recordButtonRef = useRef<HTMLButtonElement>(null)
  const { compose, note, q } = Route.useSearch()
  const [activeTab, setActiveTab] = useState<'capture' | 'notes'>(note || q ? 'notes' : 'capture')
  const [captureMode, setCaptureMode] = useState<CaptureMode>(compose ? 'write' : 'record')
  const [focusNoteId, setFocusNoteId] = useState<string | null>(note ?? null)

  // Deep links: /notes?compose=1 opens the writer, /notes?note=<id> opens a note.
  useEffect(() => {
    if (compose) setCaptureMode('write')
  }, [compose])

  useEffect(() => {
    if (note) {
      setFocusNoteId(note)
      setActiveTab('notes')
    }
  }, [note])

  // /notes?q=prayer lands on the notes pane with the query already applied.
  useEffect(() => {
    if (q) setActiveTab('notes')
  }, [q])

  const handleCreated = useCallback((noteId: string) => {
    setFocusNoteId(noteId)
    setActiveTab('notes')
  }, [])

  const handleStartCapture = useCallback((mode: CaptureMode) => {
    setActiveTab('capture')
    setCaptureMode(mode)
    if (mode === 'record') {
      window.requestAnimationFrame(() => recordButtonRef.current?.focus())
    }
  }, [])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <h1 className="sr-only">Notes</h1>
      {/* Mobile Tabs - Visible only on mobile */}
      <div className="border-line bg-surface shrink-0 border-b lg:hidden">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'capture' | 'notes')}>
          <TabsList variant="line" className="w-full">
            <TabsTrigger value="capture" className="flex-1">
              Capture
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-1">
              Notes
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Desktop Split-Pane Layout */}
      <div className="flex-1 lg:flex overflow-hidden">
        {/* Left Pane: Capture (40%) */}
        <div
          className={`bg-surface lg:bg-background overflow-y-auto lg:w-[40%] lg:border-r lg:border-line ${
            activeTab === 'capture' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="mx-auto max-w-2xl p-4 lg:p-6">
            <Tabs
              value={captureMode}
              onValueChange={(value) => setCaptureMode(value as CaptureMode)}
              className="mb-4"
            >
              <TabsList className="w-full">
                <TabsTrigger value="record" className="flex-1">
                  Record / Upload
                </TabsTrigger>
                <TabsTrigger value="write" className="flex-1">
                  Write
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {captureMode === 'record' ? (
              <AudioUploader recordButtonRef={recordButtonRef} onNoteCreated={handleCreated} />
            ) : (
              <NoteComposer onCreated={(created) => handleCreated(created.id)} />
            )}
          </div>
        </div>

        {/* Right Pane: Notes Panel (60%) */}
        <div
          className={`lg:w-[60%] overflow-hidden ${
            activeTab === 'notes' ? 'block' : 'hidden lg:block'
          }`}
        >
          <NotesPanel
            focusNoteId={focusNoteId}
            onFocusHandled={() => setFocusNoteId(null)}
            initialQuery={q}
            onStartCapture={handleStartCapture}
          />
        </div>
      </div>
    </div>
  )
}
