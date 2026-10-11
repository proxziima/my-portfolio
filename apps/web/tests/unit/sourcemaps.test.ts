import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { removeSourceCopies, stripInlinedCssMaps, stripSourceMaps } from '@/scripts/sourcemaps'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/turbopack')

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

  // verbatim tails of `next build` CSS (Turbopack 16.3): no space before `*/`, and one or two newlines before the comment
  it.each(['os-layout.css', 'site-globals.css'])('strips the comment Turbopack writes into CSS (%s)', (fixture) => {
    const source = readFileSync(join(FIXTURES, fixture), 'utf8')
    expect(source).toMatch(/\/\*# sourceMappingURL=\S+\.css\.map\*\/$/)
    const dir = mkdtempSync(join(tmpdir(), 'maps-'))
    writeFileSync(join(dir, fixture), source)
    stripSourceMaps(dir)
    const stripped = readFileSync(join(dir, fixture), 'utf8')
    expect(stripped).not.toContain('sourceMappingURL')
    expect(stripped).toBe(`${source.slice(0, source.indexOf('/*#')).trimEnd()}\n`)
  })

  it('strips the map comments from the CSS the server inlines into HTML (inlineCss: client reference manifests)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'server-'))
    const nested = join(dir, 'app/(os)/os')
    mkdirSync(nested, { recursive: true })
    const source = readFileSync(join(FIXTURES, 'page_client-reference-manifest.js'), 'utf8')
    writeFileSync(join(nested, 'page_client-reference-manifest.js'), source)
    writeFileSync(join(nested, 'page.js'), 'const s = "/*# sourceMappingURL=x.css.map*/"\n') // not a manifest: untouched
    expect(stripInlinedCssMaps(dir)).toBe(1)
    const stripped = readFileSync(join(nested, 'page_client-reference-manifest.js'), 'utf8')
    expect(stripped).not.toContain('sourceMappingURL')
    // the manifest is still the same script: only the comment (and the escaped newlines before it) left the CSS
    const manifest = (code: string) => {
      const scope = { __RSC_MANIFEST: undefined as unknown }
      new Function('globalThis', code)(scope)
      return scope.__RSC_MANIFEST as Record<string, { entryCSSFiles: Record<string, Array<{ content: string }>> }>
    }
    const before = manifest(source)['/(os)/os/page']!.entryCSSFiles['[project]/apps/web/app/global-not-found']![0]!.content
    const after = manifest(stripped)['/(os)/os/page']!.entryCSSFiles['[project]/apps/web/app/global-not-found']![0]!.content
    expect(after).toBe(before.slice(0, before.indexOf('/*#')).trimEnd())
    expect(readFileSync(join(nested, 'page.js'), 'utf8')).toContain('sourceMappingURL')
  })

  it('leaves a sourceMappingURL that is not the trailing comment alone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'maps-'))
    const text = 'const s = "//# sourceMappingURL=x.js.map"\nconsole.log(s)\n'
    writeFileSync(join(dir, 'c.js'), text)
    stripSourceMaps(dir)
    expect(readFileSync(join(dir, 'c.js'), 'utf8')).toBe(text)
  })
})
