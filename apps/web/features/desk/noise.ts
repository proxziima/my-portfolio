/**
 * A tile of greyscale white noise as a PNG data URL, for the screen's static (the reference looped a
 * video; one small tile stepped across in CSS is enough at this opacity). Seeded with the same LCG
 * as the click sound, so a seed always yields the same tile. `null` where canvas 2D is unavailable
 * (jsdom, old browsers): the static then shows nothing.
 */
export function noiseDataUrl(size = 128, seed = 7): string | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const image = ctx.createImageData(size, size)
  const data = image.data
  let o = seed
  for (let i = 0; i < data.length; i += 4) {
    o = (o * 16807) % 2147483647
    const v = Math.floor((o / 2147483647) * 256)
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
    data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}
