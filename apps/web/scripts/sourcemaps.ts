/**
 * After `next build`: give PostHog the browser source maps (when credentials are present), then
 * delete them so no map is ever served; also deletes the worker source copy Turbopack emits
 * (`removeSourceCopies`). Runs in the Docker build and in CI (`bun run build`).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAP_COMMENT = /\n?\/[/*][#@] sourceMappingURL=\S+?\.map(?: \*\/)?\s*$/

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

/** Deletes `*.map` under `dir` and the trailing comments that reference them; returns how many maps went. */
export function stripSourceMaps(dir: string): number {
  let removed = 0
  for (const file of walk(dir)) {
    if (file.endsWith('.map')) {
      unlinkSync(file)
      removed++
    } else if (file.endsWith('.js') || file.endsWith('.css')) {
      const text = readFileSync(file, 'utf8')
      const stripped = text.replace(MAP_COMMENT, '\n').replace(/\n+$/, '\n')
      if (stripped !== text) writeFileSync(file, stripped)
    }
  }
  return removed
}

/** TypeScript is never a browser asset: a file with one of these extensions under `media/` is a source copy. */
const SOURCE_COPY = /\.(?:ts|tsx|mts|cts)$/

/**
 * Deletes the TypeScript sources Turbopack copies into `<dir>/media`; returns their names.
 *
 * `new Worker(new URL('./desk.worker.ts', import.meta.url))` gets two references from Turbopack 16.3:
 * the worker entry (bundled to `chunks/turbopack-worker-*.js`, what actually runs) and the generic
 * `new URL(…, import.meta.url)` asset, which emits the untouched source as `media/desk.worker.<hash>.ts`.
 * The asset's module sits unrequired in the client chunk; nothing ever fetches the file. No call shape,
 * magic comment or config option avoids the second reference (all checked in a minimal app), so the copy
 * goes here, beside the maps, before anything serves `.next/static`. Drop this once Turbopack stops
 * emitting it (`removed 0 source copies` in the build log).
 */
export function removeSourceCopies(dir: string): string[] {
  const media = join(dir, 'media')
  if (!existsSync(media)) return []
  const removed = readdirSync(media).filter((name) => SOURCE_COPY.test(name))
  for (const name of removed) unlinkSync(join(media, name))
  return removed
}

if (import.meta.main) {
  const dir = join(process.cwd(), '.next/static')
  const { POSTHOG_CLI_TOKEN, POSTHOG_CLI_ENV_ID } = process.env
  if (POSTHOG_CLI_TOKEN && POSTHOG_CLI_ENV_ID) {
    for (const args of [['sourcemap', 'inject', '--directory', dir], ['sourcemap', 'upload', '--directory', dir]]) {
      const r = spawnSync('bunx', ['@posthog/cli@0.18.10', ...args], { stdio: 'inherit', shell: process.platform === 'win32' })
      // symbolication is a convenience: a failed upload never fails the build, the maps still go
      if (r.status !== 0) console.warn(`[sourcemaps] posthog-cli ${args[1]} exited ${r.status}`)
    }
  } else console.log('[sourcemaps] no POSTHOG_CLI_TOKEN/POSTHOG_CLI_ENV_ID: upload skipped')
  console.log(`[sourcemaps] removed ${stripSourceMaps(dir)} map(s) from .next/static`)
  const copies = removeSourceCopies(dir)
  console.log(`[sourcemaps] removed ${copies.length} source copies from .next/static/media${copies.length ? `: ${copies.join(', ')}` : ''}`)
}
