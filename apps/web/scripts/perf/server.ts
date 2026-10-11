/** Start/stop helpers for the production server the perf scripts measure (`next start`). */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'

const win = process.platform === 'win32'

/** Polls `target` until it answers 2xx, or throws after `timeoutMs`. */
export function waitFor(target: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  return new Promise((done, fail) => {
    const tick = () =>
      fetch(target)
        .then((r) => (r.ok ? done() : retry()))
        .catch(retry)
    const retry = () => (Date.now() > deadline ? fail(new Error(`${target} did not answer`)) : setTimeout(tick, 1000))
    tick()
  })
}

/** Runs the package `build` script (`next build`, then the source maps are stripped as in the Docker image). */
export function build(): void {
  const r = spawnSync('bun', ['run', 'build'], { stdio: 'inherit', shell: win })
  if (r.status !== 0) throw new Error(`bun run build exited ${r.status}`)
}

/** Starts `next start` on `port` (the build must exist). */
export function start(port: number): ChildProcess {
  return spawn('bunx', ['next', 'start', '-p', String(port)], { stdio: 'ignore', shell: win })
}

/** `next start` runs under a shell on Windows: kill the whole tree. */
export function stop(server: ChildProcess): void {
  if (!server.pid) return
  if (win) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill('SIGTERM')
}
