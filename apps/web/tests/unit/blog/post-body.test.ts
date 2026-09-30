import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { linkHref, postConverters } from '@/features/blog/converters'

const text = (value: string) => ({ type: 'text', text: value, format: 0, version: 1, detail: 0, mode: 'normal', style: '' })
const paragraph = (...children: unknown[]) => ({ type: 'paragraph', children, version: 1, direction: null, format: '', indent: 0, textFormat: 0 })
const link = (fields: Record<string, unknown>) => ({ ...paragraph(text('go')), type: 'link', fields })
const state = (...children: unknown[]) => ({ root: { type: 'root', children, direction: null, format: '', indent: 0, version: 1 } })
const block = (fields: Record<string, unknown>) => ({ type: 'block', version: 2, format: '', fields })
const image = { id: 3, alt: 'A cat', url: '/api/media/file/cat.png', mimeType: 'image/png', width: 10, height: 5 }

const render = (...children: unknown[]) =>
  renderToStaticMarkup(createElement(RichText, { data: state(...children) as never, converters: postConverters('http://cms.test') }))

describe('linkHref', () => {
  it('sends internal links to the post path', () => {
    expect(linkHref({ linkType: 'internal', newTab: false, doc: { relationTo: 'posts', value: { id: 1, slug: 'next' } } })).toBe('/blog/next')
  })
  it('drops unsafe custom URLs and internal links without a populated slug', () => {
    expect(linkHref({ linkType: 'custom', newTab: false, url: 'javascript:alert(1)' })).toBeUndefined()
    expect(linkHref({ linkType: 'internal', newTab: false, doc: { relationTo: 'posts', value: 1 } })).toBeUndefined()
  })
})

describe('PostBody converters', () => {
  it('renders paragraphs and safe links, and unwraps unsafe ones', () => {
    const html = render(
      paragraph(link({ linkType: 'custom', url: 'https://x.dev', newTab: true })),
      paragraph(link({ linkType: 'custom', url: 'javascript:alert(1)', newTab: false })),
    )
    expect(html).toContain('<a href="https://x.dev" target="_blank" rel="noopener noreferrer">go</a>')
    expect(html).not.toContain('javascript:')
  })
  it('renders the code, banner and media blocks', () => {
    const html = render(
      block({ blockType: 'code', language: 'bash', code: 'echo <hi>' }),
      block({ blockType: 'banner', style: 'warning', content: state(paragraph(text('Heads up'))) }),
      block({ blockType: 'mediaBlock', media: image }),
    )
    expect(html).toMatch(/<pre class="[^"]*" data-language="bash"><code>echo &lt;hi&gt;<\/code><\/pre>/)
    expect(html).toMatch(/<aside class="[^"]*" data-style="warning"><p>Heads up<\/p><\/aside>/)
    expect(html).toContain('src="http://cms.test/api/media/file/cat.png" alt="A cat"')
  })
  it('renders uploads against the CMS origin and skips unpopulated ones', () => {
    const html = render(
      { type: 'upload', version: 3, format: '', relationTo: 'media', value: image, fields: {} },
      { type: 'upload', version: 3, format: '', relationTo: 'media', value: 7, fields: {} },
    )
    expect(html.match(/<img /g)).toHaveLength(1)
    expect(html).toContain('src="http://cms.test/api/media/file/cat.png"')
  })
})
