import { afterEach, describe, expect, it, vi } from 'vitest'

const ctor = vi.fn()
const captureException = vi.fn()
const flush = vi.fn(async () => {})
vi.mock('posthog-node', () => ({
  PostHog: class {
    constructor(...args: unknown[]) {
      ctor(...args)
    }
    captureException = captureException
    capture = vi.fn()
    flush = flush
  },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('serverPostHog', () => {
  it('is a no-op client without a token', async () => {
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', '')
    const { serverPostHog, captureServerError } = await import('../src/server')
    captureServerError(new Error('x'))
    await serverPostHog().flush()
    expect(ctor).not.toHaveBeenCalled()
  })

  it('builds one client for the region and sends immediately', async () => {
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', 'phc_x')
    vi.stubEnv('POSTHOG_REGION', 'eu')
    const { serverPostHog } = await import('../src/server')
    expect(serverPostHog()).toBe(serverPostHog())
    expect(ctor).toHaveBeenCalledTimes(1)
    expect(ctor).toHaveBeenCalledWith('phc_x', { host: 'https://eu.i.posthog.com', flushAt: 1, flushInterval: 0 })
  })

  it('captures errors with the distinct id and properties, and never throws', async () => {
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', 'phc_x')
    const { captureServerError } = await import('../src/server')
    const error = new Error('boom')
    captureServerError(error, { distinctId: 'd-1', properties: { route: '/x' } })
    expect(captureException).toHaveBeenCalledWith(error, 'd-1', { route: '/x' })
    captureException.mockImplementationOnce(() => {
      throw new Error('sdk down')
    })
    expect(() => captureServerError(error)).not.toThrow()
  })
})
