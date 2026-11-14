import { useState } from 'react'
import { useUserSearch, useSendFriendRequest } from '../hooks/useFriends'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import type { UserProfile } from '../lib/api'
import UserAvatar from './UserAvatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DetailCard } from '@/components/ui/detail'

export default function FriendSearch() {
  const [query, setQuery] = useState('')
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const debouncedQuery = useDebouncedValue(query, 300)
  const { data, isLoading } = useUserSearch(debouncedQuery)
  const sendRequest = useSendFriendRequest()

  const users = data?.users ?? []

  const handleSendRequest = (userId: string) => {
    sendRequest.mutate(userId, {
      onSuccess: () => setSentIds((prev) => new Set(prev).add(userId)),
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="friend-search" className="section-label mb-1.5 block">
          Find people
        </label>
        <Input
          id="friend-search"
          type="text"
          placeholder="Search by name, @username, or email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {isLoading && debouncedQuery.length >= 2 && (
        <div className="text-sm text-ink-subtle py-2">Searching...</div>
      )}

      {!isLoading && debouncedQuery.length >= 2 && users.length === 0 && (
        <div className="text-sm text-ink-subtle py-2">No users found</div>
      )}

      {users.length > 0 && debouncedQuery.length >= 2 && (
        <div className="space-y-2">
          {users.map((user) => (
            <UserSearchResult
              key={user.id}
              user={user}
              onSendRequest={() => handleSendRequest(user.user_id)}
              isSending={sendRequest.isPending && sendRequest.variables === user.user_id}
              isSent={sentIds.has(user.user_id)}
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
  isSent,
}: {
  user: UserProfile
  onSendRequest: () => void
  isSending: boolean
  isSent: boolean
}) {
  return (
    <DetailCard className="flex items-center justify-between p-3">
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar avatarUrl={user.avatar_url} displayName={user.display_name} size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">{user.display_name}</p>
          {user.username && <p className="text-xs text-ink-subtle truncate">@{user.username}</p>}
          {!user.username && user.email && (
            <p className="text-xs text-ink-subtle truncate">{user.email}</p>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-brand bg-brand-soft hover:bg-brand-soft ml-3"
        onClick={onSendRequest}
        disabled={isSending || isSent}
      >
        {isSent ? 'Pending' : isSending ? 'Sending...' : 'Add Friend'}
      </Button>
    </DetailCard>
  )
}
