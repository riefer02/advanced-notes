import { useTags } from '../hooks/useNotes'

interface TagCloudProps {
  selectedTag: string | null
  onSelectTag: (tag: string | null) => void
}

export default function TagCloud({ selectedTag, onSelectTag }: TagCloudProps) {
  const { data: tags, isLoading: loading, error } = useTags()

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-100">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">🏷️</span>
          <h3 className="text-lg font-semibold text-gray-900">Tags</h3>
        </div>
        <div className="text-sm text-gray-500">Loading tags...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-lg p-6 border border-red-100">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">🏷️</span>
          <h3 className="text-lg font-semibold text-gray-900">Tags</h3>
        </div>
        <div className="text-sm text-red-600">
          {error instanceof Error ? error.message : 'Failed to load tags'}
        </div>
      </div>
    )
  }

  if (!tags || tags.length === 0) {
    return (
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-100">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">🏷️</span>
          <h3 className="text-lg font-semibold text-gray-900">Tags</h3>
        </div>
        <p className="text-sm text-gray-600">
          No tags yet. Record your first note to get started!
        </p>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏷️</span>
          <h3 className="text-lg font-semibold text-gray-900">Tags</h3>
          <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded-full">
            {tags?.length || 0}
          </span>
        </div>
        {selectedTag && (
          <button
            onClick={() => onSelectTag(null)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            Clear filter
          </button>
        )}
      </div>
      
      <div className="flex flex-wrap gap-2">
        {tags?.map((tag) => {
          const isSelected = tag === selectedTag
          return (
            <button
              key={tag}
              onClick={() => onSelectTag(isSelected ? null : tag)}
              className={`
                px-3 py-1.5 rounded-full text-sm font-medium
                transition-all duration-150 ease-in-out
                ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-md scale-105'
                    : 'bg-white text-gray-700 hover:bg-blue-100 hover:text-blue-700 border border-gray-200'
                }
              `}
            >
              {tag}
            </button>
          )
        })}
      </div>
      
      <p className="text-xs text-gray-500 mt-4">
        💡 Click a tag to filter notes
      </p>
    </div>
  )
}

