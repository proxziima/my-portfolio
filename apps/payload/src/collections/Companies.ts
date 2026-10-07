import type { CollectionConfig } from 'payload'
import { disclosureRead } from '../access/disclosure-read'
import { publicContentAccess } from '../access/public-read'
import { brandFields } from '../fields/brand'
import { disclosureField } from '../fields/disclosure'
import { withFaviconHooks } from '../favicons/hooks'
import { guardCompanyDelete } from '../hooks/guard-company-delete'
import { guardDeletingLinkedRecord, guardHidingLinkedRecord } from '../hooks/guard-linked-record'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'

/**
 * A company written once and referenced by experiences, projects and bio links. Its tier also caps
 * every row that references it: a hidden company hides its experiences and bio links everywhere.
 */
export const Companies: CollectionConfig = {
  slug: 'companies',
  labels: { singular: 'Company', plural: 'Companies' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'url', 'disclosure'] },
  defaultSort: 'name',
  access: { ...publicContentAccess, read: disclosureRead },
  hooks: {
    ...withFaviconHooks(revalidateCollectionHooks),
    beforeChange: [guardHidingLinkedRecord],
    beforeDelete: [guardCompanyDelete, guardDeletingLinkedRecord],
  },
  fields: [{ name: 'name', type: 'text', required: true, unique: true }, ...brandFields(), disclosureField()],
}
