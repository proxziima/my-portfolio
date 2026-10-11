import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  fetch: vi.fn(),
  env: vi.fn(() => ({ CMS_URL: 'https://cms.test', TWIN_REDACT_SECRET: 's', TWIN_PROMPT_CANARY: 'CANARY-x' })),
}))
vi.mock('../agent/lib/env', () => ({ getEnv: m.env }))
vi.mock('@repo/twin/redact', async (importOriginal) => ({ ...(await importOriginal<typeof import('@repo/twin/redact')>()), fetchRedactionRules: m.fetch }))

const { MAX_STALE_MS } = await import('@repo/twin/redact')
const { currentRedactor, resetRedactorState } = await import('../agent/lib/observability/processor')
const rules = { terms: ['Rosebud'], allow: [] }

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-10T12:00:00Z') })
  resetRedactorState()
  m.fetch.mockReset()
  m.env.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('currentRedactor', () => {
  it('serves the loaded rules, and stops once they are older than the one-hour cap even if a refresh stalls', async () => {
    m.fetch.mockResolvedValueOnce(rules).mockReturnValue(new Promise(() => {})) // later refreshes never settle
    expect(currentRedactor()).toBeNull() // the first fetch is in flight
    await vi.advanceTimersByTimeAsync(0)
    expect(currentRedactor()?.('Rosebud')).toBe('[redacted]')
    await vi.advanceTimersByTimeAsync(MAX_STALE_MS - 1_000)
    expect(currentRedactor()).not.toBeNull()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(currentRedactor()).toBeNull()
    expect(MAX_STALE_MS).toBe(60 * 60_000)
  })

  it('keeps the rules fresh while refreshes succeed', async () => {
    m.fetch.mockResolvedValue(rules)
    currentRedactor()
    for (let i = 0; i < 7; i++) {
      await vi.advanceTimersByTimeAsync(10 * 60_000)
      expect(currentRedactor()).not.toBeNull()
    }
  })

  it('holds content back after a failed refresh', async () => {
    m.fetch.mockResolvedValueOnce(rules).mockRejectedValue(new Error('gone'))
    currentRedactor()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(currentRedactor()).not.toBeNull() // starts the failing refresh
    await vi.advanceTimersByTimeAsync(0)
    expect(currentRedactor()).toBeNull()
  })

  it('survives a synchronous throw without leaving the refresh stuck', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.env.mockImplementationOnce(() => {
      throw new Error('missing env')
    })
    m.fetch.mockResolvedValue(rules)
    expect(() => currentRedactor()).not.toThrow()
    expect(currentRedactor()).toBeNull()
    await vi.advanceTimersByTimeAsync(10_000)
    currentRedactor() // the next refresh runs: the in-flight flag was cleared
    await vi.advanceTimersByTimeAsync(0)
    expect(m.fetch).toHaveBeenCalledTimes(1)
    expect(currentRedactor()).not.toBeNull()
  })
})
