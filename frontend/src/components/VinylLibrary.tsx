import { useState, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { useVinylRecords, useVinylStats } from '../hooks/useVinyl'
import type { VinylRecord } from '../lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Vinyl Collection</h2>
          {stats && (
            <p className="text-sm text-gray-500 mt-0.5">
              {stats.total_records} records, {stats.total_artists} artists
            </p>
          )}
        </div>
        {!isSharedView && (
          <div className="flex items-center gap-2">
            <Link
              to="/friends"
              search={{ tab: 'shares' }}
              className="inline-flex items-center justify-center font-medium transition-colors focus:outline-hidden focus:ring-2 focus:ring-offset-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 focus:ring-blue-500 px-4 py-2 text-sm rounded-lg"
            >
              Share
            </Link>
            <Button onClick={onAddRecord}>
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Record
            </Button>
          </div>
        )}
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
        <Input
          type="text"
          placeholder="Search artist, album, label..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
              className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading && <div className="text-center py-12 text-gray-500">Loading collection...</div>}

      {/* Error */}
      {error && (
        <div className="text-center py-12 text-red-500">
          Failed to load collection: {error.message}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && records.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">{hasFilters ? '🔍' : '💿'}</div>
          <p className="text-gray-600 font-medium">
            {hasFilters ? 'No records match your filters' : 'No records yet'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
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
      className="text-left group rounded-lg overflow-hidden border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all bg-white"
    >
      {/* Cover image or placeholder */}
      <div className="aspect-square bg-linear-to-br from-gray-100 to-gray-200 flex items-center justify-center group-hover:from-blue-50 group-hover:to-blue-100 transition-colors overflow-hidden">
        {record.cover_image_url ? (
          <img
            src={record.cover_image_url}
            alt={`${record.album_title} cover`}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-3xl font-bold text-gray-400 group-hover:text-blue-400 transition-colors">
            {initials}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-medium text-gray-900 truncate">{record.album_title}</p>
        <p className="text-xs text-gray-500 truncate">{record.artist}</p>
        {record.release_year && (
          <p className="text-xs text-gray-400 mt-0.5">{record.release_year}</p>
        )}
      </div>
    </button>
  )
}
