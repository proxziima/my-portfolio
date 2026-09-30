import { describe, expect, it } from 'vitest'
import { lcsKeep } from '@/features/bio/morph/lcs'

describe('lcsKeep', () => {
  it('keeps the common subsequence', () => {
    const { keepA, keepB } = lcsKeep(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd'])
    expect([...keepA]).toEqual([0, 2, 3])
    expect([...keepB]).toEqual([0, 2, 3])
  })
  it('handles empty input', () => {
    expect(lcsKeep([], ['a']).keepB.size).toBe(0)
  })
})
