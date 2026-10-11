/** 8-bit RGBA, row-major: what `sharp(...).ensureAlpha().raw()` returns. */
export interface RawImage {
  data: Uint8Array
  width: number
  height: number
}

/** The black veil under the additive CRT layers (`--screen-veil` in features/desk/screen-fx.css). */
export const VEIL = 0.14

const WINDOW = 8
const STRIDE = 4
const C1 = (0.01 * 255) ** 2
const C2 = (0.03 * 255) ** 2

/** BT.601 luma; alpha is ignored (flatten with `composite`/`onSolid` first where it matters). */
function luma(img: RawImage): Float64Array {
  const out = new Float64Array(img.width * img.height)
  for (let p = 0, i = 0; p < out.length; p++, i += 4) out[p] = 0.299 * img.data[i]! + 0.587 * img.data[i + 1]! + 0.114 * img.data[i + 2]!
  return out
}

/** Window origins along one axis: every STRIDE px, plus the far edge so no strip goes unjudged. */
function origins(size: number, window: number): number[] {
  const last = size - window
  const out: number[] = []
  for (let o = 0; o < last; o += STRIDE) out.push(o)
  out.push(last)
  return out
}

/**
 * Mean SSIM on luma over 8×8 windows every 4 px (uniform weights; Wang et al. constants for 8-bit).
 * Written in TS so the image gate needs no ffmpeg. 1 means identical.
 */
export function ssim(a: RawImage, b: RawImage): number {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`size ${a.width}×${a.height} vs ${b.width}×${b.height}`)
  const x = luma(a)
  const y = luma(b)
  const { width, height } = a
  const ww = Math.min(WINDOW, width)
  const wh = Math.min(WINDOW, height)
  const n = ww * wh
  let total = 0
  let count = 0
  for (const oy of origins(height, wh))
    for (const ox of origins(width, ww)) {
      let sx = 0
      let sy = 0
      let sxx = 0
      let syy = 0
      let sxy = 0
      for (let j = 0; j < wh; j++) {
        const row = (oy + j) * width + ox
        for (let k = 0; k < ww; k++) {
          const vx = x[row + k]!
          const vy = y[row + k]!
          sx += vx
          sy += vy
          sxx += vx * vx
          syy += vy * vy
          sxy += vx * vy
        }
      }
      const mx = sx / n
      const my = sy / n
      const vx = sxx / n - mx * mx
      const vy = syy / n - my * my
      const cov = sxy / n - mx * my
      total += ((2 * mx * my + C1) * (2 * cov + C2)) / ((mx * mx + my * my + C1) * (vx + vy + C2))
      count++
    }
  return total / count
}

/**
 * The layer as the page draws it over `under` (same size), opaque out:
 * - `plus-lighter`: the veiled screen plus the layer's colour at `opacity`, clipped at white
 *   (`min(1, under × (1 − VEIL) + layer × opacity)`), as screen-fx.css blends the smudges;
 * - `normal`: alpha-over at the layer's alpha × `opacity`, as it draws the inner shadow.
 */
export function composite(layer: RawImage, under: RawImage, mode: 'plus-lighter' | 'normal', opacity: number): RawImage {
  if (layer.width !== under.width || layer.height !== under.height) throw new Error(`size ${layer.width}×${layer.height} vs ${under.width}×${under.height}`)
  const out = new Uint8Array(layer.data.length)
  const L = layer.data
  const U = under.data
  for (let i = 0; i < out.length; i += 4) {
    const a = (L[i + 3]! / 255) * opacity
    for (let c = 0; c < 3; c++) {
      const v = mode === 'plus-lighter' ? U[i + c]! * (1 - VEIL) + L[i + c]! * a : L[i + c]! * a + U[i + c]! * (1 - a)
      out[i + c] = Math.min(255, Math.round(v))
    }
    out[i + 3] = 255
  }
  return { data: out, width: layer.width, height: layer.height }
}

/** Flattens an RGBA image over a solid colour: judging over black and over white catches errors in colour and in alpha. */
export function onSolid(img: RawImage, rgb: readonly [number, number, number]): RawImage {
  const data = new Uint8Array(img.data.length)
  for (let i = 0; i < data.length; i += 4) data.set([...rgb, 255], i)
  return composite(img, { data, width: img.width, height: img.height }, 'normal', 1)
}
