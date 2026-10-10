import { fileURLToPath } from 'node:url'
import sharp, { type Sharp } from 'sharp'
import type { ImageAsset, ImageVariant, TextureAsset } from '../../../lib/assets/types.ts'
import { hashedName } from '../hash.ts'
import { composite, onSolid, ssim, type RawImage } from '../parity/image.ts'
import type { ImageFormat, Recipe } from '../recipes.ts'
import { assetPath, type StageOutput, type StageResult } from './stage.ts'

type ImageRecipe = Extract<Recipe, { kind: 'image' }>
type Quality = number | 'lossless'

/** The OS desktop on the screen slab, 640×512 (`node scripts/assets/parity/screen-under.ts`): what the CRT layers are judged over. */
const UNDER = fileURLToPath(new URL('../parity/screen-under.png', import.meta.url))
const START_Q = 90
const STEP = 4
/**
 * The search never goes below each encoder's own default quality. SSIM saturates on composited
 * layers and soft gradients: the shadow's AVIF passed at q2 (SSIM 0.9987) with 18-level errors and
 * visible blocking, for 0.6 KB less than q50. The floor only ever raises quality.
 */
const MIN_Q: Record<ImageFormat, number> = { avif: 50, webp: 80 }
/** Tried in order when even START_Q fails: keep quality, never loosen the gate. */
const HIGHER_Q = [94, 98, 100]

const MIME: Record<string, ImageVariant['type']> = { avif: 'image/avif', webp: 'image/webp', jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png' }

async function raw(input: Uint8Array | Sharp): Promise<RawImage> {
  const pipeline = input instanceof Uint8Array ? sharp(input) : input
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height }
}

/** The one resize every variant and its reference share, so parity compares encodes, not resamplers. */
const resized = (bytes: Uint8Array, width: number) => sharp(bytes).resize({ width, withoutEnlargement: true, kernel: 'lanczos3' })

function encode(bytes: Uint8Array, width: number, format: ImageFormat, q: Quality): Promise<Buffer> {
  const lossless = q === 'lossless'
  const quality = lossless ? 100 : q
  return format === 'avif'
    ? resized(bytes, width).avif({ quality, lossless, effort: 9, chromaSubsampling: '4:4:4' }).toBuffer()
    : resized(bytes, width).webp({ quality, lossless, effort: 6, smartSubsample: true }).toBuffer()
}

/**
 * The views a variant is judged in, at its own size: composited as the page draws it when the recipe
 * says so (over the screen capture scaled to that size), else over black and over white when it has
 * alpha (so errors in colour and in coverage both count), else as is.
 */
async function viewer(recipe: ImageRecipe, hasAlpha: boolean, width: number, height: number): Promise<(img: RawImage) => RawImage[]> {
  const mode = recipe.parity.composite
  if (mode) {
    const under = await raw(sharp(UNDER).resize(width, height, { fit: 'fill', kernel: 'lanczos3' }))
    return (img) => [composite(img, under, mode.mode, mode.opacity)]
  }
  if (hasAlpha) return (img) => [onSolid(img, [0, 0, 0]), onSolid(img, [255, 255, 255])]
  return (img) => [img]
}

interface Candidate {
  bytes: Uint8Array
  q: Quality | 'source'
  ssim: number
}

/**
 * Lowest quality from START_Q down in STEPs (not below `floor`) that still passes; if START_Q fails,
 * the first higher one that passes. Nothing bigger than `cap` is worth emitting, so the climb stops there.
 */
async function search(
  encodeAt: (q: Quality) => Promise<Uint8Array>,
  score: (b: Uint8Array) => Promise<number>,
  threshold: number,
  floor: number,
  cap: number,
): Promise<Candidate | null> {
  let best: Candidate | null = null
  for (let q = START_Q; q >= floor; q -= STEP) {
    const bytes = await encodeAt(q)
    const s = await score(bytes)
    if (s < threshold) break
    best = { bytes, q, ssim: s }
  }
  if (best) return best
  for (const q of HIGHER_Q) {
    const bytes = await encodeAt(q)
    if (bytes.byteLength > cap) return null
    const s = await score(bytes)
    if (s >= threshold) return { bytes, q, ssim: s }
  }
  return null
}

