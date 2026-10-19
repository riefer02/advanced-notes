import type { ReactNode } from 'react'
import { RedirectToSignIn, useAuth } from '@clerk/clerk-react'

/**
 * Gate for protected routes.
 *
 * Children are not mounted until Clerk has loaded and the user is signed in,
 * so their queries never fire unauthenticated. Redirecting is handled by
 * Clerk rather than a render-time `window.location` assignment.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />
  }

  return <>{children}</>
}
