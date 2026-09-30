import type { CollectionConfig } from 'payload'
import { publicContentAccess } from '../access/public-read'
import { bioEditor } from '../editor/bio-editor'
import { orderField } from '../fields/order'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'

export const Disciplines: CollectionConfig = {
  slug: 'disciplines',
  labels: { singular: 'Discipline', plural: 'Disciplines (roles)' },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'slug', 'order'] },
  defaultSort: 'order',
  access: publicContentAccess,
  hooks: revalidateCollectionHooks,
  fields: [
    { name: 'title', type: 'text', required: true, admin: { description: 'Shown on the headline drum, e.g. "Software engineer".' } },
    { name: 'slug', type: 'text', required: true, unique: true, index: true, admin: { position: 'sidebar', description: 'URL hash, e.g. "se" → /#se.' } },
    orderField(),
    { name: 'level', type: 'text', required: true, admin: { description: 'Picker meta, e.g. "LV 9 · backend".' } },
    {
      name: 'bio',
      type: 'richText',
      required: true,
      editor: bioEditor,
      admin: {
        description:
          'One paragraph per block. Keep the SAME sentence skeleton in every discipline and change only the vocabulary — the page animates just the words that differ.',
      },
    },
    { name: 'figureCaption', type: 'text', required: true },
    {
      name: 'curiousNotes',
      type: 'array',
      admin: { description: 'Handwritten notes beside the figure in curious mode.' },
      fields: [
        { name: 'side', type: 'select', required: true, defaultValue: 'right', options: ['left', 'right'] },
        { name: 'text', type: 'text', required: true },
        { name: 'formula', type: 'text' },
      ],
    },
  ],
}
