import { createFileRoute } from '@tanstack/react-router'
import { useAuth, UserButton } from '@clerk/clerk-react'
import { useState, useEffect, useRef } from 'react'
import AudioUploader from '../components/AudioUploader'
import NotesPanel from '../components/NotesPanel'
import { setAuthTokenGetter, generateSummary, DigestResult } from '../lib/api'
import SlideOver from '../components/ui/SlideOver'
import ReactMarkdown from 'react-markdown'

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
  const [digestResult, setDigestResult] = useState<DigestResult | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  
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

  const handleSummarize = async () => {
    setShowSummary(true)
    setIsSummarizing(true)
    setDigestResult(null)
    setSummaryError(null)
    
    try {
      const result = await generateSummary()
      setDigestResult(result)
    } catch (error) {
      console.error('Failed to generate summary:', error)
      setSummaryError(error instanceof Error ? error.message : 'Failed to generate summary')
    } finally {
      setIsSummarizing(false)
    }
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
          ) : summaryError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-medium text-red-800">Summarization Failed</h3>
                <p className="text-sm text-red-600 mt-1">{summaryError}</p>
              </div>
              <button
                onClick={handleSummarize}
                className="px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors border border-red-200"
              >
                Try Again
              </button>
            </div>
          ) : digestResult ? (
            <div className="prose prose-purple max-w-none">
              <div className="bg-purple-50 rounded-xl p-6 border border-purple-100 mb-6">
                <h3 className="text-lg font-semibold text-purple-900 mb-4 mt-0">Smart Digest</h3>
                <div className="text-gray-800 leading-relaxed mb-4 text-sm">
                  <ReactMarkdown>{digestResult.summary}</ReactMarkdown>
                </div>
                
                {digestResult.key_themes.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-purple-800 uppercase tracking-wider mb-2">Key Themes</h4>
                    <ul className="space-y-1 text-gray-700 list-none pl-0 my-0">
                      {digestResult.key_themes.map((theme, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-1.5 w-1.5 h-1.5 bg-purple-500 rounded-full flex-shrink-0"></span>
                          <span>{theme}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {digestResult.action_items.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-purple-200">
                    <h4 className="text-sm font-semibold text-purple-800 uppercase tracking-wider mb-2">Action Items</h4>
                    <ul className="space-y-2 text-gray-700 list-none pl-0 my-0">
                      {digestResult.action_items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <input type="checkbox" className="mt-1 rounded border-purple-300 text-purple-600 focus:ring-purple-500" />
                          <span className="text-sm">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
             <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-gray-500">
                  Click "Summarize Recent" to generate a digest of your latest notes.
                </p>
             </div>
          )}
        </div>
      </SlideOver>
    </div>
  )
}
