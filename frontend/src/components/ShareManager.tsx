import { useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function ShareManager({ currentUserId }: { currentUserId: string }) {
  const { data: sharesData, isLoading: loadingShares } = useShares()
  const { data: receivedData, isLoading: loadingReceived } = useReceivedShares()
  const { data: friendsData } = useFriends()

  const myShares = sharesData?.owned ?? []
  const sharedWithMe = sharesData?.received ?? []
  const received = receivedData?.received ?? []
  const friends = friendsData?.friends ?? []

  return (
    <div className="space-y-6">
      {/* Pending Share Invitations */}
      {received.length > 0 && <PendingShareInvitations shares={received} />}

      {/* Create New Share */}
      <CreateShareSection friends={friends} currentUserId={currentUserId} />

      {/* My Active Shares */}
      <SharesList
        title="My Shares"
        description="Resources you've shared with others"
        shares={myShares}
        isLoading={loadingShares}
        showRecipient
        currentUserId={currentUserId}
      />

      {/* Shared With Me */}
      <SharesList
        title="Shared With Me"
        description="Resources others have shared with you"
        shares={sharedWithMe}
        isLoading={loadingReceived}
        showOwner
        currentUserId={currentUserId}
      />
    </div>
  )
}

function PendingShareInvitations({ shares }: { shares: ResourceShare[] }) {
  const acceptShare = useAcceptShare()
  const declineShare = useDeclineShare()

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
    </div>
  )
}

function CreateShareSection({
  friends,
  currentUserId,
}: {
  friends: Friendship[]
  currentUserId: string
}) {
  const createShare = useCreateShare()
  const [selectedFriend, setSelectedFriend] = useState('')
  const [resourceType, setResourceType] = useState('vinyl_library')
  const [permission, setPermission] = useState<'view' | 'edit'>('view')

  const friendOptions = friends.map((f) => {
    const profile = f.requester_id === currentUserId ? f.addressee_profile : f.requester_profile
    const userId = f.requester_id === currentUserId ? f.addressee_id : f.requester_id
    return { userId, displayName: profile?.display_name ?? 'Unknown' }
  })

  const handleCreate = () => {
    if (!selectedFriend) return
    createShare.mutate(
      { shared_with_id: selectedFriend, resource_type: resourceType, permission },
      {
        onSuccess: () => {
          setSelectedFriend('')
        },
      }
    )
  }

  return (
    <div>
      <h3 className="section-label mb-2.5">Share something</h3>
      <DetailCard className="space-y-3 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            value={selectedFriend || '__none__'}
            onValueChange={(v) => setSelectedFriend(v === '__none__' ? '' : v)}
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
          <Select value={resourceType} onValueChange={(v) => setResourceType(v)}>
            <SelectTrigger aria-label="What to share">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vinyl_library">Vinyl Library</SelectItem>
              <SelectItem value="meal_calendar">Meal Calendar</SelectItem>
            </SelectContent>
          </Select>
          <Select value={permission} onValueChange={(v) => setPermission(v as 'view' | 'edit')}>
            <SelectTrigger aria-label="Permission">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="view">View only</SelectItem>
              <SelectItem value="edit">Can edit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleCreate} disabled={!selectedFriend || createShare.isPending}>
          {createShare.isPending ? 'Sharing...' : 'Share'}
        </Button>
        {createShare.isError && (
          <p className="text-xs text-destructive">{createShare.error.message}</p>
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
  showOwner,
  showRecipient,
  currentUserId,
}: {
  title: string
  description: string
  shares: ResourceShare[]
  isLoading: boolean
  showOwner?: boolean
  showRecipient?: boolean
  currentUserId: string
}) {
  const revokeShare = useRevokeShare()

  if (isLoading) {
    return (
      <div>
        <h3 className="section-label">{title}</h3>
        <p className="text-ink-subtle mt-1 mb-2.5 text-xs">{description}</p>
        <div className="text-ink-subtle rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px]">
          Loading shares…
        </div>
      </div>
    )
  }

  return (
    <div>
      <h3 className="section-label">{title}</h3>
      <p className="text-ink-subtle mt-1 mb-2.5 text-xs">{description}</p>
      {shares.length === 0 ? (
        <div className="text-ink-subtle border-line rounded-xl border border-dashed px-4 py-5 text-[13px]">
          Nothing here yet.
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
                onRevoke={() => revokeShare.mutate(share.id)}
                isRevoking={revokeShare.isPending}
                isOwner={share.owner_id === currentUserId}
              />
            )
          })}
        </div>
      )}
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
