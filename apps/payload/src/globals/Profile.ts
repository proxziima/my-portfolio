import type { GlobalConfig } from 'payload'
import { publicGlobalAccess } from '../access/public-read'
import { revalidateGlobalHooks } from '../hooks/revalidate-web'

export const Profile: GlobalConfig = {
  slug: 'profile',
  access: publicGlobalAccess,
  hooks: revalidateGlobalHooks,
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'headlineTail', type: 'text', required: true, defaultValue: 'and builder.', admin: { description: 'Text after the role drum in the headline.' } },
    { name: 'email', type: 'email', required: true },
    { name: 'location', type: 'text' },
    { name: 'avatar', type: 'upload', relationTo: 'media', admin: { description: 'Also your picture in Messenger.' } },
    {
      name: 'statusMessage',
      type: 'text',
      defaultValue: 'building things on the web, one pixel at a time',
      admin: { description: 'Shown under your name in Messenger, like an MSN personal message.' },
    },
  ],
}
