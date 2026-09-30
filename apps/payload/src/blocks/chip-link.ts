import type { Block } from 'payload'
import { chipField } from '../fields/chip'
import { urlField } from '../fields/link-url'

export const ChipLinkBlock: Block = {
  slug: 'chipLink',
  labels: { singular: 'Chip link', plural: 'Chip links' },
  fields: [{ name: 'label', type: 'text', required: true }, chipField(), urlField()],
}
