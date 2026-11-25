/**
 * Durable, per-user offline capture queue for notes and audio.
 *
 * The queue lives in IndexedDB when the browser supports it so captures
 * survive a reload. When IndexedDB is unavailable (private mode, storage
 * blocked, quota errors) we keep items in memory for the session and expose
 * that fact to the UI instead of silently dropping writes.
 *
 * The in-memory snapshot is the source of truth for rendering. IndexedDB is a
 * persistence layer behind it: every mutation updates the snapshot first, then
 * best-effort mirrors the change to storage.
 */

import { AUDIO_MIME_TO_EXT } from './api/core'

export type OfflineQueueKind = 'note' | 'audio'
export type QueuePersistence = 'indexeddb' | 'memory'

export interface OfflineNotePayload {
  title?: string
  content: string
  folder_path?: string
  tags?: string[]
}

export interface OfflineAudioPayload {
  blob: Blob
  filename: string
  mimeType: string
}

interface OfflineQueueItemBase {
  id: string
  userId: string
  createdAt: number
}

export interface OfflineNoteItem extends OfflineQueueItemBase {
  kind: 'note'
  payload: OfflineNotePayload
}

export interface OfflineAudioItem extends OfflineQueueItemBase {
  kind: 'audio'
  payload: OfflineAudioPayload
}

export type OfflineQueueItem = OfflineNoteItem | OfflineAudioItem

export type OfflineQueueInput =
  | { userId: string; kind: 'note'; payload: OfflineNotePayload }
  | { userId: string; kind: 'audio'; payload: OfflineAudioPayload }

export const OFFLINE_QUEUE_DB_NAME = 'chisos-offline-queue'
const STORE_NAME = 'items'
const DB_VERSION = 1

const EMPTY_ITEMS: readonly OfflineQueueItem[] = Object.freeze([])

let backend: QueuePersistence = hasIndexedDb() ? 'indexeddb' : 'memory'
let databasePromise: Promise<IDBDatabase | null> | null = null
let loadPromise: Promise<void> | null = null
let items: OfflineQueueItem[] = []
let snapshots = new Map<string, OfflineQueueItem[]>()
const listeners = new Set<() => void>()
let idCounter = 0

function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

function setBackend(next: QueuePersistence): void {
  if (backend === next) return
  backend = next
  emit()
}

function rebuildSnapshots(): void {
  const next = new Map<string, OfflineQueueItem[]>()
  for (const item of items) {
    const list = next.get(item.userId)
    if (list) list.push(item)
    else next.set(item.userId, [item])
  }
  for (const list of next.values()) {
    list.sort((a, b) => a.createdAt - b.createdAt)
  }
  snapshots = next
}

function resetItems(nextItems: OfflineQueueItem[]): void {
  items = nextItems
  rebuildSnapshots()
  emit()
}

function createId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // Fall through to the counter-based id.
  }
  idCounter += 1
  return `offline-${Date.now()}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`
}

export function createOfflineQueueItem(input: OfflineQueueInput): OfflineQueueItem {
  const base = {
    id: createId(),
    userId: input.userId,
    createdAt: Date.now(),
  }
  if (input.kind === 'note') {
    return { ...base, kind: 'note', payload: input.payload }
  }
  return { ...base, kind: 'audio', payload: input.payload }
}

export function isOfflineQueueItem(value: unknown): value is OfflineQueueItem {
  if (!value || typeof value !== 'object') return false
  const candidate = value as {
    id?: unknown
    userId?: unknown
    kind?: unknown
    createdAt?: unknown
    payload?: unknown
  }
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.userId !== 'string' ||
    typeof candidate.createdAt !== 'number' ||
    !candidate.payload ||
    typeof candidate.payload !== 'object'
  ) {
    return false
  }
  if (candidate.kind === 'note') {
    return typeof (candidate.payload as { content?: unknown }).content === 'string'
  }
  if (candidate.kind === 'audio') {
    return (candidate.payload as { blob?: unknown }).blob != null
  }
  return false
}

/** Trim fields and normalise tags the same way the composer does. */
export function normalizeNotePayload(input: OfflineNotePayload): OfflineNotePayload {
  const title = input.title?.trim()
  const seen = new Set<string>()
  const tags: string[] = []

  for (const rawTag of input.tags ?? []) {
    const tag = rawTag.trim().toLowerCase()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
  }

  return {
    title: title ? title : undefined,
    content: input.content.trim(),
    folder_path: input.folder_path?.trim() || 'inbox',
    tags,
  }
}

/**
 * The API client translates a failed fetch into this exact message. Only
 * connection failures should be queued; auth, quota, and validation errors
 * must surface immediately.
 */
