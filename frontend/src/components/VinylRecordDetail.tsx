import { useState } from 'react'
import { Disc3, Pencil, Trash2 } from 'lucide-react'
import SlideOver from './ui/SlideOver'
import { useVinylRecord, useUpdateVinylRecord, useDeleteVinylRecord } from '../hooks/useVinyl'
import type { VinylRecord } from '../lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DataGrid, DataPoint, DetailSection, MetaBar, MetaItem } from '@/components/ui/detail'

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
    <SlideOver isOpen={isOpen} onClose={onClose} title="Record">
      {isLoading && <div className="text-ink-subtle p-2 text-sm">Loading…</div>}

      {record && !isEditing && (
        <div className="space-y-5">
          {/* Identity: cover is a thumbnail, not a hero image */}
          <div className="flex items-start gap-4">
            <div className="border-line bg-surface-muted grid size-24 shrink-0 place-items-center overflow-hidden rounded-lg border">
              {record.cover_image_url ? (
                <img
                  src={record.cover_image_url}
                  alt={`${record.album_title} cover`}
                  className="size-full object-cover"
                />
              ) : (
                <Disc3 className="text-line-strong size-8" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="text-ink text-[17px] leading-6 font-semibold tracking-[-0.02em] break-words">
                {record.album_title}
              </h2>
              <p className="text-ink-muted mt-0.5 text-[13px] leading-5">{record.artist}</p>
              <MetaBar className="mt-2">
                {record.release_year && <MetaItem>{record.release_year}</MetaItem>}
                {record.format && <MetaItem>{record.format}</MetaItem>}
                {record.condition && <MetaItem>{record.condition}</MetaItem>}
              </MetaBar>
              {record.genre.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {record.genre.map((g) => (
                    <span
                      key={g}
                      className="border-line bg-surface-muted text-ink-muted rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-[0.02em] uppercase"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {(record.label || record.catalog_number || record.pressing_country || record.color) && (
            <div className="border-line border-y py-3">
              <DataGrid className="sm:grid-cols-2">
                {record.label && <DataPoint label="Label" value={record.label} />}
                {record.catalog_number && (
                  <DataPoint label="Catalog" value={record.catalog_number} mono />
                )}
                {record.pressing_country && (
                  <DataPoint label="Pressing" value={record.pressing_country} />
                )}
                {record.color && <DataPoint label="Color" value={record.color} />}
              </DataGrid>
            </div>
          )}

          {record.tracks.length > 0 && (
            <DetailSection label={`Tracklist · ${record.tracks.length}`}>
              <div className="border-line overflow-hidden rounded-lg border">
                {record.tracks.map((track, index) => (
                  <div
                    key={track.id}
                    className={`hover:bg-surface-muted/60 flex items-baseline gap-3 px-3 py-1.5 transition-colors ${
                      index > 0 ? 'border-line border-t' : ''
                    }`}
                  >
                    <span className="text-ink-subtle w-7 shrink-0 font-mono text-[10px] tabular-nums">
                      {track.side ? `${track.side}${track.position ?? ''}` : (track.position ?? '')}
                    </span>
                    <span className="text-ink flex-1 truncate text-[13px] leading-5">
                      {track.title}
                    </span>
                    {track.duration && (
                      <span className="text-ink-subtle shrink-0 font-mono text-[10px] tabular-nums">
                        {track.duration}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          {record.notes && (
            <DetailSection label="Notes">
              <p className="text-ink-muted text-[13px] leading-6 whitespace-pre-wrap">
                {record.notes}
              </p>
            </DetailSection>
          )}

          {!isSharedView && (
            <div className="border-line flex items-center gap-2 border-t pt-4">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setIsEditing(true)}
              >
                <Pencil />
                Edit record
              </Button>
              {!confirmDelete ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/8 hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 />
                  Delete
                </Button>
              ) : (
                <div className="flex items-center gap-1">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? 'Deleting…' : 'Confirm'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Artist" value={artist} onChange={setArtist} required />
        <FormField label="Album" value={albumTitle} onChange={setAlbumTitle} required />
        <FormField label="Year" value={releaseYear} onChange={setReleaseYear} type="number" />
        <FormField label="Genre" value={genre} onChange={setGenre} placeholder="Rock, Soul" />
        <FormField label="Label" value={label} onChange={setLabel} />
        <FormField label="Catalog #" value={catalogNumber} onChange={setCatalogNumber} />
        <FormField label="Format" value={format} onChange={setFormat} placeholder='LP, 7", 12"' />
        <FormField label="Country" value={pressingCountry} onChange={setPressingCountry} />
        <FormField label="Color" value={color} onChange={setColor} />
        <FormField
          label="Condition"
          value={condition}
          onChange={setCondition}
          placeholder="Mint / VG+ / G"
        />
      </div>

      <div>
        <label className="text-ink-muted mb-1 block text-xs font-medium">Notes</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>

      <div className="border-line flex items-center justify-end gap-2 border-t pt-4">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving || !artist || !albumTitle}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
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
      <label className="text-ink-muted mb-1 block text-xs font-medium">{label}</label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
      />
    </div>
  )
}
