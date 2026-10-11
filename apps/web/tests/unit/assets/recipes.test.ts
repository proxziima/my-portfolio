import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PUBLIC_DIR } from '@/scripts/assets/manifest'
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

  it('own every sound and video the site serves: none sits unhashed in public/ outside assets/', () => {
    const media = (readdirSync(PUBLIC_DIR, { recursive: true }) as string[])
      .map((f) => f.replaceAll('\\', '/'))
      .filter((f) => !f.startsWith('assets/') && /\.(?:mp3|ogg|wav|m4a|mp4|webm)$/i.test(f))
    expect(media).toEqual([])
  })
})
