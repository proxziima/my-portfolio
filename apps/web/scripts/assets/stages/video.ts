import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SCREEN } from '../../../features/desk/config.ts'
import type { VideoAsset, VideoSource } from '../../../lib/assets/types.ts'
import { hashedName } from '../hash.ts'
import { coverCrop, decodeY4m, gate, layerStats, run, VIDEO_GATE, type VideoMetrics } from '../parity/video.ts'
import type { Recipe } from '../recipes.ts'
import { ffmpeg } from '../tools.ts'
import { firstPassingBelow, highestPassingCrf } from './crf-search.ts'
import { assetPath, type StageOutput, type StageResult } from './stage.ts'

type VideoRecipe = Extract<Recipe, { kind: 'video' }>
type Codec = VideoRecipe['codecs'][number]

/** The OS desktop on the screen slab (`node scripts/assets/parity/screen-under.ts`): what the layers are judged over. */
const UNDER = fileURLToPath(new URL('../parity/screen-under.png', import.meta.url))

interface CodecSpec {
  ext: 'webm' | 'mp4'
  /** The spec's search range (§4.4). */
  range: readonly [number, number]
  /** Searched only when even the range's lowest CRF fails: a higher quality, never a looser gate. */
  floor: number
  args: (crf: number) => string[]
}

/** The encodes of spec §4.4. Audio is dropped (`-an`): the layers are always muted, so that loses nothing. */
export const CODECS: Record<Codec, CodecSpec> = {
  av1: {
    ext: 'webm',
    range: [16, 40],
    floor: 1,
    // tune=0 (visual quality); enable-tf=0 so temporal filtering does not smear the grain
    args: (crf) => ['-c:v', 'libsvtav1', '-preset', '4', '-crf', String(crf), '-g', '300', '-svtav1-params', 'tune=0:enable-tf=0:enable-qm=1', '-pix_fmt', 'yuv420p'],
  },
  vp9: {
    ext: 'webm',
    range: [16, 40],
    floor: 0,
    args: (crf) => ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-arnr-maxframes', '0', '-pix_fmt', 'yuv420p'],
  },
  h264: {
    ext: 'mp4',
    range: [14, 28],
    floor: 1,
    // level 3.0 caps x264's reference frames to what the `avc1.4D401E` type promises
    args: (crf) => ['-c:v', 'libx264', '-preset', 'veryslow', '-tune', 'grain', '-crf', String(crf), '-profile:v', 'main', '-level:v', '3.0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'],
  },
}

export interface StreamProbe {
  codec_name: string
  profile?: string
  level?: number
  pix_fmt?: string
  width: number
  height: number
}

/**
 * The `<source type>` for an encode, from what ffprobe reads back, so the type never promises more
 * (or less) than the file holds: AV1 Main 8-bit at its level, VP9 profile 0 8-bit level 3.0, H.264
 * Main up to level 3.0.
 */
export function sourceType(codec: Codec, p: StreamProbe): string {
  if (p.pix_fmt !== 'yuv420p') throw new Error(`${codec}: expected yuv420p, got ${p.pix_fmt}`)
  if (codec === 'av1') {
    if (p.codec_name !== 'av1' || p.profile !== 'Main' || p.level === undefined || p.level < 0) throw new Error(`av1: unexpected stream ${JSON.stringify(p)}`)
    return `video/webm; codecs="av01.0.${String(p.level).padStart(2, '0')}M.08"`
  }
  if (codec === 'vp9') {
    if (p.codec_name !== 'vp9' || (p.profile !== undefined && p.profile !== 'Profile 0')) throw new Error(`vp9: unexpected stream ${JSON.stringify(p)}`)
    // level 3.0 covers 640×480 at 30 fps (picture size ≤ 552,960 luma samples)
    if (p.width * p.height > 552_960) throw new Error(`vp9: ${p.width}×${p.height} exceeds level 3.0`)
    return 'video/webm; codecs="vp09.00.30.08"'
  }
  if (p.codec_name !== 'h264' || p.profile !== 'Main' || p.level === undefined || p.level > 30) throw new Error(`h264: unexpected stream ${JSON.stringify(p)}`)
  return `video/mp4; codecs="avc1.4D40${p.level.toString(16).toUpperCase().padStart(2, '0')}"`
}

async function probe(file: string): Promise<StreamProbe> {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,profile,level,pix_fmt,width,height', '-of', 'json', file])
  const stream = (JSON.parse(stdout) as { streams: StreamProbe[] }).streams[0]
  if (!stream) throw new Error(`${file}: no video stream`)
  return stream
}

interface Trial {
  bytes: Uint8Array
  metrics: VideoMetrics
  misses: string[]
}

