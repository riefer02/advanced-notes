import { apiRequest } from './core'

export function fetchHealth(): Promise<{ status: string }> {
  // Public endpoint: no token, short timeout, used by the outage banner.
  return apiRequest('GET', '/api/health', { timeoutMs: 5000, skipAuth: true })
}

export function reportProblem(data: {
  message?: string
  page?: string
  email?: string
}): Promise<{ status: string }> {
  return apiRequest('POST', '/api/report-problem', {
    body: data,
    timeoutMs: 10000,
  })
}
