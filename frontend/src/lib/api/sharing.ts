/**
 * Sharing & collaboration API types and functions.
 * Profiles, friends, and resource shares.
 */
import { apiRequest, apiUpload } from './core'

// ============================================================================
// Types
// ============================================================================

export interface UserProfile {
  id: string
  user_id: string
  display_name: string
  username: string | null
  email: string | null
  avatar_url: string | null
  bio: string | null
  discoverable: boolean
  created_at: string
  updated_at: string
}

export interface Friendship {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'declined'
  requester_profile?: UserProfile
  addressee_profile?: UserProfile
  created_at: string
  updated_at: string
}

export interface ResourceShare {
  id: string
  owner_id: string
  shared_with_id: string
  resource_type: string
  permission: 'view' | 'edit'
  status: 'pending' | 'accepted' | 'declined' | 'revoked'
  owner_profile?: UserProfile
  shared_with_profile?: UserProfile
  created_at: string
  updated_at: string
}

export interface FriendsListResponse {
  friends: Friendship[]
}

export interface FriendRequestsResponse {
  requests: Friendship[]
}

export interface SentRequestsResponse {
  sent: Friendship[]
}

export interface SharesResponse {
  owned: ResourceShare[]
  received: ResourceShare[]
}

export interface ReceivedSharesResponse {
  received: ResourceShare[]
}

export interface UserSearchResponse {
  users: UserProfile[]
}

// ============================================================================
// Profile API Functions
// ============================================================================

export async function fetchMyProfile(): Promise<UserProfile> {
  return apiRequest<UserProfile>('GET', '/api/profile')
}

export async function updateProfile(data: {
  display_name?: string
  username?: string | null
  bio?: string
  discoverable?: boolean
}): Promise<UserProfile> {
  return apiRequest<UserProfile>('PUT', '/api/profile', { body: data })
}

export async function fetchUserProfile(userId: string): Promise<UserProfile> {
  return apiRequest<UserProfile>('GET', `/api/users/${userId}/profile`)
}

export async function uploadAvatar(file: File): Promise<UserProfile> {
  const formData = new FormData()
  formData.append('file', file)
  return apiUpload<UserProfile>('/api/profile/avatar', formData, 'PUT')
}

export async function deleteAvatar(): Promise<UserProfile> {
  return apiRequest<UserProfile>('DELETE', '/api/profile/avatar')
}

export async function checkUsernameAvailable(
  username: string
): Promise<{ available: boolean; reason?: string }> {
  return apiRequest<{ available: boolean; reason?: string }>(
    'GET',
    '/api/profile/username-available',
    { params: { username } }
  )
}

// ============================================================================
// Friends API Functions
// ============================================================================

export async function fetchFriends(): Promise<FriendsListResponse> {
  return apiRequest<FriendsListResponse>('GET', '/api/friends')
}

export async function fetchFriendRequests(): Promise<FriendRequestsResponse> {
  return apiRequest<FriendRequestsResponse>('GET', '/api/friends/requests')
}

export async function fetchSentRequests(): Promise<SentRequestsResponse> {
  return apiRequest<SentRequestsResponse>('GET', '/api/friends/sent')
}

export async function sendFriendRequest(userId: string): Promise<Friendship> {
  return apiRequest<Friendship>('POST', '/api/friends/request', {
    body: { user_id: userId },
  })
}

export async function acceptFriendRequest(friendshipId: string): Promise<Friendship> {
  return apiRequest<Friendship>('POST', `/api/friends/${friendshipId}/accept`)
}

export async function declineFriendRequest(friendshipId: string): Promise<Friendship> {
  return apiRequest<Friendship>('POST', `/api/friends/${friendshipId}/decline`)
}

export async function removeFriend(friendshipId: string): Promise<void> {
  await apiRequest<{ success: boolean }>('DELETE', `/api/friends/${friendshipId}`)
}

export async function searchUsers(query: string): Promise<UserSearchResponse> {
  return apiRequest<UserSearchResponse>('GET', '/api/friends/search', {
    params: { q: query },
  })
}

// ============================================================================
// Shares API Functions
// ============================================================================

export async function createShare(data: {
  shared_with_id: string
  resource_type: string
  permission: 'view' | 'edit'
}): Promise<ResourceShare> {
  return apiRequest<ResourceShare>('POST', '/api/shares', { body: data })
}

export async function fetchShares(): Promise<SharesResponse> {
  return apiRequest<SharesResponse>('GET', '/api/shares')
}

export async function fetchReceivedShares(): Promise<ReceivedSharesResponse> {
  return apiRequest<ReceivedSharesResponse>('GET', '/api/shares/received')
}

export async function acceptShare(shareId: string): Promise<ResourceShare> {
  return apiRequest<ResourceShare>('POST', `/api/shares/${shareId}/accept`)
}

export async function declineShare(shareId: string): Promise<ResourceShare> {
  return apiRequest<ResourceShare>('POST', `/api/shares/${shareId}/decline`)
}

export async function revokeShare(shareId: string): Promise<void> {
  await apiRequest<{ success: boolean }>('DELETE', `/api/shares/${shareId}`)
}
