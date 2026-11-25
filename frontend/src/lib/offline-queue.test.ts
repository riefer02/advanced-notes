import { describe, expect, it } from 'vitest'

import {
  audioFilename,
  clearQueueForUser,
  createOfflineQueueItem,
  enqueueOfflineItem,
  getQueueItemsForUser,
  getQueuePersistence,
  isNetworkUnreachableError,
  isOfflineQueueItem,
  normalizeNotePayload,
  removeOfflineItem,
} from './offline-queue'

describe('normalizeNotePayload', () => {
  it('trims fields, defaults the folder, and normalises tags', () => {
    expect(
      normalizeNotePayload({
        title: '  Morning pages  ',
        content: '  A thought worth keeping.  ',
        tags: ['  Ideas ', 'ideas', '', 'PERSONAL', 'personal'],
      })
    ).toEqual({
      title: 'Morning pages',
      content: 'A thought worth keeping.',
      folder_path: 'inbox',
      tags: ['ideas', 'personal'],
    })
  })

  it('omits an empty title and keeps an explicit folder', () => {
    expect(
      normalizeNotePayload({
        title: '   ',
        content: 'Body',
        folder_path: 'journal/2026',
        tags: [],
      })
    ).toEqual({
      title: undefined,
      content: 'Body',
      folder_path: 'journal/2026',
      tags: [],
    })
  })
})

describe('isNetworkUnreachableError', () => {
  it('recognises the API client connection failure', () => {
    expect(
      isNetworkUnreachableError(
        new Error('Cannot reach the server. Check your connection and try again.')
      )
    ).toBe(true)
  })

  it('does not queue validation, auth, or unrelated failures', () => {
    expect(isNetworkUnreachableError(new Error('Title is required'))).toBe(false)
    expect(
      isNetworkUnreachableError(new Error('Your session expired. Please sign in again.'))
    ).toBe(false)
    expect(isNetworkUnreachableError('Cannot reach the server')).toBe(false)
    expect(isNetworkUnreachableError(null)).toBe(false)
  })
})

describe('offline queue items', () => {
  it('creates a note item scoped to the user', () => {
    const item = createOfflineQueueItem({
      userId: 'user_123',
      kind: 'note',
      payload: { content: 'Hello' },
    })

    expect(item.kind).toBe('note')
    expect(item.userId).toBe('user_123')
    expect(item.id).toBeTruthy()
    expect(item.createdAt).toBeGreaterThan(0)
    expect(isOfflineQueueItem(item)).toBe(true)
  })

  it('rejects malformed or partially written records', () => {
    expect(isOfflineQueueItem(null)).toBe(false)
    expect(isOfflineQueueItem({ id: 'x', userId: 'u', kind: 'note' })).toBe(false)
    expect(
      isOfflineQueueItem({ id: 'x', userId: 'u', kind: 'note', createdAt: 1, payload: {} })
    ).toBe(false)
    expect(
      isOfflineQueueItem({ id: 'x', userId: 'u', kind: 'audio', createdAt: 1, payload: {} })
    ).toBe(false)
    expect(
      isOfflineQueueItem({ id: 'x', userId: 'u', kind: 'video', createdAt: 1, payload: {} })
    ).toBe(false)
  })

  it('accepts a stored audio item', () => {
    expect(
      isOfflineQueueItem({
        id: 'x',
        userId: 'u',
        kind: 'audio',
        createdAt: 1,
        payload: { blob: new Blob(['x']), filename: 'clip.webm', mimeType: 'audio/webm' },
      })
    ).toBe(true)
  })
})

describe('audioFilename', () => {
  it('maps mime types to download extensions', () => {
    expect(audioFilename('audio/webm;codecs=opus')).toBe('chisos-recording.webm')
    expect(audioFilename('audio/mp4')).toBe('chisos-recording.mp4')
    expect(audioFilename('audio/mpeg')).toBe('chisos-recording.mp3')
    expect(audioFilename('application/octet-stream')).toBe('chisos-recording.webm')
  })

  it('honours a custom prefix', () => {
    expect(audioFilename('audio/wav', 'memo')).toBe('memo.wav')
  })
})

describe('in-memory queue (IndexedDB unavailable in jsdom)', () => {
  it('scopes captures per user and supports remove and clear', async () => {
    const note = await enqueueOfflineItem({
      userId: 'queue-test-a',
      kind: 'note',
      payload: { content: 'First thought' },
    })
    await enqueueOfflineItem({
      userId: 'queue-test-b',
      kind: 'note',
      payload: { content: 'Someone else' },
    })

    expect(getQueuePersistence()).toBe('memory')
    expect(getQueueItemsForUser('queue-test-a')).toHaveLength(1)
    expect(getQueueItemsForUser('queue-test-b')).toHaveLength(1)
    expect(getQueueItemsForUser(null)).toHaveLength(0)

    await removeOfflineItem(note.id)
    expect(getQueueItemsForUser('queue-test-a')).toHaveLength(0)

    await clearQueueForUser('queue-test-b')
    expect(getQueueItemsForUser('queue-test-b')).toHaveLength(0)
  })
})
