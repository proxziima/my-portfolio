import type { CollectionConfig } from 'payload'
import { disclosureRead } from '../access/disclosure-read'
import { publicContentAccess } from '../access/public-read'
import { brandFields } from '../fields/brand'
import { disciplinesField } from '../fields/disciplines-relation'
import { disclosureField } from '../fields/disclosure'
import { withFaviconHooks } from '../favicons/hooks'
import { orderField } from '../fields/order'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'

export const Projects: CollectionConfig = {
  slug: 'projects',
  labels: { singular: 'Project', plural: 'Portfolio' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'summary', 'order'] },
  defaultSort: 'order',
  access: { ...publicContentAccess, read: disclosureRead },
  hooks: withFaviconHooks(revalidateCollectionHooks),
  fields: [
    { name: 'name', type: 'text', required: true },
    ...brandFields(),
    { name: 'summary', type: 'text', required: true },
    { name: 'company', type: 'relationship', relationTo: 'companies', admin: { description: 'Where or for whom it was built (optional).' } },
    disciplinesField('Disciplines this project appears under. Empty = all.'),
    orderField(),
    disclosureField(),
  ],
}
