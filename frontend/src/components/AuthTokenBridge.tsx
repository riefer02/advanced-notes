import { useEffect, type ReactNode } from 'react'
import { useAuth, useClerk } from '@clerk/clerk-react'

import { setAuthTokenGetter, setUnauthorizedHandler } from '../lib/api/core'

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
  const clerk = useClerk()

  setAuthTokenGetter(getToken)

  useEffect(() => {
    let redirecting = false
    setUnauthorizedHandler(() => {
      if (redirecting) return
      redirecting = true
      void clerk.signOut({ redirectUrl: '/sign-in' }).finally(() => {
        redirecting = false
      })
    })
    return () => setUnauthorizedHandler(null)
  }, [clerk])

  return <>{children}</>
}
