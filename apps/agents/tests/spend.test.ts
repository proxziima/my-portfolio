import { describe, expect, it } from 'vitest'
import { openRouterCost } from '../agent/lib/spend'

describe('openRouterCost', () => {
  it('reads the cost OpenRouter reports in provider metadata', () => {
    expect(openRouterCost({ openrouter: { usage: { cost: 0.0123 } } })).toBe(0.0123)
  })

  it('returns null when absent', () => {
    expect(openRouterCost({})).toBeNull()
    expect(openRouterCost({ openrouter: { usage: {} } })).toBeNull()
  })

  it('ignores the other fields OpenRouter reports alongside the cost', () => {
    expect(openRouterCost({ openrouter: { provider: 'x', usage: { promptTokens: 3, cost: 0.5, costDetails: {} } } })).toBe(0.5)
  })
})
