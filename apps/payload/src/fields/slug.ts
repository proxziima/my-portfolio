import type { TextField } from 'payload'

// Letters NFKD does not decompose into a base letter plus a combining mark.
const TRANSLITERATIONS: Record<string, string> = { ß: 'ss', ø: 'o', ł: 'l', đ: 'd', æ: 'ae', œ: 'oe', þ: 'th', ð: 'd' }
const SPECIAL_LETTERS = new RegExp(`[${Object.keys(TRANSLITERATIONS).join('')}]`, 'g')
const COMBINING_MARKS = /\p{M}/gu
const NON_ALPHANUMERIC = /[^a-z0-9]+/g
const EDGE_DASHES = /^-+|-+$/g

/** "Olá, Mundo! 2026" → "ola-mundo-2026", "Straße" → "strasse" */
export const formatSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(SPECIAL_LETTERS, (letter) => TRANSLITERATIONS[letter] ?? letter)
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
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
