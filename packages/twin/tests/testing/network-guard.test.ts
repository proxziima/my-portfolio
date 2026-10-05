import { afterEach, describe, expect, it, vi } from 'vitest'
import { drainBlockedNetworkCalls } from '../../src/testing/network-guard'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('network guard', () => {
  it('rejects an un-mocked fetch loudly and records it', async () => {
    await expect(fetch('https://example.test/x')).rejects.toThrow(/un-mocked network call: GET https:\/\/example\.test\/x/i)
    expect(drainBlockedNetworkCalls()).toEqual(['GET https://example.test/x'])
  })

  it('records a blocked call even when the code under test swallows the error', async () => {
    await fetch(new Request('https://example.test/y', { method: 'POST' })).catch(() => undefined)
    expect(drainBlockedNetworkCalls()).toEqual(['POST https://example.test/y'])
  })

  it('steps aside for a test that stubs fetch, and is back once the stub is removed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true })))
    await expect((await fetch('https://example.test/z')).json()).resolves.toEqual({ ok: true })
    vi.unstubAllGlobals()
    await expect(fetch('https://example.test/z')).rejects.toThrow(/un-mocked/i)
    drainBlockedNetworkCalls()
  })
})
