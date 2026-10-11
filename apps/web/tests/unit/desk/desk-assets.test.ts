import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { deskAssetUrls } from '@/features/desk/desk-assets'

const ASSETS = [
  { model: '/m/computer.glb', texture: { avif: '/t/computer.avif', webp: '/t/computer.webp', width: 2048, height: 2048 } },
  { model: '/m/environment.glb', texture: { webp: '/t/environment.webp', width: 2048, height: 2048 }, drop: ['Background'] },
] as const

describe('deskAssetUrls', () => {
  it('takes the AVIF when the context decodes it, else the WebP', () => {
    // the environment has no AVIF (none passed parity at fewer bytes): its WebP either way
    expect(deskAssetUrls(ASSETS, 'avif').map((a) => a.texture)).toEqual(['/t/computer.avif', '/t/environment.webp'])
    expect(deskAssetUrls(ASSETS, 'webp').map((a) => a.texture)).toEqual(['/t/computer.webp', '/t/environment.webp'])
  })

  it('keeps the model and the drop list as they are', () => {
    expect(deskAssetUrls(ASSETS, 'webp')).toEqual([
      { model: '/m/computer.glb', texture: '/t/computer.webp' },
      { model: '/m/environment.glb', texture: '/t/environment.webp', drop: ['Background'] },
    ])
  })
})

/** The value imports of a module (type-only imports are erased and load nothing). */
const valueImports = (path: string) =>
  [...readFileSync(new URL(path, import.meta.url), 'utf8').matchAll(/^import (?!type )[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])

describe('what the main thread loads for the desk when a worker draws it', () => {
  it('the URL table imports no loader', () => {
    expect(valueImports('../../../features/desk/desk-assets.ts')).toEqual([])
  })

  it('the scene imports neither the loaders nor the GL scene: those load in the drawing thread', () => {
    const imports = valueImports('../../../features/desk/DeskScene.tsx')
    expect(imports).not.toContain('./assets')
    expect(imports).not.toContain('./gl/desk-gl')
    expect(imports).not.toContain('@/lib/assets/texture-format')
  })

  it('the main host reaches the GL scene only through a dynamic import', () => {
    const source = readFileSync(new URL('../../../features/desk/gl/main-host.ts', import.meta.url), 'utf8')
    expect(valueImports('../../../features/desk/gl/main-host.ts')).not.toContain('./desk-gl')
    expect(source).toContain("import('./desk-gl')")
  })
})
