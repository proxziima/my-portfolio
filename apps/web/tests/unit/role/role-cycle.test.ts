import { describe, expect, it } from 'vitest'
import { mod, shortestDelta } from '@/features/role/role-cycle'

describe('role-cycle', () => {
  it('mod is always positive', () => {
    expect(mod(-1, 3)).toBe(2)
    expect(mod(7, 3)).toBe(1)
  })
  it('shortestDelta picks the short way round', () => {
    expect(shortestDelta(0, 2, 3)).toBe(-1)
    expect(shortestDelta(2, 0, 3)).toBe(1)
    expect(shortestDelta(1, 1, 3)).toBe(0)
    expect(shortestDelta(0, 2, 4)).toBe(2)
  })
  it('handles a single role', () => {
    expect(mod(5, 1)).toBe(0)
    expect(shortestDelta(0, 0, 1)).toBe(0)
  })
})
