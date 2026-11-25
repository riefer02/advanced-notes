import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { Search, X } from 'lucide-react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onClear: () => void
}

const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  ({ value, onChange, onClear }, ref) => {
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
      <div className="relative min-w-0" role="search">
        <label htmlFor="note-search" className="sr-only">
          Search notes
        </label>
        <div className="relative">
          <Search
            className={`pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 transition-colors ${
              value ? 'text-brand' : 'text-ink-subtle'
            }`}
            aria-hidden
          />
          <input
            ref={inputRef}
            id="note-search"
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Search notes… (press / to focus)"
            className={`block h-9 w-full rounded-lg border bg-surface pr-9 pl-8 text-sm placeholder:text-ink-subtle transition-colors focus:outline-hidden focus:ring-2 ${
              value
                ? 'border-brand/30 focus:border-brand focus:ring-ring/40'
                : 'border-line-strong focus:border-brand focus:ring-ring/40'
            }`}
            aria-label="Search notes by content, title, or tags"
          />
          {value && (
            <button
              type="button"
              onClick={onClear}
              className="text-ink-subtle hover:text-destructive focus-visible:ring-ring absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
              aria-label="Clear search"
              title="Clear search (or press Esc)"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    )
  }
)

SearchBar.displayName = 'SearchBar'

export default SearchBar
