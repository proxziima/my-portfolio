import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RECIPES, SOURCE_DIR } from '@/scripts/assets/recipes'

describe('recipes', () => {
  it('point at sources that exist under assets-src/', () => {
    const missing = RECIPES.filter((r) => !existsSync(join(SOURCE_DIR, r.source))).map((r) => r.source)
    expect(missing).toEqual([])
  })

  it('have unique ids', () => {
    const ids = RECIPES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('list video codecs av1, then vp9, then h264 (source order is selection order)', () => {
    const order = ['av1', 'vp9', 'h264']
    for (const r of RECIPES) {
      if (r.kind !== 'video') continue
      const ranks = r.codecs.map((c) => order.indexOf(c))
      expect(ranks, r.id).toEqual([...ranks].sort((a, b) => a - b))
    }
  })
})
