import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { CheckCircle2, CloudOff, Lightbulb, Loader2, Mic, Upload } from 'lucide-react'
import { useTranscribeAudio } from '../hooks/useNotes'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { useOfflineQueue } from '../hooks/useOfflineQueue'
import { audioFilename, isNetworkUnreachableError } from '../lib/offline-queue'
import type { TranscriptionResponse } from '../lib/api'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'

interface AudioUploaderProps {
  recordButtonRef?: React.RefObject<HTMLButtonElement>
  onNoteCreated?: (noteId: string) => void
}

export default function AudioUploader({ recordButtonRef, onNoteCreated }: AudioUploaderProps) {
  const { userId } = useAuth()
  const { isOnline, enqueueAudio, persistence } = useOfflineQueue(userId)
  const [lastResult, setLastResult] = useState<TranscriptionResponse | null>(null)
  const [lastBlob, setLastBlob] = useState<Blob | null>(null)
  const [lastFilename, setLastFilename] = useState<string | null>(null)
  const [lastBlobUrl, setLastBlobUrl] = useState<string | null>(null)
  const [offlineSaved, setOfflineSaved] = useState(false)
  const [queueError, setQueueError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Use TanStack Query mutation
  const transcribeMutation = useTranscribeAudio()

  const queueBlob = async (blob: Blob, filename: string) => {
    try {
      await enqueueAudio({
        blob,
        filename,
        mimeType: blob.type || 'audio/webm',
      })
      setOfflineSaved(true)
      setQueueError(null)
    } catch (error) {
      setQueueError(
        error instanceof Error ? error.message : 'Could not save this recording on this device.'
      )
    }
  }

  const transcribeOrQueue = (blob: Blob, filename: string) => {
    setLastResult(null)
    setOfflineSaved(false)
    setQueueError(null)

    if (!isOnline) {
      void queueBlob(blob, filename)
      return
    }

    transcribeMutation.mutate(blob, {
      onError: (error) => {
        // Only connection failures are safe to retain locally. Auth, quota,
        // and validation errors must stay visible instead of being retried.
        if (isNetworkUnreachableError(error)) {
          void queueBlob(blob, filename)
        }
      },
    })
  }

  const {
    isRecording,
    recordingTime,
    error: recorderError,
    startRecording,
    stopRecording,
    clearError,
  } = useAudioRecorder((audioBlob) => {
    // Keep the blob so a failed transcription can be retried without re-recording.
    setLastBlob(audioBlob)
    const filename = audioFilename(audioBlob.type)
    setLastFilename(filename)
    transcribeOrQueue(audioBlob, filename)
  })

  // When transcription succeeds, notify the NotesPanel
  useEffect(() => {
    if (transcribeMutation.isSuccess && transcribeMutation.data) {
      setLastResult(transcribeMutation.data)
      const noteId = transcribeMutation.data.categorization?.note_id
      if (noteId) onNoteCreated?.(noteId)
    }
  }, [transcribeMutation.isSuccess, transcribeMutation.data, onNoteCreated])

  // Manage the download URL lifecycle for the retained blob.
  useEffect(() => {
    if (!lastBlob) {
      setLastBlobUrl(null)
      return
    }
    const url = URL.createObjectURL(lastBlob)
    setLastBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [lastBlob])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Allow selecting the same file again after a failure.
    event.target.value = ''
    if (!file) return
    const filename = file.name || audioFilename(file.type)
    setLastBlob(file)
    setLastFilename(filename)
    transcribeOrQueue(file, filename)
  }

  const retryLastBlob = () => {
    if (!lastBlob) return
    transcribeOrQueue(lastBlob, lastFilename || audioFilename(lastBlob.type))
  }

  return (
    <div className="space-y-4">
      {/* Record or upload audio */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-ink">Record or upload audio</label>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            {!isRecording ? (
              <Button
                ref={recordButtonRef}
                onClick={startRecording}
                disabled={transcribeMutation.isPending}
                className="brand-gradient text-white hover:opacity-95"
              >
                <Mic className="size-5" aria-hidden />
                Start Recording
              </Button>
            ) : (
              <Button variant="secondary" onClick={stopRecording}>
                <div className="w-3 h-3 bg-destructive rounded-full animate-pulse"></div>
                Stop Recording ({formatTime(recordingTime)})
              </Button>
            )}

            {!isRecording && (
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={transcribeMutation.isPending}
              >
                <Upload className="size-4" aria-hidden />
                Upload audio
              </Button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFileSelected}
            />
          </div>
          {!isRecording && (
            <p className="text-ink-subtle flex items-start gap-1.5 text-xs">
              <Lightbulb className="text-ink-subtle mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                Record a thought, or upload an existing audio file (MP3, WAV, M4A, WebM).
                {!isOnline && ' Offline recordings are saved on this device.'}
              </span>
            </p>
          )}
        </div>
      </div>

      {recorderError && (
        <Alert variant="destructive">
          <AlertTitle>Recording Error</AlertTitle>
          <AlertDescription>
            <div className="flex items-center justify-between gap-3">
              <span>{recorderError}</span>
              <button type="button" onClick={clearError} className="text-sm underline">
                Dismiss
              </button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {transcribeMutation.isPending && (
        <div className="flex items-center space-x-2 text-brand" role="status">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          <p className="font-medium">Transcribing audio...</p>
        </div>
      )}

      {offlineSaved && (
        <Alert variant="success">
          <AlertTitle>Recording saved offline</AlertTitle>
          <AlertDescription>
            <p>
              It will be transcribed and added to your notes when you reconnect.
              {persistence === 'memory' &&
                " This browser can't persist it across reloads, so keep this tab open."}
            </p>
          </AlertDescription>
        </Alert>
      )}

      {queueError && (
        <Alert variant="destructive">
          <AlertTitle>Could not save recording</AlertTitle>
          <AlertDescription>{queueError}</AlertDescription>
        </Alert>
      )}

      {transcribeMutation.isError && (
        <Alert variant="destructive">
          <AlertTitle>Transcription failed</AlertTitle>
          <AlertDescription>
            <p>
              {transcribeMutation.error instanceof Error
                ? transcribeMutation.error.message
                : 'Transcription failed'}
            </p>
            {lastBlob && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button size="sm" variant="outline" onClick={retryLastBlob}>
                  Retry transcription
                </Button>
                {lastBlobUrl && (
                  <a
                    href={lastBlobUrl}
                    download={lastFilename || 'chisos-recording.webm'}
                    className="text-sm underline"
                  >
                    Download recording
                  </a>
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {lastResult && (
        <div className="rounded-xl bg-linear-to-br from-positive-soft to-positive-soft/50 p-6 border-2 border-positive/25 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="text-positive size-5" aria-hidden />
            <h2 className="text-lg font-semibold text-positive">Transcript ready!</h2>
          </div>

          {lastResult.categorization && (
            <div className="mb-3 space-y-1">
              <p className="font-medium text-positive">{lastResult.categorization.title}</p>
              <p className="text-xs text-positive">
                Filed in{' '}
                <span className="font-semibold">{lastResult.categorization.folder_path}</span>
                {lastResult.categorization.tags?.length > 0 && (
                  <> · {lastResult.categorization.tags.join(', ')}</>
                )}
              </p>
            </div>
          )}

          <div className="bg-surface rounded-lg p-4 border border-positive/25 max-h-96 overflow-y-auto">
            <p className="whitespace-pre-wrap text-ink text-base leading-relaxed">
              {lastResult.text}
            </p>
          </div>
          <p className="text-xs text-positive mt-3">
            ✓ Saved and organized automatically — it is already in your notes list.
          </p>
        </div>
      )}

      {!isOnline && !offlineSaved && (
        <p className="text-ink-subtle flex items-center gap-1.5 text-xs">
          <CloudOff className="size-3.5 shrink-0" aria-hidden />
          You're offline. Recordings are kept on this device and transcribed when you reconnect.
        </p>
      )}
    </div>
  )
}
