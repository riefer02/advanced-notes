import { useState } from 'react'
import SlideOver from './ui/SlideOver'
import VinylImageUploader, { type ImageFile } from './VinylImageUploader'
import {
  useCreateVinylRecord,
  useExtractVinylFromPhotos,
  useUpdateVinylRecord,
} from '../hooks/useVinyl'
import { uploadVinylImage, type VinylExtractionResult } from '../lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface VinylAddFormProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: (recordId: string) => void
}

export default function VinylAddForm({ isOpen, onClose, onCreated }: VinylAddFormProps) {
  const createMutation = useCreateVinylRecord()
  const updateMutation = useUpdateVinylRecord()
  const extractMutation = useExtractVinylFromPhotos()
  const [uploadProgress, setUploadProgress] = useState('')

  const [images, setImages] = useState<ImageFile[]>([])
  const [extraction, setExtraction] = useState<VinylExtractionResult | null>(null)

  const [artist, setArtist] = useState('')
  const [albumTitle, setAlbumTitle] = useState('')
  const [releaseYear, setReleaseYear] = useState('')
  const [genre, setGenre] = useState('')
  const [label, setLabel] = useState('')
  const [catalogNumber, setCatalogNumber] = useState('')
  const [format, setFormat] = useState('')
  const [pressingCountry, setPressingCountry] = useState('')
  const [color, setColor] = useState('')
  const [condition, setCondition] = useState('')
  const [notes, setNotes] = useState('')

  const resetForm = () => {
    images.forEach((img) => URL.revokeObjectURL(img.preview))
    setImages([])
    setExtraction(null)
    setUploadProgress('')
    setArtist('')
    setAlbumTitle('')
    setReleaseYear('')
    setGenre('')
    setLabel('')
    setCatalogNumber('')
    setFormat('')
    setPressingCountry('')
    setColor('')
    setCondition('')
    setNotes('')
  }

  const handleExtract = async () => {
    if (images.length === 0) return
    const result = await extractMutation.mutateAsync(images.map((img) => img.file))
    setExtraction(result)

    // Pre-fill form with extracted data
    setArtist(result.artist)
    setAlbumTitle(result.album_title)
    if (result.release_year) setReleaseYear(result.release_year.toString())
    if (result.genre.length > 0) setGenre(result.genre.join(', '))
    if (result.label) setLabel(result.label)
    if (result.catalog_number) setCatalogNumber(result.catalog_number)
    if (result.format) setFormat(result.format)
    if (result.pressing_country) setPressingCountry(result.pressing_country)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 1. Create the record
    const record = await createMutation.mutateAsync({
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

    // 2. Upload images via backend (which stores them in S3)
    let coverImageId: string | null = null
    if (images.length > 0) {
      try {
        for (let i = 0; i < images.length; i++) {
          const img = images[i]
          setUploadProgress(`Uploading photo ${i + 1}/${images.length}...`)

          const imageType = i === 0 ? 'front_cover' : 'other'
          const { image: dbImage } = await uploadVinylImage(record.id, img.file, imageType)

          if (i === 0) coverImageId = dbImage.id
        }

        // 3. Set cover image on the record
        if (coverImageId) {
          setUploadProgress('Setting cover image...')
          await updateMutation.mutateAsync({
            recordId: record.id,
            data: { cover_image_id: coverImageId },
          })
        }
      } catch {
        // Images failed but record was created -- that's OK
        console.warn('Image upload failed, record saved without images')
      }
    }

    setUploadProgress('')
    resetForm()
    onCreated?.(record.id)
    onClose()
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <SlideOver isOpen={isOpen} onClose={handleClose} title="Add Vinyl Record">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {createMutation.isError && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {createMutation.error.message}
          </div>
        )}

        {/* Photo upload section */}
        <div className="space-y-2">
          <VinylImageUploader
            images={images}
            onImagesChange={setImages}
            disabled={extractMutation.isPending}
          />

          {images.length > 0 && !extraction && (
            <Button
              type="button"
              onClick={handleExtract}
              loading={extractMutation.isPending}
              className="w-full"
            >
              {extractMutation.isPending ? 'Extracting info...' : 'Extract Info from Photos'}
            </Button>
          )}

          {extractMutation.isError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {extractMutation.error.message}
            </div>
          )}

          {extraction && (
            <div className="p-2 bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                Extracted with {Math.round(extraction.confidence * 100)}% confidence. Review and
                edit below.
              </span>
            </div>
          )}
        </div>

        {/* Divider */}
        {images.length > 0 && (
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-gray-500">
                {extraction ? 'Review & edit' : 'Or enter manually'}
              </span>
            </div>
          </div>
        )}

        {/* Form fields */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Artist <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            required
            placeholder="e.g. Pink Floyd"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Album Title <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={albumTitle}
            onChange={(e) => setAlbumTitle(e.target.value)}
            required
            placeholder="e.g. The Dark Side of the Moon"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
            <Input
              type="number"
              value={releaseYear}
              onChange={(e) => setReleaseYear(e.target.value)}
              placeholder="1973"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select...</option>
              <option value="LP">LP</option>
              <option value='7"'>7&quot;</option>
              <option value='10"'>10&quot;</option>
              <option value='12"'>12&quot;</option>
              <option value="2xLP">2xLP</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Genre (comma-separated)
          </label>
          <Input
            type="text"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            placeholder="Rock, Progressive Rock"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
            <Input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Harvest"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Catalog #</label>
            <Input
              type="text"
              value={catalogNumber}
              onChange={(e) => setCatalogNumber(e.target.value)}
              placeholder="SHVL 804"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
            <Input
              type="text"
              value={pressingCountry}
              onChange={(e) => setPressingCountry(e.target.value)}
              placeholder="UK"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
            <Input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Black"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Condition</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select...</option>
            <option value="Mint">Mint (M)</option>
            <option value="NM">Near Mint (NM)</option>
            <option value="VG+">Very Good Plus (VG+)</option>
            <option value="VG">Very Good (VG)</option>
            <option value="G+">Good Plus (G+)</option>
            <option value="G">Good (G)</option>
            <option value="Fair">Fair (F)</option>
            <option value="Poor">Poor (P)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Original pressing, gatefold sleeve..."
          />
        </div>

        {uploadProgress && (
          <div className="p-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded-lg text-center">
            {uploadProgress}
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t">
          <Button
            type="submit"
            disabled={createMutation.isPending || !!uploadProgress || !artist || !albumTitle}
            className="flex-1"
          >
            {createMutation.isPending || uploadProgress ? 'Saving...' : 'Add Record'}
          </Button>
          <Button variant="ghost" type="button" onClick={handleClose} disabled={!!uploadProgress}>
            Cancel
          </Button>
        </div>
      </form>
    </SlideOver>
  )
}
