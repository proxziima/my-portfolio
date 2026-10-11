import type { DeskAssetUrls } from '../assets'
import { GlHostError, type GlFailure, type GlHost } from './host'
import { createMainHost } from './main-host'
import { createWorkerHost, type WorkerHost } from './worker-host'

type Urls = DeskAssetUrls | Promise<DeskAssetUrls>

/** A worker can draw the desk where it gets an OffscreenCanvas it can hand frames back from. */
const workerCanDraw = () =>
  typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && 'transferToImageBitmap' in OffscreenCanvas.prototype

/**
 * Where the desk's WebGL lives: in a worker where the browser can (off the main thread), else on
 * the main thread with the same scene. The worker is tried first and the main thread takes over if
 * it cannot render, or fails later; neither is a failure, the visitor sees the same scene.
 * `?deskHost=main` forces the main thread (debugging). Throws only if the main host is needed at
 * once and has no WebGL.
 */
export function selectHost(assets: Urls, search: string = globalThis.location?.search ?? ''): GlHost {
  const main = () => createMainHost(assets)
  if (new URLSearchParams(search).get('deskHost') === 'main' || !workerCanDraw()) return main()
  let worker: WorkerHost
  try {
    worker = createWorkerHost(assets)
  } catch {
    return main()
  }
  return withFallback(worker, main)
}

/**
 * `primary` until it fails, then the host `makeFallback` builds, swapped in without a visible seam:
 * the failed host's last frame stays up (the CSS3D layer with it, as no frame commits) until the
 * fallback can draw a frame with as much in it, models included if they were shown. That frame and
 * the swap of the canvases happen in the one commit, so the page shows one or the other, never a
 * blank canvas or a desk without its models.
 */
function withFallback(primary: WorkerHost, makeFallback: () => GlHost): GlHost {
  let active: GlHost = primary
  let fallback: GlHost | null = null
  /** The fallback could not be created either: nothing can draw. */
  let gaveUp = false
  let disposed = false
  let size: [width: number, height: number, pixelRatio: number] | null = null
  let loading: Promise<void> | null = null
  let primaryLoaded = false
  let fallbackLoad: Promise<void> | null = null
  let fallbackLoaded = false
  /** A frame with the models has been on screen: the fallback must not show less. */
  let shownModels = false
  const failed = new Set<(reason: GlFailure) => void>()
  const report = (reason: GlFailure) => {
    for (const cb of failed) cb(reason)
  }

  const loadFallback = (host: GlHost) =>
    (fallbackLoad ??= host.load().then(() => {
      fallbackLoaded = true
    }))

  /** The primary cannot draw (any more): build the fallback, sized, and loading if the models were asked for. */
  function failOver() {
    if (fallback || gaveUp || disposed) return
    try {
      fallback = makeFallback()
    } catch {
      gaveUp = true
      // a pending load reports it through its rejection
      if (!loading || primaryLoaded) report('webgl_unavailable')
      return
    }
    fallback.onFail(report)
    if (size) fallback.resize(...size)
    if (loading) {
      const load = loadFallback(fallback)
      // with the primary's load already resolved, nobody awaits this one: say it failed
      if (primaryLoaded) load.catch(() => report('load_error'))
    }
  }

  primary.ready.catch(failOver)
  primary.onFail(failOver)

  async function load() {
    if (!fallback && !gaveUp) {
      try {
        await primary.load()
        primaryLoaded = true
        return
      } catch {
        failOver()
      }
    }
    if (!fallback) throw new GlHostError('webgl_unavailable')
    await loadFallback(fallback)
  }

  return {
    // the thread that draws from now on: once failed over, the fallback's, though the old frame may still be up
    get kind() {
      return (fallback ?? active).kind
    },
    get canvas() {
      return active.canvas
    },
    load() {
      loading ??= load()
      return loading
    },
    resize(width, height, pixelRatio) {
      size = [width, height, pixelRatio]
      active.resize(width, height, pixelRatio)
      if (fallback && fallback !== active) fallback.resize(width, height, pixelRatio)
    },
    render(camera, commit) {
      if (fallback && active !== fallback) {
        if (shownModels && !fallbackLoaded) return false
        const previous = active
        const next = fallback
        return next.render(camera, (models) => {
          // the replacement takes the old canvas's place and the styling the engine gave it, at the stylesheet's size
          next.canvas.style.cssText = previous.canvas.style.cssText
          next.canvas.style.width = ''
          next.canvas.style.height = ''
          previous.canvas.replaceWith(next.canvas)
          active = next
          previous.dispose()
          commit(models)
        })
      }
      if (gaveUp) return false
      return active.render(camera, (models) => {
        if (models) shownModels = true
        commit(models)
      })
    },
    onFail(cb) {
      failed.add(cb)
    },
    dispose() {
      disposed = true
      if (active === primary) primary.dispose()
      fallback?.dispose()
    },
  }
}
