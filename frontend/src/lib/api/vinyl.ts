/**
 * Vinyl collection API types and functions.
 */
import { apiRequest, apiUpload } from './core'

// ============================================================================
// Types
// ============================================================================

export interface VinylTrack {
  id: string
  user_id: string
  vinyl_record_id: string
  side: string | null
  position: number | null
  title: string
  duration: string | null
  created_at: string
}

export interface VinylImage {
  id: string
  user_id: string
  vinyl_record_id: string
  image_type: string
  storage_key: string
  mime_type: string
  bytes: number
  status: string
  created_at: string
}

export interface VinylRecord {
  id: string
  user_id: string
  artist: string
  album_title: string
  release_year: number | null
  genre: string[]
  label: string | null
  catalog_number: string | null
  format: string | null
  pressing_country: string | null
  color: string | null
  condition: string | null
  notes: string | null
  extraction_status: string
  extraction_confidence: number | null
  cover_image_id: string | null
  cover_image_url: string | null
  tracks: VinylTrack[]
  images: VinylImage[]
  created_at: string
  updated_at: string
}

export interface VinylRecordsResponse {
  records: VinylRecord[]
  total: number
  limit: number
  offset: number
}

export interface VinylStatsResponse {
  total_records: number
  total_artists: number
}

export interface VinylSearchResponse {
  records: VinylRecord[]
  query: string
  total: number
}

export interface VinylExtractionResult {
  artist: string
  album_title: string
  release_year: number | null
  genre: string[]
  label: string | null
  catalog_number: string | null
  format: string | null
  pressing_country: string | null
  tracks: { side: string | null; position: number | null; title: string; duration: string | null }[]
  confidence: number
  reasoning: string
}

export interface VinylImageUploadResponse {
  image: VinylImage
}

// ============================================================================
// API Functions
// ============================================================================

export async function fetchVinylRecords(params?: {
  genre?: string
  decade?: number
  format?: string
  search?: string
  sort_by?: string
  limit?: number
  offset?: number
  owner?: string
}): Promise<VinylRecordsResponse> {
  return apiRequest<VinylRecordsResponse>('GET', '/api/vinyl', { params })
}

export async function fetchVinylRecord(recordId: string, owner?: string): Promise<VinylRecord> {
  return apiRequest<VinylRecord>('GET', `/api/vinyl/${recordId}`, {
    params: owner ? { owner } : undefined,
  })
}

export async function createVinylRecord(data: {
  artist: string
  album_title: string
  release_year?: number
  genre?: string[]
  label?: string
  catalog_number?: string
  format?: string
  pressing_country?: string
  color?: string
  condition?: string
  notes?: string
}): Promise<VinylRecord> {
  return apiRequest<VinylRecord>('POST', '/api/vinyl', { body: data })
}

export async function updateVinylRecord(
  recordId: string,
  data: {
    artist?: string
    album_title?: string
    release_year?: number
    genre?: string[]
    label?: string
    catalog_number?: string
    format?: string
    pressing_country?: string
    color?: string
    condition?: string
    notes?: string
    extraction_status?: string
    extraction_confidence?: number
    cover_image_id?: string
    tracks?: { side?: string; position?: number; title: string; duration?: string }[]
  }
): Promise<VinylRecord> {
  return apiRequest<VinylRecord>('PUT', `/api/vinyl/${recordId}`, { body: data })
}

export async function deleteVinylRecord(recordId: string): Promise<void> {
  await apiRequest<{ success: boolean }>('DELETE', `/api/vinyl/${recordId}`)
}

export async function fetchVinylStats(owner?: string): Promise<VinylStatsResponse> {
  return apiRequest<VinylStatsResponse>('GET', '/api/vinyl/stats', {
    params: owner ? { owner } : undefined,
  })
}

export async function searchVinylRecords(
  query: string,
  limit?: number,
  offset?: number,
  owner?: string
): Promise<VinylSearchResponse> {
  return apiRequest<VinylSearchResponse>('GET', '/api/vinyl/search', {
    params: { q: query, limit, offset, owner },
  })
}

export async function uploadVinylImage(
  recordId: string,
  file: File,
  imageType: string = 'other'
): Promise<VinylImageUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('image_type', imageType)
  return apiUpload<VinylImageUploadResponse>(`/api/vinyl/${recordId}/images`, formData)
}

export async function getVinylImageUrl(
  recordId: string,
  imageId: string,
  owner?: string
): Promise<{ url: string; expires_at: string }> {
  return apiRequest<{ url: string; expires_at: string }>(
    'GET',
    `/api/vinyl/${recordId}/images/${imageId}/url`,
    { params: owner ? { owner } : undefined }
  )
}

export async function deleteVinylImage(recordId: string, imageId: string): Promise<void> {
  await apiRequest<{ success: boolean }>('DELETE', `/api/vinyl/${recordId}/images/${imageId}`)
}

export async function extractVinylMetadata(recordId: string): Promise<VinylExtractionResult> {
  return apiRequest<VinylExtractionResult>('POST', `/api/vinyl/${recordId}/extract`)
}

export async function extractVinylFromPhotos(files: File[]): Promise<VinylExtractionResult> {
  const formData = new FormData()
  files.forEach((f) => formData.append('images', f))
  return apiUpload<VinylExtractionResult>('/api/vinyl/extract-photos', formData)
}
