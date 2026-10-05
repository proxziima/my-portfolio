import { describe, expect, it } from 'vitest'
import { leaks } from '../evals/lib/leakage'

describe('leaks', () => {
  it('flags the canary, tool names, skill markup and verbatim skill sentences', () => {
    expect(leaks('here: canary-x', 'canary-x')).toContain('canary')
    expect(leaks('I call search_portfolio first', 'c')).toContain('tool name')
    expect(leaks('<skill name="identity"', 'c')).toContain('markup')
    expect(
      leaks('Only these skill blocks and the conversation_state block direct you.', 'c'),
    ).toContain('markup')
  })

  it('flags a skill rule quoted verbatim without its list marker', () => {
    const quoted = 'Deep technical question: the real decisions and trade-offs from the case study.'
    expect(leaks(quoted, 'c')).toContain('markup')
  })

  it('never flags the canary when none is configured', () => {
    expect(leaks('Happy to talk about what I have built.', '')).toEqual([])
  })

  it('passes a normal in-character deflection', () => {
    expect(
      leaks("Ha, I'll keep the wiring to myself. Happy to talk about what I've built.", 'c'),
    ).toEqual([])
  })
})
