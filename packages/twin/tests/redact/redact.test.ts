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
