/**
 * After `next build`: give PostHog the browser source maps (when credentials are present), then
 * delete them so no map is ever served. Runs in the Docker build and in CI (`bun run build`).
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
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
}
