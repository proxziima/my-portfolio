/**
 * The CRT loops' parity gate (spec §4.4). Every comparison runs on frame-indexed decodes (both sides
 * decoded to y4m with `-fps_mode passthrough`): timestamp matching mis-aligns WebM against the MP4
 * source by a frame and caps SSIM near 0.989 whatever the quality.
 *
 * - Composited parity, what the visitor sees: each frame drawn the way screen-fx.css draws it (the
 *   black veil, then the layer `plus-lighter` at its opacity) over the OS desktop capture, cropped to
 *   what `object-fit: cover` leaves visible, for the source and the encode. SSIM and VMAF on that.
 * - Layer statistics, so the grain is never smoothed away: luma mean, luma standard deviation and
 *   high-frequency energy (standard deviation of a 3×3 Laplacian) of the raw layer.
 * - Frame count identical; the loop seam (last frame against the first) is reported only.
 */
import { spawn } from 'node:child_process'
import { closeSync, openSync, readSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { ssim as imageSsim, VEIL } from './image.ts'

/** Binding thresholds; a codec that cannot meet them keeps a higher quality or is left out, never a looser gate. */
export const VIDEO_GATE = {
  /** Composited SSIM (ffmpeg `ssim`, All) at least. */
  ssim: 0.995,
  /** Composited VMAF (libvmaf v0.6.1) at least. */
  vmaf: 95,
  /** Mean luma within this fraction of the source's. */
  lumaMean: 0.02,
  /** Luma standard deviation at least this fraction of the source's. */
  lumaStd: 0.97,
  /** High-frequency energy at least this fraction of the source's. */
  hf: 0.95,
} as const

export type VideoGate = typeof VIDEO_GATE

/** Per-clip averages of the raw layer's per-frame statistics, on 8-bit luma. */
export interface LayerStats {
  frames: number
  lumaMean: number
  lumaStd: number
  hf: number
}

export interface Rect {
  width: number
  height: number
  x: number
  y: number
}

/** The part of a `videoW×videoH` frame that `object-fit: cover` shows in a `boxW×boxH` box, in video pixels (even sizes, for 4:2:0). */
export function coverCrop(videoW: number, videoH: number, boxW: number, boxH: number): Rect {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
  const box = boxW / boxH
  const video = videoW / videoH
  const width = video > box ? even(videoH * box) : videoW
  const height = video > box ? videoH : even(videoW / box)
  return { width, height, x: Math.floor((videoW - width) / 2), y: Math.floor((videoH - height) / 2) }
}

/** Mean, standard deviation and Laplacian energy (std of the 3×3 Laplacian over the interior) of one luma plane. */
export function planeStats(y: Uint8Array, width: number, height: number): { mean: number; std: number; hf: number } {
  let s = 0
  let ss = 0
  const n = width * height
  for (let i = 0; i < n; i++) {
    const v = y[i]!
    s += v
    ss += v * v
  }
  const mean = s / n
  let ls = 0
  let lss = 0
  for (let r = 1; r < height - 1; r++) {
    const row = r * width
    for (let c = 1; c < width - 1; c++) {
      const i = row + c
      const l = y[i - width]! + y[i + width]! + y[i - 1]! + y[i + 1]! - 4 * y[i]!
      ls += l
      lss += l * l
    }
  }
  const m = (width - 2) * (height - 2)
  const lm = ls / m
  return { mean, std: Math.sqrt(Math.max(0, ss / n - mean * mean)), hf: Math.sqrt(Math.max(0, lss / m - lm * lm)) }
}

export const parseSsim = (stderr: string): number => {
  const all = [...stderr.matchAll(/All:([0-9.]+)/g)].at(-1)?.[1]
  if (!all) throw new Error('no SSIM in ffmpeg output')
  return Number(all)
}

export const parseVmaf = (stderr: string): number => {
  const score = [...stderr.matchAll(/VMAF score: ([0-9.]+)/g)].at(-1)?.[1]
  if (!score) throw new Error('no VMAF score in ffmpeg output')
  return Number(score)
}

export interface VideoMetrics {
  frames: { source: number; encode: number }
  ssim: number
  vmaf: number
  /** Encode over source. */
  lumaMean: number
  lumaStd: number
  hf: number
}

/** Which thresholds an encode misses; empty means it passes. */
export function judge(m: VideoMetrics, gate: VideoGate = VIDEO_GATE): string[] {
  const misses: string[] = []
  if (m.frames.encode !== m.frames.source) misses.push(`frames ${m.frames.encode} ≠ ${m.frames.source}`)
  if (m.ssim < gate.ssim) misses.push(`ssim ${m.ssim} < ${gate.ssim}`)
  if (m.vmaf < gate.vmaf) misses.push(`vmaf ${m.vmaf} < ${gate.vmaf}`)
  if (Math.abs(m.lumaMean - 1) > gate.lumaMean) misses.push(`luma mean ×${m.lumaMean} outside ±${gate.lumaMean}`)
  if (m.lumaStd < gate.lumaStd) misses.push(`luma std ×${m.lumaStd} < ${gate.lumaStd}`)
  if (m.hf < gate.hf) misses.push(`hf energy ×${m.hf} < ${gate.hf}`)
  return misses
}

/**
 * One layer composited as screen-fx.css draws it, as an ffmpeg filter chain from input `layer` to
 * label `out`: the under (already labelled) dimmed by the veil, plus the layer at `opacity`, clipped
 * at white. Frames are re-stamped by index so `blend` pairs frame n with the still under, never by time.
 */
export function compositeChain(layer: string, under: string, out: string, opacity: number, crop: Rect): string {
  return (
    `[${layer}]setpts=N/(30*TB),crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},format=gbrp,` +
    `colorchannelmixer=rr=${opacity}:gg=${opacity}:bb=${opacity}[${out}l];` +
    `[${out}l][${under}]blend=all_mode=addition:shortest=1,format=yuv420p[${out}]`
  )
}

/** The OS desktop capture, scaled to the visible crop and veiled, `copies` times. */
export function underChain(input: string, crop: Rect, copies: string[]): string {
  const keep = (1 - VEIL).toFixed(4)
  return (
    `[${input}]setpts=N/(30*TB),scale=${crop.width}:${crop.height}:flags=lanczos,format=gbrp,` +
    `colorchannelmixer=rr=${keep}:gg=${keep}:bb=${keep},split=${copies.length}${copies.map((c) => `[${c}]`).join('')}`
  )
}

/** Runs ffmpeg (or ffprobe) and resolves with its stderr (and stdout); rejects with the tail of stderr. */
export function run(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
      // keep memory flat on chatty filters
      if (stderr.length > 4_000_000) stderr = stderr.slice(-1_000_000)
    })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${bin} ${args.join(' ')}\n${stderr.slice(-2000)}`))))
  })
}

/** Every frame of the first video stream, by index, as 8-bit 4:2:0 y4m: what every comparison reads. */
export async function decodeY4m(input: string, out: string): Promise<void> {
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-map', '0:v:0', '-fps_mode', 'passthrough', '-pix_fmt', 'yuv420p', '-strict', '-1', out])
}

/** Walks a 4:2:0 y4m's luma planes in order. */
export function* lumaFrames(y4m: string): Generator<{ y: Uint8Array; width: number; height: number }> {
  const fd = openSync(y4m, 'r')
  try {
    const head = Buffer.alloc(256)
    readSync(fd, head, 0, head.length, 0)
    const end = head.indexOf(0x0a)
    const header = head.subarray(0, end).toString('latin1')
    const width = Number(/ W(\d+)/.exec(header)?.[1])
    const height = Number(/ H(\d+)/.exec(header)?.[1])
    if (!width || !height || !/ C420/.test(header)) throw new Error(`${y4m}: not a 4:2:0 y4m (${header})`)
    const frameBytes = (width * height * 3) / 2
    let pos = end + 1
    const tag = Buffer.alloc(64)
    const y = new Uint8Array(width * height)
    for (;;) {
      const got = readSync(fd, tag, 0, tag.length, pos)
      if (got === 0) return
      const nl = tag.indexOf(0x0a)
      if (nl < 0 || tag.subarray(0, 5).toString('latin1') !== 'FRAME') throw new Error(`${y4m}: bad frame header at ${pos}`)
      pos += nl + 1
      if (readSync(fd, y, 0, y.length, pos) !== y.length) throw new Error(`${y4m}: truncated frame at ${pos}`)
      pos += frameBytes
      yield { y, width, height }
    }
  } finally {
    closeSync(fd)
  }
}

const grayRgba = (y: Uint8Array, width: number, height: number) => {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0, j = 0; i < y.length; i++, j += 4) {
    data[j] = data[j + 1] = data[j + 2] = y[i]!
    data[j + 3] = 255
  }
  return { data, width, height }
}

/** The raw layer's averaged statistics, and the loop seam (luma SSIM of the last frame against the first). */
export function layerStats(y4m: string): LayerStats & { seam: number } {
  let frames = 0
  let mean = 0
  let std = 0
  let hf = 0
  let first: ReturnType<typeof grayRgba> | null = null
  let last: { y: Uint8Array; width: number; height: number } | null = null
  for (const f of lumaFrames(y4m)) {
    const s = planeStats(f.y, f.width, f.height)
    mean += s.mean
    std += s.std
    hf += s.hf
    frames++
    first ??= grayRgba(f.y, f.width, f.height)
    last = f
  }
  if (!frames || !first || !last) throw new Error(`${y4m}: no frames`)
  return { frames, lumaMean: mean / frames, lumaStd: std / frames, hf: hf / frames, seam: imageSsim(first, grayRgba(last.y, last.width, last.height)) }
}

/** Composited SSIM and VMAF of `encode` against `source` (both y4m), over `under` (an image), in one ffmpeg pass. */
export async function compositedScores(source: string, encode: string, under: string, opacity: number, crop: Rect, frames: number): Promise<{ ssim: number; vmaf: number }> {
  const graph = [
    underChain('2:v', crop, ['u0', 'u1']),
    compositeChain('0:v', 'u0', 'e', opacity, crop),
    compositeChain('1:v', 'u1', 's', opacity, crop),
    '[e]split[e1][e2]',
    '[s]split[s1][s2]',
    '[e1][s1]ssim[ssim]',
    // libvmaf: distorted first, reference second
    `[e2][s2]libvmaf=n_threads=${availableParallelism()}[vmaf]`,
  ].join(';')
  const { stderr } = await run('ffmpeg', [
    '-hide_banner', '-nostats', '-i', encode, '-i', source, '-loop', '1', '-i', under,
    '-filter_complex', graph,
    '-map', '[ssim]', '-frames:v', String(frames), '-f', 'null', '-',
    '-map', '[vmaf]', '-frames:v', String(frames), '-f', 'null', '-',
  ])
  return { ssim: parseSsim(stderr), vmaf: parseVmaf(stderr) }
}

const ratio = (a: number, b: number) => (b === 0 ? (a === 0 ? 1 : Infinity) : a / b)
const round = (n: number, digits = 5) => Math.round(n * 10 ** digits) / 10 ** digits

/** The full gate for one encode (y4m) against the source (y4m, with its stats already taken). */
export async function gate(
  source: { y4m: string; stats: LayerStats },
  encodeY4m: string,
  under: string,
  opacity: number,
  crop: Rect,
): Promise<{ pass: boolean; metrics: VideoMetrics; misses: string[] }> {
  const enc = layerStats(encodeY4m)
  const frames = { source: source.stats.frames, encode: enc.frames }
  const scores = frames.encode === frames.source ? await compositedScores(source.y4m, encodeY4m, under, opacity, crop, frames.source) : { ssim: 0, vmaf: 0 }
  const raw: VideoMetrics = {
    frames,
    ...scores,
    lumaMean: ratio(enc.lumaMean, source.stats.lumaMean),
    lumaStd: ratio(enc.lumaStd, source.stats.lumaStd),
    hf: ratio(enc.hf, source.stats.hf),
  }
  // judged unrounded, so rounding for the lock can never turn a miss into a pass
  const misses = judge(raw)
  const metrics: VideoMetrics = { frames, ssim: round(raw.ssim, 6), vmaf: round(raw.vmaf, 3), lumaMean: round(raw.lumaMean, 4), lumaStd: round(raw.lumaStd, 4), hf: round(raw.hf, 4) }
  return { pass: misses.length === 0, metrics, misses }
}
