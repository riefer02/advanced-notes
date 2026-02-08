import { useState, useRef, useCallback } from 'react'

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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const newImages: ImageFile[] = []
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

      for (const file of Array.from(files)) {
        if (!allowed.includes(file.type)) continue
        if (images.length + newImages.length >= 6) break
        newImages.push({
          file,
          preview: URL.createObjectURL(file),
        })
      }

      if (newImages.length > 0) {
        onImagesChange([...images, ...newImages])
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
    if (!disabled) addFiles(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setIsDragOver(true)
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => e.target.files && addFiles(e.target.files)}
          className="hidden"
          disabled={disabled}
        />

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
