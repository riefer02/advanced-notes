import type { ReactNode } from 'react'
import { useAuth } from '@clerk/clerk-react'

import { setAuthTokenGetter } from '../lib/api'

/**
 * Wires Clerk's `getToken` into the API layer before any route mounts.
 *
 * This assigns during render rather than in an effect: child route queries
 * subscribe in their own effects, which run before a parent's effects, so an
 * effect here would be too late and the first request could go out
 * unauthenticated. The assignment is idempotent.
 */
export function AuthTokenBridge({ children }: { children: ReactNode }) {
  const { getToken } = useAuth()
  setAuthTokenGetter(getToken)
  return <>{children}</>
}
