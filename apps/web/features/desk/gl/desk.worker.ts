import { createDeskGl, type DeskGl } from './desk-gl'
import type { FromWorker, ToWorker } from './protocol'

/** What the worker needs of its global scope (typed here: the DOM and webworker libs clash in one program). */
export interface DeskWorkerScope {
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null
  postMessage(message: FromWorker, transfer: Transferable[]): void
}

/**
 * The desk's GL scene on the OffscreenCanvas the main thread sends: answers each `render` with the
 * frame as an ImageBitmap (transferred, no copy) and the id it came with. A frame is only ever sent
 * when it was drawn: with the context lost the main thread keeps its last frame and is told why.
 */
export function serveDesk(scope: DeskWorkerScope, create: (canvas: OffscreenCanvas) => DeskGl = createDeskGl): void {
  let gl: DeskGl | null = null
  let canvas: OffscreenCanvas | null = null
  let lost = false
  const post = (message: FromWorker, transfer: Transferable[] = []) => scope.postMessage(message, transfer)

  scope.onmessage = ({ data }) => {
    switch (data.type) {
      case 'init': {
        try {
          gl = create(data.canvas)
        } catch {
          post({ type: 'unsupported' })
          return
        }
        canvas = data.canvas
        // three keeps the scene for a restore, but a restore would come too late to be seamless: the main thread takes over
        canvas.addEventListener('webglcontextlost', () => {
          if (lost) return
          lost = true
          post({ type: 'failed', reason: 'context_lost' })
        })
        post({ type: 'ready' })
        return
      }
      case 'load':
        // the texture format is probed here, in the worker, which is what decodes the textures
        gl?.load(data.assets).then(
          (format) => post({ type: 'loaded', format }),
          () => post({ type: 'failed', reason: 'load_error' }),
        )
        return
      case 'resize':
        gl?.resize(data.width, data.height, data.pixelRatio)
        return
      case 'render': {
        if (!gl || !canvas || lost) return
        const models = gl.render({ view: data.view, projection: data.projection })
        // the drawing buffer as it is now (preserveDrawingBuffer stays false: each frame is drawn whole)
        const bitmap = canvas.transferToImageBitmap()
        post({ type: 'frame', id: data.id, bitmap, models }, [bitmap])
      }
    }
  }
}

// only as a worker: imported elsewhere (tests) it must not claim the window's messages
if (typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope === 'function') serveDesk(globalThis as unknown as DeskWorkerScope)
