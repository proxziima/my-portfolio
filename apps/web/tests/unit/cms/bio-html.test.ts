import { describe, expect, it } from 'vitest'
import { bioParagraphs, type RichTextValue } from '@/lib/cms/bio-html'

const t = (text: string, format = 0) => ({ type: 'text', text, format })
const p = (...children: unknown[]) => ({ type: 'paragraph', children })
const doc = (...paragraphs: unknown[]) => ({ root: { children: paragraphs } }) as unknown as RichTextValue
const inline = (fields: Record<string, unknown>) => ({ type: 'inlineBlock', fields })

describe('bioParagraphs', () => {
  it('renders text and bold', () => {
    expect(bioParagraphs(doc(p(t('Hi, '), t('backend plumber', 1), t('.'))))).toEqual(['Hi, <strong>backend plumber</strong>.'])
  })
  it('escapes text', () => {
    expect(bioParagraphs(doc(p(t('<script>'))))).toEqual(['&lt;script&gt;'])
  })
  it('renders chip links with safe urls only', () => {
    const [html] = bioParagraphs(doc(p(inline({ blockType: 'chipLink', label: 'Autodoc', chip: 'A', url: 'https://autodoc.com.br' }))))
    expect(html).toBe('<a class="fav" href="https://autodoc.com.br" target="_blank" rel="noopener noreferrer"><i class="chip" aria-hidden="true">A</i><span>Autodoc</span></a>')
    const [unsafe] = bioParagraphs(doc(p(inline({ blockType: 'chipLink', label: 'x', chip: 'X', url: 'javascript:alert(1)' }))))
    expect(unsafe).not.toContain('href')
  })
  it('renders the curious toggle', () => {
    const [html] = bioParagraphs(doc(p(inline({ blockType: 'curiousToggle', word: 'curious' }))))
    expect(html).toContain('role="switch"')
    expect(html).toContain('>curious<')
  })
  it('turns line breaks into spaces and skips empty paragraphs', () => {
    expect(bioParagraphs(doc(p(t('a'), { type: 'linebreak' }, t('b')), p()))).toEqual(['a b'])
  })
  it('returns [] for missing content', () => {
    expect(bioParagraphs(null)).toEqual([])
  })
})
