import { createFileRoute } from '@tanstack/react-router'
import { useAuth, useUser } from '@clerk/clerk-react'
import { useState } from 'react'
import FriendsList from '../components/FriendsList'
import FriendSearch from '../components/FriendSearch'
import ShareManager from '../components/ShareManager'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface FriendsSearch {
  tab?: 'friends' | 'shares'
}

export const Route = createFileRoute('/friends')({
  component: FriendsPage,
  validateSearch: (search: Record<string, unknown>): FriendsSearch => ({
    tab: search.tab === 'shares' ? 'shares' : undefined,
  }),
})

type Tab = 'friends' | 'shares'

const TABS = [
  { id: 'friends', label: 'Friends' },
  { id: 'shares', label: 'Sharing' },
]

function FriendsPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const { tab } = Route.useSearch()
  const [activeTab, setActiveTab] = useState<Tab>(tab === 'shares' ? 'shares' : 'friends')

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

  const currentUserId = user?.id ?? ''

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-8 max-w-3xl mx-auto">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Friends & Sharing</h2>

          {/* Tabs */}
          <div className="mb-6">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
              <TabsList>
                {TABS.map((t) => (
                  <TabsTrigger key={t.id} value={t.id}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {activeTab === 'friends' && (
            <div className="space-y-8">
              <FriendSearch />
              <FriendsList currentUserId={currentUserId} />
            </div>
          )}

          {activeTab === 'shares' && <ShareManager currentUserId={currentUserId} />}
        </div>
      </div>
    </div>
  )
}
