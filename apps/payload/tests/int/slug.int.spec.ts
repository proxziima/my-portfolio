import type { CheckboxField, CollectionConfig, Field, FieldHookArgs, PayloadRequest, TextField } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { Posts } from '@/collections/Posts'
import { formatSlug, slugify, titleSlugField } from '@/fields/slug'

const req = {} as PayloadRequest

describe('formatSlug', () => {
  it('lowercases, strips diacritics and joins words with dashes', () => {
    expect(formatSlug('Olá, Mundo! Ação 2026')).toBe('ola-mundo-acao-2026')
  })
  it('trims leading, trailing and repeated separators', () => {
    expect(formatSlug('  --Hello   World__  ')).toBe('hello-world')
  })
  it('transliterates letters NFKD cannot decompose', () => {
    expect(formatSlug('Straße Ørsted Łódź Đakovo Æsir Œuvre')).toBe('strasse-orsted-lodz-dakovo-aesir-oeuvre')
  })
  it('returns an empty string when nothing is left', () => {
    expect(formatSlug('!!!')).toBe('')
  })
})

describe('slugify (core slugField adapter)', () => {
  it('formats the value with formatSlug', async () => {
    expect(await slugify({ data: {}, req, valueToSlugify: 'Olá, Straße!' })).toBe('ola-strasse')
  })
  it.each([['!!!'], [''], [undefined], [42]])('leaves the slug empty for %s', async (valueToSlugify) => {
    expect(await slugify({ data: {}, req, valueToSlugify })).toBeUndefined()
  })
})

const isCheckbox = (field: Field): field is CheckboxField => field.type === 'checkbox'
const isText = (field: Field): field is TextField => field.type === 'text'

describe('titleSlugField', () => {
  const row = titleSlugField()
  const checkbox = row.fields.find(isCheckbox)
  const slug = row.fields.find(isText)

  it('is a unique, indexed, optional slug in the sidebar, formatted by our slugify', () => {
    expect(row.admin?.position).toBe('sidebar')
    expect(slug).toMatchObject({ name: 'slug', unique: true, index: true, required: false })
    expect(slug?.custom?.slugify).toBe(slugify)
    expect(checkbox).toMatchObject({ name: 'generateSlug', defaultValue: true })
  })

  // The bug this replaces: the first autosave stored "t" and every later save kept it.
  it('keeps following the title on autosave until the editor overrides the slug', async () => {
    const hook = checkbox?.hooks?.beforeChange?.[0]
    if (!hook) throw new Error('generateSlug has no beforeChange hook')
    const countVersions = vi.fn(async () => ({ totalDocs: 2 }))
    const autosave = (data: Record<string, unknown>) =>
      hook({
        collection: Posts as CollectionConfig,
        data,
        operation: 'update',
        originalDoc: { id: 1, slug: 't' },
        req: { payload: { countVersions } } as unknown as PayloadRequest,
        value: true,
      } as unknown as FieldHookArgs)

    const synced = { title: 'This is a sample template', slug: 't' }
    expect(await autosave(synced)).toBe(true)
    expect(synced.slug).toBe('this-is-a-sample-template')

    const overridden = { title: 'This is a sample template', slug: 'custom' }
    expect(await autosave(overridden)).toBe(false)
    expect(overridden.slug).toBe('custom')
  })
})
