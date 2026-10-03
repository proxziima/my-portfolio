import { describe, expect, it, vi } from 'vitest'
import { CameraRig, TRANSITIONS, type RigCamera } from '@/features/desk/camera-rig'
import { deskPose, monitorPose } from '@/features/desk/keyframes'

const FRAME = 1000 / 60
const ASPECT = 2 / 3

function fakeCamera() {
  const camera = {
    position: { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { Object.assign(camera.position, { x, y, z }) } },
    lookAt: vi.fn(),
  }
  return camera as RigCamera & typeof camera
}

/** Runs the rig for `ms` in 60 fps frames; returns how many frames reported movement. */
function run(rig: CameraRig, ms: number): number {
  let moved = 0
  for (let t = 0; t < ms; t += FRAME) if (rig.update(FRAME)) moved++
  return moved
}

describe('CameraRig', () => {
  it('starts at the desk pose and goes quiet once there', () => {
    const camera = fakeCamera()
    const rig = new CameraRig(camera)
    rig.setAspect(ASPECT)
    expect(run(rig, 500)).toBeLessThanOrEqual(1) // the aspect change moves it once, then nothing
    const { position, target } = deskPose(ASPECT)
    expect(camera.position).toMatchObject(position)
    expect(camera.lookAt).toHaveBeenLastCalledWith(target.x, target.y, target.z)
  })

  it('tweens to the monitor over its duration, then rests', () => {
    const camera = fakeCamera()
    const rig = new CameraRig(camera)
    rig.setAspect(ASPECT)
    run(rig, 100)
    rig.goTo('monitor')
    const before = { ...camera.position }
    expect(rig.update(FRAME)).toBe(true)
    expect(camera.position.z).toBeLessThan(before.z)
    run(rig, TRANSITIONS.monitor.ms + 50)
    const { position } = monitorPose(ASPECT)
    expect(camera.position.x).toBeCloseTo(position.x, 3)
    expect(camera.position.y).toBeCloseTo(position.y, 3)
    expect(camera.position.z).toBeCloseTo(position.z, 3)
    expect(run(rig, 200)).toBe(0)
  })

  it('reverses mid-flight from where it is, without a jump', () => {
    const camera = fakeCamera()
    const rig = new CameraRig(camera)
    rig.setAspect(ASPECT)
    run(rig, 100)
    rig.goTo('monitor')
    run(rig, 300)
    const mid = { ...camera.position }
    rig.goTo('desk')
    rig.update(FRAME)
    expect(Math.abs(camera.position.z - mid.z)).toBeLessThan(60)
    run(rig, TRANSITIONS.desk.ms + 50)
    expect(camera.position.z).toBeCloseTo(deskPose(ASPECT).position.z, 3)
  })

  it('follows the pointer at the desk and ignores it at the monitor', () => {
    const camera = fakeCamera()
    const rig = new CameraRig(camera)
    rig.setAspect(ASPECT)
    run(rig, 100)
    rig.setPointer({ x: 1, y: 0 })
    expect(rig.update(FRAME)).toBe(true)
    run(rig, 5000) // the camera body eases at 0.025 per frame: ~4 s to get within half a unit
    expect(camera.position.x).toBeCloseTo(200, 0)
    rig.goTo('monitor')
    run(rig, TRANSITIONS.monitor.ms + 50)
    rig.setPointer({ x: -1, y: 0 })
    expect(run(rig, 200)).toBe(0)
  })

  it('jumps straight to the pose and ignores the pointer under reduced motion', () => {
    const camera = fakeCamera()
    const rig = new CameraRig(camera, true)
    rig.setAspect(ASPECT)
    rig.setPointer({ x: 1, y: 1 })
    run(rig, 100)
    expect(camera.position.x).toBe(0)
    rig.goTo('monitor')
    expect(rig.update(FRAME)).toBe(true)
    expect(camera.position.z).toBeCloseTo(monitorPose(ASPECT).position.z, 6)
  })
})
