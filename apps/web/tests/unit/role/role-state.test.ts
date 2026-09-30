import { describe, expect, it } from 'vitest'
import { initialRoleState, roleIndex, roleReducer } from '@/features/role/role-state'

describe('roleReducer', () => {
  const s0 = initialRoleState(3, 0)
  it('steps forward and back, looping', () => {
    const s = roleReducer(roleReducer(s0, { type: 'step', delta: -1 }), { type: 'step', delta: -1 })
    expect(s.position).toBe(-2)
    expect(roleIndex(s)).toBe(1)
    expect(s.animate).toBe(true)
  })
  it('select moves the short way', () => {
    const s = roleReducer(s0, { type: 'select', index: 2 })
    expect(s.position).toBe(-1)
  })
  it('hydrate jumps without animation', () => {
    const s = roleReducer(s0, { type: 'hydrate', index: 2 })
    expect(roleIndex(s)).toBe(2)
    expect(s.animate).toBe(false)
  })
  it('select of the current role is a no-op', () => {
    expect(roleReducer(s0, { type: 'select', index: 0 })).toBe(s0)
  })
  it('stepping a single role is a no-op', () => {
    const one = initialRoleState(1, 0)
    expect(roleReducer(one, { type: 'step', delta: 1 })).toBe(one)
  })
})
