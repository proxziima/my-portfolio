/**
 * Reproducible Lighthouse measurement of a running site (`bun run perf:lighthouse`, i.e. node).
 *
 * Procedure (the baseline and every phase checkpoint use exactly this):
 *   1. CMS on 3201, from apps/payload (never payload.db):
 *        $env:DATABASE_URL='file:./payload.e2e.db'; bunx cross-env NODE_OPTIONS=--no-deprecation next dev --port 3201
 *   2. Production build of web, from apps/web (apps/web/.env.local points CMS_URL at 3201):
 *        bunx next build
 *   3. This script, from apps/web. `--serve` starts `next start` on --port (default 3100) from that build,
 *      waits for it, measures, and stops it; without `--serve` it measures whatever answers on --url.
 *        node scripts/perf/lighthouse.ts --serve --runs 3 --out <dir> [--compare <dir>/summary.json]
 *
 * Each form factor (mobile = Lighthouse's default Moto G Power emulation with simulated slow 4G;
 * desktop = `--preset=desktop`) runs `--runs` times against Playwright's Chromium, headless. The run
 * with the median performance score is kept as the representative report. Writes, per form factor,
 * every raw report (`<form>-<n>.json`) and one `summary.json` with the medians, the main-thread
 * breakdown, the top scripts by evaluation time, layout-shift culprits and the heaviest requests.
 * `--compare` prints the deltas against an earlier summary. Never use ports 3000/3001 (main checkout).
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'

/** Pinned so numbers stay comparable across checkpoints; bump deliberately and re-baseline. */
const LIGHTHOUSE = 'lighthouse@13.5.0'
const FORMS = ['mobile', 'desktop'] as const
type Form = (typeof FORMS)[number]

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    port: { type: 'string', default: '3100' },
    runs: { type: 'string', default: '3' },
    out: { type: 'string', default: '.perf/latest' },
    form: { type: 'string', default: 'both' },
    serve: { type: 'boolean', default: false },
    compare: { type: 'string' },
    // PSI-like CPU: scales Lighthouse's preset multiplier (mobile 4, desktop 1) by this machine's
    // benchmark index over PSI_BENCHMARK, so a fast workstation is slowed to PageSpeed's hardware class
    calibrate: { type: 'boolean', default: false },
    // `devtools` applies real network throttling, so late web fonts shift layout the way they do on a
    // slow connection (simulated throttling measures CLS from an unthrottled load and never sees it)
    throttling: { type: 'string', default: 'simulate' },
  },
})

/**
 * The benchmark index PageSpeed Insights' Lighthouse hosts report (`environment.benchmarkIndex`,
 * typically 1000 to 1500); used by `--calibrate`. Approximate: production PSI stays the ground truth.
 */
const PSI_BENCHMARK = 1250
const PRESET_CPU: Record<Form, number> = { mobile: 4, desktop: 1 }

const port = Number(values.port)
if (port === 3000 || port === 3001) throw new Error('ports 3000/3001 belong to the main checkout')
const url = values.url ?? `http://localhost:${port}/`
const runs = Math.max(1, Number(values.runs))
const out = resolve(values.out!)
const forms: readonly Form[] = values.form === 'both' ? FORMS : [values.form as Form]
mkdirSync(out, { recursive: true })

interface Audit {
  numericValue?: number
  score?: number | null
  displayValue?: string
  details?: { items?: Array<Record<string, unknown>> }
}
interface Report {
  categories: Record<string, { score: number | null }>
  audits: Record<string, Audit>
  environment: { benchmarkIndex: number }
}

const METRICS = {
  fcp: 'first-contentful-paint',
  lcp: 'largest-contentful-paint',
  tbt: 'total-blocking-time',
  cls: 'cumulative-layout-shift',
  si: 'speed-index',
  tti: 'interactive',
  bytes: 'total-byte-weight',
  mainThread: 'mainthread-work-breakdown',
  bootup: 'bootup-time',
} as const

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)] ?? Number.NaN
}

