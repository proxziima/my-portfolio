import { describe, expect, it } from 'vitest'
import { planMorph, renderParagraphs } from '@/features/bio/morph/render'

describe('render', () => {
  it('renders every word as a span with spaces outside the span', () => {
    expect(renderParagraphs(['a b'])).toBe('<p><span class="w">a</span> <span class="w">b</span></p>')
  })
  it('plans which old words leave and which new words enter', () => {
    const plan = planMorph(['I am <strong>plumber</strong>.'], ['I am <strong>janitor</strong>.'])
    expect([...plan.leaving[0]!]).toEqual([2])
    expect(plan.nextHtml).toBe('<p><span class="w">I</span> <span class="w">am</span> <span class="w in"><strong>janitor</strong></span><span class="w">.</span></p>')
  })
  it('treats a missing previous paragraph as all-new', () => {
    const plan = planMorph([], ['a'])
    expect(plan.nextHtml).toContain('w in')
  })
})
