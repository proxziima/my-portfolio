import type { DeskAssetUrls } from '../assets'
import { createDeskGl } from './desk-gl'
import type { GlHost } from './host'

/**
 * The desk's WebGL on the main thread, on a canvas of the page: each frame is drawn synchronously,
 * so `commit` runs right after it, in the same task. The fallback where a worker cannot render.
 * Throws if WebGL is unavailable, so the scene can report it.
 */
export function createMainHost(assets: DeskAssetUrls | Promise<DeskAssetUrls>): GlHost {
  const canvas = document.createElement('canvas')
  canvas.style.display = 'block' // as three styles the canvas it creates itself
  const gl = createDeskGl(canvas, assets)
  return {
    kind: 'main',
    canvas,
    load: () => gl.load(),
    resize: (width, height, pixelRatio) => gl.resize(width, height, pixelRatio),
    render(camera, commit) {
      commit(gl.render(camera))
      return true
    },
    dispose: () => gl.dispose(),
  }
}
