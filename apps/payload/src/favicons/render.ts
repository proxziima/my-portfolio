import { spawn } from 'node:child_process'
import fs from 'node:fs'
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

/** Variables the child keeps from the CMS's environment: what the OS, sharp and its font lookup need, no secrets. */
const CHILD_ENV = ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LOCALAPPDATA']
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * The child's program, run with `-e` so there is no file to ship next to a bundled server. It reads
 * the job from FAVICON_JOB and the image from stdin, and writes a 64×64 PNG to stdout, exiting 0;
 * any other end means no icon. Every other way out is SIGKILL on itself: past the memory cap, past
 * its own time cap (in case the CMS died and cannot kill it), and on failure. `process.exit` would
 * wait for libvips' busy threads and let memory keep growing; a kill ends them at once.
 */
const WORKER = String.raw`
const job = JSON.parse(process.env.FAVICON_JOB)
const die = () => process.kill(process.pid, 'SIGKILL')
setInterval(() => { if (process.memoryUsage().rss > job.memoryBytes) die() }, job.pollMs)
setTimeout(die, job.timeoutMs + 1000).unref()
const sharp = require(require.resolve('sharp', { paths: job.paths }))
sharp.cache(false)
const chunks = []
process.stdin.on('data', (chunk) => chunks.push(chunk))
process.stdin.on('end', async () => {
  try {
    const data = Buffer.concat(chunks)
    const meta = await sharp(data, { limitInputPixels: job.maxPixels }).metadata()
    const expected = job.kind === 'svg' ? meta.format === 'svg' : job.rasterFormats.includes(meta.format)
    if (!expected) return die()
    const longest = Math.max(meta.width || 0, meta.height || 0)
    const density = longest ? Math.max(1, (72 * job.renderSize) / longest) : job.fallbackDensity
    const options = job.kind === 'svg' ? { density, limitInputPixels: job.maxPixels } : { limitInputPixels: job.maxPixels }
    const png = await sharp(data, options)
      .resize(job.size, job.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    process.stdout.write(png, () => process.exit(0))
  } catch {
    die()
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

/**
 * The child's environment: the job, plus the CHILD_ENV variables that are set. Never the CMS's
 * secrets (PAYLOAD_SECRET, database URL, API keys), nor NODE_OPTIONS (--inspect, loaders).
 */
function childEnv(job: object): NodeJS.ProcessEnv {
  const env: Record<string, string> = { FAVICON_JOB: JSON.stringify(job) }
  for (const name of CHILD_ENV) {
    const value = process.env[name]
    if (value !== undefined) env[name] = value
  }
  // The app's typings mark its own variables (PAYLOAD_SECRET…) as always set; the child has none of them.
  return env as NodeJS.ProcessEnv
}

/**
 * Node's permission model for the child, where Node has it: read access to the `node_modules`
 * directories from the sharp search paths up to the root (sharp and its native libraries, symlinked
 * or not, live under one of them), native addons allowed; no other reads, no writes, no child
 * processes, no workers. It only gates Node's own APIs, so it walls in the child's JavaScript, not
 * libvips; the process boundary and its caps are what contain the image decoders.
 */
function permissionFlags(paths: string[]): string[] {
  if (!process.allowedNodeEnvironmentFlags.has('--permission')) return []
  const reads = new Set<string>()
  for (const start of paths) {
    for (let dir = start; ; dir = path.dirname(dir)) {
      const modules = path.join(dir, 'node_modules')
      if (fs.existsSync(modules)) reads.add(modules)
      if (path.dirname(dir) === dir) break
    }
  }
  return ['--permission', ...[...reads].map((dir) => `--allow-fs-read=${dir}`), '--allow-addons']
}

let warnedAboutBun = false

/**
 * Decodes (`raster`) or draws (`svg`) the bytes as a 64×64 PNG (aspect kept, padded with
 * transparency) in a separate process running sharp, so a hostile image cannot take the CMS down:
 * the child is killed once `caps.timeoutMs` pass, and kills itself above `caps.memoryMb` of resident
 * memory. Images over 4096² pixels are refused, an SVG is drawn at about 256 px before scaling, and
 * animated input keeps its first frame. Resolves only after the child has exited: the PNG (checked
 * by its magic bytes), or null on any failure. Never throws.
 *
 * Runtime assumptions: the CMS runs on Node, so `process.execPath` is a node binary that runs the
 * `-e` program (under Bun it would be bun, so this fails closed), and its working directory is
 * apps/payload, where sharp resolves. Both hold for `next dev`, `next start`, `payload run` and the
 * Docker image (WORKDIR /app/apps/payload, whole workspace kept).
 */
export function renderInChild(data: Buffer, kind: IconKind, caps: RenderCaps): Promise<Buffer | null> {
  if (process.versions.bun) {
    if (!warnedAboutBun) console.warn('favicons: rendering needs Node (process.execPath is Bun); icons other than ICO are skipped')
    warnedAboutBun = true
    return Promise.resolve(null)
  }
  const paths = sharpSearchPaths()
  const job = {
    kind,
    size: SIZE,
    renderSize: RENDER_SIZE,
    fallbackDensity: FALLBACK_DENSITY,
    maxPixels: MAX_PIXELS,
    rasterFormats: RASTER_FORMATS,
    memoryBytes: caps.memoryMb * 1024 * 1024,
    pollMs: MEMORY_POLL_MS,
    timeoutMs: caps.timeoutMs,
    paths,
  }
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...permissionFlags(paths), '-e', WORKER], {
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
      const output = Buffer.concat(chunks)
      resolve(!killed && code === 0 && output.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC) ? output : null)
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
