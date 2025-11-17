import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onClear: () => void
}

const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(({ value, onChange, onClear }, ref) => {
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Expose the input ref to parent
  useImperativeHandle(ref, () => inputRef.current!)

  // Clear search on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && value) {
        onClear()
        inputRef.current?.blur()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [value, onClear])

  return (
    <div className="relative" role="search">
      <label htmlFor="note-search" className="sr-only">
        Search notes
      </label>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <svg
            className={`h-5 w-5 transition-colors ${value ? 'text-blue-600' : 'text-gray-400'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          ref={inputRef}
          id="note-search"
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search notes... (press / to focus)"
          className={`block w-full rounded-lg border bg-white py-2.5 pl-10 pr-10 text-sm placeholder-gray-500 transition-colors focus:outline-none focus:ring-2 ${
            value
              ? 'border-blue-300 focus:border-blue-500 focus:ring-blue-200'
              : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
          }`}
          aria-label="Search notes by content, title, or tags"
        />
        {value && (
          <button
            onClick={onClear}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-red-600 transition-colors"
            aria-label="Clear search"
            title="Clear search (or press Esc)"
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
        )}
      </div>
      {value && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-blue-600">
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <span>Searching across all notes</span>
          </div>
          <span className="text-gray-300">•</span>
          <p className="text-xs text-gray-500">
            Press <kbd className="px-1.5 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded">Esc</kbd> to clear
          </p>
        </div>
      )}
    </div>
  )
})

SearchBar.displayName = 'SearchBar'

export default SearchBar

