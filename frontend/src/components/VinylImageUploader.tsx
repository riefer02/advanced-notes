import { useState, useRef, useCallback } from 'react'
import { compressImage } from '../lib/image-compression'

interface ImageFile {
  file: File
  preview: string
}

interface VinylImageUploaderProps {
  images: ImageFile[]
  onImagesChange: (images: ImageFile[]) => void
  disabled?: boolean
}

export type { ImageFile }

export default function VinylImageUploader({
  images,
  onImagesChange,
  disabled,
}: VinylImageUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isCompressing, setIsCompressing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
      const candidates: File[] = []

      for (const file of Array.from(files)) {
        if (!allowed.includes(file.type)) continue
        if (images.length + candidates.length >= 6) break
        candidates.push(file)
      }

      if (candidates.length === 0) return

      setIsCompressing(true)
      try {
        const results = await Promise.all(candidates.map((f) => compressImage(f)))
        const newImages: ImageFile[] = results.map((r) => ({
          file: r.file,
          preview: URL.createObjectURL(r.file),
        }))
        onImagesChange([...images, ...newImages])
      } finally {
        setIsCompressing(false)
      }
    },
    [images, onImagesChange]
  )

  const removeImage = (index: number) => {
    const updated = [...images]
    URL.revokeObjectURL(updated[index].preview)
    updated.splice(index, 1)
    onImagesChange(updated)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (!disabled && !isCompressing) addFiles(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled && !isCompressing) setIsDragOver(true)
  }

  const isDisabled = disabled || isCompressing

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => !isDisabled && fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => e.target.files && addFiles(e.target.files)}
          className="hidden"
          disabled={isDisabled}
        />

        {isCompressing ? (
          <>
            <svg
              className="mx-auto h-10 w-10 text-blue-500 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <p className="mt-2 text-sm font-medium text-blue-600">Compressing photos...</p>
          </>
        ) : (
          <>
            <svg
              className="mx-auto h-10 w-10 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
              />
            </svg>

            <p className="mt-2 text-sm font-medium text-gray-700">
              {isDragOver ? 'Drop photos here' : 'Drag photos here or tap to upload'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Front cover, back cover, center label, inner sleeve
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              {images.length}/6 photos &middot; JPG, PNG, WebP
            </p>
          </>
        )}
      </div>

      {/* Image previews */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, i) => (
            <div
              key={i}
              className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100"
            >
              <img
                src={img.preview}
                alt={`Photo ${i + 1}`}
                className="w-full h-full object-cover"
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeImage(i)
                  }}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
