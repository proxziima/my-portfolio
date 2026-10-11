import { afterEach, describe, expect, it, vi } from 'vitest'

const captureServerError = vi.hoisted(() => vi.fn())
vi.mock('@repo/observability/server', () => ({ captureServerError }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  captureServerError.mockReset()
})

const context = { routerKind: 'App Router', routePath: '/x', routeType: 'render', renderSource: 'server-rendering', revalidateReason: undefined } as const

describe('onRequestError', () => {
  it('reports the error with the visitor distinct id and the route', async () => {
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', 'phc_x')
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    const { onRequestError } = await import('@/instrumentation')
    const cookie = `ph_phc_x_posthog=${encodeURIComponent(JSON.stringify({ distinct_id: 'd-1' }))}`
    const error = new Error('boom')
    await onRequestError(error, { path: '/x', method: 'GET', headers: { cookie } }, context)
    expect(captureServerError).toHaveBeenCalledWith(error, { distinctId: 'd-1', properties: { path: '/x', method: 'GET', routePath: '/x', routeType: 'render' } })
  })

  it('sends the path without its query string, which can carry secrets', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    const { onRequestError } = await import('@/instrumentation')
    await onRequestError(new Error('boom'), { path: '/api/preview?previewSecret=s3cret&slug=x', method: 'GET', headers: {} }, context)
    expect(captureServerError.mock.calls[0]?.[1]?.properties.path).toBe('/api/preview')
    expect(JSON.stringify(captureServerError.mock.calls)).not.toContain('s3cret')
  })

  it('still reports, without identity, when POSTHOG_REGION is malformed', async () => {
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', 'phc_x')
    vi.stubEnv('POSTHOG_REGION', 'mars')
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { onRequestError } = await import('@/instrumentation')
    const cookie = `ph_phc_x_posthog=${encodeURIComponent(JSON.stringify({ distinct_id: 'd-1' }))}`
    const error = new Error('boom')
    await onRequestError(error, { path: '/x', method: 'GET', headers: { cookie } }, context)
    expect(captureServerError).toHaveBeenCalledWith(error, expect.objectContaining({ distinctId: undefined }))
  })
})

describe('register', () => {
  it('fails startup on a malformed POSTHOG_REGION', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', 'phc_x')
    vi.stubEnv('POSTHOG_REGION', 'mars')
    const { register } = await import('@/instrumentation')
    await expect(register()).rejects.toThrow('POSTHOG_REGION')
  })

  it('fails startup on a malformed SITE_URL', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    vi.stubEnv('SITE_URL', 'ada.dev')
    const { register } = await import('@/instrumentation')
    await expect(register()).rejects.toThrow('SITE_URL')
  })

  it('accepts valid or absent values', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', 'phc_x')
    vi.stubEnv('POSTHOG_REGION', 'eu')
    vi.stubEnv('SITE_URL', 'https://ada.dev')
    const { register } = await import('@/instrumentation')
    await expect(register()).resolves.toBeUndefined()
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', '')
    vi.stubEnv('POSTHOG_REGION', '')
    vi.stubEnv('SITE_URL', '')
    await expect(register()).resolves.toBeUndefined()
  })

  it('validates nothing outside the Node.js runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    vi.stubEnv('SITE_URL', 'ada.dev')
    const { register } = await import('@/instrumentation')
    await expect(register()).resolves.toBeUndefined()
  })
})
