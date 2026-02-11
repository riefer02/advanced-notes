import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@clerk/clerk-react'
import { useState, useRef } from 'react'
import AudioUploader from '../components/AudioUploader'
import NotesPanel from '../components/NotesPanel'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const Route = createFileRoute('/notes')({
  component: NotesPage,
})

function NotesPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const recordButtonRef = useRef<HTMLButtonElement>(null)
  const [activeTab, setActiveTab] = useState<'transcribe' | 'notes'>('transcribe')

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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Mobile Tabs - Visible only on mobile */}
      <div className="lg:hidden border-b bg-white shrink-0">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'transcribe' | 'notes')}>
          <TabsList variant="line" className="w-full">
            <TabsTrigger value="transcribe" className="flex-1">
              Transcribe
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-1">
              Notes
            </TabsTrigger>
          </TabsList>
        </Tabs>
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
    </div>
  )
}
