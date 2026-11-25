import { useState } from 'react'
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
import { DetailCard } from '@/components/ui/detail'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export default function FriendsList({ currentUserId }: { currentUserId: string }) {
  const {
    data: friendsData,
    isLoading: loadingFriends,
    isError: friendsError,
    error: friendsErrorValue,
    refetch: refetchFriends,
  } = useFriends()
  const {
    data: requestsData,
    isLoading: loadingRequests,
    isError: requestsError,
    refetch: refetchRequests,
  } = useFriendRequests()
  const acceptRequest = useAcceptFriendRequest()
  const declineRequest = useDeclineFriendRequest()
  const removeFriend = useRemoveFriend()
  const [friendToRemove, setFriendToRemove] = useState<{ id: string; name: string } | null>(null)

  const friends = friendsData?.friends ?? []
  const requests = requestsData?.requests ?? []
  const requestError = acceptRequest.error ?? declineRequest.error

  return (
    <div className="space-y-6">
      {/* Pending Requests */}
      {requestsError ? (
        <Alert variant="destructive" className="flex items-center justify-between">
          <AlertDescription className="text-[13px]">
            Couldn’t load friend requests.
          </AlertDescription>
          <Button variant="ghost" size="sm" className="ml-3" onClick={() => void refetchRequests()}>
            Retry
          </Button>
        </Alert>
      ) : requests.length > 0 ? (
        <div>
          <h3 className="section-label mb-2.5">Pending requests · {requests.length}</h3>
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
          {requestError && (
            <p className="text-destructive mt-2 text-xs" role="status">
              {requestError.message}
            </p>
          )}
        </div>
      ) : null}

      {/* Friends List */}
      <div>
        <h3 className="section-label mb-2.5">
          Friends{!loadingFriends && !friendsError && ` · ${friends.length}`}
        </h3>

        {loadingFriends || loadingRequests ? (
          <div className="text-ink-subtle rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px]">
            Loading friends…
          </div>
        ) : friendsError ? (
          <div className="border-line rounded-xl border border-dashed px-4 py-6 text-center">
            <p className="text-destructive text-[13px]">
              Couldn’t load your friends
              {friendsErrorValue?.message ? `: ${friendsErrorValue.message}` : '.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void refetchFriends()}
            >
              Retry
            </Button>
          </div>
        ) : friends.length === 0 ? (
          <div className="border-line bg-surface-muted/30 rounded-xl border border-dashed px-4 py-8 text-center">
            <p className="text-ink text-[13px] font-medium">No friends yet</p>
            <p className="text-ink-subtle mt-1 text-xs">Use the search above to find people.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {friends.map((friendship) => {
              const friend = getFriendProfile(friendship, currentUserId)
              return (
                <FriendCard
                  key={friendship.id}
                  profile={friend}
                  onRemove={() =>
                    setFriendToRemove({
                      id: friendship.id,
                      name: friend?.display_name ?? 'this friend',
                    })
                  }
                  isRemoving={removeFriend.isPending && removeFriend.variables === friendship.id}
                />
              )
            })}
          </div>
        )}

        {removeFriend.isError && (
          <p className="text-destructive mt-2 text-xs" role="status">
            {removeFriend.error.message}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={!!friendToRemove}
        onOpenChange={(open) => {
          if (!open) setFriendToRemove(null)
        }}
        title={friendToRemove ? `Remove ${friendToRemove.name}?` : 'Remove friend?'}
        description="They’ll be removed from your friends list, and any shares between you will be revoked."
        confirmLabel="Remove"
        variant="destructive"
        pending={removeFriend.isPending}
        onConfirm={async () => {
          if (!friendToRemove) return
          try {
            await removeFriend.mutateAsync(friendToRemove.id)
          } catch {
            // The mutation error is surfaced above the list.
          }
        }}
      />
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
    <Alert variant="warning" className="flex items-center justify-between">
      <AlertDescription className="flex items-center gap-3 min-w-0">
        <UserAvatar
          avatarUrl={profile?.avatar_url}
          displayName={profile?.display_name ?? 'Unknown'}
          size="sm"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">
            {profile?.display_name ?? 'Unknown user'}
          </p>
          {profile?.username && (
            <p className="text-xs text-ink-subtle truncate">@{profile.username}</p>
          )}
        </div>
      </AlertDescription>
      <div className="flex items-center gap-2 ml-3">
        <Button size="sm" onClick={onAccept} disabled={isAccepting || isDeclining}>
          Accept
        </Button>
        <Button variant="ghost" size="sm" onClick={onDecline} disabled={isAccepting || isDeclining}>
          Decline
        </Button>
      </div>
    </Alert>
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
    <DetailCard className="flex items-center justify-between p-3">
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar
          avatarUrl={profile?.avatar_url}
          displayName={profile?.display_name ?? 'Unknown'}
          size="sm"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">
            {profile?.display_name ?? 'Unknown user'}
          </p>
          {profile?.username ? (
            <p className="text-xs text-ink-subtle truncate">@{profile.username}</p>
          ) : (
            profile?.bio && <p className="text-xs text-ink-subtle truncate mt-0.5">{profile.bio}</p>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        disabled={isRemoving}
        className="ml-3 text-destructive hover:text-destructive hover:bg-danger-soft"
      >
        {isRemoving ? 'Removing…' : 'Remove'}
      </Button>
    </DetailCard>
  )
}
