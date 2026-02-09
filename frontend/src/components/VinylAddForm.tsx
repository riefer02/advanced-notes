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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'

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
          <Alert variant="destructive">
            <AlertDescription>{createMutation.error.message}</AlertDescription>
          </Alert>
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
            <Alert variant="destructive">
              <AlertDescription>{extractMutation.error.message}</AlertDescription>
            </Alert>
          )}

          {extraction && (
            <Alert variant="success" className="py-2 text-xs">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
              <AlertDescription>
                Extracted with {Math.round(extraction.confidence * 100)}% confidence. Review and
                edit below.
              </AlertDescription>
            </Alert>
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
          <Label className="text-xs text-gray-600 mb-1">
            Artist <span className="text-red-500">*</span>
          </Label>
          <Input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            required
            placeholder="e.g. Pink Floyd"
          />
        </div>

        <div>
          <Label className="text-xs text-gray-600 mb-1">
            Album Title <span className="text-red-500">*</span>
          </Label>
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
            <Label className="text-xs text-gray-600 mb-1">Year</Label>
            <Input
              type="number"
              value={releaseYear}
              onChange={(e) => setReleaseYear(e.target.value)}
              placeholder="1973"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-600 mb-1">Format</Label>
            <Select
              value={format || '__none__'}
              onValueChange={(v) => setFormat(v === '__none__' ? '' : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select...</SelectItem>
                <SelectItem value="LP">LP</SelectItem>
                <SelectItem value='7"'>7&quot;</SelectItem>
                <SelectItem value='10"'>10&quot;</SelectItem>
                <SelectItem value='12"'>12&quot;</SelectItem>
                <SelectItem value="2xLP">2xLP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs text-gray-600 mb-1">Genre (comma-separated)</Label>
          <Input
            type="text"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            placeholder="Rock, Progressive Rock"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-gray-600 mb-1">Label</Label>
            <Input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Harvest"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-600 mb-1">Catalog #</Label>
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
            <Label className="text-xs text-gray-600 mb-1">Country</Label>
            <Input
              type="text"
              value={pressingCountry}
              onChange={(e) => setPressingCountry(e.target.value)}
              placeholder="UK"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-600 mb-1">Color</Label>
            <Input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Black"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs text-gray-600 mb-1">Condition</Label>
          <Select
            value={condition || '__none__'}
            onValueChange={(v) => setCondition(v === '__none__' ? '' : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select...</SelectItem>
              <SelectItem value="Mint">Mint (M)</SelectItem>
              <SelectItem value="NM">Near Mint (NM)</SelectItem>
              <SelectItem value="VG+">Very Good Plus (VG+)</SelectItem>
              <SelectItem value="VG">Very Good (VG)</SelectItem>
              <SelectItem value="G+">Good Plus (G+)</SelectItem>
              <SelectItem value="G">Good (G)</SelectItem>
              <SelectItem value="Fair">Fair (F)</SelectItem>
              <SelectItem value="Poor">Poor (P)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-gray-600 mb-1">Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Original pressing, gatefold sleeve..."
          />
        </div>

        {uploadProgress && (
          <Alert variant="info" className="py-2 text-xs text-center">
            <AlertDescription>{uploadProgress}</AlertDescription>
          </Alert>
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
