import type { CollectionConfig } from 'payload'
import { publicContentAccess } from '../access/public-read'
import { chipField } from '../fields/chip'
import { disciplinesField } from '../fields/disciplines-relation'
import { urlField } from '../fields/link-url'
import { orderField } from '../fields/order'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'

export const Experiences: CollectionConfig = {
  slug: 'experiences',
  labels: { singular: 'Experience', plural: 'Professional background' },
  admin: { useAsTitle: 'company', defaultColumns: ['company', 'title', 'startYear', 'endYear'] },
  defaultSort: 'order',
  access: publicContentAccess,
  hooks: revalidateCollectionHooks,
  fields: [
    { name: 'company', type: 'text', required: true },
    chipField(),
    urlField(),
    { name: 'title', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        { name: 'startYear', type: 'number', required: true, min: 1990, max: 2100 },
        { name: 'endYear', type: 'number', min: 1990, max: 2100, admin: { description: 'Leave empty for current.' } },
      ],
    },
    disciplinesField('Disciplines this entry appears under. Empty = all.'),
    orderField(),
  ],
}
