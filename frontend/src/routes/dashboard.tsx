import { createFileRoute } from '@tanstack/react-router'
import { useAuth, UserButton } from '@clerk/clerk-react'
import { useState, useEffect, useRef } from 'react'
import AudioUploader from '../components/AudioUploader'
import NotesPanel from '../components/NotesPanel'
import { setAuthTokenGetter } from '../lib/api'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const recordButtonRef = useRef<HTMLButtonElement>(null)

  // Set up auth token getter for API calls
  useEffect(() => {
    setAuthTokenGetter(getToken)
  }, [getToken])
  const [activeTab, setActiveTab] = useState<'transcribe' | 'notes'>('transcribe')
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // "R" to focus/click record button (unless in an input)
      if ((e.key === 'r' || e.key === 'R') && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        recordButtonRef.current?.click()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Show loading state while Clerk is loading
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  // Redirect to sign-in if not authenticated
  if (!isSignedIn) {
    window.location.href = '/sign-in'
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
              🐺 Chisos
            </h1>
            <div className="flex items-center gap-4">
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Tabs - Visible only on mobile */}
      <div className="lg:hidden border-b bg-white">
        <div className="flex">
          <button
            onClick={() => setActiveTab('transcribe')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'transcribe'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            aria-current={activeTab === 'transcribe' ? 'page' : undefined}
          >
            🎤 Transcribe
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'notes'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            aria-current={activeTab === 'notes' ? 'page' : undefined}
          >
            📁 Notes
          </button>
        </div>
      </div>

      {/* Desktop Split-Pane Layout */}
      <div className="lg:flex lg:h-[calc(100vh-4rem)]">
        {/* Left Pane: Input Controls (40%) */}
        <div
          className={`lg:w-[40%] lg:border-r lg:border-gray-200 lg:overflow-y-auto ${
            activeTab === 'transcribe' ? 'block' : 'hidden lg:block'
          }`}
        >
          <AudioUploader recordButtonRef={recordButtonRef} />
        </div>

        {/* Right Pane: Notes Panel (60%) */}
        <div
          className={`lg:w-[60%] lg:overflow-y-auto ${
            activeTab === 'notes' ? 'block' : 'hidden lg:block'
          }`}
        >
          <NotesPanel />
        </div>
      </div>
    </div>
  )
}
