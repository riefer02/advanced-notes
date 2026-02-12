import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
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
// Invalidation Helpers
// ============================================================================

function invalidateVinylQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['vinyl'] })
  queryClient.invalidateQueries({ queryKey: ['vinylStats'] })
}

function invalidateDeletedVinylQueries(queryClient: QueryClient, recordId: string) {
  queryClient.removeQueries({ queryKey: ['vinyl', recordId] })
  invalidateVinylQueries(queryClient)
}

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
    onSuccess: () => invalidateVinylQueries(queryClient),
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
      invalidateVinylQueries(queryClient)
    },
  })
}

export function useDeleteVinylRecord() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (recordId: string) => deleteVinylRecord(recordId),
    onSuccess: (_data, recordId) => invalidateDeletedVinylQueries(queryClient, recordId),
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
