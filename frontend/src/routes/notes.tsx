import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@clerk/clerk-react'
import NotesPanel from '../components/NotesPanel'

export const Route = createFileRoute('/notes')({
  component: NotesPage,
})

function NotesPage() {
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!isSignedIn) {
    window.location.href = '/sign-in'
    return null
  }

  return (
    <div className="h-full bg-white">
      <NotesPanel />
    </div>
  )
}


