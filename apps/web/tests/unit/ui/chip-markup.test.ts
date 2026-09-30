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
    expect(chipLinkHtml('x', 'X', '//evil')).not.toContain('href')
  })
})
