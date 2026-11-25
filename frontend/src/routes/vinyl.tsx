import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useCallback, useEffect } from 'react'
import VinylLibrary from '../components/VinylLibrary'
import VinylRecordDetail from '../components/VinylRecordDetail'
import VinylAddForm from '../components/VinylAddForm'
import SharedContentBanner from '../components/SharedContentBanner'

interface VinylSearch {
  owner?: string
  record?: string
}

export const Route = createFileRoute('/vinyl')({
  component: VinylPage,
  validateSearch: (search: Record<string, unknown>): VinylSearch => ({
    owner: typeof search.owner === 'string' ? search.owner : undefined,
    record: typeof search.record === 'string' ? search.record : undefined,
  }),
})

function VinylPage() {
  const { owner, record } = Route.useSearch()
  const navigate = useNavigate()
  // A `?record=<id>` deep link (from global search) opens the drawer directly.
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(record ?? null)
  const [showAddForm, setShowAddForm] = useState(false)

  const isSharedView = !!owner

  useEffect(() => {
    if (record) setSelectedRecordId(record)
  }, [record])

  const clearRecordParam = useCallback(() => {
    if (record) {
      void navigate({ to: '/vinyl', search: { owner }, replace: true })
    }
  }, [navigate, owner, record])

  const handleSelectRecord = useCallback((recordId: string) => {
    setSelectedRecordId(recordId)
  }, [])

  const handleCloseDetail = useCallback(() => {
    setSelectedRecordId(null)
    clearRecordParam()
  }, [clearRecordParam])

  const handleRecordDeleted = useCallback(() => {
    setSelectedRecordId(null)
    clearRecordParam()
  }, [clearRecordParam])

  const handleRecordCreated = useCallback((recordId: string) => {
    setSelectedRecordId(recordId)
  }, [])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-4 px-5 py-6 sm:px-8">
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
