import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOCK_FILE, MANIFEST_FILE, manifestSource, toManifestSource, WEB_ROOT, type Lock, type LockEntry, type ManifestValue } from '@/scripts/assets/manifest'
import { RECIPES, type Recipe } from '@/scripts/assets/recipes'

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

describe('manifestSource', () => {
  const entry = (value?: ManifestValue): LockEntry => ({ source: 's', recipe: 'r', tools: {}, outputs: [], ...(value === undefined ? {} : { value }) })
  const recipes: Recipe[] = [
    { id: 'desk.audio.office', kind: 'copy', source: 'desk/audio/office.mp3' },
    { id: 'blowout.bulb', kind: 'copy', source: 'blowout/bulb-explode.mp3' },
    { id: 'osFonts.millennium', kind: 'font', source: 'fonts/Millennium.ttf' },
    { id: 'desk.audio.key1', kind: 'copy', source: 'desk/audio/key-1.mp3' },
  ]

  it('is the lock in recipe order, leaving out recipes never built', () => {
    const lock: Lock = { 'blowout.bulb': entry('/assets/b.mp3'), 'desk.audio.office': entry('/assets/o.mp3') }
    expect(manifestSource(recipes, lock)).toBe(toManifestSource([['desk.audio.office', '/assets/o.mp3'], ['blowout.bulb', '/assets/b.mp3']]))
  })

  it('leaves out outputs that have no value for code (the OS fonts, which next/font loads from a literal path)', async () => {
    const lock: Lock = { 'osFonts.millennium': entry(), 'desk.audio.key1': entry('/assets/k.mp3') }
    expect(await evaluate(manifestSource(recipes, lock))).toEqual({ desk: { audio: { key1: '/assets/k.mp3' } } })
  })
})

describe('the committed manifest', () => {
  const lock = () => JSON.parse(readFileSync(LOCK_FILE, 'utf8')) as Lock

  it('has no entry for the OS fonts: nothing imports them, the layout names the stage output itself', () => {
    expect(readFileSync(MANIFEST_FILE, 'utf8')).not.toContain('osFonts')
    for (const r of RECIPES.filter((r) => r.kind === 'font')) expect(lock()[r.id]).not.toHaveProperty('value')
  })

  it('names, in the OS layout, exactly the files the font stage writes', () => {
    const layout = readFileSync(join(WEB_ROOT, 'app/(os)/os/layout.tsx'), 'utf8')
    const paths = [...layout.matchAll(/path: '\.\.\/fonts\/([^']+)'/g)].map((m) => `app/(os)/fonts/${m[1]}`)
    const outputs = RECIPES.filter((r) => r.kind === 'font').flatMap((r) => lock()[r.id]!.outputs)
    expect(paths.sort()).toEqual(outputs.sort())
  })
})
