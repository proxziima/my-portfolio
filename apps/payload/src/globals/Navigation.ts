import type { GlobalConfig } from 'payload'
import { publicGlobalAccess } from '../access/public-read'
import { urlField } from '../fields/link-url'
import { revalidateGlobalHooks } from '../hooks/revalidate-web'

export const Navigation: GlobalConfig = {
  slug: 'navigation',
  access: publicGlobalAccess,
  hooks: revalidateGlobalHooks,
  fields: [
    {
      name: 'items',
      type: 'array',
      admin: { description: 'Footer navigation. Section anchors: #work, #projects, #content.' },
      fields: [
        { name: 'label', type: 'text', required: true },
        urlField('href', true),
        { name: 'newTab', type: 'checkbox', defaultValue: false },
      ],
    },
  ],
}
