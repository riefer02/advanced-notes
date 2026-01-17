import { createFileRoute } from '@tanstack/react-router'
import { SignUp } from '@clerk/clerk-react'

export const Route = createFileRoute('/sign-up/$')({
  component: SignUpPage,
})

function SignUpPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" afterSignUpUrl="/dashboard" />
    </div>
  )
}
