import type { CollectionConfig } from 'payload'
import { publicContentAccess } from '../access/public-read'
import { slugField } from '../fields/slug'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'

// `parent` and `breadcrumbs` are added by the nested-docs plugin (see plugins/blog-plugins.ts).
export const Categories: CollectionConfig = {
  slug: 'categories',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'slug', 'parent'], group: 'Blog' },
  access: publicContentAccess,
  hooks: revalidateCollectionHooks,
  fields: [{ name: 'title', type: 'text', required: true }, slugField()],
}
