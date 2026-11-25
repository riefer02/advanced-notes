import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchUsage, type UsageSummary } from '../lib/api'

interface UsageState {
  data: UsageSummary | null
  isLoading: boolean
  error: Error | null
}

/**
 * Current-month usage and quota limits.
 *
 * Settings reads this once when it opens, so a small fetch hook is enough —
 * it stays out of the TanStack cache and can be refreshed after an AI action
 * without invalidating unrelated data.
 */
export function useUsage() {
  const [state, setState] = useState<UsageState>({
    data: null,
    isLoading: true,
    error: null,
  })
  const requestRef = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setState((previous) => ({ ...previous, isLoading: true, error: null }))
    try {
      const usage = await fetchUsage()
      if (requestRef.current === requestId) {
        setState({ data: usage, isLoading: false, error: null })
      }
    } catch (error) {
      if (requestRef.current === requestId) {
        setState({
          data: null,
          isLoading: false,
          error: error instanceof Error ? error : new Error('Failed to load usage'),
        })
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { ...state, refresh }
}
