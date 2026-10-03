import { cubicBezier, quinticInOut, type Easing } from './ease'
import { deskPose, distance, lerpPointer, lerpVec, monitorPose, PARALLAX_RATE, pointerDistance, REST, smoothing, type Pointer, type Pose } from './keyframes'

export type CameraKey = 'desk' | 'monitor'

export const TRANSITIONS: Record<CameraKey, { ms: number; ease: Easing }> = {
  monitor: { ms: 2000, ease: cubicBezier(0.13, 0.99, 0, 1) },
  desk: { ms: 1000, ease: quinticInOut },
}

/** What the rig needs from a camera; three's PerspectiveCamera satisfies it, and so does a stub. */
export interface RigCamera {
  position: { set(x: number, y: number, z: number): unknown }
  lookAt(x: number, y: number, z: number): void
}

/** Below this many scene units a frame is treated as still, so the renderer can skip it. */
const EPSILON = 0.05
/** Below this (pointer units) the parallax easing counts as converged, so the engine can park. */
const SETTLE = 1e-3

interface Tween { from: Pose; elapsed: number; ms: number; ease: Easing }

/**
 * Drives the camera between the desk and the monitor. `update(dt)` returns whether the camera moved,
 * which is the engine's only reason to render a frame. A new `goTo` mid-tween starts from the
 * current pose, and the tween's destination is re-read every frame so parallax never snaps.
 */
export class CameraRig {
  private key: CameraKey = 'desk'
  private aspect = 2 / 3
  private pointer: Pointer = REST
  private eased = { target: { ...REST }, position: { ...REST } }
  private tween: Tween | null = null
  private pose: Pose

  constructor(
    private readonly camera: RigCamera,
    private reduceMotion = false,
  ) {
    this.pose = deskPose(this.aspect)
    this.apply()
  }

  setAspect(aspect: number): void {
    this.aspect = aspect
  }

  setPointer(pointer: Pointer): void {
    this.pointer = pointer
  }

  setReduceMotion(on: boolean): void {
    this.reduceMotion = on
  }

  goTo(key: CameraKey): void {
    if (key === this.key) return
    this.key = key
    const { ms, ease } = TRANSITIONS[key]
    this.tween = this.reduceMotion ? null : { from: clone(this.pose), elapsed: 0, ms, ease }
  }

  update(dt: number): boolean {
    const goal = this.goal(dt)
    let next = goal
    let landed = false
    if (this.tween) {
      this.tween.elapsed += dt
      const t = Math.min(1, this.tween.elapsed / this.tween.ms)
      const k = this.tween.ease(t)
      next = { position: lerpVec(this.tween.from.position, goal.position, k), target: lerpVec(this.tween.from.target, goal.target, k) }
      if (t >= 1) {
        this.tween = null
        landed = true
      }
    }
    // The frame a tween lands is always applied, so the sub-EPSILON last step never leaves the camera short.
    const moved = landed || distance(next.position, this.pose.position) > EPSILON || distance(next.target, this.pose.target) > EPSILON
    if (!moved) return false
    this.pose = next
    this.apply()
    return true
  }

  /** No tween running and the parallax has converged: nothing would move next frame. */
  settled(): boolean {
    if (this.tween) return false
    // at the monitor the pointer is ignored, so unconverged parallax would never settle there
    if (this.key === 'monitor') return true
    const want = this.reduceMotion ? REST : this.pointer
    return pointerDistance(this.eased.target, want) < SETTLE && pointerDistance(this.eased.position, want) < SETTLE
  }

  private goal(dt: number): Pose {
    if (this.key === 'monitor') return monitorPose(this.aspect)
    const want = this.reduceMotion ? REST : this.pointer
    this.eased.target = lerpPointer(this.eased.target, want, smoothing(PARALLAX_RATE.target, dt))
    this.eased.position = lerpPointer(this.eased.position, want, smoothing(PARALLAX_RATE.position, dt))
    return deskPose(this.aspect, this.eased.target, this.eased.position)
  }

  private apply(): void {
    const { position: p, target: t } = this.pose
    this.camera.position.set(p.x, p.y, p.z)
    this.camera.lookAt(t.x, t.y, t.z)
  }
}

const clone = (pose: Pose): Pose => ({ position: { ...pose.position }, target: { ...pose.target } })
