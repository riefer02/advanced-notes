import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchFriends,
  fetchFriendRequests,
  fetchSentRequests,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  searchUsers,
} from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

export function useFriends() {
  return useQuery({
    queryKey: queryKeys.friends.all,
    queryFn: fetchFriends,
  })
}

export function useFriendRequests() {
  return useQuery({
    queryKey: queryKeys.friends.requests,
    queryFn: fetchFriendRequests,
  })
}

export function useSentRequests() {
  return useQuery({
    queryKey: queryKeys.friends.sent,
    queryFn: fetchSentRequests,
  })
}

export function useUserSearch(query: string) {
  return useQuery({
    queryKey: queryKeys.userSearch(query),
    queryFn: () => searchUsers(query),
    enabled: query.length >= 2,
  })
}

export function useSendFriendRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: string) => sendFriendRequest(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.sent })
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all })
    },
  })
}

export function useAcceptFriendRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (friendshipId: string) => acceptFriendRequest(friendshipId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.requests })
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all })
    },
  })
}

export function useDeclineFriendRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (friendshipId: string) => declineFriendRequest(friendshipId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.requests })
    },
  })
}

export function useRemoveFriend() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (friendshipId: string) => removeFriend(friendshipId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.shares.all })
    },
  })
}
