import { describe, expect, it } from 'vitest'
import { createWheelAccumulator } from '@/features/role/use-wheel-step'

describe('wheel accumulator', () => {
  it('steps once per 26px and respects the 170ms cooldown', () => {
    const acc = createWheelAccumulator()
    expect(acc.push(10, 0)).toBe(0)
    expect(acc.push(20, 5)).toBe(1)
    expect(acc.push(100, 50)).toBe(0) // cooling down
    expect(acc.push(100, 200)).toBe(1)
    expect(acc.push(-30, 400)).toBe(-1)
  })
  it('opposite deltas cancel out', () => {
    const acc = createWheelAccumulator()
    expect(acc.push(20, 0)).toBe(0)
    expect(acc.push(-20, 10)).toBe(0)
    expect(acc.push(-25, 20)).toBe(0)
    expect(acc.push(-2, 30)).toBe(-1)
  })
})
