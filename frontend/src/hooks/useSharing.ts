import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchShares,
  fetchReceivedShares,
  createShare,
  acceptShare,
  declineShare,
  revokeShare,
} from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

export function useShares() {
  return useQuery({
    queryKey: queryKeys.shares.all,
    queryFn: fetchShares,
  })
}

export function useReceivedShares() {
  return useQuery({
    queryKey: queryKeys.shares.received,
    queryFn: fetchReceivedShares,
  })
}

export function useCreateShare() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      shared_with_id: string
      resource_type: string
      permission: 'view' | 'edit'
    }) => createShare(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shares.all })
    },
  })
}

export function useAcceptShare() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (shareId: string) => acceptShare(shareId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shares.received })
      queryClient.invalidateQueries({ queryKey: queryKeys.shares.all })
    },
  })
}

export function useDeclineShare() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (shareId: string) => declineShare(shareId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shares.received })
    },
  })
}

export function useRevokeShare() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (shareId: string) => revokeShare(shareId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shares.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.shares.received })
    },
  })
}
