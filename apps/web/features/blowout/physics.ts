/** One step of the falling switch and its shards; the constants are the template's (`blowout1.js`). */
export const GRAVITY = 2700
const WALL_BOUNCE = 0.5
const FLOOR_RESTITUTION = 0.34
const BOUNCE_MIN_SPEED = 160
const IMPACT_FULL_SPEED = 800
const FRICTION = 0.82
const RIGHT_ANGLE = Math.PI / 2

export interface Body { x: number; y: number; vx: number; vy: number; angle: number; spin: number }
export interface Bounds { minX: number; maxX: number; floor: number }
export interface StepResult { body: Body; impact?: number }

export function stepBody(b: Body, dt: number, bounds: Bounds, random: () => number = Math.random): StepResult {
  let { x, y, vx, vy, angle, spin } = b
  vy += GRAVITY * dt
  x += vx * dt
  y += vy * dt
  angle += spin * dt
  if (x < bounds.minX) { x = bounds.minX; vx = Math.abs(vx) * WALL_BOUNCE }
  if (x > bounds.maxX) { x = bounds.maxX; vx = -Math.abs(vx) * WALL_BOUNCE }
  let impact: number | undefined
  if (y >= bounds.floor) {
    y = bounds.floor
    if (Math.abs(vy) > BOUNCE_MIN_SPEED) {
      vy = -vy * FLOOR_RESTITUTION
      impact = Math.min(1, Math.abs(vy) / IMPACT_FULL_SPEED) // after restitution, as in the reference
      vx *= 0.72
      spin = (random() - 0.5) * 9 + spin * 0.35
    } else {
      vy = 0
      vx *= FRICTION
      spin *= 0.7
      angle += (Math.round(angle / RIGHT_ANGLE) * RIGHT_ANGLE - angle) * 0.12
    }
  }
  return { body: { x, y, vx, vy, angle, spin }, impact }
}

export interface Shard { x: number; y: number; vx: number; vy: number; angle: number; spin: number; life: number }

export function stepShard(s: Shard, dt: number, floor: number): Shard {
  let { x, y, vx, vy, angle, life } = s
  vy += GRAVITY * dt
  x += vx * dt
  y += vy * dt
  angle += s.spin * dt
  if (y > floor) { y = floor; vy = -vy * 0.3; vx *= 0.6; life -= 0.25 }
  life -= dt * 0.22
  return { ...s, x, y, vx, vy, angle, life }
}
