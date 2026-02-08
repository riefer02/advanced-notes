import { useState } from 'react'
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

export default function ShareManager({ currentUserId }: { currentUserId: string }) {
  const { data: sharesData, isLoading: loadingShares } = useShares()
  const { data: receivedData, isLoading: loadingReceived } = useReceivedShares()
  const { data: friendsData } = useFriends()

  const myShares = sharesData?.owned ?? []
  const sharedWithMe = sharesData?.received ?? []
  const received = receivedData?.received ?? []
  const friends = friendsData?.friends ?? []

  return (
    <div className="space-y-8">
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
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        Pending Invitations ({shares.length})
      </h3>
      <div className="space-y-2">
        {shares.map((share) => (
          <div
            key={share.id}
            className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {share.owner_profile?.display_name ?? 'Someone'} wants to share their{' '}
                {formatResourceType(share.resource_type)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Permission: {share.permission}</p>
            </div>
            <div className="flex items-center gap-2 ml-3">
              <button
                type="button"
                onClick={() => acceptShare.mutate(share.id)}
                disabled={acceptShare.isPending || declineShare.isPending}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => declineShare.mutate(share.id)}
                disabled={acceptShare.isPending || declineShare.isPending}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                Decline
              </button>
            </div>
          </div>
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
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Share Something</h3>
      <div className="p-4 bg-white border border-gray-200 rounded-lg space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select
            value={selectedFriend}
            onChange={(e) => setSelectedFriend(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">Select friend...</option>
            {friendOptions.map((f) => (
              <option key={f.userId} value={f.userId}>
                {f.displayName}
              </option>
            ))}
          </select>
          <select
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="vinyl_library">Vinyl Library</option>
            <option value="meal_calendar">Meal Calendar</option>
          </select>
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value as 'view' | 'edit')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="view">View only</option>
            <option value="edit">Can edit</option>
          </select>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!selectedFriend || createShare.isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {createShare.isPending ? 'Sharing...' : 'Share'}
        </button>
        {createShare.isError && <p className="text-xs text-red-600">{createShare.error.message}</p>}
      </div>
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
        <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-xs text-gray-500 mb-3">{description}</p>
        <div className="text-sm text-gray-500 py-4">Loading...</div>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 mb-3">{description}</p>
      {shares.length === 0 ? (
        <div className="text-sm text-gray-400 py-2">None yet</div>
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
  return (
    <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {formatResourceType(share.resource_type)}
          {personProfile && (
            <span className="text-gray-500 font-normal">
              {' '}
              {isOwner
                ? `shared with ${personProfile.display_name}`
                : `from ${personProfile.display_name}`}
            </span>
          )}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-500 capitalize">{share.permission}</span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full ${
              share.status === 'accepted'
                ? 'bg-green-100 text-green-700'
                : share.status === 'pending'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            {share.status}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onRevoke}
        disabled={isRevoking}
        className="ml-3 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md disabled:opacity-50 transition-colors"
      >
        {isOwner ? 'Revoke' : 'Leave'}
      </button>
    </div>
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
