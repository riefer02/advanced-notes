import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchMyProfile,
  updateProfile,
  fetchUserProfile,
  uploadAvatar,
  deleteAvatar,
  checkUsernameAvailable,
} from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

export function useMyProfile() {
  return useQuery({
    queryKey: queryKeys.profile.me,
    queryFn: fetchMyProfile,
  })
}

export function useUserProfile(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profile.user(userId!),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.me })
    },
  })
}

export function useUploadAvatar() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (file: File) => uploadAvatar(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.me })
    },
  })
}

export function useDeleteAvatar() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => deleteAvatar(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.me })
    },
  })
}

export function useCheckUsername(username: string) {
  return useQuery({
    queryKey: queryKeys.profile.usernameAvailable(username),
    queryFn: () => checkUsernameAvailable(username),
    enabled: username.length >= 3,
    staleTime: 10_000,
  })
}
