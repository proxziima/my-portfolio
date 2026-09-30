import type { CollectionConfig } from 'payload'
import { publicContentAccess } from '../access/public-read'
import { chipField } from '../fields/chip'
import { disciplinesField } from '../fields/disciplines-relation'
import { urlField } from '../fields/link-url'
import { orderField } from '../fields/order'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'

export const Projects: CollectionConfig = {
  slug: 'projects',
  labels: { singular: 'Project', plural: 'Portfolio' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'summary', 'order'] },
  defaultSort: 'order',
  access: publicContentAccess,
  hooks: revalidateCollectionHooks,
  fields: [
    { name: 'name', type: 'text', required: true },
    chipField(),
    urlField(),
    { name: 'summary', type: 'text', required: true },
    disciplinesField('Disciplines this project appears under. Empty = all.'),
    orderField(),
  ],
}
