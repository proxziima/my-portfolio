import { afterEach, describe, expect, it, vi } from 'vitest'
import { cmsAdminOrigin } from '@/lib/cms/client'

afterEach(() => vi.unstubAllEnvs())

describe('cmsAdminOrigin', () => {
  it('is the origin of NEXT_PUBLIC_CMS_URL, without path or trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_CMS_URL', 'http://localhost:3001/admin/')
    vi.stubEnv('CMS_URL', 'http://cms.internal:3001')
    expect(cmsAdminOrigin()).toBe('http://localhost:3001')
  })
  it('falls back to CMS_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_CMS_URL', '')
    vi.stubEnv('CMS_URL', 'http://cms.test:3001/')
    expect(cmsAdminOrigin()).toBe('http://cms.test:3001')
  })
})
