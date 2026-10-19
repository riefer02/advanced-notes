import { useEffect, useState } from 'react'

/**
 * Debounce a rapidly changing value (e.g. a search input).
 *
 * Returns the previous value until `value` has been stable for `delayMs`,
 * which avoids firing a request on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
