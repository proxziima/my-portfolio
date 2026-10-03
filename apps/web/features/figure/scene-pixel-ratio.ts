import type { Application } from '@splinetool/runtime'

/** Above 2× this scene looks no sharper; the cap bounds the cost on large high-density screens. */
export const MAX_PIXEL_RATIO = 2

/**
 * The WebGL pixel ratio that renders exactly the device pixels the stage covers once it is scaled by
 * `fit` into the figure box (`devicePixelRatio` alone oversamples by 1 / fit: ~2.5× on a phone).
 */
export function scenePixelRatio(devicePixelRatio: number, fit: number): number {
  const ratio = devicePixelRatio * fit
  return Number.isFinite(ratio) && ratio > 0 ? Math.min(MAX_PIXEL_RATIO, ratio) : 1
}

/** The one runtime internal we rely on: the renderer the runtime itself sets the ratio on at load. */
interface RendererInternals {
  _renderer?: { setPixelRatio?: (ratio: number) => void }
}

/**
 * Sets the loaded scene's pixel ratio. The runtime has no public option for it, so this reaches the
 * internal renderer, feature-detected: if a runtime upgrade moves it, the scene keeps the runtime's
 * default ratio rather than breaking.
 */
export function applyPixelRatio(app: Application, ratio: number): void {
  const renderer = (app as unknown as RendererInternals)._renderer
  if (typeof renderer?.setPixelRatio !== 'function') return
  renderer.setPixelRatio(ratio)
  app.requestRender()
}
