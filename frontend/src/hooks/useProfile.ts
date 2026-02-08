import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchMyProfile,
  updateProfile,
  fetchUserProfile,
  uploadAvatar,
  deleteAvatar,
  checkUsernameAvailable,
} from '../lib/api'

export function useMyProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: fetchMyProfile,
  })
}

export function useUserProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchUserProfile(userId!),
    enabled: !!userId,
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      display_name?: string
      username?: string | null
      bio?: string
      discoverable?: boolean
    }) => updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useUploadAvatar() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (file: File) => uploadAvatar(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useDeleteAvatar() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => deleteAvatar(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useCheckUsername(username: string) {
  return useQuery({
    queryKey: ['username-available', username],
    queryFn: () => checkUsernameAvailable(username),
    enabled: username.length >= 3,
    staleTime: 10_000,
  })
}
