import type { CollectionConfig } from 'payload'
import { disclosureRead } from '../access/disclosure-read'
import { publicContentAccess } from '../access/public-read'
import { disclosureField } from '../fields/disclosure'
import { orderField } from '../fields/order'

/** Must match `KnowledgeCategory` in `@repo/twin/contract` (the agent scores restricted requests by it). */
export const KNOWLEDGE_CATEGORIES = ['availability', 'compensation', 'logistics', 'background', 'voice', 'other'] as const

/**
 * Facts for the twin that are not portfolio entries: notice period, rates policy, relocation,
 * work authorisation, preferences, and `voice` writing samples. Not rendered on the website.
 */
export const Knowledge: CollectionConfig = {
  slug: 'knowledge',
  labels: { singular: 'Knowledge entry', plural: 'Twin knowledge' },
  admin: { useAsTitle: 'topic', defaultColumns: ['topic', 'category', 'disclosure'], group: 'Twin' },
  defaultSort: 'order',
  access: { ...publicContentAccess, read: disclosureRead },
  fields: [
    { name: 'topic', type: 'text', required: true, admin: { description: 'What this answers, e.g. "Notice period".' } },
    { name: 'category', type: 'select', required: true, defaultValue: 'other', options: [...KNOWLEDGE_CATEGORIES] },
    {
      name: 'answer',
      type: 'textarea',
      required: true,
      admin: { description: 'Written in first person. For "voice", paste a real sample of your writing.' },
    },
    {
      name: 'redactTerms',
      type: 'array',
      admin: {
        description: 'Exact strings that must never appear in a twin reply (salary figures, client names, address).',
        condition: (data) => data?.disclosure === 'never',
      },
      fields: [{ name: 'term', type: 'text', required: true }],
    },
    orderField(),
    disclosureField(),
  ],
}
