import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { toManifestSource } from '@/scripts/assets/manifest'

/** Evaluates generated manifest source the way the app would: as a TS module. */
async function evaluate(source: string): Promise<unknown> {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-'))
  // the generated file re-exports its types from './types'; give the temp module one
  writeFileSync(join(dir, 'types.ts'), 'export interface ImageAsset { width: number }\nexport interface ImageVariant { src: string }\nexport interface VideoAsset { width: number }\nexport interface VideoSource { src: string }\nexport interface TextureAsset { webp: string }\n')
  const file = join(dir, 'manifest.ts')
  writeFileSync(file, source)
  const mod = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as { ASSETS: unknown }
  return mod.ASSETS
}

describe('toManifestSource', () => {
  it('nests dotted ids into a typed ASSETS object', async () => {
    const source = toManifestSource({ 'desk.computer.model': '/assets/x.glb', 'desk.audio.key1': '/assets/k.mp3' })
    expect(source).toContain('GENERATED')
    expect(source).toContain('as const')
    expect(await evaluate(source)).toEqual({ desk: { computer: { model: '/assets/x.glb' }, audio: { key1: '/assets/k.mp3' } } })
  })

  it('keeps object values (image variants) intact', async () => {
    const value = { width: 2, height: 1, variants: [{ src: '/assets/a.avif', width: 2, height: 1, type: 'image/avif' }] }
    expect(await evaluate(toManifestSource({ 'theme.rockerOn': value }))).toEqual({ theme: { rockerOn: value } })
  })

  it('throws on duplicate ids', () => {
    expect(() => toManifestSource([['desk.a', '/x'], ['desk.a', '/y']])).toThrow(/duplicate/i)
  })

  it('throws when an id is both a leaf and a branch', () => {
    expect(() => toManifestSource({ 'desk.a': '/x', 'desk.a.b': '/y' })).toThrow(/leaf and a branch/i)
    expect(() => toManifestSource({ 'desk.a.b': '/y', 'desk.a': '/x' })).toThrow(/leaf and a branch/i)
  })
})
