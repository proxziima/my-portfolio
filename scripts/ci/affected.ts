import { appendFileSync } from 'node:fs'

/** Workspaces CI gates separately, by output key, with their package names. */
export const WORKSPACES = { web: 'web', cms: 'cms', agents: 'agents', twin: '@repo/twin' } as const
export type Workspace = keyof typeof WORKSPACES

/** Production images and the Dockerfile each is built from (the build context is the repo root). */
export const IMAGES = [
  { service: 'web', dockerfile: 'apps/web/Dockerfile' },
  { service: 'cms', dockerfile: 'apps/payload/Dockerfile' },
  { service: 'agents', dockerfile: 'apps/agents/Dockerfile' },
] as const
export type Image = (typeof IMAGES)[number]

/** Files outside every workspace whose change can affect anything: lockfile, root config, compose, CI. */
const REPO_WIDE = [
  /^bun\.lock$/,
  /^package\.json$/,
  /^turbo\.json$/,
  /^\.npmrc$/,
  /^docker-compose[^/]*\.ya?ml$/,
  /^\.dockerignore$/,
  /^\.github\//,
  /^scripts\//,
]

export interface Affected {
  /** Everything is checked: not a pull request, or a repo-wide file changed. */
  all: boolean
  workspaces: Record<Workspace, boolean>
  images: Image[]
}

/** What a CI run has to check, from the event, Turbo's affected packages and the changed files. */
export function decide(input: {
  event: string
  packages: readonly string[]
  files: readonly string[]
}): Affected {
  const all =
    input.event !== 'pull_request' ||
    input.files.some((file) => REPO_WIDE.some((re) => re.test(file)))
  const workspaces = Object.fromEntries(
    (Object.entries(WORKSPACES) as Array<[Workspace, string]>).map(([key, name]) => [
      key,
      all || input.packages.includes(name),
    ]),
  ) as Record<Workspace, boolean>
  return { all, workspaces, images: IMAGES.filter((image) => workspaces[image.service]) }
}

/** `key=value` lines for `$GITHUB_OUTPUT`; lists are JSON so workflows can `fromJSON` them. */
export function toOutputs(affected: Affected): string {
  const entries = Object.entries(affected.workspaces)
  return [
    `all=${affected.all}`,
    ...entries.map(([key, value]) => `${key}=${value}`),
    `images=${JSON.stringify(affected.images)}`,
    `affected=${JSON.stringify(entries.filter(([, value]) => value).map(([key]) => key))}`,
    '',
  ].join('\n')
}

function run(cmd: string[]): string {
  const result = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'inherit' })
  if (result.exitCode !== 0) throw new Error(`${cmd.join(' ')} exited with ${result.exitCode}`)
  return result.stdout.toString()
}

interface TurboQuery {
  data?: { affectedPackages?: { items: Array<{ name: string }> } } | null
  errors?: Array<{ message: string }>
}

/**
 * Gathers the event, Turbo's affected packages and the changed files. Throws rather than report
 * "nothing changed" when a pull request cannot be compared against its base.
 */
export function collect(
  env: Record<string, string | undefined>,
  run: (cmd: string[]) => string,
): { event: string; packages: string[]; files: string[] } {
  const event = env.GITHUB_EVENT_NAME ?? 'workflow_dispatch'
  if (event !== 'pull_request') return { event, packages: [], files: [] }
  if (!env.GITHUB_BASE_REF) throw new Error('GITHUB_BASE_REF is not set on a pull_request run')
  const base = `origin/${env.GITHUB_BASE_REF}`
  const query = JSON.parse(
    run(['bunx', 'turbo', 'query', 'affected', '--packages', '--base', base]),
  ) as TurboQuery
  if (query.errors?.length) {
    throw new Error(`turbo query failed: ${query.errors.map((e) => e.message).join('; ')}`)
  }
  const items = query.data?.affectedPackages?.items
  if (!items) throw new Error('turbo query returned no affectedPackages')
  // -z and --no-renames: paths are NUL-separated and unquoted, and a move reports both paths.
  const files = run(['git', 'diff', '--name-only', '--no-renames', '-z', `${base}...HEAD`])
    .split('\0')
    .filter(Boolean)
  return { event, packages: items.map((item) => item.name), files }
}

/** CI entry (the `changes` job). Needs a checkout with history (`fetch-depth: 0`). */
if (import.meta.main) {
  const outputs = toOutputs(decide(collect(process.env, run)))
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, outputs)
  process.stdout.write(outputs)
}
