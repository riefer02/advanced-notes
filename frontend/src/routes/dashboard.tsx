import { createFileRoute } from '@tanstack/react-router'
import { useAuth, UserButton } from '@clerk/clerk-react'
import { useState, useEffect, useRef } from 'react'
import AudioUploader from '../components/AudioUploader'
import NotesPanel from '../components/NotesPanel'
import { setAuthTokenGetter } from '../lib/api'
import SlideOver from '../components/ui/SlideOver'

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
  
  // Summary Feature State
  const [showSummary, setShowSummary] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)
  
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

  const handleSummarize = () => {
    setShowSummary(true)
    setIsSummarizing(true)
    // Mock API call
    setTimeout(() => {
      setIsSummarizing(false)
    }, 2000)
  }

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
    <div className="min-h-screen bg-gray-50 flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-10 shadow-sm flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
              🐺 Chisos
            </h1>
            <div className="flex items-center gap-4">
              <button
                onClick={handleSummarize}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg text-sm font-medium transition-colors border border-purple-200"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Summarize Recent
              </button>
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Tabs - Visible only on mobile */}
      <div className="lg:hidden border-b bg-white flex-shrink-0">
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
      <div className="flex-1 lg:flex overflow-hidden">
        {/* Left Pane: Input Controls (40%) */}
        <div
          className={`lg:w-[40%] lg:border-r lg:border-gray-200 bg-white lg:bg-gray-50 overflow-y-auto ${
            activeTab === 'transcribe' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="p-4 lg:p-8 max-w-2xl mx-auto">
             <div className="lg:hidden mb-6">
                <button
                  onClick={handleSummarize}
                  className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg text-sm font-medium transition-colors border border-purple-200"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Summarize Recent Notes
                </button>
             </div>
             <AudioUploader recordButtonRef={recordButtonRef} />
          </div>
        </div>

        {/* Right Pane: Notes Panel (60%) */}
        <div
          className={`lg:w-[60%] overflow-hidden ${
            activeTab === 'notes' ? 'block' : 'hidden lg:block'
          }`}
        >
          <NotesPanel />
        </div>
      </div>

      {/* Summary Slide-Over */}
      <SlideOver
        isOpen={showSummary}
        onClose={() => setShowSummary(false)}
        title={
          <div className="flex items-center gap-2 text-purple-900">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Smart Summary
          </div>
        }
      >
        <div className="space-y-6">
          {isSummarizing ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="relative">
                <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold text-purple-600">AI</span>
                </div>
              </div>
              <p className="text-sm text-purple-600 font-medium animate-pulse">
                Analyzing your recent notes...
              </p>
            </div>
          ) : (
            <div className="prose prose-purple">
              <div className="bg-purple-50 rounded-xl p-6 border border-purple-100">
                <h3 className="text-lg font-semibold text-purple-900 mb-4">Weekly Synthesis</h3>
                <p className="text-gray-800 leading-relaxed mb-4">
                  Based on your recent notes, you've been focused on <strong>Product Development</strong> and <strong>User Experience</strong>.
                </p>
                <ul className="space-y-2 text-gray-700">
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 bg-purple-500 rounded-full flex-shrink-0"></span>
                    <span>Explored new dashboard layouts with a focus on "Workbench" functionality.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 bg-purple-500 rounded-full flex-shrink-0"></span>
                    <span>Identified need for a persistent "Slide-Over" panel for better note reviewing.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 bg-purple-500 rounded-full flex-shrink-0"></span>
                    <span>Planned integration of AI summarization agents.</span>
                  </li>
                </ul>
                <div className="mt-6 pt-4 border-t border-purple-200 flex items-center justify-between text-sm">
                  <span className="text-purple-700 font-medium">Action Items Identified: 2</span>
                  <button className="text-purple-600 hover:text-purple-800 underline">
                    Export Report
                  </button>
                </div>
              </div>
              
              <div className="mt-6">
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Source Notes
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-purple-300 transition-colors cursor-pointer">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                      UX
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">Workbench Design</div>
                      <div className="text-xs text-gray-500">Just now</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-purple-300 transition-colors cursor-pointer">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-xs">
                      AI
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">Agent Capabilities</div>
                      <div className="text-xs text-gray-500">2 hours ago</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </SlideOver>
    </div>
  )
}
