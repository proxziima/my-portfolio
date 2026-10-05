import { describe, expect, it, vi } from 'vitest'
import { ttlCache } from '../agent/lib/ttl-cache'

const clock = () => {
  let t = 1_000
  return { now: () => t, advance: (ms: number) => void (t += ms) }
}

describe('ttlCache', () => {
  it('fetches once within the TTL and again after it', async () => {
    const c = clock()
    const fetch = vi.fn<() => Promise<string>>().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2')
    const get = ttlCache(fetch, 5_000, c.now)
    expect(await get()).toBe('v1')
    c.advance(4_999)
    expect(await get()).toBe('v1')
    expect(fetch).toHaveBeenCalledTimes(1)
    c.advance(1)
    expect(await get()).toBe('v2')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('serves the stale value when a refresh fails, and retries on the next call', async () => {
    const c = clock()
    const fetch = vi.fn<() => Promise<string>>().mockResolvedValueOnce('v1').mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('v2')
    const get = ttlCache(fetch, 5_000, c.now)
    await get()
    c.advance(6_000)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await get()).toBe('v1')
    expect(await get()).toBe('v2')
  })

  it('throws when the first fetch fails, since there is nothing to fall back on', async () => {
    const get = ttlCache(() => Promise.reject(new Error('down')), 5_000, clock().now)
    await expect(get()).rejects.toThrow('down')
  })
})
