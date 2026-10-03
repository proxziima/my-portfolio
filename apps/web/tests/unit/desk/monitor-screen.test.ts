import { describe, expect, it } from 'vitest'
import { SCREEN } from '@/features/desk/config'
import { screenPlanes } from '@/features/desk/monitor-screen'

describe('screenPlanes', () => {
  const { occluder, bezels } = screenPlanes(SCREEN)

  it('puts the occluder at the screen, screen-sized', () => {
    expect(occluder).toEqual({ width: SCREEN.width, height: SCREEN.height, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } })
  })

  it('encloses the screen with four bezels standing `depth` deep in front of it', () => {
    expect(bezels).toHaveLength(4)
    const half = SCREEN.depth / 2
    for (const b of bezels) expect(b.position.z).toBe(half)
    const xs = bezels.map((b) => b.position.x).sort((a, b) => a - b)
    const ys = bezels.map((b) => b.position.y).sort((a, b) => a - b)
    expect(xs).toEqual([-SCREEN.width / 2, 0, 0, SCREEN.width / 2])
    expect(ys).toEqual([-SCREEN.height / 2, 0, 0, SCREEN.height / 2])
  })

  it('turns the side bezels about y and the top/bottom about x', () => {
    const sides = bezels.filter((b) => b.position.x !== 0)
    const caps = bezels.filter((b) => b.position.y !== 0)
    for (const s of sides) expect(s).toMatchObject({ width: SCREEN.depth, height: SCREEN.height, rotation: { x: 0, y: Math.PI / 2, z: 0 } })
    for (const c of caps) expect(c).toMatchObject({ width: SCREEN.width, height: SCREEN.depth, rotation: { x: Math.PI / 2, y: 0, z: 0 } })
  })
})