export function isNetworkUnreachableError(error: unknown): boolean {
  return error instanceof Error && /cannot reach the server/i.test(error.message)
}

export function audioFilename(mimeType: string, prefix = 'chisos-recording'): string {
  const baseType = mimeType.split(';')[0].trim().toLowerCase()
  const extension = AUDIO_MIME_TO_EXT[baseType] || 'webm'
  return `${prefix}.${extension}`
}

export function getQueuePersistence(): QueuePersistence {
  return backend
}

export function getQueueItemsForUser(
  userId: string | null | undefined
): readonly OfflineQueueItem[] {
  if (!userId) return EMPTY_ITEMS
  return snapshots.get(userId) ?? EMPTY_ITEMS
}

export function subscribeToQueue(listener: () => void): () => void {
  listeners.add(listener)
  void ensureQueueLoaded()
  return () => {
    listeners.delete(listener)
  }
}

// ============================================================================
// IndexedDB plumbing
// ============================================================================

function openDatabase(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) {
    setBackend('memory')
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (db: IDBDatabase | null) => {
      if (settled) return
      settled = true
      resolve(db)
    }

    try {
      const request = indexedDB.open(OFFLINE_QUEUE_DB_NAME, DB_VERSION)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('userId', 'userId', { unique: false })
        }
      }

      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => db.close()
        finish(db)
      }

      request.onerror = () => {
        setBackend('memory')
        finish(null)
      }

      // Another tab is blocking a version upgrade. Fall back for this session
      // rather than hanging every queue operation behind an unusable handle.
      request.onblocked = () => {
        setBackend('memory')
        finish(null)
      }
    } catch {
      setBackend('memory')
      finish(null)
    }
  })
}

function getDatabase(): Promise<IDBDatabase | null> {
  if (!databasePromise) databasePromise = openDatabase()
  return databasePromise
}

function readAllItems(db: IDBDatabase): Promise<OfflineQueueItem[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result as OfflineQueueItem[])
    request.onerror = () => reject(request.error ?? new Error('Could not read offline queue'))
  })
}

function putItem(db: IDBDatabase, item: OfflineQueueItem): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(item)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Could not persist offline capture'))
    tx.onabort = () => reject(tx.error ?? new Error('Could not persist offline capture'))
  })
}

function deleteItem(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Could not remove offline capture'))
    tx.onabort = () => reject(tx.error ?? new Error('Could not remove offline capture'))
  })
}

function deleteItemsForUser(db: IDBDatabase, userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const index = tx.objectStore(STORE_NAME).index('userId')
    const request = index.openCursor(IDBKeyRange.only(userId))

    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      cursor.delete()
      cursor.continue()
    }
    request.onerror = () => reject(request.error ?? new Error('Could not clear offline queue'))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Could not clear offline queue'))
    tx.onabort = () => reject(tx.error ?? new Error('Could not clear offline queue'))
  })
}

async function loadQueue(): Promise<void> {
  const db = await getDatabase()
  if (!db) {
    rebuildSnapshots()
    emit()
    return
  }

  try {
    const stored = await readAllItems(db)
    // Captures enqueued while the database was opening were already added to
    // the in-memory snapshot; keep them and avoid duplicating stored ones.
    const known = new Set(items.map((item) => item.id))
    const merged = stored.filter(isOfflineQueueItem).filter((item) => !known.has(item.id))
    items = [...merged, ...items]
    rebuildSnapshots()
  } catch {
    setBackend('memory')
    rebuildSnapshots()
  } finally {
    emit()
  }
}

export function ensureQueueLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = loadQueue().catch(() => {
      setBackend('memory')
      rebuildSnapshots()
      emit()
    })
  }
  return loadPromise
}

// ============================================================================
// Public mutations
// ============================================================================

export async function enqueueOfflineItem(input: OfflineQueueInput): Promise<OfflineQueueItem> {
  const item = createOfflineQueueItem(input)
  resetItems([...items, item])

  try {
    const db = await getDatabase()
    if (!db) {
      setBackend('memory')
      return item
    }
    await putItem(db, item)
  } catch {
    // The capture still exists for this session; surface the weaker guarantee.
    setBackend('memory')
  }

  return item
}

export async function removeOfflineItem(id: string): Promise<void> {
  if (!items.some((item) => item.id === id)) return
  resetItems(items.filter((item) => item.id !== id))

  try {
    const db = await getDatabase()
    if (db) await deleteItem(db, id)
  } catch {
    setBackend('memory')
  }
}

export async function clearQueueForUser(userId: string): Promise<void> {
  resetItems(items.filter((item) => item.userId !== userId))

  try {
    const db = await getDatabase()
    if (db) await deleteItemsForUser(db, userId)
  } catch {
    setBackend('memory')
  }
}
