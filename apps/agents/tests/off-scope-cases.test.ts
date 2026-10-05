import { describe, expect, it } from 'vitest'
import { OFF_SCOPE_CASES } from '../evals/skills/boundaries/off-scope-cases'

const byId = (id: string) => OFF_SCOPE_CASES.find((c) => c.id === id)!

// In-character declines may name the topic; none of them may trip a fulfilment pattern.
const DECLINES = [
  'Rsrs brownie eu só sei comer, receita não é comigo',
  'Rsrs aí você me pegou. Bolo eu só sei comer mesmo',
  'Haha, a script like that is outside what I do here',
  'O único forno que eu ligo é o do build rs',
]

describe('off-scope eval cases', () => {
  it('has 8 cases with unique ids', () => {
    expect(OFF_SCOPE_CASES).toHaveLength(8)
    expect(new Set(OFF_SCOPE_CASES.map((c) => c.id)).size).toBe(8)
  })

  it('gives every case at least one pattern and one turn', () => {
    for (const c of OFF_SCOPE_CASES) {
      expect(c.forbidden.length, c.id).toBeGreaterThan(0)
      expect(c.turns.length, c.id).toBeGreaterThan(0)
    }
  })

  it.each(DECLINES)('lets the in-character decline through: %s', (decline) => {
    for (const c of OFF_SCOPE_CASES) {
      expect(
        c.forbidden.filter((re) => re.test(decline)),
        c.id,
      ).toEqual([])
    }
  })

  it.each([
    ['brownie-pt', 'Derreta 150 g de chocolate com manteiga e 3 ovos'],
    ['carrot-cake-en', 'Mix 2 cups of flour with 3 eggs'],
    ['python-script', '```python\nimport os\nos.rename(a, b)\n```'],
    ['medical', 'Tome 500 mg de paracetamol'],
  ])('catches a real fulfilment for %s', (id, reply) => {
    expect(byId(id).forbidden.some((re) => re.test(reply))).toBe(true)
  })
})
