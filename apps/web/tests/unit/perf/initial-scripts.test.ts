// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { initialScripts } from '@/scripts/perf/initial-scripts'

describe('initialScripts', () => {
  it('collects script sources and script preloads under /_next/static', () => {
    const html = `<!doctype html><html><head>
      <link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/a.js"/>
      <link rel="stylesheet" href="/_next/static/css/app.css"/>
      <link rel="preload" as="style" href="/_next/static/css/other.css"/>
      <script src="/_next/static/chunks/b.js" async=""></script>
    </head><body></body></html>`
    expect(initialScripts(html)).toEqual(['chunks/a.js', 'chunks/b.js'])
  })

  it('matches tags and attributes in any case, and closing tags with trailing space', () => {
    const html = `<HTML><HEAD>
      <SCRIPT SRC="/_next/static/chunks/upper.js"></SCRIPT >
      <ScRiPt Src='/_next/static/chunks/mixed.js'></sCrIpT\t>
      <LINK REL=PRELOAD AS=SCRIPT HREF=/_next/static/chunks/unquoted.js>
      <link rel="preload" As="Script" href="/_next/static/chunks/as-mixed.js">
    </HEAD><BODY></BODY></HTML>`
    expect(initialScripts(html).sort()).toEqual(['chunks/as-mixed.js', 'chunks/mixed.js', 'chunks/unquoted.js', 'chunks/upper.js'])
  })

  it('ignores markup inside an inline script, and inline scripts themselves', () => {
    const html = `<head><script>self.__next_f.push([1, "<script src=\\"/_next/static/chunks/fake.js\\"></script>"])</script>
      <script src="/_next/static/chunks/real.js"></script></head>`
    expect(initialScripts(html)).toEqual(['chunks/real.js'])
  })

  it('strips the query and hash, decodes the path, skips other origins and paths, and dedupes', () => {
    const html = `<head>
      <script src="/_next/static/chunks/app/%5Bslug%5D/page.js?dpl=abc"></script>
      <link rel="preload" as="script" href="/_next/static/chunks/app/%5Bslug%5D/page.js#x">
      <script src="https://cdn.example.com/lib.js"></script>
      <script src="/scripts/local.js"></script>
    </head>`
    expect(initialScripts(html)).toEqual(['chunks/app/[slug]/page.js'])
  })
})
