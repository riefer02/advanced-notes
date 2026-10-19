import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import VinylLibrary from '../components/VinylLibrary'
import VinylRecordDetail from '../components/VinylRecordDetail'
import VinylAddForm from '../components/VinylAddForm'
import SharedContentBanner from '../components/SharedContentBanner'

interface VinylSearch {
  owner?: string
}

export const Route = createFileRoute('/vinyl')({
  component: VinylPage,
  validateSearch: (search: Record<string, unknown>): VinylSearch => ({
    owner: typeof search.owner === 'string' ? search.owner : undefined,
  }),
})

function VinylPage() {
  const { owner } = Route.useSearch()
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const isSharedView = !!owner

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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-4">
          {isSharedView && (
            <SharedContentBanner ownerId={owner} backTo="/vinyl" backLabel="Vinyl Collection" />
          )}
          <VinylLibrary
            onSelectRecord={handleSelectRecord}
            onAddRecord={() => setShowAddForm(true)}
            owner={owner}
          />
        </div>
      </div>

      <VinylRecordDetail
        isOpen={!!selectedRecordId}
        onClose={handleCloseDetail}
        recordId={selectedRecordId}
        onDeleted={handleRecordDeleted}
        owner={owner}
      />

      {!isSharedView && (
        <VinylAddForm
          isOpen={showAddForm}
          onClose={() => setShowAddForm(false)}
          onCreated={handleRecordCreated}
        />
      )}
    </div>
  )
}
