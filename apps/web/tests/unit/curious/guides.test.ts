import { describe, expect, it } from 'vitest'
import { computeGuides, leaderY, type Guide, type Measurements } from '@/features/curious/guides'

const r = (top: number, height: number, left = 400, width = 632) => ({ left, top, width, height, right: left + width, bottom: top + height })
const m: Measurements = {
  main: r(0, 1600), docHeight: 1700,
  sections: { bio: r(200, 400), figure: r(640, 250), work: r(1000, 200), projects: r(1264, 150) },
  gaps: [{ from: r(900, 36), to: r(1000, 200) }],
  anchors: { name: r(88, 34), switch: r(36, 60), role: r(124, 36) },
  figure: r(640, 216),
}
const byText = (gs: Guide[], label: string) => gs.find((g) => g.label === label)!
const notes = { headline: 'h', columnWidth: '{w}px wide', wallSwitch: 's', sectionGap: 'g', chips: 'c', role: 'r' }

describe('computeGuides', () => {
  const guides = computeGuides(m, notes, [{ side: 'left', text: 'L1' }, { side: 'right', text: 'R1', formula: 'x' }])
  it('draws two rails and a width bracket with the live width', () => {
    expect(guides.filter((g) => g.kind === 'rail')).toHaveLength(2)
    expect(guides.find((g) => g.kind === 'width')?.label).toBe('600px')
  })
  it('labels sections and measures gaps', () => {
    expect(guides.filter((g) => g.kind === 'section').map((g) => g.label)).toEqual(['bio', 'figure', 'work', 'projects'])
    expect(guides.find((g) => g.kind === 'gap')?.label).toBe('64px')
  })
  it('fills {w} in the column note and adds role formula notes', () => {
    expect(guides.some((g) => g.kind === 'note' && g.label === '600px wide')).toBe(true)
    expect(guides.filter((g) => g.kind === 'formula')).toHaveLength(2)
  })
  it('staggers delays 35ms apart', () => {
    expect(guides[1]!.delay - guides[0]!.delay).toBe(35)
  })

  it('places notes outside the column: right of it or left of it', () => {
    const right = guides.find((g) => g.kind === 'note' && g.side === 'right')!
    const left = guides.find((g) => g.kind === 'note' && g.side === 'left')!
    expect(right.left).toBe(1016 + 52)
    expect(left.left).toBe(416 - 52 - 200)
  })
  it('centres a side of formula notes on the figure, 82px apart', () => {
    const two = computeGuides(m, notes, [{ side: 'right', text: 'a' }, { side: 'right', text: 'b' }])
    const [a, b] = two.filter((g) => g.kind === 'formula')
    const cy = 640 + 216 / 2
    expect(a!.top).toBe(cy - 41 - 22)
    expect(b!.top).toBe(cy + 41 - 22)
    expect(a!.rotation).toBeCloseTo(-0.6)
    expect(b!.rotation).toBeCloseTo(0.9)
  })
  it('skips gaps of 20px or less and the anchors it cannot find', () => {
    const bare = computeGuides({ ...m, gaps: [{ from: r(0, 90), to: r(100, 10) }], anchors: {}, figure: undefined }, notes, [])
    expect(bare.some((g) => g.kind === 'gap')).toBe(false)
    expect(bare.filter((g) => g.kind === 'note').map((g) => g.label)).toEqual(['600px wide', 'g', 'c'])
    expect(bare.some((g) => g.kind === 'formula')).toBe(false)
  })
  describe('the two left notes', () => {
    const headline = byText(guides, 'h')
    const role = byText(guides, 'r')

    it('points the headline note at the name line, from its last line', () => {
      expect(headline.anchor).toBe('bottom')
      expect(leaderY(headline)).toBeCloseTo(88 + 34 / 2)
    })
    it('points the role note at the drum, from its first line', () => {
      expect(role.anchor).toBe('top')
      expect(leaderY(role)).toBeCloseTo(124 + 36 / 2)
    })
    it('keeps them apart: the headline note ends above where the role note starts', () => {
      // a bottom-anchored note's `top` is its bottom edge
      expect(headline.top).toBeLessThan(role.top)
    })
  })

  it('hangs the list notes off the first list section present', () => {
    const noWork = computeGuides({ ...m, sections: { projects: r(1264, 150), content: r(1500, 90) } }, notes, [])
    expect(byText(noWork, 'g').top).toBe(1264 - 42)
    expect(byText(noWork, 'c').top).toBe(1264 + 58)
    const onlyContent = computeGuides({ ...m, sections: { content: r(1500, 90) } }, notes, [])
    expect(byText(onlyContent, 'c').top).toBe(1500 + 58)
    const none = computeGuides({ ...m, sections: {} }, notes, [])
    expect(none.some((g) => g.label === 'g' || g.label === 'c')).toBe(false)
  })

  it('gives every guide a unique key', () => {
    expect(new Set(guides.map((g) => g.key)).size).toBe(guides.length)
  })
})
