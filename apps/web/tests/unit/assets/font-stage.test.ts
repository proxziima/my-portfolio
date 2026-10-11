import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WEB_ROOT } from '@/scripts/assets/manifest'
import { fontStage } from '@/scripts/assets/stages/font'

describe('fontStage', () => {
  it('passes a woff2 source through byte for byte, into its dir', async () => {
    const bytes = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3])
    const { outputs } = await fontStage('fonts/Inter-latin.woff2', 'app/fonts', bytes)
    expect(outputs.map((o) => o.path)).toEqual(['app/fonts/Inter-latin.woff2'])
    expect(outputs[0]!.bytes).toEqual(bytes)
  })

  it('refuses a source that is neither woff2 nor ttf', async () => {
    await expect(fontStage('fonts/Inter.otf', 'app/fonts', new Uint8Array())).rejects.toThrow(/neither/)
  })
})

describe('the app', () => {
  it('loads no font from Google: next/font/google fetches at build time, and a flaky network fails the build', () => {
    const sources = ['app', 'features', 'lib', 'shared', 'styles'].flatMap((dir) =>
      (readdirSync(join(WEB_ROOT, dir), { recursive: true }) as string[]).filter((f) => /\.(?:tsx?|css)$/.test(f)).map((f) => join(dir, f)),
    )
    const offenders = sources.filter((f) => /next\/font\/google|fonts\.(?:googleapis|gstatic)\.com/.test(readFileSync(join(WEB_ROOT, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
