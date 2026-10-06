import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/health/route'

afterEach(() => vi.unstubAllEnvs())

describe('GET /api/health', () => {
  it('reports the image version and is never cached', async () => {
    vi.stubEnv('APP_VERSION', '0123abc')
    const res = GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ ok: true, version: '0123abc' })
  })

  it('reports "dev" outside an image', async () => {
    vi.stubEnv('APP_VERSION', '')
    expect(await GET().json()).toEqual({ ok: true, version: 'dev' })
  })
})
