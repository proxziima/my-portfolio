import { describe, expect, it } from 'vitest'
import { groundingBlock } from '../agent/lib/conversation'

describe('groundingBlock', () => {
  it('renders identity and voice samples as untrusted data', () => {
    const out = groundingBlock({ name: 'Vinicius Queiroz', headline: 'and builder.', location: 'Brazil', currentRoles: [{ title: 'Engineer', company: 'Autodoc' }], voiceSamples: ['Short and sharp.'] }, 'k'.repeat(20))
    expect(out).toContain('<grounding>')
    expect(out).toContain('Vinicius Queiroz')
    expect(out).toMatch(/<voice_samples>[\s\S]*<untrusted source="voice"/)
  })

  it('omits the voice block when there are no samples', () => {
    const out = groundingBlock({ name: 'V', headline: null, location: null, currentRoles: [], voiceSamples: [] }, 'k'.repeat(20))
    expect(out).not.toContain('<voice_samples>')
  })
})
