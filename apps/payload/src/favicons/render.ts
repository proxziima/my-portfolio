import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** What the child is asked to read the bytes as; anything else sharp reports is refused. */
export type IconKind = 'raster' | 'svg'

/** Caps on one child: wall time from spawn to exit, and resident memory. */
export interface RenderCaps {
  timeoutMs: number
  memoryMb: number
}

/** The stored PNG's edge in pixels. */
const SIZE = 64
/** The longest side, in pixels, an SVG is drawn at before it is scaled down to SIZE. */
const RENDER_SIZE = 256
/** Used when an SVG declares no size of its own. */
const FALLBACK_DENSITY = 384
/** Images larger than this (width × height, an SVG at its render density) are refused, not decoded. */
const MAX_PIXELS = 4096 * 4096
/** What sharp may read a raster file as, by the format it reports. */
const RASTER_FORMATS = ['png', 'jpeg', 'gif', 'webp', 'heif', 'tiff']
/** A 64×64 PNG is a few KB; anything this large is not one. */
const MAX_OUTPUT = 1_000_000
/** How often the child checks its own memory. */
const MEMORY_POLL_MS = 25

/**
 * The child's program, run with `-e` so there is no file to ship next to a bundled server. It reads
 * the job from FAVICON_JOB and the image from stdin, and writes a 64×64 PNG to stdout, exiting 0;
 * any other exit means no icon. It exits itself once its resident memory passes the cap: exiting
 * ends libvips' threads with it, which a timed-out promise in the CMS process could not do.
 */
const WORKER = String.raw`
const job = JSON.parse(process.env.FAVICON_JOB)
setInterval(() => { if (process.memoryUsage().rss > job.memoryBytes) process.exit(3) }, job.pollMs)
const sharp = require(require.resolve('sharp', { paths: job.paths }))
sharp.cache(false)
const chunks = []
process.stdin.on('data', (chunk) => chunks.push(chunk))
process.stdin.on('end', async () => {
  try {
    const data = Buffer.concat(chunks)
    const meta = await sharp(data, { limitInputPixels: job.maxPixels }).metadata()
    const expected = job.kind === 'svg' ? meta.format === 'svg' : job.rasterFormats.includes(meta.format)
    if (!expected) process.exit(2)
    const longest = Math.max(meta.width || 0, meta.height || 0)
    const density = longest ? Math.max(1, (72 * job.renderSize) / longest) : job.fallbackDensity
    const options = job.kind === 'svg' ? { density, limitInputPixels: job.maxPixels } : { limitInputPixels: job.maxPixels }
    const png = await sharp(data, options)
      .resize(job.size, job.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    process.stdout.write(png, () => process.exit(0))
  } catch {
    process.exit(2)
  }
})
`

/** Where the child looks for sharp: the app's directory (the CMS runs from it), then this module's. */
function sharpSearchPaths(): string[] {
  const paths = [process.cwd()]
  try {
    paths.push(path.dirname(fileURLToPath(import.meta.url)))
  } catch {
    // Not a file: URL once bundled; the working directory is enough.
  }
  return paths
}

/** The CMS's environment for the child, minus NODE_OPTIONS (it may hold --inspect or loaders). */
function childEnv(job: object): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, FAVICON_JOB: JSON.stringify(job) }
  delete env.NODE_OPTIONS
  return env
}

/**
 * Decodes (`raster`) or draws (`svg`) the bytes as a 64×64 PNG (aspect kept, padded with
 * transparency) in a separate process running sharp, so a hostile image cannot take the CMS down:
 * the child is killed once `caps.timeoutMs` pass, and exits itself above `caps.memoryMb` of resident
 * memory. Images over 4096² pixels are refused, an SVG is drawn at about 256 px before scaling, and
 * animated input keeps its first frame. Resolves only after the child has exited: the PNG, or null
 * on any failure. Never throws.
 */
export function renderInChild(data: Buffer, kind: IconKind, caps: RenderCaps): Promise<Buffer | null> {
  const job = {
    kind,
    size: SIZE,
    renderSize: RENDER_SIZE,
    fallbackDensity: FALLBACK_DENSITY,
    maxPixels: MAX_PIXELS,
    rasterFormats: RASTER_FORMATS,
    memoryBytes: caps.memoryMb * 1024 * 1024,
    pollMs: MEMORY_POLL_MS,
    paths: sharpSearchPaths(),
  }
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', WORKER], {
      env: childEnv(job),
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    })
    const chunks: Buffer[] = []
    let size = 0
    let killed = false
    const kill = () => {
      killed = true
      child.kill('SIGKILL')
    }
    const timer = setTimeout(kill, Math.max(0, caps.timeoutMs))
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_OUTPUT) kill()
      else chunks.push(chunk)
    })
    // 'close' follows the exit, once stdio is done; 'error' covers a child that could not start.
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(!killed && code === 0 && size > 0 ? Buffer.concat(chunks) : null)
    })
    child.on('error', () => {
      if (child.pid !== undefined) return
      clearTimeout(timer)
      resolve(null)
    })
    child.stdin.on('error', () => {})
    child.stdin.end(data)
  })
}