function lighthouse(form: Form, path: string, cpu: number | null): Report {
  const args = [
    LIGHTHOUSE,
    url,
    '--output=json',
    `--output-path=${path}`,
    '--only-categories=performance,accessibility,best-practices,seo',
    `--chrome-path=${chromium.executablePath()}`,
    '--chrome-flags=--headless=new --no-sandbox --disable-gpu-sandbox',
    '--quiet',
    `--throttling-method=${values.throttling}`,
    ...(cpu === null ? [] : [`--throttling.cpuSlowdownMultiplier=${cpu}`]),
    ...(form === 'desktop' ? ['--preset=desktop'] : []),
  ]
  // under a Windows shell an argument with a space (this repo's path, the chrome flags) must be quoted
  const argv = process.platform === 'win32' ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args
  const r = spawnSync('bunx', argv, { stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) throw new Error(`lighthouse (${form}) exited ${r.status}`)
  return JSON.parse(readFileSync(path, 'utf8')) as Report
}

const items = (report: Report, audit: string) => report.audits[audit]?.details?.items ?? []

function summarise(report: Report) {
  const n = (audit: string) => report.audits[audit]?.numericValue ?? Number.NaN
  return {
    scores: Object.fromEntries(Object.entries(report.categories).map(([k, v]) => [k, Math.round((v.score ?? 0) * 100)])),
    metrics: Object.fromEntries(Object.entries(METRICS).map(([k, a]) => [k, n(a)])),
    mainThread: items(report, 'mainthread-work-breakdown').map((i) => ({ group: i.groupLabel ?? i.group, ms: Math.round(Number(i.duration)) })),
    bootup: items(report, 'bootup-time')
      .slice(0, 8)
      .map((i) => ({ url: String(i.url), total: Math.round(Number(i.total)), scripting: Math.round(Number(i.scripting)), parse: Math.round(Number(i.scriptParseCompile)) })),
    layoutShifts: items(report, 'layout-shifts').map((i) => ({ score: i.score, node: (i.node as { selector?: string; snippet?: string } | undefined)?.selector ?? null })),
    unusedJs: items(report, 'unused-javascript').map((i) => ({ url: String(i.url), total: Number(i.totalBytes), wasted: Number(i.wastedBytes) })),
    heaviest: items(report, 'total-byte-weight')
      .slice(0, 10)
      .map((i) => ({ url: String(i.url), bytes: Number(i.totalBytes) })),
    renderBlocking: items(report, 'render-blocking-insight').map((i) => String(i.url)),
  }
}
type Summary = ReturnType<typeof summarise>

function waitFor(target: string, timeoutMs: number): Promise<void> {
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

function stop(server: ChildProcess) {
  if (!server.pid) return
  // `next start` runs under a shell on Windows: kill the whole tree
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill('SIGTERM')
}

let server: ChildProcess | null = null
try {
  if (values.serve) {
    server = spawn('bunx', ['next', 'start', '-p', String(port)], { stdio: 'ignore', shell: process.platform === 'win32' })
    await waitFor(url, 60_000)
  }
  // one warm-up request so the first measured run does not pay for the server's cold caches
  await fetch(url).then((r) => r.text())

  const summary: Record<string, { median: Summary['metrics'] & { performance: number }; representative: Summary; runs: number[]; cpu: number; benchmarkIndex: number }> = {}
  for (const form of forms) {
    const reports: Report[] = []
    let cpu: number | null = null
    if (values.calibrate) {
      // one throwaway run reads this machine's benchmark index under the same conditions
      const probe = lighthouse(form, join(out, `${form}-calibration.json`), null)
      cpu = Math.round(PRESET_CPU[form] * (probe.environment.benchmarkIndex / PSI_BENCHMARK) * 10) / 10
    }
    for (let i = 1; i <= runs; i++) reports.push(lighthouse(form, join(out, `${form}-${i}.json`), cpu))
    const perf = reports.map((r) => Math.round((r.categories.performance?.score ?? 0) * 100))
    const target = median(perf)
    const representative = summarise(reports[perf.indexOf(target)]!)
    const all = reports.map(summarise)
    const med = Object.fromEntries(Object.keys(METRICS).map((k) => [k, median(all.map((s) => s.metrics[k] as number))])) as Summary['metrics']
    const benchmarkIndex = median(reports.map((r) => r.environment.benchmarkIndex))
    summary[form] = { median: { ...med, performance: target }, representative, runs: perf, cpu: cpu ?? PRESET_CPU[form], benchmarkIndex }
    console.log(
      `${form} (cpu ×${cpu ?? PRESET_CPU[form]}, benchmark ${Math.round(benchmarkIndex)}, ${values.throttling}): perf ${target} (runs ${perf.join('/')}) FCP ${Math.round(med.fcp!)}ms LCP ${Math.round(med.lcp!)}ms TBT ${Math.round(med.tbt!)}ms CLS ${med.cls!.toFixed(3)} SI ${Math.round(med.si!)}ms bytes ${Math.round(med.bytes! / 1024)}KiB`,
    )
  }
  writeFileSync(
    join(out, 'summary.json'),
    JSON.stringify({ url, lighthouse: LIGHTHOUSE, throttling: values.throttling, calibrated: values.calibrate, at: new Date().toISOString(), ...summary }, null, 2),
  )
  console.log(`wrote ${join(out, 'summary.json')}`)

  if (values.compare) {
    const before = JSON.parse(readFileSync(resolve(values.compare), 'utf8')) as typeof summary
    for (const form of forms) {
      const a = before[form]?.median
      const b = summary[form]?.median
      if (!a || !b) continue
      const delta = (k: keyof typeof b) => `${k} ${Number(a[k]).toFixed(k === 'cls' ? 3 : 0)} → ${Number(b[k]).toFixed(k === 'cls' ? 3 : 0)}`
      console.log(`${form}: ${(['performance', 'fcp', 'lcp', 'tbt', 'cls', 'si', 'bytes'] as const).map(delta).join(' | ')}`)
    }
  }
} finally {
  if (server) stop(server)
}
