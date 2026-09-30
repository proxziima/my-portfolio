import type { GlobalConfig } from 'payload'
import { publicGlobalAccess } from '../access/public-read'
import { chipField } from '../fields/chip'
import { urlField } from '../fields/link-url'
import { revalidateGlobalHooks } from '../hooks/revalidate-web'

export const Contact: GlobalConfig = {
  slug: 'contact',
  access: publicGlobalAccess,
  hooks: revalidateGlobalHooks,
  fields: [
    {
      name: 'links',
      type: 'array',
      admin: { description: 'The row of links under the figure.' },
      fields: [{ name: 'label', type: 'text', required: true }, chipField(), urlField('url', true)],
    },
  ],
}
