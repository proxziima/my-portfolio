import type { Field } from 'payload'
import { chipField } from './chip'
import { urlField } from './link-url'

/**
 * What a company or project shows beside its name: the uploaded logo, else the favicon fetched from
 * `url`, else the text chip.
 */
export const brandFields = (): Field[] => [
  chipField(),
  urlField(),
  { name: 'logo', type: 'upload', relationTo: 'media', admin: { description: 'Shown instead of the favicon and the chip.' } },
  {
    name: 'favicon',
    type: 'upload',
    relationTo: 'favicons',
    // Written only by the favicon hooks (Local API, which skips field access); API clients cannot set it.
    access: { create: () => false, update: () => false },
    admin: {
      readOnly: true,
      position: 'sidebar',
      description: 'Fetched from the URL on save. Used when there is no logo; the chip is the last fallback.',
    },
  },
]
