import type { TextField } from 'payload'

const DIACRITICS = /[̀-ͯ]/g
const NON_ALPHANUMERIC = /[^a-z0-9]+/g
const EDGE_DASHES = /^-+|-+$/g

/** "Olá, Mundo! 2026" → "ola-mundo-2026" */
export const formatSlug = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, '-')
    .replace(EDGE_DASHES, '')

/** A unique slug, formatted on save and generated from `source` when left empty. */
export const slugField = (source = 'title'): TextField => ({
  name: 'slug',
  type: 'text',
  unique: true,
  index: true,
  admin: { position: 'sidebar', description: `Leave empty to generate it from the ${source}.` },
  hooks: {
    beforeValidate: [
      ({ value, data }) => {
        const raw = typeof value === 'string' && value.trim() ? value : data?.[source]
        return typeof raw === 'string' ? formatSlug(raw) || null : value
      },
    ],
  },
})
