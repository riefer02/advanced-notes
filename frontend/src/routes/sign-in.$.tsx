import { createFileRoute } from '@tanstack/react-router'
import { SignIn } from '@clerk/clerk-react'

export const Route = createFileRoute('/sign-in/$')({
  component: SignInPage,
})

function SignInPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" afterSignInUrl="/dashboard" />
    </div>
  )
}
