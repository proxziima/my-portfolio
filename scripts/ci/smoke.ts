/** One check of a production endpoint. */
export interface Probe {
  ok: boolean
  detail: string
}
type Fetch = (url: string, init?: RequestInit) => Promise<Response>

/** Web is live on the expected commit: `/api/health` reports it as `version`. */
export async function webServes(fetchFn: Fetch, webUrl: string, version: string): Promise<Probe> {
  try {
    const res = await fetchFn(`${webUrl}/api/health`, { cache: 'no-store' })
    if (!res.ok) return { ok: false, detail: `web /api/health answered ${res.status}` }
    const body = (await res.json()) as { version?: string }
    return body.version === version
      ? { ok: true, detail: `web serves ${version}` }
      : { ok: false, detail: `web serves ${body.version ?? 'no version'}, waiting for ${version}` }
  } catch (error) {
    return { ok: false, detail: `web unreachable: ${(error as Error).message}` }
  }
}

/** The CMS has started and applied its migrations: its public profile global answers 200. */
export async function cmsServes(fetchFn: Fetch, cmsUrl: string): Promise<Probe> {
  try {
    const res = await fetchFn(`${cmsUrl}/api/globals/profile`, { cache: 'no-store' })
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

function required(name: string): string {
  const value = process.env[name]?.replace(/\/+$/, '')
  if (!value) throw new Error(`${name} is not set`)
  return value
}

/** CI entry (the `deploy` job): exits 1 unless production serves this commit within the time limit. */
if (import.meta.main) {
  const web = required('PROD_WEB_URL')
  const cms = required('PROD_CMS_URL')
  const version = required('EXPECTED_VERSION')
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
