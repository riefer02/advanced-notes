import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchShares,
  fetchReceivedShares,
  createShare,
  acceptShare,
  declineShare,
  revokeShare,
} from '../lib/api'

export function useShares() {
  return useQuery({
    queryKey: ['shares'],
    queryFn: fetchShares,
  })
}

export function useReceivedShares() {
  return useQuery({
    queryKey: ['receivedShares'],
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
      queryClient.invalidateQueries({ queryKey: ['shares'] })
    },
  })
}

export function useAcceptShare() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (shareId: string) => acceptShare(shareId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivedShares'] })
      queryClient.invalidateQueries({ queryKey: ['shares'] })
    },
  })
}

export function useDeclineShare() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (shareId: string) => declineShare(shareId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivedShares'] })
    },
  })
}

export function useRevokeShare() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (shareId: string) => revokeShare(shareId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares'] })
      queryClient.invalidateQueries({ queryKey: ['receivedShares'] })
    },
  })
}
