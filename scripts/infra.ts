/**
 * Local infrastructure for the portfolio twin: Postgres 17 on 127.0.0.1:5433 with the `twin`
 * (development) and `twin_eval` (evals) databases, each migrated and with eve's Workflow world.
 *
 *   bun run infra          start Postgres and prepare both databases
 *   bun run infra:down     stop Postgres
 *   bun run infra:status   report whether Postgres accepts connections
 *
 * Backend: WSL on Windows when the distro has a Postgres cluster on the port, otherwise
 * `docker-compose.dev.yml`. Force one with TWIN_INFRA=wsl|docker. The WSL distro defaults to
 * Ubuntu-24.04 (override with TWIN_WSL_DISTRO).
 */

import { fileURLToPath } from 'node:url'

const PORT = 5433
const ROLE = 'twin'
const DATABASES = ['twin', 'twin_eval'] as const
const DISTRO = process.env.TWIN_WSL_DISTRO ?? 'Ubuntu-24.04'
const ROOT = fileURLToPath(new URL('..', import.meta.url))

type Backend = 'wsl' | 'docker'

/**
 * Runs a command without a shell (no quoting surprises) and returns its exit code and output.
 * A missing executable is reported as exit code 127, like a shell would, instead of throwing.
 */
async function run(cmd: string[], opts: { env?: Record<string, string>; stdin?: string; quiet?: boolean } = {}) {
  if (!Bun.which(cmd[0] ?? '')) return { code: 127, text: `${cmd[0]}: command not found` }
  const proc = Bun.spawn(cmd, {
    cwd: ROOT,
    env: { ...process.env, ...opts.env },
    stdin: opts.stdin === undefined ? 'ignore' : new TextEncoder().encode(opts.stdin),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  // WSL writes some messages as UTF-16; strip the NULs so they stay readable.
  const text = `${out}${err}`.replaceAll('\0', '')
  if (!opts.quiet && text.trim()) console.log(text.trimEnd())
  return { code, text }
}

/** Fails with a clear message instead of a stack trace. */
function fail(message: string): never {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

const wsl = (user: 'root' | 'postgres', ...args: string[]) => ['wsl', '-d', DISTRO, '-u', user, '--', ...args]

/** The WSL cluster (version and name) listening on PORT, or null when there is none. */
async function wslCluster(): Promise<{ version: string; name: string } | null> {
  if (process.platform !== 'win32') return null
  const { code, text } = await run(wsl('root', 'pg_lsclusters', '-h'), { quiet: true })
  if (code !== 0) return null
  for (const line of text.split('\n')) {
    const [version, name, port] = line.trim().split(/\s+/)
    if (version && name && port === String(PORT)) return { version, name }
  }
  return null
}

/** Picks the backend: explicit TWIN_INFRA, else WSL when it hosts the cluster, else Docker. */
async function backend(): Promise<Backend> {
  const forced = process.env.TWIN_INFRA
  if (forced === 'wsl' || forced === 'docker') return forced
  if (forced) fail(`TWIN_INFRA must be "wsl" or "docker", got "${forced}"`)
  return (await wslCluster()) ? 'wsl' : 'docker'
}

/** True once Postgres accepts connections on PORT. */
async function ready(kind: Backend): Promise<boolean> {
  const probe =
    kind === 'wsl'
      ? wsl('postgres', 'pg_isready', '-q', '-p', String(PORT))
      : ['docker', 'compose', '-f', 'docker-compose.dev.yml', 'exec', '-T', 'postgres', 'pg_isready', '-q', '-U', ROLE]
  return (await run(probe, { quiet: true })).code === 0
}

/** Polls readiness for up to 30 seconds. */
async function waitReady(kind: Backend): Promise<void> {
  for (let i = 0; i < 30; i++) {
    if (await ready(kind)) return
    await Bun.sleep(1000)
  }
  fail(`Postgres did not accept connections on 127.0.0.1:${PORT} within 30 s`)
}

/** Idempotent role and database creation, run as the superuser inside the backend. */
async function ensureDatabases(kind: Backend): Promise<void> {
  const sql = [
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN CREATE ROLE ${ROLE} LOGIN PASSWORD '${ROLE}' CREATEDB; END IF; END $$;`,
    ...DATABASES.map((db) => `SELECT 'CREATE DATABASE ${db} OWNER ${ROLE}' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${db}')\\gexec`),
  ].join('\n')
  const psql =
    kind === 'wsl'
      ? wsl('postgres', 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-p', String(PORT))
      : ['docker', 'compose', '-f', 'docker-compose.dev.yml', 'exec', '-T', 'postgres', 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', ROLE, '-d', 'twin']
  const { code } = await run(psql, { stdin: `${sql}\n` })
  if (code !== 0) fail('Could not create the twin role or databases (see the psql output above)')
}

/** Applies the twin migrations and eve's Workflow world schema to one database. */
async function prepare(db: string): Promise<boolean> {
  const url = `postgres://${ROLE}:${ROLE}@127.0.0.1:${PORT}/${db}`
  console.log(`\n→ ${db}: twin migrations`)
  const migrate = await run(['bun', 'run', '--cwd', 'packages/twin', 'db:migrate'], { env: { TWIN_DATABASE_URL: url } })
  if (migrate.code !== 0) {
    if (migrate.text.includes('already exists')) {
      console.error(
        `  ${db} holds a twin schema that predates migration tracking. Reset it (its tables hold no real data):\n` +
          `  psql "${url}" -c "DROP SCHEMA twin CASCADE;"  then run \`bun run infra\` again.`,
      )
    }
    return false
  }
  console.log(`→ ${db}: eve Workflow world`)
  const world = await run(['bun', 'run', '--cwd', 'apps/agents', 'world:setup'], { env: { WORKFLOW_POSTGRES_URL: url } })
  return world.code === 0
}

/** Starts Postgres and prepares every database; exits non-zero if any database isn't ready. */
async function up(): Promise<void> {
  const kind = await backend()
  console.log(`Postgres via ${kind === 'wsl' ? `WSL (${DISTRO})` : 'docker-compose.dev.yml'} on 127.0.0.1:${PORT}`)
  if (kind === 'wsl') {
    const cluster = await wslCluster()
    if (!cluster) fail(`No Postgres cluster on port ${PORT} in WSL distro ${DISTRO}. See apps/agents/README.md, local setup.`)
    // Exit code 2 means "already running", which is fine.
    const start = await run(wsl('root', 'pg_ctlcluster', cluster.version, cluster.name, 'start'), { quiet: true })
    if (start.code !== 0 && start.code !== 2) fail(`pg_ctlcluster start failed:\n${start.text}`)
  } else {
    const start = await run(['docker', 'compose', '-f', 'docker-compose.dev.yml', 'up', '-d', '--wait', 'postgres'])
    if (start.code !== 0) fail('docker compose could not start postgres (is Docker installed and running?)')
  }
  await waitReady(kind)
  await ensureDatabases(kind)
  const results = []
  for (const db of DATABASES) results.push(await prepare(db))
  if (results.includes(false)) fail('Postgres is up, but not every database is ready (see above)')
  console.log(`\n✓ Postgres ready on 127.0.0.1:${PORT}: ${DATABASES.join(', ')} migrated with the Workflow world`)
}

/** Stops Postgres (data stays on disk). */
async function down(): Promise<void> {
  const kind = await backend()
  if (kind === 'wsl') {
    const cluster = await wslCluster()
    if (!cluster) fail(`No Postgres cluster on port ${PORT} in WSL distro ${DISTRO}`)
    await run(wsl('root', 'pg_ctlcluster', cluster.version, cluster.name, 'stop'))
  } else {
    await run(['docker', 'compose', '-f', 'docker-compose.dev.yml', 'stop', 'postgres'])
  }
  console.log('✓ Postgres stopped')
}

/** Reports readiness; exit code 1 when Postgres is down. */
async function status(): Promise<void> {
  const kind = await backend()
  const ok = await ready(kind)
  console.log(`${ok ? '✓' : '✗'} Postgres (${kind}) on 127.0.0.1:${PORT} ${ok ? 'accepts connections' : 'is not running'}`)
  if (!ok) process.exit(1)
}

const command = process.argv[2] ?? 'up'
if (command === 'up') await up()
else if (command === 'down') await down()
else if (command === 'status') await status()
else fail(`Unknown command "${command}". Use up, down or status.`)
