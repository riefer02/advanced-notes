import { useState } from 'react'

interface CategoryResultProps {
  noteId: string
  folderPath: string
  filename: string
  tags: string[]
  confidence: number
  reasoning: string
  onDismiss: () => void
}

export default function CategoryResult({
  folderPath,
  filename,
  tags,
  confidence,
  reasoning,
  onDismiss,
}: CategoryResultProps) {
  const [showReasoning, setShowReasoning] = useState(false)

  const confidenceColor =
    confidence >= 0.8
      ? 'text-green-700 bg-green-50 border-green-200'
      : confidence >= 0.6
      ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
      : 'text-orange-700 bg-orange-50 border-orange-200'

  return (
    <div
      className="rounded-lg border-2 border-green-200 bg-green-50 p-4 shadow-sm animate-fade-in"
      role="status"
      aria-live="polite"
      aria-label="Note successfully categorized"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-green-600"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-green-900">
              Note Saved Successfully
            </h3>
            <p className="text-xs text-green-700 mt-0.5">
              Automatically organized by AI
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-green-600 hover:text-green-800 transition-colors"
          aria-label="Dismiss notification"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Details */}
      <div className="mt-3 space-y-2">
        {/* Tags - EMPHASIZED (Primary organization) */}
        {tags.length > 0 && (
          <div className="bg-white rounded-lg p-3 border border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="h-4 w-4 text-green-600 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                />
              </svg>
              <span className="text-xs font-semibold text-green-900">Tags (Primary Organization)</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-300"
                >
                  🏷️ {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Folder Path - De-emphasized */}
        <div className="flex items-center gap-2 text-xs text-green-700">
          <svg
            className="h-3 w-3 text-green-600 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          <span>Folder: {folderPath}/</span>
        </div>

        {/* Filename */}
        <div className="flex items-center gap-2 text-xs text-green-700">
          <svg
            className="h-3 w-3 text-green-600 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <span>File: {filename}</span>
        </div>

        {/* Confidence Score */}
        <div className="flex items-center gap-2">
          <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold border ${confidenceColor}`}>
            <svg className="h-3 w-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            {Math.round(confidence * 100)}% confident
          </div>
        </div>

        {/* Reasoning (collapsible) */}
        <div>
          <button
            onClick={() => setShowReasoning(!showReasoning)}
            className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 font-medium transition-colors"
            aria-expanded={showReasoning}
          >
            <svg
              className={`h-3 w-3 transition-transform ${showReasoning ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            {showReasoning ? 'Hide' : 'Show'} AI reasoning
          </button>
          {showReasoning && (
            <p className="mt-2 text-xs text-green-800 bg-white rounded border border-green-200 p-2">
              {reasoning}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

