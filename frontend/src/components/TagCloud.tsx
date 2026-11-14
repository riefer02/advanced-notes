import { useState } from 'react'
import { useTags } from '../hooks/useNotes'

interface TagCloudProps {
  selectedTag: string | null
  onSelectTag: (tag: string | null) => void
}

export default function TagCloud({ selectedTag, onSelectTag }: TagCloudProps) {
  const { data: tags, isLoading: loading, error } = useTags()
  const [isExpanded, setIsExpanded] = useState(false)

  if (loading) {
    return <div className="h-12 bg-surface-muted rounded-lg animate-pulse"></div>
  }

  if (error || !tags || tags.length === 0) {
    return null
  }

  return (
    <div className="relative group">
      <div
        className={`flex items-center gap-2 ${
          isExpanded
            ? 'border-brand/15 from-brand-soft/70 to-domain-vinyl/10 flex-wrap rounded-xl border bg-linear-to-br p-3'
            : 'overflow-x-auto pb-2 scrollbar-hide'
        }`}
      >
        <div className="flex items-center gap-2 mr-2 shrink-0">
          <span className="text-lg">🏷️</span>
          {isExpanded && <span className="font-semibold text-ink">Tags</span>}
        </div>

        {tags.map((tag) => {
          const isSelected = tag === selectedTag
          return (
            <button
              key={tag}
              onClick={() => onSelectTag(isSelected ? null : tag)}
              className={`
                shrink-0 px-3 py-1 rounded-full text-xs font-medium
                transition-all duration-150 ease-in-out whitespace-nowrap
                ${
                  isSelected
                    ? 'bg-brand text-brand-foreground shadow-xs'
                    : 'bg-surface text-ink hover:bg-brand-soft hover:text-brand border border-line'
                }
              `}
            >
              {tag}
            </button>
          )
        })}

        {/* Toggle Expand Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`
            shrink-0 p-1 rounded-full text-ink-subtle hover:text-ink-muted hover:bg-surface-muted transition-colors
            ${!isExpanded && 'sticky right-0 bg-linear-to-l from-surface pl-4'}
          `}
          title={isExpanded ? 'Show less' : 'Show all tags'}
        >
          <svg
            className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Scroll indicator hint for collapsed view */}
      {!isExpanded && (
        <div className="from-surface absolute right-8 top-0 bottom-2 w-8 bg-linear-to-l to-transparent pointer-events-none" />
      )}
    </div>
  )
}
