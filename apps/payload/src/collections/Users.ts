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
  auth: {
    // Unset in development, so the defaults hold (host-only cookie, SameSite=Lax, not Secure). In
    // production `COOKIE_DOMAIN=.example.com` shares the admin session with the web app on the parent
    // domain, which draft preview and live preview need; Secure means the admin must be served over HTTPS.
    cookies: {
      domain: process.env.COOKIE_DOMAIN || undefined,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
    },
  },
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
