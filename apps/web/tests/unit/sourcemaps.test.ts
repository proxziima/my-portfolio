import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { removeSourceCopies, stripSourceMaps } from '@/scripts/sourcemaps'

describe('removeSourceCopies', () => {
  it('deletes the TypeScript copies Turbopack emits next to a worker, and nothing else', () => {
    const dir = mkdtempSync(join(tmpdir(), 'media-'))
    mkdirSync(join(dir, 'media'))
    mkdirSync(join(dir, 'chunks'))
    for (const name of ['desk.worker.32q_drqo7r4vk.ts', 'x.0abc.tsx', 'y.0abc.mts', 'z.0abc.cts']) writeFileSync(join(dir, 'media', name), 'export {}')
    writeFileSync(join(dir, 'media/font.0abc.woff2'), '')
    writeFileSync(join(dir, 'media/clip.0abc.mp4'), '')
    writeFileSync(join(dir, 'chunks/turbopack-worker-1r2nq6.js'), '')
    expect(removeSourceCopies(dir).sort()).toEqual(['desk.worker.32q_drqo7r4vk.ts', 'x.0abc.tsx', 'y.0abc.mts', 'z.0abc.cts'])
    expect(existsSync(join(dir, 'media/font.0abc.woff2'))).toBe(true)
    expect(existsSync(join(dir, 'media/clip.0abc.mp4'))).toBe(true)
    expect(existsSync(join(dir, 'chunks/turbopack-worker-1r2nq6.js'))).toBe(true)
  })

  it('is a no-op when the build emitted no media directory', () => {
    expect(removeSourceCopies(mkdtempSync(join(tmpdir(), 'media-')))).toEqual([])
  })
})

describe('stripSourceMaps', () => {
  it('deletes every .map and the sourceMappingURL comments that point at them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'maps-'))
    mkdirSync(join(dir, 'chunks'))
    writeFileSync(join(dir, 'chunks/a.js'), 'console.log(1)\n//# sourceMappingURL=a.js.map')
    writeFileSync(join(dir, 'chunks/a.js.map'), '{}')
    writeFileSync(join(dir, 'chunks/b.css'), 'a{}\n/*# sourceMappingURL=b.css.map */')
    writeFileSync(join(dir, 'chunks/b.css.map'), '{}')
    const removed = stripSourceMaps(dir)
    expect(removed).toBe(2)
    expect(existsSync(join(dir, 'chunks/a.js.map'))).toBe(false)
    expect(readFileSync(join(dir, 'chunks/a.js'), 'utf8')).toBe('console.log(1)\n')
    expect(readFileSync(join(dir, 'chunks/b.css'), 'utf8')).toBe('a{}\n')
  })
})
