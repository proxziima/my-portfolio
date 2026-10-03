import type { Vec3 } from './config'

export interface Pose {
  position: Vec3
  target: Vec3
}

/** Pointer over the figure box, both axes in −1..1, y down (DOM convention). */
export interface Pointer { x: number; y: number }

export const REST: Pointer = { x: 0, y: 0 }

/** Per-frame (60 fps) rates the reference used; the target leads, the camera body lags. */
export const PARALLAX_RATE = { target: 0.05, position: 0.025 } as const

const DESK = { position: { x: 0, y: 1800, z: 5500 }, target: { x: 0, y: 500, z: 0 } }
const MONITOR = { position: { x: 0, y: 950, z: 2000 }, target: { x: 0, y: 950, z: 0 } }
/** How far (scene units) a full pointer deflection pans the target and the camera. */
const PAN = { target: { x: 400, y: 150 }, position: { x: 200, y: 200 } }

/**
 * The desk shot. `aspect` is the box's height / width: the reference's correction pulls the camera
 * back for taller boxes so the monitor and the keyboard stay in frame.
 */
export function deskPose(aspect: number, pointerTarget: Pointer = REST, pointerPosition: Pointer = REST): Pose {
  return {
    position: {
      x: DESK.position.x + pointerPosition.x * PAN.position.x,
      y: DESK.position.y - pointerPosition.y * PAN.position.y,
      z: DESK.position.z + aspect * 3000 - 1800,
    },
    target: {
      x: DESK.target.x + pointerTarget.x * PAN.target.x,
      y: DESK.target.y - pointerTarget.y * PAN.target.y,
      z: DESK.target.z,
    },
  }
}

/** Straight at the screen; z keeps the 1280×1024 screen filling the box's height with a margin. */
export function monitorPose(aspect: number): Pose {
  return {
    position: { ...MONITOR.position, z: MONITOR.position.z + aspect * 1200 - 600 },
    target: { ...MONITOR.target },
  }
}

/** The fraction of the remaining distance to close after `dtMs`, from a per-60fps-frame rate. */
export const smoothing = (ratePerFrame: number, dtMs: number): number => 1 - (1 - ratePerFrame) ** (dtMs / (1000 / 60))

export const lerpVec = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
export const lerpPointer = (a: Pointer, b: Pointer, t: number): Pointer => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
export const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
