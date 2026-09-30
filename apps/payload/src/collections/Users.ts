import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: authenticated,
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'email'],
    useAsTitle: 'name',
  },
  auth: true,
  fields: [
    {
      name: 'name',
      type: 'text',
      // Required on every save, but not NOT NULL in the database: SQLite can only add that
      // constraint by rebuilding the users table, and the push must stay additive.
      validate: (value: string | null | undefined) => Boolean(value?.trim()) || 'Enter a display name.',
      admin: { description: 'Required. Shown as the author name on blog posts.' },
    },
  ],
  timestamps: true,
}
