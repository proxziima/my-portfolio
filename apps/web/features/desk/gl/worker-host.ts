import type { DeskAssetUrls } from '../assets'
import { FrameRing } from './frame-ring'
import type { GlFailure, GlHost } from './host'
import type { FromWorker, ToWorker } from './protocol'

/** A host whose WebGL lives in a worker; it can draw once `ready` resolves. */
export interface WorkerHost extends GlHost {
  /** Resolves once the worker has a WebGL context; rejects (and stops the worker) if it cannot. */
  readonly ready: Promise<void>
}

/** What a frame's arrival applies: the engine's commit, and the CSS size the frame was drawn for. */
interface InFlight {
  commit: (models: boolean) => void
  width: number
  height: number
}

interface Deferred {
  promise: Promise<void>
  resolve: () => void
  reject: (e: Error) => void
}

function deferred(): Deferred {
  const d = {} as Deferred
  d.promise = new Promise<void>((resolve, reject) => Object.assign(d, { resolve, reject }))
  return d
}

/** How long the worker gets to load and create its context before the main thread draws instead. */
const READY_TIMEOUT_MS = 3000

/**
 * The desk's WebGL in a worker, on an OffscreenCanvas; each frame comes back as an ImageBitmap and
 * goes onto a `bitmaprenderer` canvas of the page. The bitmap and the engine's commit (the CSS3D
 * transform of the same camera) land in one message task, so they reach the screen in the same
 * paint: under load both layers wait together, never one without the other. The canvas only ever
 * changes by taking a new frame, so it never shows a blank one; while a resize is in flight it
 * keeps the last frame at the size it was drawn for, where the CSS3D layer still is.
 * Throws at once where a canvas has no `bitmaprenderer` (no worker is started then).
 */
export function createWorkerHost(assets: DeskAssetUrls | Promise<DeskAssetUrls>, timeoutMs = READY_TIMEOUT_MS): WorkerHost {
  const canvas = document.createElement('canvas')
  canvas.style.display = 'block' // as the main host's
  const view = canvas.getContext('bitmaprenderer', { alpha: true })
  if (!view) throw new Error('no bitmaprenderer context')
  const offscreen = new OffscreenCanvas(1, 1)
  const worker = new Worker(new URL('./desk.worker.ts', import.meta.url), { type: 'module', name: 'desk' })
  const ring = new FrameRing<InFlight>()
  const failed = new Set<(reason: GlFailure) => void>()
  const send = (message: ToWorker, transfer: Transferable[] = []) => worker.postMessage(message, transfer)

  let state: 'starting' | 'ready' | 'stopped' = 'starting'
  /** The CSS size last asked for: a frame drawn for it shows at the stylesheet's 100 %. */
  let size = { width: 0, height: 0 }
  /** The CSS size of the frame on the canvas (the CSS3D layer's too). */
  let shown: { width: number; height: number } | null = null
  let loading: Deferred | null = null
  const ready = deferred()
  ready.promise.catch(() => {}) // the caller decides what a worker that never got ready means

  const timer = setTimeout(() => stop(new Error('desk worker timeout')), timeoutMs)

  /** The worker is gone for good: before `ready` it never was, after it the context is lost. */
  function stop(error: Error) {
    if (state === 'stopped') return
    const wasReady = state === 'ready'
    state = 'stopped'
    clearTimeout(timer)
    worker.terminate()
    loading?.reject(error)
    if (!wasReady) return ready.reject(error)
    // no frame will follow: the last one stays at the size it was drawn for, where the CSS3D layer stays too
    if (shown) {
      canvas.style.width = `${shown.width}px`
      canvas.style.height = `${shown.height}px`
    }
    for (const cb of failed) cb('context_lost')
  }

  worker.onmessage = ({ data }: MessageEvent<FromWorker>) => {
    switch (data.type) {
      case 'ready':
        if (state !== 'starting') return
        state = 'ready'
        clearTimeout(timer)
        ready.resolve()
        return
      case 'unsupported':
        return stop(new Error('no WebGL in the desk worker'))
      case 'loaded':
        return loading?.resolve()
      case 'failed':
        if (data.reason === 'load_error') return loading?.reject(new Error('desk models failed to load'))
        return stop(new Error('the desk worker lost its WebGL context'))
      case 'frame': {
        const entry = ring.settle(data.id)
        if (!entry || state === 'stopped') {
          data.bitmap.close()
          return
        }
        view.transferFromImageBitmap(data.bitmap)
        shown = { width: entry.width, height: entry.height }
        const current = entry.width === size.width && entry.height === size.height
        canvas.style.width = current ? '' : `${entry.width}px`
        canvas.style.height = current ? '' : `${entry.height}px`
        entry.commit(data.models)
      }
    }
  }
  worker.onerror = (event) => {
    event.preventDefault() // handled: the main thread takes over, not an uncaught page error
    stop(new Error('the desk worker failed'))
  }
  worker.onmessageerror = () => stop(new Error('the desk worker sent an unreadable message'))

  send({ type: 'init', canvas: offscreen }, [offscreen])

  return {
    kind: 'worker',
    canvas,
    ready: ready.promise,
    load() {
      if (loading) return loading.promise
      const load = (loading = deferred())
      if (state === 'stopped') load.reject(new Error('the desk worker is stopped'))
      else
        Promise.resolve(assets).then(
          (urls) => {
            if (state !== 'stopped') send({ type: 'load', assets: urls })
          },
          (e: unknown) => load.reject(e instanceof Error ? e : new Error(String(e))),
        )
      return load.promise
    },
    resize(width, height, pixelRatio) {
      size = { width, height }
      if (state !== 'stopped') send({ type: 'resize', width, height, pixelRatio })
    },
    render(camera, commit) {
      if (state !== 'ready') return false
      const id = ring.push({ commit, width: size.width, height: size.height })
      if (id === null) return false // three in flight: the engine stays dirty and asks again next frame
      send({ type: 'render', id, view: camera.view, projection: camera.projection })
      return true
    },
    onFail(cb) {
      failed.add(cb)
    },
    dispose() {
      state = 'stopped'
      clearTimeout(timer)
      worker.onmessage = null
      worker.terminate()
    },
  }
}
