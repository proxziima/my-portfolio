/**
 * A process-level cache for one value. Within `ttlMs` it serves the cached value; after that it
 * refetches, and when the refetch fails it serves the stale value (and retries on the next call).
 * With nothing cached, a failed fetch throws.
 */
export function ttlCache<T>(fetch: () => Promise<T>, ttlMs: number, now: () => number = Date.now): () => Promise<T> {
  let entry: { value: T; at: number } | null = null
  return async () => {
    if (entry && now() - entry.at < ttlMs) return entry.value
    try {
      const value = await fetch()
      entry = { value, at: now() }
      return value
    } catch (err) {
      if (!entry) throw err
      console.warn('[ttl-cache] refresh failed; serving the stale value', err)
      return entry.value
    }
  }
}
