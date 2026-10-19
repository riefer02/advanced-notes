import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const authState = { isLoaded: true, isSignedIn: true }

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => authState,
  RedirectToSignIn: () => <div>redirect-to-sign-in</div>,
}))

import { RequireAuth } from './RequireAuth'

describe('RequireAuth', () => {
  beforeEach(() => {
    authState.isLoaded = true
    authState.isSignedIn = true
  })

  it('renders children once the user is signed in', () => {
    render(
      <RequireAuth>
        <div>protected content</div>
      </RequireAuth>
    )

    expect(screen.getByText('protected content')).toBeInTheDocument()
  })

  it('holds children back while Clerk is still loading', () => {
    authState.isLoaded = false

    render(
      <RequireAuth>
        <div>protected content</div>
      </RequireAuth>
    )

    expect(screen.queryByText('protected content')).not.toBeInTheDocument()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('redirects instead of mounting children when signed out', () => {
    authState.isSignedIn = false

    render(
      <RequireAuth>
        <div>protected content</div>
      </RequireAuth>
    )

    expect(screen.queryByText('protected content')).not.toBeInTheDocument()
    expect(screen.getByText('redirect-to-sign-in')).toBeInTheDocument()
  })
})
