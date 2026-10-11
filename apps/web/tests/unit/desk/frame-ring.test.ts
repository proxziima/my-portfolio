import { describe, expect, it } from 'vitest'
import { FrameRing } from '@/features/desk/gl/frame-ring'

describe('FrameRing', () => {
  it('hands out increasing ids', () => {
    const ring = new FrameRing<string>()
    expect(ring.push('a')).toBe(1)
    expect(ring.push('b')).toBe(2)
    expect(ring.inFlight).toBe(2)
  })

  it('is full at three in flight: push returns null and keeps nothing', () => {
    const ring = new FrameRing<string>()
    ring.push('a')
    ring.push('b')
    ring.push('c')
    expect(ring.push('d')).toBeNull()
    expect(ring.inFlight).toBe(3)
  })

  it('settles a frame with its own entry, dropping every older one', () => {
    const ring = new FrameRing<string>()
    ring.push('a')
    ring.push('b')
    ring.push('c')
    expect(ring.settle(2)).toBe('b')
    expect(ring.inFlight).toBe(1)
    expect(ring.settle(1)).toBeNull()
    expect(ring.settle(3)).toBe('c')
    expect(ring.inFlight).toBe(0)
  })

  it('settles an unknown id with null, still dropping the older ones', () => {
    const ring = new FrameRing<string>()
    ring.push('a')
    ring.push('b')
    expect(ring.settle(7)).toBeNull()
    expect(ring.inFlight).toBe(0)
    expect(ring.push('c')).toBe(3)
  })

  it('takes a smaller cap', () => {
    const ring = new FrameRing<string>(1)
    ring.push('a')
    expect(ring.push('b')).toBeNull()
  })
})
