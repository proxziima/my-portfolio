import type { TextureFormat } from '@/lib/assets/texture-format'
import type { DeskAsset } from '../config'

/** Main → worker. */
export type ToWorker =
  /** The canvas the worker draws on; it answers `ready` (a WebGL context) or `unsupported`. */
  | { type: 'init'; canvas: OffscreenCanvas }
  /** The desk's files with both texture encodes: the worker probes which one it can decode. */
  | { type: 'load'; assets: readonly DeskAsset[] }
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
  /** The models and textures are in the scene; `format`: the texture encode this worker decoded. */
  | { type: 'loaded'; format: TextureFormat }
  | { type: 'failed'; reason: 'load_error' | 'context_lost' }
