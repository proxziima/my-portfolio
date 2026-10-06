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

/** CI entry (the `changes` job). Needs a checkout with history (`fetch-depth: 0`). */
if (import.meta.main) {
  const event = process.env.GITHUB_EVENT_NAME ?? 'workflow_dispatch'
  const baseRef = process.env.GITHUB_BASE_REF
  let packages: string[] = []
  let files: string[] = []
  if (event === 'pull_request' && baseRef) {
    const base = `origin/${baseRef}`
    const query = JSON.parse(
      run(['bunx', 'turbo', 'query', 'affected', '--packages', '--base', base]),
    ) as {
      data: { affectedPackages: { items: Array<{ name: string }> } }
    }
    packages = query.data.affectedPackages.items.map((item) => item.name)
    files = run(['git', 'diff', '--name-only', `${base}...HEAD`])
      .split('\n')
      .filter(Boolean)
  }
  const outputs = toOutputs(decide({ event, packages, files }))
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, outputs)
  process.stdout.write(outputs)
}
