import { useState, useRef, useEffect } from 'react'
import { useTranscribeAudio } from '../hooks/useNotes'
import type { TranscriptionResponse } from '../lib/api'

interface AudioUploaderProps {
  recordButtonRef?: React.RefObject<HTMLButtonElement>
}

export default function AudioUploader({ recordButtonRef }: AudioUploaderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [lastResult, setLastResult] = useState<TranscriptionResponse | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)

  // Use TanStack Query mutation
  const transcribeMutation = useTranscribeAudio()

  // When transcription succeeds, notify the NotesPanel
  useEffect(() => {
    if (transcribeMutation.isSuccess && transcribeMutation.data) {
      setLastResult(transcribeMutation.data)
    }
  }, [transcribeMutation.isSuccess, transcribeMutation.data])

  const transcribeAudio = async (audioBlob: Blob) => {
    transcribeMutation.mutate(audioBlob)
  }

  const getSupportedMimeType = (): string => {
    // List of MIME types to try, in order of preference
    // Prefer formats that OpenAI Whisper supports well
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/ogg;codecs=opus',
      'audio/wav',
    ]

    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        console.log(`Using MIME type: ${mimeType}`)
        return mimeType
      }
    }

    // Fallback to webm (most widely supported)
    console.warn('No supported MIME type found, using audio/webm')
    return 'audio/webm'
  }

  const startRecording = async () => {
    try {
      // Request microphone access with specific constraints for mobile
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      // Get the best supported MIME type
      const mimeType = getSupportedMimeType()

      // Create MediaRecorder with options
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {}
      const mediaRecorder = new MediaRecorder(stream, options)

      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const finalMimeType = mediaRecorder.mimeType || mimeType || 'audio/webm'
        const audioBlob = new Blob(chunksRef.current, { type: finalMimeType })
        console.log(`Recording stopped. Blob size: ${audioBlob.size}, type: ${audioBlob.type}`)

        // Validate blob before sending
        if (audioBlob.size === 0) {
          alert('Recording failed: No audio data captured. Please try again.')
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        if (audioBlob.size < 1000) {
          alert('Recording too short or corrupted. Please record for at least 1 second.')
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        transcribeAudio(audioBlob)
        stream.getTracks().forEach((track) => track.stop())
      }

      // Start recording with timeslice for better mobile support
      // Request data every 1 second to avoid memory issues on mobile
      mediaRecorder.start(1000)
      setIsRecording(true)
      setRecordingTime(0)

      // Start timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    } catch (error: unknown) {
      console.error('Recording error:', error)
      // Create a more descriptive error message
      let errorMessage = 'Failed to start recording'
      const errorObject = error instanceof Error ? error : null
      const errorName = errorObject?.name
      const errorDetails = errorObject?.message

      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        errorMessage =
          'Microphone permission denied. Please allow microphone access in your browser settings.'
      } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone and try again.'
      } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
        errorMessage = 'Microphone is already in use by another application.'
      } else if (errorName === 'NotSupportedError') {
        errorMessage =
          'Audio recording is not supported on this browser. Try using a different browser.'
      } else if (errorDetails) {
        errorMessage = `Recording error: ${errorDetails}`
      }

      // Set the error through the mutation
      transcribeMutation.reset()
      alert(errorMessage)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

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
              <button
                ref={recordButtonRef}
                onClick={startRecording}
                disabled={transcribeMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                    clipRule="evenodd"
                  />
                </svg>
                Start Recording
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 font-medium transition-colors"
              >
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                Stop Recording ({formatTime(recordingTime)})
              </button>
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
        <div className="rounded-lg bg-red-50 p-4 border border-red-200">
          <h3 className="text-sm font-semibold text-red-800">Error</h3>
          <p className="text-sm text-red-700 mt-1">
            {transcribeMutation.error instanceof Error
              ? transcribeMutation.error.message
              : 'Transcription failed'}
          </p>
        </div>
      )}

      {lastResult && (
        <div className="rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 p-6 border-2 border-green-200 shadow-sm">
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
