import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRedactionRules, resetRedactionRulesCache } from '../../src/redact'

afterEach(() => {
  vi.unstubAllGlobals()
  resetRedactionRulesCache()
})

describe('fetchRedactionRules', () => {
  it('fetches with the bearer secret and memoises', async () => {
    const fetchMock = vi.fn(async () => Response.json({ terms: ['X'], allow: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await fetchRedactionRules('http://cms:3001', 's', 0)
    await fetchRedactionRules('http://cms:3001', 's', 1000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws instead of redacting without terms', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 401 })))
    await expect(fetchRedactionRules('http://cms:3001', 'bad', 0)).rejects.toThrow(/401/)
  })
})

describe('fetchRedactionRules resilience', () => {
  const MIN = 60_000
  const ok = (terms: string[]) => Response.json({ terms, allow: [] })
  const down = () => new Response('down', { status: 503 })

  it('aborts the request after 3 seconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const fetchMock = vi.fn(async (_url: URL, _init?: RequestInit) => ok(['X']))
    vi.stubGlobal('fetch', fetchMock)
    await fetchRedactionRules('http://cms:3001', 's', 0)
    expect(timeout).toHaveBeenCalledWith(3_000)
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
    timeout.mockRestore()
  })

  it('serves the last good rules after a failure and backs off for 30 seconds', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => ok(['X']))
    vi.stubGlobal('fetch', fetchMock)
    await fetchRedactionRules('http://cms:3001', 's', 0)

    fetchMock.mockImplementation(async () => down())
    const t = 6 * MIN // past the 5 minute TTL
    await expect(fetchRedactionRules('http://cms:3001', 's', t)).resolves.toEqual({ terms: ['X'], allow: [] })
    await expect(fetchRedactionRules('http://cms:3001', 's', t + 29_999)).resolves.toEqual({ terms: ['X'], allow: [] })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    fetchMock.mockImplementation(async () => ok(['Y']))
    await expect(fetchRedactionRules('http://cms:3001', 's', t + 30_000)).resolves.toEqual({ terms: ['Y'], allow: [] })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('treats a rejected (timed out) fetch as a failure', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => ok(['X']))
    vi.stubGlobal('fetch', fetchMock)
    await fetchRedactionRules('http://cms:3001', 's', 0)
    fetchMock.mockImplementation(async () => {
      throw new DOMException('timed out', 'TimeoutError')
    })
    await expect(fetchRedactionRules('http://cms:3001', 's', 6 * MIN)).resolves.toEqual({ terms: ['X'], allow: [] })
  })

  it('stops serving last good rules once they are an hour old', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => ok(['X']))
    vi.stubGlobal('fetch', fetchMock)
    await fetchRedactionRules('http://cms:3001', 's', 0)
    fetchMock.mockImplementation(async () => down())
    await expect(fetchRedactionRules('http://cms:3001', 's', 60 * MIN - 15_000)).resolves.toEqual({ terms: ['X'], allow: [] })
    // Still inside the backoff window, but the rules have now aged past an hour.
    await expect(fetchRedactionRules('http://cms:3001', 's', 60 * MIN)).rejects.toThrow(/503/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await expect(fetchRedactionRules('http://cms:3001', 's', 60 * MIN + 15_000)).rejects.toThrow(/503/)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('with no good rules, rethrows without refetching for 30 seconds', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => down())
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchRedactionRules('http://cms:3001', 's', 0)).rejects.toThrow(/503/)
    await expect(fetchRedactionRules('http://cms:3001', 's', 29_999)).rejects.toThrow(/503/)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockImplementation(async () => ok(['X']))
    await expect(fetchRedactionRules('http://cms:3001', 's', 30_000)).resolves.toEqual({ terms: ['X'], allow: [] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
