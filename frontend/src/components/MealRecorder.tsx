import { useState, useEffect } from 'react'
import { Cookie, Loader2, Mic, Moon, Sun, Sunrise, X } from 'lucide-react'
import { useTranscribeMeal } from '../hooks/useMeals'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import type { MealTranscriptionResponse, MealType } from '../lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

const MEAL_TYPE_ICONS: Record<MealType, typeof Sun> = {
  breakfast: Sunrise,
  lunch: Sun,
  dinner: Moon,
  snack: Cookie,
}

function todayIso(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`
}

function formatDateLabel(value: string): string {
  if (!value) return ''
  if (value === todayIso()) return 'Today'
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

interface MealRecorderProps {
  onMealCreated?: (mealId: string) => void
  calendarOwner?: string
}

export default function MealRecorder({ onMealCreated, calendarOwner }: MealRecorderProps) {
  const [lastResult, setLastResult] = useState<MealTranscriptionResponse | null>(null)
  const [mealDate, setMealDate] = useState(todayIso)

  const transcribeMutation = useTranscribeMeal(calendarOwner)

  const {
    isRecording,
    recordingTime,
    error: recorderError,
    startRecording,
    stopRecording,
    clearError,
  } = useAudioRecorder((audioBlob) => transcribeMutation.mutate({ audioBlob, mealDate }))

  useEffect(() => {
    if (transcribeMutation.isSuccess && transcribeMutation.data) {
      setLastResult(transcribeMutation.data)
      if (transcribeMutation.data.meal?.id) {
        onMealCreated?.(transcribeMutation.data.meal.id)
      }
    }
  }, [transcribeMutation.isSuccess, transcribeMutation.data, onMealCreated])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const clearResult = () => {
    setLastResult(null)
    transcribeMutation.reset()
  }

  const ResultIcon = lastResult?.meal ? MEAL_TYPE_ICONS[lastResult.meal.meal_type] : Sun

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Mic className="text-brand size-6" aria-hidden />
        <h2 className="text-ink text-lg font-semibold">Record meal</h2>
      </div>

      {/* Instructions */}
      <p className="text-ink-muted text-sm">
        Describe what you ate. Example: &quot;For breakfast I had two scrambled eggs with toast and
        orange juice&quot;
      </p>

      {/* Date intent */}
      <div className="space-y-1.5">
        <Label htmlFor="meal-recorder-date">Logging for</Label>
        <Input
          id="meal-recorder-date"
          type="date"
          value={mealDate}
          onChange={(event) => setMealDate(event.target.value)}
          disabled={isRecording || transcribeMutation.isPending}
          aria-required="true"
        />
        <p className="text-ink-subtle text-xs">
          {formatDateLabel(mealDate)} — the transcript can mention another day without changing
          this.
        </p>
      </div>

      {/* Recording Button */}
      <div className="flex flex-col gap-3">
        {!isRecording ? (
          <Button
            onClick={startRecording}
            disabled={transcribeMutation.isPending || !mealDate}
            size="lg"
            className="w-full"
          >
            <Mic />
            Start recording
          </Button>
        ) : (
          <Button onClick={stopRecording} size="lg" className="bg-ink hover:bg-ink w-full">
            <div className="bg-destructive mr-2 size-3 animate-pulse rounded-full" />
            Stop recording ({formatTime(recordingTime)})
          </Button>
        )}
      </div>

      {/* Recorder Error */}
      {recorderError && (
        <Alert variant="destructive">
          <AlertTitle>Recording error</AlertTitle>
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

      {/* Processing State */}
      {transcribeMutation.isPending && (
        <div className="text-positive bg-positive-soft flex items-center gap-2 rounded-lg p-4">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          <p className="font-medium">Analyzing your meal…</p>
        </div>
      )}

      {/* Error State */}
      {transcribeMutation.isError && (
        <Alert variant="destructive">
          <AlertTitle>Could not transcribe meal</AlertTitle>
          <AlertDescription>
            {transcribeMutation.error instanceof Error
              ? transcribeMutation.error.message
              : 'Meal recording failed'}
          </AlertDescription>
        </Alert>
      )}

      {/* Success Result */}
      {lastResult && lastResult.meal && (
        <div className="from-positive-soft to-positive-soft/50 border-positive/25 rounded-xl border-2 bg-linear-to-br p-4 shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ResultIcon className="text-positive size-5" aria-hidden />
              <h3 className="text-positive text-lg font-semibold">
                {MEAL_TYPE_LABELS[lastResult.meal.meal_type]} logged
              </h3>
            </div>
            <button
              onClick={clearResult}
              className="text-ink-subtle hover:text-ink-muted transition-colors"
              aria-label="Clear result"
            >
              <X className="size-5" />
            </button>
          </div>

          <p className="text-ink-subtle mb-2 text-xs">
            Logged for {formatDateLabel(lastResult.meal.meal_date)}
            {lastResult.meal.meal_time ? ` at ${lastResult.meal.meal_time}` : ''}
          </p>

          {/* Transcription */}
          <div className="bg-surface border-positive/25 mb-3 rounded-lg border p-3">
            <p className="text-ink text-sm italic">&quot;{lastResult.text}&quot;</p>
          </div>

          {/* Food Items */}
          {lastResult.meal.items.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-positive text-sm font-medium">Extracted items</h4>
              <div className="flex flex-wrap gap-2">
                {lastResult.meal.items.map((item) => (
                  <span
                    key={item.id}
                    className="bg-surface border-positive/25 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-sm"
                  >
                    <span className="text-ink">{item.name}</span>
                    {item.portion && (
                      <span className="text-ink-subtle text-xs">({item.portion})</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Confidence */}
          <div className="text-positive mt-3 flex items-center gap-2 text-xs">
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
