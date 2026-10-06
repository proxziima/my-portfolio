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

  it('serves the stale value when a refresh fails, and backs off before retrying', async () => {
    const c = clock()
    const fetch = vi.fn<() => Promise<string>>().mockResolvedValueOnce('v1').mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('v2')
    const get = ttlCache(fetch, 5_000, c.now)
    await get()
    c.advance(6_000)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await get()).toBe('v1')
    expect(fetch).toHaveBeenCalledTimes(2)
    c.advance(10_000)
    expect(await get()).toBe('v1')
    expect(fetch).toHaveBeenCalledTimes(2)
    c.advance(21_000)
    expect(await get()).toBe('v2')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('throws when the first fetch fails, since there is nothing to fall back on', async () => {
    const get = ttlCache(() => Promise.reject(new Error('down')), 5_000, clock().now)
    await expect(get()).rejects.toThrow('down')
  })

  it('with nothing cached, rethrows the last error without fetching during the backoff', async () => {
    const c = clock()
    const fetch = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('v1')
    const get = ttlCache(fetch, 5_000, c.now)
    await expect(get()).rejects.toThrow('down')
    c.advance(10_000)
    await expect(get()).rejects.toThrow('down')
    expect(fetch).toHaveBeenCalledTimes(1)
    c.advance(21_000)
    expect(await get()).toBe('v1')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('shares one in-flight fetch between concurrent callers', async () => {
    let release: (v: string) => void = () => {}
    const fetch = vi.fn(() => new Promise<string>((r) => (release = r)))
    const get = ttlCache(fetch, 5_000, clock().now)
    const calls = [get(), get(), get()]
    release('v1')
    expect(await Promise.all(calls)).toEqual(['v1', 'v1', 'v1'])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('shares one in-flight refresh after expiry too', async () => {
    const c = clock()
    let release: (v: string) => void = () => {}
    const fetch = vi.fn<() => Promise<string>>().mockResolvedValueOnce('v1').mockImplementationOnce(() => new Promise<string>((r) => (release = r)))
    const get = ttlCache(fetch, 5_000, c.now)
    await get()
    c.advance(6_000)
    const calls = [get(), get()]
    release('v2')
    expect(await Promise.all(calls)).toEqual(['v2', 'v2'])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('recovers after the backoff even when the fetcher throws synchronously', async () => {
    const c = clock()
    let calls = 0
    const get = ttlCache(() => {
      calls += 1
      if (calls === 1) throw new Error('sync')
      return Promise.resolve('v1')
    }, 5_000, c.now)
    await expect(get()).rejects.toThrow('sync')
    c.advance(31_000)
    expect(await get()).toBe('v1')
  })
})