const round = (n: number) => Math.floor(n * 1e5) / 1e5

/**
 * sharp → AVIF and WebP at the recipe's widths, each at the lowest quality (not below the encoder's
 * default) whose SSIM against the source, resized identically, holds the recipe's gate. A variant
 * that cannot pass, or only passes at more bytes than the source file, is left out: the next larger
 * candidate serves that density at full quality. A format is kept only with its largest width, so a
 * browser on the AVIF `<source>` never ends up below the density it asked for. The last format is
 * the `<img>` fallback and always covers the largest width: lossless when no lossy quality passes,
 * and the source bytes as they are when nothing beats them.
 */
export async function imageStage(recipe: ImageRecipe, bytes: Uint8Array): Promise<StageResult> {
  const meta = await sharp(bytes).metadata()
  const srcW = meta.width
  const srcH = meta.height
  const srcExt = recipe.source.split('.').at(-1)!.toLowerCase()
  const widths = recipe.widths === 'source' ? [srcW] : [...new Set(recipe.widths.map((w) => Math.min(w, srcW)))].sort((a, b) => a - b)
  const top = widths.at(-1)!
  const named = recipe.widths !== 'source'

  const judges = new Map<number, { score: (b: Uint8Array) => Promise<number>; height: number }>()
  for (const width of widths) {
    const ref = await raw(resized(bytes, width))
    const views = await viewer(recipe, Boolean(meta.hasAlpha), ref.width, ref.height)
    const refViews = views(ref)
    judges.set(width, {
      height: ref.height,
      score: async (b) => {
        const cand = views(await raw(b))
        return Math.min(...cand.map((v, i) => ssim(refViews[i]!, v)))
      },
    })
  }

  const outputs: StageOutput[] = []
  const variants: ImageVariant[] = []
  const parity: Array<{ variant: string; q: Quality | 'source'; ssim: number }> = []
  const dropped: string[] = []
  for (const format of recipe.formats) {
    const fallback = format === recipe.formats.at(-1)
    const picked: Array<{ width: number; height: number; candidate: Candidate; ext: string }> = []
    for (const width of widths) {
      const judge = judges.get(width)!
      let candidate = await search((q) => encode(bytes, width, format, q), judge.score, recipe.parity.ssim, MIN_Q[format], bytes.byteLength)
      if (!candidate && fallback && width === top) {
        const lossless = await encode(bytes, width, format, 'lossless')
        const score = await judge.score(lossless)
        if (score >= recipe.parity.ssim) candidate = { bytes: lossless, q: 'lossless', ssim: score }
      }
      if (candidate && candidate.bytes.byteLength > bytes.byteLength) candidate = null
      if (candidate) {
        picked.push({ width, height: judge.height, candidate, ext: format })
      } else if (fallback && width === top) {
        // nothing beats the source file at full quality: serve it as it is, at its own size
        picked.push({ width: srcW, height: srcH, candidate: { bytes, q: 'source', ssim: 1 }, ext: srcExt })
      } else {
        dropped.push(`${format} ${width}w: no quality ≥ q${MIN_Q[format]} passes ssim ≥ ${recipe.parity.ssim} below the source's ${bytes.byteLength} bytes`)
      }
    }
    if (!fallback && !picked.some((p) => p.width === top)) {
      dropped.push(`${format}: left out whole, it has no ${top}w variant`)
      continue
    }
    // a wider variant that costs no more serves that density better (the smudges' AVIF passes at q54 at 2048 but needs q78 at 1280)
    const kept = picked.filter((p) => {
      const wider = picked.find((o) => o.width > p.width && o.candidate.bytes.byteLength <= p.candidate.bytes.byteLength)
      if (wider) dropped.push(`${p.ext} ${p.width}w: ${p.candidate.bytes.byteLength} bytes, not less than the ${wider.width}w variant`)
      return !wider
    })
    for (const { width, height, candidate, ext } of kept) {
      const path = assetPath(hashedName(recipe.source, candidate.bytes, named ? `${width}w.${ext}` : ext))
      outputs.push({ path, bytes: candidate.bytes, label: `${ext} ${width}w q${candidate.q} ssim ${round(candidate.ssim)}` })
      variants.push({ src: path, width, height, type: MIME[ext]! })
      parity.push({ variant: `${ext} ${width}w`, q: candidate.q, ssim: round(candidate.ssim) })
    }
  }

  const value: ImageAsset = { width: srcW, height: srcH, variants }
  return {
    outputs,
    value: value as unknown as StageResult['value'],
    parity: { gate: recipe.parity.ssim, variants: parity, ...(dropped.length ? { dropped } : {}) },
    tools: { sharp: sharp.versions.sharp ?? 'unknown', libvips: sharp.versions.vips },
  }
}

