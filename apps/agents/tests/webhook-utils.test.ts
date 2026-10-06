import { describe, expect, it } from 'vitest'
import { deliveryOutcome } from '../agent/lib/webhook-utils'

describe('deliveryOutcome', () => {
  it('treats a hook that is no longer pending as nothing left to wake', () => {
    expect(deliveryOutcome(200)).toBe('delivered')
    expect(deliveryOutcome(202)).toBe('delivered')
    expect(deliveryOutcome(404)).toBe('gone')
    expect(deliveryOutcome(500)).toBe('failed')
    expect(deliveryOutcome(400)).toBe('failed')
  })
})
