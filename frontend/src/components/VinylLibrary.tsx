import { useState, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { Disc3, Plus, Search } from 'lucide-react'
import { useVinylRecords, useVinylStats } from '../hooks/useVinyl'
import type { VinylRecord } from '../lib/api'
import { pluralize } from '../lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface VinylLibraryProps {
  onSelectRecord: (recordId: string) => void
  onAddRecord: () => void
  owner?: string
}

const DECADE_OPTIONS = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]
const FORMAT_OPTIONS = ['LP', '7"', '10"', '12"', '2xLP']
const SORT_OPTIONS = [
  { value: 'created_at', label: 'Recently Added' },
  { value: 'artist', label: 'Artist A-Z' },
  { value: 'album_title', label: 'Album A-Z' },
  { value: 'release_year', label: 'Year' },
]

export default function VinylLibrary({ onSelectRecord, onAddRecord, owner }: VinylLibraryProps) {
  const isSharedView = !!owner
  const [search, setSearch] = useState('')
  const [genre, setGenre] = useState<string | undefined>()
  const [decade, setDecade] = useState<number | undefined>()
  const [format, setFormat] = useState<string | undefined>()
  const [sortBy, setSortBy] = useState('created_at')

  const params = useMemo(
    () => ({
      search: search || undefined,
      genre,
      decade,
      format,
      sort_by: sortBy,
      limit: 100,
      owner,
    }),
    [search, genre, decade, format, sortBy, owner]
  )

  const { data, isLoading, error } = useVinylRecords(params)
  const { data: stats } = useVinylStats(owner)

  const records = data?.records ?? []
  const hasFilters = search || genre || decade || format

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        title="Vinyl Collection"
        description={
          stats
            ? `${pluralize(stats.total_records, 'record')} · ${pluralize(stats.total_artists, 'artist')}`
            : 'Your records, catalogued.'
        }
        actions={
          !isSharedView && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link to="/friends" search={{ tab: 'shares', resource: 'vinyl_library' }}>
                  Share
                </Link>
              </Button>
              <Button size="sm" onClick={onAddRecord}>
                <Plus />
                Add record
              </Button>
            </>
          )
        }
      />

      {/* Search + Filters */}
      <div className="space-y-3">
        <Input
          type="text"
          placeholder="Search artist, album, label..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search vinyl collection"
        />

        <div className="flex flex-wrap gap-2">
          <Select
            value={genre ?? '__all__'}
            onValueChange={(v) => setGenre(v === '__all__' ? undefined : v)}
          >
            <SelectTrigger size="sm" className="text-xs">
              <SelectValue placeholder="All Genres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Genres</SelectItem>
              <SelectItem value="Rock">Rock</SelectItem>
              <SelectItem value="Jazz">Jazz</SelectItem>
              <SelectItem value="Soul">Soul</SelectItem>
              <SelectItem value="Electronic">Electronic</SelectItem>
              <SelectItem value="Hip Hop">Hip Hop</SelectItem>
              <SelectItem value="Classical">Classical</SelectItem>
              <SelectItem value="Country">Country</SelectItem>
              <SelectItem value="Blues">Blues</SelectItem>
              <SelectItem value="Folk">Folk</SelectItem>
              <SelectItem value="Punk">Punk</SelectItem>
              <SelectItem value="Metal">Metal</SelectItem>
              <SelectItem value="Pop">Pop</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={decade?.toString() ?? '__all__'}
            onValueChange={(v) => setDecade(v === '__all__' ? undefined : Number(v))}
          >
            <SelectTrigger size="sm" className="text-xs">
              <SelectValue placeholder="All Decades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Decades</SelectItem>
              {DECADE_OPTIONS.map((d) => (
                <SelectItem key={d} value={d.toString()}>
                  {d}s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={format ?? '__all__'}
            onValueChange={(v) => setFormat(v === '__all__' ? undefined : v)}
          >
            <SelectTrigger size="sm" className="text-xs">
              <SelectValue placeholder="All Formats" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Formats</SelectItem>
              {FORMAT_OPTIONS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v)}>
            <SelectTrigger size="sm" className="text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setGenre(undefined)
                setDecade(undefined)
                setFormat(undefined)
              }}
              className="text-ink-subtle hover:text-ink px-2 py-1.5 text-xs transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-ink-subtle py-12 text-center text-sm">Loading collection…</div>
      )}

      {/* Error */}
      {error && (
        <div className="text-destructive py-12 text-center text-sm">
          Failed to load collection: {error.message}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && records.length === 0 && (
        <div className="py-16 text-center">
          {hasFilters ? (
            <Search className="text-line-strong mx-auto mb-3 size-8" aria-hidden />
          ) : (
            <Disc3 className="text-line-strong mx-auto mb-3 size-8" aria-hidden />
          )}
          <p className="text-ink text-sm font-medium">
            {hasFilters ? 'No records match your filters' : 'No records yet'}
          </p>
          <p className="text-ink-subtle mt-1 text-[13px]">
            {hasFilters
              ? 'Try adjusting your search or filters'
              : 'Add your first vinyl record to get started'}
          </p>
          {!hasFilters && (
            <Button className="mt-4" onClick={onAddRecord}>
              Add Record
            </Button>
          )}
        </div>
      )}

      {/* Album Grid */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {records.map((record) => (
            <RecordCard key={record.id} record={record} onClick={() => onSelectRecord(record.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function RecordCard({ record, onClick }: { record: VinylRecord; onClick: () => void }) {
  const initials = record.artist
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <button
      type="button"
      onClick={onClick}
      className="group border-line bg-surface hover:border-line-strong hover:shadow-lift focus-visible:ring-ring overflow-hidden rounded-xl border text-left transition-[border-color,box-shadow,transform] duration-150 focus-visible:ring-2 focus-visible:outline-none hover:-translate-y-0.5"
    >
      {/* Cover image or placeholder */}
      <div className="bg-surface-sunken relative flex aspect-square items-center justify-center overflow-hidden">
        {record.cover_image_url ? (
          <img
            src={record.cover_image_url}
            alt={`${record.album_title} cover`}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <span className="text-line-strong text-2xl font-semibold tracking-tight">{initials}</span>
        )}
        {record.condition && (
          <span className="bg-surface/90 text-ink-muted absolute top-1.5 right-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm">
            {record.condition}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="px-2.5 py-2">
        <p className="text-ink truncate text-[13px] leading-5 font-medium tracking-[-0.01em]">
          {record.album_title}
        </p>
        <p className="text-ink-subtle mt-0.5 flex items-center gap-1.5 truncate text-[11px] leading-4">
          <span className="truncate">{record.artist}</span>
          {record.release_year && (
            <>
              <span aria-hidden className="bg-line-strong size-0.5 shrink-0 rounded-full" />
              <span className="tabular-nums">{record.release_year}</span>
            </>
          )}
        </p>
      </div>
    </button>
  )
}
