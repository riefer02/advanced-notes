import {
  useFriends,
  useFriendRequests,
  useAcceptFriendRequest,
  useDeclineFriendRequest,
  useRemoveFriend,
} from '../hooks/useFriends'
import type { Friendship, UserProfile } from '../lib/api'
import UserAvatar from './UserAvatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function FriendsList({ currentUserId }: { currentUserId: string }) {
  const { data: friendsData, isLoading: loadingFriends } = useFriends()
  const { data: requestsData, isLoading: loadingRequests } = useFriendRequests()
  const acceptRequest = useAcceptFriendRequest()
  const declineRequest = useDeclineFriendRequest()
  const removeFriend = useRemoveFriend()

  const friends = friendsData?.friends ?? []
  const requests = requestsData?.requests ?? []

  return (
    <div className="space-y-8">
      {/* Pending Requests */}
      {requests.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Pending Requests ({requests.length})
          </h3>
          <div className="space-y-2">
            {requests.map((req) => (
              <RequestCard
                key={req.id}
                friendship={req}
                onAccept={() => acceptRequest.mutate(req.id)}
                onDecline={() => declineRequest.mutate(req.id)}
                isAccepting={acceptRequest.isPending}
                isDeclining={declineRequest.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Friends List */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Friends {!loadingFriends && `(${friends.length})`}
        </h3>

        {loadingFriends || loadingRequests ? (
          <div className="text-sm text-gray-500 py-4">Loading...</div>
        ) : friends.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">No friends yet</p>
            <p className="text-xs text-gray-400 mt-1">Use the search above to find people</p>
          </div>
        ) : (
          <div className="space-y-2">
            {friends.map((friendship) => {
              const friend = getFriendProfile(friendship, currentUserId)
              return (
                <FriendCard
                  key={friendship.id}
                  profile={friend}
                  onRemove={() => removeFriend.mutate(friendship.id)}
                  isRemoving={removeFriend.isPending}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function getFriendProfile(friendship: Friendship, currentUserId: string): UserProfile | undefined {
  if (friendship.requester_id === currentUserId) {
    return friendship.addressee_profile
  }
  return friendship.requester_profile
}

function RequestCard({
  friendship,
  onAccept,
  onDecline,
  isAccepting,
  isDeclining,
}: {
  friendship: Friendship
  onAccept: () => void
  onDecline: () => void
  isAccepting: boolean
  isDeclining: boolean
}) {
  const profile = friendship.requester_profile

  return (
    <div className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar
          avatarUrl={profile?.avatar_url}
          displayName={profile?.display_name ?? 'Unknown'}
          size="sm"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {profile?.display_name ?? 'Unknown user'}
          </p>
          {profile?.username && (
            <p className="text-xs text-gray-500 truncate">@{profile.username}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-3">
        <Button size="sm" onClick={onAccept} disabled={isAccepting || isDeclining}>
          Accept
        </Button>
        <Button variant="ghost" size="sm" onClick={onDecline} disabled={isAccepting || isDeclining}>
          Decline
        </Button>
      </div>
    </div>
  )
}

function FriendCard({
  profile,
  onRemove,
  isRemoving,
}: {
  profile: UserProfile | undefined
  onRemove: () => void
  isRemoving: boolean
}) {
  return (
    <Card className="flex items-center justify-between p-3">
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar
          avatarUrl={profile?.avatar_url}
          displayName={profile?.display_name ?? 'Unknown'}
          size="sm"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {profile?.display_name ?? 'Unknown user'}
          </p>
          {profile?.username ? (
            <p className="text-xs text-gray-500 truncate">@{profile.username}</p>
          ) : (
            profile?.bio && <p className="text-xs text-gray-500 truncate mt-0.5">{profile.bio}</p>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        disabled={isRemoving}
        className="ml-3 text-red-600 hover:text-red-700 hover:bg-red-50"
      >
        Remove
      </Button>
    </Card>
  )
}
