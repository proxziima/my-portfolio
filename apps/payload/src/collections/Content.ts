import type { CollectionConfig } from 'payload'
import { disclosureRead } from '../access/disclosure-read'
import { publicContentAccess } from '../access/public-read'
import { chipField } from '../fields/chip'
import { disciplinesField } from '../fields/disciplines-relation'
import { urlField } from '../fields/link-url'
import { disclosureField } from '../fields/disclosure'
import { orderField } from '../fields/order'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'

export const CONTENT_KINDS = ['article', 'talk', 'podcast', 'open-source', 'community'] as const

export const Content: CollectionConfig = {
  slug: 'content',
  labels: { singular: 'Content item', plural: 'Content & community' },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'kind', 'date'] },
  defaultSort: 'order',
  access: { ...publicContentAccess, read: disclosureRead },
  hooks: revalidateCollectionHooks,
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'kind', type: 'select', required: true, options: [...CONTENT_KINDS] },
    chipField(),
    { name: 'venue', type: 'text' },
    urlField('url', true),
    { name: 'date', type: 'date', required: true },
    disciplinesField('Disciplines this item appears under. Empty = all.'),
    orderField(),
    disclosureField(),
  ],
}