interface Pick {
  codec: Codec
  bytes: Uint8Array
  type: string
  setting: string
  metrics: VideoMetrics
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`

/**
 * ffmpeg → AV1, VP9 and H.264, each at the highest CRF whose encode passes the composited parity
 * gate (parity/video.ts). When even the range's lowest CRF fails, lower (higher-quality) CRFs are
 * tried; the gate is never loosened. A codec is served only when its passing encode is smaller than
 * every codec after it (a browser that plays AV1 also plays VP9 and H.264, so a bigger AV1 would only
 * cost it bytes) and than the source's own video stream. H.264, the fallback every browser plays,
 * then serves that stream as it is when no encode beats it (remuxed without the muted audio: the
 * same pixels). So every emitted source passes the gate, and there is always one.
 */
export async function videoStage(recipe: VideoRecipe, bytes: Uint8Array): Promise<StageResult> {
  const tool = ffmpeg()
  const dir = mkdtempSync(join(tmpdir(), 'assets-video-'))
  try {
    const src = join(dir, 'source.mp4')
    writeFileSync(src, bytes)
    const srcProbe = await probe(src)
    const crop = coverCrop(srcProbe.width, srcProbe.height, SCREEN.width, SCREEN.height)
    const srcY4m = join(dir, 'source.y4m')
    await decodeY4m(src, srcY4m)
    const { seam, ...stats } = layerStats(srcY4m)
    const source = { y4m: srcY4m, stats }

    // the lossless baseline: the source's own video stream without its audio
    const remux = join(dir, 'remux.mp4')
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-map', '0:v:0', '-an', '-c:v', 'copy', '-movflags', '+faststart', remux])
    const remuxBytes = new Uint8Array(readFileSync(remux))

    if (recipe.codecs.at(-1) !== 'h264') throw new Error(`${recipe.id}: the last codec must be h264, the fallback every browser plays`)
    const picks: Pick[] = []
    const dropped: string[] = []
    const trials: Record<string, Array<{ crf: number; bytes: number; pass: boolean; misses?: string[] }>> = {}
    // last first: each codec is worth serving only below what the browsers that skip it would get
    for (const codec of [...recipe.codecs].reverse()) {
      const spec = CODECS[codec]
      const cap = Math.min(remuxBytes.byteLength, ...picks.map((p) => p.bytes.byteLength))
      const capWhat = picks.length ? `${picks.at(-1)!.codec}'s ${cap} bytes` : `the source stream's ${cap} bytes`
      const tried = new Map<number, Trial>()
      const log = (trials[codec] = [] as (typeof trials)[string])
      const passes = async (crf: number): Promise<boolean> => {
        const out = join(dir, `${codec}-${crf}.${spec.ext}`)
        await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-map', '0:v:0', '-an', ...spec.args(crf), out])
        const encY4m = join(dir, 'encode.y4m')
        await decodeY4m(out, encY4m)
        const verdict = await gate(source, encY4m, UNDER, recipe.layer.opacity, crop)
        const encBytes = new Uint8Array(readFileSync(out))
        tried.set(crf, { bytes: encBytes, metrics: verdict.metrics, misses: verdict.misses })
        log.push({ crf, bytes: encBytes.byteLength, pass: verdict.pass, ...(verdict.pass ? {} : { misses: verdict.misses }) })
        console.log(`  ${recipe.id} ${codec} crf ${crf}: ${kb(encBytes.byteLength)} ${verdict.pass ? 'pass' : `fail (${verdict.misses.join('; ')})`}`)
        rmSync(out)
        return verdict.pass
      }
      const [lo, hi] = spec.range
      const crf = (await highestPassingCrf(lo, hi, passes)) ?? (await firstPassingBelow(lo - 1, spec.floor, passes, (c) => tried.get(c)!.bytes.byteLength >= cap))
      const trial = crf === null ? null : tried.get(crf)!
      if (trial && trial.bytes.byteLength < cap) {
        const file = join(dir, `pick.${spec.ext}`)
        writeFileSync(file, trial.bytes)
        picks.push({ codec, bytes: trial.bytes, type: sourceType(codec, await probe(file)), setting: `crf ${crf}`, metrics: trial.metrics })
        continue
      }
      const why = trial ? `passes only at crf ${crf}, ${trial.bytes.byteLength} bytes, not below ${capWhat}` : `no crf passes below ${capWhat}`
      if (codec === 'h264') {
        // identical pixels by construction: the gate is passed trivially, and recorded as such
        picks.push({
          codec,
          bytes: remuxBytes,
          type: sourceType('h264', srcProbe),
          setting: 'source stream',
          metrics: { frames: { source: stats.frames, encode: stats.frames }, ssim: 1, vmaf: 100, lumaMean: 1, lumaStd: 1, hf: 1 },
        })
        dropped.push(`h264: ${why}; serving the source stream without audio`)
      } else {
        dropped.push(`${codec}: ${why}; left out`)
      }
    }
    // back to selection order
    picks.reverse()

    const outputs: StageOutput[] = []
    const sources: VideoSource[] = []
    for (const p of picks) {
      const path = assetPath(hashedName(recipe.source, p.bytes, `${p.codec}.${CODECS[p.codec].ext}`))
      outputs.push({ path, bytes: p.bytes, label: `${p.codec} ${p.setting} ssim ${p.metrics.ssim} vmaf ${p.metrics.vmaf}` })
      sources.push({ src: path, type: p.type })
    }
    const value: VideoAsset = { width: srcProbe.width, height: srcProbe.height, sources }
    return {
      outputs,
      value: value as unknown as StageResult['value'],
      parity: {
        gate: { ...VIDEO_GATE, composite: { opacity: recipe.layer.opacity, crop: `${crop.width}x${crop.height}+${crop.x}+${crop.y}` } },
        sourceBytes: bytes.byteLength,
        seam: Math.round(seam * 1e5) / 1e5,
        variants: picks.map((p) => ({ codec: p.codec, setting: p.setting, bytes: p.bytes.byteLength, ...p.metrics })),
        ...(dropped.length ? { dropped } : {}),
        trials,
      } as unknown as StageResult['parity'],
      tools: { ffmpeg: tool.version },
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

