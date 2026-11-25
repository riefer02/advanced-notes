/**
 * Full-account data export API.
 */
import { apiDownload } from './core'

export type ExportFormat = 'zip' | 'json'

export async function fetchAccountExport(
  format: ExportFormat = 'zip'
): Promise<{ blob: Blob; filename: string | null }> {
  return apiDownload('/api/export', {
    params: { format },
    timeoutMs: 120_000,
  })
}
