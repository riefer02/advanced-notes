import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@clerk/clerk-react'
import { useState, useCallback } from 'react'
import VinylLibrary from '../components/VinylLibrary'
import VinylRecordDetail from '../components/VinylRecordDetail'
import VinylAddForm from '../components/VinylAddForm'

export const Route = createFileRoute('/vinyl')({
  component: VinylPage,
})

function VinylPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const handleSelectRecord = useCallback((recordId: string) => {
    setSelectedRecordId(recordId)
  }, [])

  const handleCloseDetail = useCallback(() => {
    setSelectedRecordId(null)
  }, [])

  const handleRecordDeleted = useCallback(() => {
    setSelectedRecordId(null)
  }, [])

  const handleRecordCreated = useCallback((recordId: string) => {
    setSelectedRecordId(recordId)
  }, [])

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
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
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-8 max-w-6xl mx-auto">
          <VinylLibrary
            onSelectRecord={handleSelectRecord}
            onAddRecord={() => setShowAddForm(true)}
          />
        </div>
      </div>

      <VinylRecordDetail
        isOpen={!!selectedRecordId}
        onClose={handleCloseDetail}
        recordId={selectedRecordId}
        onDeleted={handleRecordDeleted}
      />

      <VinylAddForm
        isOpen={showAddForm}
        onClose={() => setShowAddForm(false)}
        onCreated={handleRecordCreated}
      />
    </div>
  )
}
