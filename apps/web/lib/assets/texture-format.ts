/**
 * A 1×1 AVIF (sharp, `create` 1×1 black, `.avif()`); decoding it with createImageBitmap answers
 * "can this context (window or worker) use AVIF textures". Verified to decode in Chromium in both.
 */
const AVIF_1PX =
  'data:image/avif;base64,AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAAA+gABAAAAAAAAAB0AAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABhdjAxAAAAAA5waXRtAAAAAAABAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAlbWRhdBIACgc4AAaQENBpMhAZQmMEwAA0AACQQM6Xt10S'

export type TextureFormat = 'avif' | 'webp'

let cached: Promise<TextureFormat> | null = null

/**
 * Probed once per context, in the context that decodes the textures (the desk worker, or the main
 * thread when it draws): a window and a worker need not agree. Any failure (no AVIF decoder, no createImageBitmap) means WebP, which every context decodes. */
export function textureFormat(
  fetchImpl: (url: string) => Promise<Response> = (url) => globalThis.fetch(url),
  decode: (blob: Blob) => Promise<ImageBitmap> = (blob) => globalThis.createImageBitmap(blob),
): Promise<TextureFormat> {
  cached ??= Promise.resolve()
    .then(() => fetchImpl(AVIF_1PX))
    .then((r) => r.blob())
    .then((b) => decode(b))
    .then((bmp) => {
      bmp.close()
      return 'avif' as const
    })
    .catch(() => 'webp' as const)
  return cached
}

/** For tests. */
export const resetTextureFormat = (): void => {
  cached = null
}
