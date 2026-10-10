import type { ManifestValue } from '../manifest.ts'

export interface StageOutput {
  /** As recorded in the lock: `/assets/…` (served from `public/`) or a path relative to `apps/web`. */
  path: string
  bytes: Uint8Array
  /** For the build table: what this output is (`avif 1280w q62`). */
  label?: string
}

export interface StageResult {
  outputs: StageOutput[]
  value: ManifestValue
  parity?: ManifestValue
  /** Encoder versions, recorded in the lock. */
  tools?: Record<string, string>
}

/** `/assets/<hashed source path>`: every served output lives under the immutable `/assets/` prefix. */
export const assetPath = (hashed: string): string => `/assets/${hashed}`
