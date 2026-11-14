import { createFileRoute } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import { useState } from 'react'
import FriendsList from '../components/FriendsList'
import FriendSearch from '../components/FriendSearch'
import ShareManager from '../components/ShareManager'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/ui/page-header'

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
  const { user } = useUser()
  const { tab } = Route.useSearch()
  const [activeTab, setActiveTab] = useState<Tab>(tab === 'shares' ? 'shares' : 'friends')

  const currentUserId = user?.id ?? ''

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-5 py-6 sm:px-8">
          <PageHeader
            title="Friends & Sharing"
            description="People you share with, and what they can see."
            className="mb-5"
          />

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
