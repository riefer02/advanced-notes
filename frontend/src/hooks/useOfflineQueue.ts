import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'

import { createNote, transcribeAudio } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import {
  enqueueOfflineItem,
  ensureQueueLoaded,
  getQueueItemsForUser,
  getQueuePersistence,
  normalizeNotePayload,
  removeOfflineItem,
  subscribeToQueue,
  type OfflineAudioPayload,
  type OfflineNotePayload,
  type OfflineQueueItem,
} from '../lib/offline-queue'

const EMPTY_ITEMS: readonly OfflineQueueItem[] = Object.freeze([])

interface UserSyncState {
  isSyncing: boolean
  lastError: string | null
  lastSyncAt: number | null
}

const DEFAULT_SYNC_STATE: UserSyncState = Object.freeze({
  isSyncing: false,
  lastError: null,
  lastSyncAt: null,
})

const syncStates = new Map<string, UserSyncState>()
const syncListeners = new Set<() => void>()
const activeReplays = new Map<string, Promise<void>>()

function emitSync(): void {
  for (const listener of syncListeners) listener()
}

function subscribeToSync(listener: () => void): () => void {
  syncListeners.add(listener)
  return () => {
    syncListeners.delete(listener)
  }
}

function getSyncState(userId: string | null | undefined): UserSyncState {
  if (!userId) return DEFAULT_SYNC_STATE
  return syncStates.get(userId) ?? DEFAULT_SYNC_STATE
}

function patchSyncState(userId: string, patch: Partial<UserSyncState>): void {
  syncStates.set(userId, { ...getSyncState(userId), ...patch })
  emitSync()
}

function getOnlineSnapshot(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

function subscribeToOnline(listener: () => void): () => void {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

/** Shared browser connectivity state for offline-aware UI. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeToOnline, getOnlineSnapshot, () => true)
}

function invalidateReplayedQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.notes.all })
  void queryClient.invalidateQueries({ queryKey: queryKeys.notes.detailPrefix })
  void queryClient.invalidateQueries({ queryKey: queryKeys.notes.searchPrefix })
  void queryClient.invalidateQueries({ queryKey: queryKeys.folders.all })
  void queryClient.invalidateQueries({ queryKey: queryKeys.tags.all })
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
}

async function replayAudio(payload: OfflineAudioPayload): Promise<void> {
  // IndexedDB normally preserves the Blob type, but Safari has been known to
  // drop it when a stored Blob is rehydrated. Rebuild only when needed.
  const storedBlob =
    payload.blob instanceof Blob
      ? payload.blob
      : new Blob([payload.blob as BlobPart], { type: payload.mimeType })
  const blob =
    storedBlob.type || !payload.mimeType
      ? storedBlob
      : new Blob([storedBlob], { type: payload.mimeType })

  await transcribeAudio(blob)
}

async function runReplay(userId: string, queryClient: QueryClient): Promise<void> {
  await ensureQueueLoaded()

  // Always re-read from the store: another tab, another component, or a late
  // IndexedDB load could have changed the queue since the caller decided to
  // retry. The user filter is the cross-account safety boundary.
  const pending = getQueueItemsForUser(userId).filter((item) => item.userId === userId)
  if (pending.length === 0) {
    patchSyncState(userId, { isSyncing: false, lastError: null })
    return
  }

  patchSyncState(userId, { isSyncing: true, lastError: null })

  try {
    for (const item of pending) {
      // The item may have been cleared (sign-out, another tab) mid-replay.
      if (!getQueueItemsForUser(userId).some((current) => current.id === item.id)) continue

      if (item.kind === 'note') {
        await createNote({
          title: item.payload.title,
          content: item.payload.content,
          folder_path: item.payload.folder_path,
          tags: item.payload.tags,
        })
      } else {
        await replayAudio(item.payload)
      }

      // Remove only after the server accepted it, so a crash or offline blip
      // cannot silently discard a capture.
      await removeOfflineItem(item.id)
    }

    invalidateReplayedQueries(queryClient)
    patchSyncState(userId, {
      isSyncing: false,
      lastError: null,
      lastSyncAt: Date.now(),
    })
  } catch (error) {
    // Stop at the first failure to preserve capture order. The item stays in
    // the queue and the banner offers an explicit retry.
    patchSyncState(userId, {
      isSyncing: false,
      lastError:
        error instanceof Error && error.message ? error.message : 'Sync failed. Try again.',
    })
  }
}

function requestReplay(userId: string, queryClient: QueryClient): Promise<void> {
  const inFlight = activeReplays.get(userId)
  if (inFlight) return inFlight

  const promise = runReplay(userId, queryClient).finally(() => {
    activeReplays.delete(userId)
  })
  activeReplays.set(userId, promise)
  return promise
}

export interface UseOfflineQueueResult {
  items: readonly OfflineQueueItem[]
  pendingCount: number
  isSyncing: boolean
  lastError: string | null
  lastSyncAt: number | null
  persistence: 'indexeddb' | 'memory'
  isOnline: boolean
  retry: () => Promise<void>
  enqueueNote: (payload: OfflineNotePayload) => Promise<void>
  enqueueAudio: (payload: OfflineAudioPayload) => Promise<void>
}

/**
 * Per-user offline captures with automatic replay.
 *
 * Replay runs on mount while online and whenever the browser reconnects. It is
 * serial, removes each capture only after the server accepts it, and never
 * touches another user's queue.
 */
export function useOfflineQueue(userId: string | null | undefined): UseOfflineQueueResult {
  const queryClient = useQueryClient()
  const isOnline = useOnlineStatus()

  const items = useSyncExternalStore(
    subscribeToQueue,
    () => getQueueItemsForUser(userId),
    () => EMPTY_ITEMS
  )
  const persistence = useSyncExternalStore(
    subscribeToQueue,
    getQueuePersistence,
    () => 'memory' as const
  )
  const syncState = useSyncExternalStore(
    subscribeToSync,
    () => getSyncState(userId),
    () => DEFAULT_SYNC_STATE
  )

  // Replayed automatically on app mount and on reconnect. Enqueueing while
  // offline does not trigger an immediate retry loop against a dead network.
  useEffect(() => {
    if (!userId || !isOnline) return
    void requestReplay(userId, queryClient)
  }, [userId, isOnline, queryClient])

  const retry = useCallback(async () => {
    if (!userId) return
    await requestReplay(userId, queryClient)
  }, [userId, queryClient])

  const enqueueNote = useCallback(
    async (payload: OfflineNotePayload) => {
      if (!userId) throw new Error('Sign in to save notes on this device.')
      await enqueueOfflineItem({
        userId,
        kind: 'note',
        payload: normalizeNotePayload(payload),
      })
    },
    [userId]
  )

  const enqueueAudio = useCallback(
    async (payload: OfflineAudioPayload) => {
      if (!userId) throw new Error('Sign in to save recordings on this device.')
      await enqueueOfflineItem({ userId, kind: 'audio', payload })
    },
    [userId]
  )

  return useMemo(
    () => ({
      items,
      pendingCount: items.length,
      isSyncing: syncState.isSyncing,
      lastError: syncState.lastError,
      lastSyncAt: syncState.lastSyncAt,
      persistence,
      isOnline,
      retry,
      enqueueNote,
      enqueueAudio,
    }),
    [items, syncState, persistence, isOnline, retry, enqueueNote, enqueueAudio]
  )
}
