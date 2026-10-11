import type { DeskAssetUrls } from '../assets'
import { createDeskGl } from './desk-gl'
import type { GlFailure, GlHost } from './host'

/**
 * The desk's WebGL on the main thread, on a canvas of the page: each frame is drawn synchronously,
 * so `commit` runs right after it, in the same task. The fallback where a worker cannot render.
 * Throws if WebGL is unavailable, so the scene can report it.
 */
export function createMainHost(assets: DeskAssetUrls | Promise<DeskAssetUrls>): GlHost {
  const canvas = document.createElement('canvas')
  canvas.style.display = 'block' // as three styles the canvas it creates itself
  const gl = createDeskGl(canvas)
  const failed = new Set<(reason: GlFailure) => void>()
  let disposed = false
  // a lost context leaves a blank canvas: the scene gives up rather than show it (dispose loses it on purpose)
  canvas.addEventListener('webglcontextlost', () => {
    if (!disposed) for (const cb of failed) cb('context_lost')
  })
  return {
    kind: 'main',
    canvas,
    load: async () => gl.load(await assets),
    resize: (width, height, pixelRatio) => gl.resize(width, height, pixelRatio),
    render(camera, commit) {
      commit(gl.render(camera))
      return true
    },
    onFail(cb) {
      failed.add(cb)
    },
    dispose() {
      disposed = true
      gl.dispose()
    },
  }
}
