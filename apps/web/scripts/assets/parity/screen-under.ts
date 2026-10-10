/**
 * Captures `screen-under.png`: what the CRT layers are drawn over, for the image gate's composites.
 * The monitor's screen exactly as monitor-screen.ts builds it (the 1280×1024 slab and the OS iframe
 * inset by 32 px) without its CRT layers, once the OS shows its desktop, saved at 640×512. Run once
 * with node (Playwright launches hang under bun on Windows) against a running site:
 *
 *   node scripts/assets/parity/screen-under.ts [--url http://localhost:3100]
 */
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { SCREEN } from '../../../features/desk/config.ts'

const { values } = parseArgs({ options: { url: { type: 'string', default: 'http://localhost:3100' } } })
const OUT = fileURLToPath(new URL('./screen-under.png', import.meta.url))
const SLAB = 'radial-gradient(ellipse at center, #243436 0%, #121a1b 70%, #0b0f10 100%)'

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: SCREEN.width, height: SCREEN.height }, colorScheme: 'light' })
  await page.setContent(
    `<body style="margin:0"><div id="screen" style="width:${SCREEN.width}px;height:${SCREEN.height}px;background:${SLAB}">` +
      `<iframe src="${values.url}/os" style="display:block;width:100%;height:100%;border:0;padding:${SCREEN.padding}px;box-sizing:border-box"></iframe></div></body>`,
  )
  const frame = await (await page.waitForSelector('iframe')).contentFrame()
  if (!frame) throw new Error('no OS frame')
  await frame.waitForSelector('[data-anchor="desktop"]', { timeout: 60_000 })
  // a dev server's indicator is not part of the screen
  await frame.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  await page.waitForTimeout(1500)
  const png = await page.locator('#screen').screenshot()
  await sharp(png).resize(SCREEN.width / 2, SCREEN.height / 2, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(OUT)
  console.log(`wrote ${OUT}`)
} finally {
  await browser.close()
}
