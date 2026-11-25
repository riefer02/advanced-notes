import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { type FeedbackType } from '../lib/api'
import { useSubmitFeedback } from '../hooks/useFeedback'
import { track } from '../lib/analytics'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Bug, CheckCircle2, Lightbulb, MessageCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DetailCard } from '@/components/ui/detail'
import { PageHeader } from '@/components/ui/page-header'

export const Route = createFileRoute('/feedback')({
  component: FeedbackPage,
})

function FeedbackPage() {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('general')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [rating, setRating] = useState<number | null>(null)

  const submitMutation = useSubmitFeedback()

  // Only show the success screen once the request has actually succeeded.
  const showSuccess = submitMutation.isSuccess

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      return
    }

    // Keep the form values until success so a failed submit loses nothing.
    submitMutation.mutate(
      {
        feedback_type: feedbackType,
        title: title.trim(),
        description: description.trim() || undefined,
        rating: rating ?? undefined,
      },
      {
        onSuccess: () => {
          track('feedback_submitted', {
            type: feedbackType,
            rating_present: rating !== null,
          })
        },
      }
    )
  }

  const handleNewFeedback = () => {
    setTitle('')
    setDescription('')
    setRating(null)
    setFeedbackType('general')
    submitMutation.reset()
  }

  if (showSuccess) {
    return (
      <div className="mx-auto max-w-lg px-5 py-16 text-center">
        <div className="bg-positive-soft text-positive mx-auto grid size-14 place-items-center rounded-full">
          <CheckCircle2 className="size-7" />
        </div>
        <h1 className="text-ink mt-4 text-[22px] leading-7 font-semibold tracking-[-0.02em]">
          Thanks for the feedback
        </h1>
        <p className="text-ink-muted mt-2 text-[13px] leading-5">
          It goes straight to the person building Chisos. Nothing you typed was lost.
        </p>
        <Button className="mt-6" size="sm" onClick={handleNewFeedback}>
          Send more feedback
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-8">
      <PageHeader
        title="Send feedback"
        description="Report a bug, request a feature, or just tell us how it feels to use Chisos."
      />

      <DetailCard className="mt-5 p-5">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Feedback Type */}
          <div>
            <span className="section-label mb-2 block">Feedback type</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { value: 'bug', label: 'Bug Report', icon: Bug },
                { value: 'feature', label: 'Feature Request', icon: Lightbulb },
                { value: 'general', label: 'General Feedback', icon: MessageCircle },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFeedbackType(option.value as FeedbackType)}
                  aria-pressed={feedbackType === option.value}
                  className={`focus-visible:ring-ring rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                    feedbackType === option.value
                      ? 'border-brand/40 bg-brand-soft text-brand'
                      : 'border-line bg-surface text-ink hover:border-line-strong'
                  }`}
                >
                  <option.icon className="mb-1.5 size-4" aria-hidden />
                  <span className="block text-[13px] font-medium">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="title" className="mb-2">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                feedbackType === 'bug'
                  ? 'Describe the issue briefly'
                  : feedbackType === 'feature'
                    ? 'What feature would you like?'
                    : 'What would you like to share?'
              }
              maxLength={255}
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description" className="mb-2">
              Description <span className="text-ink-subtle">(optional)</span>
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                feedbackType === 'bug'
                  ? 'Steps to reproduce, expected vs actual behavior, etc.'
                  : feedbackType === 'feature'
                    ? 'Describe the feature and how it would help you...'
                    : 'Share more details...'
              }
              rows={5}
              maxLength={5000}
              className="resize-none"
            />
            <p className="text-xs text-ink-subtle mt-1">{description.length}/5000 characters</p>
          </div>

          {/* Rating */}
          <div>
            <Label className="mb-2">
              How would you rate your experience?{' '}
              <span className="text-ink-subtle">(optional)</span>
            </Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(rating === value ? null : value)}
                  aria-label={`${value} star${value === 1 ? '' : 's'}`}
                  className={`focus-visible:ring-ring size-10 rounded-lg border text-xl transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                    rating === value
                      ? 'border-warning bg-warning-soft'
                      : rating && rating >= value
                        ? 'border-warning/25 bg-warning-soft/60'
                        : 'border-line bg-surface hover:border-line-strong'
                  }`}
                >
                  {rating && rating >= value ? '★' : '☆'}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {submitMutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {submitMutation.error instanceof Error
                  ? submitMutation.error.message
                  : 'Failed to submit feedback'}
              </AlertDescription>
            </Alert>
          )}

          {/* Submit */}
          <div className="border-line flex items-center justify-between gap-3 border-t pt-4">
            <p className="text-ink-subtle text-[11px]">Goes to the maintainer, not a black hole.</p>
            <Button
              type="submit"
              disabled={submitMutation.isPending || !title.trim()}
              loading={submitMutation.isPending}
              size="sm"
            >
              Submit feedback
            </Button>
          </div>
        </form>
      </DetailCard>
    </div>
  )
}
