/**
 * Core API utilities: auth, request helpers, and shared constants.
 */

import { formatShortDate } from '../format'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001'

// Never let a request hang forever: a stuck fetch keeps the UI in a
// loading state and holds a connection open.
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const UPLOAD_REQUEST_TIMEOUT_MS = 120_000

export class RequestTimeoutError extends Error {
  constructor() {
    super('Request timed out. Please try again.')
    this.name = 'TimeoutError'
  }
}

export class AuthError extends Error {
  constructor() {
    super('Your session expired. Please sign in again.')
    this.name = 'AuthError'
  }
}

/** Quota metadata attached to a 429 response by `require_quota`. */
export interface QuotaInfo {
  service: string
  used: number
  limit: number
  unit: string
  resets_at: string
}

export class QuotaError extends Error {
  quota: QuotaInfo

  constructor(quota: QuotaInfo, message: string) {
    super(message)
    this.name = 'QuotaError'
    this.quota = quota
  }
}

function formatQuotaAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function quotaMessage(quota: QuotaInfo): string {
  const resets = formatShortDate(quota.resets_at) || 'the start of next month'
  return `Monthly quota exceeded: ${formatQuotaAmount(quota.used)}/${formatQuotaAmount(quota.limit)} ${quota.unit}. Resets ${resets}.`
}

function isQuotaInfo(value: unknown): value is QuotaInfo {
  if (!value || typeof value !== 'object') return false
  const quota = value as Partial<QuotaInfo>
  return (
    typeof quota.used === 'number' &&
    typeof quota.limit === 'number' &&
    typeof quota.unit === 'string' &&
    typeof quota.resets_at === 'string'
  )
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  const controller = new AbortController()
  window.setTimeout(() => controller.abort(), ms)
  return controller.signal
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')
  )
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: timeoutSignal(timeoutMs) })
  } catch (error) {
    if (isTimeout(error)) {
      throw new RequestTimeoutError()
    }
    if (error instanceof TypeError) {
      throw new Error('Cannot reach the server. Check your connection and try again.')
    }
    throw error
  }
}

// ============================================================================
// Auth Helper
// ============================================================================

let getAuthToken: (() => Promise<string | null>) | null = null

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  getAuthToken = getter
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = {}

  if (getAuthToken) {
    const token = await getAuthToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  return headers
}

// ============================================================================
// Unauthorized handling
// ============================================================================

let unauthorizedHandler: (() => void) | null = null

/** Register a session-expired callback (wired to Clerk in the app shell). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

async function throwResponseError(response: Response, fallbackPrefix: string): Promise<never> {
  const errorText = await response.text()
  let errorMessage: string
  let errorPayload: unknown = null
  try {
    errorPayload = JSON.parse(errorText)
    const parsed = errorPayload as { error?: string }
    errorMessage = parsed.error || `${fallbackPrefix}: ${response.status}`
  } catch {
    errorMessage = errorText || `${fallbackPrefix}: ${response.status}`
  }

  if (response.status === 401) {
    try {
      unauthorizedHandler?.()
    } catch {
      // Never let the handler hide the original failure.
    }
    throw new AuthError()
  }

  if (response.status === 429 && errorPayload && typeof errorPayload === 'object') {
    const quota = (errorPayload as { quota?: unknown }).quota
    if (isQuotaInfo(quota)) {
      throw new QuotaError(quota, quotaMessage(quota))
    }
  }

  throw new Error(errorMessage)
}

// ============================================================================
// Generic API Request Helper
// ============================================================================

interface ApiRequestOptions {
  params?: Record<string, string | number | boolean | undefined>
  body?: unknown
  timeoutMs?: number
  /** Skip the Clerk token header (public endpoints such as health). */
  skipAuth?: boolean
}

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  options?: ApiRequestOptions
): Promise<T> {
  const headers = new Headers(options?.skipAuth ? undefined : await getAuthHeaders())

  let url = `${API_BASE_URL}${endpoint}`

  if (options?.params) {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) {
        searchParams.set(key, String(value))
      }
    }
    const queryString = searchParams.toString()
    if (queryString) {
      url += `?${queryString}`
    }
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
  }

  if (options?.body && method !== 'GET') {
    headers.set('Content-Type', 'application/json')
    fetchOptions.body = JSON.stringify(options.body)
  }

  const response = await fetchWithTimeout(
    url,
    fetchOptions,
    options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  )

  if (!response.ok) {
    await throwResponseError(response, 'Request failed')
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

export async function apiUpload<T>(
  endpoint: string,
  formData: FormData,
  method: 'POST' | 'PUT' = 'POST'
): Promise<T> {
  const headers = new Headers(await getAuthHeaders())

  const response = await fetchWithTimeout(
    `${API_BASE_URL}${endpoint}`,
    {
      method,
      headers,
      body: formData,
    },
    UPLOAD_REQUEST_TIMEOUT_MS
  )

  if (!response.ok) {
    await throwResponseError(response, 'Upload failed')
  }

  return response.json()
}

// ============================================================================
// Audio Helpers
// ============================================================================

export const AUDIO_MIME_TO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/m4a': 'm4a',
}

export function audioFormData(audioBlob: Blob, filenamePrefix: string): FormData {
  const baseType = audioBlob.type.split(';')[0].trim()
  const extension = AUDIO_MIME_TO_EXT[baseType] || 'webm'
  const formData = new FormData()
  formData.append('file', audioBlob, `${filenamePrefix}.${extension}`)
  return formData
}
