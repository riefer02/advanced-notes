import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchVinylRecords,
  fetchVinylRecord,
  createVinylRecord,
  updateVinylRecord,
  deleteVinylRecord,
  fetchVinylStats,
  searchVinylRecords,
  extractVinylMetadata,
  extractVinylFromPhotos,
  type VinylRecord,
} from '../lib/api'

// ============================================================================
// Query Hooks
// ============================================================================

interface VinylListParams {
  genre?: string
  decade?: number
  format?: string
  search?: string
  sort_by?: string
  limit?: number
  offset?: number
  owner?: string
}

export function useVinylRecords(params?: VinylListParams) {
  return useQuery({
    queryKey: ['vinyl', params],
    queryFn: () => fetchVinylRecords(params),
  })
}

export function useVinylRecord(recordId: string | null, owner?: string) {
  return useQuery({
    queryKey: ['vinyl', recordId, owner],
    queryFn: () => fetchVinylRecord(recordId!, owner),
    enabled: !!recordId,
  })
}

export function useVinylStats(owner?: string) {
  return useQuery({
    queryKey: ['vinylStats', owner],
    queryFn: () => fetchVinylStats(owner),
  })
}

export function useVinylSearch(query: string, owner?: string) {
  return useQuery({
    queryKey: ['vinylSearch', query, owner],
    queryFn: () => searchVinylRecords(query, undefined, undefined, owner),
    enabled: query.length >= 2,
  })
}

// ============================================================================
// Mutation Hooks
// ============================================================================

export function useCreateVinylRecord() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
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
    }) => createVinylRecord(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vinyl'] })
      queryClient.invalidateQueries({ queryKey: ['vinylStats'] })
    },
  })
}

export function useUpdateVinylRecord() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      recordId,
      data,
    }: {
      recordId: string
      data: Parameters<typeof updateVinylRecord>[1]
    }) => updateVinylRecord(recordId, data),
    onSuccess: (updatedRecord: VinylRecord) => {
      queryClient.setQueryData(['vinyl', updatedRecord.id], updatedRecord)
      queryClient.invalidateQueries({ queryKey: ['vinyl'] })
      queryClient.invalidateQueries({ queryKey: ['vinylStats'] })
    },
  })
}

export function useDeleteVinylRecord() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (recordId: string) => deleteVinylRecord(recordId),
    onSuccess: (_data, recordId) => {
      queryClient.removeQueries({ queryKey: ['vinyl', recordId] })
      queryClient.invalidateQueries({ queryKey: ['vinyl'] })
      queryClient.invalidateQueries({ queryKey: ['vinylStats'] })
    },
  })
}

export function useExtractVinylMetadata() {
  return useMutation({
    mutationFn: (recordId: string) => extractVinylMetadata(recordId),
  })
}

export function useExtractVinylFromPhotos() {
  return useMutation({
    mutationFn: (files: File[]) => extractVinylFromPhotos(files),
  })
}
