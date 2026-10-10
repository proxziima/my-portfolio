import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stripSourceMaps } from '@/scripts/sourcemaps'

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
