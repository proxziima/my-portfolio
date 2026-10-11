/** One check of a production endpoint. */
export interface Probe {
  ok: boolean
  detail: string
}
type Fetch = (url: string, init?: RequestInit) => Promise<Response>

/** Per-request limit, so one hung connection cannot eat the whole retry budget. */
const REQUEST_TIMEOUT_MS = 15_000
const requestInit = (): RequestInit => ({
  cache: 'no-store',
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
})

/** Web is live on the expected release version: `/api/health` reports it as `version`. */
export async function webServes(fetchFn: Fetch, webUrl: string, version: string): Promise<Probe> {
  let res: Response
  try {
    res = await fetchFn(`${webUrl}/api/health`, requestInit())
  } catch (error) {
    return { ok: false, detail: `web unreachable: ${(error as Error).message}` }
  }
  if (!res.ok) return { ok: false, detail: `web /api/health answered ${res.status}` }
  let body: { version?: string }
  try {
    body = (await res.json()) as { version?: string }
  } catch {
    return { ok: false, detail: 'web /api/health is not JSON' }
  }
  return body.version === version
    ? { ok: true, detail: `web serves ${version}` }
    : { ok: false, detail: `web serves ${body.version ?? 'no version'}, waiting for ${version}` }
}

/**
 * The CMS answers: its public profile global returns 200, so it is not stuck or crashed after the
 * deploy. It does not prove the new container is the one serving.
 */
export async function cmsServes(fetchFn: Fetch, cmsUrl: string): Promise<Probe> {
  try {
    const res = await fetchFn(`${cmsUrl}/api/globals/profile`, requestInit())
    return res.ok
      ? { ok: true, detail: 'cms answers' }
      : { ok: false, detail: `cms answered ${res.status}` }
  } catch (error) {
    return { ok: false, detail: `cms unreachable: ${(error as Error).message}` }
  }
}

/** Re-runs `probe` every `intervalMs` until it passes or `timeoutMs` has elapsed; returns the last result. */
export async function waitFor(
  probe: () => Promise<Probe>,
  opts: {
    timeoutMs: number
    intervalMs: number
    sleep?: (ms: number) => Promise<void>
    now?: () => number
  },
): Promise<Probe> {
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const now = opts.now ?? Date.now
  const deadline = now() + opts.timeoutMs
  let last = await probe()
  while (!last.ok && now() < deadline) {
    await sleep(opts.intervalMs)
    last = await probe()
  }
  return last
}

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

/** A base URL without trailing slashes, so endpoint paths can be appended. */
export function normalizeOrigin(url: string): string {
  return url.replace(/\/+$/, '')
}

/** CI entry (the `deploy` job): exits 1 unless production serves this release version within the time limit. */
if (import.meta.main) {
  const web = normalizeOrigin(env('PROD_WEB_URL'))
  const cms = normalizeOrigin(env('PROD_CMS_URL'))
  const version = env('EXPECTED_VERSION')
  const log = (probe: Probe) => (console.log(probe.detail), probe)
  const webResult = await waitFor(async () => log(await webServes(fetch, web, version)), {
    timeoutMs: 10 * 60_000,
    intervalMs: 10_000,
  })
  const cmsResult = webResult.ok
    ? await waitFor(async () => log(await cmsServes(fetch, cms)), {
        timeoutMs: 2 * 60_000,
        intervalMs: 10_000,
      })
    : webResult
  if (!webResult.ok || !cmsResult.ok) {
    console.error(`smoke test failed: ${(webResult.ok ? cmsResult : webResult).detail}`)
    process.exit(1)
  }
  console.log(`production serves ${version}`)
}
