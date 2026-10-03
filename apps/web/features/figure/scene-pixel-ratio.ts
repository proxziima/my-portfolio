import type { Application } from '@splinetool/runtime'

/** Above 2× this scene looks no sharper; the cap bounds the cost on large high-density screens. */
export const MAX_PIXEL_RATIO = 2

/**
 * Ratios are rounded up to this step so a window drag resizes the buffer a few times, not every
 * frame; rounding up never renders below the screen's density.
 */
const RATIO_STEP = 0.25

/**
 * The WebGL pixel ratio that renders the device pixels the stage covers once it is scaled by `fit`
 * into the figure box (`devicePixelRatio` alone oversamples by 1 / fit: ~2.5× on a phone), rounded
 * up to `RATIO_STEP` and capped at `MAX_PIXEL_RATIO`.
 */
export function scenePixelRatio(devicePixelRatio: number, fit: number): number {
  const ratio = devicePixelRatio * fit
  return Number.isFinite(ratio) && ratio > 0
    ? Math.min(MAX_PIXEL_RATIO, Math.ceil(ratio / RATIO_STEP) * RATIO_STEP)
    : 1
}

/** The runtime internals we rely on: the renderer it sets the ratio on at load, and its resize. */
interface RuntimeInternals {
  _renderer?: { setPixelRatio?: (ratio: number) => void }
  /** The runtime's own resize; `true` forces it even at an unchanged size, which a new ratio needs. */
  _resize?: (force?: boolean) => void
}

/**
 * Sets the loaded scene's pixel ratio. The runtime has no public option for it, so this reaches the
 * internals, feature-detected: if a runtime upgrade moves them, the scene keeps the runtime's
 * default ratio rather than breaking. The renderer skips a resize at an unchanged size, so a ratio
 * change alone leaves the buffer as it was; the forced resize applies it (and redraws).
 */
export function applyPixelRatio(app: Application, ratio: number): void {
  const internals = app as unknown as RuntimeInternals
  const renderer = internals._renderer
  if (typeof renderer?.setPixelRatio !== 'function' || typeof internals._resize !== 'function') return
  renderer.setPixelRatio(ratio)
  internals._resize(true)
}
