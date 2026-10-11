import { describe, expect, it } from 'vitest'
import { contentHash, sha256 } from '@/scripts/assets/hash'
import { checkLock, checkTree, manifestSource, recipeHash, type CheckIo, type Lock } from '@/scripts/assets/manifest'
import type { Recipe } from '@/scripts/assets/recipes'

const recipes: Recipe[] = [
  { id: 'desk.audio.key1', kind: 'copy', source: 'desk/audio/key-1.mp3' },
  { id: 'desk.audio.office', kind: 'copy', source: 'desk/audio/office.mp3' },
]
const sources: Record<string, Buffer> = {
  'desk/audio/key-1.mp3': Buffer.from('key'),
  'desk/audio/office.mp3': Buffer.from('office'),
  'fonts/Millennium.ttf': Buffer.from('ttf'),
}
const readSource = (path: string) => sources[path]!
/** Each output named by its bytes' hash, as the stages write them. */
const outputOf = (r: Recipe) => `/assets/${r.source.replace(/\.mp3$/, `.${contentHash(sources[r.source]!)}.mp3`)}`
const outputBytes: Record<string, Buffer> = Object.fromEntries(recipes.map((r) => [outputOf(r), sources[r.source]!]))

const lockFor = (overrides: Partial<Record<string, Partial<Lock[string]>>> = {}): Lock =>
  Object.fromEntries(
    recipes.map((r) => [
      r.id,
      { source: sha256(sources[r.source]!), recipe: recipeHash(r), tools: {}, outputs: [outputOf(r)], value: outputOf(r), ...overrides[r.id] },
    ]),
  )

/** A disk where every output is present with its bytes, the manifest is current and nothing else is in public/assets. */
const io = (over: Partial<CheckIo> = {}): CheckIo => ({
  exists: (o) => o in outputBytes,
  readOutput: (o) => outputBytes[o]!,
  manifest: () => manifestSource(recipes, lockFor()),
  publicAssets: () => Object.keys(outputBytes),
  ...over,
})

describe('checkLock', () => {
  it('passes when sources, recipes and outputs match', () => {
    expect(checkLock(recipes, lockFor(), readSource, io())).toEqual([])
  })

  it('flags a changed source', () => {
    const lock = lockFor({ 'desk.audio.key1': { source: sha256('older bytes') } })
    expect(checkLock(recipes, lock, readSource, io())).toEqual([{ id: 'desk.audio.key1', problem: 'source changed' }])
  })

  it('flags a changed recipe', () => {
    const lock = lockFor({ 'desk.audio.office': { recipe: recipeHash({ id: 'desk.audio.office', kind: 'copy', source: 'other.mp3' }) } })
    expect(checkLock(recipes, lock, readSource, io())).toEqual([{ id: 'desk.audio.office', problem: 'recipe changed' }])
  })

  it('flags a recipe that was never built', () => {
    const lock = lockFor()
    delete lock['desk.audio.office']
    expect(checkLock(recipes, lock, readSource, io())).toEqual([{ id: 'desk.audio.office', problem: 'not built' }])
  })

  it('flags a missing output file', () => {
    const key = outputOf(recipes[0]!)
    expect(checkLock(recipes, lockFor(), readSource, io({ exists: (o) => o !== key }))).toEqual([{ id: 'desk.audio.key1', problem: 'output missing', detail: key }])
  })

  it('flags an output whose bytes no longer match the hash in its name', () => {
    const key = outputOf(recipes[0]!)
    const readOutput = (o: string) => (o === key ? Buffer.from('edited by hand') : outputBytes[o]!)
    expect(checkLock(recipes, lockFor(), readSource, io({ readOutput }))).toEqual([{ id: 'desk.audio.key1', problem: 'output changed', detail: key }])
  })

  it('does not hash-check an output whose name carries no hash (the OS fonts)', () => {
    const font: Recipe = { id: 'osFonts.millennium', kind: 'font', source: 'fonts/Millennium.ttf' }
    const lock: Lock = { [font.id]: { source: sha256('ttf'), recipe: recipeHash(font), tools: {}, outputs: ['app/(os)/fonts/Millennium.woff2'] } }
    expect(checkLock([font], lock, readSource, io({ exists: () => true, readOutput: () => Buffer.from('woff2') }))).toEqual([])
  })
})

describe('checkTree', () => {
  it('passes when the manifest is the lock and public/assets holds only locked outputs', () => {
    expect(checkTree(recipes, lockFor(), io())).toEqual([])
  })

  it('flags a generated manifest that differs from the lock (edited by hand, or not regenerated)', () => {
    const manifest = () => manifestSource(recipes, lockFor()).replace('/assets/', '/elsewhere/')
    expect(checkTree(recipes, lockFor(), io({ manifest }))).toEqual([{ id: 'lib/assets/manifest.ts', problem: 'manifest stale' }])
  })

  it('reads the manifest regardless of line endings (a Windows checkout)', () => {
    const manifest = () => manifestSource(recipes, lockFor()).replace(/\n/g, '\r\n')
    expect(checkTree(recipes, lockFor(), io({ manifest }))).toEqual([])
  })

  it('reports files in public/assets that no lock entry produced', () => {
    const publicAssets = () => [...Object.keys(outputBytes), '/assets/desk/audio/key-1.0000000000.mp3', '/assets/old/thing.png']
    expect(checkTree(recipes, lockFor(), io({ publicAssets }))).toEqual([
      { id: '/assets/desk/audio/key-1.0000000000.mp3', problem: 'orphan' },
      { id: '/assets/old/thing.png', problem: 'orphan' },
    ])
  })
})
