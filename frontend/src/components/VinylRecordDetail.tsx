import { useState } from 'react'
import SlideOver from './ui/SlideOver'
import { useVinylRecord, useUpdateVinylRecord, useDeleteVinylRecord } from '../hooks/useVinyl'
import type { VinylRecord } from '../lib/api'

interface VinylRecordDetailProps {
  isOpen: boolean
  onClose: () => void
  recordId: string | null
  onDeleted?: () => void
  owner?: string
}

export default function VinylRecordDetail({
  isOpen,
  onClose,
  recordId,
  onDeleted,
  owner,
}: VinylRecordDetailProps) {
  const isSharedView = !!owner
  const { data: record, isLoading } = useVinylRecord(recordId, owner)
  const updateMutation = useUpdateVinylRecord()
  const deleteMutation = useDeleteVinylRecord()
  const [isEditing, setIsEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleDelete = async () => {
    if (!recordId) return
    await deleteMutation.mutateAsync(recordId)
    setConfirmDelete(false)
    onDeleted?.()
    onClose()
  }

  return (
    <SlideOver isOpen={isOpen} onClose={onClose} title="Record Details">
      {isLoading && <div className="p-4 text-gray-500">Loading...</div>}

      {record && !isEditing && (
        <div className="p-4 space-y-6">
          {/* Cover image */}
          {record.cover_image_url && (
            <div className="rounded-lg overflow-hidden bg-gray-100">
              <img
                src={record.cover_image_url}
                alt={`${record.album_title} cover`}
                className="w-full object-cover"
              />
            </div>
          )}

          {/* Header */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{record.album_title}</h3>
            <p className="text-gray-600">{record.artist}</p>
            {record.release_year && (
              <p className="text-sm text-gray-400 mt-0.5">{record.release_year}</p>
            )}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {record.label && <MetaField label="Label" value={record.label} />}
            {record.catalog_number && <MetaField label="Catalog #" value={record.catalog_number} />}
            {record.format && <MetaField label="Format" value={record.format} />}
            {record.pressing_country && (
              <MetaField label="Country" value={record.pressing_country} />
            )}
            {record.color && <MetaField label="Color" value={record.color} />}
            {record.condition && <MetaField label="Condition" value={record.condition} />}
          </div>

          {/* Genre tags */}
          {record.genre.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Genre</p>
              <div className="flex flex-wrap gap-1.5">
                {record.genre.map((g) => (
                  <span
                    key={g}
                    className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tracklist */}
          {record.tracks.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Tracklist</p>
              <div className="space-y-1">
                {record.tracks.map((track) => (
                  <div key={track.id} className="flex items-baseline gap-2 text-sm">
                    <span className="text-gray-400 text-xs w-8 shrink-0">
                      {track.side && `${track.side}${track.position ?? ''}`}
                    </span>
                    <span className="text-gray-900 flex-1">{track.title}</span>
                    {track.duration && (
                      <span className="text-gray-400 text-xs">{track.duration}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {record.notes && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.notes}</p>
            </div>
          )}

          {/* Actions */}
          {!isSharedView && (
            <div className="flex gap-2 pt-4 border-t">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="flex-1 px-3 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                Edit
              </button>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              ) : (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? 'Deleting...' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-2 text-sm text-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {record && isEditing && (
        <EditRecordForm
          record={record}
          onSave={async (data) => {
            await updateMutation.mutateAsync({ recordId: record.id, data })
            setIsEditing(false)
          }}
          onCancel={() => setIsEditing(false)}
          isSaving={updateMutation.isPending}
        />
      )}
    </SlideOver>
  )
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-gray-900">{value}</p>
    </div>
  )
}

function EditRecordForm({
  record,
  onSave,
  onCancel,
  isSaving,
}: {
  record: VinylRecord
  onSave: (data: Record<string, unknown>) => Promise<void>
  onCancel: () => void
  isSaving: boolean
}) {
  const [artist, setArtist] = useState(record.artist)
  const [albumTitle, setAlbumTitle] = useState(record.album_title)
  const [releaseYear, setReleaseYear] = useState(record.release_year?.toString() ?? '')
  const [genre, setGenre] = useState(record.genre.join(', '))
  const [label, setLabel] = useState(record.label ?? '')
  const [catalogNumber, setCatalogNumber] = useState(record.catalog_number ?? '')
  const [format, setFormat] = useState(record.format ?? '')
  const [pressingCountry, setPressingCountry] = useState(record.pressing_country ?? '')
  const [color, setColor] = useState(record.color ?? '')
  const [condition, setCondition] = useState(record.condition ?? '')
  const [notes, setNotes] = useState(record.notes ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      artist,
      album_title: albumTitle,
      release_year: releaseYear ? Number(releaseYear) : undefined,
      genre: genre
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean),
      label: label || undefined,
      catalog_number: catalogNumber || undefined,
      format: format || undefined,
      pressing_country: pressingCountry || undefined,
      color: color || undefined,
      condition: condition || undefined,
      notes: notes || undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-4">
      <FormField label="Artist" value={artist} onChange={setArtist} required />
      <FormField label="Album Title" value={albumTitle} onChange={setAlbumTitle} required />
      <FormField label="Year" value={releaseYear} onChange={setReleaseYear} type="number" />
      <FormField label="Genre (comma-separated)" value={genre} onChange={setGenre} />
      <FormField label="Label" value={label} onChange={setLabel} />
      <FormField label="Catalog #" value={catalogNumber} onChange={setCatalogNumber} />
      <FormField label="Format" value={format} onChange={setFormat} placeholder='LP, 7", 12"' />
      <FormField label="Country" value={pressingCountry} onChange={setPressingCountry} />
      <FormField label="Color" value={color} onChange={setColor} />
      <FormField
        label="Condition"
        value={condition}
        onChange={setCondition}
        placeholder="Mint/VG+/VG/G+/G/Fair/Poor"
      />

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div className="flex gap-2 pt-4 border-t">
        <button
          type="submit"
          disabled={isSaving || !artist || !albumTitle}
          className="flex-1 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function FormField({
  label,
  value,
  onChange,
  required,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      />
    </div>
  )
}
