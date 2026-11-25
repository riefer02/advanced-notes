import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  useShares,
  useReceivedShares,
  useCreateShare,
  useAcceptShare,
  useDeclineShare,
  useRevokeShare,
} from '../hooks/useSharing'
import { useFriends } from '../hooks/useFriends'
import type { ResourceShare, Friendship, UserProfile } from '../lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DetailCard } from '@/components/ui/detail'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type ShareResourceType = 'vinyl_library' | 'meal_calendar'

export default function ShareManager({
  currentUserId,
  resource,
}: {
  currentUserId: string
  resource?: ShareResourceType
}) {
  const {
    data: sharesData,
    isLoading: loadingShares,
    isError: sharesError,
    error: sharesErrorValue,
    refetch: refetchShares,
  } = useShares()
  const {
    data: receivedData,
    isError: receivedError,
    error: receivedErrorValue,
    refetch: refetchReceived,
  } = useReceivedShares()
  const {
    data: friendsData,
    isLoading: friendsLoading,
    isError: friendsError,
    refetch: refetchFriends,
  } = useFriends()

  const myShares = sharesData?.owned ?? []
  const sharedWithMe = sharesData?.received ?? []
  const received = receivedData?.received ?? []
  const friends = friendsData?.friends ?? []

  return (
    <div className="space-y-6">
      {/* Pending Share Invitations */}
      {receivedError && (
        <Alert variant="destructive" className="flex items-center justify-between">
          <AlertDescription className="text-[13px]">
            Couldn’t load pending invitations
            {receivedErrorValue?.message ? `: ${receivedErrorValue.message}` : '.'}
          </AlertDescription>
          <Button variant="ghost" size="sm" className="ml-3" onClick={() => void refetchReceived()}>
            Retry
          </Button>
        </Alert>
      )}
      {received.length > 0 && <PendingShareInvitations shares={received} />}

      {/* Create New Share */}
      <CreateShareSection
        friends={friends}
        currentUserId={currentUserId}
        initialResource={resource ?? 'vinyl_library'}
        friendsLoading={friendsLoading}
        friendsError={friendsError}
        onRetryFriends={() => void refetchFriends()}
      />

      {/* My Active Shares */}
      <SharesList
        title="My Shares"
        description="Resources you've shared with others"
        shares={myShares}
        isLoading={loadingShares}
        isError={sharesError}
        errorMessage={sharesErrorValue?.message}
        onRetry={() => void refetchShares()}
        emptyMessage="Nothing shared yet. Use the form above to share your vinyl library or meal calendar."
        showRecipient
        currentUserId={currentUserId}
      />

      {/* Shared With Me */}
      <SharesList
        title="Shared With Me"
        description="Resources others have shared with you"
        shares={sharedWithMe}
        isLoading={loadingShares}
        isError={sharesError}
        errorMessage={sharesErrorValue?.message}
        onRetry={() => void refetchShares()}
        emptyMessage="Nothing shared with you yet. When a friend shares something, it appears here."
        showOwner
        currentUserId={currentUserId}
      />
    </div>
  )
}

function PendingShareInvitations({ shares }: { shares: ResourceShare[] }) {
  const acceptShare = useAcceptShare()
  const declineShare = useDeclineShare()
  const actionError = acceptShare.error ?? declineShare.error

  return (
    <div>
      <h3 className="section-label mb-2.5">Pending invitations · {shares.length}</h3>
      <div className="space-y-2">
        {shares.map((share) => (
          <Alert key={share.id} variant="info" className="flex items-center justify-between">
            <AlertDescription className="min-w-0">
              <p className="text-sm font-medium text-ink truncate">
                {share.owner_profile?.display_name ?? 'Someone'} wants to share their{' '}
                {formatResourceType(share.resource_type)}
              </p>
              <p className="text-xs text-ink-subtle mt-0.5">Permission: {share.permission}</p>
            </AlertDescription>
            <div className="flex items-center gap-2 ml-3">
              <Button
                size="sm"
                onClick={() => acceptShare.mutate(share.id)}
                disabled={acceptShare.isPending || declineShare.isPending}
              >
                Accept
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => declineShare.mutate(share.id)}
                disabled={acceptShare.isPending || declineShare.isPending}
              >
                Decline
              </Button>
            </div>
          </Alert>
        ))}
      </div>
      {actionError && (
        <p className="text-destructive mt-2 text-xs" role="status">
          {actionError.message}
        </p>
      )}
    </div>
  )
}

