import { useState, useMemo } from 'react'
import { useVinylRecords, useVinylStats } from '../hooks/useVinyl'
import type { VinylRecord } from '../lib/api'

interface VinylLibraryProps {
  onSelectRecord: (recordId: string) => void
  onAddRecord: () => void
}

const DECADE_OPTIONS = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]
const FORMAT_OPTIONS = ['LP', '7"', '10"', '12"', '2xLP']
const SORT_OPTIONS = [
  { value: 'created_at', label: 'Recently Added' },
  { value: 'artist', label: 'Artist A-Z' },
  { value: 'album_title', label: 'Album A-Z' },
  { value: 'release_year', label: 'Year' },
]

export default function VinylLibrary({ onSelectRecord, onAddRecord }: VinylLibraryProps) {
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
    }),
    [search, genre, decade, format, sortBy]
  )

  const { data, isLoading, error } = useVinylRecords(params)
  const { data: stats } = useVinylStats()

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
        <button
          type="button"
          onClick={onAddRecord}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Record
        </button>
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Search artist, album, label..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />

        <div className="flex flex-wrap gap-2">
          <select
            value={genre ?? ''}
            onChange={(e) => setGenre(e.target.value || undefined)}
            className="px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
          >
            <option value="">All Genres</option>
            <option value="Rock">Rock</option>
            <option value="Jazz">Jazz</option>
            <option value="Soul">Soul</option>
            <option value="Electronic">Electronic</option>
            <option value="Hip Hop">Hip Hop</option>
            <option value="Classical">Classical</option>
            <option value="Country">Country</option>
            <option value="Blues">Blues</option>
            <option value="Folk">Folk</option>
            <option value="Punk">Punk</option>
            <option value="Metal">Metal</option>
            <option value="Pop">Pop</option>
          </select>

          <select
            value={decade ?? ''}
            onChange={(e) => setDecade(e.target.value ? Number(e.target.value) : undefined)}
            className="px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
          >
            <option value="">All Decades</option>
            {DECADE_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}s
              </option>
            ))}
          </select>

          <select
            value={format ?? ''}
            onChange={(e) => setFormat(e.target.value || undefined)}
            className="px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
          >
            <option value="">All Formats</option>
            {FORMAT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

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
            <button
              type="button"
              onClick={onAddRecord}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Add Record
            </button>
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
      className="text-left group rounded-lg overflow-hidden border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all bg-white"
    >
      {/* Cover image or placeholder */}
      <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center group-hover:from-indigo-50 group-hover:to-indigo-100 transition-colors overflow-hidden">
        {record.cover_image_url ? (
          <img
            src={record.cover_image_url}
            alt={`${record.album_title} cover`}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-3xl font-bold text-gray-400 group-hover:text-indigo-400 transition-colors">
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
