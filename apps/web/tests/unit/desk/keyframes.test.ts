import { describe, expect, it } from 'vitest'
import { deskPose, distance, lerpVec, monitorPose, REST, smoothing } from '@/features/desk/keyframes'

const ASPECT = 2 / 3 // a 3:2 box: height / width

describe('deskPose', () => {
  it('is the reference desk shot at rest, with z following the aspect', () => {
    expect(deskPose(ASPECT)).toEqual({
      position: { x: 0, y: 1800, z: 5500 + ASPECT * 3000 - 1800 },
      target: { x: 0, y: 500, z: 0 },
    })
  })
  it('pans with the pointer: the target further than the camera, and up is up', () => {
    const p = deskPose(ASPECT, { x: 1, y: -1 }, { x: 1, y: -1 })
    expect(p.target.x).toBe(400)
    expect(p.position.x).toBe(200)
    expect(p.target.y).toBeGreaterThan(500)
    expect(p.position.y).toBeGreaterThan(1800)
  })
  it('takes separate pointers for target and position', () => {
    const p = deskPose(ASPECT, { x: 1, y: 0 }, REST)
    expect(p.target.x).toBe(400)
    expect(p.position.x).toBe(0)
  })
})

describe('monitorPose', () => {
  it('looks straight at the screen centre, closer for wider boxes', () => {
    const wide = monitorPose(9 / 16)
    const tall = monitorPose(1)
    expect(wide.target).toEqual({ x: 0, y: 950, z: 0 })
    expect(wide.position.x).toBe(0)
    expect(wide.position.y).toBe(950)
    expect(wide.position.z).toBeLessThan(tall.position.z)
  })
})

describe('smoothing', () => {
  it('equals the per-frame rate for one 60 fps frame and converges faster for longer frames', () => {
    expect(smoothing(0.05, 1000 / 60)).toBeCloseTo(0.05, 10)
    expect(smoothing(0.05, 1000 / 30)).toBeCloseTo(1 - 0.95 ** 2, 10)
    expect(smoothing(0.05, 0)).toBe(0)
  })
})

describe('vectors', () => {
  it('lerps and measures', () => {
    expect(lerpVec({ x: 0, y: 0, z: 0 }, { x: 10, y: -10, z: 4 }, 0.5)).toEqual({ x: 5, y: -5, z: 2 })
    expect(distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5)
  })
})
