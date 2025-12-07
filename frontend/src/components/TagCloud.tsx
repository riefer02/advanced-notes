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
    return (
      <div className="h-12 bg-gray-50 rounded-lg animate-pulse"></div>
    )
  }

  if (error || !tags || tags.length === 0) {
    return null
  }

  return (
    <div className="relative group">
      <div 
        className={`flex items-center gap-2 ${
          isExpanded 
            ? 'flex-wrap p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg border border-blue-100' 
            : 'overflow-x-auto pb-2 scrollbar-hide'
        }`}
      >
        <div className="flex items-center gap-2 mr-2 flex-shrink-0">
          <span className="text-lg">🏷️</span>
          {isExpanded && <span className="font-semibold text-gray-900">Tags</span>}
        </div>

        {tags.map((tag) => {
          const isSelected = tag === selectedTag
          return (
            <button
              key={tag}
              onClick={() => onSelectTag(isSelected ? null : tag)}
              className={`
                flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium
                transition-all duration-150 ease-in-out whitespace-nowrap
                ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-700 border border-gray-200'
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
            flex-shrink-0 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors
            ${!isExpanded && 'sticky right-0 bg-gradient-to-l from-white pl-4'}
          `}
          title={isExpanded ? "Show less" : "Show all tags"}
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
        <div className="absolute right-8 top-0 bottom-2 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none" />
      )}
    </div>
  )
}
