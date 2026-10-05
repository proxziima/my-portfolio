import type { CollectionConfig } from 'payload'
import { disclosureRead } from '../access/disclosure-read'
import { publicContentAccess } from '../access/public-read'
import { disciplinesField } from '../fields/disciplines-relation'
import { disclosureField } from '../fields/disclosure'
import { orderField } from '../fields/order'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'

export const Experiences: CollectionConfig = {
  slug: 'experiences',
  labels: { singular: 'Experience', plural: 'Professional background' },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'company', 'startYear', 'endYear'] },
  defaultSort: 'order',
  access: { ...publicContentAccess, read: disclosureRead },
  hooks: revalidateCollectionHooks,
  fields: [
    { name: 'company', type: 'relationship', relationTo: 'companies', required: true },
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
    disclosureField(),
  ],
}
