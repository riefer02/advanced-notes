/**
 * API Client for Chisos Backend
 *
 * All API calls go through this module for consistency and type safety.
 * Re-exports from feature modules for backward-compatible imports.
 */
export { setAuthTokenGetter, apiRequest, apiUpload, audioFormData } from './core'
export * from './notes'
export * from './todos'
export * from './meals'
export * from './vinyl'
export * from './sharing'
export * from './settings'
export * from './feedback'
export * from './dashboard'
export * from './system'
export * from './admin'
