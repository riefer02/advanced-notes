import { createFileRoute } from '@tanstack/react-router'
import { useAuth, useUser } from '@clerk/clerk-react'
import { useState } from 'react'
import FriendsList from '../components/FriendsList'
import FriendSearch from '../components/FriendSearch'
import ShareManager from '../components/ShareManager'

export const Route = createFileRoute('/friends')({
  component: FriendsPage,
})

type Tab = 'friends' | 'shares'

function FriendsPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const [activeTab, setActiveTab] = useState<Tab>('friends')

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
          <div className="border-b border-gray-200 mb-6">
            <div className="flex gap-6">
              <button
                type="button"
                onClick={() => setActiveTab('friends')}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'friends'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Friends
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('shares')}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'shares'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Sharing
              </button>
            </div>
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
