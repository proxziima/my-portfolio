import { describe, expect, it } from 'vitest'
import { sha256 } from '@/scripts/assets/hash'
import { checkLock, recipeHash, type Lock } from '@/scripts/assets/manifest'
import type { Recipe } from '@/scripts/assets/recipes'

const recipes: Recipe[] = [
  { id: 'desk.audio.key1', kind: 'copy', source: 'desk/audio/key-1.mp3' },
  { id: 'desk.audio.office', kind: 'copy', source: 'desk/audio/office.mp3' },
]
const sources: Record<string, Buffer> = {
  'desk/audio/key-1.mp3': Buffer.from('key'),
  'desk/audio/office.mp3': Buffer.from('office'),
}
const readSource = (path: string) => sources[path]!

const lockFor = (overrides: Partial<Record<string, Partial<Lock[string]>>> = {}): Lock =>
  Object.fromEntries(
    recipes.map((r) => [
      r.id,
      {
        source: sha256(sources[r.source]!),
        recipe: recipeHash(r),
        tools: {},
        outputs: [`/assets/${r.source}`],
        value: `/assets/${r.source}`,
        ...overrides[r.id],
      },
    ]),
  )

const exists = () => true

describe('checkLock', () => {
  it('passes when sources, recipes and outputs match', () => {
    expect(checkLock(recipes, lockFor(), readSource, exists)).toEqual([])
  })

  it('flags a changed source', () => {
    const lock = lockFor({ 'desk.audio.key1': { source: sha256('older bytes') } })
    expect(checkLock(recipes, lock, readSource, exists)).toEqual([{ id: 'desk.audio.key1', problem: 'source changed' }])
  })

  it('flags a changed recipe', () => {
    const lock = lockFor({ 'desk.audio.office': { recipe: recipeHash({ id: 'desk.audio.office', kind: 'copy', source: 'other.mp3' }) } })
    expect(checkLock(recipes, lock, readSource, exists)).toEqual([{ id: 'desk.audio.office', problem: 'recipe changed' }])
  })

  it('flags a recipe that was never built', () => {
    const lock = lockFor()
    delete lock['desk.audio.office']
    expect(checkLock(recipes, lock, readSource, exists)).toEqual([{ id: 'desk.audio.office', problem: 'not built' }])
  })

  it('flags a missing output file', () => {
    const missing = (path: string) => path !== '/assets/desk/audio/key-1.mp3'
    expect(checkLock(recipes, lockFor(), readSource, missing)).toEqual([{ id: 'desk.audio.key1', problem: 'output missing' }])
  })
})
