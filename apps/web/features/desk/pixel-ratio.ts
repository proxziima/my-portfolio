/** Above 2× this scene looks no sharper; the cap bounds the cost on large high-density screens. */
export const MAX_PIXEL_RATIO = 2

/** The WebGL pixel ratio for a device pixel ratio: at least 1, at most the cap, 1 for nonsense. */
export const cappedPixelRatio = (devicePixelRatio: number): number =>
  Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? Math.min(MAX_PIXEL_RATIO, Math.max(1, devicePixelRatio)) : 1
