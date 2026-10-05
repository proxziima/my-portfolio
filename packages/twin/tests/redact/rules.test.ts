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
