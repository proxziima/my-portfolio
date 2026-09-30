import { describe, expect, it } from 'vitest'
import { GRAVITY, stepBody, stepShard, type Body, type Shard } from '@/features/blowout/physics'

const bounds = { minX: 2, maxX: 1000, floor: 800 }
const body = (over: Partial<Body> = {}): Body => ({ x: 100, y: 100, vx: 0, vy: 0, angle: 0, spin: 0, ...over })
const shard = (over: Partial<Shard> = {}): Shard => ({ x: 100, y: 100, vx: 0, vy: 0, angle: 0, spin: 0, life: 1, ...over })

describe('stepBody', () => {
  it('falls under gravity', () => {
    const { body: b } = stepBody(body(), 0.01, bounds, () => 0.5)
    expect(b.vy).toBeCloseTo(GRAVITY * 0.01)
  })
  it('bounces off the floor with restitution and reports impact strength', () => {
    const { body: b, impact } = stepBody(body({ y: 800, vy: 800 }), 0.001, bounds, () => 0.5)
    expect(b.vy).toBeLessThan(0)
    expect(impact).toBeGreaterThan(0)
  })
  it('measures the impact after restitution, capped at 1', () => {
    const soft = stepBody(body({ y: 800, vy: 800 }), 0.001, bounds, () => 0.5)
    expect(soft.impact).toBeCloseTo(((800 + GRAVITY * 0.001) * 0.34) / 800)
    expect(soft.body.vx).toBe(0)
    const hard = stepBody(body({ y: 800, vy: 5000 }), 0.001, bounds, () => 0.5)
    expect(hard.impact).toBe(1)
  })
  it('keeps 72% of vx on a bounce and 82% while sliding', () => {
    const bounce = stepBody(body({ y: 800, vy: 800, vx: 100 }), 0.001, bounds, () => 0.5)
    expect(bounce.body.vx).toBeCloseTo(72)
    const slide = stepBody(body({ y: 800, vy: 10, vx: 100 }), 0.001, bounds, () => 0.5)
    expect(slide.body.vx).toBeCloseTo(82)
  })
  it('bounces off walls at half speed', () => {
    const { body: b } = stepBody(body({ x: 0, vx: -100 }), 0.001, bounds, () => 0.5)
    expect(b.x).toBe(2)
    expect(b.vx).toBeCloseTo(50)
  })
  it('bounces off the right wall back inwards', () => {
    const { body: b } = stepBody(body({ x: 1001, vx: 100 }), 0.001, bounds, () => 0.5)
    expect(b.x).toBe(1000)
    expect(b.vx).toBeCloseTo(-50)
  })
  it('settles toward the nearest right angle when resting', () => {
    const { body: b, impact } = stepBody(body({ y: 800, vy: 10, angle: 1.4 }), 0.016, bounds, () => 0.5)
    expect(impact).toBeUndefined()
    expect(b.vy).toBe(0)
    expect(Math.abs(b.angle - Math.PI / 2)).toBeLessThan(Math.abs(1.4 - Math.PI / 2))
  })
})

describe('stepShard', () => {
  it('falls, spins and fades', () => {
    const s = stepShard(shard({ spin: 10 }), 0.01, 800)
    expect(s.vy).toBeCloseTo(GRAVITY * 0.01)
    expect(s.angle).toBeCloseTo(0.1)
    expect(s.life).toBeCloseTo(1 - 0.01 * 0.22)
  })
  it('bounces weakly off the floor and loses life', () => {
    const s = stepShard(shard({ y: 799, vy: 1000, vx: 100 }), 0.001, 800)
    expect(s.y).toBe(800)
    expect(s.vy).toBeLessThan(0)
    expect(s.vx).toBeCloseTo(60)
    expect(s.life).toBeCloseTo(1 - 0.25 - 0.001 * 0.22)
  })
})
