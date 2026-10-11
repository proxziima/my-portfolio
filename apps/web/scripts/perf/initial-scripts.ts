/**
 * The script URLs a document loads at load, relative to `.next/static`: `<script src>` and
 * `<link as="script">` (preload, modulepreload). Parsed by a real HTML parser (`DOMParser`), not
 * matched with a pattern: tag and attribute names are case-insensitive, attribute values may be
 * quoted either way or not at all, and the text of an inline script is not markup.
 *
 * Self-contained (no imports, no outer references) so that `chunks.ts` can run it in Chromium with
 * `page.evaluate`, the parser the documents are written for; the unit test runs it under jsdom.
 */
export function initialScripts(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const urls = new Set<string>()
  for (const el of doc.querySelectorAll('script[src], link[as="script" i][href]')) {
    const src = el.getAttribute(el.localName === 'script' ? 'src' : 'href')!
    const at = src.indexOf('/_next/static/')
    if (at === -1) continue
    urls.add(decodeURIComponent(src.slice(at + '/_next/static/'.length).split(/[?#]/)[0]!))
  }
  return [...urls]
}
