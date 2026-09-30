import type { Block } from 'payload'

export const CuriousToggleBlock: Block = {
  slug: 'curiousToggle',
  labels: { singular: 'Curious toggle', plural: 'Curious toggles' },
  fields: [{ name: 'word', type: 'text', required: true, defaultValue: 'curious' }],
}
