import { describe, expect, it } from 'vitest'
import { osBioHtml } from '@/features/os/bio-markup'
import { chipLinkHtml, curiousToggleHtml } from '@/shared/ui/chip-markup'

describe('osBioHtml', () => {
  it('wraps paragraphs and keeps chip links', () => {
    const chip = chipLinkHtml('Autodoc', 'A', 'https://autodoc.example')
    expect(osBioHtml([`I work at ${chip}.`])).toBe(`<p>I work at ${chip}.</p>`)
  })
  it('turns the curious toggle into plain inline text', () => {
    const html = osBioHtml([`Be ${curiousToggleHtml('curious')}, not judgmental.`])
    expect(html).not.toContain('<button')
    expect(html).not.toContain('role="switch"')
    expect(html).toContain('<span class="curiosity-trigger"><span class="curiosity-word">curious</span>')
  })
})
