export type HostKind = 'worker' | 'main'

/** Why the desk's WebGL gave up, for `experience_failed.reason`. */
export type GlFailure = 'webgl_unavailable' | 'load_error' | 'context_lost'

/** A host's rejection that knows its reason (anything else a load rejects with is a `load_error`). */
export class GlHostError extends Error {
  constructor(readonly reason: GlFailure) {
    super(reason)
  }
}

/**
 * One frame's camera as matrices. Float64, three's own precision: the GL side inverts the very
 * numbers the CSS3D side uses, and neither is rounded on the way (a worker gets the same copies).
 */
export interface GlFrameCamera {
  /** camera.matrixWorld.elements */
  view: Float64Array
  /** camera.projectionMatrix.elements */
  projection: Float64Array
}

/** Where the desk's WebGL lives. The engine drives it the same way whichever it is. */
export interface GlHost {
  /** Which thread draws the frames from now on (a worker host can hand over to the main thread). */
  readonly kind: HostKind
  /** The element the engine stacks over the CSS3D layer. */
  readonly canvas: HTMLCanvasElement
  /** Fetches the models into the scene; rejects on any failure. */
  load(): Promise<void>
  /** CSS size of the box and the (capped) pixel ratio the canvas renders at. */
  resize(width: number, height: number, pixelRatio: number): void
  /**
   * Draw a frame for `camera`. `commit` runs when the frame is on the canvas, in the same task, so
   * the caller can apply the matching CSS3D transform there; `models` says the desk is in it.
   * Returns false when the frame was skipped (the caller stays dirty and asks again next frame).
   */
  render(camera: GlFrameCamera, commit: (models: boolean) => void): boolean
  /** `cb` runs if the host can no longer draw once it has been created (its context was lost). */
  onFail(cb: (reason: GlFailure) => void): void
  dispose(): void
}