function CreateShareSection({
  friends,
  currentUserId,
  initialResource,
  friendsLoading,
  friendsError,
  onRetryFriends,
}: {
  friends: Friendship[]
  currentUserId: string
  initialResource: ShareResourceType
  friendsLoading: boolean
  friendsError: boolean
  onRetryFriends: () => void
}) {
  const createShare = useCreateShare()
  const [selectedFriend, setSelectedFriend] = useState('')
  const [resourceType, setResourceType] = useState<ShareResourceType>(initialResource)
  const [permission, setPermission] = useState<'view' | 'edit'>('view')
  const [sharedWith, setSharedWith] = useState<string | null>(null)

  // The route can hand over a different resource while this component stays mounted.
  useEffect(() => {
    setResourceType(initialResource)
  }, [initialResource])

  const friendOptions = friends.map((f) => {
    const profile = f.requester_id === currentUserId ? f.addressee_profile : f.requester_profile
    const userId = f.requester_id === currentUserId ? f.addressee_id : f.requester_id
    return { userId, displayName: profile?.display_name ?? 'Unknown' }
  })

  const selectedFriendName = friendOptions.find((f) => f.userId === selectedFriend)?.displayName
  const resourceLabel = formatResourceType(resourceType)
  const permissionLabel = permission === 'view' ? 'view only' : 'can edit'

  const confirmation = selectedFriendName
    ? `Share your ${resourceLabel} with ${selectedFriendName} — ${permissionLabel}.`
    : `Choose a friend to share your ${resourceLabel} — ${permissionLabel}.`

  const handleCreate = () => {
    if (!selectedFriend) return
    const recipientName = selectedFriendName
    setSharedWith(null)
    createShare.mutate(
      { shared_with_id: selectedFriend, resource_type: resourceType, permission },
      {
        onSuccess: () => {
          setSelectedFriend('')
          setSharedWith(recipientName ?? null)
        },
      }
    )
  }

  return (
    <div>
      <h3 className="section-label mb-2.5">Share something</h3>
      <DetailCard className="space-y-3 p-4">
        {friendsError ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-destructive text-xs">Couldn’t load your friends.</p>
            <Button variant="outline" size="sm" onClick={onRetryFriends}>
              Retry
            </Button>
          </div>
        ) : friendsLoading ? (
          <p className="text-ink-subtle text-xs">Loading friends…</p>
        ) : friendOptions.length === 0 ? (
          <p className="text-ink-subtle text-xs">
            Add a friend on the Friends tab before sharing anything.
          </p>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            value={resourceType}
            onValueChange={(v) => {
              setResourceType(v as ShareResourceType)
              setSharedWith(null)
            }}
          >
            <SelectTrigger aria-label="What to share">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vinyl_library">Vinyl Library</SelectItem>
              <SelectItem value="meal_calendar">Meal Calendar</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={selectedFriend || '__none__'}
            onValueChange={(v) => {
              setSelectedFriend(v === '__none__' ? '' : v)
              setSharedWith(null)
            }}
          >
            <SelectTrigger aria-label="Friend">
              <SelectValue placeholder="Select friend..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select friend...</SelectItem>
              {friendOptions.map((f) => (
                <SelectItem key={f.userId} value={f.userId}>
                  {f.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={permission}
            onValueChange={(v) => {
              setPermission(v as 'view' | 'edit')
              setSharedWith(null)
            }}
          >
            <SelectTrigger aria-label="Permission">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="view">View only</SelectItem>
              <SelectItem value="edit">Can edit</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-ink-muted text-[13px] leading-5" aria-live="polite">
          {confirmation}
        </p>

        <Button onClick={handleCreate} disabled={!selectedFriend || createShare.isPending}>
          {createShare.isPending ? 'Sharing...' : 'Share'}
        </Button>

        {createShare.isError && (
          <p className="text-xs text-destructive" role="status">
            {createShare.error.message}
          </p>
        )}
        {sharedWith && !createShare.isError && (
          <p className="text-positive text-xs" role="status">
            Shared your {resourceLabel} with {sharedWith}.
          </p>
        )}
      </DetailCard>
    </div>
  )
}

function SharesList({
  title,
  description,
  shares,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  emptyMessage,
  showOwner,
  showRecipient,
  currentUserId,
}: {
  title: string
  description: string
  shares: ResourceShare[]
  isLoading: boolean
  isError?: boolean
  errorMessage?: string
  onRetry?: () => void
  emptyMessage: string
  showOwner?: boolean
  showRecipient?: boolean
  currentUserId: string
}) {
  const revokeShare = useRevokeShare()
  const [pendingRevoke, setPendingRevoke] = useState<ResourceShare | null>(null)

  const pendingIsOwned = pendingRevoke?.owner_id === currentUserId
  const pendingRecipient = pendingRevoke
    ? (pendingIsOwned ? pendingRevoke.shared_with_profile : pendingRevoke.owner_profile)
        ?.display_name
    : undefined

  return (
    <div>
      <h3 className="section-label">{title}</h3>
      <p className="text-ink-subtle mt-1 mb-2.5 text-xs">{description}</p>

      {isLoading ? (
        <div className="text-ink-subtle rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px]">
          Loading shares…
        </div>
      ) : isError ? (
        <div className="border-line rounded-xl border border-dashed px-4 py-5 text-center">
          <p className="text-destructive text-[13px]">
            Couldn’t load this list{errorMessage ? `: ${errorMessage}` : '.'}
          </p>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      ) : shares.length === 0 ? (
        <div className="text-ink-subtle border-line rounded-xl border border-dashed px-4 py-5 text-[13px]">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-2">
          {shares.map((share) => {
            const person = showOwner
              ? share.owner_profile
              : showRecipient
                ? share.shared_with_profile
                : undefined

            return (
              <ShareCard
                key={share.id}
                share={share}
                personProfile={person}
                onRevoke={() => setPendingRevoke(share)}
                isRevoking={revokeShare.isPending && revokeShare.variables === share.id}
                isOwner={share.owner_id === currentUserId}
              />
            )
          })}
        </div>
      )}

      {revokeShare.isError && (
        <p className="text-destructive mt-2 text-xs" role="status">
          {revokeShare.error.message}
        </p>
      )}

      <ConfirmDialog
        open={!!pendingRevoke}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(null)
        }}
        title={pendingIsOwned ? 'Revoke this share?' : 'Leave this share?'}
        description={
          pendingRevoke
            ? pendingIsOwned
              ? `${pendingRecipient ?? 'This person'} will lose access to your ${formatResourceType(pendingRevoke.resource_type)}.`
              : `Your access to this ${formatResourceType(pendingRevoke.resource_type)} will be removed.`
            : undefined
        }
        confirmLabel={pendingIsOwned ? 'Revoke' : 'Leave'}
        variant="destructive"
        pending={revokeShare.isPending}
        onConfirm={async () => {
          if (!pendingRevoke) return
          try {
            await revokeShare.mutateAsync(pendingRevoke.id)
          } catch {
            // The mutation error is surfaced above the list.
          }
        }}
      />
    </div>
  )
}

function getShareViewLink(
  share: ResourceShare
): { to: string; search: Record<string, string> } | null {
  if (share.status !== 'accepted') return null
  if (share.resource_type === 'vinyl_library') {
    return { to: '/vinyl', search: { owner: share.owner_id } }
  }
  if (share.resource_type === 'meal_calendar') {
    return { to: '/meals', search: { calendar_owner: share.owner_id } }
  }
  return null
}

function ShareCard({
  share,
  personProfile,
  onRevoke,
  isRevoking,
  isOwner,
}: {
  share: ResourceShare
  personProfile: UserProfile | undefined
  onRevoke: () => void
  isRevoking: boolean
  isOwner: boolean
}) {
  const viewLink = !isOwner ? getShareViewLink(share) : null

  return (
    <DetailCard className="flex items-center justify-between p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink truncate">
          {formatResourceType(share.resource_type)}
          {personProfile && (
            <span className="text-ink-subtle font-normal">
              {' '}
              {isOwner
                ? `shared with ${personProfile.display_name}`
                : `from ${personProfile.display_name}`}
            </span>
          )}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-ink-subtle capitalize">{share.permission}</span>
          <Badge
            variant={
              share.status === 'accepted'
                ? 'success'
                : share.status === 'pending'
                  ? 'warning'
                  : 'neutral'
            }
          >
            {share.status}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-3">
        {viewLink && (
          <Link
            to={viewLink.to}
            search={viewLink.search}
            className="text-brand hover:bg-brand-soft focus-visible:ring-ring rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            Open
          </Link>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onRevoke}
          disabled={isRevoking}
          className="text-destructive hover:text-destructive hover:bg-danger-soft"
        >
          {isOwner ? 'Revoke' : 'Leave'}
        </Button>
      </div>
    </DetailCard>
  )
}

function formatResourceType(type: string): string {
  switch (type) {
    case 'vinyl_library':
      return 'Vinyl Library'
    case 'meal_calendar':
      return 'Meal Calendar'
    default:
      return type
  }
}
