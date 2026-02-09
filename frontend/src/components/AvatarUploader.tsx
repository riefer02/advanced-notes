import { useRef } from 'react'
import { useUploadAvatar, useDeleteAvatar } from '../hooks/useProfile'
import { compressImage } from '../lib/image-compression'
import UserAvatar from './UserAvatar'
import { Button } from '@/components/ui/button'

interface AvatarUploaderProps {
  avatarUrl?: string | null
  displayName: string
}

export default function AvatarUploader({ avatarUrl, displayName }: AvatarUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadAvatar = useUploadAvatar()
  const deleteAvatar = useDeleteAvatar()

  const isLoading = uploadAvatar.isPending || deleteAvatar.isPending

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const { file: compressed } = await compressImage(file, {
        maxDimension: 512,
        quality: 0.8,
      })
      uploadAvatar.mutate(compressed)
    } catch {
      uploadAvatar.mutate(file)
    }

    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isLoading}
        className="relative group"
      >
        <UserAvatar avatarUrl={avatarUrl} displayName={displayName} size="lg" />
        <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-white text-xs font-medium">Change</span>
        </div>
        {isLoading && (
          <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex flex-col gap-1">
        <Button
          variant="link"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="text-blue-600 hover:text-blue-700 p-0 h-auto"
        >
          Upload photo
        </Button>
        {avatarUrl && (
          <Button
            variant="link"
            size="sm"
            onClick={() => deleteAvatar.mutate()}
            disabled={isLoading}
            className="text-red-500 hover:text-red-600 p-0 h-auto"
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}
