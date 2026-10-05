import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** A forbidden string found in a shipped client file. */
export interface Leak {
  path: string
  kind: 'name' | 'value' | 'marker'
  needle: string
}

/** Every forbidden needle found in the given files; secret values are never echoed. */
export function findLeaks(
  files: ReadonlyArray<{ path: string; text: string }>,
  f: { names: string[]; values: string[]; markers: string[] },
): Leak[] {
  const leaks: Leak[] = []
  for (const file of files) {
    for (const [kind, list] of [
      ['name', f.names],
      ['value', f.values],
      ['marker', f.markers],
    ] as const) {
      for (const needle of list) {
        if (needle && file.text.includes(needle)) {
          leaks.push({ path: file.path, kind, needle: kind === 'value' ? '<redacted>' : needle })
        }
      }
    }
  }
  return leaks
}

/** Server-only env names: none may appear in anything the browser downloads. */
export const SECRET_NAMES = [
  'TWIN_JWT_SECRET',
  'TWIN_COOKIE_SECRET',
  'TWIN_REDACT_SECRET',
  'TWIN_STABLE_KEY_SECRET',
  'TWIN_BOOKING_REF_SECRET',
  'TWIN_PROMPT_CANARY',
  'TWIN_DATABASE_URL',
  'WORKFLOW_POSTGRES_URL',
  'OPENROUTER_API_KEY',
  'PAYLOAD_MCP_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'CAL_WEBHOOK_SECRET',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'EXA_API_KEY',
  'REVALIDATE_SECRET',
  'PREVIEW_SECRET',
]

/** Fragments of the composed system prompt that must never ship to a browser. */
const MARKERS = ['<skill name=', '<conversation_state>', '<untrusted source=', 'Internal marker']

/** Lists every file under a directory. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

/** CI entry: scans apps/web/.next/static after `next build` with known test secrets set. */
if (import.meta.main) {
  const dir = process.argv[2] ?? 'apps/web/.next/static'
  const files = walk(dir)
    .filter((p) => /\.(js|css|html|json|map)$/.test(p))
    .map((p) => ({ path: p, text: readFileSync(p, 'utf8') }))
  if (files.length === 0) throw new Error(`no client files under ${dir}: was the web app built?`)
  const values = SECRET_NAMES.map((n) => process.env[n] ?? '').filter((v) => v.length >= 12)
  const leaks = findLeaks(files, { names: SECRET_NAMES, values, markers: MARKERS })
  if (leaks.length > 0) {
    console.error(leaks.map((l) => `${l.path}: ${l.kind} ${l.needle}`).join('\n'))
    process.exit(1)
  }
  console.log(`client bundle clean (${files.length} files, ${values.length} secret values checked)`)
}
