import { useState } from 'react'
import { useUserSearch, useSendFriendRequest } from '../hooks/useFriends'
import type { UserProfile } from '../lib/api'
import UserAvatar from './UserAvatar'

export default function FriendSearch() {
  const [query, setQuery] = useState('')
  const { data, isLoading } = useUserSearch(query)
  const sendRequest = useSendFriendRequest()

  const users = data?.users ?? []

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="friend-search" className="block text-sm font-medium text-gray-700 mb-1">
          Find people
        </label>
        <input
          id="friend-search"
          type="text"
          placeholder="Search by name, @username, or email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {isLoading && query.length >= 2 && (
        <div className="text-sm text-gray-500 py-2">Searching...</div>
      )}

      {!isLoading && query.length >= 2 && users.length === 0 && (
        <div className="text-sm text-gray-500 py-2">No users found</div>
      )}

      {users.length > 0 && (
        <div className="space-y-2">
          {users.map((user) => (
            <UserSearchResult
              key={user.id}
              user={user}
              onSendRequest={() => sendRequest.mutate(user.user_id)}
              isSending={sendRequest.isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function UserSearchResult({
  user,
  onSendRequest,
  isSending,
}: {
  user: UserProfile
  onSendRequest: () => void
  isSending: boolean
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar avatarUrl={user.avatar_url} displayName={user.display_name} size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{user.display_name}</p>
          {user.username && <p className="text-xs text-gray-500 truncate">@{user.username}</p>}
          {!user.username && user.email && (
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onSendRequest}
        disabled={isSending}
        className="ml-3 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100 disabled:opacity-50 transition-colors"
      >
        {isSending ? 'Sending...' : 'Add Friend'}
      </button>
    </div>
  )
}
