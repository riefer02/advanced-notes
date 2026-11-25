/**
 * API Client for Chisos Backend
 *
 * All API calls go through this module for consistency and type safety.
 * Re-exports from feature modules for backward-compatible imports.
 */
export {
  setAuthTokenGetter,
  apiRequest,
  apiUpload,
  audioFormData,
  QuotaError,
  type QuotaInfo,
} from './core'
export * from './notes'
export * from './todos'
export * from './meals'
export * from './vinyl'
export * from './sharing'
export * from './settings'
export * from './feedback'
export * from './dashboard'
export * from './export'
export * from './library'
export * from './system'
export * from './usage'
export * from './admin'
