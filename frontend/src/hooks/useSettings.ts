import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchUserSettings, updateUserSettings, type UserSettings } from '../lib/api'

export function useUserSettings() {
  return useQuery({
    queryKey: ['userSettings'],
    queryFn: fetchUserSettings,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useUpdateUserSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (settings: { auto_accept_todos?: boolean }) => updateUserSettings(settings),
    onSuccess: (data: UserSettings) => {
      queryClient.setQueryData(['userSettings'], data)
    },
  })
}
