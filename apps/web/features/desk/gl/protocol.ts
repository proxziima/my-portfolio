import type { DeskAssetUrls } from '../assets'

/** Main → worker. */
export type ToWorker =
  /** The canvas the worker draws on; it answers `ready` (a WebGL context) or `unsupported`. */
  | { type: 'init'; canvas: OffscreenCanvas }
  /** The main thread has already chosen AVIF or WebP (`textureFormat()`): the worker gets plain URLs. */
  | { type: 'load'; assets: DeskAssetUrls }
  | { type: 'resize'; width: number; height: number; pixelRatio: number }
  /** Render one frame with this camera; `id` is echoed so the main thread pairs it with its CSS3D pose. */
  | { type: 'render'; id: number; view: Float64Array /* matrixWorld, 16 */; projection: Float64Array /* 16 */ }

/** Worker → main. */
export type FromWorker =
  /** The context exists: frames can be asked for. */
  | { type: 'ready' }
  /** No WebGL in this worker: the main thread draws instead. */
  | { type: 'unsupported' }
  | { type: 'frame'; id: number; bitmap: ImageBitmap; models: boolean }
  /** The models and textures are in the scene. */
  | { type: 'loaded' }
  | { type: 'failed'; reason: 'load_error' | 'context_lost' }
