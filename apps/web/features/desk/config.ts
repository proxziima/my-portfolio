import { ASSETS, type TextureAsset } from '@/lib/assets/manifest'

/** Where the OS lives; the iframe's `src` and the "Open the desktop" link. */
export const OS_PATH = '/os'

export interface Vec3 { x: number; y: number; z: number }

/** The reference's models are authored at 1/900 of the scene units the camera keyframes use. */
export const MODEL_SCALE = 900

/** The monitor's screen: an iframe of this many CSS px, in scene units, set into the model's bezel. */
export const SCREEN = {
  width: 1280,
  height: 1024,
  /** Inner margin so the OS clears the tube's curved edge. */
  padding: 32,
  position: { x: 0, y: 950, z: 255 } as Vec3,
  /** The tube is tilted slightly back. */
  tiltDeg: -3,
  /** Depth of the bezel planes that enclose the screen (the reference's 24 × 4). */
  depth: 96,
} as const

export const CAMERA = { fov: 35, near: 10, far: 900_000 } as const

export interface DeskAsset {
  /** A meshopt-compressed GLB. */
  model: string
  texture: TextureAsset
  /** Nodes removed after load. */
  drop?: readonly string[]
}

const D = ASSETS.desk

// textures are 2048²: a 600×400 box at ≤2× never shows more, and 4096² would cost ~64 MB of GPU memory each
/** The desk: three baked GLBs and their textures (assets-src/desk, built by scripts/assets). */
export const DESK_ASSETS: readonly DeskAsset[] = [
  { model: D.computer.model, texture: D.computer.texture },
  { model: D.decor.model, texture: D.decor.texture },
  // the room's back wall would hide the page's paper behind the transparent canvas
  { model: D.environment.model, texture: D.environment.texture, drop: ['Background'] },
]
