import { describe, expect, it } from 'vitest'
import { reducePower } from '@/features/desk/power'

describe('reducePower', () => {
  it('turns on from intent and settles on load', () => {
    expect(reducePower('off', { type: 'intent', source: 'pointer' })).toBe('booting')
    expect(reducePower('booting', { type: 'loaded' })).toBe('on')
  })
  it('ignores repeated intents and an early load', () => {
    expect(reducePower('booting', { type: 'intent', source: 'focus' })).toBe('booting')
    expect(reducePower('on', { type: 'intent', source: 'visible' })).toBe('on')
    expect(reducePower('off', { type: 'loaded' })).toBe('off')
  })
})
