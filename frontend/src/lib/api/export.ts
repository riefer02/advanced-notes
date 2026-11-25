/**
 * Full-account data export API.
 */
import { apiDownload, apiRequest } from './core'

export type ExportFormat = 'zip' | 'json'

export async function fetchAccountExport(
  format: ExportFormat = 'zip'
): Promise<{ blob: Blob; filename: string | null }> {
  return apiDownload('/api/export', {
    params: { format },
    timeoutMs: 120_000,
  })
}

export interface DeleteAccountResponse {
  deleted: boolean
  clerk_deleted: boolean
  purged: Record<string, number>
  storage_objects: number
}

export async function deleteAccount(): Promise<DeleteAccountResponse> {
  return apiRequest<DeleteAccountResponse>('DELETE', '/api/account', {
    body: { confirm: 'DELETE' },
  })
}
