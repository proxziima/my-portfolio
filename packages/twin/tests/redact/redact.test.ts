import { describe, expect, it } from 'vitest'
import { REDACTED, redactText } from '../../src/redact'

const rules = { terms: ['Acme Secret Client', 'R$ 30.000'], allow: ['hello@vinicius.dev'] }

describe('redactText', () => {
  it('removes never-tier terms case-insensitively', () => {
    expect(redactText('I worked for acme secret client last year', rules)).toBe(`I worked for ${REDACTED} last year`)
  })

  it('removes emails and phone numbers that are not allow-listed', () => {
    expect(redactText('mail me at vq@private.com or hello@vinicius.dev', rules)).toBe(`mail me at ${REDACTED} or hello@vinicius.dev`)
    expect(redactText('call +55 (11) 98765-4321', rules)).toBe(`call ${REDACTED}`)
  })

  it('leaves years and ranges alone', () => {
    expect(redactText('From 2019-2024 and 2025.', rules)).toBe('From 2019-2024 and 2025.')
  })
})

describe('redactText term and email edge cases', () => {
  it('prefers the longest term when one term prefixes another', () => {
    const r = { terms: ['Acme', 'Acme Secret Client'], allow: [] }
    expect(redactText('at Acme Secret Client today', r)).toBe(`at ${REDACTED} today`)
  })

  it('trims terms and ignores empty ones', () => {
    const r = { terms: ['  Acme  ', '', '   '], allow: [] }
    expect(redactText('Acme and friends', r)).toBe(`${REDACTED} and friends`)
  })

  it('redacts the whole local part of an over-long email', () => {
    const local = 'x'.repeat(100)
    expect(redactText(`write ${local}@private.com now`, rules)).toBe(`write ${REDACTED} now`)
  })

  it('stays fast on long runs that never become an email', () => {
    const started = performance.now()
    redactText(`${'a'.repeat(50_000)} ${'a.'.repeat(25_000)}@`, rules)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
