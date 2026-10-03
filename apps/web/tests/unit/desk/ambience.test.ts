import { describe, expect, it } from 'vitest'
import { ambienceParams } from '@/features/desk/ambience'

describe('ambienceParams', () => {
  it('is quieter and more muffled at the monitor than at the desk', () => {
    const monitor = ambienceParams(2400)
    const desk = ambienceParams(6000)
    expect(monitor.frequency).toBeLessThan(desk.frequency)
    expect(monitor.volume).toBeLessThan(desk.volume)
  })
  it('clamps the level to the reference band and the cutoff to audible values', () => {
    expect(ambienceParams(0)).toEqual({ frequency: 100, volume: 0.05 })
    expect(ambienceParams(1e6).volume).toBe(0.1)
    expect(ambienceParams(1e6).frequency).toBe(22050)
  })
})
