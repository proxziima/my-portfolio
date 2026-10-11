import { afterEach, describe, expect, it, vi } from 'vitest'

const captureServerError = vi.hoisted(() => vi.fn())
vi.mock('@repo/observability/server', () => ({ captureServerError }))

afterEach(() => {
  vi.unstubAllEnvs()
  captureServerError.mockReset()
})

const context = { routerKind: 'App Router', routePath: '/api/preview', routeType: 'route', renderSource: undefined, revalidateReason: undefined } as const

describe('onRequestError', () => {
  it('reports under the cms distinct id with the path stripped of its query string', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    const { onRequestError } = await import('../../src/instrumentation')
    const error = new Error('boom')
    await onRequestError(error, { path: '/api/preview?previewSecret=s3cret', method: 'GET', headers: {} }, context)
    expect(captureServerError).toHaveBeenCalledWith(error, { distinctId: 'cms', properties: { path: '/api/preview', method: 'GET', routePath: '/api/preview', routeType: 'route' } })
    expect(JSON.stringify(captureServerError.mock.calls)).not.toContain('s3cret')
  })
})
