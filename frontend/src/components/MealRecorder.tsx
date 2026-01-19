import { useState, useRef, useEffect } from 'react'
import { useTranscribeMeal } from '../hooks/useMeals'
import type { MealTranscriptionResponse, MealType } from '../lib/api'

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

const MEAL_TYPE_ICONS: Record<MealType, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍿',
}

interface MealRecorderProps {
  onMealCreated?: (mealId: string) => void
}

export default function MealRecorder({ onMealCreated }: MealRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [lastResult, setLastResult] = useState<MealTranscriptionResponse | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)

  const transcribeMutation = useTranscribeMeal()

  useEffect(() => {
    if (transcribeMutation.isSuccess && transcribeMutation.data) {
      setLastResult(transcribeMutation.data)
      if (transcribeMutation.data.meal?.id) {
        onMealCreated?.(transcribeMutation.data.meal.id)
      }
    }
  }, [transcribeMutation.isSuccess, transcribeMutation.data, onMealCreated])

  const transcribeAudio = async (audioBlob: Blob) => {
    transcribeMutation.mutate(audioBlob)
  }

  const getSupportedMimeType = (): string => {
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
        return mimeType
      }
    }

    return 'audio/webm'
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      const mimeType = getSupportedMimeType()
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

        if (audioBlob.size === 0) {
          alert('Recording failed: No audio data captured. Please try again.')
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        if (audioBlob.size < 1000) {
          alert('Recording too short. Please record for at least 1 second.')
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        transcribeAudio(audioBlob)
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start(1000)
      setIsRecording(true)
      setRecordingTime(0)

      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    } catch (error: unknown) {
      console.error('Recording error:', error)
      let errorMessage = 'Failed to start recording'
      const errorObject = error instanceof Error ? error : null
      const errorName = errorObject?.name

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
      }

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

  const clearResult = () => {
    setLastResult(null)
    transcribeMutation.reset()
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <svg
          className="w-6 h-6 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
        <h2 className="text-lg font-semibold text-gray-900">Record Meal</h2>
      </div>

      {/* Instructions */}
      <p className="text-sm text-gray-600">
        Describe what you ate. Example: &quot;For breakfast I had two scrambled eggs with toast and
        orange juice&quot;
      </p>

      {/* Recording Button */}
      <div className="flex flex-col gap-3">
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={transcribeMutation.isPending}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
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
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 font-medium transition-colors"
          >
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            Stop Recording ({formatTime(recordingTime)})
          </button>
        )}
      </div>

      {/* Processing State */}
      {transcribeMutation.isPending && (
        <div className="flex items-center space-x-2 text-green-600 bg-green-50 rounded-lg p-4">
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
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="font-medium">Analyzing your meal...</p>
        </div>
      )}

      {/* Error State */}
      {transcribeMutation.isError && (
        <div className="rounded-lg bg-red-50 p-4 border border-red-200">
          <h3 className="text-sm font-semibold text-red-800">Error</h3>
          <p className="text-sm text-red-700 mt-1">
            {transcribeMutation.error instanceof Error
              ? transcribeMutation.error.message
              : 'Meal recording failed'}
          </p>
        </div>
      )}

      {/* Success Result */}
      {lastResult && lastResult.meal && (
        <div className="rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 p-4 border-2 border-green-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">{MEAL_TYPE_ICONS[lastResult.meal.meal_type]}</span>
              <h3 className="text-lg font-semibold text-green-900">
                {MEAL_TYPE_LABELS[lastResult.meal.meal_type]} Logged!
              </h3>
            </div>
            <button
              onClick={clearResult}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Clear result"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Transcription */}
          <div className="bg-white rounded-lg p-3 border border-green-200 mb-3">
            <p className="text-sm text-gray-700 italic">&quot;{lastResult.text}&quot;</p>
          </div>

          {/* Food Items */}
          {lastResult.meal.items.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-green-800">Extracted Items:</h4>
              <div className="flex flex-wrap gap-2">
                {lastResult.meal.items.map((item) => (
                  <span
                    key={item.id}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-white rounded-full text-sm border border-green-200"
                  >
                    <span className="text-gray-800">{item.name}</span>
                    {item.portion && (
                      <span className="text-gray-500 text-xs">({item.portion})</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Confidence */}
          <div className="mt-3 flex items-center gap-2 text-xs text-green-700">
            <span>Confidence:</span>
            <span className="font-medium">
              {Math.round((lastResult.extraction.confidence || 0) * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
