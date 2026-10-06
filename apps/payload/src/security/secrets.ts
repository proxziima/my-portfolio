import { createHash, timingSafeEqual } from 'node:crypto'

/** Constant-time secret comparison (hashing first equalises lengths). Mirrors apps/web. */
export function secretsMatch(given: string | null | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
