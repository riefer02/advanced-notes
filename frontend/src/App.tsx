import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'
import AudioUploader from './components/AudioUploader'
import NotesPanel from './components/NotesPanel'

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Don't refetch when window regains focus
      retry: 1, // Retry failed requests once
    },
  },
})

export default function App() {
  const [activeTab, setActiveTab] = useState<'transcribe' | 'notes'>('transcribe')

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
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
        <div className="lg:flex lg:h-screen">
          {/* Left Pane: Input Controls (40%) */}
          <div
            className={`lg:w-[40%] lg:border-r lg:border-gray-200 lg:overflow-y-auto ${
              activeTab === 'transcribe' ? 'block' : 'hidden lg:block'
            }`}
          >
            <AudioUploader />
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

      {/* React Query DevTools - Only in development */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
