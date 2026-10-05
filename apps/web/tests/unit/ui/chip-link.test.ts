import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { chipLinkHtml, type ChipLinkProps } from '@/shared/ui/chip-markup'
import { ChipLink } from '@/shared/ui/ChipLink'

// React serialises a void element as `<img …/>`; the string twin writes `<img …>`. Both parse to the same DOM,
// so that self-closing slash is the only difference normalised here.
const react = (props: ChipLinkProps) => renderToStaticMarkup(createElement(ChipLink, props)).replace(/<img ([^>]*?)\/>/g, '<img $1>')

describe('ChipLink and chipLinkHtml render the same markup', () => {
  const cases: [string, ChipLinkProps][] = [
    ['chip only, no link', { label: 'Autodoc', chip: 'A' }],
    ['chip with an external link', { label: 'Autodoc', chip: 'A', href: 'https://autodoc.com.br' }],
    ['icon with an external link', { label: 'Autodoc', chip: 'A', href: 'https://autodoc.com.br', icon: 'http://cms.test/f.ico' }],
    ['icon with an internal link', { label: 'Blog', chip: 'B', href: '/blog', icon: 'https://cdn.test/b.png' }],
    ['a non-web icon falls back to the chip', { label: 'x', chip: 'X', icon: 'javascript:alert(1)' }],
  ]
  it.each(cases)('%s', (_name, props) => {
    expect(react(props)).toBe(chipLinkHtml(props))
  })
})
