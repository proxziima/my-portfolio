import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getConversation: vi.fn() }))

vi.mock('@repo/twin/db', () => ({ getConversation: mocks.getConversation }))
vi.mock('../agent/lib/db', () => ({ db: () => ({}) }))
// The provider object is irrelevant here; echoing the tier lets the selection's model be asserted.
vi.mock('../agent/lib/models', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../agent/lib/models')>()),
  tierModel: (tier: string) => ({ tier }),
}))

import { currentTier, tierSelection } from '../agent/lib/model-router'
import { modelIds } from '../agent/lib/models'

describe('currentTier', () => {
  beforeEach(() => {
    mocks.getConversation.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it.each(['light', 'standard', 'deep'] as const)('returns the stored %s tier', async (tier) => {
    mocks.getConversation.mockResolvedValue({ state: { modelTier: tier } })
    expect(await currentTier('s1')).toBe(tier)
    expect(mocks.getConversation).toHaveBeenCalledWith({}, 's1')
  })

  it('falls back to standard when the session has no conversation row', async () => {
    mocks.getConversation.mockResolvedValue(null)
    expect(await currentTier('s1')).toBe('standard')
  })

  it('falls back to standard, and logs, when the read throws', async () => {
    mocks.getConversation.mockRejectedValue(new Error('db down'))
    expect(await currentTier('s1')).toBe('standard')
    expect(console.error).toHaveBeenCalledWith('[twin] model tier read failed; using standard', 'db down')
  })
})

describe('tierSelection', () => {
  const tiers = modelIds({}).tiers

  it.each([
    ['light', 'low'],
    ['standard', 'low'],
    ['deep', 'medium'],
  ] as const)('selects the %s model with its window and %s reasoning', (tier, reasoning) => {
    expect(tierSelection(tier)).toEqual({
      model: { tier },
      modelContextWindowTokens: tiers[tier].contextTokens,
      reasoning,
    })
  })

  it('carries the 200k window for light and 1M for the others by default', () => {
    expect(tierSelection('light').modelContextWindowTokens).toBe(200_000)
    expect(tierSelection('standard').modelContextWindowTokens).toBe(1_000_000)
    expect(tierSelection('deep').modelContextWindowTokens).toBe(1_000_000)
  })
})
