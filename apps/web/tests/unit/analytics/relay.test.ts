import { describe, expect, it } from 'vitest'
import { relayTarget } from '@/lib/analytics/relay'

const hosts = { ingestHost: 'https://us.i.posthog.com', assetsHost: 'https://us-assets.i.posthog.com' }

describe('relayTarget', () => {
  it('sends SDK assets and remote config to the assets host', () => {
    expect(relayTarget('/relay/static/array.js', '', hosts)?.href).toBe('https://us-assets.i.posthog.com/static/array.js')
    expect(relayTarget('/relay/array/phc_x/config.js', '', hosts)?.href).toBe('https://us-assets.i.posthog.com/array/phc_x/config.js')
  })
  it('sends everything else to the ingest host, keeping the query and trailing slash', () => {
    expect(relayTarget('/relay/e/', '?ip=0&ver=1', hosts)?.href).toBe('https://us.i.posthog.com/e/?ip=0&ver=1')
    expect(relayTarget('/relay/flags', '?v=2', hosts)?.href).toBe('https://us.i.posthog.com/flags?v=2')
  })
  it('refuses paths outside the relay, and an unconfigured relay', () => {
    expect(relayTarget('/api/x', '', hosts)).toBeNull()
    expect(relayTarget('/relay/e/', '', null)).toBeNull()
  })
})
