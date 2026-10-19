import { useState, useEffect } from 'react'
import { useTranscribeAudio } from '../hooks/useNotes'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import type { TranscriptionResponse } from '../lib/api'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'

interface AudioUploaderProps {
  recordButtonRef?: React.RefObject<HTMLButtonElement>
}

export default function AudioUploader({ recordButtonRef }: AudioUploaderProps) {
  const [lastResult, setLastResult] = useState<TranscriptionResponse | null>(null)

  // Use TanStack Query mutation
  const transcribeMutation = useTranscribeAudio()

  const {
    isRecording,
    recordingTime,
    error: recorderError,
    startRecording,
    stopRecording,
    clearError,
  } = useAudioRecorder((audioBlob) => transcribeMutation.mutate(audioBlob))

  // When transcription succeeds, notify the NotesPanel
  useEffect(() => {
    if (transcribeMutation.isSuccess && transcribeMutation.data) {
      setLastResult(transcribeMutation.data)
    }
  }, [transcribeMutation.isSuccess, transcribeMutation.data])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-4">
      {/* Record Audio */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Record Audio</label>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            {!isRecording ? (
              <Button
                ref={recordButtonRef}
                onClick={startRecording}
                disabled={transcribeMutation.isPending}
                className="bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                    clipRule="evenodd"
                  />
                </svg>
                Start Recording
              </Button>
            ) : (
              <Button variant="secondary" onClick={stopRecording}>
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                Stop Recording ({formatTime(recordingTime)})
              </Button>
            )}
          </div>
          {!isRecording && (
            <p className="text-xs text-gray-500">
              💡 Tip: Use <span className="font-semibold text-gray-700">Start Recording</span> to
              capture a note.
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
        <div className="flex items-center space-x-2 text-blue-600">
          <svg
            className="animate-spin h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <p className="font-medium">Transcribing audio...</p>
        </div>
      )}

      {transcribeMutation.isError && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {transcribeMutation.error instanceof Error
              ? transcribeMutation.error.message
              : 'Transcription failed'}
          </AlertDescription>
        </Alert>
      )}

      {lastResult && (
        <div className="rounded-xl bg-linear-to-br from-green-50 to-emerald-50 p-6 border-2 border-green-200 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <h2 className="text-lg font-semibold text-green-900">Transcript Ready!</h2>
          </div>
          <div className="bg-white rounded-lg p-4 border border-green-200 max-h-96 overflow-y-auto">
            <p className="whitespace-pre-wrap text-gray-800 text-base leading-relaxed">
              {lastResult.text}
            </p>
          </div>
          <p className="text-xs text-green-700 mt-3">✓ Saved and organized automatically</p>
        </div>
      )}
    </div>
  )
}