type TextureRecipe = Extract<Recipe, { kind: 'texture' }>

/**
 * A GL texture at the source size (2048², what the full-screen monitor samples): AVIF and WebP, each
 * at the lowest quality (not below the encoder's default) whose SSIM against the source holds the
 * gate. The source is already lossy, so generation loss is the risk: AVIF is kept only when a passing
 * encode is smaller than the source WebP, and the WebP is the source bytes, hashed, unless a passing
 * re-encode beats them.
 */
export async function textureStage(recipe: TextureRecipe, bytes: Uint8Array): Promise<StageResult> {
  const meta = await sharp(bytes).metadata()
  const { width, height } = meta
  const srcExt = recipe.source.split('.').at(-1)!.toLowerCase()
  if (srcExt !== 'webp') throw new Error(`${recipe.id}: texture sources are WebP (the fallback every context decodes), got .${srcExt}`)
  const views = (img: RawImage) => (meta.hasAlpha ? [onSolid(img, [0, 0, 0]), onSolid(img, [255, 255, 255])] : [img])
  const refViews = views(await raw(bytes))
  const score = async (b: Uint8Array) => {
    const cand = views(await raw(b))
    return Math.min(...cand.map((v, i) => ssim(refViews[i]!, v)))
  }

  const picked: Partial<Record<ImageFormat, Candidate>> = {}
  const dropped: string[] = []
  for (const format of ['avif', 'webp'] as const) {
    const candidate = await search((q) => encode(bytes, width, format, q), score, recipe.parity.ssim, MIN_Q[format], bytes.byteLength)
    if (candidate && candidate.bytes.byteLength < bytes.byteLength) picked[format] = candidate
    else dropped.push(`${format}: no quality ≥ q${MIN_Q[format]} passes ssim ≥ ${recipe.parity.ssim} below the source's ${bytes.byteLength} bytes`)
  }
  picked.webp ??= { bytes, q: 'source', ssim: 1 }

  const outputs: StageOutput[] = []
  const paths: Partial<Record<ImageFormat, string>> = {}
  const parity: Array<{ variant: string; q: Quality | 'source'; ssim: number }> = []
  for (const format of ['avif', 'webp'] as const) {
    const candidate = picked[format]
    if (!candidate) continue
    const path = assetPath(hashedName(recipe.source, candidate.bytes, format))
    paths[format] = path
    outputs.push({ path, bytes: candidate.bytes, label: `${format} q${candidate.q} ssim ${round(candidate.ssim)}` })
    parity.push({ variant: format, q: candidate.q, ssim: round(candidate.ssim) })
  }

  const value: TextureAsset = { ...(paths.avif ? { avif: paths.avif } : {}), webp: paths.webp!, width, height }
  return {
    outputs,
    value: value as unknown as StageResult['value'],
    parity: { gate: recipe.parity.ssim, variants: parity, ...(dropped.length ? { dropped } : {}) },
    tools: { sharp: sharp.versions.sharp ?? 'unknown', libvips: sharp.versions.vips },
  }
}
