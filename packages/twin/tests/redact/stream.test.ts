import { describe, expect, it } from 'vitest'
import { REDACTED, StreamRedactor, redactText } from '../../src/redact'

const rules = { terms: ['Acme Secret Client'], allow: [] }

/** Feeds text in every possible two-way split and checks the output equals whole-text redaction. */
function everySplitMatches(text: string): void {
  const expected = redactText(text, rules)
  for (let i = 0; i <= text.length; i++) {
    const r = new StreamRedactor(rules)
    const out = r.push(text.slice(0, i)) + r.push(text.slice(i)) + r.flush()
    expect(out).toBe(expected)
  }
}

describe('StreamRedactor', () => {
  it('never leaks a term split across deltas', () => {
    everySplitMatches('Before: Acme Secret Client, after.')
    everySplitMatches('reach me on vq@private.com today')
  })

  it('emits text early once it is safely past the holdback', () => {
    const r = new StreamRedactor(rules)
    const long = 'a'.repeat(200)
    expect(r.push(long).length).toBeGreaterThan(0)
    expect(r.push('Acme Secret Client') + r.flush()).toContain(REDACTED)
  })
})
