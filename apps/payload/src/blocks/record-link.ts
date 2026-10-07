import type { Block } from 'payload'

/** A bio link to a company or project: name, icon and URL come from the record. Bios are public prose, so only public records qualify. */
export const RecordLinkBlock: Block = {
  slug: 'recordLink',
  labels: { singular: 'Company or project link', plural: 'Company or project links' },
  fields: [
    {
      name: 'record',
      type: 'relationship',
      relationTo: ['companies', 'projects'],
      required: true,
      filterOptions: { disclosure: { equals: 'public' } },
      admin: { description: 'Only public companies and projects can be linked.' },
    },
  ],
}
