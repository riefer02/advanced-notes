import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  submitFeedback,
  fetchFeedback,
  type Feedback,
  type FeedbackType,
  type FeedbackListResponse,
} from '../lib/api'

interface FeedbackParams {
  limit?: number
  offset?: number
}

export interface CreateFeedbackData {
  feedback_type: FeedbackType
  title: string
  description?: string
  rating?: number
}

export function useFeedbackList(params?: FeedbackParams) {
  return useQuery({
    queryKey: ['feedback', params],
    queryFn: () => fetchFeedback(params),
  })
}

export function useSubmitFeedback() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateFeedbackData) => submitFeedback(data),
    onMutate: async (newFeedback) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['feedback'] })

      // Snapshot the previous value
      const previousFeedback = queryClient.getQueryData<FeedbackListResponse>(['feedback'])

      // Optimistically update the cache with a temporary feedback item
      if (previousFeedback) {
        const optimisticFeedback: Feedback = {
          id: `temp-${Date.now()}`,
          user_id: 'current-user',
          feedback_type: newFeedback.feedback_type,
          title: newFeedback.title,
          description: newFeedback.description ?? null,
          rating: newFeedback.rating ?? null,
          created_at: new Date().toISOString(),
        }

        queryClient.setQueryData<FeedbackListResponse>(['feedback'], {
          ...previousFeedback,
          feedback: [optimisticFeedback, ...previousFeedback.feedback],
          total: previousFeedback.total + 1,
        })
      }

      // Return context with the snapshot for potential rollback
      return { previousFeedback }
    },
    onError: (_err, _newFeedback, context) => {
      // Roll back to the previous value on error
      if (context?.previousFeedback) {
        queryClient.setQueryData(['feedback'], context.previousFeedback)
      }
    },
    onSettled: () => {
      // Always refetch after error or success to sync with server
      queryClient.invalidateQueries({ queryKey: ['feedback'] })
    },
  })
}
