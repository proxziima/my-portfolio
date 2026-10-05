import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Constant-time comparison of a presented secret with the expected one. Both sides are hashed
 * first, so neither the content nor the length of the expected secret leaks through timing.
 */
export function secretsEqual(given: string | null, expected: string): boolean {
  if (!given) return false
  return timingSafeEqual(
    createHash('sha256').update(given).digest(),
    createHash('sha256').update(expected).digest(),
  )
}
