import { describe, expect, it } from 'vitest'
import { chipLinkHtml, escapeHtml, safeHref } from '@/shared/ui/chip-markup'

describe('safeHref', () => {
  it.each(['//evil', '/\\evil', '/\t/evil', 'javascript:alert(1)', 'data:text/html,x', 'https://a b'])('rejects %j', (url) => {
    expect(safeHref(url)).toBeUndefined()
  })
  it('accepts and trims safe urls', () => {
    expect(safeHref('  https://ok.dev ')).toBe('https://ok.dev')
    expect(safeHref('/x')).toBe('/x')
    expect(safeHref('#w')).toBe('#w')
    expect(safeHref('mailto:a@b')).toBe('mailto:a@b')
  })
  it('handles empty values', () => {
    expect(safeHref(null)).toBeUndefined()
    expect(safeHref(undefined)).toBeUndefined()
    expect(safeHref('')).toBeUndefined()
  })
})

describe('escapeHtml', () => {
  it('escapes all five characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})

describe('chipLinkHtml', () => {
  it('drops unsafe hrefs', () => {
    expect(chipLinkHtml({ label: 'x', chip: 'X', href: '//evil' })).not.toContain('href')
  })
  it('renders the icon image in the chip slot when one is given', () => {
    const html = chipLinkHtml({ label: 'Autodoc', chip: 'A', href: 'https://autodoc.com.br', icon: 'http://cms.test/api/favicons/file/autodoc-favicon.ico' })
    expect(html).toBe(
      '<a class="fav" href="https://autodoc.com.br" target="_blank" rel="noopener noreferrer">' +
        '<img class="chip chip-img" src="http://cms.test/api/favicons/file/autodoc-favicon.ico" alt="" aria-hidden="true" loading="lazy" decoding="async"><span>Autodoc</span></a>',
    )
  })
  it('ignores non-http icons and falls back to the chip', () => {
    expect(chipLinkHtml({ label: 'x', chip: 'X', icon: 'javascript:alert(1)' })).toContain('<i class="chip" aria-hidden="true">X</i>')
  })
})
