/**
 * Records every layout shift during a page load, with the elements that moved and their before/after
 * rects (`bun run perf:shifts`, i.e. node: Playwright launches hang under bun on Windows). Lighthouse reports the CLS total and the biggest culprit; this
 * shows *why* a box moved (which ancestor grew, and when relative to fonts and hydration).
 *
 *   node scripts/perf/layout-shifts.ts --url https://felipevinicius.me/ --cpu 6 --latency 150 --kbps 1600 --width 1350 --height 940
 *
 * CPU, latency and bandwidth are applied through CDP (real throttling, like Lighthouse's devtools
 * mode), so web fonts and hydration land late the way they do on PageSpeed's hosts. Prints one line
 * per shift: time, score, and each source's selector with its rect change; then the CLS total and
 * when `document.fonts.ready` resolved and React hydrated (the drum gets React props).
 */
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3100/' },
    cpu: { type: 'string', default: '4' },
    latency: { type: 'string', default: '150' },
    kbps: { type: 'string', default: '1600' },
    width: { type: 'string', default: '1350' },
    height: { type: 'string', default: '940' },
    runs: { type: 'string', default: '3' },
  },
})

interface Shift {
  t: number
  value: number
  hadRecentInput: boolean
  sources: Array<{ node: string; before: string; after: string }>
}

const browser = await chromium.launch({ headless: true })
try {
  for (let run = 1; run <= Number(values.runs); run++) {
    const context = await browser.newContext({ viewport: { width: Number(values.width), height: Number(values.height) } })
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(values.cpu) })
    await cdp.send('Network.enable')
    const bytesPerSecond = (Number(values.kbps) * 1024) / 8
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: Number(values.latency),
      downloadThroughput: bytesPerSecond,
      uploadThroughput: bytesPerSecond,
    })
    await page.addInitScript(() => {
      const w = window as unknown as { __shifts: unknown[]; __marks: Record<string, number> }
      w.__shifts = []
      w.__marks = {}
      const describe = (n: Node | null) => {
        if (!(n instanceof Element)) return String(n?.nodeName ?? 'null')
        const anchor = n.closest('[data-anchor]')?.getAttribute('data-anchor')
        return `${n.tagName.toLowerCase()}${n.className && typeof n.className === 'string' ? '.' + n.className.split(' ')[0] : ''}${anchor ? ` [${anchor}]` : ''}`
      }
      const rect = (r: DOMRectReadOnly) => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as Array<PerformanceEntry & { value: number; hadRecentInput: boolean; sources: Array<{ node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }> }>) {
          w.__shifts.push({
            t: Math.round(e.startTime),
            value: e.value,
            hadRecentInput: e.hadRecentInput,
            sources: e.sources.map((s) => ({ node: describe(s.node), before: rect(s.previousRect), after: rect(s.currentRect) })),
          })
        }
      }).observe({ type: 'layout-shift', buffered: true })
      document.fonts?.ready.then(() => (w.__marks.fontsReady = Math.round(performance.now())))
      const hydrated = () => {
        const drum = document.querySelector('button[aria-haspopup="listbox"]')
        if (drum && Object.keys(drum).some((k) => k.startsWith('__reactProps$'))) w.__marks.hydrated = Math.round(performance.now())
        else requestAnimationFrame(hydrated)
      }
      requestAnimationFrame(hydrated)
    })
    await page.goto(values.url!, { waitUntil: 'load' })
    await page.waitForTimeout(4000)
    const { shifts, marks } = await page.evaluate(() => {
      const w = window as unknown as { __shifts: Shift[]; __marks: Record<string, number> }
      return { shifts: w.__shifts, marks: w.__marks }
    })
    const cls = shifts.filter((s) => !s.hadRecentInput).reduce((sum, s) => sum + s.value, 0)
    console.log(`run ${run}: CLS ${cls.toFixed(4)}  fonts.ready ${marks.fontsReady ?? '-'}ms  hydrated ${marks.hydrated ?? '-'}ms`)
    for (const s of shifts) {
      if (s.value < 0.0005) continue
      console.log(`  @${s.t}ms  ${s.value.toFixed(4)}`)
      for (const src of s.sources) console.log(`      ${src.node}: ${src.before} → ${src.after}`)
    }
    await context.close()
  }
} finally {
  await browser.close()
}
