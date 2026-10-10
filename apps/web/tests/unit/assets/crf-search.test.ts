import { describe, expect, it } from 'vitest'
import { firstPassingBelow, highestPassingCrf } from '@/scripts/assets/stages/crf-search'

/** A predicate that passes at or below `limit`, counting its calls. */
function upTo(limit: number) {
  const calls: number[] = []
  const passes = async (crf: number) => {
    calls.push(crf)
    return crf <= limit
  }
  return { passes, calls }
}

describe('highestPassingCrf', () => {
  it('finds the highest passing CRF', async () => {
    expect(await highestPassingCrf(16, 40, upTo(27).passes)).toBe(27)
  })

  it('is null when even the lowest CRF fails', async () => {
    expect(await highestPassingCrf(16, 40, upTo(10).passes)).toBeNull()
  })

  it('returns the top of the range when everything passes', async () => {
    expect(await highestPassingCrf(16, 40, upTo(99).passes)).toBe(40)
  })

  it('returns the bottom when only it passes', async () => {
    expect(await highestPassingCrf(16, 40, upTo(16).passes)).toBe(16)
  })

  it('calls the predicate O(log n) times, never twice for one CRF', async () => {
    const { passes, calls } = upTo(27)
    await highestPassingCrf(16, 40, passes)
    expect(calls.length).toBeLessThanOrEqual(1 + Math.ceil(Math.log2(40 - 16 + 2)))
    expect(new Set(calls).size).toBe(calls.length)
  })
})

describe('firstPassingBelow', () => {
  it('scans down from the start and stops at the first pass', async () => {
    const { passes, calls } = upTo(12)
    expect(await firstPassingBelow(15, 1, passes, () => false)).toBe(12)
    expect(calls).toEqual([15, 14, 13, 12])
  })

  it('is not fooled by a failure at the very bottom (quality is not monotonic there)', async () => {
    const passes = async (crf: number) => crf <= 12 && crf !== 1
    expect(await firstPassingBelow(15, 1, passes, () => false)).toBe(12)
  })

  it('gives up once an encode is already too big to be worth serving', async () => {
    const { passes, calls } = upTo(5)
    expect(await firstPassingBelow(15, 1, passes, (crf) => crf <= 13)).toBeNull()
    expect(calls).toEqual([15, 14, 13])
  })

  it('is null when nothing down to the floor passes', async () => {
    expect(await firstPassingBelow(15, 4, upTo(2).passes, () => false)).toBeNull()
  })
})
