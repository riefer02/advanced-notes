/**
 * Core API utilities: auth, request helpers, and shared constants.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001'

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
// Generic API Request Helper
// ============================================================================

interface ApiRequestOptions {
  params?: Record<string, string | number | boolean | undefined>
  body?: unknown
}

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  options?: ApiRequestOptions
): Promise<T> {
  const headers = new Headers(await getAuthHeaders())

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

  const response = await fetch(url, fetchOptions)

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage: string
    try {
      const errorJson = JSON.parse(errorText)
      errorMessage = errorJson.error || `Request failed: ${response.status}`
    } catch {
      errorMessage = errorText || `Request failed: ${response.status}`
    }
    throw new Error(errorMessage)
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

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage: string
    try {
      const errorJson = JSON.parse(errorText)
      errorMessage = errorJson.error || `Upload failed: ${response.status}`
    } catch {
      errorMessage = errorText || `Upload failed: ${response.status}`
    }
    throw new Error(errorMessage)
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
