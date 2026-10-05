/** After a failed fetch, no new fetch is attempted for this long. */
export const FAILURE_BACKOFF_MS = 30_000

/**
 * A process-level cache for one value. Within `ttlMs` it serves the cached value; after that it
 * refetches. Concurrent callers share one in-flight fetch. When a fetch fails, the cache backs off
 * for `FAILURE_BACKOFF_MS`: with a stale value it serves that, and with nothing cached it rethrows
 * the last error, in both cases without fetching again, so a down source costs one slow call per
 * backoff window instead of one per caller.
 */
export function ttlCache<T>(fetch: () => Promise<T>, ttlMs: number, now: () => number = Date.now): () => Promise<T> {
  let entry: { value: T; at: number } | null = null
  let failure: { error: unknown; at: number } | null = null
  let inFlight: Promise<T> | null = null

  const refresh = async (): Promise<T> => {
    try {
      const value = await fetch()
      entry = { value, at: now() }
      failure = null
      return value
    } catch (err) {
      failure = { error: err, at: now() }
      if (!entry) throw err
      console.warn('[ttl-cache] refresh failed; serving the stale value', err)
      return entry.value
    }
  }

  return () => {
    if (entry && now() - entry.at < ttlMs) return Promise.resolve(entry.value)
    if (inFlight) return inFlight
    if (failure && now() - failure.at < FAILURE_BACKOFF_MS) return entry ? Promise.resolve(entry.value) : Promise.reject(failure.error)
    const pending = refresh()
    inFlight = pending
    // Cleared in a callback (always async), so even a fetcher that throws synchronously can't
    // clear the slot before it is set and leave a settled promise in it forever.
    const clear = () => {
      if (inFlight === pending) inFlight = null
    }
    pending.then(clear, clear)
    return pending
  }
}
