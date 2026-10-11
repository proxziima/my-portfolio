/**
 * Bundle assertions on the production build (`bun run perf:chunks`, i.e. node), run after `bun run build`.
 *
 * Starts `next start` (never 3000/3001), fetches `/` and `/os`, collects the scripts each document loads
 * up front (`<script src>` and script preloads), reads them from `.next/static` and asserts what must stay
 * out of that initial JS: the heavy libraries that load on demand. It also keeps the initial JS of each
 * document under a size budget, so a dependency that creeps into the boot path shows up as a number.
 * Neither page needs the CMS to render (it falls back), so this runs in CI beside the build.
 *
 *   node scripts/perf/chunks.ts [--port 3100] [--url http://host:port]
 *
 * Exit 1 on any failed assertion. A marker that no chunk of the build contains fails too: the library was
 * renamed or dropped and the assertion would otherwise pass for the wrong reason.
 */
import type { ChildProcess } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'
import { start, stop, waitFor } from './server.ts'

const { values } = parseArgs({ options: { port: { type: 'string', default: '3100' }, url: { type: 'string' } } })
const port = Number(values.port)
if (port === 3000 || port === 3001) throw new Error('ports 3000/3001 belong to the main checkout')
const origin = values.url ?? `http://localhost:${port}`

/**
 * Strings that only the named library's code contains, confirmed in a production build. They survive
 * minification because they are error messages or property names, not identifiers.
 */
const MARKERS = {
  posthog: '__PosthogExtensions__',
  three: 'THREE.WebGLRenderer',
  css3d: 'isCSS3DObject',
  eve: 'useEveAgent',
  zod: 'ZodError',
} as const
type Marker = keyof typeof MARKERS

/**
 * What each document must not load up front. posthog-js has its own chunk fetched only when a token is set;
 * three (WebGL and CSS3D) comes with the desk scene's dynamic import; eve and zod with the Messenger window.
 */
const FORBIDDEN: Record<string, Marker[]> = {
  '/': ['posthog', 'three', 'css3d', 'eve', 'zod'],
  '/os': ['posthog', 'three', 'css3d', 'eve', 'zod'],
}

/**
 * Initial JS budgets per document, raw / gzip bytes. Measured on the production build at 628 KB / 196 KB
 * (`/`) and 580 KB / 180 KB (`/os`), with about 10% headroom for ordinary growth: anything bigger is a
 * dependency or a client tree that should have been split or kept on the server.
 */
const BUDGET: Record<string, { raw: number; gzip: number }> = {
  '/': { raw: 700 * 1024, gzip: 215 * 1024 },
  '/os': { raw: 640 * 1024, gzip: 198 * 1024 },
}

const staticDir = resolve('.next/static')

/** Every JS file under `.next/static`, by path relative to `.next/static`. */
function allChunks(dir = staticDir, base = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? allChunks(join(dir, e.name), `${base}${e.name}/`) : e.name.endsWith('.js') ? [`${base}${e.name}`] : [],
  )
}

/** The script URLs a document loads at load: `<script src>` and `<link rel="preload" as="script">`. */
function initialScripts(html: string): string[] {
  const urls = new Set<string>()
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/g) ?? []) {
    const isScript = tag.startsWith('<script') && /\ssrc=/.test(tag)
    const isPreload = tag.startsWith('<link') && /\sas="script"/.test(tag)
    if (!isScript && !isPreload) continue
    const src = /\s(?:src|href)="([^"]+)"/.exec(tag)?.[1]
    if (src?.includes('/_next/static/')) urls.add(decodeURIComponent(src.split('?')[0]!.split('/_next/static/')[1]!))
  }
  return [...urls]
}

const kib = (n: number) => `${(n / 1024).toFixed(1)} KiB`
const failures: string[] = []

let server: ChildProcess | null = null
try {
  if (!values.url) {
    server = start(port)
  }
  await waitFor(`${origin}/`, 60_000)

  const files = new Map(allChunks().map((f) => [f, readFileSync(join(staticDir, f), 'utf8')]))
  for (const marker of Object.keys(MARKERS) as Marker[]) {
    if (![...files.values()].some((text) => text.includes(MARKERS[marker]))) {
      failures.push(`marker "${MARKERS[marker]}" (${marker}) is in no chunk of the build: update MARKERS`)
    }
  }

  for (const path of Object.keys(FORBIDDEN)) {
    const html = await fetch(`${origin}${path}`).then((r) => r.text())
    const scripts = initialScripts(html)
    if (scripts.length === 0) failures.push(`${path}: no initial scripts found in the document`)
    let raw = 0
    let gzip = 0
    for (const script of scripts) {
      const text = files.get(script)
      if (text === undefined) {
        failures.push(`${path}: initial script ${script} is not in .next/static (stale build?)`)
        continue
      }
      raw += Buffer.byteLength(text)
      gzip += gzipSync(text).length
      for (const marker of FORBIDDEN[path]!) {
        if (text.includes(MARKERS[marker])) failures.push(`${path}: initial chunk ${script} contains ${marker} (${MARKERS[marker]})`)
      }
    }
    const budget = BUDGET[path]!
    console.log(`${path.padEnd(4)} ${String(scripts.length).padStart(2)} scripts  raw ${kib(raw).padStart(10)} / ${kib(budget.raw)}  gzip ${kib(gzip).padStart(10)} / ${kib(budget.gzip)}`)
    if (raw > budget.raw) failures.push(`${path}: initial JS ${kib(raw)} raw is over the ${kib(budget.raw)} budget`)
    if (gzip > budget.gzip) failures.push(`${path}: initial JS ${kib(gzip)} gzip is over the ${kib(budget.gzip)} budget`)
  }
} finally {
  if (server) stop(server)
}

if (failures.length > 0) {
  console.error(`\n${failures.length} bundle assertion(s) failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('bundle assertions passed')
