import { describe, expect, it } from 'bun:test'
import { findLeaks, SECRET_NAMES } from './scan-client-bundle'

describe('findLeaks', () => {
  it('flags secret env names, secret values and prompt markers in client files', () => {
    const files = [
      { path: 'a.js', text: 'x="TWIN_JWT_SECRET";y="supersecretvalue1234567890abcdef"' },
      { path: 'b.js', text: '<skill name="identity"' },
    ]
    const leaks = findLeaks(files, {
      names: ['TWIN_JWT_SECRET'],
      values: ['supersecretvalue1234567890abcdef'],
      markers: ['<skill name='],
    })
    expect(leaks.map((l) => l.path)).toEqual(['a.js', 'a.js', 'b.js'])
  })

  it('never echoes a secret value in the report', () => {
    const leaks = findLeaks([{ path: 'a.js', text: 'supersecretvalue1234567890abcdef' }], {
      names: [],
      values: ['supersecretvalue1234567890abcdef'],
      markers: [],
    })
    expect(JSON.stringify(leaks)).not.toContain('supersecretvalue')
  })

  it('passes a clean bundle', () => {
    expect(findLeaks([{ path: 'a.js', text: 'console.log("hi")' }], { names: SECRET_NAMES, values: [], markers: [] })).toEqual([])
  })

  it('covers every server-only twin secret name', () => {
    for (const name of [
      'TWIN_STABLE_KEY_SECRET',
      'TWIN_BOOKING_REF_SECRET',
      'TELEGRAM_WEBHOOK_SECRET',
      'CAL_WEBHOOK_SECRET',
      'PAYLOAD_MCP_API_KEY',
    ]) {
      expect(SECRET_NAMES).toContain(name)
    }
  })
})
