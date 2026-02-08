export interface CompressImageOptions {
  maxDimension?: number
  quality?: number
  outputFormat?: 'image/webp' | 'image/jpeg'
}

export interface CompressedImage {
  file: File
  originalSize: number
  compressedSize: number
}

let webpSupported: boolean | null = null

function detectWebPSupport(): boolean {
  if (webpSupported !== null) return webpSupported
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  webpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp')
  return webpSupported
}

function scaledDimensions(
  width: number,
  height: number,
  maxDim: number
): { width: number; height: number } {
  if (width <= maxDim && height <= maxDim) return { width, height }
  const ratio = Math.min(maxDim / width, maxDim / height)
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  }
}

export async function compressImage(
  file: File,
  options?: CompressImageOptions
): Promise<CompressedImage> {
  const maxDimension = options?.maxDimension ?? 2048
  const quality = options?.quality ?? 0.82

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    // HEIC on Chrome/Firefox — can't decode, return original
    return { file, originalSize: file.size, compressedSize: file.size }
  }

  const { width, height } = scaledDimensions(bitmap.width, bitmap.height, maxDimension)

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const useWebP = detectWebPSupport()
  const format = options?.outputFormat ?? (useWebP ? 'image/webp' : 'image/jpeg')
  const ext = format === 'image/webp' ? '.webp' : '.jpg'

  const blob = await canvas.convertToBlob({ type: format, quality })

  // Skip if compression made the file larger
  if (blob.size >= file.size) {
    return { file, originalSize: file.size, compressedSize: file.size }
  }

  const baseName = file.name.replace(/\.[^.]+$/, '')
  const compressed = new File([blob], `${baseName}${ext}`, { type: format })

  return {
    file: compressed,
    originalSize: file.size,
    compressedSize: compressed.size,
  }
}
