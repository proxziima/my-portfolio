import type { DeskAsset } from '../config'
import type { DeskGl } from './desk-gl'
import { GL_CONTEXT_ATTRIBUTES, type GlFailure, type GlHost } from './host'

/**
 * The desk's WebGL on the main thread, on a canvas of the page: each frame is drawn synchronously,
 * so `commit` runs right after it, in the same task. The fallback where a worker cannot render.
 *
 * The scene's code (three's renderer, the glTF loader, the meshopt decoder) is imported only when
 * this host is created, so a page whose desk draws in a worker never loads or parses it on the main
 * thread. Until it is in, frames are skipped (the caller keeps what is on screen and asks again) and
 * `load` waits for it. Whether WebGL exists is known at once, though: the context is created here
 * with the scene's attributes, and this throws without one, so the scene can report it.
 */
export function createMainHost(assets: readonly DeskAsset[]): GlHost {
  const canvas = document.createElement('canvas')
  canvas.style.display = 'block' // as three styles the canvas it creates itself
  const context = canvas.getContext('webgl2', GL_CONTEXT_ATTRIBUTES)
  if (!context) throw new Error('no WebGL2 context')
  const failed = new Set<(reason: GlFailure) => void>()
  let disposed = false
  let gl: DeskGl | null = null
  let size: [width: number, height: number, pixelRatio: number] | null = null
  // a lost context leaves a blank canvas: the scene gives up rather than show it (dispose loses it on purpose)
  canvas.addEventListener('webglcontextlost', () => {
    if (!disposed) for (const cb of failed) cb('context_lost')
  })
  const scene = import('./desk-gl').then(({ createDeskGl }) => {
    if (disposed) throw new Error('disposed')
    gl = createDeskGl(canvas) // the context above: same canvas, same attributes
    if (size) gl.resize(...size)
    return gl
  })
  scene.catch(() => {}) // a failed import surfaces through `load`; frames just stay skipped
  return {
    kind: 'main',
    canvas,
    load: async () => (await scene).load(assets),
    resize(width, height, pixelRatio) {
      size = [width, height, pixelRatio]
      gl?.resize(width, height, pixelRatio)
    },
    render(camera, commit) {
      if (!gl) return false
      commit(gl.render(camera))
      return true
    },
    onFail(cb) {
      failed.add(cb)
    },
    dispose() {
      disposed = true
      if (gl) gl.dispose()
      // the scene never came: free the context now, not at GC
      else (context as WebGL2RenderingContext).getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
