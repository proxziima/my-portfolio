import { describe, expect, it } from 'vitest'
import { splitStrong, tokenize } from '@/features/bio/morph/tokenize'

describe('tokenize', () => {
  it('splits multi-word strong into single-word strongs', () => {
    expect(splitStrong('<strong>a b</strong>')).toBe('<strong>a</strong> <strong>b</strong>')
  })
  it('keeps chip links and the curious toggle atomic', () => {
    const html = 'at <a class="fav" href="#"><i class="chip">A</i><span>Auto doc</span></a>, <button class="curiosity-trigger" type="button">x y</button>.'
    expect(tokenize(html).map((t) => t.text)).toEqual(['at', '<a class="fav" href="#"><i class="chip">A</i><span>Auto doc</span></a>', ',', '<button class="curiosity-trigger" type="button">x y</button>', '.'])
  })
  it('keeps a chip link with an icon image atomic', () => {
    const link = '<a class="fav" href="https://a.dev" target="_blank" rel="noopener noreferrer"><img class="chip chip-img" src="http://cms.test/f.ico" alt="" aria-hidden="true" loading="lazy" decoding="async"><span>Auto doc</span></a>'
    expect(tokenize(`at ${link}.`).map((t) => t.text)).toEqual(['at', link, '.'])
  })
  it('records the exact whitespace after each token (no space before punctuation)', () => {
    expect(tokenize('<strong>x</strong>. y')).toEqual([
      { text: '<strong>x</strong>', sep: '' },
      { text: '.', sep: ' ' },
      { text: 'y', sep: '' },
    ])
  })
})
