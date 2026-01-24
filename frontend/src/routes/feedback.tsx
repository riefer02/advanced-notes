import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { submitFeedback, type FeedbackType } from '../lib/api'

export const Route = createFileRoute('/feedback')({
  component: FeedbackPage,
})

function FeedbackPage() {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('general')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await submitFeedback({
        feedback_type: feedbackType,
        title: title.trim(),
        description: description.trim() || undefined,
        rating: rating ?? undefined,
      })
      setSuccess(true)
      setTitle('')
      setDescription('')
      setRating(null)
      setFeedbackType('general')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleNewFeedback = () => {
    setSuccess(false)
    setError(null)
  }

  if (success) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-green-900 mb-2">
            Thank you for your feedback!
          </h2>
          <p className="text-green-700 mb-6">
            We appreciate you taking the time to help us improve Chisos.
          </p>
          <button
            onClick={handleNewFeedback}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Submit More Feedback
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Send Feedback</h1>
        <p className="text-gray-600 mt-2">
          Help us improve Chisos by reporting bugs, suggesting features, or sharing your thoughts.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Feedback Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Feedback Type</label>
          <div className="flex gap-3">
            {[
              { value: 'bug', label: 'Bug Report', icon: '🐛' },
              { value: 'feature', label: 'Feature Request', icon: '💡' },
              { value: 'general', label: 'General Feedback', icon: '💬' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFeedbackType(option.value as FeedbackType)}
                className={`flex-1 px-4 py-3 rounded-lg border-2 transition-colors ${
                  feedbackType === option.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="block text-xl mb-1">{option.icon}</span>
                <span className="block text-sm font-medium">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
            Title <span className="text-red-500">*</span>
          </label>
          <input
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
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
            Description <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
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
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
          <p className="text-xs text-gray-500 mt-1">{description.length}/5000 characters</p>
        </div>

        {/* Rating */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            How would you rate your experience? <span className="text-gray-400">(optional)</span>
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(rating === value ? null : value)}
                className={`w-12 h-12 rounded-lg border-2 text-2xl transition-all ${
                  rating === value
                    ? 'border-yellow-400 bg-yellow-50'
                    : rating && rating >= value
                      ? 'border-yellow-200 bg-yellow-25'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                {rating && rating >= value ? '★' : '☆'}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting || !title.trim()}
          className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
        </button>
      </form>
    </div>
  )
}
