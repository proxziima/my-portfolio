import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { loadCorpus, loadIdentity } from '@/mcp/twin-tools'

const companies = [
  { id: 1, name: 'Autodoc', url: 'https://autodoc.com.br', disclosure: 'public' },
  { id: 2, name: 'Stealth Co', url: null, disclosure: 'restricted' },
]
const docs: Record<string, unknown[]> = {
  companies,
  experiences: [
    { id: 10, title: 'AI Engineer', company: 1, startYear: 2024, endYear: null, disclosure: 'public' },
    { id: 11, title: 'Advisor', company: 2, startYear: 2025, endYear: null, disclosure: 'public' },
  ],
  projects: [{ id: 20, name: 'Sonda', summary: 'Sampler', url: null, company: 1, disclosure: 'public' }],
  content: [],
  disciplines: [{ id: 30, title: 'SE', disclosure: 'public', bio: { root: { children: [{ type: 'paragraph', children: [
    { type: 'inlineBlock', fields: { blockType: 'recordLink', record: { relationTo: 'companies', value: 1 } } },
    { type: 'inlineBlock', fields: { blockType: 'recordLink', record: { relationTo: 'projects', value: 20 } } },
  ] }] } } }],
  knowledge: [],
}

/** Answers `find` from the table above, honouring a `disclosure: { equals: 'public' }` filter anywhere in `where`. */
const fakePayload = () => ({
  find: vi.fn(async ({ collection, where }: { collection: string; where?: unknown }) => {
    const publicOnly = JSON.stringify(where ?? {}).includes('"equals":"public"')
    const all = (docs[collection] ?? []) as { disclosure?: string }[]
    return { docs: publicOnly ? all.filter((d) => d.disclosure === 'public') : all }
  }),
  findGlobal: vi.fn(async ({ slug }: { slug: string }) => (slug === 'profile' ? { name: 'V', headlineTail: 'x', location: null } : { links: [] })),
}) as unknown as Payload

describe('twin tools', () => {
  it('names the company in experiences and caps their tier by the company', async () => {
    const corpus = await loadCorpus(fakePayload())
    const byId = new Map(corpus.map((e) => [e.item.sourceId, e]))
    expect(byId.get('experiences:10')).toMatchObject({ disclosure: 'public', item: { title: 'AI Engineer at Autodoc', url: 'https://autodoc.com.br' } })
    expect(byId.get('experiences:11')).toMatchObject({ disclosure: 'restricted', item: { title: 'Advisor at Stealth Co' } })
    expect(byId.get('projects:20')?.item.text).toBe('Sampler (at Autodoc)')
    expect(byId.get('disciplines:30')?.item.text).toBe('AutodocSonda')
  })
  it('lists only current roles at public companies in the identity', async () => {
    const identity = await loadIdentity(fakePayload())
    expect(identity.currentRoles).toEqual([{ title: 'AI Engineer', company: 'Autodoc' }])
  })
})
