import { describe, expect, it } from 'vitest'
import { disclosureForModel } from '../agent/lib/disclosure'

describe('disclosureForModel', () => {
  it('releases an approved item as untrusted data', () => {
    const out = disclosureForModel(
      {
        status: 'approved',
        item: {
          sourceId: 'knowledge:5',
          kind: 'knowledge',
          title: 'Notice period',
          text: 'Thirty days',
        },
      },
      'k'.repeat(20),
    )
    expect(out).toMatch(/<untrusted source="approved"/)
    expect(out).toContain('Thirty days')
  })

  it('never reveals that a check happened when it was denied or expired', () => {
    for (const status of ['denied', 'expired'] as const) {
      const out = disclosureForModel({ status }, 'k'.repeat(20))
      expect(out).toMatch(/not available/i)
      expect(out).toMatch(/never mention/i)
    }
  })
})
