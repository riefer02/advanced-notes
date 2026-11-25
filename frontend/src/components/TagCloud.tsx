import { useMemo, useState } from 'react'
import { Check, Search, Tag, X } from 'lucide-react'
import { useTags } from '../hooks/useNotes'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface TagCloudProps {
  selectedTag: string | null
  onSelectTag: (tag: string | null) => void
}

/**
 * Compact tag filter: one button that opens a searchable dialog instead of
 * always rendering every tag as a horizontal wall.
 */
export default function TagCloud({ selectedTag, onSelectTag }: TagCloudProps) {
  const { data: tags, isLoading, error } = useTags()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')

  const sortedTags = useMemo(() => [...(tags ?? [])].sort((a, b) => a.localeCompare(b)), [tags])

  const visibleTags = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return sortedTags
    return sortedTags.filter((tag) => tag.toLowerCase().includes(needle))
  }, [sortedTags, query])

  const handleOpenChange = (next: boolean) => {
    setIsOpen(next)
    if (!next) setQuery('')
  }

  // No tags at all means there is nothing to filter by; don't add dead chrome.
  if (!isLoading && (error || sortedTags.length === 0)) {
    return null
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="max-sm:h-9"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-pressed={!!selectedTag}
        aria-label={
          selectedTag ? `Filter by tag: ${selectedTag}. Change tag filter.` : 'Filter notes by tag'
        }
      >
        <Tag aria-hidden />
        <span className="max-w-32 truncate">{selectedTag ? `#${selectedTag}` : 'All tags'}</span>
        <span className="text-ink-subtle text-2xs tabular-nums" aria-hidden>
          {isLoading ? '—' : sortedTags.length}
        </span>
      </Button>

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[17px] tracking-[-0.02em]">Filter by tag</DialogTitle>
            <DialogDescription className="text-ink-muted text-[13px] leading-5">
              Pick a tag to narrow the list. Selected:{' '}
              {selectedTag ? (
                <span className="text-ink font-medium">#{selectedTag}</span>
              ) : (
                'all notes'
              )}
              .
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <label htmlFor="tag-filter-search" className="sr-only">
              Search tags
            </label>
            <Search
              className="text-ink-subtle pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              id="tag-filter-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tags…"
              autoComplete="off"
              autoFocus
              className="pl-8"
            />
          </div>

          <div
            className="-mx-1 max-h-[45vh] min-h-24 overflow-y-auto px-1"
            role="group"
            aria-label="Tags"
          >
            {isLoading ? (
              <div className="space-y-1.5 p-1" role="status" aria-label="Loading tags">
                {[...Array(6)].map((_, index) => (
                  <div
                    key={index}
                    className="bg-surface-sunken h-8 animate-pulse rounded-md"
                    aria-hidden
                  />
                ))}
              </div>
            ) : visibleTags.length === 0 ? (
              <p className="text-ink-subtle px-2 py-6 text-center text-[13px]">
                No tags match “{query.trim()}”.
              </p>
            ) : (
              <div className="space-y-0.5">
                {visibleTags.map((tag) => {
                  const isSelected = tag === selectedTag
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        onSelectTag(tag)
                        handleOpenChange(false)
                      }}
                      aria-pressed={isSelected}
                      className={`flex min-h-9 w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none ${
                        isSelected
                          ? 'bg-brand-soft text-brand font-medium'
                          : 'text-ink hover:bg-surface-muted'
                      }`}
                    >
                      <span className="truncate">#{tag}</span>
                      {isSelected && <Check className="size-3.5 shrink-0" aria-hidden />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <span className="text-ink-subtle text-xs tabular-nums">
              {isLoading
                ? 'Loading tags…'
                : `${visibleTags.length} of ${sortedTags.length} ${sortedTags.length === 1 ? 'tag' : 'tags'}`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={!selectedTag}
                onClick={() => {
                  onSelectTag(null)
                  handleOpenChange(false)
                }}
              >
                <X aria-hidden />
                Clear
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
