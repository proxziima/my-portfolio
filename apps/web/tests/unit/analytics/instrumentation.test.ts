import { afterEach, describe, expect, it, vi } from 'vitest'

const captureServerError = vi.hoisted(() => vi.fn())
vi.mock('@repo/observability/server', () => ({ captureServerError }))

afterEach(() => {
  vi.unstubAllEnvs()
  captureServerError.mockReset()
})

describe('onRequestError', () => {
  it('reports the error with the visitor distinct id and the route', async () => {
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', 'phc_x')
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    const { onRequestError } = await import('@/instrumentation')
    const cookie = `ph_phc_x_posthog=${encodeURIComponent(JSON.stringify({ distinct_id: 'd-1' }))}`
    const error = new Error('boom')
    await onRequestError(error, { path: '/x', method: 'GET', headers: { cookie } }, { routerKind: 'App Router', routePath: '/x', routeType: 'render', renderSource: 'server-rendering', revalidateReason: undefined })
    expect(captureServerError).toHaveBeenCalledWith(error, { distinctId: 'd-1', properties: { path: '/x', method: 'GET', routePath: '/x', routeType: 'render' } })
  })
})
