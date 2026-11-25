import { createFileRoute } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import { useEffect, useState } from 'react'
import FriendsList from '../components/FriendsList'
import FriendSearch from '../components/FriendSearch'
import ShareManager from '../components/ShareManager'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/ui/page-header'

type ShareResource = 'vinyl_library' | 'meal_calendar'

interface FriendsSearch {
  tab?: 'friends' | 'shares'
  resource?: ShareResource
}

export const Route = createFileRoute('/friends')({
  component: FriendsPage,
  validateSearch: (search: Record<string, unknown>): FriendsSearch => ({
    tab: search.tab === 'shares' ? 'shares' : undefined,
    resource:
      search.resource === 'meal_calendar' || search.resource === 'vinyl_library'
        ? search.resource
        : undefined,
  }),
})

type Tab = 'friends' | 'shares'

const TABS = [
  { id: 'friends', label: 'Friends' },
  { id: 'shares', label: 'Sharing' },
]

function FriendsPage() {
  const { user } = useUser()
  const { tab, resource } = Route.useSearch()
  const [activeTab, setActiveTab] = useState<Tab>(
    tab === 'shares' || resource ? 'shares' : 'friends'
  )

  // A share link can land here while the route is already mounted.
  useEffect(() => {
    if (tab === 'shares' || resource) {
      setActiveTab('shares')
    } else if (tab === 'friends') {
      setActiveTab('friends')
    }
  }, [tab, resource])

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

          {activeTab === 'shares' && (
            <ShareManager currentUserId={currentUserId} resource={resource} />
          )}
        </div>
      </div>
    </div>
  )
}
