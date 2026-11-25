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
  const trimmedQuery = query.trim()
  const debouncedQuery = useDebouncedValue(trimmedQuery, 300)
  const hasQuery = trimmedQuery.length >= 2
  const { data, isLoading, isError, error, refetch } = useUserSearch(debouncedQuery)
  const sendRequest = useSendFriendRequest()

  const users = hasQuery ? (data?.users ?? []) : []
  const isSearching = hasQuery && (isLoading || trimmedQuery !== debouncedQuery)

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
          aria-describedby="friend-search-hint"
        />
        <p id="friend-search-hint" className="text-ink-subtle mt-1.5 text-xs">
          {hasQuery ? 'Searching by name, username, and email.' : 'Type at least 2 characters.'}
        </p>
      </div>

      {isSearching && <div className="text-sm text-ink-subtle py-2">Searching...</div>}

      {hasQuery && !isSearching && isError && (
        <div className="flex flex-wrap items-center justify-between gap-2 py-2">
          <p className="text-destructive text-sm">
            Search failed{error?.message ? `: ${error.message}` : '.'}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {hasQuery && !isSearching && !isError && users.length === 0 && (
        <div className="text-sm text-ink-subtle py-2">No users found for “{trimmedQuery}”</div>
      )}

      {hasQuery && !isSearching && !isError && users.length > 0 && (
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

      {sendRequest.isError && (
        <p className="text-destructive text-xs" role="status">
          Couldn’t send the request: {sendRequest.error.message}
        </p>
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
