import { createHash } from 'node:crypto'

export const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex')

/** 10 hex chars of the bytes' sha256: the cache key in every served file name. */
export const contentHash = (bytes: Uint8Array): string => sha256(bytes).slice(0, 10)

/**
 * `dir/name.<hash>.<ext>`, so a changed file always gets a new URL and `/assets/` can be immutable.
 * `suffix` replaces the source's extension: `'webp'`, or `'1280w.avif'` for a sized variant.
 */
export function hashedName(source: string, bytes: Uint8Array, suffix?: string): string {
  const dot = source.lastIndexOf('.')
  const stem = dot > source.lastIndexOf('/') ? source.slice(0, dot) : source
  const tail = suffix ?? source.slice(dot + 1)
  const split = tail.lastIndexOf('.')
  const qualifier = split === -1 ? '' : `.${tail.slice(0, split)}`
  const ext = tail.slice(split + 1)
  return `${stem}${qualifier}.${contentHash(bytes)}.${ext}`
}
