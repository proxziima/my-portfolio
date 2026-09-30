import { slugField, type RowField } from 'payload'
import type { Slugify } from 'payload/shared'

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

/** Adapts `formatSlug` to core `slugField`; `undefined` (nothing to slugify) leaves the slug empty. */
export const slugify: Slugify = ({ valueToSlugify }) =>
  typeof valueToSlugify === 'string' ? formatSlug(valueToSlugify) || undefined : undefined

/**
 * Payload's core slug field (unique, indexed, in the sidebar): a hidden `generateSlug` checkbox keeps the
 * slug synced to the title until the editor unlocks and edits it. Not required, so the column stays nullable.
 */
export const titleSlugField = (): RowField =>
  slugField({ useAsSlug: 'title', slugify, position: 'sidebar', required: false })
